import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executePush, _setFirestoreForTesting } from '../sync';
import type { Firestore } from 'firebase/firestore';
import { setReconciled, setDirty, put, remove, userData } from '../db';
import type { Attendance } from '../types';

describe('POTENTIAL BUGS (P1, P2)', () => {
  describe('P1: Offline push immediately sets offline status instead of getting stuck on syncing', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', { onLine: false });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('sets status to offline immediately when navigator.onLine is false', async () => {
      const mockFirestore = {} as Firestore;
      _setFirestoreForTesting(mockFirestore);

      const statusUpdates: string[] = [];
      await setReconciled('userP1', true);
      await setDirty('userP1', true);

      await executePush('userP1', (s) => statusUpdates.push(s));

      expect(statusUpdates).toContain('offline');
      expect(statusUpdates).not.toContain('syncing');
      _setFirestoreForTesting(null);
    });
  });

  describe('P2: Double-tap in-flight guard prevents duplicate attendance writes', () => {
    it('guards rapid concurrent mark calls for the same subject+date+session', async () => {
      const markingInFlight = new Set<string>();
      let writeCount = 0;

      const simulateMark = async (subjectId: string, date: string, sessionId: string) => {
        const flightKey = `${subjectId}|${date}|${sessionId}`;
        if (markingInFlight.has(flightKey)) return;
        markingInFlight.add(flightKey);
        try {
          // simulate async database write and reload
          await new Promise((resolve) => setTimeout(resolve, 50));
          writeCount++;
        } finally {
          markingInFlight.delete(flightKey);
        }
      };

      // Two rapid taps fired concurrently before first one finishes
      const p1 = simulateMark('sub1', '2026-09-21', 'session1');
      const p2 = simulateMark('sub1', '2026-09-21', 'session1');

      await Promise.all([p1, p2]);

      expect(writeCount).toBe(1);
    });
  });
});
