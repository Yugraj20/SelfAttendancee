import React from 'react';
import { Check, Clock3, Calendar, X } from 'lucide-react';
import type { Attendance, AttendanceStatus, Subject, TimetableEntry } from '../types';
import { DAYS } from '../types';
import { dateISO } from '../math';
import { Modal } from '../App';

interface QuickMarkModalProps {
  subjects: Subject[];
  records: Attendance[];
  table: TimetableEntry[];
  onMark: (subjectId: string, status: AttendanceStatus, date?: string, sessionId?: string) => void;
  onNavigateHome: () => void;
  onClose: () => void;
}

export function QuickMarkModal({
  subjects,
  records,
  table,
  onMark,
  onNavigateHome,
  onClose
}: QuickMarkModalProps) {
  const todayDate = dateISO();
  const dayName = DAYS[(new Date().getDay() + 6) % 7];
  const todayEntries = table
    .filter(t => t.day === dayName)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

  return (
    <Modal onClose={onClose}>
      <div className="quick-mark-dialog">
        <div className="quick-mark-header">
          <div className="quick-mark-pill">
            <Calendar size={14} />
            <span>{formattedDate}</span>
          </div>
          <h2>Mark Attendance</h2>
          <p className="muted">One tap to record your presence or absence for today.</p>
        </div>

        {todayEntries.length > 0 ? (
          <div className="quick-mark-section">
            <h3 className="quick-mark-subtitle">Today's Timetable ({todayEntries.length})</h3>
            <div className="quick-mark-list">
              {todayEntries.map(e => {
                const sub = subjects.find(s => s.id === e.subjectId);
                const record =
                  records.find(r => r.subjectId === e.subjectId && r.date === todayDate && r.sessionId === e.id) ??
                  records.find(r => r.subjectId === e.subjectId && r.date === todayDate && (r.sessionId === 'manual' || !todayEntries.some(t => t.id === r.sessionId)));
                const status = record?.status;
                const displayName = sub?.name || e.subject;

                return (
                  <div key={e.id} className={`quick-mark-card ${status ? 'status-' + status : ''}`}>
                    <div className="quick-card-info">
                      <div className="quick-card-time">
                        <Clock3 size={13} />
                        <span>{e.startTime} - {e.endTime}</span>
                        {e.room && <span className="quick-room">· {e.room}</span>}
                      </div>
                      <b>{displayName}</b>
                      {status && status !== 'unmarked' && (
                        <span className={`status-tag status-tag-${status}`}>
                          {status[0].toUpperCase() + status.slice(1)}
                        </span>
                      )}
                    </div>

                    <div className="quick-card-actions">
                      <button
                        className={`qm-btn present ${status === 'present' ? 'active' : ''}`}
                        onClick={() => onMark(e.subjectId, 'present', todayDate, e.id)}
                        aria-label={`Mark ${displayName} present`}
                      >
                        <Check size={16} />
                        <span>Present</span>
                      </button>
                      <button
                        className={`qm-btn absent ${status === 'absent' ? 'active' : ''}`}
                        onClick={() => onMark(e.subjectId, 'absent', todayDate, e.id)}
                        aria-label={`Mark ${displayName} absent`}
                      >
                        <span>−</span>
                        <span>Absent</span>
                      </button>
                      <button
                        className={`qm-btn cancelled ${status === 'cancelled' ? 'active' : ''}`}
                        onClick={() => onMark(e.subjectId, 'cancelled', todayDate, e.id)}
                        aria-label={`Mark ${displayName} cancelled`}
                      >
                        <span>Off</span>
                      </button>
                      {status && status !== 'unmarked' && (
                        <button
                          className="qm-btn clear"
                          onClick={() => onMark(e.subjectId, 'unmarked', todayDate, e.id)}
                          aria-label="Clear mark"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="quick-mark-notice">
            <p>No timetable classes scheduled for today ({dayName}).</p>
          </div>
        )}

        <div className="quick-mark-section" style={{ marginTop: 16 }}>
          <h3 className="quick-mark-subtitle">
            {todayEntries.length > 0 ? 'Other Subjects' : 'All Subjects'}
          </h3>
          <div className="quick-mark-list">
            {subjects
              .filter(s => !todayEntries.some(e => e.subjectId === s.id))
              .map(s => {
                const record = records.find(r => r.subjectId === s.id && r.date === todayDate);
                const status = record?.status;

                return (
                  <div key={s.id} className="quick-mark-card">
                    <div className="quick-card-info">
                      <div className="subject-dot-title">
                        <span className="dot-indicator" style={{ background: s.color }} />
                        <b>{s.name}</b>
                        {s.code && <small className="muted">({s.code})</small>}
                      </div>
                      {status && status !== 'unmarked' && (
                        <span className={`status-tag status-tag-${status}`}>
                          {status[0].toUpperCase() + status.slice(1)}
                        </span>
                      )}
                    </div>

                    <div className="quick-card-actions">
                      <button
                        className={`qm-btn present ${status === 'present' ? 'active' : ''}`}
                        onClick={() => onMark(s.id, 'present', todayDate, 'manual')}
                        aria-label={`Mark ${s.name} present`}
                      >
                        <Check size={16} />
                        <span>Present</span>
                      </button>
                      <button
                        className={`qm-btn absent ${status === 'absent' ? 'active' : ''}`}
                        onClick={() => onMark(s.id, 'absent', todayDate, 'manual')}
                        aria-label={`Mark ${s.name} absent`}
                      >
                        <span>−</span>
                        <span>Absent</span>
                      </button>
                      {status && status !== 'unmarked' && (
                        <button
                          className="qm-btn clear"
                          onClick={() => onMark(s.id, 'unmarked', todayDate, 'manual')}
                          aria-label="Clear mark"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="quick-mark-footer">
          <button
            type="button"
            className="text"
            onClick={() => {
              onClose();
              onNavigateHome();
            }}
          >
            Go to Today's rhythm on Dashboard →
          </button>
        </div>
      </div>
    </Modal>
  );
}
