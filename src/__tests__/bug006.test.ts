import { describe, it, expect } from 'vitest';
import { annotate, buildWrites, willImport } from '../attendance-import';
import type { Attendance, Subject, SubjectGroup } from '../types';

describe('BUG-006: Replace with file overwrites existing timetable sessionId in place', () => {
  const subject: Subject = {
    id: 'sub-net',
    uid: 'u1',
    name: 'Networking',
    code: 'NET101',
    teacher: '',
    room: '',
    color: '#000',
    target: 75,
    createdAt: '',
  };

  it('existing present (sessionId=entry-1) + import absent with overwrite -> exactly 1 record, absent', () => {
    const existing: Attendance[] = [
      {
        id: 'existing-rec-id',
        uid: 'u1',
        subjectId: 'sub-net',
        date: '2026-03-05',
        sessionId: 'timetable-entry-1',
        status: 'present',
        updatedAt: '2026-03-05T09:00:00.000Z',
      },
    ];

    const group: SubjectGroup = {
      key: 'networking',
      label: 'Networking',
      name: 'Networking',
      code: 'NET101',
      matchId: 'sub-net',
      matchKind: 'name',
      action: 'link',
      rows: [
        {
          key: 'r0',
          subjectKey: 'networking',
          label: 'Networking',
          date: '2026-03-05',
          status: 'absent',
          issue: 'none',
          note: '',
          source: '',
          low: false,
          include: true,
        },
      ],
    };

    const annotated = annotate([group], existing);
    const row = annotated[0].rows[0];
    expect(row.issue).toBe('conflict');
    expect(row.existingId).toBe('existing-rec-id');
    expect(row.existingSessionId).toBe('timetable-entry-1');

    const writes = buildWrites(annotated, {
      uid: 'u1',
      defaultTarget: 75,
      colors: ['#000'],
      subjects: [subject],
      existing,
      overwrite: true,
    });

    expect(writes.records).toHaveLength(1);
    expect(writes.records[0].id).toBe('existing-rec-id');
    expect(writes.records[0].sessionId).toBe('timetable-entry-1');
    expect(writes.records[0].status).toBe('absent');
  });
});
