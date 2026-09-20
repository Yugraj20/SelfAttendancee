import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';
import { Modal } from '../App';

describe('BUG-025: Modal accessibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.style.overflow = '';
  });

  it('locks body scroll when open and restores it when unmounted', () => {
    expect(document.body.style.overflow).toBe('');
    const { unmount } = render(
      <Modal onClose={() => {}}>
        <h2>Test Modal</h2>
        <p>Modal content</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on Escape key press', () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <h2>Test Modal</h2>
        <button>Action</button>
      </Modal>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('has aria-label on close button', () => {
    render(
      <Modal onClose={() => {}}>
        <h2>Test Title</h2>
      </Modal>
    );
    const closeBtn = screen.getByRole('button', { name: /close/i });
    expect(closeBtn).toBeDefined();
    expect(closeBtn.getAttribute('aria-label')).toBe('Close dialog');
  });

  it('links aria-labelledby to the heading element', () => {
    render(
      <Modal onClose={() => {}}>
        <h2>Accessible Title</h2>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    const heading = screen.getByRole('heading', { level: 2 });
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(heading.getAttribute('id')).toBe(dialog.getAttribute('aria-labelledby'));
  });

  it('returns focus to trigger element on close/unmount', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open Modal';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <Modal onClose={() => {}}>
        <h2>Modal Header</h2>
        <button>Inside Button</button>
      </Modal>
    );

    unmount();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});
