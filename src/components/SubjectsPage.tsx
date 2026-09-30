import React, { useState } from 'react';
import { Plus, Check, Search, BookOpen, AlertCircle, Sparkles } from 'lucide-react';
import type { Attendance, AttendanceStatus, Subject } from '../types';
import { subjectStats } from '../math';

interface SubjectsPageProps {
  subjects: Subject[];
  records: Attendance[];
  onAdd: () => void;
  onEdit: (s: Subject) => void;
  onMark: (id: string, s: AttendanceStatus, date?: string, sessionId?: string) => void;
}

export function SubjectsPage({
  subjects,
  records,
  onAdd,
  onEdit,
  onMark
}: SubjectsPageProps) {
  const [query, setQuery] = useState('');

  const filtered = subjects.filter(s => {
    const q = query.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.teacher.toLowerCase().includes(q);
  });

  const totalSafeBunks = subjects.reduce((acc, s) => {
    const st = subjectStats(s, records);
    return acc + (st.bunk > 0 ? st.bunk : 0);
  }, 0);

  const atRiskCount = subjects.filter(s => {
    const st = subjectStats(s, records);
    return st.state === 'risk' && st.total > 0;
  }).length;

  return (
    <div className="subjects-page">
      <div className="section-title">
        <div>
          <h2>Subjects & Curriculum</h2>
          <p className="muted">Monitor targets, safe bunks, and mark attendance per subject.</p>
        </div>
        <button type="button" className="primary" onClick={onAdd}>
          <Plus size={16} /> Add subject
        </button>
      </div>

      {/* Quick summary cards for subjects */}
      <div className="stat-cards" style={{ marginBottom: 20 }}>
        <article className="card">
          <p>Total Subjects</p>
          <h2>{subjects.length}</h2>
        </article>
        <article className="card" style={{ borderLeft: '4px solid #20c997' }}>
          <p>Total Safe Bunks</p>
          <h2 style={{ color: '#167158' }}>{totalSafeBunks}</h2>
        </article>
        <article className="card" style={{ borderLeft: '4px solid #e5566d' }}>
          <p>Needs Attention</p>
          <h2 style={{ color: '#d1495b' }}>{atRiskCount}</h2>
        </article>
      </div>

      {subjects.length > 3 && (
        <div className="subject-search-bar" style={{ marginBottom: 18 }}>
          <Search size={16} className="muted" />
          <input
            type="search"
            placeholder="Search subjects by name, code or teacher…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search subjects"
          />
        </div>
      )}

      {subjects.length === 0 ? (
        <section className="empty card">
          <BookOpen size={36} />
          <h2>Start with your subjects</h2>
          <p>Add subjects or import a timetable to unlock tracking and attendance calculations.</p>
          <button type="button" className="primary" onClick={onAdd}>
            <Plus size={16} /> Add your first subject
          </button>
        </section>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p className="muted">No subjects match "{query}".</p>
        </div>
      ) : (
        <section className="subject-grid">
          {filtered.map(s => {
            const x = subjectStats(s, records);
            return (
              <article
                className="subject card"
                key={s.id}
                style={{ '--accent': s.color } as React.CSSProperties}
              >
                <div className="subject-top">
                  <span className="subject-icon">{s.code.slice(0, 2) || '•'}</span>
                  <button
                    type="button"
                    className="more"
                    onClick={() => onEdit(s)}
                    aria-label={`Edit ${s.name}`}
                  >
                    •••
                  </button>
                </div>

                <h3>{s.name}</h3>
                <p>
                  {s.code || 'No code'} · {s.teacher || 'Teacher not set'} {s.room ? `· Room ${s.room}` : ''}
                </p>

                <div className="percent">
                  <b>{x.pct.toFixed(0)}%</b>
                  <span>{x.present} / {x.total} classes</span>
                </div>

                <div className="progress">
                  <i style={{ width: `${Math.min(x.pct, 100)}%` }} />
                </div>

                <small className={x.state}>
                  {x.total === 0
                    ? 'No classes recorded yet'
                    : x.pct >= s.target
                    ? `Safe to miss ${x.bunk} classes`
                    : x.required === -1
                    ? 'Target 100% unreachable'
                    : `Attend next ${x.required} to reach ${s.target}%`}
                </small>

                <div className="mark">
                  <button
                    type="button"
                    aria-label={`Mark ${s.name} absent`}
                    className="absent"
                    onClick={() => onMark(s.id, 'absent')}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    aria-label={`Mark ${s.name} present`}
                    className="present"
                    onClick={() => onMark(s.id, 'present')}
                  >
                    <Check size={16} /> Present
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
