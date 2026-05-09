import { describe, it, expect } from 'vitest';
import {
  computeDefenderOrientation,
  computeAttackerOrientation,
} from '../orientation';

const HOOP = { x: 300, y: 75 };

describe('computeDefenderOrientation', () => {
  it('on-ball defender regarde le porteur (manPos = ballCarrier)', () => {
    const r = computeDefenderOrientation({
      defenderPos: { x: 300, y: 410 },
      manPos: { x: 300, y: 470 },
      ballPos: { x: 300, y: 470 },
      isCarrierDefender: true,
    });
    expect(r.facing).toEqual({ x: 300, y: 470 });
  });

  it('fronting → facing pointe vers le ballon (pas vers son homme)', () => {
    const r = computeDefenderOrientation({
      defenderPos: { x: 200, y: 300 },
      manPos: { x: 200, y: 400 }, // homme weak-side
      ballPos: { x: 500, y: 200 }, // ballon strong-side
      stance: 'fronting',
    });
    expect(r.facing).toEqual({ x: 500, y: 200 });
  });

  it('deny-3q → facing pointe vers le ballon', () => {
    const r = computeDefenderOrientation({
      defenderPos: { x: 200, y: 300 },
      manPos: { x: 200, y: 400 },
      ballPos: { x: 500, y: 200 },
      stance: 'deny-3q',
    });
    expect(r.facing).toEqual({ x: 500, y: 200 });
  });

  it('sag/behind → facing entre homme et ballon (head-on-swivel)', () => {
    const r = computeDefenderOrientation({
      defenderPos: { x: 200, y: 300 },
      manPos: { x: 200, y: 400 },
      ballPos: { x: 400, y: 400 },
      stance: 'sag',
    });
    // midpoint man-ball
    expect(r.facing).toEqual({ x: 300, y: 400 });
  });

  it('orientation est calculée comme angle horaire depuis le haut (nord)', () => {
    // Défenseur en (300, 300), facing en (400, 300) → à droite (est) → orientation +90°
    const r = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 400, y: 300 },
      ballPos: { x: 400, y: 300 },
      isCarrierDefender: true,
    });
    expect(r.orientationDeg).toBeCloseTo(90, 0);
  });

  it('vsCarrier=topside : on-ball ajoute +30° (push baseline)', () => {
    const baseR = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 400, y: 300 },
      ballPos: { x: 400, y: 300 },
      isCarrierDefender: true,
      vsCarrier: 'coller',
    });
    const topsideR = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 400, y: 300 },
      ballPos: { x: 400, y: 300 },
      isCarrierDefender: true,
      vsCarrier: 'topside',
    });
    expect(topsideR.orientationDeg - baseR.orientationDeg).toBeCloseTo(30, 0);
  });

  it('manual delta : ajouté à l\'auto et clampé à [-45, +45]', () => {
    const baseR = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 400, y: 300 },
      ballPos: { x: 400, y: 300 },
      isCarrierDefender: true,
    });
    const withDelta = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 400, y: 300 },
      ballPos: { x: 400, y: 300 },
      isCarrierDefender: true,
      manualDelta: 20,
    });
    expect(withDelta.orientationDeg - baseR.orientationDeg).toBeCloseTo(20, 0);

    const overflowDelta = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 400, y: 300 },
      ballPos: { x: 400, y: 300 },
      isCarrierDefender: true,
      manualDelta: 200,
    });
    expect(overflowDelta.orientationDeg - baseR.orientationDeg).toBeCloseTo(45, 0);
  });
});

describe('computeAttackerOrientation', () => {
  it('porteur → facing = panier', () => {
    const r = computeAttackerOrientation({
      attackerPos: { x: 300, y: 470 },
      role: 'carrier',
      ballPos: { x: 300, y: 470 },
      hoop: HOOP,
    });
    expect(r.facing).toEqual(HOOP);
  });

  it('passeur → facing = receveur', () => {
    const r = computeAttackerOrientation({
      attackerPos: { x: 300, y: 470 },
      role: 'passer',
      ballPos: { x: 300, y: 470 },
      hoop: HOOP,
      receiverPos: { x: 500, y: 200 },
    });
    expect(r.facing).toEqual({ x: 500, y: 200 });
  });

  it('coupeur (cut) → facing = direction de la coupe (nextPos)', () => {
    const r = computeAttackerOrientation({
      attackerPos: { x: 200, y: 400 },
      role: 'cutter',
      ballPos: { x: 500, y: 470 },
      hoop: HOOP,
      nextPos: { x: 350, y: 200 },
    });
    expect(r.facing).toEqual({ x: 350, y: 200 });
  });

  it('poseur d\'écran → facing = défenseur ciblé, orientation perpendiculaire à ce vecteur', () => {
    // Défenseur cible à droite du screener → screener doit être de profil
    // (corps à 90° par rapport à la ligne screener→défenseur).
    const r = computeAttackerOrientation({
      attackerPos: { x: 300, y: 400 },
      role: 'screener',
      ballPos: { x: 100, y: 400 },
      hoop: HOOP,
      screenTargetDefPos: { x: 400, y: 400 },
    });
    expect(r.facing).toEqual({ x: 400, y: 400 });
    // facing à droite = angle horaire +90° depuis le nord ; perpendiculaire +90°
    // → orientation 180° (corps tourné dos au nord) ou 0° selon convention.
    // L'invariant simple : la différence avec un facing "frontal" est ±90°.
    const frontalR = computeAttackerOrientation({
      attackerPos: { x: 300, y: 400 },
      role: 'carrier',
      ballPos: { x: 300, y: 400 },
      hoop: { x: 400, y: 400 }, // panier dans la même direction que la cible défensive
    });
    // |orientation_screener - orientation_carrier| ≡ 90° (mod 360)
    const diff = Math.abs(((r.orientationDeg - frontalR.orientationDeg) % 360 + 540) % 360 - 180);
    // diff ≈ 90° (à 90 près de 180 à cause du modulo)
    expect(Math.abs(diff - 90)).toBeLessThan(1);
  });

  it('défaut (pas de role spécifique) → facing = ballon', () => {
    const r = computeAttackerOrientation({
      attackerPos: { x: 100, y: 100 },
      role: 'idle',
      ballPos: { x: 500, y: 470 },
      hoop: HOOP,
    });
    expect(r.facing).toEqual({ x: 500, y: 470 });
  });
});
