import { describe, it, expect } from 'vitest';
import { annotate, buildWrites } from '../attendance-import';
import type { SubjectGroup } from '../types';

describe('BUG-013 / D2: Same-day duplicate vs multiple sessions handling', () => {
  const group: SubjectGroup = {
    key: 'chem',
    label: 'Chemistry',
    name: 'Chemistry',
    code: 'CHM101',
    matchId: 'sub-chem',
    matchKind: 'name',
    action: 'link',
    rows: [
      { key: 'r1', subjectKey: 'chem', label: 'Chemistry', date: '2026-03-01', status: 'present', issue: 'none', note: '', source: '', low: false, include: true },
      { key: 'r2', subjectKey: 'chem', label: 'Chemistry', date: '2026-03-01', status: 'present', issue: 'none', note: '', source: '', low: false, include: true },
    ],
  };

  it('by default dedupes repeated rows on the same day (marks second as duplicate)', () => {
    const annotated = annotate([group], [], false); // allowMultipleSameDay = false (default)
    expect(annotated[0].rows[0].issue).toBe('none');
    expect(annotated[0].rows[1].issue).toBe('duplicate');
  });

  it('when allowMultipleSameDay is true, imports both sessions', () => {
    const annotated = annotate([group], [], true); // allowMultipleSameDay = true
    expect(annotated[0].rows[0].issue).toBe('none');
    expect(annotated[0].rows[1].issue).toBe('none');
  });
});
