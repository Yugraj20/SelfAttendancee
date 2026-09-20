import { describe, it, expect } from 'vitest';
import { matchSubject } from '../attendance-import';
import type { Subject } from '../types';

describe('BUG-018: matchSubject scoring, tie-breaking, and symbol preservation', () => {
  const makeSubject = (id: string, name: string, code: string): Subject => ({
    id,
    uid: 'u1',
    name,
    code,
    teacher: '',
    room: '',
    color: '#000',
    target: 75,
    createdAt: '',
  });

  it('preserves symbols in C, C++, and C# without collision', () => {
    const subjects = [
      makeSubject('s-c', 'C Programming', 'CS101'),
      makeSubject('s-cpp', 'C++ Programming', 'CS102'),
      makeSubject('s-csharp', 'C# Programming', 'CS103'),
    ];

    expect(matchSubject('C++', '', subjects).id).toBe('s-cpp');
    expect(matchSubject('C#', '', subjects).id).toBe('s-csharp');
    expect(matchSubject('C', '', subjects).id).toBe('s-c');
  });

  it('returns none when candidates are tied: "Physics" vs [Physics Lab, Engineering Physics]', () => {
    const subjects = [
      makeSubject('s1', 'Physics Lab', 'PHY101L'),
      makeSubject('s2', 'Engineering Physics', 'PHY101'),
    ];

    const res = matchSubject('Physics', '', subjects);
    expect(res.kind).toBe('none');
    expect(res.id).toBe('');
  });

  it('returns none when candidates are tied: "Mathematics" vs [Mathematics I, Mathematics II]', () => {
    const subjects = [
      makeSubject('s1', 'Mathematics I', 'MTH101'),
      makeSubject('s2', 'Mathematics II', 'MTH102'),
    ];

    const res = matchSubject('Mathematics', '', subjects);
    expect(res.kind).toBe('none');
    expect(res.id).toBe('');
  });

  it('returns none for ambiguous partial matches: "Eng" vs [English, Engineering]', () => {
    const subjects = [
      makeSubject('s1', 'English Literature', 'ENG101'),
      makeSubject('s2', 'Engineering Mechanics', 'ENG102'),
    ];

    const res = matchSubject('Eng', '', subjects);
    expect(res.kind).toBe('none');
    expect(res.id).toBe('');
  });

  it('returns exact match when unambiguous', () => {
    const subjects = [
      makeSubject('s1', 'Operating Systems', 'CS401'),
      makeSubject('s2', 'Database Systems', 'CS402'),
    ];

    const res = matchSubject('Operating Systems', 'CS401', subjects);
    expect(res.kind).toBe('name');
    expect(res.id).toBe('s1');
  });
});
