import { describe, it, expect } from 'vitest';
import type { AppState, AttackerPositions, DefenderRule, DetectedTriggers } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { FT_LINE_Y } from '@/lib/data/court';
import { computeHelpTarget } from '@/lib/logic/help';
import { computeDefenseTargets } from '@/lib/logic/engine';

const HOOP = { x: 300, y: 75 };
const NAIL = { x: 300, y: FT_LINE_Y };
const noTriggers: DetectedTriggers = { drive: false, post: false, paint: false, any: false };
const driveTriggers: DetectedTriggers = { drive: true, post: false, paint: false, any: true };
const ruleSag = (helpPct: number): DefenderRule => ({
  helpPct,
  priority: 'man',
  vsCarrier: 'coller',
});

// ---------------------------------------------------------------------------
// P2.2 — deny du reversal au nail (opts.denyReversal)
// ---------------------------------------------------------------------------

describe('computeHelpTarget — deny du reversal au nail', () => {
  // Ballon sur l'aile droite ; O3 en tête (bande centrale ±30 px) = outlet
  // du reversal. Son défenseur doit glisser vers le nail.
  const carrier = { x: 450, y: 400 };
  const attTop = { x: 310, y: 350 };
  const manTop = { x: 310, y: 310 };

  it('flag on + homme en tête + ballon sur une aile → aim = nail, denying', () => {
    const r = computeHelpTarget(
      manTop, ruleSag(50), noTriggers, carrier, attTop, 1,
      undefined, HOOP, 0.45, 1, { denyReversal: true }
    );
    expect(r.denying).toBe(true);
    expect(r.aim).toEqual(NAIL);
    // Le target glisse effectivement vers le nail (vers le panier, y décroît)
    expect(r.target.y).toBeLessThan(manTop.y);
  });

  it('flag off → denial legacy (aim sur la ligne de passe, pas le nail)', () => {
    const r = computeHelpTarget(
      manTop, ruleSag(50), noTriggers, carrier, attTop, 1
    );
    expect(r.aim).not.toEqual(NAIL);
  });

  it('homme clairement sur une aile → comportement legacy inchangé', () => {
    const attWing = { x: 430, y: 350 };
    const manWing = { x: 425, y: 310 };
    const withFlag = computeHelpTarget(
      manWing, ruleSag(50), noTriggers, carrier, attWing, 1,
      undefined, HOOP, 0.45, 1, { denyReversal: true }
    );
    const without = computeHelpTarget(
      manWing, ruleSag(50), noTriggers, carrier, attWing, 1
    );
    expect(withFlag.target).toEqual(without.target);
  });

  it('ballon dans l\'axe (pas de reversal possible) → legacy', () => {
    const carrierTop = { x: 305, y: 420 };
    const withFlag = computeHelpTarget(
      manTop, ruleSag(50), noTriggers, carrierTop, attTop, 0,
      undefined, HOOP, 0.45, 1, { denyReversal: true }
    );
    expect(withFlag.aim).not.toEqual(NAIL);
  });

  it('trigger actif → l\'aide prime, pas de nail deny', () => {
    const r = computeHelpTarget(
      manTop, ruleSag(50), driveTriggers, carrier, attTop, 1,
      undefined, HOOP, 0.45, 1, { denyReversal: true }
    );
    expect(r.aim).not.toEqual(NAIL);
  });

  it('panier inversé (hoop bas) → nail miroité autour de la ligne médiane', () => {
    const hoopDown = { x: 300, y: 1005 };
    const carrierDown = { x: 450, y: 680 };
    const attTopDown = { x: 310, y: 730 };
    const manTopDown = { x: 310, y: 770 };
    const r = computeHelpTarget(
      manTopDown, ruleSag(50), noTriggers, carrierDown, attTopDown, 1,
      undefined, hoopDown, 0.45, 1, { denyReversal: true }
    );
    expect(r.aim).toEqual({ x: 300, y: 2 * 540 - FT_LINE_Y });
  });
});

// ---------------------------------------------------------------------------
// P2.2 — câblage state.denyReversalEnabled
// ---------------------------------------------------------------------------

const offTop: AttackerPositions = {
  O1: { x: 450, y: 400 }, // porteur aile droite
  O2: { x: 100, y: 400 },
  O3: { x: 310, y: 330 }, // en tête = outlet du reversal
  O4: { x: 480, y: 200 },
  O5: { x: 150, y: 180 },
};

function makeReversalState(enabled: boolean): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    denyReversalEnabled: enabled || undefined,
    triggers: { drive: false, post: false, paint: false, trap: false },
    // D3 par défaut est priority 'paint' (exclu du deny, comme le denial
    // legacy) : on le repasse en marquage standard pour ce scénario.
    rules: { ...s0.rules, D3: { ...s0.rules.D3, priority: 'man' } },
    steps: [{ ...s0.steps[0], off: offTop, ballCarrier: 'O1' }],
  };
}

describe('denyReversalEnabled — intégration pipeline man', () => {
  it('flag on → le défenseur du joueur en tête vise le nail', () => {
    const { positions } = computeDefenseTargets(makeReversalState(true), 0);
    expect(positions.D3.helpAim).toEqual(NAIL);
    expect(positions.D3.denying).toBe(true);
  });

  it('flag off → pas de nail aim', () => {
    const { positions } = computeDefenseTargets(makeReversalState(false), 0);
    expect(positions.D3.helpAim).not.toEqual(NAIL);
  });
});
