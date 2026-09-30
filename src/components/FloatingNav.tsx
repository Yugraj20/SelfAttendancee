import React from 'react';
import { Home, BookOpen, Plus, Calendar, BarChart3 } from 'lucide-react';

export type NavItemKey = 'home' | 'subjects' | 'mark' | 'timetable' | 'reports';

interface FloatingNavProps {
  activeKey: string;
  onNavigate: (key: 'home' | 'subjects' | 'timetable' | 'statistics') => void;
  onOpenMark: () => void;
}

export function FloatingNav({ activeKey, onNavigate, onOpenMark }: FloatingNavProps) {
  // Map page names to active state
  const isHomeActive = activeKey === 'home';
  const isSubjectsActive = activeKey === 'subjects';
  const isTimetableActive = activeKey === 'timetable';
  const isReportsActive = activeKey === 'statistics';

  return (
    <nav className="floating-glass-dock" role="navigation" aria-label="Mobile Navigation">
      {/* 1. Home */}
      <button
        type="button"
        className={`dock-item ${isHomeActive ? 'active' : ''}`}
        onClick={() => onNavigate('home')}
        aria-label="Home Dashboard"
        aria-current={isHomeActive ? 'page' : undefined}
      >
        <div className="dock-icon-wrapper">
          <Home size={20} strokeWidth={isHomeActive ? 2.5 : 2} />
        </div>
        <span className="dock-label">Home</span>
      </button>

      {/* 2. Subjects */}
      <button
        type="button"
        className={`dock-item ${isSubjectsActive ? 'active' : ''}`}
        onClick={() => onNavigate('subjects')}
        aria-label="Subjects"
        aria-current={isSubjectsActive ? 'page' : undefined}
      >
        <div className="dock-icon-wrapper">
          <BookOpen size={20} strokeWidth={isSubjectsActive ? 2.5 : 2} />
        </div>
        <span className="dock-label">Subjects</span>
      </button>

      {/* 3. Central Mark Button */}
      <div className="dock-center-container">
        <button
          type="button"
          className="dock-mark-button"
          onClick={onOpenMark}
          aria-label="Mark attendance for today"
        >
          <div className="mark-button-inner">
            <Plus size={24} strokeWidth={2.75} />
          </div>
          <span className="dock-label mark-label">Mark</span>
        </button>
      </div>

      {/* 4. Timetable */}
      <button
        type="button"
        className={`dock-item ${isTimetableActive ? 'active' : ''}`}
        onClick={() => onNavigate('timetable')}
        aria-label="Timetable"
        aria-current={isTimetableActive ? 'page' : undefined}
      >
        <div className="dock-icon-wrapper">
          <Calendar size={20} strokeWidth={isTimetableActive ? 2.5 : 2} />
        </div>
        <span className="dock-label">Timetable</span>
      </button>

      {/* 5. Reports */}
      <button
        type="button"
        className={`dock-item ${isReportsActive ? 'active' : ''}`}
        onClick={() => onNavigate('statistics')}
        aria-label="Reports and Analytics"
        aria-current={isReportsActive ? 'page' : undefined}
      >
        <div className="dock-icon-wrapper">
          <BarChart3 size={20} strokeWidth={isReportsActive ? 2.5 : 2} />
        </div>
        <span className="dock-label">Reports</span>
      </button>
    </nav>
  );
}
