import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import { syncOnLogin, pushToCloud, cancelPendingPush, flushPendingPush, _setFirestoreForTesting, _clearAllPendingPushesForTesting } from '../sync';
import { isReconciled, put, setReconciled, userData, clearUser } from '../db';
import { resetTestDb, createMockFirestore, sampleSubject, sampleAttendance, sampleSettings } from '../test/helpers';

// Spy on firebase/firestore functions so sync.ts calls go through our mock
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((fs: any, col: string, id: string) => ({ fs, path: `${col}/${id}`, id })),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
  };
});

describe('sync.ts cloud sync operations', () => {
  const uid = 'sync-user-1';
  let mockFirestore: ReturnType<typeof createMockFirestore>;

  beforeEach(async () => {
    await resetTestDb();
    mockFirestore = createMockFirestore();
    _setFirestoreForTesting(mockFirestore.mockFs);

    vi.mocked(firestoreModule.getDoc).mockImplementation(mockFirestore.getDoc as any);
    vi.mocked(firestoreModule.setDoc).mockImplementation(mockFirestore.setDoc as any);
  });

  afterEach(() => {
    _clearAllPendingPushesForTesting();
    _setFirestoreForTesting(null);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('skips sync when firestore is not configured/available', async () => {
    _setFirestoreForTesting(null);
    const res = await syncOnLogin(uid);
    expect(res).toBe('skipped');
  });

  it('seeds cloud when user document does not exist', async () => {
    // Put some local data in DB
    const sub = sampleSubject({ uid, name: 'Local Seed Subject' });
    await put('subjects', sub);

    const statuses: string[] = [];
    const res = await syncOnLogin(uid, s => statuses.push(s));

    expect(res).toBe('seeded');
    expect(statuses).toContain('syncing');
    expect(statuses).toContain('synced');

    // Cloud should now have the document
    expect(mockFirestore.setDoc).toHaveBeenCalled();
    const saved = mockFirestore.docs.get(`users/${uid}`);
    expect(saved).toBeDefined();
    expect(saved.subjects).toHaveLength(1);
    expect(saved.subjects[0].name).toBe('Local Seed Subject');
  });

  it('pulls cloud data down and overwrites local data when cloud doc exists', async () => {
    // Seed mock cloud document
    const cloudSub = sampleSubject({ uid, id: 'cloud-sub-1', name: 'Cloud Subject' });
    const cloudAtt = sampleAttendance({ uid, id: 'cloud-att-1' });
    const cloudSett = sampleSettings({ uid, defaultTarget: 80 });

    mockFirestore.docs.set(`users/${uid}`, {
      subjects: [cloudSub],
      attendance: [cloudAtt],
      timetable: [],
      settings: cloudSett,
      updatedAt: '2026-03-01T12:00:00.000Z',
    });

    // Local DB has a different subject before sync
    await put('subjects', sampleSubject({ uid, id: 'local-old-sub', name: 'Old Local' }));

    const res = await syncOnLogin(uid);
    expect(res).toBe('pulled');

    // Verify local DB was replaced with cloud data
    const local = await userData(uid);
    expect(local.subjects).toHaveLength(1);
    expect(local.subjects[0].name).toBe('Cloud Subject');
    expect(local.settings.defaultTarget).toBe(80);
  });

  it('returns failed and triggers error status if getDoc throws', async () => {
    vi.mocked(firestoreModule.getDoc).mockRejectedValueOnce(new Error('Network offline'));

    const statuses: string[] = [];
    const res = await syncOnLogin(uid, s => statuses.push(s));

    expect(res).toBe('failed');
    expect(statuses).toContain('syncing');
    expect(statuses.some(s => s === 'error' || s === 'offline')).toBe(true);
  });

  it('shares in-flight promise for concurrent syncOnLogin calls', async () => {
    let resolveGetDoc: any;
    const pendingPromise = new Promise(resolve => {
      resolveGetDoc = resolve;
    });
    vi.mocked(firestoreModule.getDoc).mockReturnValueOnce(pendingPromise as any);

    const call1 = syncOnLogin(uid);
    const call2 = syncOnLogin(uid);
    expect(call1).toBe(call2);

    resolveGetDoc({
      exists: () => false,
      data: () => undefined,
      id: uid,
    });

    const res1 = await call1;
    const res2 = await call2;
    expect(res1).toBe('seeded');
    expect(res2).toBe('seeded');
  });

  it('debounces pushToCloud and executes setDoc after 1200ms', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const sub = sampleSubject({ uid, name: 'Pushed Subject' });
      await put('subjects', sub);
      await setReconciled(uid, true);

      pushToCloud(uid);
      expect(mockFirestore.setDoc).not.toHaveBeenCalled();

      // Advance timers past debounce period
      await vi.advanceTimersByTimeAsync(1200);

      await vi.waitFor(() => {
        expect(mockFirestore.setDoc).toHaveBeenCalledTimes(1);
      });
      const saved = mockFirestore.docs.get(`users/${uid}`);
      expect(saved).toBeDefined();
      expect(saved.subjects).toHaveLength(1);
      expect(saved.subjects[0].name).toBe('Pushed Subject');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels pending push on cancelPendingPush', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      pushToCloud(uid);
      cancelPendingPush(uid);

      await vi.advanceTimersByTimeAsync(2000);
      expect(mockFirestore.setDoc).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('BUG-003: does not push to cloud if reconcile failed and marker is not set', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      vi.mocked(firestoreModule.getDoc).mockRejectedValueOnce(new Error('Network offline'));
      const res = await syncOnLogin(uid);
      expect(res).toBe('failed');

      // User makes a local edit
      const sub = sampleSubject({ uid, name: 'Local Only' });
      await put('subjects', sub);
      pushToCloud(uid);
      await vi.advanceTimersByTimeAsync(1500);

      expect(mockFirestore.setDoc).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('BUG-011: clear removes reconciled marker so subsequent edit does not overwrite cloud; sign-in restores data', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const cloudSubjects = [sampleSubject({ uid, name: 'Cloud Subject' })];
      mockFirestore.docs.set(`users/${uid}`, {
        subjects: cloudSubjects,
        attendance: [],
        timetable: [],
        settings: sampleSettings({ uid }),
        updatedAt: new Date().toISOString(),
      });
      vi.mocked(firestoreModule.getDoc).mockImplementation(async (ref: any) => ({
        exists: () => mockFirestore.docs.has(ref.path),
        data: () => mockFirestore.docs.get(ref.path),
        id: ref.id,
      } as any));

      await syncOnLogin(uid);
      expect(await isReconciled(uid)).toBe(true);

      await clearUser(uid);
      expect(await isReconciled(uid)).toBe(false);

      await put('settings', sampleSettings({ uid, theme: 'dark' }));
      pushToCloud(uid);

      await vi.advanceTimersByTimeAsync(1500);

      expect(mockFirestore.setDoc).not.toHaveBeenCalled();
      expect(mockFirestore.docs.get(`users/${uid}`).subjects[0].name).toBe('Cloud Subject');

      await syncOnLogin(uid);
      const local = await userData(uid);
      expect(local.subjects).toHaveLength(1);
      expect(local.subjects[0].name).toBe('Cloud Subject');
    } finally {
      vi.useRealTimers();
    }
  });

  it('BUG-002 scenario 1: mark then reload within 1s -> mark survives', async () => {
    // Initial state in cloud: 0 attendance records
    mockFirestore.docs.set(`users/${uid}`, {
      subjects: [sampleSubject({ uid, id: 's1' })],
      attendance: [],
      timetable: [],
      settings: sampleSettings({ uid }),
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(firestoreModule.getDoc).mockImplementation(async (ref: any) => ({
      exists: () => mockFirestore.docs.has(ref.path),
      data: () => mockFirestore.docs.get(ref.path),
      id: ref.id,
    } as any));

    await syncOnLogin(uid);

    // User marks attendance (locally saved) and triggers debounced push
    const att = sampleAttendance({ uid, id: 'a1', subjectId: 's1' });
    await put('attendance', att);
    pushToCloud(uid);

    // Reload occurs within 1s BEFORE push finishes
    _clearAllPendingPushesForTesting();

    // On reload, login sync runs
    await syncOnLogin(uid);

    const local = await userData(uid);
    expect(local.attendance).toHaveLength(1);
    expect(local.attendance[0].id).toBe('a1');
  });

  it('BUG-002 scenario 2: mark then logout -> after next login mark survives', async () => {
    mockFirestore.docs.set(`users/${uid}`, {
      subjects: [sampleSubject({ uid, id: 's1' })],
      attendance: [],
      timetable: [],
      settings: sampleSettings({ uid }),
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(firestoreModule.getDoc).mockImplementation(async (ref: any) => ({
      exists: () => mockFirestore.docs.has(ref.path),
      data: () => mockFirestore.docs.get(ref.path),
      id: ref.id,
    } as any));

    await syncOnLogin(uid);

    // Mark attendance
    const att = sampleAttendance({ uid, id: 'a1', subjectId: 's1' });
    await put('attendance', att);
    pushToCloud(uid);

    // Logout occurs immediately
    await flushPendingPush(uid);

    // Later, user logs in again
    await syncOnLogin(uid);

    const local = await userData(uid);
    expect(local.attendance).toHaveLength(1);
    expect(local.attendance[0].id).toBe('a1');
  });

  it('BUG-002 scenario 3: mark during a slow getDoc -> mark survives', async () => {
    mockFirestore.docs.set(`users/${uid}`, {
      subjects: [sampleSubject({ uid, id: 's1' })],
      attendance: [],
      timetable: [],
      settings: sampleSettings({ uid }),
      updatedAt: new Date().toISOString(),
    });

    let resolveGetDoc: any;
    const slowGetDoc = new Promise((resolve) => {
      resolveGetDoc = resolve;
    });
    vi.mocked(firestoreModule.getDoc).mockReturnValueOnce(slowGetDoc as any);

    await setReconciled(uid, true);
    // Start sync on login
    const loginPromise = syncOnLogin(uid);

    // While slow getDoc is in flight, user marks attendance
    const att = sampleAttendance({ uid, id: 'a1', subjectId: 's1' });
    await put('attendance', att);
    pushToCloud(uid);

    // Now getDoc finishes
    resolveGetDoc({
      exists: () => true,
      data: () => mockFirestore.docs.get(`users/${uid}`),
      id: uid,
    });

    await loginPromise;

    const local = await userData(uid);
    expect(local.attendance).toHaveLength(1);
    expect(local.attendance[0].id).toBe('a1');
  });
});
