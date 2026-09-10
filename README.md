# Self Attendance

A production-ready, local-first attendance tracker built with React, TypeScript, Vite, Firebase Authentication, Firestore, IndexedDB, Gemini and a PWA shell. Every screen reads and writes IndexedDB directly, so the app is instant and fully usable offline. Signing in with Google additionally mirrors your timetable, attendance, subjects and settings to a private Firestore document (`users/{uid}`), so the same data follows you to another device — see [Cloud sync (Firestore)](#cloud-sync-firestore) below.

## Run locally

1. Install Node.js 20+ and run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill in the Firebase web configuration values. The values are intentionally not committed.
4. Optionally add a Gemini key to `VITE_GEMINI_API_KEY` for timetable scanning.
5. Run `npm run dev`.

Run `npm run build` before deploying. It performs the TypeScript check and creates `dist/`.

## Firebase Google sign-in setup

1. Create a Firebase project and register a **Web app**.
2. In **Authentication → Sign-in method**, enable Google and provide support email details.
3. Copy the web app configuration to `.env.local` as `VITE_FIREBASE_*` variables.
4. In **Authentication → Settings → Authorized domains**, add your production GitHub Pages host, for example `your-name.github.io`. Firebase's web configuration is public client configuration, but restrict its API key and only authorize your own domains.
5. Realtime Database, Firebase Storage, and any Admin SDK/service account are not required. **Firestore is required** for cross-device sync — see the next section.

## Cloud sync (Firestore)

Sign-in does two things: it separates each Google account's data locally (IndexedDB stores are keyed by `uid`, so one device can hold several accounts' data side by side), and it now also syncs that data to Firestore so it's available on other devices.

**How it works**

- Local IndexedDB is always the source of truth for the UI — reads and writes never wait on the network.
- On sign-in, the app checks `users/{uid}` in Firestore: if it exists, that cloud copy replaces the local copy for this `uid` on this device; if it doesn't (first sign-in from any device), the local copy is pushed up to seed it.
- After every local change (marking attendance, editing a subject or timetable entry, importing, restoring a backup, changing settings), the updated data is pushed to Firestore in the background, debounced by ~1.2s and tagged with an `updatedAt` timestamp. Network or offline errors never block the UI — the header/settings sync badge reflects the current state (`Syncing…`, `Synced`, `Offline`, or `Sync paused`).
- "Clear local data" in Settings only clears this device's IndexedDB; it does not touch the Firestore copy, so signing out and back in (or opening the app elsewhere) restores it.

**Setup**

1. In the Firebase console, open **Firestore Database** and create a database (production mode).
2. Set security rules so each user can only read/write their own document:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
   These are also saved in [`firestore.rules`](./firestore.rules) — deploy with `firebase deploy --only firestore:rules` if you use the Firebase CLI, or paste them into the console's Rules tab.
3. No extra `VITE_FIREBASE_*` variables are needed beyond what Google sign-in already uses.

## Gemini timetable import

The app uses the official `@google/generative-ai` SDK and accepts PDF, PNG, JPG/JPEG, and WEBP files (up to 15 MB). It asks Gemini for strict timetable JSON, presents every entry for editing, and saves only after confirmation.

For a static GitHub Pages deployment, any `VITE_GEMINI_API_KEY` is inherently visible in the browser bundle. Prefer a small authenticated serverless proxy for production if possible. If you deliberately use a browser key, restrict it in Google Cloud by HTTP referrer (your GitHub Pages domain) and Gemini API, set quotas, and rotate/revoke it when needed. Never put the key in source, UI, backup files, or logs.

## GitHub Pages deployment

1. Push this project to a repository named `self-attendance` (or adjust `base` in `vite.config.ts` to `/<your-repository>/`).
2. Add all `VITE_*` values as GitHub repository secrets or build-time environment variables. Do not commit `.env.local`.
3. Add this workflow as `.github/workflows/deploy.yml`, or deploy `dist` from your CI:

```yaml
name: Deploy static site
on: { push: { branches: [main] }, workflow_dispatch: {} }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  deploy:
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_GEMINI_API_KEY: ${{ secrets.VITE_GEMINI_API_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deployment
        uses: actions/deploy-pages@v4
```

4. In GitHub **Settings → Pages**, choose **GitHub Actions** as the source. Ensure HTTPS is enabled. The PWA service worker supplies an offline application shell; GitHub Pages serves the Vite entry for the app route.

## IndexedDB schema

Database: `SelfAttendance`.

| Store | Key | Scope / purpose |
|---|---|---|
| `users` | `uid` | Cached Firebase profile identity |
| `subjects` | `id` | `uid` indexed; subject targets and metadata |
| `attendance` | `id` | `uid` and `[uid,date]` indexed; one record per subject/date/session |
| `timetable` | `id` | `uid` indexed; weekly class sessions |
| `settings` | `uid` | Theme and default target |

Every persisted user record has a Firebase UID. Logout does not clear records; signing in as another account queries a separate UID dataset. Writes occur immediately after attendance actions.

## Backup and restore format

**Backup Data** downloads a human-readable `.txt` report followed by a `STRUCTURED DATA (do not edit)` JSON section. The JSON contains backup version, creation timestamp, source account marker, subjects, attendance records, timetable entries, and settings. The parser validates that section before it changes IndexedDB. Restore previews record counts and offers **Merge** (ID-based upsert) or **Replace** (clears only the signed-in user's local dataset, then restores). Existing records remain untouched until confirmation.

## Calculation rules

- Current percentage: `present / (present + absent) × 100`.
- Safe skips, only when at/above target: `floor(present / targetFraction − total)`.
- Required consecutive presences, below target: `ceil((targetFraction × total − present) / (1 − targetFraction))`.

Unmarked entries are excluded. This avoids misleading attendance advice.

## Privacy

Attendance, subject, timetable, settings, and backups remain on the current device. Firebase is not an attendance database. AI import sends only the file selected for extraction, needs internet, and never automatically stores the upload itself.
