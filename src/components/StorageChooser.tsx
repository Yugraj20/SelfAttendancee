import React from 'react';
import { Capacitor } from '@capacitor/core';
import { ChevronRight, Lock, WifiOff, Database, RefreshCw, Cloud, ShieldCheck, Smartphone } from 'lucide-react';
import type { StorageMode } from '../storage-mode';

interface StorageChooserProps {
  onSelectMode: (mode: StorageMode) => void;
  busy?: boolean;
  error?: string;
}

function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function AndroidIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-1.0003s.4482-1.0003.9993-1.0003c.5516 0 .9997.4486.9997 1.0003s-.4481 1.0003-.9997 1.0003m-11.046 0c-.5511 0-.9993-.4486-.9993-1.0003s.4482-1.0003.9993-1.0003c.5516 0 .9998.4486.9998 1.0003s-.4482 1.0003-.9998 1.0003m11.4045-6.02l1.996-3.4604a.416.416 0 00-.1521-.5676.416.416 0 00-.5681.1523l-2.0223 3.506c-1.464-.6682-3.0934-1.0366-4.835-1.0366s-3.371.3684-4.835 1.0366L5.4408 5.4457a.4161.4161 0 00-.5681-.1523.416.416 0 00-.1521.5676l1.996 3.4604C3.0617 11.206 1 14.708 1 18.72h22c0-4.012-2.0617-7.514-5.1185-9.3986" />
    </svg>
  );
}

function AppCalendarIcon() {
  return (
    <div className="sc-app-icon" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Calendar body */}
        <rect x="12" y="16" width="36" height="32" rx="7" fill="white" fillOpacity="0.95" />
        {/* Calendar top header bar */}
        <path
          d="M12 23C12 19.134 15.134 16 19 16H41C44.866 16 48 19.134 48 23V25H12V23Z"
          fill="white"
        />
        {/* Binder rings */}
        <rect x="20" y="11" width="4" height="8" rx="2" fill="white" />
        <rect x="36" y="11" width="4" height="8" rx="2" fill="white" />
        {/* Header divider line */}
        <rect x="12" y="24" width="36" height="2.5" fill="#4F46E5" fillOpacity="0.25" />
        {/* Calendar grid dots */}
        <rect x="18" y="30" width="5" height="4.5" rx="1.5" fill="#4F46E5" fillOpacity="0.75" />
        <rect x="27.5" y="30" width="5" height="4.5" rx="1.5" fill="#4F46E5" fillOpacity="0.75" />
        <rect x="37" y="30" width="5" height="4.5" rx="1.5" fill="#4F46E5" fillOpacity="0.75" />
        <rect x="18" y="38.5" width="5" height="4.5" rx="1.5" fill="#4F46E5" fillOpacity="0.75" />
        <rect x="27.5" y="38.5" width="5" height="4.5" rx="1.5" fill="#4F46E5" fillOpacity="0.75" />
        {/* Checkmark badge circle */}
        <circle cx="44" cy="43" r="10" fill="url(#checkGrad)" stroke="white" strokeWidth="2" />
        <path
          d="M39.8 43.2L42.6 46L48.5 40.1"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="checkGrad" x1="34" y1="33" x2="54" y2="53" gradientUnits="userSpaceOnUse">
            <stop stopColor="#60A5FA" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function LaptopLocalIllustration() {
  return (
    <div className="sc-illustration" aria-hidden="true">
      <svg viewBox="0 0 220 130" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgBlob1" x1="30" y1="15" x2="190" y2="115" gradientUnits="userSpaceOnUse">
            <stop stopColor="#DBEAFE" stopOpacity="0.85" />
            <stop offset="1" stopColor="#EFF6FF" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="screenBezel" x1="56" y1="22" x2="164" y2="96" gradientUnits="userSpaceOnUse">
            <stop stopColor="#93C5FD" />
            <stop offset="1" stopColor="#3B82F6" />
          </linearGradient>
          <linearGradient id="screenInner" x1="62" y1="28" x2="158" y2="90" gradientUnits="userSpaceOnUse">
            <stop stopColor="#60A5FA" />
            <stop offset="1" stopColor="#2563EB" />
          </linearGradient>
          <linearGradient id="laptopBase" x1="42" y1="96" x2="178" y2="106" gradientUnits="userSpaceOnUse">
            <stop stopColor="#93C5FD" />
            <stop offset="0.5" stopColor="#60A5FA" />
            <stop offset="1" stopColor="#3B82F6" />
          </linearGradient>
          <filter id="laptopShadow" x="30" y="94" width="160" height="24" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Soft background cloud/blob */}
        <ellipse cx="110" cy="70" rx="74" ry="44" fill="url(#bgBlob1)" />
        <circle cx="54" cy="68" r="24" fill="#E0F2FE" fillOpacity="0.65" />
        <circle cx="164" cy="64" r="22" fill="#DBEAFE" fillOpacity="0.6" />

        {/* Decorative rings & sparkles */}
        <circle cx="38" cy="48" r="3" stroke="#93C5FD" strokeWidth="1.5" fill="white" />
        <circle cx="182" cy="44" r="3.5" stroke="#60A5FA" strokeWidth="1.8" fill="white" />
        <circle cx="174" cy="84" r="2.5" stroke="#93C5FD" strokeWidth="1.5" fill="white" />
        <circle cx="48" cy="88" r="2" fill="#93C5FD" />

        {/* Laptop shadow */}
        <ellipse cx="110" cy="106" rx="66" ry="5" fill="#3B82F6" fillOpacity="0.22" filter="url(#laptopShadow)" />

        {/* Laptop screen outer frame */}
        <rect x="56" y="22" width="108" height="74" rx="9" fill="url(#screenBezel)" />
        {/* Laptop screen inner display */}
        <rect x="61" y="27" width="98" height="64" rx="6" fill="url(#screenInner)" />

        {/* Subtle glass reflection on screen */}
        <path d="M61 33C61 29.6863 63.6863 27 67 27H118L92 91H67C63.6863 91 61 88.3137 61 85V33Z" fill="white" fillOpacity="0.08" />

        {/* Folder / file card inside screen */}
        <rect x="91" y="40" width="38" height="38" rx="8" fill="white" fillOpacity="0.22" />
        <path
          d="M99 51C99 49.3431 100.343 48 102 48H107.172C107.702 48 108.211 48.2107 108.586 48.5858L110.414 50.4142C110.789 50.7893 111.298 51 111.828 51H118C119.657 51 121 52.3431 121 54V66C121 67.6569 119.657 69 118 69H102C100.343 69 99 67.6569 99 66V51Z"
          fill="white"
          fillOpacity="0.88"
        />
        <path
          d="M103 55H117V65C117 65.5523 116.552 66 116 66H104C103.448 66 103 65.5523 103 65V55Z"
          fill="#3B82F6"
          fillOpacity="0.55"
        />

        {/* Laptop keyboard base */}
        <path
          d="M42 96.5C42 95.1193 43.1193 94 44.5 94H175.5C176.881 94 178 95.1193 178 96.5V98C178 101.866 174.866 105 171 105H49C45.134 105 42 101.866 42 98V96.5Z"
          fill="url(#laptopBase)"
        />
        {/* Laptop base notch */}
        <rect x="96" y="94" width="28" height="3.5" rx="1.75" fill="#DBEAFE" />
      </svg>
    </div>
  );
}

function CloudGoogleIllustration() {
  return (
    <div className="sc-illustration" aria-hidden="true">
      <svg viewBox="0 0 220 130" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cloudBgBlob" x1="35" y1="15" x2="185" y2="115" gradientUnits="userSpaceOnUse">
            <stop stopColor="#EDE9FE" stopOpacity="0.85" />
            <stop offset="1" stopColor="#DBEAFE" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="cloud3dEdge" x1="55" y1="30" x2="170" y2="105" gradientUnits="userSpaceOnUse">
            <stop stopColor="#C4B5FD" />
            <stop offset="1" stopColor="#818CF8" />
          </linearGradient>
          <linearGradient id="cloudFront" x1="50" y1="26" x2="160" y2="104" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#F1F5F9" />
          </linearGradient>
          <filter id="cloudDropShadow" x="35" y="20" width="155" height="98" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#6366F1" floodOpacity="0.16" />
          </filter>
        </defs>

        {/* Soft ambient aura */}
        <ellipse cx="110" cy="68" rx="74" ry="44" fill="url(#cloudBgBlob)" />

        {/* Small decorative clouds */}
        <path
          d="M36 86H58C61.3137 86 64 83.3137 64 80C64 76.9235 61.6844 74.3879 58.6989 74.0398C57.6805 69.4526 53.5906 66 48.7 66C43.0667 66 38.5 70.5667 38.5 76.2C38.5 76.4041 38.506 76.6068 38.5178 76.8078C35.9737 77.4282 34 79.7191 34 82.45C34 84.4106 34.8954 86 36 86Z"
          fill="#DDD6FE"
          fillOpacity="0.7"
        />
        <path
          d="M162 66H184C187.314 66 190 63.3137 190 60C190 56.9235 187.684 54.3879 184.699 54.0398C183.68 49.4526 179.591 46 174.7 46C169.067 46 164.5 50.5667 164.5 56.2C164.5 56.4041 164.506 56.6068 164.518 56.8078C161.974 57.4282 160 59.7191 160 62.45C160 64.4106 160.895 66 162 66Z"
          fill="#DDD6FE"
          fillOpacity="0.65"
        />

        {/* Decorative dots & rings */}
        <circle cx="48" cy="46" r="3" stroke="#A78BFA" strokeWidth="1.5" fill="white" />
        <circle cx="164" cy="34" r="2.5" stroke="#93C5FD" strokeWidth="1.5" fill="white" />
        <circle cx="72" cy="24" r="2" fill="#C4B5FD" />

        {/* 3D back layer of main cloud */}
        <path
          d="M78 100H148C160.703 100 171 89.7025 171 77C171 65.4365 162.463 55.8685 151.341 54.2455C147.206 39.676 133.805 29 117.9 29C98.6805 29 83.1 44.5805 83.1 63.8C83.1 64.6148 83.128 65.4231 83.183 66.2237C73.449 68.1806 66 76.7819 66 87.1C66 94.2245 71.3726 100 78 100Z"
          fill="url(#cloud3dEdge)"
        />

        {/* Front white main cloud */}
        <g filter="url(#cloudDropShadow)">
          <path
            d="M72 99H142C154.703 99 165 88.7025 165 76C165 64.4365 156.463 54.8685 145.341 53.2455C141.206 38.676 127.805 28 111.9 28C92.6805 28 77.1 43.5805 77.1 62.8C77.1 63.6148 77.128 64.4231 77.183 65.2237C67.449 67.1806 60 75.7819 60 86.1C60 93.2245 65.3726 99 72 99Z"
            fill="url(#cloudFront)"
          />
        </g>

        {/* Official Google G Logo centered on the cloud */}
        <g transform="translate(94, 51) scale(0.75)">
          <path
            fill="#4285F4"
            d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
          />
          <path
            fill="#34A853"
            d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
          />
          <path
            fill="#FBBC05"
            d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
          />
          <path
            fill="#EA4335"
            d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
          />
        </g>
      </svg>
    </div>
  );
}

function GoogleBadgeIcon() {
  return (
    <span className="sc-google-badge" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <path
          fill="#4285F4"
          d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        />
        <path
          fill="#34A853"
          d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        />
        <path
          fill="#FBBC05"
          d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
        />
        <path
          fill="#EA4335"
          d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        />
      </svg>
    </span>
  );
}

export function StorageChooser({ onSelectMode, busy = false, error = '' }: StorageChooserProps) {
  const isNative = Capacitor.isNativePlatform();

  return (
    <div className="storage-chooser-screen">
      {/* Top action pills: Download Android APK (website only) and GitHub (website + APK) */}
      <nav className="sc-top-bar" aria-label="External links">
        {!isNative && (
          <a
            href="https://github.com/Yugraj20/SelfAttendancee/releases/latest/download/SelfAttendance.apk"
            className="sc-pill-btn sc-pill-download"
            download="SelfAttendance.apk"
            title="Download SelfAttendance for Android (.apk)"
          >
            <AndroidIcon size={16} />
            <span className="sc-pill-text-desktop">Download for Android</span>
            <span className="sc-pill-text-mobile">Download APK</span>
          </a>
        )}
        <a
          href="https://github.com/Yugraj20/SelfAttendancee"
          target="_blank"
          rel="noopener noreferrer"
          className="sc-pill-btn sc-pill-github"
          title="View source repository on GitHub"
        >
          <GitHubIcon size={16} />
          <span>GitHub</span>
        </a>
      </nav>

      {/* Decorative soft background shapes */}
      <div className="sc-bg-decor" aria-hidden="true">
        <span className="sc-blob sc-blob-tl" />
        <span className="sc-blob sc-blob-tr" />
        <span className="sc-blob sc-blob-br" />
      </div>

      <div className="sc-shell">
        {/* Top Hero Branding */}
        <header className="sc-hero">
          <AppCalendarIcon />
          <h1 className="sc-title">
            <span className="sc-title-dark">Self</span>
            <span className="sc-title-gradient">Attendance</span>
          </h1>
          <p className="sc-subtitle">Your personal attendance and timetable companion</p>
          <div className="sc-divider" aria-hidden="true">
            <span className="sc-divider-bar" />
            <span className="sc-divider-dot" />
          </div>
        </header>

        {/* Two Storage Option Cards */}
        <div className="sc-cards-grid">
          {/* Card 1: Local Storage */}
          <article className="sc-card sc-card-local">
            <div className="sc-card-body">
              <LaptopLocalIllustration />
              <h2 className="sc-card-heading">Use Local Storage</h2>
              <p className="sc-card-desc">
                Keep all your data on this device only.
                <br />
                No account required.
              </p>

              <ul className="sc-feature-list">
                <li>
                  <span className="sc-feature-icon sc-icon-blue">
                    <Lock size={17} />
                  </span>
                  <span>Completely private</span>
                </li>
                <li>
                  <span className="sc-feature-icon sc-icon-blue">
                    <WifiOff size={17} />
                  </span>
                  <span>Works offline</span>
                </li>
                <li>
                  <span className="sc-feature-icon sc-icon-blue">
                    <Database size={17} />
                  </span>
                  <span>Data stays on this device</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              className="sc-btn sc-btn-local"
              disabled={busy}
              onClick={() => onSelectMode('local')}
            >
              <span>Continue with Local Storage</span>
              <ChevronRight size={19} />
            </button>
          </article>

          {/* Card 2: Google Cloud Sync */}
          <article className="sc-card sc-card-cloud">
            <div className="sc-card-body">
              <CloudGoogleIllustration />
              <h2 className="sc-card-heading">Sign in with Google</h2>
              <p className="sc-card-desc">
                Sync your data across all your devices
                <br />
                and keep it safe in the cloud.
              </p>

              <ul className="sc-feature-list">
                <li>
                  <span className="sc-feature-icon sc-icon-purple">
                    <RefreshCw size={17} />
                  </span>
                  <span>Access on multiple devices</span>
                </li>
                <li>
                  <span className="sc-feature-icon sc-icon-purple">
                    <Cloud size={17} />
                  </span>
                  <span>Automatic cloud backup</span>
                </li>
                <li>
                  <span className="sc-feature-icon sc-icon-purple">
                    <ShieldCheck size={17} />
                  </span>
                  <span>Keep your data safe</span>
                </li>
                <li className="sc-feature-desktop-extra">
                  <span className="sc-feature-icon sc-icon-purple">
                    <Smartphone size={17} />
                  </span>
                  <span>Never lose your data</span>
                </li>
              </ul>

              {error && (
                <div
                  role="alert"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    marginBottom: 12,
                    borderRadius: 10,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: 12.5,
                    lineHeight: 1.4,
                    textAlign: 'left',
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            <button
              type="button"
              className="sc-btn sc-btn-cloud"
              disabled={busy}
              aria-busy={busy}
              onClick={() => onSelectMode('cloud')}
            >
              <GoogleBadgeIcon />
              <span>{busy ? 'Signing in…' : 'Continue with Google'}</span>
            </button>
          </article>
        </div>
      </div>
    </div>
  );
}
