# Changelog: SelfAttendancee Bug Fixes

All confirmed bugs identified during the comprehensive audit have been resolved in strict phase order with test-first reproductions and small, isolated commits.

---

## Phase 0: Test Harness
- Added Vitest + JSDOM + fake-indexeddb test harness with npm test script.
- Baseline characterization tests for math calculation and attendance import logic (`attendance-import.characterization.test.ts`).

---

## Phase 1: Data Loss & Sync Reliability
- **BUG-003**: Added `reconciled:{uid}` gate in IndexedDB; `pushToCloud` no-ops unless reconciled; pull failures show visible error with retry button instead of empty onboarding state (`5bc05e2`).
- **BUG-011**: "Clear local data" clears the `reconciled:{uid}` marker so subsequent edits do not wipe the cloud copy; pull restores on sign-in (`0772a48`).
- **BUG-002**: Replaced blind login pull with per-uid `dirty` flag; flushes pending push on logout, `pagehide`, and `visibilitychange:hidden` (`1df5c57`).
- **BUG-010**: Called `reload()` immediately after IndexedDB transaction commit in attendance import modal so closing with X does not skip persistence or cloud sync (`52df5e8`).
- **BUG-009**: Strict schema validation for subjects, attendance records, timetable entries, and settings before opening IndexedDB transactions with automatic rollback on validation error (`e0cacc4`).
- **BUG-008**: Fixed crash when logging out from Settings page: reset page to 'home' on sign-out, render loader while settings are loading, and wrapped root with `ErrorBoundary` (`12d9e56`).
- **BUG-022**: Account switch isolation: cleared local state and blocked rendering in auth effect until fresh user data is loaded (`dc62f63`).
- **BUG-024**: Sync badge retries with exponential backoff (1s, 2s, 4s...) and listens to the `online` event to resume syncing (`20b7f0c`).
- **D1 / BUG-001**: Prepared multi-device conflict resolution architecture design artifact (`bug001_design_comparison.md`).

---

## Phase 2: Attendance & Timetable Correctness
- **BUG-004**: Eliminated floating-point rounding errors in `required()`, `bunk()`, and `state()` in `math.ts` using integer arithmetic; returns `-1` sentinel when target 100% is unreachable (`d7fbba4`).
- **BUG-020**: Handled edge states: `total = 0` renders neutral "No classes yet" instead of red risk banner or "Attend next 0"; sanitized invalid targets on import/pull (`3bab972`).
- **BUG-005**: Fixed multi-session overwriting on the same day: `mark()` respects distinct `sessionId`s so multiple classes of the same subject on one day each retain their own status (`4c13097`).
- **BUG-007**: Guarded timetable entries with dangling or empty `subjectId`: prompt to link to a subject, disable mark buttons for unlinked entries, and prompt during subject deletion (`049bdc6`).
- **BUG-019**: Timetable class cards dynamically look up the latest subject name from `subjects` by `subjectId`, falling back to `e.subject` (`840adb3`).
- **BUG-029**: Added regex format and presence validation for `startTime` (`HH:MM`) and ensured `endTime > startTime` in `EntryForm` (`4869131`).
- **BUG-031**: Excluded orphan records without subjects from trend and statistics; ensured chart cells use unique subject `id` keys; included year in trend labels when data spans multiple years (`c9ef5ba`).
- **BUG-033**: Marking a class as `'unmarked'` deletes the record from IndexedDB instead of creating an `'unmarked'` database record, while preserving undo functionality (`590b46b`).

---

## Phase 3: AI Import Validation & Integrity
- **BUG-006**: Overwrote existing timetable `sessionId` in place when importing attendance with "Replace with file" instead of double-counting (`919d7e5`).
- **BUG-014**: Low-confidence detected rows default to `include: false` and are grouped under "Needs review"; unreviewed rows beyond the `ROW_CAP` (300) are guarded by an explicit opt-in checkbox (`e2d1e87`).
- **BUG-016**: Comprehensive runtime schema validation for Gemini responses (both timetable and attendance); timeout with exponential backoff retry; distinguished rate limit (429) vs network errors (`9671d2c`).
- **BUG-015 / BUG-016**: Normalized day names ("Mon" -> "Monday") and time strings ("9:00" -> "09:00") during timetable validation; report imported and skipped counts upon commit (`20fcc3b`).
- **BUG-013**: Added toggle "Treat repeated rows on one day as separate classes" to support multi-hour lectures/labs without silently dropping rows (`27bac9c`).
- **BUG-017**: Added busy states and request IDs to timetable import to prevent double-submissions and ignore stale responses from superseding file selections (`20fcc3b`).
- **BUG-018**: Candidate scoring for subject matching; returns `'none'` on tie-breaks or ambiguous partial matches; preserved symbols like "C++" vs "C#" (`7b590a0`).

---

## Phase 4: Integrity, Security Copy, UX & A11y
- **BUG-021**: Replaced `Math.random().toString(36)` with `crypto.randomUUID()` (with RFC4122 fallback) for collision-proof ID generation across accounts and devices (`7920bf9`).
- **BUG-027**: Merge restore checks `updatedAt` timestamps and prevents overwriting newer records with older records; settings restore is now an explicit user opt-in (`cbb2cd3`).
- **BUG-023**: Corrected false privacy claims in `index.html` meta tags and `README.md` to accurately state Firestore syncing and Gemini API transmission (`c4b745f`).
- **BUG-025**: Modal dialog accessibility: closes on Escape key, focus moves into modal and is trapped, returns focus to trigger element on close, locks body scroll, and adds `aria-labelledby` linked to headings (`4007ff8`).
- **BUG-026**: Responsive timetable review card layout for screens <= 560px: eliminated `display: none` on `endTime` and stacked rows into a 2-line card layout with >=120px field widths (`bff2505`).
- **BUG-028**: Default target input in Settings uses a local string draft state so typing/clearing is not immediately clamped, with integer clamping (1-100) applied on blur (`54c02dc`).
- **BUG-030**: Backup filename uses the user's local date (`dateISO()`) rather than UTC slice; delayed `URL.revokeObjectURL(url)` with a 10-second timer to avoid cancelling downloads (`b09f555`).
- **BUG-032**: Normalized CRLF and stripped UTF-8 BOM in `parseBackup()` (`3f427b4`); added descriptive `aria-label`s to all icon-only buttons ("Edit class", "Delete class"); guarded missing `photoURL` in `Profile` and `SettingsPage` against rendering broken `<img src="">` (`97349f8`).

---

## Phase 5 & Potential Bugs
- **BUG-012**: Provided detailed security checklist artifact (`bug012_gemini_security_checklist.md`) covering Google Cloud referrer/API restrictions, quota limits, key rotation, and authenticated proxy architecture; added `firebase.json` for rules and hosting deployment (`68b0f99`).
- **P1**: Offline push immediately transitions to `'offline'` status rather than hanging on `'syncing'` (`98b3f72`).
- **P2**: Added in-flight guard to `mark()` per subject+date+session to prevent duplicate records on rapid double-taps (`98b3f72`).
