import { describe, it, expect } from 'vitest';
import { subjectStats, overall, dateISO, trend } from '../math';
import type { Attendance, Subject } from '../types';

describe('math.ts characterization tests (current behavior)', () => {
  const baseSubject: Subject = {
    id: 'sub-1',
    uid: 'u1',
    name: 'Mathematics',
    code: 'MATH101',
    teacher: 'Prof. Gauss',
    room: '101',
    color: '#3b82f6',
    target: 75,
    createdAt: '2026-01-01',
  };

  describe('subjectStats', () => {
    it('returns 0s and state "neutral" when no records exist (BUG-020)', () => {
      const stats = subjectStats(baseSubject, []);
      expect(stats).toEqual({
        present: 0,
        total: 0,
        absent: 0,
        pct: 0,
        bunk: 0,
        required: 0,
        state: 'neutral',
      });
    });

    it('calculates onTarget correctly when exactly at target (3/4 with 75% target)', () => {
      const records: Attendance[] = [
        { id: '1', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '2', uid: 'u1', subjectId: 'sub-1', date: '2026-03-02', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '3', uid: 'u1', subjectId: 'sub-1', date: '2026-03-03', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '4', uid: 'u1', subjectId: 'sub-1', date: '2026-03-04', sessionId: 'manual', status: 'absent', updatedAt: '' },
      ];
      const stats = subjectStats(baseSubject, records);
      expect(stats.present).toBe(3);
      expect(stats.total).toBe(4);
      expect(stats.absent).toBe(1);
      expect(stats.pct).toBe(75);
      expect(stats.bunk).toBe(0);
      expect(stats.required).toBe(0);
      expect(stats.state).toBe('onTarget');
    });

    it('calculates comfortable and bunk margin when above target + 5%', () => {
      const records: Attendance[] = [
        { id: '1', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '2', uid: 'u1', subjectId: 'sub-1', date: '2026-03-02', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '3', uid: 'u1', subjectId: 'sub-1', date: '2026-03-03', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '4', uid: 'u1', subjectId: 'sub-1', date: '2026-03-04', sessionId: 'manual', status: 'present', updatedAt: '' },
      ];
      const stats = subjectStats(baseSubject, records);
      expect(stats.present).toBe(4);
      expect(stats.total).toBe(4);
      expect(stats.pct).toBe(100);
      expect(stats.bunk).toBe(1); // floor(4 / 0.75 - 4) = floor(5.333 - 4) = 1
      expect(stats.required).toBe(0);
      expect(stats.state).toBe('comfortable');
    });

    it('calculates required classes when below target', () => {
      const records: Attendance[] = [
        { id: '1', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '2', uid: 'u1', subjectId: 'sub-1', date: '2026-03-02', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '3', uid: 'u1', subjectId: 'sub-1', date: '2026-03-03', sessionId: 'manual', status: 'absent', updatedAt: '' },
        { id: '4', uid: 'u1', subjectId: 'sub-1', date: '2026-03-04', sessionId: 'manual', status: 'absent', updatedAt: '' },
      ];
      const stats = subjectStats(baseSubject, records);
      expect(stats.pct).toBe(50);
      expect(stats.bunk).toBe(0);
      // ceil((0.75 * 4 - 2) / 0.25) = ceil(1 / 0.25) = 4
      expect(stats.required).toBe(4);
      expect(stats.state).toBe('risk');
    });

    it('verifies exact integer arithmetic (BUG-004) where target 80 with 0/1 yields 4', () => {
      const subject80: Subject = { ...baseSubject, target: 80 };
      const records: Attendance[] = [
        { id: '1', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'manual', status: 'absent', updatedAt: '' },
      ];
      const stats = subjectStats(subject80, records);
      expect(stats.required).toBe(4);
    });

    it('verifies target 100 behavior yielding sentinel -1 when absent (BUG-004)', () => {
      const subject100: Subject = { ...baseSubject, target: 100 };
      const records: Attendance[] = [
        { id: '1', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'manual', status: 'absent', updatedAt: '' },
      ];
      const stats = subjectStats(subject100, records);
      expect(stats.required).toBe(-1);
    });

    it('ignores unmarked records and records for other subjects', () => {
      const records: Attendance[] = [
        { id: '1', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'manual', status: 'unmarked', updatedAt: '' },
        { id: '2', uid: 'u1', subjectId: 'sub-OTHER', date: '2026-03-01', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '3', uid: 'u1', subjectId: 'sub-1', date: '2026-03-02', sessionId: 'manual', status: 'present', updatedAt: '' },
      ];
      const stats = subjectStats(baseSubject, records);
      expect(stats.total).toBe(1);
      expect(stats.present).toBe(1);
    });
  });

  describe('overall', () => {
    it('aggregates across subjects correctly', () => {
      const subject2: Subject = { ...baseSubject, id: 'sub-2', target: 80 };
      const records: Attendance[] = [
        { id: '1', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '2', uid: 'u1', subjectId: 'sub-1', date: '2026-03-02', sessionId: 'manual', status: 'absent', updatedAt: '' },
        { id: '3', uid: 'u1', subjectId: 'sub-2', date: '2026-03-01', sessionId: 'manual', status: 'present', updatedAt: '' },
      ];
      const res = overall([baseSubject, subject2], records);
      expect(res).toEqual({
        present: 2,
        total: 3,
        absent: 1,
        pct: (2 / 3) * 100,
      });
    });

    it('handles empty subjects list', () => {
      expect(overall([], [])).toEqual({
        present: 0,
        total: 0,
        absent: 0,
        pct: 0,
      });
    });
  });

  describe('dateISO', () => {
    it('formats a date to YYYY-MM-DD', () => {
      const d = new Date(2026, 2, 15); // March 15, 2026
      expect(dateISO(d)).toBe('2026-03-15');
    });
  });

  describe('trend', () => {
    it('calculates running percentage sorted by date, merging multiple records on same date', () => {
      const records: Attendance[] = [
        { id: '1', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '2', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'manual', status: 'absent', updatedAt: '' },
        { id: '3', uid: 'u1', subjectId: 'sub-1', date: '2026-03-02', sessionId: 'manual', status: 'present', updatedAt: '' },
      ];
      const points = trend(records, 30);
      expect(points).toHaveLength(2);
      expect(points[0]).toEqual({
        date: '2026-03-01',
        pct: 50,
        label: '03/01',
      });
      expect(points[1]).toEqual({
        date: '2026-03-02',
        pct: 66.7,
        label: '03/02',
      });
    });

    it('respects take limit', () => {
      const records: Attendance[] = [
        { id: '1', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '2', uid: 'u1', subjectId: 'sub-1', date: '2026-03-02', sessionId: 'manual', status: 'present', updatedAt: '' },
        { id: '3', uid: 'u1', subjectId: 'sub-1', date: '2026-03-03', sessionId: 'manual', status: 'present', updatedAt: '' },
      ];
      const points = trend(records, 2);
      expect(points).toHaveLength(2);
      expect(points[0].date).toBe('2026-03-02');
      expect(points[1].date).toBe('2026-03-03');
    });
  });
});
