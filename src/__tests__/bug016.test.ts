import { describe, it, expect } from 'vitest';
import { validateAttendanceResponse, validateTimetableResponse } from '../gemini';

describe('BUG-016 & BUG-015: Gemini JSON schema validation and normalization', () => {
  it('validates timetable response, normalizing day names ("Mon" -> "Monday") and times ("9:00" -> "09:00")', () => {
    const raw = {
      timetable: [
        null,
        { day: 'Mon', startTime: '9:00', endTime: '10:00', subject: 'Math', type: 'Lecture' },
        { day: 'Friday', startTime: '14:00', endTime: '15:00', subject: 'Physics', type: 'Lab' },
        'not an object',
        { day: 'Funday', startTime: '99:99', endTime: '10:00', subject: 'Bad Day' },
      ],
    };

    const res = validateTimetableResponse(raw);
    expect(res.entries).toHaveLength(3); // null and string dropped, 3 object entries kept
    expect(res.entries[0].day).toBe('Monday');
    expect(res.entries[0].startTime).toBe('09:00');
    expect(res.entries[1].day).toBe('Friday');
    expect(res.entries[1].startTime).toBe('14:00');
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('validates attendance response, dropping nulls and coercing invalid enums to unknown', () => {
    const raw = {
      records: [
        null,
        { subject: 'Math', date: '2026-03-01', status: 'present', confidence: 'high' },
        { subject: 123, date: 'invalid-date', status: 'maybe', confidence: 'unsure' },
      ],
      warnings: ['Some model warning'],
    };

    const res = validateAttendanceResponse(raw);
    expect(res.records).toHaveLength(2);
    expect(res.records[0].subject).toBe('Math');
    expect(res.records[0].status).toBe('present');
    expect(res.records[0].confidence).toBe('high');

    expect(typeof res.records[1].subject).toBe('string');
    expect(res.records[1].status).toBe('unknown');
    expect(res.records[1].confidence).toBe('low');
  });
});
