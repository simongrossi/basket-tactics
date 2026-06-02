import { describe, it, expect } from 'vitest';
import { blitzReleaseEasing } from '@/lib/logic/blitzReleaseEasing';

describe('blitzReleaseEasing', () => {
  it('e(0) = 0', () => expect(blitzReleaseEasing(0)).toBe(0));
  it('e(1) = 1', () => expect(blitzReleaseEasing(1)).toBe(1));
  it('clamp en dehors de [0,1]', () => {
    expect(blitzReleaseEasing(-0.5)).toBe(0);
    expect(blitzReleaseEasing(1.5)).toBe(1);
  });
  it('ease-out : départ rapide, e(0.5) > 0.5', () => {
    expect(blitzReleaseEasing(0.5)).toBeGreaterThan(0.5);
  });
  it('monotone croissante', () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.1) {
      const v = blitzReleaseEasing(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
