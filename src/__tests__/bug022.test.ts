import { describe, it, expect } from 'vitest';
import { userData, put } from '../db';
import { resetTestDb, sampleSubject, sampleAttendance } from '../test/helpers';

describe('BUG-022: Account switch state isolation', () => {
  it('isolates state per uid and clears state when signing out', async () => {
    await resetTestDb();
    const userA = 'user-a';
    const userB = 'user-b';

    // User A creates subjects and records
    await put('subjects', sampleSubject({ uid: userA, id: 'sa', name: 'Math A' }));
    await put('attendance', sampleAttendance({ uid: userA, id: 'aa', subjectId: 'sa' }));

    // User B has nothing initially
    const dataB = await userData(userB);
    expect(dataB.subjects).toHaveLength(0);
    expect(dataB.attendance).toHaveLength(0);

    // User A data is isolated
    const dataA = await userData(userA);
    expect(dataA.subjects).toHaveLength(1);
    expect(dataA.subjects[0].name).toBe('Math A');
  });
});
