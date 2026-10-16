import React, { useState } from 'react';
import { Modal } from '../App';
import { GitMerge, CloudDownload, CloudUpload, ShieldCheck } from 'lucide-react';
import type { ConflictChoice, UserDataset } from '../sync-conflict';

interface ConflictModalProps {
  localData: UserDataset;
  cloudData: UserDataset;
  onResolve: (choice: ConflictChoice) => Promise<void>;
  onClose: () => void;
}

export function ConflictModal({ localData, cloudData, onResolve, onClose }: ConflictModalProps) {
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ConflictChoice>('merge');

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onResolve(selected);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20 }}>
        <GitMerge size={22} color="var(--brand)" /> Choose Sync Strategy
      </h2>
      <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
        We found existing attendance data on both this device and your cloud account. How would you like to reconcile them?
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {/* Option 1: Merge */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: 14,
            borderRadius: 12,
            border: `1.5px solid ${selected === 'merge' ? 'var(--brand)' : 'var(--line)'}`,
            background: selected === 'merge' ? 'rgba(109, 93, 252, 0.08)' : 'var(--panel)',
            cursor: 'pointer',
          }}
        >
          <input
            type="radio"
            name="conflict-choice"
            checked={selected === 'merge'}
            onChange={() => setSelected('merge')}
            style={{ marginTop: 3 }}
          />
          <div>
            <b style={{ display: 'block', fontSize: 15, color: 'var(--text)', marginBottom: 2 }}>
              Merge data (Recommended)
            </b>
            <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4, display: 'block' }}>
              Combines both copies without data loss. If any records overlap, the newer mark or update wins.
            </span>
          </div>
        </label>

        {/* Option 2: Keep Cloud */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: 14,
            borderRadius: 12,
            border: `1.5px solid ${selected === 'keep_cloud' ? 'var(--brand)' : 'var(--line)'}`,
            background: selected === 'keep_cloud' ? 'rgba(109, 93, 252, 0.08)' : 'var(--panel)',
            cursor: 'pointer',
          }}
        >
          <input
            type="radio"
            name="conflict-choice"
            checked={selected === 'keep_cloud'}
            onChange={() => setSelected('keep_cloud')}
            style={{ marginTop: 3 }}
          />
          <div>
            <b style={{ display: 'block', fontSize: 15, color: 'var(--text)', marginBottom: 2 }}>
              Keep Cloud Copy
            </b>
            <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4, display: 'block' }}>
              Replaces data on this device with your cloud backup ({cloudData.subjects.length} subjects, {cloudData.attendance.length} records).
            </span>
          </div>
        </label>

        {/* Option 3: Keep Device */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: 14,
            borderRadius: 12,
            border: `1.5px solid ${selected === 'keep_device' ? 'var(--brand)' : 'var(--line)'}`,
            background: selected === 'keep_device' ? 'rgba(109, 93, 252, 0.08)' : 'var(--panel)',
            cursor: 'pointer',
          }}
        >
          <input
            type="radio"
            name="conflict-choice"
            checked={selected === 'keep_device'}
            onChange={() => setSelected('keep_device')}
            style={{ marginTop: 3 }}
          />
          <div>
            <b style={{ display: 'block', fontSize: 15, color: 'var(--text)', marginBottom: 2 }}>
              Keep Device Copy
            </b>
            <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4, display: 'block' }}>
              Overwrites your cloud account with this device's data ({localData.subjects.length} subjects, {localData.attendance.length} records).
            </span>
          </div>
        </label>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          fontSize: 12,
          color: '#2fb872',
          padding: '8px 12px',
          background: 'rgba(47, 184, 114, 0.08)',
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <ShieldCheck size={16} style={{ flexShrink: 0 }} />
        <span>An automatic safety snapshot of your local data will be saved to IndexedDB first.</span>
      </div>

      <button className="primary full" disabled={busy} onClick={handleConfirm}>
        {busy ? 'Reconciling…' : 'Apply Selected Choice'}
      </button>
    </Modal>
  );
}
