import { Capacitor } from '@capacitor/core';
import packageJson from '../package.json';

export const CURRENT_APP_VERSION = packageJson.version || '1.0.0';
export const GITHUB_REPO = 'Yugraj20/SelfAttendancee';
export const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  firstSeenAt: number;
  deadlineAt: number;
  isForced: boolean;
  daysRemaining: number;
  hoursRemaining: number;
}

export function parseVersion(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .trim()
    .split('.')
    .map(part => parseInt(part, 10) || 0);
}

export function isNewerVersion(remoteVersion: string, currentVersion: string = CURRENT_APP_VERSION): boolean {
  const remote = parseVersion(remoteVersion);
  const current = parseVersion(currentVersion);
  const len = Math.max(remote.length, current.length);
  for (let i = 0; i < len; i++) {
    const r = remote[i] ?? 0;
    const c = current[i] ?? 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

export function getStorageKey(cleanVersion: string): string {
  return `self_attendance_update_first_seen_${cleanVersion}`;
}

const SESSION_DISMISSED_KEY = 'self_attendance_update_dismissed_session';

export function isDismissedForSession(version: string): boolean {
  try {
    return sessionStorage.getItem(SESSION_DISMISSED_KEY) === version;
  } catch {
    return false;
  }
}

export function dismissUpdateForSession(version: string): void {
  try {
    sessionStorage.setItem(SESSION_DISMISSED_KEY, version);
  } catch {}
}

export function clearSessionDismissal(): void {
  try {
    sessionStorage.removeItem(SESSION_DISMISSED_KEY);
  } catch {}
}

export function extractDownloadUrl(release: any): string {
  if (Array.isArray(release.assets)) {
    const apkAsset = release.assets.find((a: any) => 
      typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk')
    );
    if (apkAsset?.browser_download_url) {
      return apkAsset.browser_download_url;
    }
  }
  return release.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`;
}

export function computeGracePeriod(
  firstSeenAt: number,
  now = Date.now(),
  graceDurationMs = GRACE_PERIOD_MS
) {
  const deadlineAt = firstSeenAt + graceDurationMs;
  const isForced = now >= deadlineAt;
  const msRemaining = Math.max(0, deadlineAt - now);
  const hoursRemaining = Math.ceil(msRemaining / (60 * 60 * 1000));
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

  return {
    deadlineAt,
    isForced,
    msRemaining,
    hoursRemaining,
    daysRemaining,
  };
}

export async function fetchLatestRelease(repo: string = GITHUB_REPO, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkAppUpdate(options?: {
  forceCheck?: boolean;
  mockRelease?: any;
}): Promise<UpdateInfo | null> {
  // Only execute on native APK platforms unless explicitly testing
  if (!Capacitor.isNativePlatform() && !options?.forceCheck) {
    return null;
  }

  const release = options?.mockRelease || (await fetchLatestRelease());
  if (!release || !release.tag_name) {
    return null;
  }

  const latestTag: string = release.tag_name;
  if (!isNewerVersion(latestTag, CURRENT_APP_VERSION)) {
    return null;
  }

  const cleanVersion = latestTag.replace(/^v/i, '').trim();
  const storageKey = getStorageKey(cleanVersion);

  let firstSeen = Number(localStorage.getItem(storageKey));
  if (!firstSeen || isNaN(firstSeen)) {
    firstSeen = Date.now();
    try {
      localStorage.setItem(storageKey, String(firstSeen));
    } catch {}
  }

  const { deadlineAt, isForced, daysRemaining, hoursRemaining } = computeGracePeriod(firstSeen);
  const downloadUrl = extractDownloadUrl(release);

  return {
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: latestTag.startsWith('v') ? latestTag : `v${latestTag}`,
    downloadUrl,
    releaseUrl: release.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
    releaseNotes: release.body || '',
    publishedAt: release.published_at || new Date().toISOString(),
    firstSeenAt: firstSeen,
    deadlineAt,
    isForced,
    daysRemaining,
    hoursRemaining,
  };
}

export function openDownloadLink(url: string) {
  try {
    // Attempt system browser intent in Capacitor
    window.open(url, '_system');
  } catch {}

  // Fallback: programmatic anchor click with target="_blank"
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
