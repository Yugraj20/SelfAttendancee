import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { SettingsPage } from '../App';
import type { AuthUser } from '../firebase';
import type { Settings } from '../types';

describe('BUG-028: Default target input draft state and blur clamp', () => {
  afterEach(() => {
    cleanup();
  });

  const dummyUser = {
    uid: 'user123',
    displayName: 'Test User',
    email: 'test@example.com',
    photoURL: null
  } as unknown as AuthUser;

  const initialSettings: Settings = {
    uid: 'user123',
    defaultTarget: 75,
    theme: 'system',
    onboardingComplete: true
  };

  it('allows clearing the input draft without immediately clamping to 1', () => {
    let currentSettings = { ...initialSettings };
    const onSettings = vi.fn((s: Settings) => {
      currentSettings = s;
    });

    render(
      <SettingsPage
        user={dummyUser}
        settings={currentSettings}
        subjects={[]}
        records={[]}
        table={[]}
        syncStatus="idle"
        onSettings={onSettings}
        onBackup={() => {}}
        onRestore={() => {}}
        onImportAttendance={() => {}}
        onClear={() => {}}
        onLogout={() => {}}
      />
    );

    const input = screen.getByLabelText(/Default target percentage/i) as HTMLInputElement;
    expect(input.value).toBe('75');

    // Simulate clearing the input while typing
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    // onSettings should NOT have been called with 1 yet!
    expect(onSettings).not.toHaveBeenCalled();

    // Now type 85 and blur
    fireEvent.change(input, { target: { value: '85' } });
    expect(input.value).toBe('85');
    fireEvent.blur(input);

    expect(onSettings).toHaveBeenCalledWith(expect.objectContaining({ defaultTarget: 85 }));
  });

  it('clamps invalid or out of range values on blur', () => {
    let currentSettings = { ...initialSettings };
    const onSettings = vi.fn((s: Settings) => {
      currentSettings = s;
    });

    render(
      <SettingsPage
        user={dummyUser}
        settings={currentSettings}
        subjects={[]}
        records={[]}
        table={[]}
        syncStatus="idle"
        onSettings={onSettings}
        onBackup={() => {}}
        onRestore={() => {}}
        onImportAttendance={() => {}}
        onClear={() => {}}
        onLogout={() => {}}
      />
    );

    const input = screen.getByLabelText(/Default target percentage/i) as HTMLInputElement;

    // Type 150 -> clamps to 100 on blur
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.blur(input);
    expect(onSettings).toHaveBeenCalledWith(expect.objectContaining({ defaultTarget: 100 }));
    expect(input.value).toBe('100');

    // Type 0 -> clamps to 1 on blur
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(onSettings).toHaveBeenCalledWith(expect.objectContaining({ defaultTarget: 1 }));
    expect(input.value).toBe('1');
  });
});
