export const MAX_MONTHLY_AI_USES = 3;
export const DEFAULT_APK_GEMINI_KEY = (import.meta.env.VITE_GEMINI_API_KEY || '').trim();

export function getMonthKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getResetDate(date = new Date()): string {
  const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return nextMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getUserUsageKey(monthKey: string, uid?: string): string {
  const safeUid = (uid || 'default_user').trim();
  return `selfattendance_ai_usage_${monthKey}_${safeUid}`;
}

export function getDeviceUsageKey(monthKey: string): string {
  return `selfattendance_ai_usage_${monthKey}_device`;
}

export function getAiMonthlyUsage(uid?: string, date = new Date()): number {
  try {
    const monthKey = getMonthKey(date);
    const userKey = getUserUsageKey(monthKey, uid);
    const deviceKey = getDeviceUsageKey(monthKey);

    const userCount = parseInt(localStorage.getItem(userKey) || '0', 10);
    const deviceCount = parseInt(localStorage.getItem(deviceKey) || '0', 10);

    return Math.max(isNaN(userCount) ? 0 : userCount, isNaN(deviceCount) ? 0 : deviceCount);
  } catch {
    return 0;
  }
}

export function isUsingSharedKey(): boolean {
  try {
    const customKey = localStorage.getItem('selfattendance_gemini_api_key')?.trim();
    if (!customKey) return true;
    if (customKey === DEFAULT_APK_GEMINI_KEY) return true;
    const envKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
    if (envKey && customKey === envKey) return true;
    return false;
  } catch {
    return true;
  }
}

export interface AiQuotaStatus {
  allowed: boolean;
  used: number;
  remaining: number;
  max: number;
  isSharedKey: boolean;
  resetDate: string;
}

export function checkAiQuota(uid?: string, date = new Date()): AiQuotaStatus {
  const isShared = isUsingSharedKey();
  const used = getAiMonthlyUsage(uid, date);
  const resetDate = getResetDate(date);

  if (!isShared) {
    return {
      allowed: true,
      used,
      remaining: Infinity,
      max: MAX_MONTHLY_AI_USES,
      isSharedKey: false,
      resetDate,
    };
  }

  const remaining = Math.max(0, MAX_MONTHLY_AI_USES - used);
  const allowed = remaining > 0;

  return {
    allowed,
    used,
    remaining,
    max: MAX_MONTHLY_AI_USES,
    isSharedKey: true,
    resetDate,
  };
}

export function recordAiUsage(uid?: string, date = new Date()): number {
  try {
    const monthKey = getMonthKey(date);
    const userKey = getUserUsageKey(monthKey, uid);
    const deviceKey = getDeviceUsageKey(monthKey);

    const currentUsage = getAiMonthlyUsage(uid, date);
    const newUsage = currentUsage + 1;

    localStorage.setItem(userKey, String(newUsage));
    localStorage.setItem(deviceKey, String(newUsage));

    return newUsage;
  } catch {
    return 1;
  }
}

export function resetAiUsageForTesting(uid?: string, date = new Date()): void {
  try {
    const monthKey = getMonthKey(date);
    const userKey = getUserUsageKey(monthKey, uid);
    const deviceKey = getDeviceUsageKey(monthKey);
    localStorage.removeItem(userKey);
    localStorage.removeItem(deviceKey);
  } catch {}
}
