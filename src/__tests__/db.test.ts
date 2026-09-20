import { describe, it, expect, beforeEach } from 'vitest';
import {
  userData,
  put,
  remove,
  clearUser,
  restore,
  importTimetableData,
  importAttendanceData,
  id,
} from '../db';
import { resetTestDb, sampleSubject, sampleAttendance, sampleTimetable, sampleSettings } from '../test/helpers';

describe('db.ts IndexedDB operations (via fake-indexeddb)', () => {
  const uid = 'test-user-1';

  beforeEach(async () => {
    await resetTestDb();
  });

  it('userData returns empty arrays and default settings when empty', async () => {
    const data = await userData(uid);
    expect(data.subjects).toEqual([]);
    expect(data.attendance).toEqual([]);
    expect(data.timetable).toEqual([]);
    expect(data.settings).toEqual({
      uid,
      defaultTarget: 75,
      theme: 'system',
      onboardingComplete: false,
    });
  });

  it('put and userData persist and retrieve subjects', async () => {
    const sub = sampleSubject({ uid });
    await put('subjects', sub);

    const data = await userData(uid);
    expect(data.subjects).toHaveLength(1);
    expect(data.subjects[0]).toEqual(sub);
  });

  it('remove deletes a record from store', async () => {
    const sub = sampleSubject({ uid, id: 'sub-to-delete' });
    await put('subjects', sub);

    let data = await userData(uid);
    expect(data.subjects).toHaveLength(1);

    await remove('subjects', 'sub-to-delete');
    data = await userData(uid);
    expect(data.subjects).toHaveLength(0);
  });

  it('clearUser deletes all records and settings for a given uid', async () => {
    const sub = sampleSubject({ uid });
    const att = sampleAttendance({ uid });
    const tt = sampleTimetable({ uid });
    const sett = sampleSettings({ uid, defaultTarget: 85 });

    await put('subjects', sub);
    await put('attendance', att);
    await put('timetable', tt);
    await put('settings', sett);

    let data = await userData(uid);
    expect(data.subjects).toHaveLength(1);
    expect(data.settings.defaultTarget).toBe(85);

    await clearUser(uid);

    data = await userData(uid);
    expect(data.subjects).toHaveLength(0);
    expect(data.attendance).toHaveLength(0);
    expect(data.timetable).toHaveLength(0);
    // After clearUser, settings falls back to default
    expect(data.settings.defaultTarget).toBe(75);
  });

  it('restore with replace wipes existing and stores new data atomically', async () => {
    const oldSub = sampleSubject({ id: 'old-sub', uid, name: 'Old Subject' });
    await put('subjects', oldSub);

    const newSub = sampleSubject({ id: 'new-sub', uid, name: 'New Subject' });
    const newAtt = sampleAttendance({ id: 'new-att', uid });
    const newTt = sampleTimetable({ id: 'new-tt', uid });
    const newSett = sampleSettings({ uid, defaultTarget: 90 });

    await restore(uid, {
      subjects: [newSub],
      attendance: [newAtt],
      timetable: [newTt],
      settings: newSett,
    }, true);

    const data = await userData(uid);
    expect(data.subjects).toHaveLength(1);
    expect(data.subjects[0].id).toBe('new-sub');
    expect(data.attendance).toHaveLength(1);
    expect(data.timetable).toHaveLength(1);
    expect(data.settings.defaultTarget).toBe(90);
  });

  it('importTimetableData and importAttendanceData store atomic batch writes', async () => {
    const sub = sampleSubject({ uid, id: 'sub-import' });
    const att = sampleAttendance({ uid, id: 'att-import', subjectId: 'sub-import' });
    const tt = sampleTimetable({ uid, id: 'tt-import', subjectId: 'sub-import' });

    await importTimetableData([sub], [tt]);
    await importAttendanceData([], [att]);

    const data = await userData(uid);
    expect(data.subjects).toHaveLength(1);
    expect(data.timetable).toHaveLength(1);
    expect(data.attendance).toHaveLength(1);
  });

  it('generates a valid UUID with id()', () => {
    const newId = id();
    expect(typeof newId).toBe('string');
    expect(newId.length).toBeGreaterThan(10);
  });
});
