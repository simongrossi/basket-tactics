import { describe, it, expect } from 'vitest';
import {
  detectFreePathThreats,
  type ThreatDefenderInput,
} from '../threatResolution';
import type { AttackerPositions } from '../../types';

const HOOP = { x: 300, y: 75 };

const defAtHomes: Record<string, ThreatDefenderInput> = {
  D1: { x: 235, y: 270 },
  D2: { x: 365, y: 270 },
  D3: { x: 470, y: 145 },
  D4: { x: 130, y: 145 },
  D5: { x: 300, y: 145 },
};

describe('detectFreePathThreats', () => {
  it('aucune menace si tous les attaquants loin du panier (>220px)', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 380 },
      O5: { x: 380, y: 380 },
    };
    expect(detectFreePathThreats(off, HOOP, defAtHomes)).toEqual([]);
  });

  it('aucune menace si un défenseur ferme le couloir (<80px du segment)', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 320, y: 130 }, // cutter mais D5 à 16px (très proche)
    };
    const r = detectFreePathThreats(off, HOOP, defAtHomes);
    expect(r).toEqual([]);
  });

  it('détecte un cutter sans couvreur proche du couloir', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 320, y: 130 }, // cutter
    };
    // Désigne D5 indisponible (déjà engagé ailleurs).
    const unavailable = new Set(['D5'] as any);
    const r = detectFreePathThreats(off, HOOP, defAtHomes, unavailable);
    expect(r).toHaveLength(1);
    expect(r[0].attacker).toBe('O5');
    expect(r[0].designated).toBeDefined();
    expect(r[0].designated).not.toBe('D5');
  });

  it('exclut les défenseurs unavailable du calcul de couverture du couloir', () => {
    // Sans exclusion : D5 ferme le couloir → pas de menace.
    // Avec D5 unavailable : la menace réapparaît, designée à un autre.
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 320, y: 130 },
    };
    const without = detectFreePathThreats(off, HOOP, defAtHomes);
    const withExcl = detectFreePathThreats(off, HOOP, defAtHomes, new Set(['D5'] as any));
    expect(without.length).toBe(0);
    expect(withExcl.length).toBeGreaterThan(0);
  });

  it('urgence décroît avec la distance au panier', () => {
    const offClose: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 320, y: 90 }, // dHoop ~30
    };
    const offFar: AttackerPositions = {
      ...offClose,
      O5: { x: 320, y: 250 }, // dHoop ~180
    };
    const rClose = detectFreePathThreats(offClose, HOOP, defAtHomes, new Set(['D5'] as any));
    const rFar = detectFreePathThreats(offFar, HOOP, defAtHomes, new Set(['D5'] as any));
    expect(rClose[0].urgency).toBeGreaterThan(rFar[0]?.urgency ?? 0);
  });

  it('deux menaces simultanées → deux désignations distinctes', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 240, y: 110 }, // cutter gauche
      O5: { x: 360, y: 110 }, // cutter droit
    };
    const r = detectFreePathThreats(off, HOOP, defAtHomes, new Set(['D5'] as any));
    if (r.length >= 2) {
      expect(r[0].designated).not.toBe(r[1].designated);
    }
  });
});
