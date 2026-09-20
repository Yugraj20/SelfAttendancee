import { describe, it, expect, beforeEach } from 'vitest';
import { _resetDbForTesting, put, restore, userData, previewRestore } from '../db';
import type { BackupPayload, Subject, Attendance, TimetableEntry, Settings } from '../types';

describe('BUG-027: Backup restore checks updatedAt in merge mode and settings opt-in', () => {
  const uid = 'test-u1';

  beforeEach(async () => {
    await _resetDbForTesting();
  });

  it('merge mode does not overwrite newer local attendance records', async () => {
    const localAttendance: Attendance = {
      id: 'att-1',
      uid,
      subjectId: 'sub-1',
      date: '2026-03-01',
      sessionId: 'manual',
      status: 'present',
      updatedAt: '2026-03-05T12:00:00.000Z',
    };
    await put('attendance', localAttendance);

    const backupAttendanceOlder: Attendance = {
      id: 'att-1',
      uid,
      subjectId: 'sub-1',
      date: '2026-03-01',
      sessionId: 'manual',
      status: 'absent',
      updatedAt: '2026-03-01T12:00:00.000Z', // older!
    };

    const backupAttendanceNewer: Attendance = {
      id: 'att-2',
      uid,
      subjectId: 'sub-1',
      date: '2026-03-02',
      sessionId: 'manual',
      status: 'present',
      updatedAt: '2026-03-06T12:00:00.000Z',
    };

    const payload: BackupPayload = {
      version: 1,
      createdAt: '2026-03-06T12:00:00.000Z',
      account: { email: 'test@example.com', uid },
      subjects: [],
      attendance: [backupAttendanceOlder, backupAttendanceNewer],
      timetable: [],
      settings: { uid, defaultTarget: 80, theme: 'dark', onboardingComplete: true },
    };

    const preview = await previewRestore(uid, payload, 'merge');
    expect(preview.added).toBe(1); // att-2
    expect(preview.skipped).toBe(1); // att-1 is skipped because local is newer

    const result = await restore(uid, payload, false, false); // merge, do not restore settings
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);

    const data = await userData(uid);
    const att1 = data.attendance.find(a => a.id === 'att-1');
    expect(att1?.status).toBe('present'); // preserved local newer status!
    const att2 = data.attendance.find(a => a.id === 'att-2');
    expect(att2).toBeDefined();

    // Settings should NOT be overwritten when restoreSettings is false
    expect(data.settings.defaultTarget).toBe(75); // default was not changed to 80
  });
});
