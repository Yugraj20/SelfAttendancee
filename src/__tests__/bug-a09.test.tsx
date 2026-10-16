import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useToday, getTodayInfo } from '../hooks/useToday';
import { QuickMarkModal } from '../components/QuickMarkModal';
import { sampleSubject, sampleTimetable } from '../test/helpers';

describe('BUG-A09: useToday hook updating across midnight and visibility change', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('provides current todayISO, todayDay, and nowTime', () => {
    const fixedDate = new Date('2026-04-10T14:30:00');
    vi.setSystemTime(fixedDate);

    const { result } = renderHook(() => useToday());

    expect(result.current.todayISO).toBe('2026-04-10');
    expect(result.current.todayDay).toBe('Friday');
    expect(result.current.nowTime).toBe('14:30');
  });

  it('updates state automatically across midnight without requiring manual reload', () => {
    // Set time to 23:59:50 on Friday
    const beforeMidnight = new Date('2026-04-10T23:59:50');
    vi.setSystemTime(beforeMidnight);

    const { result } = renderHook(() => useToday());
    expect(result.current.todayISO).toBe('2026-04-10');
    expect(result.current.todayDay).toBe('Friday');

    // Advance 20 seconds across midnight to Saturday 00:00:10
    act(() => {
      vi.setSystemTime(new Date('2026-04-11T00:00:10'));
      vi.advanceTimersByTime(20000);
    });

    expect(result.current.todayISO).toBe('2026-04-11');
    expect(result.current.todayDay).toBe('Saturday');
  });

  it('updates state on document visibilitychange to visible', () => {
    const day1 = new Date('2026-04-10T10:00:00');
    vi.setSystemTime(day1);

    const { result } = renderHook(() => useToday());
    expect(result.current.todayISO).toBe('2026-04-10');

    // Simulate app backgrounded for 2 days then brought to foreground
    vi.setSystemTime(new Date('2026-04-12T09:00:00'));
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.todayISO).toBe('2026-04-12');
    expect(result.current.todayDay).toBe('Sunday');
  });

  it('QuickMarkModal uses fresh date and cannot write to a stale date after midnight', () => {
    // Open app before midnight on Monday
    vi.setSystemTime(new Date('2026-04-13T23:58:00'));

    const onMark = vi.fn();
    const subjects = [sampleSubject({ id: 's1', name: 'Math' })];
    // Entry for Tuesday
    const table = [
      sampleTimetable({ id: 't1', day: 'Tuesday', subjectId: 's1', startTime: '09:00', endTime: '10:00' })
    ];

    const { rerender } = render(
      <QuickMarkModal
        subjects={subjects}
        records={[]}
        table={table}
        onMark={onMark}
        onNavigateHome={() => {}}
        onClose={() => {}}
      />
    );

    // Cross midnight into Tuesday
    act(() => {
      vi.setSystemTime(new Date('2026-04-14T00:05:00'));
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    // Re-render
    rerender(
      <QuickMarkModal
        subjects={subjects}
        records={[]}
        table={table}
        onMark={onMark}
        onNavigateHome={() => {}}
        onClose={() => {}}
      />
    );

    // Tuesday entry should now be visible and clickable
    const presentBtn = screen.getByRole('button', { name: /mark math present/i });
    fireEvent.click(presentBtn);

    // Verified that onMark was called with Tuesday's date (2026-04-14), not stale Monday (2026-04-13)
    expect(onMark).toHaveBeenCalledWith('s1', 'present', '2026-04-14', 't1');
  });
});
