import { describe, it, expect } from 'vitest';
import {
  validISO,
  matchSubject,
  analyse,
  annotate,
  willImport,
  summarise,
  buildWrites,
} from '../attendance-import';
import type { Attendance, ParsedAttendance, Subject, SubjectGroup } from '../types';

describe('attendance-import.ts characterization tests (current behavior)', () => {
  const subjects: Subject[] = [
    {
      id: 'sub-1',
      uid: 'u1',
      name: 'Computer Organisation and Architecture',
      code: 'CS201',
      teacher: '',
      room: '',
      color: '#ff0000',
      target: 75,
      createdAt: '2026-01-01',
    },
    {
      id: 'sub-2',
      uid: 'u1',
      name: 'Physics Lab',
      code: 'PH102',
      teacher: '',
      room: '',
      color: '#00ff00',
      target: 75,
      createdAt: '2026-01-01',
    },
    {
      id: 'sub-3',
      uid: 'u1',
      name: 'Engineering Physics',
      code: 'PH101',
      teacher: '',
      room: '',
      color: '#0000ff',
      target: 75,
      createdAt: '2026-01-01',
    },
  ];

  describe('validISO', () => {
    it('accepts valid dates in 1990-2100', () => {
      expect(validISO('2026-03-15')).toBe(true);
      expect(validISO('2024-02-29')).toBe(true); // leap year
    });

    it('rejects invalid dates and bad formats', () => {
      expect(validISO('2026-02-29')).toBe(false); // non-leap year
      expect(validISO('2026-04-31')).toBe(false); // April has 30 days
      expect(validISO('2026-13-01')).toBe(false);
      expect(validISO('not-a-date')).toBe(false);
      expect(validISO('1989-12-31')).toBe(false);
      expect(validISO('2101-01-01')).toBe(false);
    });
  });

  describe('matchSubject', () => {
    it('matches exact name', () => {
      const res = matchSubject('Computer Organisation and Architecture', '', subjects);
      expect(res).toEqual({ id: 'sub-1', kind: 'name' });
    });

    it('matches exact code', () => {
      const res = matchSubject('', 'CS201', subjects);
      expect(res).toEqual({ id: 'sub-1', kind: 'code' });
    });

    it('matches acronym', () => {
      const res = matchSubject('coa', '', subjects);
      expect(res).toEqual({ id: 'sub-1', kind: 'abbreviation' });
    });

    it('matches partial name overlap', () => {
      // "Engineering Physics Advanced" shares words with "Engineering Physics"
      const res = matchSubject('Engineering Physics Advanced', '', subjects);
      expect(res).toEqual({ id: 'sub-3', kind: 'partial' });
    });

    it('returns none when query does not match', () => {
      const res = matchSubject('Nonexistent Subject', 'NO123', subjects);
      expect(res).toEqual({ id: '', kind: 'none' });
    });

    it('returns none for empty query or empty subjects', () => {
      expect(matchSubject('', '', subjects)).toEqual({ id: '', kind: 'none' });
      expect(matchSubject('Math', '', [])).toEqual({ id: '', kind: 'none' });
    });

    it('returns none when candidates tie instead of picking first-hit (BUG-018)', () => {
      // "Physics" ties between "Physics Lab" and "Engineering Physics", returning none to prompt user selection
      const res = matchSubject('Physics', '', subjects);
      expect(res).toEqual({ id: '', kind: 'none' });
    });
  });

  describe('analyse', () => {
    it('groups records by compact name/code and resolves match', () => {
      const parsed: ParsedAttendance = {
        records: [
          { subject: 'COA', date: '2026-03-01', status: 'present', confidence: 'high' },
          { subject: 'COA', date: '2026-03-02', status: 'absent', confidence: 'low' },
          { subject: 'Chemistry', date: '2026-03-01', status: 'present', confidence: 'high' },
        ],
        warnings: [],
        truncated: false,
      };
      const groups = analyse(parsed, subjects);
      expect(groups).toHaveLength(2);

      const coaGroup = groups.find(g => g.name === 'COA')!;
      expect(coaGroup.action).toBe('link');
      expect(coaGroup.matchId).toBe('sub-1');
      expect(coaGroup.rows).toHaveLength(2);
      // BUG-014: low confidence row defaults to include: false
      expect(coaGroup.rows[1].low).toBe(true);
      expect(coaGroup.rows[1].include).toBe(false);

      const chemGroup = groups.find(g => g.name === 'Chemistry')!;
      expect(chemGroup.action).toBe('create');
      expect(chemGroup.matchId).toBe('');
    });
  });

  describe('annotate', () => {
    it('flags duplicates, conflicts against existing data, and format errors', () => {
      const groups: SubjectGroup[] = [
        {
          key: 'coa|',
          label: 'COA',
          name: 'COA',
          code: '',
          matchId: 'sub-1',
          matchKind: 'abbreviation',
          action: 'link',
          rows: [
            { key: 'r0', subjectKey: 'coa|', label: 'COA', date: '2026-03-01', status: 'present', issue: 'none', note: '', source: '', low: false, include: true },
            { key: 'r1', subjectKey: 'coa|', label: 'COA', date: '2026-03-02', status: 'absent', issue: 'none', note: '', source: '', low: false, include: true },
            { key: 'r2', subjectKey: 'coa|', label: 'COA', date: '2026-03-01', status: 'present', issue: 'none', note: '', source: '', low: false, include: true },
            { key: 'r3', subjectKey: 'coa|', label: 'COA', date: 'invalid-date', status: 'present', issue: 'none', note: '', source: '', low: false, include: true },
          ],
        },
      ];

      const existing: Attendance[] = [
        // 2026-03-01 is already recorded as 'present' -> duplicate
        { id: 'att-1', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'manual', status: 'present', updatedAt: '' },
        // 2026-03-02 is already recorded as 'present', but import has 'absent' -> conflict
        { id: 'att-2', uid: 'u1', subjectId: 'sub-1', date: '2026-03-02', sessionId: 'manual', status: 'present', updatedAt: '' },
      ];

      const annotated = annotate(groups, existing);
      const rows = annotated[0].rows;

      expect(rows[0].issue).toBe('duplicate');
      expect(rows[0].existingStatus).toBe('present');

      expect(rows[1].issue).toBe('conflict');
      expect(rows[1].existingStatus).toBe('present');

      // Duplicate within batch
      expect(rows[2].issue).toBe('duplicate');

      // Bad date format
      expect(rows[3].issue).toBe('bad-date');
    });
  });

  describe('willImport and summarise', () => {
    it('determines import eligibility based on issue, action, and overwrite flag', () => {
      const cleanRow = { key: 'r0', subjectKey: 'k', label: 'L', date: '2026-03-01', status: 'present' as const, issue: 'none' as const, note: '', source: '', low: false, include: true };
      const conflictRow = { ...cleanRow, issue: 'conflict' as const };
      const dupRow = { ...cleanRow, issue: 'duplicate' as const };
      const excludedRow = { ...cleanRow, include: false };

      expect(willImport(cleanRow, 'link', false)).toBe(true);
      expect(willImport(cleanRow, 'skip', false)).toBe(false);
      expect(willImport(excludedRow, 'link', false)).toBe(false);

      expect(willImport(conflictRow, 'link', false)).toBe(false);
      expect(willImport(conflictRow, 'link', true)).toBe(true);

      expect(willImport(dupRow, 'link', true)).toBe(false);
    });

    it('summarises groups correctly', () => {
      const groups: SubjectGroup[] = [
        {
          key: 'coa|',
          label: 'COA',
          name: 'COA',
          code: '',
          matchId: 'sub-1',
          matchKind: 'abbreviation',
          action: 'link',
          rows: [
            { key: 'r0', subjectKey: 'coa|', label: 'COA', date: '2026-03-01', status: 'present', issue: 'none', note: '', source: '', low: false, include: true },
            { key: 'r1', subjectKey: 'coa|', label: 'COA', date: '2026-03-02', status: 'absent', issue: 'conflict', note: '', source: '', low: false, include: true },
          ],
        },
      ];

      const summaryWithoutOverwrite = summarise(groups, false);
      expect(summaryWithoutOverwrite.ready).toBe(1);
      expect(summaryWithoutOverwrite.conflicts).toBe(1);
      expect(summaryWithoutOverwrite.dropped).toBe(1);

      const summaryWithOverwrite = summarise(groups, true);
      expect(summaryWithOverwrite.ready).toBe(2);
      expect(summaryWithOverwrite.conflicts).toBe(1);
      expect(summaryWithOverwrite.dropped).toBe(0);
    });
  });

  describe('buildWrites', () => {
    it('creates subjects and records with correct IDs', () => {
      const groups: SubjectGroup[] = [
        {
          key: 'new-sub|',
          label: 'New Subject',
          name: 'New Subject',
          code: '',
          matchId: '',
          matchKind: 'none',
          action: 'create',
          rows: [
            { key: 'r0', subjectKey: 'new-sub|', label: 'New Subject', date: '2026-03-01', status: 'present', issue: 'none', note: '', source: '', low: false, include: true },
          ],
        },
      ];

      const writes = buildWrites(groups, {
        uid: 'u1',
        defaultTarget: 80,
        colors: ['#123456'],
        subjects: [],
        existing: [],
        overwrite: false,
      });

      expect(writes.subjects).toHaveLength(1);
      expect(writes.subjects[0].name).toBe('New Subject');
      expect(writes.subjects[0].target).toBe(80);
      expect(writes.records).toHaveLength(1);
      expect(writes.records[0].subjectId).toBe(writes.subjects[0].id);
      expect(writes.records[0].status).toBe('present');
    });

    it('documents BUG-006 where overwrite only matches sessionId === "manual"', () => {
      const groups: SubjectGroup[] = [
        {
          key: 'sub-1|',
          label: 'COA',
          name: 'COA',
          code: '',
          matchId: 'sub-1',
          matchKind: 'name',
          action: 'link',
          rows: [
            { key: 'r0', subjectKey: 'sub-1|', label: 'COA', date: '2026-03-01', status: 'absent', issue: 'conflict', note: '', source: '', low: false, include: true },
          ],
        },
      ];

      // Existing record has a timetable sessionId, e.g. 'entry-123'
      const existing: Attendance[] = [
        { id: 'att-existing-timetable', uid: 'u1', subjectId: 'sub-1', date: '2026-03-01', sessionId: 'entry-123', status: 'present', updatedAt: '' },
      ];

      const writes = buildWrites(groups, {
        uid: 'u1',
        defaultTarget: 75,
        colors: ['#123456'],
        subjects,
        existing,
        overwrite: true,
      });

      // Today, prior is searched for `${subjectId}|${row.date}|manual`, which fails to find att-existing-timetable.
      // So a brand new ID is generated instead of att-existing-timetable's ID!
      expect(writes.records[0].id).not.toBe('att-existing-timetable');
    });
  });
});
