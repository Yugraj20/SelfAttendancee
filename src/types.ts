export type AttendanceStatus = 'present' | 'absent' | 'unmarked' | 'cancelled';
export type Theme = 'light' | 'dark' | 'amoled' | 'system';
export interface Subject { id: string; uid: string; name: string; code: string; teacher: string; room: string; color: string; target: number; createdAt: string }
export interface Attendance { id: string; uid: string; subjectId: string; date: string; sessionId: string; status: AttendanceStatus; updatedAt: string }
export interface TimetableEntry { id: string; uid: string; day: string; subjectId: string; subject: string; startTime: string; endTime: string; room: string; teacher: string; type: string; notes: string; order: number }
export interface Settings { uid: string; defaultTarget: number; theme: Theme; onboardingComplete: boolean }
export interface UserRecord { uid: string; email: string; name: string; photoURL: string; updatedAt: string }
export interface BackupPayload { version: 1; createdAt: string; account: { email: string; uid: string }; subjects: Subject[]; attendance: Attendance[]; timetable: TimetableEntry[]; settings: Settings }
export type DetectedEntry = Partial<TimetableEntry> & { subjectCode?: string };
// --- AI attendance import -------------------------------------------------------------------
// What Gemini hands back for a .txt attendance dump. Every field is optional/untrusted: the model
// is told to emit low-confidence rows rather than drop them, so validation happens in
// attendance-import.ts, never here.
export type DetectedStatus = 'present' | 'absent' | 'unknown';
export interface DetectedAttendance { subject?: string; subjectCode?: string; date?: string; status?: DetectedStatus; confidence?: 'high' | 'low'; note?: string; source?: string }
export interface ParsedAttendance { records: DetectedAttendance[]; warnings: string[]; truncated: boolean }
// One reviewable row in the confirmation screen. `issue` drives the Needs review bucket.
export type RowIssue = 'none' | 'no-date' | 'bad-date' | 'no-status' | 'no-subject' | 'low-confidence' | 'duplicate' | 'conflict';
export interface ReviewRow { key: string; subjectKey: string; label: string; date: string; status: DetectedStatus; issue: RowIssue; note: string; source: string; low: boolean; existingStatus?: AttendanceStatus; include: boolean }
export type MatchKind = 'name' | 'code' | 'abbreviation' | 'partial' | 'none';
export type SubjectAction = 'link' | 'create' | 'skip';
// A detected subject plus what the user decided to do with it. `matchId` is the existing subject it
// will be filed under when action is 'link'.
export interface SubjectGroup { key: string; label: string; name: string; code: string; matchId: string; matchKind: MatchKind; action: SubjectAction; rows: ReviewRow[] }
export const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
