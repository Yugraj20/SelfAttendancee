// Turns Gemini's loosely-typed attendance extraction into something the confirmation screen can
// show and the database can accept. Nothing here talks to IndexedDB or to Gemini — it is pure
// data shaping, so the review UI can re-run it on every edit the user makes.
import { id } from './db';
import type { Attendance, DetectedAttendance, DetectedStatus, MatchKind, ParsedAttendance, ReviewRow, RowIssue, Subject, SubjectGroup } from './types';

const STOP = new Set(['of', 'and', 'the', 'for', 'in', 'to', 'a', 'an', 'on', 'with', 'amp']);
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (v: string) => norm(v).split(' ').filter(w => w && !STOP.has(w));
/** "Computer Organisation and Architecture" -> "coa", so a file that only says COA still matches. */
const acronym = (v: string) => { const w = words(v); return w.length > 1 ? w.map(x => x[0]).join('') : '' };

/** ISO date that is both well-formed and real — rejects 2026-02-31 and 2026-13-01. */
export function validISO(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate() && y >= 1990 && y <= 2100;
}

/**
 * Finds the existing subject an imported name/code refers to. Tolerates capitalisation, spacing,
 * punctuation, codes used in place of names, acronyms, and one string containing the other.
 * Returns kind 'none' when nothing is close enough to be safe — the caller surfaces that to the
 * user rather than guessing.
 */
export function matchSubject(name: string, code: string, subjects: Subject[]): { id: string; kind: MatchKind } {
  const queries = [name, code].filter(q => q && q.trim());
  if (!queries.length || !subjects.length) return { id: '', kind: 'none' };
  const exactName = new Map<string, string>(), exactCode = new Map<string, string>(), abbr = new Map<string, string>();
  for (const s of subjects) {
    if (s.name.trim()) { exactName.set(compact(s.name), s.id); const a = acronym(s.name); if (a.length > 1 && !abbr.has(a)) abbr.set(a, s.id) }
    if (s.code.trim()) exactCode.set(compact(s.code), s.id);
  }
  for (const q of queries) { const hit = exactName.get(compact(q)); if (hit) return { id: hit, kind: 'name' } }
  for (const q of queries) { const hit = exactCode.get(compact(q)); if (hit) return { id: hit, kind: 'code' } }
  for (const q of queries) { const hit = abbr.get(compact(q)); if (hit) return { id: hit, kind: 'abbreviation' } }
  // Last resort: containment or heavy word overlap, both guarded so short codes can't collide.
  for (const q of queries) {
    const cq = compact(q), wq = words(q);
    if (cq.length < 3) continue;
    for (const s of subjects) {
      const cs = compact(s.name);
      if (cs.length >= 3 && (cs.includes(cq) || cq.includes(cs))) return { id: s.id, kind: 'partial' };
      const ws = words(s.name);
      if (wq.length && ws.length) { const shared = wq.filter(w => ws.includes(w)).length; if (shared / Math.min(wq.length, ws.length) >= 0.6) return { id: s.id, kind: 'partial' } }
    }
  }
  return { id: '', kind: 'none' };
}

const cleanStatus = (v?: DetectedStatus): DetectedStatus => (v === 'present' || v === 'absent' ? v : 'unknown');

/**
 * Groups the raw extraction by subject and resolves each group against the user's existing
 * subjects. Runs once per analysis; the user's choices are then edited on top of the result.
 */
export function analyse(parsed: ParsedAttendance, subjects: Subject[]): SubjectGroup[] {
  const groups = new Map<string, SubjectGroup>();
  parsed.records.forEach((r: DetectedAttendance, i) => {
    const name = (r.subject ?? '').trim(), code = (r.subjectCode ?? '').trim();
    const key = name || code ? compact(name) + '|' + compact(code) : 'unknown-subject';
    let g = groups.get(key);
    if (!g) {
      const match = matchSubject(name, code, subjects);
      g = { key, label: name || code || 'Unnamed subject', name, code, matchId: match.id, matchKind: match.kind, action: match.id ? 'link' : name || code ? 'create' : 'skip', rows: [] };
      groups.set(key, g);
    }
    const low = r.confidence === 'low';
    g.rows.push({ key: `r${i}`, subjectKey: key, label: g.label, date: (r.date ?? '').trim(), status: cleanStatus(r.status), issue: 'none', note: (r.note ?? '').trim() || (low ? 'Gemini was not fully confident about this row.' : ''), source: (r.source ?? '').trim().slice(0, 90), low, include: true });
  });
  return [...groups.values()];
}

/** Flags each row against what is already stored, given the user's current subject decisions. */
export function annotate(groups: SubjectGroup[], existing: Attendance[]): SubjectGroup[] {
  const byKey = new Map<string, Attendance>();
  for (const a of existing) if (a.status !== 'unmarked') byKey.set(`${a.subjectId}|${a.date}`, a);
  return groups.map(g => {
    const seen = new Set<string>();
    return { ...g, rows: g.rows.map(row => {
      let issue: RowIssue = 'none'; let existingStatus: Attendance['status'] | undefined;
      if (!g.name && !g.code) issue = 'no-subject';
      else if (!row.date) issue = 'no-date';
      else if (!validISO(row.date)) issue = 'bad-date';
      else if (row.status === 'unknown') issue = 'no-status';
      else if (row.low) issue = 'low-confidence';
      if (issue === 'none' || issue === 'low-confidence') {
        const dupKey = `${row.date}|${row.status}`;
        if (seen.has(dupKey)) issue = 'duplicate'; else seen.add(dupKey);
        if (issue !== 'duplicate' && g.action === 'link' && g.matchId) {
          const hit = byKey.get(`${g.matchId}|${row.date}`);
          if (hit) { existingStatus = hit.status; issue = hit.status === row.status ? 'duplicate' : 'conflict' }
        }
      }
      return { ...row, issue, existingStatus };
    }) };
  });
}

/** A row only reaches the database when it is clean, kept by the user, and not a duplicate. */
export function willImport(row: ReviewRow, action: SubjectGroup['action'], overwrite: boolean) {
  if (action === 'skip' || !row.include) return false;
  if (row.issue === 'conflict') return overwrite;
  return row.issue === 'none' || row.issue === 'low-confidence';
}

export function summarise(groups: SubjectGroup[], overwrite: boolean) {
  const rows = groups.flatMap(g => g.rows.map(r => ({ r, g })));
  const ready = rows.filter(({ r, g }) => willImport(r, g.action, overwrite));
  return {
    subjects: groups.length,
    matched: groups.filter(g => g.action === 'link' && g.matchId).length,
    unmatched: groups.filter(g => g.matchId === '').length,
    creating: groups.filter(g => g.action === 'create').length,
    skipping: groups.filter(g => g.action === 'skip').length,
    total: rows.length,
    ready: ready.length,
    present: ready.filter(({ r }) => r.status === 'present').length,
    absent: ready.filter(({ r }) => r.status === 'absent').length,
    review: rows.filter(({ r }) => ['no-date', 'bad-date', 'no-status', 'no-subject'].includes(r.issue)).length,
    duplicates: rows.filter(({ r }) => r.issue === 'duplicate').length,
    conflicts: rows.filter(({ r }) => r.issue === 'conflict').length,
    dropped: rows.filter(({ r, g }) => !willImport(r, g.action, overwrite)).length,
  };
}

interface WriteCtx { uid: string; defaultTarget: number; colors: readonly string[]; subjects: Subject[]; existing: Attendance[]; overwrite: boolean }
/**
 * Builds the exact rows to write. Imported marks reuse sessionId 'manual' so they show up on the
 * Attendance page exactly like a tap would, and reuse the existing record's id on overwrite so a
 * conflicting day is updated in place rather than double-counted.
 */
export function buildWrites(groups: SubjectGroup[], ctx: WriteCtx): { subjects: Subject[]; records: Attendance[] } {
  const now = new Date().toISOString();
  const byKey = new Map<string, Attendance>();
  for (const a of ctx.existing) byKey.set(`${a.subjectId}|${a.date}|${a.sessionId}`, a);
  const subjects: Subject[] = [], records: Attendance[] = [];
  let made = 0;
  for (const g of groups) {
    if (g.action === 'skip') continue;
    let subjectId = g.matchId;
    if (g.action === 'create') {
      const fresh: Subject = { id: id(), uid: ctx.uid, name: g.name || g.code, code: g.code || '', teacher: '', room: '', color: ctx.colors[(ctx.subjects.length + made) % ctx.colors.length], target: ctx.defaultTarget, createdAt: now };
      subjects.push(fresh); subjectId = fresh.id; made++;
    }
    if (!subjectId) continue;
    for (const row of g.rows) {
      if (!willImport(row, g.action, ctx.overwrite)) continue;
      const prior = byKey.get(`${subjectId}|${row.date}|manual`);
      records.push({ id: prior?.id ?? id(), uid: ctx.uid, subjectId, date: row.date, sessionId: 'manual', status: row.status as Attendance['status'], updatedAt: now });
    }
  }
  return { subjects, records };
}
