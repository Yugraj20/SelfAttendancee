import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StorageMode,
  LOCAL_UID,
  LOCAL_USER,
  APP_MODE_KEY,
  getStorageMode,
  setStorageMode,
  getInitialStorageMode,
  isLocalUid,
} from '../storage-mode';
import { resetTestDb, createMockFirestore } from '../test/helpers';
import {
  pushToCloud,
  executePush,
  flushPendingPush,
  syncOnLogin,
  _setFirestoreForTesting,
  _clearAllPendingPushesForTesting,
} from '../sync';
import { getDb } from '../db';

describe('FEAT-01: Storage mode model (Local vs Cloud)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetTestDb();
    _clearAllPendingPushesForTesting();
    _setFirestoreForTesting(null);
  });

  it('persists and retrieves StorageMode in localStorage and IndexedDB', async () => {
    expect(getInitialStorageMode()).toBeNull();
    expect(await getStorageMode()).toBeNull();

    await setStorageMode('local');
    expect(getInitialStorageMode()).toBe('local');
    expect(await getStorageMode()).toBe('local');

    // Verify stored in IndexedDB under app:mode
    const db = await getDb();
    const stored = await db.get('users', APP_MODE_KEY);
    expect(stored).toBeDefined();
    expect((stored as any).mode).toBe('local');

    await setStorageMode('cloud');
    expect(getInitialStorageMode()).toBe('cloud');
    expect(await getStorageMode()).toBe('cloud');

    await setStorageMode(null);
    expect(getInitialStorageMode()).toBeNull();
    expect(await getStorageMode()).toBeNull();
  });

  it('identifies LOCAL_UID and LOCAL_USER', () => {
    expect(LOCAL_UID).toBe('local');
    expect(LOCAL_USER.uid).toBe('local');
    expect(isLocalUid('local')).toBe(true);
    expect(isLocalUid(null)).toBe(true);
    expect(isLocalUid(undefined)).toBe(true);
    expect(isLocalUid('firebase-uid-123')).toBe(false);
  });

  it('all sync operations silently no-op and make ZERO Firestore calls for local uid', async () => {
    const mockFs = createMockFirestore();
    _setFirestoreForTesting(mockFs.mockFs);

    // pushToCloud
    await pushToCloud(LOCAL_UID);
    expect(mockFs.setDoc).not.toHaveBeenCalled();

    // executePush
    await executePush(LOCAL_UID);
    expect(mockFs.setDoc).not.toHaveBeenCalled();

    // flushPendingPush
    await flushPendingPush(LOCAL_UID);
    expect(mockFs.setDoc).not.toHaveBeenCalled();

    // syncOnLogin
    const result = await syncOnLogin(LOCAL_UID);
    expect(result).toBe('skipped');
    expect(mockFs.getDoc).not.toHaveBeenCalled();
    expect(mockFs.setDoc).not.toHaveBeenCalled();
  });
});
