import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import {
  executePush,
  getLastSyncErrorReason,
  estimatePayloadSize,
  FIRESTORE_MAX_DOC_SIZE,
  FIRESTORE_WARN_DOC_SIZE,
  _setFirestoreForTesting,
  _clearAllPendingPushesForTesting,
} from '../sync';
import { setReconciled, put } from '../db';
import { resetTestDb, createMockFirestore, sampleSubject, sampleAttendance } from '../test/helpers';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((fs: any, col: string, id: string) => ({ fs, path: `${col}/${id}`, id })),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
  };
});

describe('BUG-A08: Firestore 1 MiB document limit safeguards', () => {
  const uid = 'user-bug-a08';
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

  it('correctly estimates byte size of payload', () => {
    const small = { test: 'hello' };
    expect(estimatePayloadSize(small)).toBeGreaterThan(0);

    // 100 KB string
    const bigStr = 'x'.repeat(100 * 1024);
    const payload = { data: bigStr };
    expect(estimatePayloadSize(payload)).toBeGreaterThanOrEqual(100 * 1024);
  });

  it('blocks push and sets payload_too_large error when dataset exceeds 1 MiB', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await setReconciled(uid, true);
    await put('subjects', sampleSubject({ uid, id: 's1' }));

    // Create enough records to exceed 1 MiB
    // Each record with a ~10KB note -> ~110 records = ~1.1 MiB
    const largeNote = 'A'.repeat(10240);
    for (let i = 0; i < 110; i++) {
      const att = sampleAttendance({ uid, id: `att-${i}`, subjectId: 's1' });
      (att as any).note = largeNote;
      await put('attendance', att);
    }

    const statuses: string[] = [];
    await executePush(uid, (s) => statuses.push(s));

    // setDoc must NOT be called for oversized document
    expect(mockFirestore.setDoc).not.toHaveBeenCalled();

    // Status must be error
    expect(statuses).toContain('error');

    // Error reason must be payload_too_large
    expect(getLastSyncErrorReason()).toBe('payload_too_large');

    // Advancing timers should NOT retry
    await vi.advanceTimersByTimeAsync(60000);
    expect(mockFirestore.setDoc).not.toHaveBeenCalled();
  });
});
