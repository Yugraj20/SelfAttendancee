// Cloud sync layer. IndexedDB (db.ts) is always the source of truth for the UI — every read and
// write happens there first, instantly, whether or not the user is signed in. This module mirrors
// that data to Firestore at `users/{uid}` so a signed-in user can pick up the same data on another
// device. All of it is best-effort: if Firestore is unreachable, local reads/writes are unaffected.
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { firestore } from './firebase';
import { restore, userData } from './db';
import type { Attendance, Settings, Subject, TimetableEntry } from './types';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
/** What a login reconcile actually did, so the caller never has to guess from a boolean. */
export type SyncResult = 'pulled' | 'seeded' | 'failed' | 'skipped';

interface CloudDoc {
  subjects: Subject[];
  attendance: Attendance[];
  timetable: TimetableEntry[];
  settings: Settings;
  updatedAt: string;
}

const PUSH_DEBOUNCE_MS = 1200;
const pushTimers = new Map<string, number>();

function userDoc(fs: Firestore, uid: string) {
  return doc(fs, 'users', uid);
}

/**
 * Call once right after a user signs in (after local IndexedDB state for that uid has already
 * been loaded into the UI). Reconciles the local store against Firestore:
 *  - Cloud doc exists  -> pulls it down and replaces the local copy for this uid (last-write-wins
 *    at the document level, keyed by the `updatedAt` timestamp every push sets).
 *  - Cloud doc missing -> this device has data Firestore doesn't know about yet (first sign-in, or
 *    a brand new account), so the local copy is pushed up to seed the cloud doc.
 * Reports what happened rather than whether anything changed: a failure can still have written
 * to IndexedDB (restore() runs before setDoc can throw), so callers must re-read either way.
 * Concurrent calls for the same uid share one in-flight promise — StrictMode remounts and a
 * quick sign-out/sign-in would otherwise run two clear-and-rewrite cycles over each other.
 */
const inFlight = new Map<string, Promise<SyncResult>>();
export function syncOnLogin(uid: string, onStatus?: (s: SyncStatus) => void): Promise<SyncResult> {
  const running = inFlight.get(uid);
  if (running) return running;
  const started = reconcile(uid, onStatus).finally(() => inFlight.delete(uid));
  inFlight.set(uid, started);
  return started;
}

async function reconcile(uid: string, onStatus?: (s: SyncStatus) => void): Promise<SyncResult> {
  if (!firestore) return 'skipped';
  try {
    onStatus?.('syncing');
    const snap = await getDoc(userDoc(firestore, uid));
    if (snap.exists()) {
      const cloud = snap.data() as Partial<CloudDoc>;
      await restore(uid, {
        subjects: cloud.subjects ?? [],
        attendance: cloud.attendance ?? [],
        timetable: cloud.timetable ?? [],
        settings: cloud.settings ?? { uid, defaultTarget: 75, theme: 'system', onboardingComplete: false },
      }, true);
      onStatus?.('synced');
      return 'pulled';
    }
    const local = await userData(uid);
    await setDoc(userDoc(firestore, uid), { ...local, updatedAt: new Date().toISOString() });
    onStatus?.('synced');
    return 'seeded';
  } catch (e) {
    console.error('Cloud sync (login) failed:', e);
    onStatus?.(navigator.onLine ? 'error' : 'offline');
    return 'failed';
  }
}

/**
 * Fire-and-forget, debounced push of the current local IndexedDB state for `uid` up to Firestore.
 * Safe to call after every local mutation — call it liberally; it no-ops when signed out or when
 * Firestore isn't configured, and network/offline failures never throw back into the caller.
 */
export function pushToCloud(uid: string, onStatus?: (s: SyncStatus) => void) {
  if (!firestore || !uid) return;
  const existing = pushTimers.get(uid);
  if (existing) window.clearTimeout(existing);
  const timer = window.setTimeout(async () => {
    pushTimers.delete(uid);
    if (!firestore) return;
    try {
      onStatus?.('syncing');
      const local = await userData(uid);
      await setDoc(userDoc(firestore, uid), { ...local, updatedAt: new Date().toISOString() });
      onStatus?.('synced');
    } catch (e) {
      console.error('Cloud sync (push) failed:', e);
      onStatus?.(navigator.onLine ? 'error' : 'offline');
    }
  }, PUSH_DEBOUNCE_MS);
  pushTimers.set(uid, timer);
}

/** Cancel any pending debounced push (call on logout so a stale timer doesn't fire for the next user). */
export function cancelPendingPush(uid: string) {
  const existing = pushTimers.get(uid);
  if (existing) { window.clearTimeout(existing); pushTimers.delete(uid); }
}
