import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import React from 'react';
import { MonthlyAttendance } from '../components/MonthlyAttendance';
import type { Attendance, Subject, TimetableEntry } from '../types';

describe('Monthly Attendance Dashboard', () => {
  afterEach(() => {
    cleanup();
  });

  const mockSubjects: Subject[] = [
    {
      id: 'sub-algo',
      uid: 'user1',
      name: 'Algorithms',
      code: 'CS201',
      teacher: 'Dr. Turing',
      room: 'Lab 1',
      color: '#6d5dfc',
      target: 75,
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'sub-db',
      uid: 'user1',
      name: 'Database Systems',
      code: 'CS202',
      teacher: 'Dr. Codd',
      room: 'Hall B',
      color: '#20c997',
      target: 80,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ];

  // Records for September 2026
  const mockRecords: Attendance[] = [
    // Sep 1: Algorithms present
    { id: 'r1', uid: 'user1', subjectId: 'sub-algo', date: '2026-09-01', sessionId: 'manual', status: 'present', updatedAt: '' },
    // Sep 2: Algorithms absent
    { id: 'r2', uid: 'user1', subjectId: 'sub-algo', date: '2026-09-02', sessionId: 'manual', status: 'absent', updatedAt: '' },
    // Sep 3: DB present
    { id: 'r3', uid: 'user1', subjectId: 'sub-db', date: '2026-09-03', sessionId: 'manual', status: 'present', updatedAt: '' },
    // Sep 4: DB present & Algorithms absent -> mixed day
    { id: 'r4', uid: 'user1', subjectId: 'sub-db', date: '2026-09-04', sessionId: 'manual', status: 'present', updatedAt: '' },
    { id: 'r5', uid: 'user1', subjectId: 'sub-algo', date: '2026-09-04', sessionId: 'manual', status: 'absent', updatedAt: '' },
    // Sep 5: Cancelled class (should not count as held or absent)
    { id: 'r6', uid: 'user1', subjectId: 'sub-algo', date: '2026-09-05', sessionId: 'manual', status: 'cancelled', updatedAt: '' },
    // Record from August (should not affect September stats)
    { id: 'r7', uid: 'user1', subjectId: 'sub-algo', date: '2026-08-25', sessionId: 'manual', status: 'present', updatedAt: '' }
  ];

  const mockTable: TimetableEntry[] = [
    {
      id: 't1',
      uid: 'user1',
      day: 'Tuesday',
      subjectId: 'sub-algo',
      subject: 'Algorithms',
      startTime: '09:00',
      endTime: '10:00',
      room: 'Lab 1',
      teacher: 'Dr. Turing',
      type: 'Lecture',
      notes: '',
      order: 0
    }
  ];

  it('renders Monthly Attendance header with month navigation and export button', () => {
    const onExportExcel = vi.fn();
    render(
      <MonthlyAttendance
        subjects={mockSubjects}
        records={mockRecords}
        table={mockTable}
        onExportExcel={onExportExcel}
      />
    );

    expect(screen.getByText('Monthly Attendance')).toBeDefined();
    expect(screen.getByRole('button', { name: /Previous month/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Next month/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Export Attendance to Excel/i })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Export Attendance to Excel/i }));
    expect(onExportExcel).toHaveBeenCalledTimes(1);
  });

  it('calculates monthly summary cards dynamically (Present, Absent, Total Held, Percentage)', () => {
    const { container } = render(
      <MonthlyAttendance
        subjects={mockSubjects}
        records={mockRecords}
        table={mockTable}
        onExportExcel={() => {}}
      />
    );

    // Query specifically within the summary cards section
    const summaryCards = container.querySelector('.monthly-summary-cards');
    expect(summaryCards).toBeDefined();
    const sw = within(summaryCards as HTMLElement);

    // In September: 5 held classes (3 present: r1, r3, r4; 2 absent: r2, r5; 1 cancelled: r6 excluded)
    // Percentage = (3 / 5) * 100 = 60.0%
    const totalClassesCard = sw.getByText('Total Classes').parentElement;
    expect(totalClassesCard?.textContent).toContain('5');

    const presentCard = sw.getByText('Present').parentElement;
    expect(presentCard?.textContent).toContain('3');

    const absentCard = sw.getByText('Absent').parentElement;
    expect(absentCard?.textContent).toContain('2');

    const rateCard = sw.getByText('Attendance').parentElement;
    expect(rateCard?.textContent).toContain('60.0%');
  });

  it('handles empty months gracefully without NaN', () => {
    const { container } = render(
      <MonthlyAttendance
        subjects={mockSubjects}
        records={[]}
        table={mockTable}
        onExportExcel={() => {}}
      />
    );

    const summaryCards = container.querySelector('.monthly-summary-cards');
    const sw = within(summaryCards as HTMLElement);

    const totalClassesCard = sw.getByText('Total Classes').parentElement;
    expect(totalClassesCard?.textContent).toContain('0');

    const rateCard = sw.getByText('Attendance').parentElement;
    expect(rateCard?.textContent).toContain('0.0%');
    expect(rateCard?.textContent).not.toContain('NaN');
  });

  it('navigates between months and updates calendar view', () => {
    const { container } = render(
      <MonthlyAttendance
        subjects={mockSubjects}
        records={mockRecords}
        table={mockTable}
        onExportExcel={() => {}}
      />
    );

    const prevBtn = screen.getByRole('button', { name: /Previous month/i });
    fireEvent.click(prevBtn); // Moves from September to August 2026

    const summaryCards = container.querySelector('.monthly-summary-cards');
    const sw = within(summaryCards as HTMLElement);

    // In August, we have 1 present class (r7)
    const totalClassesCard = sw.getByText('Total Classes').parentElement;
    expect(totalClassesCard?.textContent).toContain('1');

    const presentCard = sw.getByText('Present').parentElement;
    expect(presentCard?.textContent).toContain('1');

    const rateCard = sw.getByText('Attendance').parentElement;
    expect(rateCard?.textContent).toContain('100.0%');
  });

  it('displays subject-wise monthly attendance cards and progress bars', () => {
    render(
      <MonthlyAttendance
        subjects={mockSubjects}
        records={mockRecords}
        table={mockTable}
        onExportExcel={() => {}}
      />
    );

    expect(screen.getByText('Subject-wise Monthly Attendance')).toBeDefined();

    // Algorithms in Sep: 1 present, 2 absent, total 3 -> 33%
    expect(screen.getByText('Algorithms')).toBeDefined();
    expect(screen.getByText('33%')).toBeDefined();

    // Database Systems in Sep: 2 present, 0 absent, total 2 -> 100%
    expect(screen.getByText('Database Systems')).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('supports selecting a date without modifying attendance data', () => {
    render(
      <MonthlyAttendance
        subjects={mockSubjects}
        records={mockRecords}
        table={mockTable}
        onExportExcel={() => {}}
      />
    );

    // Click on date cell for September 4 (mixed day)
    const cellBtn = screen.getByRole('button', { name: /2026-09-04: mixed attendance/i });
    expect(cellBtn).toBeDefined();

    fireEvent.click(cellBtn);

    // Selected detail should display 1 present · 1 absent (2 total classes)
    expect(screen.getByText(/1 present · 1 absent \(2 total classes\)/i)).toBeDefined();
    expect(screen.getByText('Mixed Day')).toBeDefined();

    // Verify mockRecords array was not mutated
    expect(mockRecords.length).toBe(7);
  });
});
