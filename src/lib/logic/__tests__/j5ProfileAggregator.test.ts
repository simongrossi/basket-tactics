// Tests J.5 — Profile aggregator.

import { describe, expect, it } from 'vitest';
import type { FrameProfile } from '@/lib/logic/playback/frameResolver';
import { aggregateProfiles, ProfileRingBuffer } from '@/lib/logic/playback/profileAggregator';

function makeProfile(totalMs: number, phases: Partial<FrameProfile['phases']> = {}): FrameProfile {
  return {
    totalMs,
    phases: {
      attackers: 0, screens: 0, obstacles: 0, defenders: 0,
      collisions: 0, rateLimiter: 0, ball: 0,
      ...phases,
    },
  };
}

describe('J.5 — aggregateProfiles', () => {
  it('retourne stats vides pour buffer vide', () => {
    const agg = aggregateProfiles([]);
    expect(agg.count).toBe(0);
    expect(agg.total.mean).toBe(0);
    expect(agg.hottestPhase).toBeNull();
  });

  it('calcule mean / max correctement', () => {
    const profiles = [
      makeProfile(10, { defenders: 4, screens: 2 }),
      makeProfile(20, { defenders: 8, screens: 4 }),
      makeProfile(30, { defenders: 12, screens: 6 }),
    ];
    const agg = aggregateProfiles(profiles);
    expect(agg.count).toBe(3);
    expect(agg.total.mean).toBe(20);
    expect(agg.total.max).toBe(30);
    expect(agg.byPhase.defenders.mean).toBe(8);
    expect(agg.byPhase.defenders.max).toBe(12);
    expect(agg.byPhase.screens.mean).toBe(4);
  });

  it('identifie la phase la plus coûteuse (hottestPhase)', () => {
    const profiles = [
      makeProfile(20, { defenders: 12, screens: 2, attackers: 3 }),
      makeProfile(18, { defenders: 10, screens: 3, attackers: 4 }),
    ];
    const agg = aggregateProfiles(profiles);
    expect(agg.hottestPhase).toBe('defenders');
  });

  it('calcule p95 sur fenêtre suffisante', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const profiles = values.map((v) => makeProfile(v));
    const agg = aggregateProfiles(profiles);
    // p95 sur 10 valeurs : index ceil(0.95 × 10) - 1 = 10 - 1 = 9 (clamp), valeur = 10.
    expect(agg.total.p95).toBe(10);
    expect(agg.total.max).toBe(10);
  });

  it('sum = somme totale (peut servir aux ratios)', () => {
    const profiles = [makeProfile(5), makeProfile(7), makeProfile(8)];
    const agg = aggregateProfiles(profiles);
    expect(agg.total.sum).toBe(20);
  });
});

describe('J.5 — ProfileRingBuffer', () => {
  it('garde les maxSize derniers profiles (FIFO)', () => {
    const buf = new ProfileRingBuffer(3);
    buf.push(makeProfile(1));
    buf.push(makeProfile(2));
    buf.push(makeProfile(3));
    buf.push(makeProfile(4)); // doit pousser le 1 dehors
    expect(buf.size()).toBe(3);
    expect(buf.snapshot().map((p) => p.totalMs)).toEqual([2, 3, 4]);
  });

  it('clear vide le buffer', () => {
    const buf = new ProfileRingBuffer(5);
    buf.push(makeProfile(1));
    buf.push(makeProfile(2));
    buf.clear();
    expect(buf.size()).toBe(0);
    expect(buf.snapshot()).toEqual([]);
  });

  it('snapshot retourne une COPIE (mutations isolées)', () => {
    const buf = new ProfileRingBuffer(5);
    buf.push(makeProfile(1));
    const snap = buf.snapshot();
    snap.push(makeProfile(99));
    expect(buf.size()).toBe(1);
  });

  it('default maxSize 120', () => {
    const buf = new ProfileRingBuffer();
    expect(buf.maxSize).toBe(120);
  });
});
