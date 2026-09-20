import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DetectedAttendance, DetectedEntry, ParsedAttendance } from './types';

const prompt = `Analyze this timetable only. Extract every instructional class as strict JSON, no markdown: {"timetable":[{"day":"Monday","startTime":"09:00","endTime":"10:00","subject":"","subjectCode":"","teacher":"","room":"","type":"Lecture","notes":""}]}. Days must be English weekday names. Use 24-hour HH:MM. Do not invent anything; use empty strings when unreadable. Include labs separately. Ignore breaks unless useful in notes.`;

const DAY_MAP: Record<string, string> = {
  sunday: 'Sunday', sun: 'Sunday',
  monday: 'Monday', mon: 'Monday',
  tuesday: 'Tuesday', tue: 'Tuesday', tues: 'Tuesday',
  wednesday: 'Wednesday', wed: 'Wednesday',
  thursday: 'Thursday', thu: 'Thursday', thurs: 'Thursday',
  friday: 'Friday', fri: 'Friday',
  saturday: 'Saturday', sat: 'Saturday',
};

function normalizeDay(day: unknown): string {
  if (typeof day !== 'string') return '';
  const trimmed = day.trim().toLowerCase();
  return DAY_MAP[trimmed] || (day.trim() ? day.trim()[0].toUpperCase() + day.trim().slice(1) : '');
}

function normalizeTime(time: unknown): string {
  if (typeof time !== 'string') return '';
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
  }
  return time.trim();
}

export function validateTimetableResponse(raw: unknown): { entries: DetectedEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { entries: [], warnings: ['Invalid JSON response structure'] };
  }
  const obj = raw as Record<string, unknown>;
  const list = Array.isArray(obj.timetable) ? obj.timetable : [];
  const entries: DetectedEntry[] = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== 'object') {
      warnings.push(`Entry at index ${i} was not a valid object and was skipped.`);
      continue;
    }
    const it = item as Record<string, unknown>;
    const rawDay = typeof it.day === 'string' ? it.day : '';
    const day = normalizeDay(rawDay);
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (!validDays.includes(day)) {
      warnings.push(`Entry at index ${i} has an unrecognized day "${rawDay}".`);
    }

    const startTime = normalizeTime(it.startTime);
    const endTime = normalizeTime(it.endTime);

    entries.push({
      day: (validDays.includes(day) ? day : rawDay) as any,
      startTime: startTime || '09:00',
      endTime: endTime || '10:00',
      subject: typeof it.subject === 'string' ? it.subject.trim() : '',
      subjectCode: typeof it.subjectCode === 'string' ? it.subjectCode.trim() : '',
      teacher: typeof it.teacher === 'string' ? it.teacher.trim() : '',
      room: typeof it.room === 'string' ? it.room.trim() : '',
      type: typeof it.type === 'string' ? it.type.trim() : 'Lecture',
      notes: typeof it.notes === 'string' ? it.notes.trim() : '',
    });
  }

  return { entries, warnings };
}

export function validateAttendanceResponse(raw: unknown): { records: DetectedAttendance[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { records: [], warnings: ['Invalid JSON response structure'] };
  }
  const obj = raw as Record<string, unknown>;
  const list = Array.isArray(obj.records) ? obj.records : [];
  const records: DetectedAttendance[] = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== 'object') {
      warnings.push(`Attendance record at index ${i} was not a valid object and was skipped.`);
      continue;
    }
    const it = item as Record<string, unknown>;

    let status: 'present' | 'absent' | 'unknown' = 'unknown';
    if (typeof it.status === 'string') {
      const s = it.status.trim().toLowerCase();
      if (s === 'present' || s === 'absent' || s === 'unknown') {
        status = s;
      }
    }

    let confidence: 'high' | 'low' = 'low';
    if (typeof it.confidence === 'string') {
      const c = it.confidence.trim().toLowerCase();
      if (c === 'high') {
        confidence = 'high';
      }
    }

    records.push({
      subject: typeof it.subject === 'string' ? it.subject.trim() : String(it.subject ?? '').trim(),
      subjectCode: typeof it.subjectCode === 'string' ? it.subjectCode.trim() : String(it.subjectCode ?? '').trim(),
      date: typeof it.date === 'string' ? it.date.trim() : '',
      status,
      confidence,
      note: typeof it.note === 'string' ? it.note.trim() : '',
      source: typeof it.source === 'string' ? it.source.trim() : '',
    });
  }

  return { records, warnings };
}

async function withTimeoutAndRetry<T>(fn: () => Promise<T>, timeoutMs = 30000, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
      );
      return await Promise.race([fn(), timeoutPromise]);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

export async function extractTimetable(file: File): Promise<DetectedEntry[]> {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error('AI import is not configured. Add a restricted Gemini key or connect a secure proxy.');
  if (file.size > 15 * 1024 * 1024) throw new Error('File is too large. Please use a file under 15 MB.');
  const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error('Use a PDF, PNG, JPG, JPEG, or WEBP timetable.');
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1]);
    r.onerror = () => reject(new Error('Could not read file.'));
    r.readAsDataURL(file);
  });

  try {
    const raw = await withTimeoutAndRetry(async () => {
      const model = new GoogleGenerativeAI(key).getGenerativeModel({
        model: 'gemini-3.5-flash-lite',
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent([
        { text: prompt },
        { inlineData: { data: base64, mimeType: file.type } },
      ]);
      return result.response.text();
    });

    const data = JSON.parse(raw);
    const validated = validateTimetableResponse(data);
    if (!validated.entries.length) throw new Error('No timetable entries were detected. Try a clearer file.');
    return validated.entries;
  } catch (e) {
    if (e instanceof Error && e.message.includes('No timetable')) throw e;
    throw new Error('We could not confidently read this timetable. Check your connection, key restrictions, or upload a clearer file.');
  }
}

// --- Attendance import ------------------------------------------------------------------------
const ATTENDANCE_CAP = 180000;
const attendancePrompt = `You are reading the raw text of a file a student exported or copied out of some attendance system. Extract every attendance record it contains.
Reply with strict JSON and nothing else — no markdown, no commentary:
{"records":[{"subject":"","subjectCode":"","date":"YYYY-MM-DD","status":"present","confidence":"high","note":"","source":""}],"warnings":[]}
Rules:
- The layout is unknown to you. It may be tuples, tables, CSV, bullet lists, key/value pairs, prose, or several of those mixed together, with any spacing, ordering or capitalisation. Work the structure out from the text itself.
- A heading, table name, section label or column header that names a course applies to every record beneath it until the next such heading. Put a spelled-out course name in "subject" and a code or abbreviation in "subjectCode". Either may be empty, but never both when the file makes the course knowable.
- "date" must be ISO YYYY-MM-DD. Join a month/year label to a day number when they are split across fields. Infer a missing year only from context that is actually present in the file; otherwise leave "date" empty and set "confidence":"low".
- "status" must be exactly "present", "absent" or "unknown". Map synonyms and marks: p, P, y, yes, present, attended, tick or check marks -> "present"; a, A, n, no, absent, missed, cut -> "absent". Leave, holiday, cancelled, medical, duty, blank or anything you are unsure of -> "unknown", with a short "note" saying what the source actually said.
- "confidence" is "high" only when subject, date and status are all unambiguous. Otherwise "low".
- "source" is the original line or fragment the record came from, trimmed to 80 characters. It is shown to the user so they can check your work.
- Never invent, extrapolate or fill in records, dates or subjects. If a row is unreadable, return it with "confidence":"low" instead of dropping it or guessing.
- Do not deduplicate or reorder. Return every record in the order it appears.
- "warnings": short plain-English notes about anything in the file you could not interpret. Use an empty array when there is nothing to report.`;

export async function extractAttendance(file: File): Promise<ParsedAttendance> {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error('AI import is not configured. Add a restricted Gemini key or connect a secure proxy.');
  const isTxt = file.name.toLowerCase().endsWith('.txt') && (!file.type || file.type === 'text/plain');
  if (!isTxt) throw new Error('Attendance import needs a plain .txt file. Export or paste your attendance into a text file and try again.');
  if (file.size > 2 * 1024 * 1024) throw new Error('That file is too large. Please use a .txt file under 2 MB.');
  let text: string;
  try { text = await file.text() } catch { throw new Error('Could not read that file. Try re-saving it as plain text.') }
  if (!text.trim()) throw new Error('That file is empty. Add your attendance data to it and upload again.');
  const truncated = text.length > ATTENDANCE_CAP;
  if (truncated) text = text.slice(0, ATTENDANCE_CAP);

  let raw: string;
  try {
    raw = await withTimeoutAndRetry(async () => {
      const model = new GoogleGenerativeAI(key).getGenerativeModel({
        model: 'gemini-3.5-flash-lite',
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent([
        { text: attendancePrompt },
        { text: `--- BEGIN FILE ---\n${text}\n--- END FILE ---` },
      ]);
      return result.response.text();
    });
  } catch {
    throw new Error('We could not reach Gemini or could not read its reply. Check your connection and key restrictions, then try the analysis again.');
  }

  let data: { records?: unknown; warnings?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Gemini returned an invalid response. Check your connection and retry.');
  }

  const validated = validateAttendanceResponse(data);
  if (!validated.records.length) {
    throw new Error('Gemini could not find any attendance records in that file. Check that the text actually contains attendance data, then retry.');
  }

  const warnings = [
    ...validated.warnings,
    ...(Array.isArray(data.warnings) ? (data.warnings as unknown[]).filter((w): w is string => typeof w === 'string' && w.trim().length > 0).slice(0, 8) : []),
  ];

  return { records: validated.records, warnings, truncated };
}
