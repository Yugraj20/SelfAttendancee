# Self Attendance

A production-ready, local-first attendance tracker built with React 18, TypeScript, Vite, Firebase Authentication, Firestore, IndexedDB, Google Gemini AI and a PWA application shell. Every screen reads and writes IndexedDB directly, so the app is instant and fully usable offline. Signing in with Google optionally mirrors your timetable, attendance, subjects and settings to a private Firestore document (`users/{uid}`), so the same data follows you across devices.

---

## Quick Start & Testing Instructions

### Prerequisites
- Node.js 20+
- npm 10+

### Installation & Development
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Add your Firebase and optional Gemini API keys to .env.local

# 3. Run development server
npm run dev
```

### Running Automated Tests
The repository includes a comprehensive unit and characterization test suite built on Vitest, JSDOM, and fake-indexeddb:
```bash
# Run all automated tests
npm test

# Run a specific test suite
npm test bug004
```

### Building for Production
```bash
# Run TypeScript typecheck and Vite production build
npm run build
```

---

## Calculation Rules

All attendance math in `src/math.ts` uses exact integer arithmetic to avoid floating-point inaccuracies:

- **Current Attendance Percentage**:
  $$\text{pct} = \frac{100 \times \text{present}}{\text{present} + \text{absent}}$$
  *(Displayed rounded to 1 decimal place; compares exact integer $100 \times \text{present} \ge T \times \text{total}$)*
- **Safe Misses (Bunk)**:
  Only when at or above target $T$:
  $$\text{bunk} = \left\lfloor \frac{100 \times \text{present} - T \times \text{total}}{T} \right\rfloor$$
- **Required Consecutive Attendances**:
  When below target $T$ ($T < 100$):
  $$\text{required} = \left\lceil \frac{T \times \text{total} - 100 \times \text{present}}{100 - T} \right\rceil$$
- **Target 100% Unreachable Sentinel**:
  If target $T = 100$ and $\text{absent} > 0$, `required()` returns sentinel `-1` (displayed as "Target 100% unreachable", never rendering `Infinity` or `NaN`).
- **Zero Classes Held**:
  When $\text{total} = 0$, the UI displays a neutral "No classes yet" badge rather than a false risk state or "Attend next 0".
- **Unmarked Status**:
  Unmarked classes and cancelled classes are excluded from total counts to prevent distortion.

---

## Cloud Sync (Firestore) & Data Safety

The app implements a multi-tier persistence and safety architecture:

- **Local-First Source of Truth**: All mutations are written immediately to IndexedDB on device. Reads never wait on the network.
- **Reconciliation Gate (`reconciled:{uid}`)**: Pushes to cloud (`pushToCloud`) no-op unless a verified cloud pull or local seeding has succeeded for that UID. If the initial cloud pull fails or the device is offline during login, the app displays a clear retry prompt and blocks cloud pushes to prevent overwriting cloud docs with empty local state.
- **Per-UID Dirty State Tracking**: Every local mutation marks the UID as `dirty`. On login, if local dirty state exists, local data is preserved and pushed rather than wiped by the cloud copy.
- **Lifecycle Flush**: Pending debounced cloud pushes are automatically flushed on `logout`, `pagehide`, and `visibilitychange: hidden`.
- **Automatic Retry with Exponential Backoff**: Network sync errors retry automatically with exponential backoff (1s, 2s, 4s...) and listen to the browser's `online` event to resume syncing when connectivity is restored.
- **Offline Guard**: Cloud push operations verify `navigator.onLine` and transition immediately to `'offline'` without hanging on server acknowledgments.
- **Account Isolation**: Signing out immediately unmounts previous user data and resets navigation to Home, preventing cross-account data leaks.

---

## AI Import Behavior

### Timetable Import (PDF / Images)
- Accepts PDF, PNG, JPG, JPEG, and WEBP files (up to 15 MB).
- Sends the file to Google's Gemini model with schema validation.
- Normalizes day names ("Mon" $\rightarrow$ "Monday") and times ("9:00" $\rightarrow$ "09:00").
- Flags unparseable entries and reports imported vs. skipped row counts upon commit.
- Stacks rows into a responsive 2-line card layout on mobile screens ($\le 560\text{px}$) so start and end times remain fully visible and editable.

### Attendance Text Import (.txt)
- Accepts unstructured plain text exports (up to 2 MB).
- Gemini extracts subject, ISO date, and attendance status.
- **Candidate Scoring & Tie-Breaking**: Matches existing subjects by exact name, code, acronym, and word overlap. If candidates are tied or ambiguous, the match defaults to `none`, requiring explicit user selection.
- **Low Confidence Excluded by Default**: Rows flagged with low model confidence default to `include: false` and are grouped under "Needs review".
- **Row Cap Protection**: For files exceeding 300 rows, rows beyond the cap are not imported unless the user explicitly checks the preview limit opt-in checkbox.
- **Same-Day Classes Toggle**: Supports a toggle ("Treat repeated rows on one day as separate classes") to correctly handle multi-hour lectures or labs without dropping same-day records.
- **In-Place Overwrite**: When "Replace with file" is chosen for an existing attendance date, the existing record ID and timetable `sessionId` are preserved in place.

---

## Backup & Restore Format

- **Local Date Filenames**: Backup files are downloaded as `self-attendance-backup-YYYY-MM-DD.txt` using the device's local calendar date rather than UTC.
- **Delayed Object URL Revocation**: Download blob URLs are revoked with a 10-second delay to ensure downloads are not aborted by browsers.
- **CRLF & UTF-8 BOM Normalization**: `parseBackup` strips UTF-8 BOM markers and normalizes Windows CRLF line endings.
- **Strict Pre-Transaction Validation**: Validates all subject, attendance, timetable, and settings records before opening an IndexedDB transaction. Any corrupt or malformed payload aborts the transaction without leaving partial commits.
- **Merge Timestamp Checks**: When restoring in "Merge" mode, records are only updated if the backup record's `updatedAt` is newer than the local record's `updatedAt`.
- **Settings Restore Opt-In**: Merge restore preserves the user's current settings unless explicitly opted into restoring settings from the file.

---

## Privacy Notice

- **Local-first by default**: Attendance, subjects, timetables, and settings are stored locally on your device in IndexedDB and work completely offline.
- **Cloud synchronization**: When signed in with Google, your data is mirrored to a private Firestore document (`users/{uid}`) to enable cross-device sync.
- **AI import processing**: If you choose to import a timetable or attendance file, only that specific chosen file is sent to Google's Gemini API for analysis. Files are processed in memory and never retained by the app.

---

## Deployment

### Firebase Hosting & Firestore Rules
The repository includes [`firebase.json`](./firebase.json) and [`firestore.rules`](./firestore.rules):
```bash
# 1. Build the production application
npm run build

# 2. Deploy Firestore security rules and static hosting
firebase deploy --only firestore:rules,hosting
```

### GitHub Pages
Deployments via GitHub Actions use `.github/workflows/deploy.yml` with `npm test` running prior to the build step.
