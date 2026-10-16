import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import { syncOnLogin, _setFirestoreForTesting, _clearAllPendingPushesForTesting } from '../sync';
import { put, userData } from '../db';
import { resetTestDb, createMockFirestore, sampleSubject } from '../test/helpers';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((fs: any, col: string, id: string) => ({ fs, path: `${col}/${id}`, id })),
    getDoc: vi.fn(),
    getDocFromServer: vi.fn(),
    setDoc: vi.fn(),
  };
});

describe('BUG-A02: reconcile uses getDocFromServer to avoid stale cached doc overwriting local data when offline', () => {
  const uid = 'user-a02';
  let mockFirestore: ReturnType<typeof createMockFirestore>;

  beforeEach(async () => {
    await resetTestDb();
    mockFirestore = createMockFirestore();
    _setFirestoreForTesting(mockFirestore.mockFs);

    // Mock getDoc returning stale cached data
    const staleSubject = sampleSubject({ uid, id: 'stale-cloud-sub', name: 'Stale Cloud Subject' });
    mockFirestore.docs.set(`users/${uid}`, {
      subjects: [staleSubject],
      attendance: [],
      timetable: [],
      settings: { uid, defaultTarget: 75, theme: 'system', onboardingComplete: true },
      updatedAt: '2025-01-01T00:00:00.000Z',
    });

    vi.mocked(firestoreModule.getDoc).mockImplementation(mockFirestore.getDoc as any);
    // getDocFromServer throws because the client cannot reach the server (offline)
    vi.mocked(firestoreModule.getDocFromServer).mockImplementation(async () => {
      throw new Error('Failed to get document because the client is offline.');
    });
    vi.mocked(firestoreModule.setDoc).mockImplementation(mockFirestore.setDoc as any);
  });

  afterEach(() => {
    _clearAllPendingPushesForTesting();
    _setFirestoreForTesting(null);
    vi.clearAllMocks();
  });

  it('fails with getDoc: stale cache overwrites local data; passes with getDocFromServer returning failed and preserving local data', async () => {
    // Local data has newer unsynced subject
    const localSub = sampleSubject({ uid, id: 'local-fresh-sub', name: 'Local Fresh Subject' });
    await put('subjects', localSub);

    // Run syncOnLogin (reconcile)
    const result = await syncOnLogin(uid);

    // Expect getDocFromServer to have been called instead of relying on stale cache from getDoc
    expect(firestoreModule.getDocFromServer).toHaveBeenCalled();
    // On offline failure, sync should return 'failed'
    expect(result).toBe('failed');

    // Local data must remain untouched!
    const local = await userData(uid);
    expect(local.subjects).toHaveLength(1);
    expect(local.subjects[0].id).toBe('local-fresh-sub');
    expect(local.subjects[0].name).toBe('Local Fresh Subject');
  });
});
