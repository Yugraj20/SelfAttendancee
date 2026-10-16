import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as authModule from 'firebase/auth';
import App from '../App';
import { resetTestDb } from '../test/helpers';

let capturedAuthCb: ((u: any) => Promise<void>) | null = null;

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>();
  return {
    ...actual,
    onAuthStateChanged: vi.fn((_auth: any, cb: any) => {
      capturedAuthCb = cb;
      return vi.fn();
    }),
  };
});

vi.mock('../firebase', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    auth: { currentUser: null },
    firebaseConfigured: true,
  };
});

vi.mock('../sync', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    syncOnLogin: vi.fn().mockResolvedValue('seeded'),
    flushPendingPush: vi.fn().mockResolvedValue(undefined),
    cancelPendingPush: vi.fn(),
  };
});

describe('BUG-A06: Auth callback race on quick sign-in then sign-out', () => {
  beforeEach(async () => {
    localStorage.setItem('selfattendance_storage_mode', 'cloud');
    capturedAuthCb = null;
    await resetTestDb();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not set user if sign-out occurs before sign-in callback completes', async () => {
    render(<App />);

    await waitFor(() => {
      expect(capturedAuthCb).not.toBeNull();
    });

    const user1 = { uid: 'u1', email: 'u1@example.com', displayName: 'User One' };

    // Trigger sign-in for user 1
    const p1 = capturedAuthCb!(user1);

    // Immediately trigger sign-out while p1 is in flight
    const p2 = capturedAuthCb!(null);

    await Promise.all([p1, p2]);

    // After both finish, user must NOT be logged in as user1!
    // The screen should show the login view, not the logged-in bottom bar or user profile
    await waitFor(() => {
      expect(screen.queryByText('User One')).toBeNull();
      // Should show Continue with Google
      expect(screen.getByRole('button', { name: /continue with google/i })).toBeDefined();
    });
  });
});
