import { describe, it, expect } from 'vitest';
import { subjectStats } from '../math';
import type { Attendance, Subject, TimetableEntry } from '../types';

describe('BUG-005: Independent attendance records for multiple sessions on the same day', () => {
  const subject: Subject = {
    id: 'sub-cs',
    uid: 'user-1',
    name: 'Computer Networks',
    code: 'CS301',
    teacher: 'Dr. Smith',
    room: 'Room 101',
    color: '#4f46e5',
    target: 75,
    createdAt: '2026-01-01',
  };

  const e1: TimetableEntry = {
    id: 'entry-lecture',
    uid: 'user-1',
    day: 'Monday',
    subjectId: 'sub-cs',
    subject: 'Computer Networks',
    startTime: '09:00',
    endTime: '10:00',
    room: '101',
    teacher: 'Dr. Smith',
    type: 'Lecture',
    notes: '',
    order: 0,
  };

  const e2: TimetableEntry = {
    id: 'entry-lab',
    uid: 'user-1',
    day: 'Monday',
    subjectId: 'sub-cs',
    subject: 'Computer Networks Lab',
    startTime: '11:00',
    endTime: '13:00',
    room: 'Lab 2',
    teacher: 'Dr. Smith',
    type: 'Lab',
    notes: '',
    order: 1,
  };

  // Helper matching the BUG-005 logic for finding the record for a timetable entry
  function findRecordForEntry(e: TimetableEntry, date: string, records: Attendance[], table: TimetableEntry[]) {
    return records.find(r => r.subjectId === e.subjectId && r.date === date && r.sessionId === e.id)
      ?? records.find(r => r.subjectId === e.subjectId && r.date === date && (r.sessionId === 'manual' || !table.some(t => t.id === r.sessionId)));
  }

  it('records lecture(e1) present, then lab(e2) absent as 2 distinct records, stats show 1/2', () => {
    const date = '2026-03-02'; // Monday
    const r1: Attendance = {
      id: 'att-1',
      uid: 'user-1',
      subjectId: 'sub-cs',
      date,
      sessionId: e1.id,
      status: 'present',
      updatedAt: '2026-03-02T09:05:00.000Z',
    };

    const r2: Attendance = {
      id: 'att-2',
      uid: 'user-1',
      subjectId: 'sub-cs',
      date,
      sessionId: e2.id,
      status: 'absent',
      updatedAt: '2026-03-02T11:05:00.000Z',
    };

    const records = [r1, r2];
    const table = [e1, e2];

    expect(records).toHaveLength(2);
    expect(findRecordForEntry(e1, date, records, table)?.status).toBe('present');
    expect(findRecordForEntry(e2, date, records, table)?.status).toBe('absent');

    const stats = subjectStats(subject, records);
    expect(stats.total).toBe(2);
    expect(stats.present).toBe(1);
    expect(stats.absent).toBe(1);
  });
});
