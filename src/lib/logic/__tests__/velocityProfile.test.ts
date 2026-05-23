import { describe, it, expect } from 'vitest';
import { buildVelocityProfile } from '../velocityProfile';

describe('buildVelocityProfile', () => {
  it('path à 2 points → remap identité', () => {
    const p = buildVelocityProfile([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(p.remap(0)).toBeCloseTo(0, 6);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 3);
    expect(p.remap(1)).toBeCloseTo(1, 6);
  });

  it('path droit à 3 points (collinéaires) → remap identité', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0.25)).toBeCloseTo(0.25, 3);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 3);
    expect(p.remap(0.75)).toBeCloseTo(0.75, 3);
  });

  it("path en V symétrique → à actionT=0.25, s/L > 0.25 (avance en zone rapide)", () => {
    // Apex à (50, 80) entre (0,0) et (100,0) — V symétrique.
    // En zone rapide (avant l'apex), le joueur couvre plus d'arc par
    // unité de temps qu'en moyenne.
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0.25)).toBeGreaterThan(0.25 + 0.02);
  });

  it('path en V symétrique → remap(0.5) ≈ 0.5 par symétrie', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 2);
  });

  it('endpoints invariants : remap(0) === 0, remap(1) === 1', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0)).toBe(0);
    expect(p.remap(1)).toBeCloseTo(1, 6);
  });

  it('monotonie : 10 valeurs croissantes → s/L strictement croissant', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const s = p.remap(i / 10);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it('tier elite vs lent : elite dévie moins de l\'identité que lent', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ];
    const elite = buildVelocityProfile(path, { tier: 'elite' });
    const lent = buildVelocityProfile(path, { tier: 'lent' });
    // À actionT=0.25, la déviation par rapport à 0.25 est plus grande
    // pour lent (qui ralentit plus en virage).
    const deltaElite = Math.abs(elite.remap(0.25) - 0.25);
    const deltaLent = Math.abs(lent.remap(0.25) - 0.25);
    expect(deltaLent).toBeGreaterThan(deltaElite);
  });

  it('path dégénéré (from === to) → remap identité, length 0', () => {
    const p = buildVelocityProfile([
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ]);
    expect(p.length).toBe(0);
    expect(p.remap(0)).toBeCloseTo(0, 6);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 6);
    expect(p.remap(1)).toBeCloseTo(1, 6);
  });

  it('path à 1 point ou vide → remap identité', () => {
    const p1 = buildVelocityProfile([{ x: 5, y: 5 }]);
    expect(p1.length).toBe(0);
    expect(p1.remap(0.7)).toBeCloseTo(0.7, 6);
    const p0 = buildVelocityProfile([]);
    expect(p0.length).toBe(0);
    expect(p0.remap(0.3)).toBeCloseTo(0.3, 6);
  });

  it('Phy.O V2 — obstacle proche dans le premier quart → remap(0.5) < 0.5 (ralentissement)', () => {
    // Path droit horizontal, obstacle proche du premier quart (asymétrique).
    // Le joueur ralentit AVANT d'atteindre le milieu → à mi-temps il n'a
    // pas encore franchi 0.5 du path.
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { obstacles: [{ x: 25, y: 5 }] },
    );
    expect(p.remap(0.5)).toBeLessThan(0.5 - 0.02);
  });

  it('Phy.O V2 — obstacle hors threshold → remap identité (pas d\'effet)', () => {
    // Obstacle à 100 px du path → bien au-delà des 30 px threshold.
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { obstacles: [{ x: 50, y: 100 }] },
    );
    expect(p.remap(0.25)).toBeCloseTo(0.25, 2);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 2);
    expect(p.remap(0.75)).toBeCloseTo(0.75, 2);
  });

  it('Phy.O V2 — deux obstacles asymétriques → deux zones de ralentissement', () => {
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { obstacles: [{ x: 20, y: 5 }, { x: 60, y: 5 }] },
    );
    // À chaque obstacle, le joueur ralentit → s/L < temps relatif.
    expect(p.remap(0.25)).toBeLessThan(0.25 - 0.01);
    expect(p.remap(0.75)).toBeLessThan(0.75 - 0.01);
  });

  it('Phy.O V2 — obstacles vides ou absents → comportement V1 inchangé', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const p1 = buildVelocityProfile(path);
    const p2 = buildVelocityProfile(path, { obstacles: [] });
    // Les deux sont identité (path droit).
    expect(p1.remap(0.5)).toBeCloseTo(0.5, 3);
    expect(p2.remap(0.5)).toBeCloseTo(0.5, 3);
  });

  it('Phy.O V4 — feinte au milieu du path → ralentissement local', () => {
    // Une feinte symétrique au milieu d'un path droit ralentit le joueur
    // autour de s=0.5. Avant d'atteindre le centre du creux, le joueur va
    // à v=1 (zone rapide) ; à actionT=0.3 (= 30% du temps), il a donc
    // couvert plus de 30% de l'arc (probe asymétrique pour éviter le
    // point fixe de symétrie remap(0.5)=0.5).
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { feintes: [0.5] },
    );
    expect(p.remap(0.3)).toBeGreaterThan(0.3 + 0.02);
  });

  it('Phy.O V4 — aucune feinte (option absente ou tableau vide) → V1 inchangé', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const p1 = buildVelocityProfile(path);
    const p2 = buildVelocityProfile(path, { feintes: [] });
    expect(p2.remap(0.5)).toBeCloseTo(p1.remap(0.5), 6);
  });

  it('Phy.O V4 — feinte hors range (t=1.5) → pas de crash, effet négligeable', () => {
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { feintes: [1.5] },
    );
    expect(() => p.remap(0.5)).not.toThrow();
    // Le centre de la gaussienne est à t=1.5, sa queue à t=0.5 est très
    // faible (5 sigmas avec width=0.08 → exp(-12.5) ≈ 0).
    expect(p.remap(0.5)).toBeCloseTo(0.5, 2);
  });

  it('Phy.O V4 — deux feintes au même point → max, pas somme', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const pSingle = buildVelocityProfile(path, { feintes: [0.5] });
    const pDouble = buildVelocityProfile(path, { feintes: [0.5, 0.5] });
    // Avec max(), deux feintes au même endroit ≡ une seule feinte.
    expect(pDouble.remap(0.5)).toBeCloseTo(pSingle.remap(0.5), 3);
  });

  it('Phy.O V3 V1 — matched defender proche au quart → ralentissement asymétrique', () => {
    // Matched defender placé asymétriquement (à x=25) → ralentissement
    // concentré dans la 1ère moitié → à mi-temps le joueur n'a pas encore
    // atteint le milieu. Pattern identique aux tests V2 friction.
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { matchedDefenderPos: { x: 25, y: 20 } },
    );
    expect(p.remap(0.5)).toBeLessThan(0.5 - 0.02);
  });

  it('Phy.O V3 V1 — matched defender hors threshold (>50 px) → identité', () => {
    const p = buildVelocityProfile(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      { matchedDefenderPos: { x: 50, y: 100 } },
    );
    expect(p.remap(0.25)).toBeCloseTo(0.25, 2);
    expect(p.remap(0.75)).toBeCloseTo(0.75, 2);
  });

  it('Phy.O V3 V1 — matchedDefenderPos absent → V2 inchangé', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const p1 = buildVelocityProfile(path);
    const p2 = buildVelocityProfile(path, { matchedDefenderPos: undefined });
    expect(p2.remap(0.5)).toBeCloseTo(p1.remap(0.5), 6);
  });
});
