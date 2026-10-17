import { openDB, type DBSchema } from 'idb';
import type { Attendance, Settings, Subject, TimetableEntry, UserRecord } from './types';

interface AttendanceDB extends DBSchema {
  users: { key: string; value: UserRecord };
  subjects: { key: string; value: Subject; indexes: { 'by-uid': string } };
  attendance: { key: string; value: Attendance; indexes: { 'by-uid': string; 'by-user-date': [string, string] } };
  timetable: { key: string; value: TimetableEntry; indexes: { 'by-uid': string } };
  settings: { key: string; value: Settings };
}
const DB_NAME = 'SelfAttendance';
const DB_VERSION = 1;
function openAttendanceDB() {
  return openDB<AttendanceDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('users', { keyPath: 'uid' });
      const subjects = db.createObjectStore('subjects', { keyPath: 'id' }); subjects.createIndex('by-uid', 'uid');
      const attendance = db.createObjectStore('attendance', { keyPath: 'id' }); attendance.createIndex('by-uid', 'uid'); attendance.createIndex('by-user-date', ['uid', 'date']);
      const timetable = db.createObjectStore('timetable', { keyPath: 'id' }); timetable.createIndex('by-uid', 'uid');
      db.createObjectStore('settings', { keyPath: 'uid' });
    }
  });
}
let dbPromise = openAttendanceDB();
export function getDb() { return dbPromise; }
export async function _resetDbForTesting() {
  const db = await dbPromise;
  db.close();
  await indexedDB.deleteDatabase(DB_NAME);
  dbPromise = openAttendanceDB();
}
export const id = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
    );
  }
  return Math.random().toString(36).slice(2, 11) + Math.random().toString(36).slice(2, 11);
};
export async function userData(uid: string) { const db = await dbPromise; const [subjects, attendance, timetable, settings] = await Promise.all([db.getAllFromIndex('subjects', 'by-uid', uid), db.getAllFromIndex('attendance', 'by-uid', uid), db.getAllFromIndex('timetable', 'by-uid', uid), db.get('settings', uid)]); return { subjects, attendance, timetable, settings: settings ?? { uid, defaultTarget: 75, theme: 'system' as const, onboardingComplete: false } }; }
export async function put(store: 'subjects' | 'attendance' | 'timetable' | 'settings' | 'users', value: Subject | Attendance | TimetableEntry | Settings | UserRecord) { return (await dbPromise).put(store as never, value as never); }
export async function remove(store: 'subjects' | 'attendance' | 'timetable', key: string) { return (await dbPromise).delete(store as never, key); }
export async function clearUser(uid: string) { const db = await dbPromise; const tx = db.transaction(['subjects', 'attendance', 'timetable', 'settings', 'users'], 'readwrite'); for (const name of ['subjects', 'attendance', 'timetable'] as const) { const store = tx.objectStore(name); const keys = await store.index('by-uid').getAllKeys(uid); await Promise.all(keys.map(k => store.delete(k))); } await tx.objectStore('settings').delete(uid); const usersStore = tx.objectStore('users'); await usersStore.delete(`reconciled:${uid}`); await usersStore.delete(`dirty:${uid}`); const userKeys = await usersStore.getAllKeys(); for (const k of userKeys) { if (typeof k === 'string' && k.startsWith('snapshot:pre-sync-')) await usersStore.delete(k); } await tx.done; }
const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateRestoreData(data: unknown): { subjects: Subject[]; attendance: Attendance[]; timetable: TimetableEntry[]; settings: Settings } {
  if (!data || typeof data !== 'object') throw new Error('Invalid data: payload must be an object');
  const d = data as any;
  if (!Array.isArray(d.subjects) || !Array.isArray(d.attendance) || !Array.isArray(d.timetable)) {
    throw new Error('Invalid data: subjects, attendance, and timetable must be arrays');
  }
  for (let i = 0; i < d.subjects.length; i++) {
    const s = d.subjects[i];
    if (!s || typeof s !== 'object') throw new Error(`Invalid subject at index ${i}`);
    if (typeof s.id !== 'string' || !s.id.trim()) throw new Error(`Missing or invalid subject id at index ${i}`);
    if (typeof s.name !== 'string' || !s.name.trim()) throw new Error(`Missing or invalid subject name at index ${i}`);
    if (typeof s.target !== 'number' || !Number.isFinite(s.target) || s.target < 1 || s.target > 100) {
      throw new Error(`Subject target must be a number between 1 and 100 at index ${i}`);
    }
  }
  for (let i = 0; i < d.attendance.length; i++) {
    const a = d.attendance[i];
    if (!a || typeof a !== 'object') throw new Error(`Invalid attendance record at index ${i}`);
    if (typeof a.id !== 'string' || !a.id.trim()) throw new Error(`Missing or invalid attendance id at index ${i}`);
    if (typeof a.subjectId !== 'string' || !a.subjectId.trim()) throw new Error(`Missing or invalid attendance subjectId at index ${i}`);
    if (typeof a.date !== 'string' || !ISO_DATE_REGEX.test(a.date) || isNaN(Date.parse(a.date))) {
      throw new Error(`Invalid attendance date format at index ${i}: must be YYYY-MM-DD`);
    }
    if (a.status !== 'present' && a.status !== 'absent' && a.status !== 'unmarked' && a.status !== 'cancelled') {
      throw new Error(`Invalid attendance status at index ${i}: must be present, absent, unmarked, or cancelled`);
    }
  }
  for (let i = 0; i < d.timetable.length; i++) {
    const t = d.timetable[i];
    if (!t || typeof t !== 'object') throw new Error(`Invalid timetable entry at index ${i}`);
    if (typeof t.id !== 'string' || !t.id.trim()) throw new Error(`Missing or invalid timetable id at index ${i}`);
    if (!VALID_DAYS.includes(t.day)) throw new Error(`Invalid timetable day name at index ${i}`);
    if (typeof t.startTime !== 'string' || !HH_MM_REGEX.test(t.startTime)) {
      throw new Error(`Invalid timetable startTime at index ${i}: must be HH:MM`);
    }
    if (typeof t.endTime !== 'string' || !HH_MM_REGEX.test(t.endTime)) {
      throw new Error(`Invalid timetable endTime at index ${i}: must be HH:MM`);
    }
  }
  if (d.settings && typeof d.settings === 'object') {
    if (d.settings.defaultTarget !== undefined) {
      if (typeof d.settings.defaultTarget !== 'number' || !Number.isFinite(d.settings.defaultTarget) || d.settings.defaultTarget < 1 || d.settings.defaultTarget > 100) {
        throw new Error('defaultTarget must be between 1 and 100');
      }
    }
    if (d.settings.theme !== undefined && !['system', 'light', 'dark', 'amoled'].includes(d.settings.theme)) {
      throw new Error('theme must be system, light, dark, or amoled');
    }
  }
  return d as { subjects: Subject[]; attendance: Attendance[]; timetable: TimetableEntry[]; settings: Settings };
}

export interface QuarantineReport {
  quarantined: {
    subjects: unknown[];
    attendance: unknown[];
    timetable: unknown[];
  };
  totalQuarantined: number;
}

let lastQuarantineReport: QuarantineReport | null = null;
export function getLastQuarantineReport(): QuarantineReport | null {
  return lastQuarantineReport;
}
export function clearLastQuarantineReport(): void {
  lastQuarantineReport = null;
}

export function sanitizeAndQuarantineData(data: unknown): {
  valid: { subjects: Subject[]; attendance: Attendance[]; timetable: TimetableEntry[]; settings: Settings };
  quarantineReport: QuarantineReport;
} {
  const quarantined: QuarantineReport['quarantined'] = { subjects: [], attendance: [], timetable: [] };
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data: payload must be an object');
  }
  const d = data as any;
  const rawSubjects = Array.isArray(d.subjects) ? d.subjects : [];
  const rawAttendance = Array.isArray(d.attendance) ? d.attendance : [];
  const rawTimetable = Array.isArray(d.timetable) ? d.timetable : [];

  const validSubjects: Subject[] = [];
  for (let i = 0; i < rawSubjects.length; i++) {
    const s = rawSubjects[i];
    if (
      s &&
      typeof s === 'object' &&
      typeof s.id === 'string' &&
      s.id.trim() &&
      typeof s.name === 'string' &&
      s.name.trim()
    ) {
      const target = typeof s.target === 'number' && Number.isFinite(s.target)
        ? Math.max(1, Math.min(100, Math.round(s.target)))
        : 75;
      validSubjects.push({
        id: s.id.trim(),
        uid: typeof s.uid === 'string' ? s.uid : '',
        name: s.name.trim(),
        code: typeof s.code === 'string' ? s.code.trim() : '',
        teacher: typeof s.teacher === 'string' ? s.teacher.trim() : '',
        room: typeof s.room === 'string' ? s.room.trim() : '',
        color: typeof s.color === 'string' ? s.color : '#6d5dfc',
        target,
        createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
      });
    } else {
      quarantined.subjects.push(s);
    }
  }

  const validAttendance: Attendance[] = [];
  for (let i = 0; i < rawAttendance.length; i++) {
    const a = rawAttendance[i];
    if (
      a &&
      typeof a === 'object' &&
      typeof a.id === 'string' &&
      a.id.trim() &&
      typeof a.subjectId === 'string' &&
      a.subjectId.trim() &&
      typeof a.date === 'string' &&
      ISO_DATE_REGEX.test(a.date) &&
      !isNaN(Date.parse(a.date)) &&
      (a.status === 'present' || a.status === 'absent' || a.status === 'unmarked' || a.status === 'cancelled')
    ) {
      validAttendance.push({
        id: a.id.trim(),
        uid: typeof a.uid === 'string' ? a.uid : '',
        subjectId: a.subjectId.trim(),
        date: a.date,
        sessionId: typeof a.sessionId === 'string' ? a.sessionId : 'manual',
        status: a.status,
        updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : new Date().toISOString(),
        ...(typeof a.startTime === 'string' ? { startTime: a.startTime } : {}),
        ...(typeof a.endTime === 'string' ? { endTime: a.endTime } : {}),
        ...(typeof a.room === 'string' ? { room: a.room } : {}),
        ...(typeof a.isExtra === 'boolean' ? { isExtra: a.isExtra } : {}),
      });
    } else {
      quarantined.attendance.push(a);
    }
  }

  const validTimetable: TimetableEntry[] = [];
  for (let i = 0; i < rawTimetable.length; i++) {
    const t = rawTimetable[i];
    if (
      t &&
      typeof t === 'object' &&
      typeof t.id === 'string' &&
      t.id.trim() &&
      VALID_DAYS.includes(t.day) &&
      typeof t.startTime === 'string' &&
      HH_MM_REGEX.test(t.startTime) &&
      typeof t.endTime === 'string' &&
      HH_MM_REGEX.test(t.endTime)
    ) {
      validTimetable.push({
        id: t.id.trim(),
        uid: typeof t.uid === 'string' ? t.uid : '',
        day: t.day,
        subjectId: typeof t.subjectId === 'string' ? t.subjectId : '',
        subject: typeof t.subject === 'string' ? t.subject.trim() : '',
        startTime: t.startTime,
        endTime: t.endTime,
        room: typeof t.room === 'string' ? t.room.trim() : '',
        teacher: typeof t.teacher === 'string' ? t.teacher.trim() : '',
        type: typeof t.type === 'string' ? t.type.trim() : 'Lecture',
        notes: typeof t.notes === 'string' ? t.notes.trim() : '',
        order: typeof t.order === 'number' ? t.order : 0,
      });
    } else {
      quarantined.timetable.push(t);
    }
  }

  const rawSettings = d.settings;
  const sanitizedSettings: Settings = {
    uid: typeof rawSettings?.uid === 'string' ? rawSettings.uid : '',
    defaultTarget: typeof rawSettings?.defaultTarget === 'number' && Number.isFinite(rawSettings.defaultTarget)
      ? Math.max(1, Math.min(100, Math.round(rawSettings.defaultTarget)))
      : 75,
    theme: rawSettings?.theme && ['system', 'light', 'dark', 'amoled'].includes(rawSettings.theme)
      ? rawSettings.theme
      : 'system',
    onboardingComplete: Boolean(rawSettings?.onboardingComplete),
  };

  const totalQuarantined = quarantined.subjects.length + quarantined.attendance.length + quarantined.timetable.length;
  return {
    valid: {
      subjects: validSubjects,
      attendance: validAttendance,
      timetable: validTimetable,
      settings: sanitizedSettings,
    },
    quarantineReport: {
      quarantined,
      totalQuarantined,
    },
  };
}

export async function previewRestore(
  uid: string,
  data: { subjects: Subject[]; attendance: Attendance[]; timetable: TimetableEntry[]; settings?: Settings },
  mode: 'merge' | 'replace'
): Promise<{ added: number; updated: number; skipped: number; quarantined?: number }> {
  const { valid: targetData, quarantineReport } = sanitizeAndQuarantineData(data as any);
  if (mode === 'replace') {
    return {
      added: targetData.subjects.length + targetData.attendance.length + targetData.timetable.length,
      updated: 0,
      skipped: 0,
      quarantined: quarantineReport.totalQuarantined,
    };
  }

  const db = await dbPromise;
  const [localSubjects, localAttendance, localTimetable] = await Promise.all([
    db.getAllFromIndex('subjects', 'by-uid', uid),
    db.getAllFromIndex('attendance', 'by-uid', uid),
    db.getAllFromIndex('timetable', 'by-uid', uid),
  ]);

  const subMap = new Map(localSubjects.map(s => [s.id, s]));
  const attMap = new Map(localAttendance.map(a => [a.id, a]));
  const timeMap = new Map(localTimetable.map(t => [t.id, t]));

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const s of targetData.subjects) {
    const local = subMap.get(s.id);
    if (!local) {
      added++;
    } else {
      const localTime = (local as any).updatedAt || local.createdAt || '';
      const backupTime = (s as any).updatedAt || s.createdAt || '';
      if (backupTime && localTime && backupTime < localTime) {
        skipped++;
      } else {
        updated++;
      }
    }
  }

  for (const a of targetData.attendance) {
    const local = attMap.get(a.id);
    if (!local) {
      added++;
    } else {
      if (a.updatedAt && local.updatedAt && a.updatedAt < local.updatedAt) {
        skipped++;
      } else {
        updated++;
      }
    }
  }

  for (const t of targetData.timetable) {
    const local = timeMap.get(t.id);
    if (!local) {
      added++;
    } else {
      updated++;
    }
  }

  return { added, updated, skipped, quarantined: quarantineReport.totalQuarantined };
}

// The wipe and the rewrite share one transaction. Clearing in a separate transaction first meant
// a failure part-way through the rewrite left the account with no local data at all — the worst
// possible outcome for the one call that runs on every sign-in.
export async function restore(
  uid: string,
  data: { subjects: Subject[]; attendance: Attendance[]; timetable: TimetableEntry[]; settings: Settings },
  replace: boolean,
  restoreSettings: boolean = true,
  quarantine: boolean = false
): Promise<{ added: number; updated: number; skipped: number; quarantined?: number }> {
  let targetData = data;
  let quarantinedCount = 0;
  if (quarantine) {
    const res = sanitizeAndQuarantineData(data);
    lastQuarantineReport = res.quarantineReport.totalQuarantined > 0 ? res.quarantineReport : null;
    targetData = res.valid;
    quarantinedCount = res.quarantineReport.totalQuarantined;
  } else {
    validateRestoreData(data);
  }
  const db = await dbPromise;
  const tx = db.transaction(['subjects', 'attendance', 'timetable', 'settings'], 'readwrite');
  try {
    let added = 0;
    let updated = 0;
    let skipped = 0;

    if (replace) {
      for (const name of ['subjects', 'attendance', 'timetable'] as const) {
        const store = tx.objectStore(name);
        const keys = await store.index('by-uid').getAllKeys(uid);
        await Promise.all(keys.map(k => store.delete(k)));
      }
      if (restoreSettings) await tx.objectStore('settings').delete(uid);

      for (const s of targetData.subjects) {
        await tx.objectStore('subjects').put({ ...s, uid });
        added++;
      }
      for (const a of targetData.attendance) {
        await tx.objectStore('attendance').put({ ...a, uid });
        added++;
      }
      for (const t of targetData.timetable) {
        await tx.objectStore('timetable').put({ ...t, uid });
        added++;
      }
      if (targetData.settings && restoreSettings) {
        await tx.objectStore('settings').put({ ...targetData.settings, uid });
      }
    } else {
      const [localSubjects, localAttendance, localTimetable] = await Promise.all([
        tx.objectStore('subjects').index('by-uid').getAll(uid),
        tx.objectStore('attendance').index('by-uid').getAll(uid),
        tx.objectStore('timetable').index('by-uid').getAll(uid),
      ]);

      const subMap = new Map(localSubjects.map(s => [s.id, s]));
      const attMap = new Map(localAttendance.map(a => [a.id, a]));
      const timeMap = new Map(localTimetable.map(t => [t.id, t]));

      for (const s of targetData.subjects) {
        const local = subMap.get(s.id);
        if (!local) {
          await tx.objectStore('subjects').put({ ...s, uid });
          added++;
        } else {
          const localTime = (local as any).updatedAt || local.createdAt || '';
          const backupTime = (s as any).updatedAt || s.createdAt || '';
          if (backupTime && localTime && backupTime < localTime) {
            skipped++;
          } else {
            await tx.objectStore('subjects').put({ ...s, uid });
            updated++;
          }
        }
      }

      for (const a of targetData.attendance) {
        const local = attMap.get(a.id);
        if (!local) {
          await tx.objectStore('attendance').put({ ...a, uid });
          added++;
        } else {
          if (a.updatedAt && local.updatedAt && a.updatedAt < local.updatedAt) {
            skipped++;
          } else {
            await tx.objectStore('attendance').put({ ...a, uid });
            updated++;
          }
        }
      }

      for (const t of targetData.timetable) {
        const local = timeMap.get(t.id);
        if (!local) {
          await tx.objectStore('timetable').put({ ...t, uid });
          added++;
        } else {
          await tx.objectStore('timetable').put({ ...t, uid });
          updated++;
        }
      }

      if (targetData.settings && restoreSettings) {
        await tx.objectStore('settings').put({ ...targetData.settings, uid });
      }
    }

    await tx.done;
    return { added, updated, skipped, quarantined: quarantinedCount };
  } catch (err) {
    try { tx.abort(); } catch { }
    throw err;
  }
}
export async function importTimetableData(uid: string, subjectsToCreateOrUpdate: Subject[], timetableToInsert: TimetableEntry[]) { const db = await dbPromise; const tx = db.transaction(['subjects', 'timetable'], 'readwrite'); const timetableStore = tx.objectStore('timetable'); const oldKeys = await timetableStore.index('by-uid').getAllKeys(uid); await Promise.all(oldKeys.map(k => timetableStore.delete(k))); for (const s of subjectsToCreateOrUpdate) await tx.objectStore('subjects').put(s); for (const t of timetableToInsert) await timetableStore.put(t); await tx.done; }
// Attendance import writes subjects and attendance in one transaction and never opens the
// timetable store, so a failure rolls the whole import back rather than leaving half of it behind.
export async function importAttendanceData(subjectsToCreate: Subject[], recordsToWrite: Attendance[]) { const db = await dbPromise; const tx = db.transaction(['subjects', 'attendance'], 'readwrite'); for (const s of subjectsToCreate) await tx.objectStore('subjects').put(s); for (const a of recordsToWrite) await tx.objectStore('attendance').put(a); await tx.done; }

export async function isReconciled(uid: string): Promise<boolean> {
  if (!uid) return false;
  const db = await dbPromise;
  const rec = await db.get('users', `reconciled:${uid}`);
  return Boolean(rec);
}

export async function setReconciled(uid: string, reconciled: boolean): Promise<void> {
  if (!uid) return;
  const db = await dbPromise;
  if (reconciled) {
    await db.put('users', { uid: `reconciled:${uid}`, email: '', name: '', photoURL: '', updatedAt: new Date().toISOString() });
  } else {
    await db.delete('users', `reconciled:${uid}`);
  }
}

let globalRevision = Date.now();

export async function isDirty(uid: string): Promise<boolean> {
  if (!uid) return false;
  const db = await dbPromise;
  const rec = await db.get('users', `dirty:${uid}`);
  return Boolean(rec);
}

export async function getDirtyRevision(uid: string): Promise<number> {
  if (!uid) return 0;
  const db = await dbPromise;
  const rec = await db.get('users', `dirty:${uid}`);
  if (!rec) return 0;
  return (rec as any).revision ?? 1;
}

export async function markDirty(uid: string): Promise<number> {
  if (!uid) return 0;
  const db = await dbPromise;
  const rev = ++globalRevision;
  await db.put('users', {
    uid: `dirty:${uid}`,
    email: '',
    name: '',
    photoURL: '',
    updatedAt: new Date().toISOString(),
    revision: rev,
  } as any);
  return rev;
}

export async function clearDirty(uid: string, expectedRevision?: number): Promise<boolean> {
  if (!uid) return false;
  const db = await dbPromise;
  if (expectedRevision !== undefined) {
    const rec = await db.get('users', `dirty:${uid}`);
    if (!rec) return true;
    const currentRev = (rec as any).revision ?? 1;
    if (currentRev !== expectedRevision) {
      return false;
    }
  }
  await db.delete('users', `dirty:${uid}`);
  return true;
}

export async function setDirty(uid: string, dirty: boolean, expectedRevision?: number): Promise<boolean> {
  if (!uid) return false;
  if (dirty) {
    await markDirty(uid);
    return true;
  } else {
    return clearDirty(uid, expectedRevision);
  }
}

