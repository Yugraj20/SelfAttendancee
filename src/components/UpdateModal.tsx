import React from 'react';
import { ArrowUpCircle, Clock, Download, ExternalLink, ShieldAlert, Sparkles, X } from 'lucide-react';
import { openDownloadLink, type UpdateInfo } from '../updater';

interface UpdateModalProps {
  updateInfo: UpdateInfo;
  onDismiss: () => void;
}

export function UpdateModal({ updateInfo, onDismiss }: UpdateModalProps) {
  const {
    currentVersion,
    latestVersion,
    downloadUrl,
    releaseUrl,
    releaseNotes,
    isForced,
    daysRemaining,
    hoursRemaining,
  } = updateInfo;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isForced) {
      onDismiss();
    }
  };

  const handleDownload = () => {
    openDownloadLink(downloadUrl);
  };

  return (
    <div
      className="update-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
    >
      <div className={`update-modal-card ${isForced ? 'forced' : ''}`}>
        {!isForced && (
          <button
            type="button"
            className="update-modal-close"
            onClick={onDismiss}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        )}

        {/* Header with Icon & Title */}
        <div className="update-modal-header">
          <div className={`update-modal-icon-badge ${isForced ? 'forced' : ''}`}>
            {isForced ? (
              <ShieldAlert size={28} className="update-icon-alert" />
            ) : (
              <Sparkles size={28} className="update-icon-sparkle" />
            )}
          </div>
          <h2 id="update-modal-title" className="update-modal-title">
            {isForced ? 'Update Required' : 'New Version Available'}
          </h2>
          <p className="update-modal-subtitle">
            {isForced
              ? 'The 3-day grace period for this version has expired. Please update SelfAttendance to continue using the application.'
              : 'A new release is ready with updates and improvements.'}
          </p>
        </div>

        {/* Version Transition Box */}
        <div className="update-version-card">
          <div className="update-version-col">
            <span className="update-version-label">Current Version</span>
            <span className="update-version-chip current">v{currentVersion.replace(/^v/i, '')}</span>
          </div>
          <div className="update-version-arrow">
            <ArrowUpCircle size={20} />
          </div>
          <div className="update-version-col">
            <span className="update-version-label">{isForced ? 'Required Version' : 'Latest Version'}</span>
            <span className="update-version-chip target">{latestVersion}</span>
          </div>
        </div>

        {/* Grace Period Status Banner */}
        <div className={`update-grace-banner ${isForced ? 'expired' : 'active'}`}>
          <div className="update-grace-icon">
            {isForced ? <ShieldAlert size={18} /> : <Clock size={18} />}
          </div>
          <div className="update-grace-content">
            <b className="update-grace-title">
              {isForced
                ? 'Grace Period Expired'
                : `Grace Period: ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`}
            </b>
            <p className="update-grace-desc">
              {isForced
                ? 'App access is temporarily locked until the latest version is installed.'
                : hoursRemaining <= 24
                ? `Only ${hoursRemaining} hours left before update becomes mandatory.`
                : 'You may continue using the app for now, but updating is required once the grace period ends.'}
            </p>
          </div>
        </div>

        {/* Release Notes Preview */}
        {releaseNotes && (
          <div className="update-notes-container">
            <span className="update-notes-title">Release Notes</span>
            <div className="update-notes-body">
              {releaseNotes}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="update-modal-actions">
          {!isForced && (
            <button
              type="button"
              className="update-btn-later"
              onClick={onDismiss}
            >
              Remind Me Later
            </button>
          )}

          <button
            type="button"
            className={`update-btn-download ${isForced ? 'full' : ''}`}
            onClick={handleDownload}
          >
            <Download size={18} />
            <span>{isForced ? 'Download & Install Update' : 'Update Now'}</span>
          </button>
        </div>

        {/* Optional Release Page Link */}
        <div className="update-external-row">
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="update-external-link"
          >
            <span>View release on GitHub</span>
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </div>
  );
}
