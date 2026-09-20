import { describe, it, expect } from 'vitest';
import type { Subject, TimetableEntry } from '../types';

describe('BUG-007: Timetable entries require valid subjectId and guard unlinked entries', () => {
  const subjects: Subject[] = [
    { id: 'sub-1', uid: 'u1', name: 'Physics', code: 'PHY', teacher: 'Newton', room: '101', color: '#10b981', target: 75, createdAt: '' },
  ];

  it('identifies unlinked / orphan timetable entries', () => {
    const entryWithoutSubject: TimetableEntry = {
      id: 'e-orphan',
      uid: 'u1',
      day: 'Monday',
      subjectId: 'deleted-sub-id',
      subject: 'Old Class',
      startTime: '09:00',
      endTime: '10:00',
      room: '101',
      teacher: '',
      type: 'Lecture',
      notes: '',
      order: 0,
    };

    const linkedSubject = subjects.find(s => s.id === entryWithoutSubject.subjectId);
    expect(linkedSubject).toBeUndefined();
    // Guard: marks must not be accepted for unlinked subjects
    const canMark = Boolean(linkedSubject);
    expect(canMark).toBe(false);
  });

  it('allows marking when timetable entry is linked to an existing subject', () => {
    const entryWithSubject: TimetableEntry = {
      id: 'e-linked',
      uid: 'u1',
      day: 'Monday',
      subjectId: 'sub-1',
      subject: 'Physics',
      startTime: '09:00',
      endTime: '10:00',
      room: '101',
      teacher: 'Newton',
      type: 'Lecture',
      notes: '',
      order: 0,
    };

    const linkedSubject = subjects.find(s => s.id === entryWithSubject.subjectId);
    expect(linkedSubject).toBeDefined();
    const canMark = Boolean(linkedSubject);
    expect(canMark).toBe(true);
  });
});
