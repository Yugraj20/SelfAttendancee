// Cloud sync layer. IndexedDB (db.ts) is always the source of truth for the UI — every read and
// write happens there first, instantly, whether or not the user is signed in. This module mirrors
// that data to Firestore at `users/{uid}` so a signed-in user can pick up the same data on another
// device. All of it is best-effort: if Firestore is unreachable, local reads/writes are unaffected.
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { firestore } from './firebase';
import { isDirty, isReconciled, restore, setDirty, setReconciled, userData } from './db';
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
const retryTimers = new Map<string, number>();
const retryCounts = new Map<string, number>();
const activeUids = new Set<string>();
const statusListeners = new Map<string, (s: SyncStatus) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    for (const uid of activeUids) {
      void (async () => {
        const reconciled = await isReconciled(uid);
        const dirty = await isDirty(uid);
        if (reconciled && dirty) {
          await executePush(uid, statusListeners.get(uid));
        }
      })();
    }
  });
}

let testFirestore: Firestore | null = null;
export function _setFirestoreForTesting(fs: Firestore | null) {
  testFirestore = fs;
}
function getFirestoreInstance(): Firestore | undefined {
  return testFirestore !== null ? testFirestore : firestore;
}

function userDoc(fs: Firestore, uid: string) {
  return doc(fs, 'users', uid);
}

export async function executePush(uid: string, cb?: (s: SyncStatus) => void): Promise<void> {
  const fsInstance = getFirestoreInstance();
  if (!fsInstance || !uid) return;
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isOnline) {
    cb?.('offline');
    return;
  }
  const reconciled = await isReconciled(uid);
  if (!reconciled) return;
  try {
    cb?.('syncing');
    const local = await userData(uid);
    await setDoc(userDoc(fsInstance, uid), { ...local, updatedAt: new Date().toISOString() });
    await setDirty(uid, false);
    retryCounts.delete(uid);
    cb?.('synced');
  } catch (e) {
    console.error('Cloud sync (push) failed:', e);
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    cb?.(isOnline ? 'error' : 'offline');

    const count = (retryCounts.get(uid) ?? 0) + 1;
    retryCounts.set(uid, count);
    if (count <= 5) {
      const backoffMs = Math.min(1000 * Math.pow(2, count - 1), 30000);
      const rTimer = setTimeout(async () => {
        retryTimers.delete(uid);
        const isRec = await isReconciled(uid);
        const isD = await isDirty(uid);
        if (isRec && isD) {
          await executePush(uid, cb);
        }
      }, backoffMs) as unknown as number;
      retryTimers.set(uid, rTimer);
    }
  }
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
  const fs = getFirestoreInstance();
  if (!fs) return 'skipped';
  try {
    onStatus?.('syncing');
    const reconciled = await isReconciled(uid);
    const dirty = await isDirty(uid);
    if (reconciled && dirty) {
      const local = await userData(uid);
      await setDoc(userDoc(fs, uid), { ...local, updatedAt: new Date().toISOString() });
      await setDirty(uid, false);
      await setReconciled(uid, true);
      onStatus?.('synced');
      return 'seeded';
    }
    const snap = await getDoc(userDoc(fs, uid));
    if (snap.exists()) {
      const stillDirty = await isDirty(uid);
      if (reconciled && stillDirty) {
        const local = await userData(uid);
        await setDoc(userDoc(fs, uid), { ...local, updatedAt: new Date().toISOString() });
        await setDirty(uid, false);
        await setReconciled(uid, true);
        onStatus?.('synced');
        return 'seeded';
      }
      const cloud = snap.data() as Partial<CloudDoc>;
      const sanitizedSubjects = (cloud.subjects ?? []).map(s => ({
        ...s,
        target: typeof s?.target === 'number' && Number.isFinite(s.target) ? Math.max(1, Math.min(100, Math.round(s.target))) : 75,
      }));
      const rawSettings = cloud.settings;
      const sanitizedSettings: Settings = {
        uid,
        defaultTarget: typeof rawSettings?.defaultTarget === 'number' && Number.isFinite(rawSettings.defaultTarget)
          ? Math.max(1, Math.min(100, Math.round(rawSettings.defaultTarget)))
          : 75,
        theme: rawSettings?.theme && ['system', 'light', 'dark', 'amoled'].includes(rawSettings.theme)
          ? rawSettings.theme
          : 'system',
        onboardingComplete: Boolean(rawSettings?.onboardingComplete),
      };
      await restore(uid, {
        subjects: sanitizedSubjects,
        attendance: cloud.attendance ?? [],
        timetable: cloud.timetable ?? [],
        settings: sanitizedSettings,
      }, true);
      await setReconciled(uid, true);
      onStatus?.('synced');
      return 'pulled';
    }
    const local = await userData(uid);
    await setDoc(userDoc(fs, uid), { ...local, updatedAt: new Date().toISOString() });
    await setDirty(uid, false);
    await setReconciled(uid, true);
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
  const fs = getFirestoreInstance();
  if (!fs || !uid) return;
  activeUids.add(uid);
  if (onStatus) statusListeners.set(uid, onStatus);
  const cb = onStatus ?? statusListeners.get(uid);

  setDirty(uid, true);
  const existing = pushTimers.get(uid);
  if (existing) clearTimeout(existing);

  const existingRetry = retryTimers.get(uid);
  if (existingRetry) {
    clearTimeout(existingRetry);
    retryTimers.delete(uid);
  }

  const timer = setTimeout(async () => {
    pushTimers.delete(uid);
    await executePush(uid, cb);
  }, PUSH_DEBOUNCE_MS) as unknown as number;
  pushTimers.set(uid, timer);
}

/** Flush any pending debounced push immediately (e.g. on logout or pagehide). */
export async function flushPendingPush(uid: string): Promise<void> {
  const existing = pushTimers.get(uid);
  if (existing) {
    clearTimeout(existing);
    pushTimers.delete(uid);
  }
  const existingRetry = retryTimers.get(uid);
  if (existingRetry) {
    clearTimeout(existingRetry);
    retryTimers.delete(uid);
  }
  const fsInstance = getFirestoreInstance();
  if (!fsInstance || !uid) return;
  const reconciled = await isReconciled(uid);
  if (!reconciled) return;
  try {
    const local = await userData(uid);
    await setDoc(userDoc(fsInstance, uid), { ...local, updatedAt: new Date().toISOString() });
    await setDirty(uid, false);
  } catch (e) {
    console.error('Cloud sync (flush) failed:', e);
  }
}

/** Cancel any pending debounced push (call on logout so a stale timer doesn't fire for the next user). */
export function cancelPendingPush(uid: string) {
  const existing = pushTimers.get(uid);
  if (existing) { clearTimeout(existing); pushTimers.delete(uid); }
  const existingRetry = retryTimers.get(uid);
  if (existingRetry) { clearTimeout(existingRetry); retryTimers.delete(uid); }
  retryCounts.delete(uid);
  activeUids.delete(uid);
  statusListeners.delete(uid);
}

export function _clearAllPendingPushesForTesting() {
  for (const timer of pushTimers.values()) {
    clearTimeout(timer);
  }
  pushTimers.clear();
  for (const timer of retryTimers.values()) {
    clearTimeout(timer);
  }
  retryTimers.clear();
  retryCounts.clear();
  activeUids.clear();
  statusListeners.clear();
}
