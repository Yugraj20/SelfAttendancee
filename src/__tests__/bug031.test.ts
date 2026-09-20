import { describe, it, expect } from 'vitest';
import { trend } from '../math';
import type { Attendance } from '../types';

describe('BUG-031: trend() multi-year label formatting and orphan handling', () => {
  it('formats MM/DD when all records are within the same year', () => {
    const records: Attendance[] = [
      { id: '1', uid: 'u1', subjectId: 's1', date: '2026-03-01', sessionId: 'manual', status: 'present', updatedAt: '' },
      { id: '2', uid: 'u1', subjectId: 's1', date: '2026-03-02', sessionId: 'manual', status: 'absent', updatedAt: '' },
    ];
    const points = trend(records);
    expect(points).toHaveLength(2);
    expect(points[0].label).toBe('03/01');
    expect(points[1].label).toBe('03/02');
  });

  it('includes the year in trend labels when data spans multiple years', () => {
    const records: Attendance[] = [
      { id: '1', uid: 'u1', subjectId: 's1', date: '2025-12-15', sessionId: 'manual', status: 'present', updatedAt: '' },
      { id: '2', uid: 'u1', subjectId: 's1', date: '2026-01-10', sessionId: 'manual', status: 'present', updatedAt: '' },
    ];
    const points = trend(records);
    expect(points).toHaveLength(2);
    expect(points[0].label).toContain('2025');
    expect(points[1].label).toContain('2026');
  });
});
