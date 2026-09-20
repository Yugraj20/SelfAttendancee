import { vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import { _resetDbForTesting } from '../db';
import { _setFirestoreForTesting } from '../sync';
import type { Attendance, Settings, Subject, TimetableEntry } from '../types';

export interface MockFirestoreData {
  [path: string]: any;
}

export function createMockFirestore(initialDocs: MockFirestoreData = {}) {
  const docs = new Map<string, any>(Object.entries(initialDocs));

  const getDoc = vi.fn(async (docRef: any) => {
    const path = docRef?.path ?? (typeof docRef === 'string' ? docRef : `users/${docRef?.id}`);
    const exists = docs.has(path);
    const data = exists ? JSON.parse(JSON.stringify(docs.get(path))) : undefined;
    return {
      exists: () => exists,
      data: () => data,
      id: docRef?.id,
      ref: docRef,
    };
  });

  const setDoc = vi.fn(async (docRef: any, data: any) => {
    const path = docRef?.path ?? (typeof docRef === 'string' ? docRef : `users/${docRef?.id}`);
    docs.set(path, JSON.parse(JSON.stringify(data)));
  });

  const doc = vi.fn((_fs: any, collection: string, id: string) => {
    return { id, path: `${collection}/${id}` };
  });

  const mockFs = { _mock: true } as unknown as Firestore;

  return {
    mockFs,
    docs,
    getDoc,
    setDoc,
    doc,
  };
}

export async function resetTestDb() {
  await _resetDbForTesting();
}

export function sampleSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: 'sub-1',
    uid: 'user-1',
    name: 'Computer Networks',
    code: 'CS301',
    teacher: 'Dr. Smith',
    room: 'Room 101',
    color: '#4f46e5',
    target: 75,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function sampleAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'att-1',
    uid: 'user-1',
    subjectId: 'sub-1',
    date: '2026-03-01',
    sessionId: 'manual',
    status: 'present',
    updatedAt: '2026-03-01T10:00:00.000Z',
    ...overrides,
  };
}

export function sampleTimetable(overrides: Partial<TimetableEntry> = {}): TimetableEntry {
  return {
    id: 'tt-1',
    uid: 'user-1',
    subjectId: 'sub-1',
    subject: 'Computer Networks',
    day: 'Monday',
    startTime: '09:00',
    endTime: '10:00',
    room: 'Room 101',
    teacher: 'Prof. Davis',
    type: 'lecture',
    notes: '',
    order: 0,
    ...overrides,
  };
}

export function sampleSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    uid: 'user-1',
    defaultTarget: 75,
    theme: 'system',
    onboardingComplete: true,
    ...overrides,
  };
}
