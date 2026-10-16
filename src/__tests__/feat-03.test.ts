import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPreSyncSnapshot,
  mergeUserData,
  executeConflictResolution,
  type UserDataset,
} from '../sync-conflict';
import { resetTestDb, sampleSubject, sampleAttendance, sampleTimetable, sampleSettings, createMockFirestore } from '../test/helpers';
import { put, userData, getDb } from '../db';
import { _setFirestoreForTesting } from '../sync';

describe('FEAT-03: Mode switching, safety snapshots, and 3-way conflict resolution', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it('createPreSyncSnapshot saves an automatic local backup before destructive actions', async () => {
    const uid = 'test-snap-user';
    const sub = sampleSubject({ id: 's1', uid, name: 'Physics' });
    const att = sampleAttendance({ id: 'a1', uid, subjectId: 's1', status: 'present' });
    await put('subjects', sub);
    await put('attendance', att);

    const snapshotKey = await createPreSyncSnapshot(uid);
    expect(snapshotKey).toMatch(/^snapshot:pre-sync-\d{8}-\d{6}$/);

    const db = await getDb();
    const stored = await db.get('users', snapshotKey);
    expect(stored).toBeDefined();
    expect((stored as any).snapshot.subjects).toHaveLength(1);
    expect((stored as any).snapshot.subjects[0].name).toBe('Physics');
    expect((stored as any).snapshot.attendance[0].id).toBe('a1');
  });

  it('mergeUserData combines non-overlapping and merges overlapping records by newer updatedAt', () => {
    const targetUid = 'merged-uid';
    const localData: UserDataset = {
      subjects: [
        sampleSubject({ id: 's1', name: 'Local Only Math' }),
        sampleSubject({ id: 's2', name: 'Shared Physics (Older Local)', createdAt: '2026-01-01T00:00:00Z' }),
      ],
      attendance: [
        sampleAttendance({ id: 'a1', subjectId: 's1', status: 'present' }),
        sampleAttendance({ id: 'a2', subjectId: 's2', status: 'absent', updatedAt: '2026-03-02T12:00:00Z' }), // Newer
      ],
      timetable: [sampleTimetable({ id: 't1', subjectId: 's1' })],
      settings: sampleSettings({ defaultTarget: 80 }),
    };

    const cloudData: UserDataset = {
      subjects: [
        sampleSubject({ id: 's2', name: 'Shared Physics (Newer Cloud)', createdAt: '2026-01-02T00:00:00Z' }),
        sampleSubject({ id: 's3', name: 'Cloud Only Chemistry' }),
      ],
      attendance: [
        sampleAttendance({ id: 'a2', subjectId: 's2', status: 'present', updatedAt: '2026-03-01T12:00:00Z' }), // Older
        sampleAttendance({ id: 'a3', subjectId: 's3', status: 'present' }),
      ],
      timetable: [sampleTimetable({ id: 't2', subjectId: 's3' })],
      settings: sampleSettings({ defaultTarget: 75 }),
    };

    const merged = mergeUserData(localData, cloudData, targetUid);

    // Subjects: s1, s2 (from cloud because newer createdAt), s3
    expect(merged.subjects).toHaveLength(3);
    const s2 = merged.subjects.find(s => s.id === 's2');
    expect(s2?.name).toBe('Shared Physics (Newer Cloud)');

    // Attendance: a1, a2 (from local because newer updatedAt - absent), a3
    expect(merged.attendance).toHaveLength(3);
    const a2 = merged.attendance.find(a => a.id === 'a2');
    expect(a2?.status).toBe('absent');

    // Timetable: t1 and t2
    expect(merged.timetable).toHaveLength(2);
  });

  it('executeConflictResolution creates safety snapshot and applies keep_cloud strategy', async () => {
    const uid = 'resolve-user';
    const subLocal = sampleSubject({ id: 's1', uid, name: 'Local Sub' });
    await put('subjects', subLocal);

    const localData: UserDataset = {
      subjects: [subLocal],
      attendance: [],
      timetable: [],
      settings: sampleSettings({ uid }),
    };

    const subCloud = sampleSubject({ id: 's2', uid, name: 'Cloud Sub' });
    const cloudData: UserDataset = {
      subjects: [subCloud],
      attendance: [],
      timetable: [],
      settings: sampleSettings({ uid }),
    };

    await executeConflictResolution(uid, 'keep_cloud', localData, cloudData);

    const current = await userData(uid);
    expect(current.subjects).toHaveLength(1);
    expect(current.subjects[0].name).toBe('Cloud Sub');

    // Check that pre-sync snapshot was created
    const db = await getDb();
    const allUsers = await db.getAll('users');
    const snapshot = allUsers.find(u => u.uid.startsWith('snapshot:pre-sync'));
    expect(snapshot).toBeDefined();
    expect((snapshot as any).snapshot.subjects[0].name).toBe('Local Sub');
  });
});
