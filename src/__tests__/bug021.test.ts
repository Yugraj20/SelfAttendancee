import { describe, it, expect } from 'vitest';
import { id } from '../db';

describe('BUG-021: id generation produces valid UUID v4', () => {
  it('generates standard UUID format', () => {
    const val = id();
    expect(val).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates unique values across 1000 iterations', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const val = id();
      expect(set.has(val)).toBe(false);
      set.add(val);
    }
    expect(set.size).toBe(1000);
  });
});
