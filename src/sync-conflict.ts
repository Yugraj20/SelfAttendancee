import { getDb, put, restore, userData } from './db';
import type { Attendance, Settings, Subject, TimetableEntry } from './types';
import { executePush } from './sync';

export type ConflictChoice = 'merge' | 'keep_cloud' | 'keep_device';

export interface UserDataset {
  subjects: Subject[];
  attendance: Attendance[];
  timetable: TimetableEntry[];
  settings: Settings;
}

/**
 * Creates an automatic safety snapshot in IndexedDB before any destructive sync operation.
 * Key format: snapshot:pre-sync-YYYYMMDD-HHMMSS
 */
export async function createPreSyncSnapshot(uid: string): Promise<string> {
  const data = await userData(uid);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const snapshotKey = `snapshot:pre-sync-${timestamp}`;

  const db = await getDb();
  await db.put('users', {
    uid: snapshotKey,
    email: '',
    name: 'Pre-sync Safety Snapshot',
    photoURL: '',
    updatedAt: now.toISOString(),
    snapshot: data,
  } as any);

  return snapshotKey;
}

/**
 * Merges local and cloud records:
 * - Records with different IDs are all kept.
 * - Records with same ID are merged by newer updatedAt/createdAt timestamp.
 */
export function mergeUserData(local: UserDataset, cloud: UserDataset, targetUid: string): UserDataset {
  // Merge Subjects by ID
  const subjectsMap = new Map<string, Subject>();
  for (const s of cloud.subjects) {
    subjectsMap.set(s.id, { ...s, uid: targetUid });
  }
  for (const s of local.subjects) {
    const existing = subjectsMap.get(s.id);
    if (!existing) {
      subjectsMap.set(s.id, { ...s, uid: targetUid });
    } else {
      const localTime = new Date(s.createdAt || 0).getTime();
      const cloudTime = new Date(existing.createdAt || 0).getTime();
      if (localTime >= cloudTime) {
        subjectsMap.set(s.id, { ...s, uid: targetUid });
      }
    }
  }

  // Merge Attendance by ID
  const attendanceMap = new Map<string, Attendance>();
  for (const a of cloud.attendance) {
    attendanceMap.set(a.id, { ...a, uid: targetUid });
  }
  for (const a of local.attendance) {
    const existing = attendanceMap.get(a.id);
    if (!existing) {
      attendanceMap.set(a.id, { ...a, uid: targetUid });
    } else {
      const localTime = new Date(a.updatedAt || 0).getTime();
      const cloudTime = new Date(existing.updatedAt || 0).getTime();
      if (localTime >= cloudTime) {
        attendanceMap.set(a.id, { ...a, uid: targetUid });
      }
    }
  }

  // Merge Timetable by ID
  const timetableMap = new Map<string, TimetableEntry>();
  for (const t of cloud.timetable) {
    timetableMap.set(t.id, { ...t, uid: targetUid });
  }
  for (const t of local.timetable) {
    timetableMap.set(t.id, { ...t, uid: targetUid });
  }

  // Settings: local takes precedence if defined
  const mergedSettings: Settings = {
    uid: targetUid,
    defaultTarget: local.settings?.defaultTarget ?? cloud.settings?.defaultTarget ?? 75,
    theme: local.settings?.theme ?? cloud.settings?.theme ?? 'system',
    onboardingComplete: Boolean(local.settings?.onboardingComplete || cloud.settings?.onboardingComplete),
  };

  return {
    subjects: Array.from(subjectsMap.values()),
    attendance: Array.from(attendanceMap.values()),
    timetable: Array.from(timetableMap.values()),
    settings: mergedSettings,
  };
}

/**
 * Executes user's chosen conflict strategy with automatic pre-destructive backup snapshot.
 */
export async function executeConflictResolution(
  uid: string,
  choice: ConflictChoice,
  localData: UserDataset,
  cloudData: UserDataset
): Promise<void> {
  // Always create a safety snapshot before any overwrite
  await createPreSyncSnapshot(uid);

  if (choice === 'merge') {
    const merged = mergeUserData(localData, cloudData, uid);
    await restore(uid, merged, true, true, true);
    await executePush(uid);
  } else if (choice === 'keep_cloud') {
    await restore(uid, cloudData, true, true, true);
  } else if (choice === 'keep_device') {
    // Keep device: push local data to overwrite cloud
    await executePush(uid);
  }
}
