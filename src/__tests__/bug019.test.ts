import { describe, it, expect } from 'vitest';
import type { Subject, TimetableEntry } from '../types';

describe('BUG-019: Rename propagation from linked subject to timetable entry display', () => {
  const subject: Subject = {
    id: 'sub-rename-1',
    uid: 'u1',
    name: 'Advanced Algorithms',
    code: 'CS502',
    teacher: 'Prof. Cormen',
    room: '303',
    color: '#3b82f6',
    target: 75,
    createdAt: '2026-01-01',
  };

  const entry: TimetableEntry = {
    id: 'entry-1',
    uid: 'u1',
    day: 'Tuesday',
    subjectId: 'sub-rename-1',
    subject: 'Old Algorithms Name',
    startTime: '10:00',
    endTime: '11:00',
    room: '303',
    teacher: 'Prof. Cormen',
    type: 'Lecture',
    notes: '',
    order: 0,
  };

  function getDisplaySubjectName(e: TimetableEntry, subjects: Subject[]) {
    const linked = subjects.find(s => s.id === e.subjectId);
    return linked?.name || e.subject;
  }

  it('renders updated subject name from linked subject when subject is renamed', () => {
    const displayName = getDisplaySubjectName(entry, [subject]);
    expect(displayName).toBe('Advanced Algorithms');
  });

  it('falls back to e.subject when linked subject does not exist', () => {
    const orphanEntry = { ...entry, subjectId: 'non-existent' };
    const displayName = getDisplaySubjectName(orphanEntry, [subject]);
    expect(displayName).toBe('Old Algorithms Name');
  });
});
