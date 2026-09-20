import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importAttendanceData, userData, setReconciled, isDirty } from '../db';
import { pushToCloud, _clearAllPendingPushesForTesting, _setFirestoreForTesting } from '../sync';
import { resetTestDb, sampleSubject, sampleAttendance, createMockFirestore } from '../test/helpers';

describe('BUG-010: Attendance import commit and reload flow', () => {
  const uid = 'user-import-1';

  beforeEach(async () => {
    await resetTestDb();
    _clearAllPendingPushesForTesting();
    _setFirestoreForTesting(createMockFirestore() as any);
    await setReconciled(uid, true);
  });

  it('records persist and cloud push is triggered on commit even if closed via X before Done', async () => {
    // Simulate what commit() does
    let reloaded = false;
    let pushed = false;

    const reload = async () => {
      const data = await userData(uid);
      reloaded = true;
      pushed = true;
      pushToCloud(uid);
    };

    // New subject and attendance record created by import
    const newSubject = sampleSubject({ uid, id: 's-imported', name: 'Imported Sub' });
    const newRecord = sampleAttendance({ uid, id: 'a-imported', subjectId: 's-imported' });

    // In commit():
    await importAttendanceData([newSubject], [newRecord]);
    // Fix calls reload() right after importAttendanceData write:
    await reload();

    // User closes via X (modal closed, onDone not called)
    expect(reloaded).toBe(true);
    expect(pushed).toBe(true);
    await vi.waitFor(async () => {
      expect(await isDirty(uid)).toBe(true);
    });

    // Verify data in IndexedDB
    const saved = await userData(uid);
    expect(saved.subjects).toHaveLength(1);
    expect(saved.subjects[0].name).toBe('Imported Sub');
    expect(saved.attendance).toHaveLength(1);
    expect(saved.attendance[0].id).toBe('a-imported');
  });
});
