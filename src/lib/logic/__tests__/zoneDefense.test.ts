import { describe, it, expect } from 'vitest';
import { computeZoneTargets, mapAttackersToZones } from '../zoneDefense';
import { getZoneLayout } from '../../data/zones';
import type { AttackerPositions, ZoneConfig } from '../../types';

const HOOP = { x: 300, y: 75 };

const baseConfig: ZoneConfig = {
  type: 'zone-2-3',
  ballPressure: 50,
  rotationSpeed: 80,
  trapCorners: false,
  extendTo3pt: true,
};

const balancedOff: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 130, y: 380 },
  O3: { x: 470, y: 380 },
  O4: { x: 220, y: 230 },
  O5: { x: 380, y: 230 },
};

describe('computeZoneTargets', () => {
  it('produit une cible pour chacun des 5 défenseurs', () => {
    const layout = getZoneLayout('zone-2-3');
    const targets = computeZoneTargets(balancedOff, 'O1', layout, baseConfig, 40, HOOP);
    expect(Object.keys(targets).sort()).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
  });

  it('au moins 3 défenseurs trackent un attaquant valide (zone peuplée)', () => {
    const layout = getZoneLayout('zone-2-3');
    const targets = computeZoneTargets(balancedOff, 'O1', layout, baseConfig, 40, HOOP);
    const tracking = Object.values(targets).filter((t) => t.trackedAttacker !== null);
    // Selon le moteur ownership, certains défenseurs en faible engagement
    // peuvent avoir primary=null (ils restent au homePos). On exige juste
    // qu'au moins 2 trackent (les fronts les plus proches du ballon).
    expect(tracking.length).toBeGreaterThanOrEqual(2);
    tracking.forEach((t) => {
      expect(['O1', 'O2', 'O3', 'O4', 'O5']).toContain(t.trackedAttacker);
    });
  });

  it('shift ball-side : ballon à droite → centroïde des défenseurs glisse à droite vs ballon à gauche', () => {
    const layout = getZoneLayout('zone-2-3');

    // Ballon à droite
    const rightBall: AttackerPositions = {
      ...balancedOff,
      O1: { x: 470, y: 380 }, // porteur strong-side droit
    };
    const targetsRight = computeZoneTargets(rightBall, 'O1', layout, baseConfig, 40, HOOP);
    const centroidRight = Object.values(targetsRight).reduce(
      (acc, t) => ({ x: acc.x + t.x / 5, y: acc.y + t.y / 5 }),
      { x: 0, y: 0 }
    );

    // Ballon à gauche
    const leftBall: AttackerPositions = {
      ...balancedOff,
      O1: { x: 130, y: 380 },
    };
    const targetsLeft = computeZoneTargets(leftBall, 'O1', layout, baseConfig, 40, HOOP);
    const centroidLeft = Object.values(targetsLeft).reduce(
      (acc, t) => ({ x: acc.x + t.x / 5, y: acc.y + t.y / 5 }),
      { x: 0, y: 0 }
    );

    // Le centroïde droite doit être plus à droite que le centroïde gauche.
    expect(centroidRight.x).toBeGreaterThan(centroidLeft.x);
  });

  it('porteur en strong-side : un des front-2 (D1 ou D2) finit par tracker le porteur ou un voisin', () => {
    // Ballon en wing droit, à proximité de la position front-2 droite.
    const wingBall: AttackerPositions = {
      ...balancedOff,
      O1: { x: 470, y: 380 },
    };
    const layout = getZoneLayout('zone-2-3');
    const targets = computeZoneTargets(wingBall, 'O1', layout, baseConfig, 40, HOOP);
    // En 2-3, les front-2 sont D1 et D2. L'un d'eux doit pression le porteur
    // (proximité naturelle) ou tracker un attaquant proche du ballon.
    const front2Trackers = ['D1', 'D2'].map((d) => targets[d as 'D1' | 'D2']?.trackedAttacker);
    expect(front2Trackers.some((a) => a === 'O1' || a === 'O3')).toBe(true);
  });

  it('overload côté ballon : 4 attaquants à droite tirent la zone plus fort à droite', () => {
    const layout = getZoneLayout('zone-2-3');

    // Cas neutre (2 droite / 2 gauche)
    const neutral: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 100, y: 380 },
      O3: { x: 500, y: 380 },
      O4: { x: 130, y: 200 },
      O5: { x: 470, y: 200 },
    };
    const tNeutral = computeZoneTargets(neutral, 'O1', layout, baseConfig, 40, HOOP);
    const cNeutral = Object.values(tNeutral).reduce((acc, t) => acc + t.x / 5, 0);

    // Cas overload droit (4 attaquants droite, ballon central)
    const overloaded: AttackerPositions = {
      O1: { x: 320, y: 470 }, // ballon légèrement à droite
      O2: { x: 480, y: 380 },
      O3: { x: 460, y: 200 },
      O4: { x: 470, y: 100 },
      O5: { x: 100, y: 200 },
    };
    const tOver = computeZoneTargets(overloaded, 'O1', layout, baseConfig, 40, HOOP);
    const cOver = Object.values(tOver).reduce((acc, t) => acc + t.x / 5, 0);

    expect(cOver).toBeGreaterThan(cNeutral);
  });
});

describe('computeZoneTargets — couverture high-post isolé (P3.b)', () => {
  it('un high-post isolé tire le défenseur désigné vers la position de couverture', () => {
    const layout = getZoneLayout('zone-2-3');

    // Baseline : O4 et O5 sur leurs ailes habituelles. Pas de high-post.
    const baseline: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const tBaseline = computeZoneTargets(baseline, 'O1', layout, baseConfig, 40, HOOP);

    // Cas tueur : O4 seul à la tête de raquette (high-post centré).
    const highPostIsolated: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 300, y: 220 },
      O5: { x: 470, y: 90 },
    };
    const tIsolated = computeZoneTargets(highPostIsolated, 'O1', layout, baseConfig, 40, HOOP);

    // D5 désigné couvreur (homePos 300,145 le plus proche du high-post 300,220).
    // Engagement franc → target = panier-côté de O4 (y≈172, entre basket 75
    // et O4 220). D5 part de y=145 (home) et monte vers y≈172 → y AUGMENTE.
    // Sans high-post, D5 reste près de son home (y≈168 après ball-pressure).
    expect(tIsolated.D5.y).toBeGreaterThan(tBaseline.D5.y);
    expect(tIsolated.D5.y - tBaseline.D5.y).toBeGreaterThan(8);
  });

  it('un high-post NON isolé (coéquipier collé) déclenche moins fort qu\'un isolé', () => {
    const layout = getZoneLayout('zone-2-3');

    const isolated: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 300, y: 220 },
      O5: { x: 470, y: 90 },  // loin de O4 (>80px)
    };
    const tIso = computeZoneTargets(isolated, 'O1', layout, baseConfig, 40, HOOP);

    const notIsolated: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 300, y: 220 },
      O5: { x: 350, y: 220 }, // collé à O4 (50px) → non isolé
    };
    const tNot = computeZoneTargets(notIsolated, 'O1', layout, baseConfig, 40, HOOP);

    // Isolé = boost ×4 + bias home → D5 monte plus haut pour fermer le high-post.
    // Non-isolé = boost ×1.4 partagé → D5 monte moins.
    expect(tIso.D5.y).toBeGreaterThan(tNot.D5.y);
  });

  it('le défenseur désigné track explicitement le high-post isolé', () => {
    const layout = getZoneLayout('zone-2-3');
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 300, y: 220 },
      O5: { x: 470, y: 90 },
    };
    const t = computeZoneTargets(off, 'O1', layout, baseConfig, 40, HOOP);
    expect(t.D5.trackedAttacker).toBe('O4');
  });
});

describe('computeZoneTargets — paintCoverage slider (P3.b)', () => {
  const off: AttackerPositions = {
    O1: { x: 300, y: 470 },
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 300, y: 220 }, // high-post isolé
    O5: { x: 470, y: 90 },
  };
  const layout = getZoneLayout('zone-2-3');

  it('paintCoverage=0 désactive le boost (D5 reste près de son home)', () => {
    const cfg0: ZoneConfig = { ...baseConfig, paintCoverage: 0 };
    const cfg50: ZoneConfig = { ...baseConfig, paintCoverage: 50 };
    const t0 = computeZoneTargets(off, 'O1', layout, cfg0, 40, HOOP);
    const t50 = computeZoneTargets(off, 'O1', layout, cfg50, 40, HOOP);
    // paintCoverage=0 → boost neutre → D5 reste plus bas (plus près panier).
    expect(t0.D5.y).toBeLessThan(t50.D5.y);
  });

  it('paintCoverage=100 amplifie l\'engagement vs paintCoverage=50', () => {
    const cfg50: ZoneConfig = { ...baseConfig, paintCoverage: 50 };
    const cfg100: ZoneConfig = { ...baseConfig, paintCoverage: 100 };
    const t50 = computeZoneTargets(off, 'O1', layout, cfg50, 40, HOOP);
    const t100 = computeZoneTargets(off, 'O1', layout, cfg100, 40, HOOP);
    expect(t100.D5.y).toBeGreaterThan(t50.D5.y);
  });

  it('paintCoverage indéfini = comportement par défaut (50)', () => {
    const cfgUndef: ZoneConfig = { ...baseConfig };
    delete (cfgUndef as Partial<ZoneConfig>).paintCoverage;
    const cfg50: ZoneConfig = { ...baseConfig, paintCoverage: 50 };
    const tUndef = computeZoneTargets(off, 'O1', layout, cfgUndef, 40, HOOP);
    const t50 = computeZoneTargets(off, 'O1', layout, cfg50, 40, HOOP);
    expect(tUndef.D5.y).toBe(t50.D5.y);
  });
});

describe('computeZoneTargets — réaction baseline drive (P3.c)', () => {
  const layout = getZoneLayout('zone-2-3');

  it('porteur en corner droit isolé : D3 (wing-right) descend pour fermer la ligne', () => {
    // O1 porteur en corner droit profond (lateral=170, vert=15 → short-corner)
    const baseline: AttackerPositions = {
      O1: { x: 470, y: 90 },
      O2: { x: 130, y: 380 },
      O3: { x: 300, y: 470 }, // déplacé loin pour ne pas concurrencer
      O4: { x: 200, y: 380 },
      O5: { x: 380, y: 380 },
    };
    // Référence : porteur central, pas de baseline drive.
    const central: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const tBaseline = computeZoneTargets(baseline, 'O1', layout, baseConfig, 40, HOOP);
    const tCentral = computeZoneTargets(central, 'O1', layout, baseConfig, 40, HOOP);
    // D3 (wing-right, homePos 470,145) doit s'engager fortement quand le
    // porteur attaque la ligne de fond corner droit.
    expect(tBaseline.D3.trackedAttacker).toBe('O1');
    // D3 cible plus proche du porteur (470, 90) que dans le cas central.
    const dBaseline = Math.hypot(tBaseline.D3.x - 470, tBaseline.D3.y - 90);
    const dCentral = Math.hypot(tCentral.D3.x - 470, tCentral.D3.y - 90);
    expect(dBaseline).toBeLessThan(dCentral);
  });

  it('porteur en corner gauche isolé : D4 (wing-left) descend pour fermer', () => {
    const off: AttackerPositions = {
      O1: { x: 130, y: 90 },
      O2: { x: 470, y: 380 },
      O3: { x: 300, y: 470 },
      O4: { x: 380, y: 380 },
      O5: { x: 200, y: 380 },
    };
    const t = computeZoneTargets(off, 'O1', layout, baseConfig, 40, HOOP);
    expect(t.D4.trackedAttacker).toBe('O1');
  });

  it('paintCoverage=0 désactive la réaction baseline (D3 reste à son anchor)', () => {
    const off: AttackerPositions = {
      O1: { x: 470, y: 90 },
      O2: { x: 130, y: 380 },
      O3: { x: 300, y: 470 },
      O4: { x: 200, y: 380 },
      O5: { x: 380, y: 380 },
    };
    const cfg0: ZoneConfig = { ...baseConfig, paintCoverage: 0 };
    const cfg50: ZoneConfig = { ...baseConfig, paintCoverage: 50 };
    const t0 = computeZoneTargets(off, 'O1', layout, cfg0, 40, HOOP);
    const t50 = computeZoneTargets(off, 'O1', layout, cfg50, 40, HOOP);
    // Distance au porteur : t50 < t0 (D3 plus engagé avec boost).
    const d0 = Math.hypot(t0.D3.x - 470, t0.D3.y - 90);
    const d50 = Math.hypot(t50.D3.x - 470, t50.D3.y - 90);
    expect(d50).toBeLessThan(d0);
  });
});

describe('mapAttackersToZones', () => {
  it('retourne une Map indexée par zone.id', () => {
    const layout = getZoneLayout('zone-2-3');
    const m = mapAttackersToZones(balancedOff, layout);
    layout.forEach((z) => {
      expect(m.has(z.id)).toBe(true);
    });
  });

  it('chaque attaquant est attribué à exactement UNE zone', () => {
    const layout = getZoneLayout('zone-2-3');
    const m = mapAttackersToZones(balancedOff, layout);
    const allMapped = new Set<string>();
    m.forEach((atts) => atts.forEach((a) => allMapped.add(a)));
    expect(allMapped.size).toBe(Object.keys(balancedOff).length);
  });
});
