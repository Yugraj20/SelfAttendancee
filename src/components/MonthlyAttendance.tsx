import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Calendar as CalendarIcon,
  RotateCcw,
  Clock3,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  AlertTriangle
} from 'lucide-react';
import type { Attendance, Subject, TimetableEntry } from '../types';
import { DAYS } from '../types';

interface MonthlyAttendanceProps {
  subjects: Subject[];
  records: Attendance[];
  table: TimetableEntry[];
  onExportExcel: () => void;
  onSelectDateDetails?: (date: string) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function MonthlyAttendance({
  subjects,
  records,
  table,
  onExportExcel
}: MonthlyAttendanceProps) {
  const today = new Date();
  const todayISO = today.toLocaleDateString('en-CA');

  // Prefer the latest recorded attendance month as the initial view.
  // The explicit "This Month" action still returns to the current calendar month.
  const validSubjectIds = useMemo(() => new Set(subjects.map(s => s.id)), [subjects]);
  const initialView = useMemo(() => {
    const latestDate = records
      .filter(r => validSubjectIds.has(r.subjectId) && Boolean(r.date))
      .map(r => r.date)
      .sort()
      .at(-1);

    if (!latestDate) {
      return { year: today.getFullYear(), month: today.getMonth() };
    }

    const [year, month] = latestDate.split('-').map(Number);
    return {
      year: Number.isFinite(year) ? year : today.getFullYear(),
      month: Number.isFinite(month) ? month - 1 : today.getMonth()
    };
  }, [records, validSubjectIds, today]);

  const [selectedYear, setSelectedYear] = useState<number>(() => initialView.year);
  const [selectedMonth, setSelectedMonth] = useState<number>(() => initialView.month);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);

  // Month navigation
  const prevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const jumpToThisMonth = () => {
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth());
    setSelectedDate(todayISO);
  };


  // Filter records for the selected month (format YYYY-MM)
  const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const monthRecords = useMemo(() => {
    return records.filter(
      r => validSubjectIds.has(r.subjectId) && r.date.startsWith(monthPrefix)
    );
  }, [records, validSubjectIds, monthPrefix]);

  // Held records: only 'present' and 'absent'. Exclude 'cancelled' and 'unmarked'.
  const heldRecords = useMemo(() => {
    return monthRecords.filter(r => r.status === 'present' || r.status === 'absent');
  }, [monthRecords]);

  const totalClasses = heldRecords.length;
  const presentClasses = heldRecords.filter(r => r.status === 'present').length;
  const absentClasses = heldRecords.filter(r => r.status === 'absent').length;
  const attendancePercentage = totalClasses > 0 ? (presentClasses / totalClasses) * 100 : 0;

  // Calendar dates computation
  // Month: first day and number of days in month (handles leap years correctly)
  const firstDay = new Date(selectedYear, selectedMonth, 1);
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  // Monday is 0, Sunday is 6
  const offset = (firstDay.getDay() + 6) % 7;

  // Grid dates: empty strings for preceding offset, then YYYY-MM-DD
  const calendarCells = useMemo(() => {
    const cells: { dateStr: string; dayNum: number }[] = [];
    for (let i = 0; i < offset; i++) {
      cells.push({ dateStr: '', dayNum: 0 });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      cells.push({ dateStr: dStr, dayNum: d });
    }
    return cells;
  }, [offset, daysInMonth, monthPrefix]);

  // Map each date to attendance indicator
  // Indicators: 'present' (only present), 'absent' (only absent), 'mixed' (both present & absent), 'none'
  const dateIndicatorMap = useMemo(() => {
    const map = new Map<string, 'present' | 'absent' | 'mixed' | 'none'>();

    // Group month held records by date
    const dateGroups = new Map<string, { present: number; absent: number }>();
    heldRecords.forEach(r => {
      const cur = dateGroups.get(r.date) || { present: 0, absent: 0 };
      if (r.status === 'present') cur.present++;
      if (r.status === 'absent') cur.absent++;
      dateGroups.set(r.date, cur);
    });

    dateGroups.forEach((val, dateStr) => {
      if (val.present > 0 && val.absent > 0) {
        map.set(dateStr, 'mixed');
      } else if (val.present > 0) {
        map.set(dateStr, 'present');
      } else if (val.absent > 0) {
        map.set(dateStr, 'absent');
      }
    });

    return map;
  }, [heldRecords]);

  // Selected date details
  const selectedDateRecords = useMemo(() => {
    return monthRecords.filter(r => r.date === selectedDate);
  }, [monthRecords, selectedDate]);

  const selectedDateHeld = selectedDateRecords.filter(
    r => r.status === 'present' || r.status === 'absent'
  );
  const selectedDatePresent = selectedDateHeld.filter(r => r.status === 'present').length;
  const selectedDateAbsent = selectedDateHeld.filter(r => r.status === 'absent').length;

  const selectedDateObj = new Date(selectedDate + 'T12:00:00');
  const selectedDateFormatted = !isNaN(selectedDateObj.getTime())
    ? selectedDateObj.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : selectedDate;

  // Selected date weekday for timetable matching
  const selectedDayName = !isNaN(selectedDateObj.getTime())
    ? DAYS[(selectedDateObj.getDay() + 6) % 7]
    : '';

  const timetableForSelectedDay = table
    .filter(t => t.day === selectedDayName)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Subject-wise stats for the selected month
  const subjectMonthlyStats = useMemo(() => {
    return subjects.map(s => {
      const sRecords = heldRecords.filter(r => r.subjectId === s.id);
      const total = sRecords.length;
      const present = sRecords.filter(r => r.status === 'present').length;
      const absent = total - present;
      const pct = total > 0 ? (present / total) * 100 : 0;
      return {
        subject: s,
        total,
        present,
        absent,
        pct
      };
    });
  }, [subjects, heldRecords]);

  // Historical Monthly Breakdown (past 6 months)
  const historicalMonths = useMemo(() => {
    const list: {
      key: string;
      label: string;
      total: number;
      present: number;
      absent: number;
      pct: number;
    }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(selectedYear, selectedMonth - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;

      const recs = records.filter(
        r => validSubjectIds.has(r.subjectId) && r.date.startsWith(prefix) && (r.status === 'present' || r.status === 'absent')
      );
      const tot = recs.length;
      const pres = recs.filter(r => r.status === 'present').length;
      const abs = tot - pres;
      const pct = tot > 0 ? (pres / tot) * 100 : 0;

      list.push({
        key: prefix,
        label: `${MONTH_NAMES[m].slice(0, 3)} ${y}`,
        total: tot,
        present: pres,
        absent: abs,
        pct
      });
    }

    return list;
  }, [records, validSubjectIds, selectedYear, selectedMonth]);

  // Year options for fast switcher (e.g. currentYear - 3 to currentYear + 3)
  const yearOptions = useMemo(() => {
    const cy = today.getFullYear();
    const years: number[] = [];
    for (let y = cy - 4; y <= cy + 4; y++) {
      years.push(y);
    }
    return years;
  }, [today]);

  return (
    <div className="monthly-dashboard">
      {/* 3.2 Monthly Attendance Header */}
      <section className="monthly-header-section card">
        <div className="monthly-header-top">
          <div>
            <span className="eyebrow">Academic Period View</span>
            <h2>Monthly Attendance</h2>
          </div>

          <div className="monthly-header-actions">
            <button
              type="button"
              className="btn-today-shortcut"
              onClick={jumpToThisMonth}
              aria-label="Jump to current month"
            >
              <RotateCcw size={14} />
              <span>This Month</span>
            </button>

            <button
              type="button"
              className="primary btn-export-excel"
              onClick={onExportExcel}
              aria-label="Export Attendance to Excel"
            >
              <FileSpreadsheet size={16} />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Month Selector Bar */}
        <div className="month-selector-bar">
          <button
            type="button"
            className="icon-nav-btn"
            onClick={prevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="month-year-dropdowns">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              aria-label="Select month"
              className="month-select"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx}>{name}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              aria-label="Select year"
              className="year-select"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="icon-nav-btn"
            onClick={nextMonth}
            aria-label="Next month"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </section>

      {/* 3.3 Monthly Summary Cards (4 cards) */}
      <section className="monthly-summary-cards">
        <article className="card metric-card">
          <p>Total Classes</p>
          <h2>{totalClasses}</h2>
          <span className="muted">Recorded this month</span>
        </article>

        <article className="card metric-card present-metric">
          <p>Present</p>
          <h2>{presentClasses}</h2>
          <span className="metric-tag present">Attended</span>
        </article>

        <article className="card metric-card absent-metric">
          <p>Absent</p>
          <h2>{absentClasses}</h2>
          <span className="metric-tag absent">Missed</span>
        </article>

        <article className="card metric-card rate-metric">
          <p>Attendance</p>
          <h2>{attendancePercentage.toFixed(1)}<small>%</small></h2>
          <span className="muted">{totalClasses === 0 ? 'No classes yet' : `${presentClasses} of ${totalClasses}`}</span>
        </article>
      </section>

      {/* PART 4: Monthly Attendance Calendar */}
      <section className="calendar-panel card">
        <div className="calendar-panel-header">
          <div className="panel-title-group">
            <CalendarIcon size={18} />
            <h3>{MONTH_NAMES[selectedMonth]} {selectedYear}</h3>
          </div>

          <div className="calendar-legend">
            <span className="legend-item"><i className="legend-dot dot-present" /> Present</span>
            <span className="legend-item"><i className="legend-dot dot-absent" /> Absent</span>
            <span className="legend-item"><i className="legend-dot dot-mixed" /> Mixed</span>
            <span className="legend-item"><i className="legend-dot dot-empty" /> No Class</span>
          </div>
        </div>

        {/* Monday to Sunday Grid */}
        <div className="calendar-grid-container">
          <div className="calendar-weekdays">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>

          <div className="calendar-days-grid">
            {calendarCells.map((cell, idx) => {
              if (!cell.dateStr) {
                return <div key={`empty-${idx}`} className="calendar-cell empty" />;
              }

              const indicator = dateIndicatorMap.get(cell.dateStr) || 'none';
              const isSelected = selectedDate === cell.dateStr;
              const isToday = cell.dateStr === todayISO;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  className={`calendar-cell active-cell ${isSelected ? 'selected' : ''} ${isToday ? 'is-today' : ''}`}
                  onClick={() => setSelectedDate(cell.dateStr)}
                  aria-label={`${cell.dateStr}: ${indicator} attendance`}
                  aria-pressed={isSelected}
                >
                  <span className="cell-day-num">{cell.dayNum}</span>
                  {indicator !== 'none' && (
                    <i className={`cell-indicator indicator-${indicator}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Date Attendance Details (Read-only inspection) */}
        <div className="selected-date-detail-box">
          <div className="date-detail-header">
            <div>
              <h4>{selectedDateFormatted}</h4>
              <p className="muted">
                {selectedDateHeld.length > 0
                  ? `${selectedDatePresent} present · ${selectedDateAbsent} absent (${selectedDateHeld.length} total classes)`
                  : 'No attendance recorded for this date'}
              </p>
            </div>
            {selectedDateHeld.length > 0 && (
              <span className={`date-badge ${selectedDateAbsent === 0 ? 'badge-good' : selectedDatePresent === 0 ? 'badge-bad' : 'badge-mixed'}`}>
                {selectedDateAbsent === 0 ? 'All Present' : selectedDatePresent === 0 ? 'All Absent' : 'Mixed Day'}
              </span>
            )}
          </div>

          {selectedDateRecords.length > 0 ? (
            <div className="date-classes-list">
              {selectedDateRecords.map(r => {
                const sub = subjects.find(s => s.id === r.subjectId);
                const tableEntry = table.find(t => t.id === r.sessionId);

                return (
                  <div key={r.id} className="date-class-row">
                    <span
                      className="subject-code-chip"
                      style={{ background: sub?.color || 'var(--brand)' }}
                    >
                      {(sub?.code || sub?.name || '•').slice(0, 3)}
                    </span>
                    <div className="date-class-info">
                      <b>{sub?.name || 'Unknown Subject'}</b>
                      <small className="muted">
                        {r.startTime ? `${r.startTime} - ${r.endTime}` : (tableEntry ? `${tableEntry.startTime} - ${tableEntry.endTime}` : 'Time not specified')}
                        {r.room ? ` · ${r.room}` : (tableEntry?.room ? ` · ${tableEntry.room}` : '')}
                        {r.isExtra ? ' (Extra Class)' : ''}
                      </small>
                    </div>
                    <span className={`status-pill pill-${r.status}`}>
                      {r.status === 'present' && <CheckCircle2 size={13} />}
                      {r.status === 'absent' && <XCircle size={13} />}
                      {r.status[0].toUpperCase() + r.status.slice(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : timetableForSelectedDay.length > 0 ? (
            <div className="timetable-scheduled-preview">
              <small className="muted">
                Timetable scheduled classes for {selectedDayName}:
              </small>
              <div className="preview-chip-list">
                {timetableForSelectedDay.map(t => (
                  <span key={t.id} className="preview-chip">
                    <Clock3 size={11} /> {t.subject} ({t.startTime})
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="date-empty-detail">
              <small className="muted">Select any marked date on the calendar above to inspect records.</small>
            </div>
          )}
        </div>
      </section>

      {/* PART 5: Subject-wise Monthly Attendance */}
      <section className="subject-wise-monthly-section">
        <div className="section-title">
          <div>
            <h2>Subject-wise Monthly Attendance</h2>
            <p className="muted">
              Attendance percentages calculated exclusively for {MONTH_NAMES[selectedMonth]} {selectedYear}.
            </p>
          </div>
        </div>

        {subjectMonthlyStats.length === 0 ? (
          <article className="card empty-subject-card">
            <AlertTriangle size={24} className="muted" />
            <p>No subjects added yet.</p>
          </article>
        ) : (
          <div className="subject-monthly-grid">
            {subjectMonthlyStats.map(({ subject, total, present, absent, pct }) => (
              <article
                key={subject.id}
                className="card subject-monthly-card"
                style={{ '--accent': subject.color } as React.CSSProperties}
              >
                <div className="card-top-row">
                  <div className="subject-title-box">
                    <span
                      className="subject-icon-badge"
                      style={{ background: subject.color }}
                    >
                      {subject.code.slice(0, 2) || '•'}
                    </span>
                    <div>
                      <h3>{subject.name}</h3>
                      <small className="muted">
                        {subject.code || 'No code'} {subject.teacher ? `· ${subject.teacher}` : ''}
                      </small>
                    </div>
                  </div>

                  <div className="card-pct-badge">
                    <b>{pct.toFixed(0)}%</b>
                    <small>Target {subject.target}%</small>
                  </div>
                </div>

                {total > 0 ? (
                  <>
                    <div className="subject-counts-bar">
                      <div>
                        <b>{present}</b>
                        <span>Present</span>
                      </div>
                      <div>
                        <b>{absent}</b>
                        <span>Absent</span>
                      </div>
                      <div>
                        <b>{total}</b>
                        <span>Total Classes</span>
                      </div>
                    </div>

                    <div className="monthly-progress-track">
                      <i
                        className="monthly-progress-fill"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          background: pct >= subject.target ? '#20c997' : '#e07186'
                        }}
                      />
                    </div>

                    <div className="subject-status-footer">
                      <small className={pct >= subject.target ? 'good' : 'warning'}>
                        {pct >= subject.target
                          ? 'Above target this month'
                          : `Below ${subject.target}% target for this month`}
                      </small>
                    </div>
                  </>
                ) : (
                  <div className="subject-empty-state">
                    <p className="muted">No classes recorded in {MONTH_NAMES[selectedMonth]}</p>
                    <div className="monthly-progress-track empty">
                      <i style={{ width: '0%' }} />
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* PART 6: Monthly Attendance History Summary Table */}
      <section className="historical-breakdown-section card">
        <div className="historical-header">
          <div>
            <h3>Attendance History (Last 6 Months)</h3>
            <p className="muted">Comparison across recent academic months</p>
          </div>
          <button
            type="button"
            className="text"
            onClick={onExportExcel}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
          >
            <Download size={14} /> Download Full History .xlsx
          </button>
        </div>

        <div className="history-table-wrapper">
          <table className="history-summary-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Total Held</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Attendance %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {historicalMonths.map(item => (
                <tr
                  key={item.key}
                  className={item.key === monthPrefix ? 'current-active-row' : ''}
                >
                  <td>
                    <b>{item.label}</b>
                    {item.key === monthPrefix && <span className="active-tag">Viewing</span>}
                  </td>
                  <td>{item.total}</td>
                  <td className="present-cell">{item.present}</td>
                  <td className="absent-cell">{item.absent}</td>
                  <td>
                    <b>{item.total > 0 ? `${item.pct.toFixed(1)}%` : '—'}</b>
                  </td>
                  <td>
                    {item.total === 0 ? (
                      <span className="status-pill-muted">No Classes</span>
                    ) : item.pct >= 75 ? (
                      <span className="status-pill-good">Healthy</span>
                    ) : (
                      <span className="status-pill-risk">At Risk</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
