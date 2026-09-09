export type AttendanceStatus = 'present' | 'absent' | 'unmarked';
export type Theme = 'light' | 'dark' | 'amoled' | 'system';
export interface Subject { id: string; uid: string; name: string; code: string; teacher: string; room: string; color: string; target: number; createdAt: string }
export interface Attendance { id: string; uid: string; subjectId: string; date: string; sessionId: string; status: AttendanceStatus; updatedAt: string }
export interface TimetableEntry { id: string; uid: string; day: string; subjectId: string; subject: string; startTime: string; endTime: string; room: string; teacher: string; type: string; notes: string; order: number }
export interface Settings { uid: string; defaultTarget: number; theme: Theme; onboardingComplete: boolean }
export interface UserRecord { uid: string; email: string; name: string; photoURL: string; updatedAt: string }
export interface BackupPayload { version: 1; createdAt: string; account: { email: string; uid: string }; subjects: Subject[]; attendance: Attendance[]; timetable: TimetableEntry[]; settings: Settings }
export const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
