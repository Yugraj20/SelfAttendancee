import { describe, it, expect, beforeEach } from 'vitest';
import { restore, put, userData } from '../db';
import { resetTestDb, sampleSubject, sampleAttendance, sampleTimetable } from '../test/helpers';

describe('BUG-009: Validation and atomic rollback on restore', () => {
  const uid = 'user-val-1';

  beforeEach(async () => {
    await resetTestDb();
    // Seed user with existing valid data
    await put('subjects', sampleSubject({ uid, id: 's1', name: 'Original Subject' }));
    await put('attendance', sampleAttendance({ uid, id: 'a1', subjectId: 's1' }));
    await put('timetable', sampleTimetable({ uid, id: 't1', subjectId: 's1' }));
  });

  it('restore {subjects:[{}]} in replace mode throws error and leaves existing data unchanged', async () => {
    const invalidData: any = {
      subjects: [{}],
      attendance: [],
      timetable: [],
      settings: { defaultTarget: 75, theme: 'system', onboardingComplete: false },
    };

    await expect(restore(uid, invalidData, true)).rejects.toThrow();

    // Verify existing data was NOT deleted or modified
    const current = await userData(uid);
    expect(current.subjects).toHaveLength(1);
    expect(current.subjects[0].name).toBe('Original Subject');
    expect(current.attendance).toHaveLength(1);
    expect(current.timetable).toHaveLength(1);
  });

  it('rejects null elements in subjects, attendance, and timetable', async () => {
    await expect(restore(uid, { subjects: [null as any], attendance: [], timetable: [], settings: {} as any }, false)).rejects.toThrow();
    await expect(restore(uid, { subjects: [], attendance: [null as any], timetable: [], settings: {} as any }, false)).rejects.toThrow();
    await expect(restore(uid, { subjects: [], attendance: [], timetable: [null as any], settings: {} as any }, false)).rejects.toThrow();

    const current = await userData(uid);
    expect(current.subjects).toHaveLength(1);
  });

  it('rejects missing ids, bad dates, invalid status, and wrong types', async () => {
    // Bad date in attendance
    await expect(restore(uid, {
      subjects: [],
      attendance: [{ id: 'a2', subjectId: 's1', date: 'not-a-date', status: 'present' } as any],
      timetable: [],
      settings: {} as any
    }, false)).rejects.toThrow();

    // Bad status in attendance
    await expect(restore(uid, {
      subjects: [],
      attendance: [{ id: 'a2', subjectId: 's1', date: '2025-01-01', status: 'maybe' } as any],
      timetable: [],
      settings: {} as any
    }, false)).rejects.toThrow();

    // Bad day name in timetable
    await expect(restore(uid, {
      subjects: [],
      attendance: [],
      timetable: [{ id: 't2', day: 'Funday', startTime: '09:00', endTime: '10:00' } as any],
      settings: {} as any
    }, false)).rejects.toThrow();

    // Bad time format in timetable
    await expect(restore(uid, {
      subjects: [],
      attendance: [],
      timetable: [{ id: 't2', day: 'Monday', startTime: '9am', endTime: '10:00' } as any],
      settings: {} as any
    }, false)).rejects.toThrow();

    // Invalid target in subject (< 1 or > 100 or non-finite)
    await expect(restore(uid, {
      subjects: [{ id: 's2', name: 'Math', target: 150 } as any],
      attendance: [],
      timetable: [],
      settings: {} as any
    }, false)).rejects.toThrow();

    const current = await userData(uid);
    expect(current.subjects).toHaveLength(1);
  });
});
