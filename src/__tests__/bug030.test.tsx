import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { BackupModal } from '../App';
import type { BackupPayload } from '../types';
import { dateISO } from '../math';

describe('BUG-030: Backup filename uses local date and delays revokeObjectURL', () => {
  let createdUrl = '';

  beforeEach(() => {
    vi.useFakeTimers();
    createdUrl = '';
    global.URL.createObjectURL = vi.fn((blob: Blob) => {
      createdUrl = 'blob:http://localhost/' + Math.random().toString(36).slice(2);
      return createdUrl;
    });
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses local date YYYY-MM-DD for backup filename instead of UTC slice', () => {
    const payload: BackupPayload = {
      version: 1,
      createdAt: '2026-09-20T19:00:00.000Z',
      account: { email: 'user@example.com', uid: 'user123' },
      subjects: [],
      attendance: [],
      timetable: [],
      settings: { uid: 'user123', defaultTarget: 75, theme: 'system', onboardingComplete: true }
    };

    let downloadedName = '';
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        vi.spyOn(el, 'click').mockImplementation(() => {
          downloadedName = (el as HTMLAnchorElement).download;
        });
      }
      return el;
    });

    render(<BackupModal data={payload} onClose={() => {}} />);
    const downloadBtn = screen.getByRole('button', { name: /Download backup/i });
    fireEvent.click(downloadBtn);

    const expectedLocal = dateISO();
    expect(downloadedName).toBe(`self-attendance-backup-${expectedLocal}.txt`);
  });

  it('delays URL.revokeObjectURL rather than cancelling immediately', () => {
    const payload: BackupPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      account: { email: 'user@example.com', uid: 'user123' },
      subjects: [],
      attendance: [],
      timetable: [],
      settings: { uid: 'user123', defaultTarget: 75, theme: 'system', onboardingComplete: true }
    };

    render(<BackupModal data={payload} onClose={() => {}} />);
    const downloadBtn = screen.getByRole('button', { name: /Download backup/i });
    fireEvent.click(downloadBtn);

    // Immediately after click, revokeObjectURL should NOT have been called yet
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();

    // After timer advances (e.g. 10s), it should be revoked
    vi.advanceTimersByTime(10000);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(createdUrl);
  });
});
