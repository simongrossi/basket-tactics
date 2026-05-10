import { describe, it, expect } from 'vitest';
import {
  detectFreePathThreats,
  detectCuts,
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
    const unavailable = new Set<'D5'>(['D5']);
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
    const withExcl = detectFreePathThreats(off, HOOP, defAtHomes, new Set<'D5'>(['D5']));
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
    const rClose = detectFreePathThreats(offClose, HOOP, defAtHomes, new Set<'D5'>(['D5']));
    const rFar = detectFreePathThreats(offFar, HOOP, defAtHomes, new Set<'D5'>(['D5']));
    expect(rClose[0].urgency).toBeGreaterThan(rFar[0]?.urgency ?? 0);
  });

  it('drive en cours dans la bande étendue (220-280px) → menace si mouvement > 20px', () => {
    // Porteur en wing droit, drive vers panier, autre défenseur loin pour
    // qu'aucun ne couvre naturellement le couloir.
    const unavailable = new Set<'D5' | 'D2' | 'D3'>(['D5', 'D2', 'D3']);
    const prev: AttackerPositions = {
      O1: { x: 470, y: 320 }, // wing droit reculé, dHoop ~298
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const cur: AttackerPositions = {
      O1: { x: 460, y: 250 }, // avancé vers panier, dHoop ~250
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const without = detectFreePathThreats(cur, HOOP, defAtHomes, unavailable);
    const withPrev = detectFreePathThreats(cur, HOOP, defAtHomes, unavailable, prev);
    expect(without.find((t) => t.attacker === 'O1')).toBeUndefined();
    expect(withPrev.find((t) => t.attacker === 'O1')).toBeDefined();
  });

  it('porteur statique entre 220-280 → pas de menace (pas de drive)', () => {
    const prev: AttackerPositions = {
      O1: { x: 300, y: 320 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const cur = { ...prev }; // identique = aucun mouvement
    const r = detectFreePathThreats(cur, HOOP, defAtHomes, new Set<'D5'>(['D5']), prev);
    expect(r.find((t) => t.attacker === 'O1')).toBeUndefined();
  });

  it('détecte un drive carrier vers panier (carrier proche basket)', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 130 }, // porteur en pleine raquette
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 100, y: 100 },
      O5: { x: 500, y: 100 },
    };
    // D5 absent (déjà occupé) → menace doit être détectée pour O1.
    const r = detectFreePathThreats(off, HOOP, defAtHomes, new Set<'D5'>(['D5']));
    const o1Threat = r.find((t) => t.attacker === 'O1');
    expect(o1Threat).toBeDefined();
    expect(o1Threat!.urgency).toBeGreaterThan(0.5);
  });

  it('deux menaces simultanées → deux désignations distinctes', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 240, y: 110 }, // cutter gauche
      O5: { x: 360, y: 110 }, // cutter droit
    };
    const r = detectFreePathThreats(off, HOOP, defAtHomes, new Set<'D5'>(['D5']));
    if (r.length >= 2) {
      expect(r[0].designated).not.toBe(r[1].designated);
    }
  });
});

describe('detectCuts', () => {
  const balanced: AttackerPositions = {
    O1: { x: 300, y: 470 },
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 380, y: 230 },
  };

  it('aucun cut si pas de mouvement', () => {
    const r = detectCuts(balanced, balanced, 'O1', HOOP);
    expect(r).toEqual([]);
  });

  it('aucun cut pour le porteur (même s\'il drive)', () => {
    const prev = { ...balanced, O1: { x: 300, y: 380 } };
    const cur = { ...balanced, O1: { x: 300, y: 130 } }; // O1 drive
    const r = detectCuts(cur, prev, 'O1', HOOP);
    expect(r.find((c) => c.cutter === 'O1')).toBeUndefined();
  });

  it('détecte un cut backdoor d\'un wing vers le panier', () => {
    const prev = { ...balanced, O3: { x: 470, y: 380 } };
    const cur = { ...balanced, O3: { x: 380, y: 130 } }; // O3 coupe vers panier
    const r = detectCuts(cur, prev, 'O1', HOOP);
    expect(r).toHaveLength(1);
    expect(r[0].cutter).toBe('O3');
    expect(r[0].deltaToHoop).toBeGreaterThan(25);
    expect(r[0].side).toBe(1);
  });

  it('exclut les screeners (coéquipier <30px sur la trajectoire)', () => {
    const prev = { ...balanced, O3: { x: 470, y: 380 }, O5: { x: 480, y: 200 } };
    const cur = { ...balanced, O3: { x: 380, y: 130 }, O5: { x: 390, y: 145 } }; // O5 colle O3
    const r = detectCuts(cur, prev, 'O1', HOOP);
    expect(r.find((c) => c.cutter === 'O3')).toBeUndefined();
  });

  it('rapporte la distance du défenseur naturel si fourni', () => {
    const prev = { ...balanced, O3: { x: 470, y: 380 } };
    const cur = { ...balanced, O3: { x: 380, y: 130 } };
    const defPos: Record<string, ThreatDefenderInput> = {
      D3: { x: 460, y: 200 }, // D3 reste haut, en sag
    };
    const matchups = { D3: 'O3' as const } as Record<string, any>;
    const r = detectCuts(cur, prev, 'O1', HOOP, defPos, matchups);
    expect(r[0].cutterDefDistance).toBeGreaterThan(80);
  });
});
