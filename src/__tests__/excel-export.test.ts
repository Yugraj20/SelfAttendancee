import { describe, it, expect, vi } from 'vitest';
import type { Attendance, Subject, TimetableEntry } from '../types';

// Mock xlsx module
vi.mock('xlsx', async () => {
  const actual = await vi.importActual<typeof import('xlsx')>('xlsx');
  return {
    ...actual,
    writeFile: vi.fn()
  };
});

import * as XLSX from 'xlsx';
import { exportAttendanceToExcel } from '../excel-export';

describe('Excel Attendance Export Service', () => {
  const mockSubjects: Subject[] = [
    {
      id: 'sub1',
      uid: 'u1',
      name: 'Data Structures',
      code: 'CS101',
      teacher: 'Prof. Cormen',
      room: 'Room 201',
      color: '#6d5dfc',
      target: 75,
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'sub2',
      uid: 'u1',
      name: 'Web Technologies',
      code: 'CS102',
      teacher: 'Prof. Berners-Lee',
      room: 'Lab 3',
      color: '#20c997',
      target: 80,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ];

  const mockRecords: Attendance[] = [
    { id: 'r1', uid: 'u1', subjectId: 'sub1', date: '2026-09-02', sessionId: 'manual', status: 'present', updatedAt: '' },
    { id: 'r2', uid: 'u1', subjectId: 'sub1', date: '2026-09-03', sessionId: 'manual', status: 'absent', updatedAt: '' },
    { id: 'r3', uid: 'u1', subjectId: 'sub2', date: '2026-09-04', sessionId: 'manual', status: 'present', updatedAt: '' },
    { id: 'r4', uid: 'u1', subjectId: 'sub1', date: '2026-09-05', sessionId: 'manual', status: 'cancelled', updatedAt: '' },
    { id: 'r5', uid: 'u1', subjectId: 'sub1', date: '2026-08-10', sessionId: 'manual', status: 'present', updatedAt: '' }
  ];

  const mockTable: TimetableEntry[] = [
    {
      id: 't1',
      uid: 'u1',
      day: 'Wednesday',
      subjectId: 'sub1',
      subject: 'Data Structures',
      startTime: '10:00',
      endTime: '11:00',
      room: 'Room 201',
      teacher: 'Prof. Cormen',
      type: 'Lecture',
      notes: '',
      order: 0
    }
  ];

  it('exports selected month with correct filename and filtered count', () => {
    const res = exportAttendanceToExcel({
      subjects: mockSubjects,
      records: mockRecords,
      table: mockTable,
      options: {
        studentName: 'Alice',
        studentEmail: 'alice@example.com',
        rangeType: 'month',
        selectedYear: 2026,
        selectedMonth: 8, // September (0-indexed 8)
        includeSummary: true,
        includeDetailed: true,
        includeMonthly: true
      }
    });

    expect(res.success).toBe(true);
    expect(res.filename).toBe('SelfAttendancee_Monthly_September_2026.xlsx');
    // In September: r1, r2, r3, r4 (4 records total, r5 is in August)
    expect(res.recordCount).toBe(4);
    expect(XLSX.writeFile).toHaveBeenCalled();
  });

  it('filters by individual subject when subjectId is specified', () => {
    const res = exportAttendanceToExcel({
      subjects: mockSubjects,
      records: mockRecords,
      table: mockTable,
      options: {
        rangeType: 'month',
        selectedYear: 2026,
        selectedMonth: 8,
        subjectId: 'sub2', // Only Web Technologies
        includeSummary: true,
        includeDetailed: true,
        includeMonthly: true
      }
    });

    expect(res.success).toBe(true);
    // In September for sub2, only r3
    expect(res.recordCount).toBe(1);
  });

  it('exports custom date range with appropriate filename', () => {
    const res = exportAttendanceToExcel({
      subjects: mockSubjects,
      records: mockRecords,
      table: mockTable,
      options: {
        rangeType: 'custom',
        selectedYear: 2026,
        selectedMonth: 8,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        includeSummary: true,
        includeDetailed: true,
        includeMonthly: true
      }
    });

    expect(res.success).toBe(true);
    expect(res.filename).toBe('SelfAttendancee_Attendance_2026-08-01_to_2026-08-31.xlsx');
    // In August: r5 only
    expect(res.recordCount).toBe(1);
  });

  it('exports all records without error when rangeType is all', () => {
    const res = exportAttendanceToExcel({
      subjects: mockSubjects,
      records: mockRecords,
      table: mockTable,
      options: {
        rangeType: 'all',
        selectedYear: 2026,
        selectedMonth: 8,
        includeSummary: true,
        includeDetailed: true,
        includeMonthly: true
      }
    });

    expect(res.success).toBe(true);
    expect(res.filename).toContain('SelfAttendancee_Full_Attendance');
    expect(res.recordCount).toBe(5);
  });

  it('handles empty records cleanly without throwing', () => {
    const res = exportAttendanceToExcel({
      subjects: mockSubjects,
      records: [],
      table: mockTable,
      options: {
        rangeType: 'month',
        selectedYear: 2026,
        selectedMonth: 8,
        includeSummary: true,
        includeDetailed: true,
        includeMonthly: true
      }
    });

    expect(res.success).toBe(true);
    expect(res.recordCount).toBe(0);
  });

  it('does not mutate or alter original attendance records during export', () => {
    const originalLength = mockRecords.length;
    const originalFirstRecord = { ...mockRecords[0] };

    exportAttendanceToExcel({
      subjects: mockSubjects,
      records: mockRecords,
      table: mockTable,
      options: {
        rangeType: 'all',
        selectedYear: 2026,
        selectedMonth: 8,
        includeSummary: true,
        includeDetailed: true,
        includeMonthly: true
      }
    });

    expect(mockRecords.length).toBe(originalLength);
    expect(mockRecords[0]).toEqual(originalFirstRecord);
  });
});
