import { describe, it, expect } from 'vitest';
import { analyse, summarise } from '../attendance-import';
import type { ParsedAttendance } from '../types';

describe('BUG-014: Low-confidence rows default to include: false and count under review', () => {
  it('defaults low-confidence rows to include: false and includes them under review in summary', () => {
    const parsed: ParsedAttendance = {
      records: [
        { subject: 'Math', date: '2026-03-01', status: 'present', confidence: 'high' },
        { subject: 'Math', date: '2026-03-02', status: 'present', confidence: 'low', note: 'Blurry line' },
      ],
      warnings: [],
      truncated: false,
    };

    const groups = analyse(parsed, []);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[0].rows[0].include).toBe(true);
    expect(groups[0].rows[1].include).toBe(false); // low confidence defaulted to false!

    const sum = summarise(groups, false);
    expect(sum.review).toBe(1);
    expect(sum.ready).toBe(1); // Only the high-confidence row is ready by default
  });
});
