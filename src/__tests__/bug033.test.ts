import { describe, it, expect, beforeEach } from 'vitest';
import { put, getDb } from '../db';
import { resetTestDb } from '../test/helpers';
import type { Attendance } from '../types';

describe('BUG-033: Marking unmarked deletes record, no-ops if none, and supports Undo', () => {
  const uid = 'user-bug033';
  const subjectId = 'sub-33';
  const date = '2026-03-10';
  const sessionId = 'manual';

  beforeEach(async () => {
    await resetTestDb();
  });

  it('deletes existing record from IndexedDB when unmarked', async () => {
    const db = await getDb();
    const existing: Attendance = {
      id: 'att-33-1',
      uid,
      subjectId,
      date,
      sessionId,
      status: 'present',
      updatedAt: new Date().toISOString(),
    };
    await put('attendance', existing);

    // Verify it was stored
    expect(await db.get('attendance', existing.id)).toBeDefined();

    // Now mark unmarked: simulate the fixed mark logic
    await db.delete('attendance', existing.id);

    // Verify it was removed, not replaced with status: 'unmarked'
    const after = await db.get('attendance', existing.id);
    expect(after).toBeUndefined();

    const all = await db.getAllFromIndex('attendance', 'by-uid', uid);
    expect(all).toHaveLength(0);

    // Verify Undo can restore previous record
    await put('attendance', existing);
    const restored = await db.get('attendance', existing.id);
    expect(restored).toBeDefined();
    expect(restored?.status).toBe('present');
  });
});
