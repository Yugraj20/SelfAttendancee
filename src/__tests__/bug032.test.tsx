import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { TimetablePage, Profile } from '../App';
import type { AuthUser } from '../firebase';
import type { Subject, TimetableEntry } from '../types';
import { DAYS } from '../types';

describe('BUG-032: Aria-labels for icon-only buttons and photoURL guard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders aria-labels for edit class and delete class buttons in TimetablePage', () => {
    const today = DAYS[(new Date().getDay() + 6) % 7];

    const mockSubject: Subject = {
      id: 'sub1',
      uid: 'u1',
      name: 'Algorithms',
      code: 'CS101',
      teacher: 'Dr. Smith',
      room: '101',
      color: '#6d5dfc',
      target: 75,
      createdAt: '2026-01-01T00:00:00.000Z'
    };

    const mockEntry: TimetableEntry = {
      id: 'e1',
      uid: 'u1',
      day: today,
      subjectId: 'sub1',
      subject: 'Algorithms',
      startTime: '09:00',
      endTime: '10:00',
      room: '101',
      teacher: 'Dr. Smith',
      type: 'Lecture',
      notes: '',
      order: 0
    };

    render(
      <TimetablePage
        subjects={[mockSubject]}
        table={[mockEntry]}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onImport={() => {}}
      />
    );

    const editBtn = screen.getByRole('button', { name: /Edit class/i });
    const deleteBtn = screen.getByRole('button', { name: /Delete class/i });

    expect(editBtn).toBeDefined();
    expect(deleteBtn).toBeDefined();
  });

  it('does not render an img with empty src when user.photoURL is null', () => {
    const user = {
      uid: 'u1',
      displayName: 'Alice',
      email: 'alice@example.com',
      photoURL: null
    } as unknown as AuthUser;

    const { container } = render(<Profile user={user} />);
    const img = container.querySelector('img');
    expect(img).toBeNull();
  });
});
