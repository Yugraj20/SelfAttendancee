import type { Attendance, Subject } from './types';
export function subjectStats(subject: Subject, records: Attendance[]) {
  const r = records.filter(x => x.subjectId === subject.id && (x.status === 'present' || x.status === 'absent'));
  const present = r.filter(x => x.status === 'present').length;
  const total = r.length;
  const absent = total - present;
  const pct = total ? (present / total) * 100 : 0;
  const T = Math.round(subject.target);

  if (total === 0) {
    return {
      present: 0,
      total: 0,
      absent: 0,
      pct: 0,
      bunk: 0,
      required: 0,
      state: 'neutral',
    } as const;
  }

  const isMet = 100 * present >= T * total;
  const isComfortable = 100 * present >= (T + 5) * total;
  const state = isComfortable ? 'comfortable' : isMet ? 'onTarget' : 'risk';

  let bunk = 0;
  if (isMet && T > 0) {
    bunk = Math.floor((100 * present - T * total) / T);
  }

  let required = 0;
  if (!isMet) {
    if (T >= 100) {
      required = -1;
    } else {
      required = Math.ceil((T * total - 100 * present) / (100 - T));
    }
  }

  return { present, total, absent, pct, bunk, required, state } as const;
}
export function overall(subjects: Subject[], records: Attendance[]) { const stats = subjects.map(s => subjectStats(s, records)); const present = stats.reduce((a,s)=>a+s.present,0), total=stats.reduce((a,s)=>a+s.total,0); return { present, total, absent: total-present, pct: total ? present/total*100 : 0 }; }
export function dateISO(d = new Date()) { return d.toLocaleDateString('en-CA'); }
// Running percentage after each day that actually had a class, so the line answers "is my term
// getting better or worse" rather than plotting one isolated day at a time. Cancelled / not-held
// sessions are excluded here for the same reason they are excluded from subjectStats.
export function trend(records: Attendance[], take = 30) {
  const held = records
    .filter(x => x.status === 'present' || x.status === 'absent')
    .sort((a, b) => a.date.localeCompare(b.date));
  let present = 0, total = 0;
  const points: { date: string; pct: number; label: string }[] = [];
  const years = new Set(held.map(r => r.date.slice(0, 4)));
  const spansYears = years.size > 1;
  for (const r of held) {
    if (r.status === 'present') present++;
    total++;
    const last = points[points.length - 1];
    const pct = +((present / total) * 100).toFixed(1);
    const label = spansYears
      ? `${r.date.slice(0, 4)}/${r.date.slice(5, 7)}/${r.date.slice(8, 10)}`
      : r.date.slice(5).replace('-', '/');
    if (last && last.date === r.date) {
      last.pct = pct;
      continue;
    }
    points.push({ date: r.date, pct, label });
  }
  return points.slice(-take);
}
