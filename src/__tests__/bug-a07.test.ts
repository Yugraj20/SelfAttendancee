import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import { pushToCloud, cancelPendingPush, _setFirestoreForTesting, _clearAllPendingPushesForTesting } from '../sync';
import { setReconciled, put } from '../db';
import { resetTestDb, createMockFirestore, sampleSubject } from '../test/helpers';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((fs: any, col: string, id: string) => ({ fs, path: `${col}/${id}`, id })),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
  };
});

describe('BUG-A07: cancelPendingPush and safe logout flush', () => {
  const uid = 'user-bug-a07';
  let mockFirestore: ReturnType<typeof createMockFirestore>;

  beforeEach(async () => {
    await resetTestDb();
    mockFirestore = createMockFirestore();
    _setFirestoreForTesting(mockFirestore.mockFs);

    vi.mocked(firestoreModule.getDoc).mockImplementation(mockFirestore.getDoc as any);
    vi.mocked(firestoreModule.setDoc).mockImplementation(mockFirestore.setDoc as any);
  });

  afterEach(() => {
    _clearAllPendingPushesForTesting();
    _setFirestoreForTesting(null);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('cancelPendingPush cleans up activeUids so online event does not run executePush for signed-out user', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await setReconciled(uid, true);
    await put('subjects', sampleSubject({ uid, id: 's1' }));

    // Fail first push to register retry and activeUid
    vi.mocked(mockFirestore.setDoc).mockRejectedValueOnce(new Error('Network error'));
    await pushToCloud(uid);

    await vi.advanceTimersByTimeAsync(1200);
    await vi.waitFor(() => {
      expect(mockFirestore.setDoc).toHaveBeenCalledTimes(1);
    });

    // Call cancelPendingPush on logout
    cancelPendingPush(uid);

    // Trigger online event
    window.dispatchEvent(new Event('online'));

    // Advance any retry timers
    await vi.advanceTimersByTimeAsync(30000);

    // Since cancelPendingPush was called, setDoc should NOT have been called again!
    expect(mockFirestore.setDoc).toHaveBeenCalledTimes(1);
  });

  it('cancelPendingPush without argument cancels all active pending pushes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await setReconciled('user1', true);
    await setReconciled('user2', true);

    await pushToCloud('user1');
    await pushToCloud('user2');

    // Call cancelPendingPush() with no arguments
    cancelPendingPush();

    await vi.advanceTimersByTimeAsync(5000);

    // Neither user1 nor user2 push should have executed
    expect(mockFirestore.setDoc).not.toHaveBeenCalled();
  });
});
