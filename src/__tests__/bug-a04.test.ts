import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import { validateTimetableResponse } from '../gemini';
import { restore, getLastQuarantineReport, userData } from '../db';
import { syncOnLogin, _setFirestoreForTesting, _clearAllPendingPushesForTesting } from '../sync';
import { resetTestDb, createMockFirestore, sampleSubject, sampleAttendance } from '../test/helpers';

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

describe('BUG-A04: Robust pull with quarantining and no invented timetable times', () => {
  const uid = 'user-a04';
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

  it('validateTimetableResponse does not invent 09:00/10:00 when times are missing', () => {
    const raw = {
      timetable: [
        {
          day: 'Monday',
          startTime: '',
          endTime: '',
          subject: 'Math',
        },
        {
          day: 'Someday',
          startTime: '11:00',
          endTime: '12:00',
          subject: 'Physics',
        }
      ]
    };
    const res = validateTimetableResponse(raw);
    expect(res.entries[0].startTime).not.toBe('09:00');
    expect(res.entries[0].endTime).not.toBe('10:00');
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('pull quarantines corrupted rows instead of failing the entire pull', async () => {
    const validSub = sampleSubject({ uid, id: 'valid-sub-1', name: 'Valid Subject' });
    const invalidSub = { uid, id: '', name: 'Invalid Missing ID', target: 75 };

    const validAtt = sampleAttendance({ uid, id: 'valid-att-1', subjectId: 'valid-sub-1' });
    const invalidAtt = { id: 'bad-att-1', uid, subjectId: 'valid-sub-1', date: 'invalid-date', status: 'present' };

    const invalidTT = { id: 'tt-bad', uid, day: 'InvalidDay', startTime: '09:00', endTime: '10:00', subject: 'Math', room: '' };

    mockFirestore.docs.set(`users/${uid}`, {
      subjects: [validSub, invalidSub],
      attendance: [validAtt, invalidAtt],
      timetable: [invalidTT],
      settings: { uid, defaultTarget: 75, theme: 'system', onboardingComplete: true },
      updatedAt: '2026-03-01T00:00:00.000Z',
    });

    // Reconcile / pull from cloud
    const syncRes = await syncOnLogin(uid);
    expect(syncRes).toBe('pulled');

    // Valid data should be saved locally
    const local = await userData(uid);
    expect(local.subjects.some(s => s.id === 'valid-sub-1')).toBe(true);
    expect(local.attendance.some(a => a.id === 'valid-att-1')).toBe(true);

    // Quarantine report should record the skipped rows
    const report = getLastQuarantineReport();
    expect(report).toBeDefined();
    expect(report!.totalQuarantined).toBe(3);
  });
});
