# Self Attendance Android Guide

This document describes how to develop, build, sign, and release the **Self Attendance** Android application using Capacitor 8.

---

## 1. Overview & Architecture

- **Application ID / Package Name**: `com.yugraj.selfattendance`
- **Application Display Name**: `Self Attendance`
- **Target Platform**: Android 8.0+ (API Level 26+)
- **Design System**: Midnight Slate Utility (dark slate `#0f172a` canvas, dark status bar, emerald `#10b981` present, coral `#ef4444` absent, cyan `#06b6d4` sync)

### Architecture Highlights
1. **Web & Native Parity**:
   The exact same codebase powers the Web/PWA and native Android build. Native features are guarded behind `Capacitor.isNativePlatform()` and platform adapters (`src/native-file.ts`).
2. **First-Launch Storage Chooser**:
   On first launch, users can choose **"Keep it on this device" (Local Only)** or **"Sign in & sync with Google" (Cloud Sync)**.
   - **Local Only Mode**: Makes **zero** Firebase network requests; Firebase Auth/Firestore are never initialized, allowing total privacy and full offline capability without requiring any Google account.
   - **Cloud Sync Mode**: Uses Firebase Authentication and Firestore (`users/{uid}`) to sync attendance, subjects, and timetables across devices with a 3-way conflict resolver and automatic pre-sync safety snapshots.
   - Users can seamlessly switch between Local and Cloud modes anytime in **Settings > Data & sync** with zero data loss.
3. **Android Hardware Back Button**:
   Handled gracefully using `@capacitor/app`. When a modal, popup, or active subview is open, the back button closes it instead of exiting the application. If already at root Home, pressing back exits the app cleanly.
4. **Dark Status Bar & Safe Areas**:
   The status bar is styled to `#0f172a` (dark style) via `@capacitor/status-bar`. Safe area insets (`env(safe-area-inset-top)`) are handled in CSS so UI elements never collide with device notches or punch-hole cameras.
5. **Native File Sharing**:
   Backup files (`.txt`) and Excel spreadsheets (`.xlsx`) utilize `@capacitor/filesystem` and `@capacitor/share` on native devices to invoke Android's native share sheet (allowing direct sharing to WhatsApp, Google Drive, Gmail, or local file manager). In web browsers, it falls back seamlessly to standard file downloads.
6. **On-Device Gemini API Key**:
   To avoid embedding extractable API keys into the APK binary, users can enter their Google Gemini API key directly in **Settings > Gemini API Key**. Keys are stored on-device in IndexedDB (`app:gemini_api_key`), keeping user secrets private.

---

## 2. Prerequisites

To build and run the Android app locally, ensure your environment has:
- **Node.js**: v20 or v22 LTS
- **npm**: v10+
- **JDK**: Java Development Kit 21 LTS (recommended: [Eclipse Temurin JDK 21](https://adoptium.net/temurin/releases/?version=21))
- **Android Studio**: Android Studio Jellyfish / Koala / Ladybug+ (with Android SDK Platform 34 or 35 and Android SDK Build-Tools installed)

Verify your Java and Android configuration:
```bash
java -version
# Ensure JAVA_HOME points to your JDK 21 installation
```

---

## 3. Quick Commands

| Command | Action |
| :--- | :--- |
| `npm run build:android` | Builds Vite web assets and syncs with the Capacitor Android project |
| `npm run android:open` | Opens the native Android project in Android Studio |
| `npx cap run android` | Directly compiles and runs the app on an attached USB device or emulator |

---

## 4. Local Build Instructions

### A. Debug APK (Instant Testing)

1. Build web assets and sync Capacitor:
   ```bash
   npm run build:android
   ```

2. Compile the debug APK using Gradle:
   - **Linux / macOS**:
     ```bash
     cd android
     ./gradlew assembleDebug
     ```
   - **Windows PowerShell**:
     ```powershell
     cd android
     .\gradlew.bat assembleDebug
     ```

3. **Output Location**:
   The generated APK will be located at:
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

You can install this APK on any connected Android device via ADB:
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

---

### B. Signed Release APK & Google Play AAB

#### Step 1: Create a Release Keystore (one-time setup)
Run the `keytool` utility (included with JDK):
```bash
keytool -genkey -v -keystore release.keystore -alias selfattendance -keyalg RSA -keysize 2048 -validity 10000
```
Remember the keystore password, alias name, and key password you chose.

#### Step 2: Configure Signing
Place the `release.keystore` in `android/app/` (or specify its location via `KEYSTORE_PATH`).

Set your signing credentials as environment variables:
- **Linux / macOS**:
  ```bash
  export KEYSTORE_PATH="release.keystore"
  export KEYSTORE_PASSWORD="your-keystore-password"
  export KEY_ALIAS="selfattendance"
  export KEY_PASSWORD="your-key-password"
  ```
- **Windows PowerShell**:
  ```powershell
  $env:KEYSTORE_PATH="release.keystore"
  $env:KEYSTORE_PASSWORD="your-keystore-password"
  $env:KEY_ALIAS="selfattendance"
  $env:KEY_PASSWORD="your-key-password"
  ```

#### Step 3: Build Release Artifacts
- **Build Release APK (sideloading / direct download)**:
  ```bash
  cd android
  ./gradlew assembleRelease
  ```
  Output: `android/app/build/outputs/apk/release/app-release.apk`

- **Build Release AAB (Google Play Store upload)**:
  ```bash
  cd android
  ./gradlew bundleRelease
  ```
  Output: `android/app/build/outputs/bundle/release/app-release.aab`

---

## 5. Automated GitHub Actions CI / CD

The repository includes an automated build pipeline configured in [`.github/workflows/android.yml`](./.github/workflows/android.yml).

### Workflow Triggers
- Every `push` to `master` and `main` branches.
- Every `pull_request` targeting `master` or `main`.
- Manual trigger via `workflow_dispatch` in the GitHub Actions tab.

### Pipeline Actions
1. Checks out code and installs dependencies (`npm ci`).
2. Runs the entire automated test suite (`npm test`, 150+ tests).
3. Compiles the production web bundle (`npm run build`).
4. Configures JDK 17 and Android SDK.
5. Runs `npx cap sync android`.
6. Compiles `app-debug.apk`.
7. If release signing secrets are provided, decodes the keystore and compiles signed `app-release.apk` and `app-release.aab`.
8. Uploads build artifacts as downloadable ZIP archives under the GitHub Actions run summary (retained for 30 days).

### Configuring GitHub Secrets for Release Builds
To enable automated signed release builds in GitHub Actions, add these repository secrets (**Settings > Secrets and variables > Actions**):

| Secret Name | Description | Example / How to Generate |
| :--- | :--- | :--- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release keystore file | Linux: `base64 -w 0 release.keystore`<br>Windows PS: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))` |
| `KEYSTORE_PASSWORD` | Keystore password | `YourStrongKeystorePassword` |
| `KEY_ALIAS` | Key alias name | `selfattendance` |
| `KEY_PASSWORD` | Key password | `YourStrongKeyPassword` |

If these secrets are not configured, the workflow automatically falls back to building unsigned release artifacts alongside the debug APK.
