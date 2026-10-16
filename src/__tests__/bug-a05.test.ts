import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import { pushToCloud, executePush, _setFirestoreForTesting, _clearAllPendingPushesForTesting } from '../sync';
import { isDirty, isReconciled, put, setReconciled, userData } from '../db';
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

describe('BUG-A05: Lost update race during push with delayed setDoc', () => {
  const uid = 'user-a05';
  let mockFirestore: ReturnType<typeof createMockFirestore>;

  beforeEach(async () => {
    await resetTestDb();
    mockFirestore = createMockFirestore();
    _setFirestoreForTesting(mockFirestore.mockFs);

    vi.mocked(firestoreModule.getDocFromServer).mockImplementation(mockFirestore.getDoc as any);
    vi.mocked(firestoreModule.setDoc).mockImplementation(mockFirestore.setDoc as any);
  });

  afterEach(() => {
    _clearAllPendingPushesForTesting();
    _setFirestoreForTesting(null);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('prevents lost update when user edits during in-flight setDoc', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await setReconciled(uid, true);

    // Initial edit: Subject 1
    const sub1 = sampleSubject({ uid, id: 's1', name: 'Subject 1' });
    await put('subjects', sub1);

    // Delayed setDoc to simulate network latency
    let resolveFirstSetDoc: (() => void) | null = null;
    vi.mocked(firestoreModule.setDoc).mockImplementationOnce(async (ref: any, data: any) => {
      await new Promise<void>(resolve => {
        resolveFirstSetDoc = () => {
          mockFirestore.docs.set(ref.path, JSON.parse(JSON.stringify(data)));
          resolve();
        };
      });
    });

    // Start push for Subject 1 (enters delayed setDoc without awaiting completion yet)
    const pushPromise = executePush(uid);
    for (let i = 0; i < 50 && !resolveFirstSetDoc; i++) {
      await vi.advanceTimersByTimeAsync(20);
      await Promise.resolve();
    }

    expect(resolveFirstSetDoc).not.toBeNull();

    // WHILE first setDoc is in-flight, user adds Subject 2
    const sub2 = sampleSubject({ uid, id: 's2', name: 'Subject 2' });
    await put('subjects', sub2);
    await pushToCloud(uid);

    // Mock next setDoc normally
    vi.mocked(firestoreModule.setDoc).mockImplementation(mockFirestore.setDoc as any);

    // Now resolve first setDoc and wait for first push to complete
    resolveFirstSetDoc!();
    await pushPromise;

    // Advance debounce timer for second edit
    await vi.advanceTimersByTimeAsync(2000);

    // Verify sub2 was not lost and was pushed to cloud
    await vi.waitFor(async () => {
      const cloudDoc = mockFirestore.docs.get(`users/${uid}`);
      expect(cloudDoc).toBeDefined();
      expect(cloudDoc.subjects.some((s: any) => s.id === 's2')).toBe(true);
      expect(await isDirty(uid)).toBe(false);
    });
  });
});
