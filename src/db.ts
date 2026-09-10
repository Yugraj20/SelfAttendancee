import { openDB, type DBSchema } from 'idb';
import type { Attendance, Settings, Subject, TimetableEntry, UserRecord } from './types';

interface AttendanceDB extends DBSchema {
  users: { key: string; value: UserRecord };
  subjects: { key: string; value: Subject; indexes: { 'by-uid': string } };
  attendance: { key: string; value: Attendance; indexes: { 'by-uid': string; 'by-user-date': [string, string] } };
  timetable: { key: string; value: TimetableEntry; indexes: { 'by-uid': string } };
  settings: { key: string; value: Settings };
}
const dbPromise = openDB<AttendanceDB>('SelfAttendance', 1, { upgrade(db) {
  db.createObjectStore('users', { keyPath: 'uid' });
  const subjects = db.createObjectStore('subjects', { keyPath: 'id' }); subjects.createIndex('by-uid', 'uid');
  const attendance = db.createObjectStore('attendance', { keyPath: 'id' }); attendance.createIndex('by-uid', 'uid'); attendance.createIndex('by-user-date', ['uid', 'date']);
  const timetable = db.createObjectStore('timetable', { keyPath: 'id' }); timetable.createIndex('by-uid', 'uid');
  db.createObjectStore('settings', { keyPath: 'uid' });
}});
export const id = () => crypto.randomUUID();
export async function userData(uid: string) { const db = await dbPromise; const [subjects, attendance, timetable, settings] = await Promise.all([db.getAllFromIndex('subjects','by-uid',uid), db.getAllFromIndex('attendance','by-uid',uid), db.getAllFromIndex('timetable','by-uid',uid), db.get('settings',uid)]); return { subjects, attendance, timetable, settings: settings ?? { uid, defaultTarget: 75, theme: 'system' as const, onboardingComplete: false } }; }
export async function put(store: 'subjects'|'attendance'|'timetable'|'settings'|'users', value: Subject|Attendance|TimetableEntry|Settings|UserRecord) { return (await dbPromise).put(store as never, value as never); }
export async function remove(store: 'subjects'|'attendance'|'timetable', key: string) { return (await dbPromise).delete(store as never, key); }
export async function clearUser(uid: string) { const db = await dbPromise; const tx = db.transaction(['subjects','attendance','timetable','settings'], 'readwrite'); for (const name of ['subjects','attendance','timetable'] as const) { const store = tx.objectStore(name); const keys = await store.index('by-uid').getAllKeys(uid); await Promise.all(keys.map(k => store.delete(k))); } await tx.objectStore('settings').delete(uid); await tx.done; }
export async function restore(uid: string, data: { subjects: Subject[]; attendance: Attendance[]; timetable: TimetableEntry[]; settings: Settings }, replace: boolean) { if (replace) await clearUser(uid); const db = await dbPromise; const tx = db.transaction(['subjects','attendance','timetable','settings'], 'readwrite'); for (const s of data.subjects) await tx.objectStore('subjects').put({ ...s, uid }); for (const a of data.attendance) await tx.objectStore('attendance').put({ ...a, uid }); for (const t of data.timetable) await tx.objectStore('timetable').put({ ...t, uid }); await tx.objectStore('settings').put({ ...data.settings, uid }); await tx.done; }
export async function importTimetableData(subjectsToCreateOrUpdate: Subject[], timetableToInsert: TimetableEntry[]) { const db = await dbPromise; const tx = db.transaction(['subjects','timetable'], 'readwrite'); for (const s of subjectsToCreateOrUpdate) await tx.objectStore('subjects').put(s); for (const t of timetableToInsert) await tx.objectStore('timetable').put(t); await tx.done; }
