import * as XLSX from 'xlsx';
import type { Attendance, Subject, TimetableEntry } from './types';
import { DAYS } from './types';

export interface ExcelExportOptions {
  studentName?: string;
  studentEmail?: string;
  rangeType: 'month' | 'semester' | 'custom' | 'all';
  selectedYear: number;
  selectedMonth: number; // 0-11
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  subjectId?: string; // '' or undefined for all
  includeSummary: boolean;
  includeDetailed: boolean;
  includeMonthly: boolean;
}

export function exportAttendanceToExcel({
  subjects,
  records,
  table,
  options
}: {
  subjects: Subject[];
  records: Attendance[];
  table: TimetableEntry[];
  options: ExcelExportOptions;
}): { success: boolean; filename: string; recordCount: number; error?: string } {
  try {
    const subjectMap = new Map<string, Subject>();
    subjects.forEach(s => subjectMap.set(s.id, s));

    // Determine date range filter
    let rangeLabel = '';
    let startFilter = '';
    let endFilter = '';

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    if (options.rangeType === 'month') {
      const monthStr = String(options.selectedMonth + 1).padStart(2, '0');
      const lastDay = new Date(options.selectedYear, options.selectedMonth + 1, 0).getDate();
      startFilter = `${options.selectedYear}-${monthStr}-01`;
      endFilter = `${options.selectedYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
      rangeLabel = `${monthNames[options.selectedMonth]} ${options.selectedYear}`;
    } else if (options.rangeType === 'semester') {
      // Semester: past 6 months up to current date or whole term
      const now = new Date(options.selectedYear, options.selectedMonth, 1);
      const semStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const semEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      startFilter = semStart.toISOString().slice(0, 10);
      endFilter = semEnd.toISOString().slice(0, 10);
      rangeLabel = `Semester (${startFilter} to ${endFilter})`;
    } else if (options.rangeType === 'custom') {
      startFilter = options.startDate || '1970-01-01';
      endFilter = options.endDate || '2099-12-31';
      rangeLabel = `Custom Range (${startFilter} to ${endFilter})`;
    } else {
      startFilter = '1970-01-01';
      endFilter = '2099-12-31';
      rangeLabel = 'All Attendance Records';
    }

    // Filter subjects
    const targetSubjects = options.subjectId
      ? subjects.filter(s => s.id === options.subjectId)
      : subjects;
    const targetSubjectIds = new Set(targetSubjects.map(s => s.id));

    // Filter actual recorded attendance events
    // Only actual recorded attendance events (where subject is recognized and within date range)
    const filteredRecords = records
      .filter(r => {
        if (!targetSubjectIds.has(r.subjectId)) return false;
        if (r.date < startFilter || r.date > endFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return a.sessionId.localeCompare(b.sessionId);
      });

    // Held classes for stats (present or absent, excluding cancelled/unmarked)
    const heldRecords = filteredRecords.filter(r => r.status === 'present' || r.status === 'absent');
    const presentCount = heldRecords.filter(r => r.status === 'present').length;
    const absentCount = heldRecords.filter(r => r.status === 'absent').length;
    const totalHeld = heldRecords.length;
    const overallPct = totalHeld > 0 ? ((presentCount / totalHeld) * 100).toFixed(2) + '%' : '0.00%';

    const wb = XLSX.utils.book_new();

    // -------------------------------------------------------------
    // Worksheet 1: Attendance Summary
    // -------------------------------------------------------------
    if (options.includeSummary) {
      const summaryAoa: (string | number)[][] = [
        ['SELFATTENDANCEE - ATTENDANCE SUMMARY REPORT'],
        [''],
        ['Student Name:', options.studentName || 'Self Attendance Student'],
        ['Email:', options.studentEmail || 'N/A'],
        ['Export Date:', new Date().toLocaleDateString('en-CA') + ' ' + new Date().toLocaleTimeString()],
        ['Selected Date Range:', rangeLabel],
        ['Total Classes Held:', totalHeld],
        ['Present Classes:', presentCount],
        ['Absent Classes:', absentCount],
        ['Overall Attendance %:', overallPct],
        [''],
        ['SUBJECT-WISE ATTENDANCE BREAKDOWN'],
        ['Subject Name', 'Subject Code', 'Target %', 'Total Held', 'Present', 'Absent', 'Attendance %', 'Status']
      ];

      targetSubjects.forEach(s => {
        const sRecords = heldRecords.filter(r => r.subjectId === s.id);
        const sTotal = sRecords.length;
        const sPresent = sRecords.filter(r => r.status === 'present').length;
        const sAbsent = sTotal - sPresent;
        const sPct = sTotal > 0 ? (sPresent / sTotal) * 100 : 0;
        const statusText = sTotal === 0 ? 'No classes recorded' : sPct >= s.target ? 'On Target' : 'Needs Attention';

        summaryAoa.push([
          s.name,
          s.code || 'N/A',
          `${s.target}%`,
          sTotal,
          sPresent,
          sAbsent,
          sTotal > 0 ? `${sPct.toFixed(2)}%` : '0.00%',
          statusText
        ]);
      });

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);

      // Set column widths
      wsSummary['!cols'] = [
        { wch: 28 }, // Subject Name
        { wch: 15 }, // Code
        { wch: 12 }, // Target
        { wch: 14 }, // Total
        { wch: 12 }, // Present
        { wch: 12 }, // Absent
        { wch: 16 }, // Attendance %
        { wch: 22 }  // Status
      ];

      XLSX.utils.book_append_sheet(wb, wsSummary, 'Attendance Summary');
    }

    // -------------------------------------------------------------
    // Worksheet 2: Detailed Attendance
    // -------------------------------------------------------------
    if (options.includeDetailed) {
      const detailedAoa: (string | number)[][] = [
        [
          'Date',
          'Day of Week',
          'Subject Name',
          'Subject Code',
          'Class Start Time',
          'Class End Time',
          'Attendance Status',
          'Room',
          'Remarks / Session ID'
        ]
      ];

      filteredRecords.forEach(r => {
        const sub = subjectMap.get(r.subjectId);
        const d = new Date(r.date + 'T12:00:00');
        const dayName = !isNaN(d.getTime()) ? DAYS[(d.getDay() + 6) % 7] : '';

        // Match timetable session if sessionId is an entry id
        const tableEntry = table.find(t => t.id === r.sessionId);
        const startTime = tableEntry?.startTime || '—';
        const endTime = tableEntry?.endTime || '—';
        const room = tableEntry?.room || sub?.room || '—';

        const statusFormatted =
          r.status === 'present'
            ? 'Present'
            : r.status === 'absent'
            ? 'Absent'
            : r.status === 'cancelled'
            ? 'Cancelled'
            : 'Unmarked';

        detailedAoa.push([
          r.date,
          dayName,
          sub?.name || 'Unknown Subject',
          sub?.code || '—',
          startTime,
          endTime,
          statusFormatted,
          room,
          r.sessionId === 'manual' ? 'Manual entry' : r.sessionId
        ]);
      });

      const wsDetailed = XLSX.utils.aoa_to_sheet(detailedAoa);

      // Column widths
      wsDetailed['!cols'] = [
        { wch: 14 }, // Date
        { wch: 14 }, // Day
        { wch: 26 }, // Subject
        { wch: 14 }, // Code
        { wch: 16 }, // Start
        { wch: 16 }, // End
        { wch: 18 }, // Status
        { wch: 14 }, // Room
        { wch: 22 }  // Remarks
      ];

      // Enable autofilter for detailed sheet
      if (filteredRecords.length > 0) {
        wsDetailed['!autofilter'] = {
          ref: `A1:I${filteredRecords.length + 1}`
        };
      }

      // Freeze header row
      wsDetailed['!views'] = [{ state: 'frozen', ySplit: 1 }];

      XLSX.utils.book_append_sheet(wb, wsDetailed, 'Detailed Attendance');
    }

    // -------------------------------------------------------------
    // Worksheet 3: Monthly Breakdown
    // -------------------------------------------------------------
    if (options.includeMonthly) {
      const monthlyAoa: (string | number)[][] = [
        ['Month (YYYY-MM)', 'Subject Name', 'Subject Code', 'Total Held', 'Present', 'Absent', 'Attendance %']
      ];

      // Group held records by YYYY-MM and subjectId
      const monthSubjectMap = new Map<string, { present: number; absent: number }>();

      heldRecords.forEach(r => {
        const monthKey = r.date.slice(0, 7); // YYYY-MM
        const key = `${monthKey}__${r.subjectId}`;
        const cur = monthSubjectMap.get(key) || { present: 0, absent: 0 };
        if (r.status === 'present') cur.present++;
        if (r.status === 'absent') cur.absent++;
        monthSubjectMap.set(key, cur);
      });

      // Sort keys chronologically
      const sortedKeys = Array.from(monthSubjectMap.keys()).sort();

      sortedKeys.forEach(key => {
        const [monthKey, subjectId] = key.split('__');
        const stats = monthSubjectMap.get(key)!;
        const sub = subjectMap.get(subjectId);
        const total = stats.present + stats.absent;
        const pct = total > 0 ? (stats.present / total) * 100 : 0;

        monthlyAoa.push([
          monthKey,
          sub?.name || 'Unknown Subject',
          sub?.code || '—',
          total,
          stats.present,
          stats.absent,
          total > 0 ? `${pct.toFixed(2)}%` : '0.00%'
        ]);
      });

      const wsMonthly = XLSX.utils.aoa_to_sheet(monthlyAoa);

      wsMonthly['!cols'] = [
        { wch: 18 }, // Month
        { wch: 28 }, // Subject
        { wch: 14 }, // Code
        { wch: 14 }, // Total Held
        { wch: 12 }, // Present
        { wch: 12 }, // Absent
        { wch: 16 }  // %
      ];

      if (sortedKeys.length > 0) {
        wsMonthly['!autofilter'] = {
          ref: `A1:G${sortedKeys.length + 1}`
        };
      }
      wsMonthly['!views'] = [{ state: 'frozen', ySplit: 1 }];

      XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Breakdown');
    }

    // Determine filename
    let filename = '';
    if (options.rangeType === 'month') {
      const mName = monthNames[options.selectedMonth];
      filename = `SelfAttendancee_Monthly_${mName}_${options.selectedYear}.xlsx`;
    } else if (options.rangeType === 'custom') {
      filename = `SelfAttendancee_Attendance_${startFilter}_to_${endFilter}.xlsx`;
    } else if (options.rangeType === 'semester') {
      filename = `SelfAttendancee_Semester_${options.selectedYear}.xlsx`;
    } else {
      filename = `SelfAttendancee_Full_Attendance_${options.selectedYear}.xlsx`;
    }

    // Write file client-side
    XLSX.writeFile(wb, filename);

    return {
      success: true,
      filename,
      recordCount: filteredRecords.length
    };
  } catch (err) {
    return {
      success: false,
      filename: '',
      recordCount: 0,
      error: err instanceof Error ? err.message : 'Unknown Excel generation error'
    };
  }
}
