// Turns Gemini's loosely-typed attendance extraction into something the confirmation screen can
// show and the database can accept. Nothing here talks to IndexedDB or to Gemini — it is pure
// data shaping, so the review UI can re-run it on every edit the user makes.
import { id } from './db';
import type { Attendance, DetectedAttendance, DetectedStatus, MatchKind, ParsedAttendance, ReviewRow, RowIssue, Subject, SubjectGroup } from './types';

const STOP = new Set(['of', 'and', 'the', 'for', 'in', 'to', 'a', 'an', 'on', 'with', 'amp']);
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();
const compact = (v: string) => v.toLowerCase().replace(/[^a-z0-9+#]/g, '');
const words = (v: string) => norm(v).split(' ').filter(w => w && !STOP.has(w));
/** "Computer Organisation and Architecture" -> "coa", so a file that only says COA still matches. */
const acronym = (v: string) => { const w = words(v); return w.length > 1 ? w.map(x => x[0]).join('') : ''; };

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

  interface ScoredCandidate {
    subject: Subject;
    score: number;
    kind: MatchKind;
  }

  const scored: ScoredCandidate[] = [];

  for (const s of subjects) {
    const sNameCompact = compact(s.name);
    const sCodeCompact = compact(s.code);
    const sAcro = compact(acronym(s.name));
    const sWords = words(s.name);

    let bestScore = 0;
    let bestKind: MatchKind = 'none';

    for (const q of queries) {
      const cq = compact(q);
      const wq = words(q);
      if (!cq) continue;

      // Exact name match
      if (sNameCompact && cq === sNameCompact) {
        if (100 > bestScore) { bestScore = 100; bestKind = 'name'; }
      }
      // Exact code match
      else if (sCodeCompact && cq === sCodeCompact) {
        if (90 > bestScore) { bestScore = 90; bestKind = 'code'; }
      }
      // Acronym match
      else if (sAcro && (cq === sAcro || compact(acronym(q)) === sAcro)) {
        if (80 > bestScore) { bestScore = 80; bestKind = 'abbreviation'; }
      }
      // Word match: e.g. "C#", "C++", "C" matching "C# Programming"
      if (wq.length >= 1 && sWords.length >= 1) {
        const shared = wq.filter(w => sWords.includes(w)).length;
        const ratio = shared / Math.max(wq.length, sWords.length);
        if (shared === wq.length) {
          const score = 65 + Math.round(ratio * 20);
          if (score > bestScore) { bestScore = score; bestKind = 'partial'; }
        } else if (ratio >= 0.5) {
          const score = 40 + Math.round(ratio * 30);
          if (score > bestScore) { bestScore = score; bestKind = 'partial'; }
        }
      }
      // Substring match for longer strings
      else if (cq.length >= 3 && sNameCompact.length >= 3) {
        if (sNameCompact.includes(cq) || cq.includes(sNameCompact)) {
          const score = 50 + Math.min(cq.length, sNameCompact.length) * 2;
          if (score > bestScore) { bestScore = score; bestKind = 'partial'; }
        }
      }
    }

    if (bestScore > 0) {
      scored.push({ subject: s, score: bestScore, kind: bestKind });
    }
  }

  if (!scored.length) return { id: '', kind: 'none' };

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  if (scored.length > 1) {
    const second = scored[1];
    // If tied in score, return 'none' so user chooses explicitly
    if (second.score === top.score) {
      return { id: '', kind: 'none' };
    }
    // If top is only partial and there is another plausible candidate, return 'none'
    if (top.kind === 'partial' && second.score >= 40) {
      return { id: '', kind: 'none' };
    }
  }

  return { id: top.subject.id, kind: top.kind };
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
    g.rows.push({
      key: `r${i}`,
      subjectKey: key,
      label: g.label,
      date: (r.date ?? '').trim(),
      status: cleanStatus(r.status),
      issue: 'none',
      note: (r.note ?? '').trim() || (low ? 'Gemini was not fully confident about this row.' : ''),
      source: (r.source ?? '').trim().slice(0, 90),
      low,
      include: !low, // BUG-014: Low-confidence rows default to include: false
    });
  });
  return [...groups.values()];
}

/** Flags each row against what is already stored, given the user's current subject decisions. */
export function annotate(groups: SubjectGroup[], existing: Attendance[], allowMultipleSameDay = false): SubjectGroup[] {
  const byKey = new Map<string, Attendance>();
  for (const a of existing) {
    if (a.status !== 'unmarked') byKey.set(`${a.subjectId}|${a.date}`, a);
  }
  return groups.map(g => {
    const seen = new Set<string>();
    return {
      ...g,
      rows: g.rows.map(row => {
        let issue: RowIssue = 'none';
        let existingStatus: Attendance['status'] | undefined;
        let existingId: string | undefined;
        let existingSessionId: string | undefined;

        if (!g.name && !g.code) issue = 'no-subject';
        else if (!row.date) issue = 'no-date';
        else if (!validISO(row.date)) issue = 'bad-date';
        else if (row.status === 'unknown') issue = 'no-status';
        else if (row.low) issue = 'low-confidence';

        if (issue === 'none' || issue === 'low-confidence') {
          const dupKey = `${row.date}|${row.status}`;
          if (!allowMultipleSameDay) {
            if (seen.has(dupKey)) issue = 'duplicate';
            else seen.add(dupKey);
          }
          if (issue !== 'duplicate' && g.action === 'link' && g.matchId) {
            const hit = byKey.get(`${g.matchId}|${row.date}`);
            if (hit) {
              existingStatus = hit.status;
              existingId = hit.id;
              existingSessionId = hit.sessionId;
              issue = hit.status === row.status ? 'duplicate' : 'conflict';
            }
          }
        }
        return { ...row, issue, existingStatus, existingId, existingSessionId };
      }),
    };
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
    // BUG-014: include low-confidence rows under Needs review
    review: rows.filter(({ r }) => ['no-date', 'bad-date', 'no-status', 'no-subject', 'low-confidence'].includes(r.issue) || r.low).length,
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
export function buildWrites(groups: SubjectGroup[], ctx: WriteCtx, allowMultipleSameDay = false): { subjects: Subject[]; records: Attendance[] } {
  const now = new Date().toISOString();
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
    let dayCount = 0;
    for (const row of g.rows) {
      if (!willImport(row, g.action, ctx.overwrite)) continue;
      // BUG-006: overwrite attaches existingId and preserves existingSessionId
      const targetId = (ctx.overwrite && row.existingId) ? row.existingId : id();
      const targetSessionId = (ctx.overwrite && row.existingSessionId)
        ? row.existingSessionId
        : allowMultipleSameDay && dayCount > 0
          ? `manual-${dayCount}`
          : 'manual';
      dayCount++;
      records.push({ id: targetId, uid: ctx.uid, subjectId, date: row.date, sessionId: targetSessionId, status: row.status as Attendance['status'], updatedAt: now });
    }
  }
  return { subjects, records };
}
