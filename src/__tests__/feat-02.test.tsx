import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StorageChooser } from '../components/StorageChooser';
import { SettingsPage } from '../App';
import { sampleSubject, sampleSettings } from '../test/helpers';
import { LOCAL_USER } from '../storage-mode';

describe('FEAT-02: First-launch chooser and Settings Data & Sync section', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders StorageChooser with two cards and handles selection', () => {
    const onSelect = vi.fn();
    render(<StorageChooser onSelectMode={onSelect} />);

    expect(screen.getByText('Where should your data live?')).toBeDefined();
    expect(screen.getByText('Keep it on this device')).toBeDefined();
    expect(screen.getByText('Sign in & sync with Google')).toBeDefined();

    // Select local mode
    const localBtn = screen.getByRole('button', { name: /continue with local mode/i });
    fireEvent.click(localBtn);
    expect(onSelect).toHaveBeenCalledWith('local');

    // Select cloud mode
    const cloudBtn = screen.getByRole('button', { name: /sign in with google/i });
    fireEvent.click(cloudBtn);
    expect(onSelect).toHaveBeenCalledWith('cloud');
  });

  it('renders Data & sync section in SettingsPage for Local mode with switch to cloud and storage options actions', () => {
    const onSwitchToCloud = vi.fn();
    const onSwitchToLocal = vi.fn();
    const onOpenSignIn = vi.fn();
    const onBackToStorageOptions = vi.fn();

    render(
      <SettingsPage
        user={LOCAL_USER}
        settings={sampleSettings()}
        subjects={[sampleSubject()]}
        records={[]}
        table={[]}
        syncStatus="idle"
        storageMode="local"
        onSwitchToCloud={onSwitchToCloud}
        onSwitchToLocal={onSwitchToLocal}
        onOpenSignIn={onOpenSignIn}
        onBackToStorageOptions={onBackToStorageOptions}
        onSettings={() => {}}
        onBackup={() => {}}
        onRestore={() => {}}
        onImportAttendance={() => {}}
        onClear={() => {}}
        onLogout={() => {}}
      />
    );

    expect(screen.getByText(/data & sync/i)).toBeDefined();
    expect(screen.getByText(/Storage Mode: Local only/i)).toBeDefined();

    const signInBtn = screen.getByRole('button', { name: /sign in with google/i });
    fireEvent.click(signInBtn);
    expect(onOpenSignIn).toHaveBeenCalled();

    const turnOnSyncBtn = screen.getByRole('button', { name: /turn on cloud sync/i });
    fireEvent.click(turnOnSyncBtn);
    expect(onSwitchToCloud).toHaveBeenCalled();

    const changeModeBtn = screen.getByRole('button', { name: /change storage mode/i });
    fireEvent.click(changeModeBtn);
    expect(onBackToStorageOptions).toHaveBeenCalled();
  });

  it('renders Data & sync section in SettingsPage for Cloud mode with switch to local action', () => {
    const onSwitchToCloud = vi.fn();
    const onSwitchToLocal = vi.fn();

    render(
      <SettingsPage
        user={{ uid: 'cloud-user-1', email: 'student@example.com', displayName: 'Student One', photoURL: '' } as any}
        settings={sampleSettings()}
        subjects={[sampleSubject()]}
        records={[]}
        table={[]}
        syncStatus="synced"
        storageMode="cloud"
        onSwitchToCloud={onSwitchToCloud}
        onSwitchToLocal={onSwitchToLocal}
        onSettings={() => {}}
        onBackup={() => {}}
        onRestore={() => {}}
        onImportAttendance={() => {}}
        onClear={() => {}}
        onLogout={() => {}}
      />
    );

    expect(screen.getByText(/Storage Mode: Google Cloud Sync/i)).toBeDefined();
    const switchToLocalBtn = screen.getByRole('button', { name: /switch to local mode/i });
    fireEvent.click(switchToLocalBtn);
    expect(onSwitchToLocal).toHaveBeenCalled();
  });
});
