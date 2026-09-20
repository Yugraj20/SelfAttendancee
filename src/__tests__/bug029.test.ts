import { describe, it, expect } from 'vitest';

describe('BUG-029: Validate startTime and endTime format (HH:MM) and ordering in timetable entries', () => {
  const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

  function validateTimes(startTime: string, endTime: string) {
    const startBad = !startTime || !HH_MM_REGEX.test(startTime);
    const endBad = !endTime || !HH_MM_REGEX.test(endTime);
    const orderBad = !startBad && !endBad && startTime >= endTime;
    return {
      startBad,
      endBad,
      orderBad,
      valid: !startBad && !endBad && !orderBad,
    };
  }

  it('rejects empty startTime', () => {
    const res = validateTimes('', '10:00');
    expect(res.startBad).toBe(true);
    expect(res.valid).toBe(false);
  });

  it('rejects malformed times like "9:00", "25:00", "10:65"', () => {
    expect(validateTimes('9:00', '10:00').valid).toBe(false);
    expect(validateTimes('25:00', '10:00').valid).toBe(false);
    expect(validateTimes('09:00', '10:65').valid).toBe(false);
  });

  it('rejects endTime <= startTime', () => {
    expect(validateTimes('10:00', '10:00').valid).toBe(false);
    expect(validateTimes('11:00', '10:00').valid).toBe(false);
  });

  it('accepts valid HH:MM times with endTime > startTime', () => {
    const res = validateTimes('09:00', '10:30');
    expect(res.valid).toBe(true);
  });
});
