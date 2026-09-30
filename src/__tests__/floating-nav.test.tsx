import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { FloatingNav } from '../components/FloatingNav';

describe('Floating Glassmorphism Mobile Navigation', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders exactly five navigation items: Home, Subjects, Mark, Timetable, Reports', () => {
    render(
      <FloatingNav
        activeKey="home"
        onNavigate={() => {}}
        onOpenMark={() => {}}
      />
    );

    // Verify all 5 items by accessible roles and names
    expect(screen.getByRole('button', { name: /Home Dashboard/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Subjects/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Mark attendance for today/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Timetable/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Reports and Analytics/i })).toBeDefined();

    // Verify text labels
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Subjects')).toBeDefined();
    expect(screen.getByText('Mark')).toBeDefined();
    expect(screen.getByText('Timetable')).toBeDefined();
    expect(screen.getByText('Reports')).toBeDefined();
  });

  it('sets active styling and aria-current on the currently selected item', () => {
    const { rerender } = render(
      <FloatingNav
        activeKey="home"
        onNavigate={() => {}}
        onOpenMark={() => {}}
      />
    );

    const homeBtn = screen.getByRole('button', { name: /Home Dashboard/i });
    expect(homeBtn.getAttribute('aria-current')).toBe('page');
    expect(homeBtn.className).toContain('active');

    // Switch activeKey to statistics (Reports)
    rerender(
      <FloatingNav
        activeKey="statistics"
        onNavigate={() => {}}
        onOpenMark={() => {}}
      />
    );

    const reportsBtn = screen.getByRole('button', { name: /Reports and Analytics/i });
    expect(reportsBtn.getAttribute('aria-current')).toBe('page');
    expect(reportsBtn.className).toContain('active');
    expect(homeBtn.getAttribute('aria-current')).toBeNull();
  });

  it('triggers onNavigate when non-mark items are tapped', () => {
    const onNavigate = vi.fn();
    render(
      <FloatingNav
        activeKey="home"
        onNavigate={onNavigate}
        onOpenMark={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Subjects/i }));
    expect(onNavigate).toHaveBeenCalledWith('subjects');

    fireEvent.click(screen.getByRole('button', { name: /Timetable/i }));
    expect(onNavigate).toHaveBeenCalledWith('timetable');

    fireEvent.click(screen.getByRole('button', { name: /Reports and Analytics/i }));
    expect(onNavigate).toHaveBeenCalledWith('statistics');
  });

  it('triggers onOpenMark when central Mark button is pressed', () => {
    const onOpenMark = vi.fn();
    render(
      <FloatingNav
        activeKey="home"
        onNavigate={() => {}}
        onOpenMark={onOpenMark}
      />
    );

    const markBtn = screen.getByRole('button', { name: /Mark attendance for today/i });
    fireEvent.click(markBtn);
    expect(onOpenMark).toHaveBeenCalledTimes(1);
  });
});
