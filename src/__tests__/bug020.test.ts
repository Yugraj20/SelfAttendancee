import { describe, it, expect } from 'vitest';
import { subjectStats } from '../math';
import type { Subject, Attendance } from '../types';

describe('BUG-020: Edge states and target sanitization', () => {
  const baseSubject: Subject = {
    id: 'sub-edge',
    uid: 'u1',
    name: 'Edge Cases 101',
    code: 'EDGE101',
    teacher: 'Prof. Turing',
    room: '404',
    color: '#10b981',
    target: 75,
    createdAt: '2026-01-01',
  };

  it('total=0 returns neutral state and zero metrics', () => {
    const stats = subjectStats(baseSubject, []);
    expect(stats.total).toBe(0);
    expect(stats.state).toBe('neutral');
    expect(stats.bunk).toBe(0);
    expect(stats.required).toBe(0);
  });

  it('target=100 with 0 present and 1 absent produces finite sentinel -1, never Infinity or NaN', () => {
    const s100: Subject = { ...baseSubject, target: 100 };
    const records: Attendance[] = [
      { id: '1', uid: 'u1', subjectId: 'sub-edge', date: '2026-03-01', sessionId: 'manual', status: 'absent', updatedAt: '' },
    ];
    const stats = subjectStats(s100, records);
    expect(stats.required).toBe(-1);
    expect(stats.required).not.toBe(Infinity);
    expect(Number.isNaN(stats.required)).toBe(false);
  });
});
