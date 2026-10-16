import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import { syncOnLogin, executePush, _setFirestoreForTesting, _clearAllPendingPushesForTesting } from '../sync';
import { clearUser, isReconciled, put, userData } from '../db';
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

describe('BUG-A01: Clearing local data while signed in', () => {
  const uid = 'user-a01';
  let mockFirestore: ReturnType<typeof createMockFirestore>;

  beforeEach(async () => {
    await resetTestDb();
    mockFirestore = createMockFirestore();
    _setFirestoreForTesting(mockFirestore.mockFs);

    vi.mocked(firestoreModule.getDoc).mockImplementation(mockFirestore.getDoc as any);
    vi.mocked(firestoreModule.getDocFromServer).mockImplementation(mockFirestore.getDoc as any);
    vi.mocked(firestoreModule.setDoc).mockImplementation(mockFirestore.setDoc as any);
  });

  afterEach(() => {
    _clearAllPendingPushesForTesting();
    _setFirestoreForTesting(null);
    vi.clearAllMocks();
  });

  it('reconciles after clearing local data so subsequent edits push to cloud and persist across sign out / sign in', async () => {
    // 1. Initial cloud state has 'Cloud Subject 1'
    const initialCloudSub = sampleSubject({ uid, id: 'sub-cloud-1', name: 'Cloud Subject 1' });
    mockFirestore.docs.set(`users/${uid}`, {
      subjects: [initialCloudSub],
      attendance: [],
      timetable: [],
      settings: { uid, defaultTarget: 75, theme: 'system', onboardingComplete: true },
      updatedAt: '2026-03-01T00:00:00.000Z',
    });

    // 2. User signs in, reconciling cloud data
    const syncRes = await syncOnLogin(uid);
    expect(syncRes).toBe('pulled');
    expect(await isReconciled(uid)).toBe(true);

    // 3. User clears local data while signed in, then immediately runs reconcile
    await clearUser(uid);
    const reconcileAfterClear = await syncOnLogin(uid);
    expect(reconcileAfterClear).toBe('pulled');
    expect(await isReconciled(uid)).toBe(true);

    // 4. User adds new subject
    const newSub = sampleSubject({ uid, id: 'sub-new-1', name: 'New Subject After Clear' });
    await put('subjects', newSub);

    // 5. Cloud push is triggered
    await executePush(uid);

    const cloudAfterPush = mockFirestore.docs.get(`users/${uid}`);
    const hasNewSubjectInCloud = cloudAfterPush?.subjects?.some((s: any) => s.id === 'sub-new-1');
    expect(hasNewSubjectInCloud).toBe(true);

    // 6. User signs out and local cache is cleared
    await clearUser(uid);

    // 7. User signs back in
    const reloginRes = await syncOnLogin(uid);
    expect(reloginRes).toBe('pulled');

    // 8. Local data has the new subject!
    const localData = await userData(uid);
    expect(localData.subjects.some(s => s.id === 'sub-new-1')).toBe(true);
  });
});
