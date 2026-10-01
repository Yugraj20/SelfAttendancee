import React, { useState } from 'react';
import { Download, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
import type { Attendance, Subject, TimetableEntry } from '../types';
import { exportAttendanceToExcel, type ExcelExportOptions } from '../excel-export';
import { Modal } from '../App';

interface ExcelExportModalProps {
  subjects: Subject[];
  records: Attendance[];
  table: TimetableEntry[];
  currentYear: number;
  currentMonth: number; // 0-11
  studentName?: string;
  studentEmail?: string;
  onSuccess: (filename: string, count: number) => void;
  onClose: () => void;
}

export function ExcelExportModal({
  subjects,
  records,
  table,
  currentYear,
  currentMonth,
  studentName,
  studentEmail,
  onSuccess,
  onClose
}: ExcelExportModalProps) {
  const [rangeType, setRangeType] = useState<ExcelExportOptions['rangeType']>('month');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [startDate, setStartDate] = useState<string>(
    `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toLocaleDateString('en-CA')
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeDetailed, setIncludeDetailed] = useState(true);
  const [includeMonthly, setIncludeMonthly] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handleExport = () => {
    setIsExporting(true);
    setError('');

    // Give UI a microtask to render spinner
    setTimeout(() => {
      try {
        const res = exportAttendanceToExcel({
          subjects,
          records,
          table,
          options: {
            studentName,
            studentEmail,
            rangeType,
            selectedYear,
            selectedMonth,
            startDate,
            endDate,
            subjectId: selectedSubjectId || undefined,
            includeSummary,
            includeDetailed,
            includeMonthly
          }
        });

        if (res.success) {
          onSuccess(res.filename, res.recordCount);
          onClose();
        } else {
          setError(res.error || 'Failed to generate Excel file.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred during export.');
      } finally {
        setIsExporting(false);
      }
    }, 50);
  };

  return (
    <Modal onClose={onClose}>
      <div className="excel-export-dialog">
        <div className="export-header-row">
          <div className="export-icon-box">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h2>Export Attendance to Excel</h2>
            <p className="muted">Generate a formatted multi-sheet .xlsx workbook locally in your browser.</p>
          </div>
        </div>

        {error && (
          <div className="error" style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="export-form-section">
          <label className="section-label">Date Range</label>
          <div className="radio-group-grid">
            <label className={`radio-pill-card ${rangeType === 'month' ? 'active' : ''}`}>
              <input
                type="radio"
                name="rangeType"
                value="month"
                checked={rangeType === 'month'}
                onChange={() => setRangeType('month')}
              />
              <div>
                <b>Selected Month</b>
                <small>{monthNames[selectedMonth]} {selectedYear}</small>
              </div>
            </label>

            <label className={`radio-pill-card ${rangeType === 'semester' ? 'active' : ''}`}>
              <input
                type="radio"
                name="rangeType"
                value="semester"
                checked={rangeType === 'semester'}
                onChange={() => setRangeType('semester')}
              />
              <div>
                <b>Semester</b>
                <small>Past 6 months session</small>
              </div>
            </label>

            <label className={`radio-pill-card ${rangeType === 'custom' ? 'active' : ''}`}>
              <input
                type="radio"
                name="rangeType"
                value="custom"
                checked={rangeType === 'custom'}
                onChange={() => setRangeType('custom')}
              />
              <div>
                <b>Custom Range</b>
                <small>Pick exact dates</small>
              </div>
            </label>

            <label className={`radio-pill-card ${rangeType === 'all' ? 'active' : ''}`}>
              <input
                type="radio"
                name="rangeType"
                value="all"
                checked={rangeType === 'all'}
                onChange={() => setRangeType('all')}
              />
              <div>
                <b>All Records</b>
                <small>Entire attendance history</small>
              </div>
            </label>
          </div>

          {rangeType === 'month' && (
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label>
                Month
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                >
                  {monthNames.map((name, idx) => (
                    <option key={name} value={idx}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                Year
                <input
                  type="number"
                  min="2000"
                  max="2099"
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                />
              </label>
            </div>
          )}

          {rangeType === 'custom' && (
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label>
                From Date
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </label>
              <label>
                To Date
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        <div className="export-form-section">
          <label className="section-label">Subject Filter</label>
          <select
            value={selectedSubjectId}
            onChange={e => setSelectedSubjectId(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">All Subjects ({subjects.length})</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} {s.code ? `(${s.code})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="export-form-section">
          <label className="section-label">Worksheets to Include</label>
          <div className="checkbox-list">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={includeSummary}
                onChange={e => setIncludeSummary(e.target.checked)}
              />
              <span>
                <b>Attendance Summary</b>
                <small className="muted">Overall stats, student details & subject breakdown</small>
              </span>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={includeDetailed}
                onChange={e => setIncludeDetailed(e.target.checked)}
              />
              <span>
                <b>Detailed Attendance Logs</b>
                <small className="muted">Row-by-row class history with auto-filters & room times</small>
              </span>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={includeMonthly}
                onChange={e => setIncludeMonthly(e.target.checked)}
              />
              <span>
                <b>Monthly Breakdown</b>
                <small className="muted">Month-by-month attendance progression per subject</small>
              </span>
            </label>
          </div>
        </div>

        <div className="export-modal-actions">
          <button type="button" onClick={onClose} disabled={isExporting}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleExport}
            disabled={isExporting || (!includeSummary && !includeDetailed && !includeMonthly)}
          >
            <Download size={16} />
            {isExporting ? 'Generating Excel…' : 'Download Excel (.xlsx)'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
