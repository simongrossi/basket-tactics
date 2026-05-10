import { describe, it, expect } from 'vitest';
import {
  attackerSide,
  detectOverload,
  isShortCorner,
  isHighPost,
  findCriticalZoneAttackers,
  detectSkipPass,
} from '../zoneSituations';
import type { AttackerPositions } from '../../types';

const HOOP = { x: 300, y: 75 };

describe('attackerSide', () => {
  it('renvoie -1 pour la moitié gauche, 0 pour le centre, +1 pour la droite', () => {
    expect(attackerSide({ x: 100, y: 200 }, HOOP)).toBe(-1);
    expect(attackerSide({ x: 320, y: 200 }, HOOP)).toBe(0); // ±30 = central
    expect(attackerSide({ x: 500, y: 200 }, HOOP)).toBe(1);
  });
});

describe('detectOverload', () => {
  it("retourne {count:0, intensity:0} si le porteur est central", () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 }, // ballon central
      O2: { x: 100, y: 380 },
      O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 },
      O5: { x: 400, y: 200 },
    };
    const r = detectOverload(off, 'O1', HOOP);
    expect(r.count).toBe(0);
    expect(r.intensity).toBe(0);
  });

  it("intensité 0.6 sur 3 attaquants côté ballon", () => {
    const off: AttackerPositions = {
      O1: { x: 470, y: 380 }, // ballon droit
      O2: { x: 480, y: 200 }, // droit
      O3: { x: 450, y: 100 }, // droit (3 côté ballon)
      O4: { x: 100, y: 380 }, // gauche
      O5: { x: 100, y: 200 }, // gauche
    };
    const r = detectOverload(off, 'O1', HOOP);
    expect(r.side).toBe(1);
    expect(r.count).toBe(3);
    expect(r.intensity).toBeCloseTo(0.6, 2);
  });

  it("intensité 1.0 sur 4 attaquants côté ballon (overload sévère)", () => {
    const off: AttackerPositions = {
      O1: { x: 470, y: 380 }, // ballon droit
      O2: { x: 480, y: 200 }, // droit
      O3: { x: 450, y: 100 }, // droit
      O4: { x: 460, y: 300 }, // droit (4 côté ballon)
      O5: { x: 100, y: 380 }, // gauche
    };
    const r = detectOverload(off, 'O1', HOOP);
    expect(r.count).toBe(4);
    expect(r.intensity).toBe(1.0);
  });
});

describe('isShortCorner / isHighPost', () => {
  it('short corner détecté en bande baseline (lateral > 130 ET vertical < 100)', () => {
    // Cas type : 5m latéralement, juste au-dessus de la baseline
    expect(isShortCorner({ x: HOOP.x + 150, y: HOOP.y + 50 }, HOOP)).toBe(true);
    expect(isShortCorner({ x: HOOP.x - 180, y: HOOP.y + 30 }, HOOP)).toBe(true);
  });

  it('exclut un point dans la raquette (lateral < 130)', () => {
    expect(isShortCorner({ x: HOOP.x + 100, y: HOOP.y + 50 }, HOOP)).toBe(false);
  });

  it("exclut un point trop haut (vertical > 100, c'est plutôt un wing/3pt)", () => {
    expect(isShortCorner({ x: HOOP.x + 200, y: HOOP.y + 200 }, HOOP)).toBe(false);
  });

  it('exclut un point au-delà du corner 3pt (dHoop > 250)', () => {
    expect(isShortCorner({ x: HOOP.x + 280, y: HOOP.y + 30 }, HOOP)).toBe(false);
  });

  it('high post / tête de raquette : centré (lateral <60) ET 80-200px du panier', () => {
    // FT line stricto sensu (top of key)
    expect(isHighPost({ x: HOOP.x, y: HOOP.y + 150 }, HOOP)).toBe(true);
    expect(isHighPost({ x: HOOP.x + 50, y: HOOP.y + 180 }, HOOP)).toBe(true);
    // Top-of-paint (au-dessus du basket, sous la FT line)
    expect(isHighPost({ x: HOOP.x, y: HOOP.y + 90 }, HOOP)).toBe(true);
    expect(isHighPost({ x: HOOP.x, y: HOOP.y + 120 }, HOOP)).toBe(true);
    // Hors zone
    expect(isHighPost({ x: HOOP.x + 70, y: HOOP.y + 150 }, HOOP)).toBe(false); // trop latéral
    expect(isHighPost({ x: HOOP.x, y: HOOP.y + 250 }, HOOP)).toBe(false); // trop loin
    expect(isHighPost({ x: HOOP.x, y: HOOP.y + 60 }, HOOP)).toBe(false); // trop près du panier
  });
});

describe('findCriticalZoneAttackers', () => {
  it('liste les attaquants en high-post', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: HOOP.x, y: HOOP.y + 160 }, // high post
      O5: { x: 380, y: 230 },
    };
    const r = findCriticalZoneAttackers(off, HOOP);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({
      attackerId: 'O4',
      zone: 'high-post',
      pos: off.O4,
    });
  });
});

describe('detectSkipPass', () => {
  const off1: AttackerPositions = {
    O1: { x: 470, y: 380 },
    O2: { x: 130, y: 380 },
    O3: { x: 500, y: 200 },
    O4: { x: 200, y: 200 },
    O5: { x: 380, y: 230 },
  };
  const off2: AttackerPositions = { ...off1 };

  it("détecte un skip pass d'un côté à l'autre (changement de porteur + de côté)", () => {
    const r = detectSkipPass(off1, off2, 'O1', 'O2', HOOP);
    expect(r).not.toBeNull();
    expect(r!.fromSide).toBe(1);
    expect(r!.toSide).toBe(-1);
  });

  it("renvoie null si le porteur ne change pas", () => {
    expect(detectSkipPass(off1, off2, 'O1', 'O1', HOOP)).toBeNull();
  });

  it("renvoie null si la passe reste du même côté", () => {
    // O1 (droit) → O3 (droit aussi)
    expect(detectSkipPass(off1, off2, 'O1', 'O3', HOOP)).toBeNull();
  });

  it("renvoie null sans état précédent (1ère étape)", () => {
    expect(detectSkipPass(null, off2, null, 'O1', HOOP)).toBeNull();
  });
});
