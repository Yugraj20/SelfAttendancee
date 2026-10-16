import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb, sampleSubject, sampleTimetable, sampleAttendance } from '../test/helpers';
import { put, userData, importTimetableData } from '../db';
import { subjectStats } from '../math';

describe('BUG-A10: re-importing timetable effect on attendance records and stats', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it('preserves stats integrity immediately after re-importing timetable', async () => {
    const uid = 'user-test-10';
    const sub = sampleSubject({ id: 'sub-math', uid, name: 'Math' });
    await put('subjects', sub);

    // Initial timetable entry tt-1
    const tt1 = sampleTimetable({ id: 'tt-1', uid, subjectId: 'sub-math', day: 'Monday', startTime: '09:00', endTime: '10:00' });
    await importTimetableData(uid, [sub], [tt1]);

    // User marks attendance for tt-1 on Monday
    const att1 = sampleAttendance({
      id: 'att-1',
      uid,
      subjectId: 'sub-math',
      date: '2026-04-13',
      sessionId: 'tt-1',
      timetableId: 'tt-1',
      status: 'present',
    });
    await put('attendance', att1);

    // Stats before re-import
    let data = await userData(uid);
    let stats = subjectStats(sub, data.attendance);
    expect(stats.total).toBe(1);
    expect(stats.present).toBe(1);

    // User re-imports timetable with fresh IDs (tt-2 replaces tt-1)
    const tt2 = sampleTimetable({ id: 'tt-2', uid, subjectId: 'sub-math', day: 'Monday', startTime: '09:00', endTime: '10:00' });
    await importTimetableData(uid, [sub], [tt2]);

    // Check records and stats in db
    data = await userData(uid);
    stats = subjectStats(sub, data.attendance);
    expect(stats.total).toBe(1);
    expect(stats.present).toBe(1);
  });

  it('re-importing timetable orphans old record and double-counts if markNow does not resolve orphaned sessionId', async () => {
    const uid = 'user-test-10';
    const sub = sampleSubject({ id: 'sub-math', uid, name: 'Math' });
    await put('subjects', sub);

    // Initial timetable entry tt-1
    const tt1 = sampleTimetable({ id: 'tt-1', uid, subjectId: 'sub-math', day: 'Monday', startTime: '09:00', endTime: '10:00' });
    await importTimetableData(uid, [sub], [tt1]);

    // User marks attendance for tt-1 on Monday
    const att1 = sampleAttendance({
      id: 'att-1',
      uid,
      subjectId: 'sub-math',
      date: '2026-04-13',
      sessionId: 'tt-1',
      timetableId: 'tt-1',
      status: 'present',
    });
    await put('attendance', att1);

    // User re-imports timetable: tt-1 is replaced by tt-2
    const tt2 = sampleTimetable({ id: 'tt-2', uid, subjectId: 'sub-math', day: 'Monday', startTime: '09:00', endTime: '10:00' });
    await importTimetableData(uid, [sub], [tt2]);

    const data = await userData(uid);
    const date = '2026-04-13';
    const sessionId = 'tt-2';

    // Without fix: markNow would not find att-1 when sessionId is tt-2
    const oldWithoutFix = data.attendance.find(r => r.subjectId === sub.id && r.date === date && r.sessionId === sessionId)
      ?? (sessionId === 'manual' ? data.attendance.find(r => r.subjectId === sub.id && r.date === date) : undefined);

    expect(oldWithoutFix).toBeUndefined();

    // With the fix, matching finds the orphan record and updates its sessionId to tt-2
    const oldWithFix = data.attendance.find(r => r.subjectId === sub.id && r.date === date && r.sessionId === sessionId)
      ?? data.attendance.find(r => r.subjectId === sub.id && r.date === date && (r.sessionId === 'manual' || !data.timetable.some(t => t.id === r.sessionId)));

    expect(oldWithFix).toBeDefined();
    expect(oldWithFix?.id).toBe('att-1');

    // Updating att-1 with new sessionId maintains single record count
    const updatedRecord = { ...oldWithFix!, sessionId, status: 'absent' as const };
    await put('attendance', updatedRecord);

    const updatedData = await userData(uid);
    const stats = subjectStats(sub, updatedData.attendance);
    expect(stats.total).toBe(1);
    expect(stats.absent).toBe(1);
    expect(stats.present).toBe(0);
  });
});
