import React from 'react';
import { HardDrive, Cloud, Shield, AlertTriangle, ArrowRight } from 'lucide-react';
import type { StorageMode } from '../storage-mode';

interface StorageChooserProps {
  onSelectMode: (mode: StorageMode) => void;
}

export function StorageChooser({ onSelectMode }: StorageChooserProps) {
  return (
    <div className="login storage-chooser-container">
      <div className="login-glow" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="login-shell" style={{ maxWidth: 840 }}>
        <header className="login-head" style={{ marginBottom: 32 }}>
          <div className="login-brand">
            <span className="login-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <span>
              <b>Self Attendance</b>
              <small>Smart class and bunk engine</small>
            </span>
          </div>
        </header>

        <section style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10, color: 'var(--text)' }}>
            Where should your data live?
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, maxWidth: 520, margin: '0 auto', lineHeight: 1.5 }}>
            Choose how you want to manage your timetable and attendance. You can switch or connect to cloud sync at any time in Settings.
          </p>
        </section>

        <div className="storage-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {/* Option 1: Local Only */}
          <article
            className="card storage-card"
            style={{
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              borderRadius: 16,
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              transition: 'border-color 0.2s, transform 0.15s',
            }}
          >
            <div>
              <div style={{ display: 'inline-flex', padding: 12, borderRadius: 12, background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', marginBottom: 16 }}>
                <HardDrive size={26} />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Keep it on this device</h2>
              <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
                Private, instant, and completely offline. No Google account required. Works with zero cloud setup.
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(234, 179, 8, 0.08)',
                  border: '1px solid rgba(234, 179, 8, 0.2)',
                  fontSize: 12,
                  color: '#eab308',
                  marginBottom: 20,
                  lineHeight: 1.4,
                }}
              >
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  <strong>Note:</strong> Uninstalling the app or clearing app storage deletes local data. Use <em>Backup data</em> in Settings to protect your history.
                </span>
              </div>
            </div>
            <button
              className="primary full"
              style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onClick={() => onSelectMode('local')}
            >
              Continue with Local Mode <ArrowRight size={16} />
            </button>
          </article>

          {/* Option 2: Cloud Sync */}
          <article
            className="card storage-card"
            style={{
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              borderRadius: 16,
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              transition: 'border-color 0.2s, transform 0.15s',
            }}
          >
            <div>
              <div style={{ display: 'inline-flex', padding: 12, borderRadius: 12, background: 'rgba(47, 184, 114, 0.1)', color: '#2fb872', marginBottom: 16 }}>
                <Cloud size={26} />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Sign in & sync with Google</h2>
              <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
                Automatically backs up your subjects and attendance to your private cloud storage. Seamlessly syncs across all your devices.
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(47, 184, 114, 0.08)',
                  border: '1px solid rgba(47, 184, 114, 0.2)',
                  fontSize: 12,
                  color: '#2fb872',
                  marginBottom: 20,
                  lineHeight: 1.4,
                }}
              >
                <Shield size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Private & secure: only your verified Google account can access your timetable and records.</span>
              </div>
            </div>
            <button
              className="primary full"
              style={{
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'var(--brand)',
              }}
              onClick={() => onSelectMode('cloud')}
            >
              Sign In with Google <ArrowRight size={16} />
            </button>
          </article>
        </div>
      </div>
    </div>
  );
}
