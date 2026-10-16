// Cloud sync layer. IndexedDB (db.ts) is always the source of truth for the UI — every read and
// write happens there first, instantly, whether or not the user is signed in. This module mirrors
// that data to Firestore at `users/{uid}` so a signed-in user can pick up the same data on another
// device. All of it is best-effort: if Firestore is unreachable, local reads/writes are unaffected.
import { doc, getDocFromServer, setDoc, type Firestore } from 'firebase/firestore';
import { firestore } from './firebase';
import { isDirty, isReconciled, restore, setDirty, setReconciled, userData, getDirtyRevision, clearDirty, markDirty } from './db';
import type { Attendance, Settings, Subject, TimetableEntry } from './types';
import { isLocalUid } from './storage-mode';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
/** What a login reconcile actually did, so the caller never has to guess from a boolean. */
export type SyncResult = 'pulled' | 'seeded' | 'failed' | 'skipped';

export const FIRESTORE_MAX_DOC_SIZE = 1048576; // 1 MiB
export const FIRESTORE_WARN_DOC_SIZE = 870400; // ~850 KB

export function estimatePayloadSize(payload: unknown): number {
  const json = JSON.stringify(payload);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(json).length;
  }
  return json.length;
}

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
const inFlightPushes = new Map<string, Promise<void>>();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    for (const uid of activeUids) {
      if (isLocalUid(uid)) continue;
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
  if (!uid || isLocalUid(uid)) return;
  const fsInstance = getFirestoreInstance();
  if (!fsInstance) return;

  const running = inFlightPushes.get(uid);
  if (running) {
    await running;
    const dirty = await isDirty(uid);
    if (!dirty) return;
  }

  const pushPromise = (async () => {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!isOnline) {
      cb?.('offline');
      return;
    }
    const reconciled = await isReconciled(uid);
    if (!reconciled) return;

    try {
      cb?.('syncing');
      const rev = await getDirtyRevision(uid);
      const local = await userData(uid);
      const payload = { ...local, updatedAt: new Date().toISOString() };
      const size = estimatePayloadSize(payload);
      if (size >= FIRESTORE_MAX_DOC_SIZE) {
        lastSyncErrorReason = 'payload_too_large';
        console.error(`Cloud sync (push) failed: Document size (${Math.round(size / 1024)} KB) exceeds Firestore 1 MiB limit.`);
        retryCounts.delete(uid);
        cb?.('error');
        return;
      }
      if (size >= FIRESTORE_WARN_DOC_SIZE) {
        console.warn(`Cloud sync warning: Document size is near the 1 MiB limit (${Math.round(size / 1024)} KB). Consider archiving older records.`);
      }
      await setDoc(userDoc(fsInstance, uid), payload);
      lastSyncErrorReason = null;
      const cleared = await clearDirty(uid, rev);
      if (cleared) {
        retryCounts.delete(uid);
        cb?.('synced');
      } else {
        if (!pushTimers.has(uid)) {
          void pushToCloud(uid, cb);
        }
      }
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
  })();

  inFlightPushes.set(uid, pushPromise);
  try {
    await pushPromise;
  } finally {
    if (inFlightPushes.get(uid) === pushPromise) {
      inFlightPushes.delete(uid);
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
  if (!uid || isLocalUid(uid)) return Promise.resolve('skipped');
  const running = inFlight.get(uid);
  if (running) return running;
  const started = reconcile(uid, onStatus).finally(() => inFlight.delete(uid));
  inFlight.set(uid, started);
  return started;
}

export type SyncErrorReason = 'network' | 'invalid_data' | 'payload_too_large' | null;
let lastSyncErrorReason: SyncErrorReason = null;
export function getLastSyncErrorReason(): SyncErrorReason {
  return lastSyncErrorReason;
}

async function reconcile(uid: string, onStatus?: (s: SyncStatus) => void): Promise<SyncResult> {
  if (!uid || isLocalUid(uid)) return 'skipped';
  const fs = getFirestoreInstance();
  if (!fs) return 'skipped';
  try {
    lastSyncErrorReason = null;
    onStatus?.('syncing');
    const reconciled = await isReconciled(uid);
    const dirty = await isDirty(uid);
    if (reconciled && dirty) {
      const rev = await getDirtyRevision(uid);
      const local = await userData(uid);
      const payload = { ...local, updatedAt: new Date().toISOString() };
      const size = estimatePayloadSize(payload);
      if (size >= FIRESTORE_MAX_DOC_SIZE) {
        lastSyncErrorReason = 'payload_too_large';
        onStatus?.('error');
        return 'failed';
      }
      if (size >= FIRESTORE_WARN_DOC_SIZE) {
        console.warn(`Cloud sync warning: Document size is near the 1 MiB limit (${Math.round(size / 1024)} KB).`);
      }
      await setDoc(userDoc(fs, uid), payload);
      await clearDirty(uid, rev);
      await setReconciled(uid, true);
      onStatus?.('synced');
      return 'seeded';
    }
    const snap = await getDocFromServer(userDoc(fs, uid));
    if (snap.exists()) {
      const stillDirty = await isDirty(uid);
      if (reconciled && stillDirty) {
        const rev = await getDirtyRevision(uid);
        const local = await userData(uid);
        const payload = { ...local, updatedAt: new Date().toISOString() };
        const size = estimatePayloadSize(payload);
        if (size >= FIRESTORE_MAX_DOC_SIZE) {
          lastSyncErrorReason = 'payload_too_large';
          onStatus?.('error');
          return 'failed';
        }
        if (size >= FIRESTORE_WARN_DOC_SIZE) {
          console.warn(`Cloud sync warning: Document size is near the 1 MiB limit (${Math.round(size / 1024)} KB).`);
        }
        await setDoc(userDoc(fs, uid), payload);
        await clearDirty(uid, rev);
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
      }, true, true, true);
      await setReconciled(uid, true);
      onStatus?.('synced');
      return 'pulled';
    }
    const rev = await getDirtyRevision(uid);
    const local = await userData(uid);
    const payload = { ...local, updatedAt: new Date().toISOString() };
    const size = estimatePayloadSize(payload);
    if (size >= FIRESTORE_MAX_DOC_SIZE) {
      lastSyncErrorReason = 'payload_too_large';
      onStatus?.('error');
      return 'failed';
    }
    if (size >= FIRESTORE_WARN_DOC_SIZE) {
      console.warn(`Cloud sync warning: Document size is near the 1 MiB limit (${Math.round(size / 1024)} KB).`);
    }
    await setDoc(userDoc(fs, uid), payload);
    await clearDirty(uid, rev);
    await setReconciled(uid, true);
    onStatus?.('synced');
    return 'seeded';
  } catch (e) {
    console.error('Cloud sync (login) failed:', e);
    const msg = e instanceof Error ? e.message : String(e);
    lastSyncErrorReason = msg.includes('Invalid data') || msg.includes('not an object') ? 'invalid_data' : 'network';
    onStatus?.(navigator.onLine ? 'error' : 'offline');
    return 'failed';
  }
}

/**
 * Fire-and-forget, debounced push of the current local IndexedDB state for `uid` up to Firestore.
 * Safe to call after every local mutation — call it liberally; it no-ops when signed out or when
 * Firestore isn't configured, and network/offline failures never throw back into the caller.
 */
export function pushToCloud(uid: string, onStatus?: (s: SyncStatus) => void): Promise<void> {
  if (!uid || isLocalUid(uid)) return Promise.resolve();
  const fs = getFirestoreInstance();
  if (!fs) return Promise.resolve();
  activeUids.add(uid);
  if (onStatus) statusListeners.set(uid, onStatus);
  const cb = onStatus ?? statusListeners.get(uid);

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

  return markDirty(uid).then(() => {});
}

/** Flush any pending debounced push immediately (e.g. on logout or pagehide). */
export async function flushPendingPush(uid: string): Promise<void> {
  if (!uid || isLocalUid(uid)) return;
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
  if (!fsInstance) return;
  const reconciled = await isReconciled(uid);
  if (!reconciled) return;
  try {
    const rev = await getDirtyRevision(uid);
    const local = await userData(uid);
    const payload = { ...local, updatedAt: new Date().toISOString() };
    const size = estimatePayloadSize(payload);
    if (size >= FIRESTORE_MAX_DOC_SIZE) {
      lastSyncErrorReason = 'payload_too_large';
      return;
    }
    await setDoc(userDoc(fsInstance, uid), payload);
    await clearDirty(uid, rev);
  } catch (e) {
    console.error('Cloud sync (flush) failed:', e);
  }
}

/** Cancel any pending debounced push (call on logout so a stale timer doesn't fire for the next user). */
export function cancelPendingPush(uid?: string) {
  if (!uid) {
    for (const id of Array.from(activeUids)) {
      cancelPendingPush(id);
    }
    for (const id of Array.from(pushTimers.keys())) {
      cancelPendingPush(id);
    }
    return;
  }
  const existing = pushTimers.get(uid);
  if (existing) { clearTimeout(existing); pushTimers.delete(uid); }
  const existingRetry = retryTimers.get(uid);
  if (existingRetry) { clearTimeout(existingRetry); retryTimers.delete(uid); }
  retryCounts.delete(uid);
  activeUids.delete(uid);
  statusListeners.delete(uid);
  inFlightPushes.delete(uid);
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
  inFlightPushes.clear();
}
