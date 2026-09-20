import type { BackupPayload } from './types';

export function makeBackup(data: BackupPayload) {
  const lines = [
    'SELF ATTENDANCE BACKUP',
    '======================',
    '',
    `Backup Version: ${data.version}`,
    `Backup Date: ${data.createdAt}`,
    `Account: ${data.account.email}`,
    '',
    'SUBJECTS',
    '--------',
  ];
  data.subjects.forEach(s => lines.push(`${s.name} | ${s.code} | Target: ${s.target}%`));
  lines.push('', 'ATTENDANCE', '----------');
  data.attendance.forEach(a => lines.push(`${a.date} | ${a.subjectId} | ${a.status}`));
  lines.push('', 'TIMETABLE', '---------');
  data.timetable.forEach(t => lines.push(`${t.day} | ${t.startTime} | ${t.endTime} | ${t.subject} | ${t.room}`));
  lines.push(
    '',
    'STRUCTURED DATA (do not edit)',
    '------------------------------',
    JSON.stringify(data),
    '======================',
    'END OF BACKUP'
  );
  return lines.join('\n');
}

export function parseBackup(text: string): BackupPayload {
  let clean = text;
  // Strip UTF-8 BOM if present (BUG-032)
  if (clean.charCodeAt(0) === 0xfeff) {
    clean = clean.slice(1);
  }
  // Normalize CRLF to LF (BUG-032)
  clean = clean.replace(/\r\n/g, '\n');

  if (!clean.startsWith('SELF ATTENDANCE BACKUP')) throw new Error('This is not a Self Attendance backup.');
  const marker = 'STRUCTURED DATA (do not edit)\n------------------------------\n';
  const start = clean.indexOf(marker);
  const end = clean.indexOf('\n======================', start);
  if (start < 0 || end < 0) throw new Error('This backup is missing structured data.');
  let p: unknown;
  try {
    p = JSON.parse(clean.slice(start + marker.length, end));
  } catch {
    throw new Error('The backup data is invalid.');
  }
  const d = p as BackupPayload;
  if (
    d.version !== 1 ||
    !Array.isArray(d.subjects) ||
    !Array.isArray(d.attendance) ||
    !Array.isArray(d.timetable) ||
    !d.settings
  ) {
    throw new Error('The backup format is incomplete.');
  }
  return d;
}
