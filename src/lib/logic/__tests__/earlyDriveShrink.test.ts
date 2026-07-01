import { describe, it, expect } from 'vitest';
import type { AppState, DefenderRule, DetectedTriggers } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { detectEarlyDrive } from '@/lib/logic/triggers';
import { computeHelpTarget } from '@/lib/logic/help';
import { computeDefenseTargets } from '@/lib/logic/engine';

const HOOP = { x: 300, y: 75 };
const noTriggers: DetectedTriggers = { drive: false, post: false, paint: false, any: false };
const ruleSag = (helpPct: number): DefenderRule => ({
  helpPct,
  priority: 'man',
  vsCarrier: 'coller',
});

// ---------------------------------------------------------------------------
// P1.4 — détecteur pur « drive naissant » (pré-trigger sous le seuil drive)
// ---------------------------------------------------------------------------

describe('detectEarlyDrive — intensité 0..1 du drive naissant', () => {
  const off = (carrier: { x: number; y: number }) => ({
    O1: carrier, O2: { x: 100, y: 340 }, O3: { x: 480, y: 250 },
    O4: { x: 150, y: 150 }, O5: { x: 400, y: 130 },
  });

  it('porteur statique → 0', () => {
    const cur = off({ x: 400, y: 300 });
    expect(detectEarlyDrive(cur, cur, 'O1', HOOP)).toBe(0);
  });

  it('pas de step précédent → 0 (pas de mouvement mesurable)', () => {
    expect(detectEarlyDrive(off({ x: 400, y: 300 }), null, 'O1', HOOP)).toBe(0);
  });

  it('micro-déplacement vers le panier (< 10 px) → 0', () => {
    const prev = off({ x: 400, y: 300 });
    const cur = off({ x: 396, y: 294 }); // ~7 px gagnés vers le panier
    expect(detectEarlyDrive(cur, prev, 'O1', HOOP)).toBe(0);
  });

  it('rampe : delta entre 10 et 25 px vers le panier → intensité croissante', () => {
    const prev = off({ x: 400, y: 300 });
    // Direction prev→hoop ≈ (-0.406, -0.914). 15 px le long de cet axe.
    const cur = off({ x: 400 - 0.406 * 15, y: 300 - 0.914 * 15 });
    const i = detectEarlyDrive(cur, prev, 'O1', HOOP);
    expect(i).toBeGreaterThan(0.2);
    expect(i).toBeLessThan(0.8);
  });

  it('delta ≥ 25 px (seuil du vrai trigger drive) → intensité 1', () => {
    const prev = off({ x: 400, y: 300 });
    const cur = off({ x: 400 - 0.406 * 30, y: 300 - 0.914 * 30 });
    expect(detectEarlyDrive(cur, prev, 'O1', HOOP)).toBe(1);
  });

  it("porteur qui s'éloigne du panier → 0", () => {
    const prev = off({ x: 400, y: 300 });
    const cur = off({ x: 420, y: 340 });
    expect(detectEarlyDrive(cur, prev, 'O1', HOOP)).toBe(0);
  });

  it('porteur trop loin du panier (> 350 px) → 0 même en mouvement', () => {
    const prev = off({ x: 560, y: 520 });
    const cur = off({ x: 550, y: 505 }); // vers le panier mais à ~460 px
    expect(detectEarlyDrive(cur, prev, 'O1', HOOP)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// P1.4 — effet sur l'aide weak-side (option earlyDriveShrink)
// ---------------------------------------------------------------------------

describe('computeHelpTarget — shrink weak-side sur drive naissant', () => {
  const carrier = { x: 400, y: 300 };
  const att = { x: 100, y: 340 }; // weak-side
  const manPos = { x: 100, y: 260 };

  it('earlyDriveShrink > 0 → le sag weak-side est plus profond', () => {
    const base = computeHelpTarget(
      manPos, ruleSag(50), noTriggers, carrier, att, 1
    );
    const shrunk = computeHelpTarget(
      manPos, ruleSag(50), noTriggers, carrier, att, 1,
      undefined, HOOP, 0.45, 1, { earlyDriveShrink: 1 }
    );
    expect(shrunk.helpFactor).toBeGreaterThan(base.helpFactor);
    // Plus proche de l'aim (raquette) que le sag de base
    const dBase = Math.hypot(base.target.x - base.aim!.x, base.target.y - base.aim!.y);
    const dShrunk = Math.hypot(shrunk.target.x - shrunk.aim!.x, shrunk.target.y - shrunk.aim!.y);
    expect(dShrunk).toBeLessThan(dBase);
  });

  it('earlyDriveShrink = 0 → strictement identique au legacy', () => {
    const base = computeHelpTarget(
      manPos, ruleSag(50), noTriggers, carrier, att, 1
    );
    const zero = computeHelpTarget(
      manPos, ruleSag(50), noTriggers, carrier, att, 1,
      undefined, HOOP, 0.45, 1, { earlyDriveShrink: 0 }
    );
    expect(zero.target).toEqual(base.target);
  });

  it('un défenseur strong-side ne shrinke pas (denial préservé)', () => {
    const attStrong = { x: 420, y: 380 };
    const manStrong = { x: 410, y: 330 };
    const base = computeHelpTarget(
      manStrong, ruleSag(50), noTriggers, carrier, attStrong, 1
    );
    const withShrink = computeHelpTarget(
      manStrong, ruleSag(50), noTriggers, carrier, attStrong, 1,
      undefined, HOOP, 0.45, 1, { earlyDriveShrink: 1 }
    );
    expect(withShrink.kind).toBe(base.kind);
    expect(withShrink.target).toEqual(base.target);
  });
});

// ---------------------------------------------------------------------------
// P1.4 — câblage state.weakSideShrinkEnabled dans le pipeline
// ---------------------------------------------------------------------------

function makeShrinkState(enabled: boolean): AppState {
  const s0 = makeInitialState();
  const prevOff = {
    O1: { x: 400, y: 300 }, O2: { x: 100, y: 340 }, O3: { x: 480, y: 250 },
    O4: { x: 150, y: 150 }, O5: { x: 460, y: 130 },
  };
  const curOff = {
    ...prevOff,
    O1: { x: 394, y: 286 }, // ~15 px gagnés vers le panier = drive naissant
  };
  return {
    ...s0,
    weakSideShrinkEnabled: enabled || undefined,
    // Pas de vrai trigger : le shrink est un PRÉ-trigger.
    triggers: { drive: false, post: false, paint: false, trap: false },
    steps: [
      { ...s0.steps[0], off: prevOff, ballCarrier: 'O1' },
      { ...s0.steps[0], off: curOff, ballCarrier: 'O1' },
    ],
    activeStep: 1,
  };
}

describe('weakSideShrinkEnabled — intégration pipeline man', () => {
  it('flag on + drive naissant → le weak-side D2 est tiré plus profond vers la raquette', () => {
    const base = computeDefenseTargets(makeShrinkState(false), 1).positions;
    const shrunk = computeDefenseTargets(makeShrinkState(true), 1).positions;
    const dHoopBase = Math.hypot(base.D2.x - HOOP.x, base.D2.y - HOOP.y);
    const dHoopShrunk = Math.hypot(shrunk.D2.x - HOOP.x, shrunk.D2.y - HOOP.y);
    expect(dHoopShrunk).toBeLessThan(dHoopBase);
  });

  it('flag off → positions identiques au legacy', () => {
    const a = computeDefenseTargets(makeShrinkState(false), 1).positions;
    const s0 = makeInitialState();
    const legacyState = { ...makeShrinkState(false), weakSideShrinkEnabled: undefined } as AppState;
    const b = computeDefenseTargets(legacyState, 1).positions;
    expect(a.D2.x).toBeCloseTo(b.D2.x, 9);
    expect(a.D2.y).toBeCloseTo(b.D2.y, 9);
    void s0;
  });
});
