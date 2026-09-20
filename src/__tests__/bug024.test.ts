import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import { pushToCloud, _setFirestoreForTesting, _clearAllPendingPushesForTesting } from '../sync';
import { isDirty, put, setReconciled } from '../db';
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

describe('BUG-024: Sync badge retry on error and online event', () => {
  const uid = 'user-bug024';
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

  it('retries push with backoff when push fails, respecting reconciled gate', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await setReconciled(uid, true);
      const sub = sampleSubject({ uid, name: 'Subject Bug024' });
      await put('subjects', sub);

      // Make setDoc fail on the first attempt
      vi.mocked(mockFirestore.setDoc).mockRejectedValueOnce(new Error('Network error'));

      const statuses: string[] = [];
      pushToCloud(uid, (s) => statuses.push(s));

      // Advance past debounce (1200ms)
      await vi.advanceTimersByTimeAsync(1200);

      await vi.waitFor(() => {
        expect(mockFirestore.setDoc).toHaveBeenCalledTimes(1);
        expect(statuses).toContain('error');
      });

      // Advance backoff delay (1000ms)
      await vi.advanceTimersByTimeAsync(1000);

      await vi.waitFor(() => {
        expect(mockFirestore.setDoc).toHaveBeenCalledTimes(2);
        expect(statuses).toContain('synced');
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries on online event when dirty and reconciled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await setReconciled(uid, true);
      const sub = sampleSubject({ uid, name: 'Subject Online' });
      await put('subjects', sub);

      // Fail push
      vi.mocked(mockFirestore.setDoc).mockRejectedValueOnce(new Error('Offline'));
      pushToCloud(uid);

      await vi.advanceTimersByTimeAsync(1200);
      await vi.waitFor(() => {
        expect(mockFirestore.setDoc).toHaveBeenCalledTimes(1);
      });
      expect(await isDirty(uid)).toBe(true);

      // Trigger online event
      window.dispatchEvent(new Event('online'));

      await vi.waitFor(() => {
        expect(mockFirestore.setDoc).toHaveBeenCalledTimes(2);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT retry push if reconciled marker is false (BUG-003 gate)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await setReconciled(uid, false);
      const sub = sampleSubject({ uid, name: 'Subject Unreconciled' });
      await put('subjects', sub);

      pushToCloud(uid);
      await vi.advanceTimersByTimeAsync(1200);

      // Should not even attempt
      expect(mockFirestore.setDoc).not.toHaveBeenCalled();

      // Trigger online event
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(1200);

      expect(mockFirestore.setDoc).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
