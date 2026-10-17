import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MAX_MONTHLY_AI_USES,
  DEFAULT_APK_GEMINI_KEY,
  getMonthKey,
  getResetDate,
  getAiMonthlyUsage,
  checkAiQuota,
  recordAiUsage,
  isUsingSharedKey,
} from '../ai-quota';

describe('AI Quota Tracking (3 uses per month per user)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts fresh with 0 used, 3 remaining, allowed = true', () => {
    const quota = checkAiQuota('user123');
    expect(quota.used).toBe(0);
    expect(quota.remaining).toBe(3);
    expect(quota.allowed).toBe(true);
    expect(quota.isSharedKey).toBe(true);
  });

  it('decrements remaining uses upon recording usage', () => {
    recordAiUsage('user123');
    let quota = checkAiQuota('user123');
    expect(quota.used).toBe(1);
    expect(quota.remaining).toBe(2);
    expect(quota.allowed).toBe(true);

    recordAiUsage('user123');
    quota = checkAiQuota('user123');
    expect(quota.used).toBe(2);
    expect(quota.remaining).toBe(1);
    expect(quota.allowed).toBe(true);

    recordAiUsage('user123');
    quota = checkAiQuota('user123');
    expect(quota.used).toBe(3);
    expect(quota.remaining).toBe(0);
    expect(quota.allowed).toBe(false); // 3 uses limit reached!
  });

  it('prevents circumventing by changing user ID on same device', () => {
    recordAiUsage('user123');
    recordAiUsage('user123');
    recordAiUsage('user123');

    // Someone tries switching to local or another user on the same device
    const localQuota = checkAiQuota('local_device_user');
    expect(localQuota.used).toBe(3);
    expect(localQuota.allowed).toBe(false);
  });

  it('resets usage when next month begins', () => {
    const octDate = new Date(2026, 9, 15); // October 2026
    recordAiUsage('user123', octDate);
    recordAiUsage('user123', octDate);
    recordAiUsage('user123', octDate);

    expect(checkAiQuota('user123', octDate).allowed).toBe(false);

    // In November 2026:
    const novDate = new Date(2026, 10, 1);
    const novQuota = checkAiQuota('user123', novDate);
    expect(novQuota.used).toBe(0);
    expect(novQuota.remaining).toBe(3);
    expect(novQuota.allowed).toBe(true);
  });

  it('treats personal custom Gemini key as unlimited', () => {
    localStorage.setItem('selfattendance_gemini_api_key', 'my-personal-gemini-key');
    expect(isUsingSharedKey()).toBe(false);

    // Even if 3 uses were already used on shared key:
    recordAiUsage('user123');
    recordAiUsage('user123');
    recordAiUsage('user123');

    const quota = checkAiQuota('user123');
    expect(quota.isSharedKey).toBe(false);
    expect(quota.allowed).toBe(true);
    expect(quota.remaining).toBe(Infinity);
  });

  it('detects if user re-enters the default APK key into Settings and still applies limit', () => {
    localStorage.setItem('selfattendance_gemini_api_key', DEFAULT_APK_GEMINI_KEY || '');
    expect(isUsingSharedKey()).toBe(true);
  });
});
