import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isNewerVersion,
  parseVersion,
  computeGracePeriod,
  checkAppUpdate,
  getStorageKey,
  isDismissedForSession,
  dismissUpdateForSession,
  clearSessionDismissal,
  extractDownloadUrl,
  GRACE_PERIOD_MS,
  CURRENT_APP_VERSION,
} from '../updater';

describe('App Updater Logic', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Version Parsing & Comparison', () => {
    it('parses version strings correctly', () => {
      expect(parseVersion('1.0.0')).toEqual([1, 0, 0]);
      expect(parseVersion('v1.0.1')).toEqual([1, 0, 1]);
      expect(parseVersion('V2.15.3')).toEqual([2, 15, 3]);
      expect(parseVersion('2')).toEqual([2]);
    });

    it('correctly compares version numbers', () => {
      expect(isNewerVersion('v1.0.1', '1.0.0')).toBe(true);
      expect(isNewerVersion('1.1.0', '1.0.9')).toBe(true);
      expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
      expect(isNewerVersion('1.0.0.1', '1.0.0')).toBe(true);

      // Same version or older
      expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
      expect(isNewerVersion('v1.0.0', '1.0.0')).toBe(false);
      expect(isNewerVersion('0.9.9', '1.0.0')).toBe(false);
      expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false);
    });
  });

  describe('Grace Period Calculations (3 Days)', () => {
    it('sets isForced to false on day 1 (0 days elapsed)', () => {
      const firstSeen = 1700000000000;
      const now = firstSeen; // 0 ms elapsed
      const res = computeGracePeriod(firstSeen, now);

      expect(res.isForced).toBe(false);
      expect(res.daysRemaining).toBe(3);
      expect(res.hoursRemaining).toBe(72);
      expect(res.deadlineAt).toBe(firstSeen + GRACE_PERIOD_MS);
    });

    it('sets isForced to false on day 2 (36 hours elapsed)', () => {
      const firstSeen = 1700000000000;
      const now = firstSeen + 36 * 60 * 60 * 1000; // 36 hours elapsed
      const res = computeGracePeriod(firstSeen, now);

      expect(res.isForced).toBe(false);
      expect(res.daysRemaining).toBe(2);
      expect(res.hoursRemaining).toBe(36);
    });

    it('sets isForced to false on day 3 (60 hours elapsed)', () => {
      const firstSeen = 1700000000000;
      const now = firstSeen + 60 * 60 * 60 * 1000; // 60 hours elapsed
      const res = computeGracePeriod(firstSeen, now);

      expect(res.isForced).toBe(false);
      expect(res.daysRemaining).toBe(1);
      expect(res.hoursRemaining).toBe(12);
    });

    it('sets isForced to true when 3 days (72 hours) have fully elapsed', () => {
      const firstSeen = 1700000000000;
      const now = firstSeen + GRACE_PERIOD_MS; // Exactly 72 hours
      const res = computeGracePeriod(firstSeen, now);

      expect(res.isForced).toBe(true);
      expect(res.daysRemaining).toBe(0);
      expect(res.hoursRemaining).toBe(0);
      expect(res.msRemaining).toBe(0);
    });

    it('sets isForced to true when beyond 3 days', () => {
      const firstSeen = 1700000000000;
      const now = firstSeen + GRACE_PERIOD_MS + 1000000;
      const res = computeGracePeriod(firstSeen, now);

      expect(res.isForced).toBe(true);
      expect(res.daysRemaining).toBe(0);
      expect(res.hoursRemaining).toBe(0);
    });
  });

  describe('Download URL Extraction', () => {
    it('extracts direct APK download url from assets if present', () => {
      const release = {
        html_url: 'https://github.com/Yugraj20/SelfAttendancee/releases/tag/v1.0.1',
        assets: [
          { name: 'SelfAttendance.apk', browser_download_url: 'https://github.com/Yugraj20/SelfAttendancee/releases/download/v1.0.1/SelfAttendance.apk' },
          { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' },
        ],
      };
      expect(extractDownloadUrl(release)).toBe('https://github.com/Yugraj20/SelfAttendancee/releases/download/v1.0.1/SelfAttendancee/releases/download/v1.0.1/SelfAttendance.apk'.replace('SelfAttendancee/releases/download/v1.0.1/SelfAttendance.apk', 'SelfAttendance.apk'));
      expect(extractDownloadUrl(release)).toBe('https://github.com/Yugraj20/SelfAttendancee/releases/download/v1.0.1/SelfAttendance.apk');
    });

    it('falls back to release html_url if no APK asset', () => {
      const release = {
        html_url: 'https://github.com/Yugraj20/SelfAttendancee/releases/tag/v1.0.1',
        assets: [],
      };
      expect(extractDownloadUrl(release)).toBe('https://github.com/Yugraj20/SelfAttendancee/releases/tag/v1.0.1');
    });
  });

  describe('Session Dismissal', () => {
    it('manages session dismissal properly', () => {
      expect(isDismissedForSession('v1.0.1')).toBe(false);
      dismissUpdateForSession('v1.0.1');
      expect(isDismissedForSession('v1.0.1')).toBe(true);
      expect(isDismissedForSession('v1.0.2')).toBe(false);
      clearSessionDismissal();
      expect(isDismissedForSession('v1.0.1')).toBe(false);
    });
  });

  describe('checkAppUpdate with mock release', () => {
    it('returns null if latest release is same as current version', async () => {
      const mockRelease = {
        tag_name: CURRENT_APP_VERSION,
        html_url: 'https://github.com/Yugraj20/SelfAttendancee/releases/tag/v1.0.0',
      };
      const info = await checkAppUpdate({ forceCheck: true, mockRelease });
      expect(info).toBeNull();
    });

    it('returns update info and records firstSeenAt when newer release exists', async () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const mockRelease = {
        tag_name: 'v1.0.1',
        html_url: 'https://github.com/Yugraj20/SelfAttendancee/releases/tag/v1.0.1',
        body: 'Bug fixes and performance improvements',
        assets: [
          { name: 'SelfAttendance.apk', browser_download_url: 'https://github.com/downloads/SelfAttendance.apk' },
        ],
      };

      const info = await checkAppUpdate({ forceCheck: true, mockRelease });
      expect(info).not.toBeNull();
      expect(info?.latestVersion).toBe('v1.0.1');
      expect(info?.isForced).toBe(false);
      expect(info?.daysRemaining).toBe(3);
      expect(info?.downloadUrl).toBe('https://github.com/downloads/SelfAttendance.apk');

      // Verify localStorage was set
      const storageKey = getStorageKey('1.0.1');
      expect(localStorage.getItem(storageKey)).toBe(String(now));
    });

    it('locks out user (isForced = true) when 3 days have passed since first seen', async () => {
      const cleanVersion = '1.0.1';
      const storageKey = getStorageKey(cleanVersion);
      const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
      localStorage.setItem(storageKey, String(fourDaysAgo));

      const mockRelease = {
        tag_name: 'v1.0.1',
        html_url: 'https://github.com/Yugraj20/SelfAttendancee/releases/tag/v1.0.1',
        body: 'Mandatory security update',
      };

      const info = await checkAppUpdate({ forceCheck: true, mockRelease });
      expect(info).not.toBeNull();
      expect(info?.isForced).toBe(true);
      expect(info?.daysRemaining).toBe(0);
      expect(info?.hoursRemaining).toBe(0);
    });
  });
});
