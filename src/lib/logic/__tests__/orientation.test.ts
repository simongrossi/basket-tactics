import { describe, it, expect } from 'vitest';
import {
  computeDefenderOrientation,
  computeAttackerOrientation,
  lerpAngleDeg,
} from '../orientation';

const HOOP = { x: 300, y: 75 };

/** Helper : différence d'angle signée [-180, 180]. */
function angleDiff(a: number, b: number): number {
  return ((a - b) % 360 + 540) % 360 - 180;
}

describe('computeDefenderOrientation — convention B + invariants anatomiques', () => {
  it('on-ball : facing pointe vers le porteur, body face au porteur', () => {
    const r = computeDefenderOrientation({
      defenderPos: { x: 300, y: 410 },
      manPos: { x: 300, y: 470 },
      ballPos: { x: 300, y: 470 },
      isCarrierDefender: true,
    });
    // Body : porteur en bas (sud) → orientation ≈ 180°.
    expect(r.bodyOrientation).toBeCloseTo(180, 0);
    // Gaze pointe vers le porteur (sud aussi).
    expect(Math.abs(angleDiff(r.gazeOrientation, 180))).toBeLessThan(1);
  });

  it('off-ball sag : armBallSide pointe vers ballon, armManSide vers homme', () => {
    const r = computeDefenderOrientation({
      defenderPos: { x: 200, y: 300 },
      manPos: { x: 100, y: 380 }, // homme en bas-gauche
      ballPos: { x: 400, y: 380 }, // ballon en bas-droite
      stance: 'sag',
    });
    // Bras "ball-side" doit être proche du ballon (clamp possible si derrière).
    const dBall = Math.hypot(r.armBallSide.x - 400, r.armBallSide.y - 380);
    const dMan = Math.hypot(r.armManSide.x - 100, r.armManSide.y - 380);
    expect(dBall).toBeLessThan(50); // proche du ballon
    expect(dMan).toBeLessThan(50);  // proche de l'homme
  });

  it('fronting : facing pointe vers le ballon (denial)', () => {
    const r = computeDefenderOrientation({
      defenderPos: { x: 200, y: 300 },
      manPos: { x: 200, y: 400 },
      ballPos: { x: 500, y: 200 },
      stance: 'fronting',
    });
    // Gaze vers le ballon (le clamp anatomique peut adapter selon body).
    // On vérifie que le gaze pointe DANS LA DIRECTION du ballon (côté).
    const ballAngleFromDef = ((Math.atan2(500 - 200, -(200 - 300)) * 180) / Math.PI);
    expect(Math.abs(angleDiff(r.gazeOrientation, ballAngleFromDef))).toBeLessThanOrEqual(91);
  });

  it("INVARIANT #1 — gaze ne dépasse jamais ±90° du body", () => {
    // Test stress : on construit un cas où l'auto voudrait pointer derrière.
    // En sag, body pointe vers midpoint, gaze vers ballon. Si on isole un
    // scénario où ces deux divergent fortement, le clamp doit s'appliquer.
    const r = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 100, y: 100 },   // homme nord-ouest
      ballPos: { x: 500, y: 500 },  // ballon sud-est
      stance: 'sag',
    });
    const diff = Math.abs(angleDiff(r.gazeOrientation, r.bodyOrientation));
    expect(diff).toBeLessThanOrEqual(90 + 0.01); // tolérance epsilon
  });

  it("INVARIANT #2 — armBallSide ne tombe jamais derrière le corps", () => {
    // Cas où l'homme est tellement loin derrière que le bras devrait être
    // clampé au demi-cercle frontal.
    const r = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 300, y: 400 }, // homme au sud (proche du défenseur)
      ballPos: { x: 300, y: 200 }, // ballon au nord (de l'autre côté)
      stance: 'fronting',          // body face à l'homme = sud
    });
    // Body = sud (180°). armBallSide doit être dans ±90° de 180° = entre 90° et 270°.
    const dx = r.armBallSide.x - 300;
    const dy = r.armBallSide.y - 300;
    const armAngle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const diff = Math.abs(angleDiff(armAngle, r.bodyOrientation));
    expect(diff).toBeLessThanOrEqual(90 + 0.01);
  });

  it('manualBody override absolu (corps figé)', () => {
    const r = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 100, y: 100 },
      ballPos: { x: 500, y: 500 },
      stance: 'sag',
      manualBody: 45, // override absolu
    });
    expect(r.bodyOrientation).toBeCloseTo(45, 0);
  });

  it("gazeLock respecte le clamp ±60° du body même si la cible est derrière", () => {
    const r = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 300, y: 100 },   // homme au nord
      ballPos: { x: 300, y: 500 },  // ballon au sud (= derrière le corps)
      stance: 'sag',
      manualBody: 0,                // body forcé au nord
      gazeLock: 'ball-carrier',     // user veut regard au sud — impossible anatomiquement
    });
    // Le gaze doit être clampé à 60° max du body (= entre -60° et +60°).
    const diff = Math.abs(angleDiff(r.gazeOrientation, 0));
    expect(diff).toBeLessThanOrEqual(60 + 0.01);
  });

  it("gazeLock='opponent' fait pointer le regard vers manPos quand la cible est dans le cône", () => {
    const r = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 400, y: 200 },   // homme au nord-est (~45°)
      ballPos: { x: 100, y: 500 },  // ballon ailleurs
      isCarrierDefender: false,
      stance: 'sag',
      manualBody: 45,               // corps déjà orienté NE
      gazeLock: 'opponent',
    });
    // Sans clamp, le gaze auto pointerait vers ballPos (sag par défaut).
    // Avec gazeLock='opponent', on force vers manPos (45°). Body=45°, donc clamp ne joue pas.
    expect(Math.abs(angleDiff(r.gazeOrientation, 45))).toBeLessThan(1);
  });

  it("gazeLock='both' pointe le regard vers le midpoint man-ballon", () => {
    const r = computeDefenderOrientation({
      defenderPos: { x: 300, y: 300 },
      manPos: { x: 400, y: 200 },
      ballPos: { x: 200, y: 200 },
      stance: 'sag',
      manualBody: 0,                // body au nord
      gazeLock: 'both',
    });
    // Midpoint = (300, 200), pile au nord du défenseur. Gaze doit être ~0°.
    expect(Math.abs(angleDiff(r.gazeOrientation, 0))).toBeLessThan(1);
  });
});

describe('computeAttackerOrientation', () => {
  it('porteur statique → corps + regard vers le panier', () => {
    const r = computeAttackerOrientation({
      attackerPos: { x: 300, y: 470 },
      role: 'carrier',
      ballPos: { x: 300, y: 470 },
      hoop: HOOP,
    });
    // Panier au nord, attaquant en bas → bodyOrientation ≈ 0°.
    expect(r.bodyOrientation).toBeCloseTo(0, 0);
  });

  it('porteur en dribble → corps dans la direction du mouvement', () => {
    // Le porteur s'est déplacé de (200, 470) → (300, 350) entre l'étape
    // précédente et la courante = dribble vers le nord-est, distance > 30.
    const r = computeAttackerOrientation({
      attackerPos: { x: 300, y: 350 },
      role: 'carrier',
      ballPos: { x: 300, y: 350 },
      hoop: HOOP,
      prevPos: { x: 200, y: 470 }, // 156 px de distance → dribble
    });
    // Direction = (300-200, 350-470) = (100, -120) → atan2(100, 120) ≈ 39° (NE)
    const expected = (Math.atan2(100, 120) * 180) / Math.PI;
    expect(r.bodyOrientation).toBeCloseTo(expected, 0);
  });

  it('porteur sans mouvement significatif → reste vers le panier', () => {
    // Déplacement = 10 px (< seuil 30) → pas de dribble.
    const r = computeAttackerOrientation({
      attackerPos: { x: 300, y: 350 },
      role: 'carrier',
      ballPos: { x: 300, y: 350 },
      hoop: HOOP,
      prevPos: { x: 295, y: 350 }, // 5 px → pas dribble
    });
    expect(r.bodyOrientation).toBeCloseTo(0, 0);
  });

  it('passeur → facing = receveur', () => {
    const r = computeAttackerOrientation({
      attackerPos: { x: 300, y: 470 },
      role: 'passer',
      ballPos: { x: 300, y: 470 },
      hoop: HOOP,
      receiverPos: { x: 500, y: 200 },
    });
    const expected = (Math.atan2(200, 270) * 180) / Math.PI;
    expect(r.bodyOrientation).toBeCloseTo(expected, 0);
  });

  it('coupeur → facing = nextPos', () => {
    const r = computeAttackerOrientation({
      attackerPos: { x: 200, y: 400 },
      role: 'cutter',
      ballPos: { x: 500, y: 470 },
      hoop: HOOP,
      nextPos: { x: 350, y: 200 },
    });
    const expected = (Math.atan2(150, 200) * 180) / Math.PI;
    expect(r.bodyOrientation).toBeCloseTo(expected, 0);
  });

  it('défaut idle → facing = ballon', () => {
    const r = computeAttackerOrientation({
      attackerPos: { x: 100, y: 100 },
      role: 'idle',
      ballPos: { x: 500, y: 470 },
      hoop: HOOP,
    });
    const expected = (Math.atan2(400, -370) * 180) / Math.PI;
    expect(r.bodyOrientation).toBeCloseTo(expected, 0);
  });
});

describe('lerpAngleDeg', () => {
  it('interpole entre 350° et 10° par le plus court chemin (passe par 0°)', () => {
    const result = lerpAngleDeg(350, 10, 0.5);
    // Plus court chemin = 350 → 360 → 10, soit +20° ; à 0.5 = +10° = 360 = 0°
    expect(Math.abs(angleDiff(result, 0))).toBeLessThan(0.5);
  });
});
