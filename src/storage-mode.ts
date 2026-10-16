import { getDb } from './db';
import type { AuthUser } from './firebase';

export type StorageMode = 'local' | 'cloud';

export const LOCAL_UID = 'local';
export const APP_MODE_KEY = 'app:mode';
export const LOCAL_STORAGE_MODE_KEY = 'selfattendance_storage_mode';

export const LOCAL_USER: AuthUser = {
  uid: LOCAL_UID,
  email: '',
  displayName: 'Local User',
  photoURL: '',
} as AuthUser;

export function getInitialStorageMode(): StorageMode | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(LOCAL_STORAGE_MODE_KEY);
      if (val === 'local' || val === 'cloud') return val;
    }
  } catch {}
  return null;
}

export async function getStorageMode(): Promise<StorageMode | null> {
  const syncVal = getInitialStorageMode();
  if (syncVal) return syncVal;

  try {
    const db = await getDb();
    const record = await db.get('users', APP_MODE_KEY);
    if (record && (record as any).mode) {
      const mode = (record as any).mode as StorageMode;
      try {
        localStorage.setItem(LOCAL_STORAGE_MODE_KEY, mode);
      } catch {}
      return mode;
    }
  } catch {}

  return null;
}

export async function setStorageMode(mode: StorageMode | null): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      if (mode) {
        localStorage.setItem(LOCAL_STORAGE_MODE_KEY, mode);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_MODE_KEY);
      }
    }
  } catch {}

  try {
    const db = await getDb();
    if (mode) {
      await db.put('users', {
        uid: APP_MODE_KEY,
        email: '',
        name: mode,
        photoURL: '',
        updatedAt: new Date().toISOString(),
        mode,
      } as any);
    } else {
      await db.delete('users', APP_MODE_KEY);
    }
  } catch {}
}

export function isLocalUid(uid: string | null | undefined): boolean {
  return !uid || uid === LOCAL_UID;
}
