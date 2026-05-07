import { describe, it, expect } from 'vitest';
import { pickBlockingObstacle, pickBlockingCluster, computeBallFrame } from '../geometry';

describe('pickBlockingObstacle', () => {
  it("retourne null s'il n'y a aucun obstacle qui traverse le segment", () => {
    const obs = [
      { center: { x: 100, y: 100 }, radius: 10 },
      { center: { x: 0, y: 0 }, radius: 10 },
    ];
    // Segment loin des obstacles
    const r = pickBlockingObstacle({ x: 500, y: 500 }, { x: 600, y: 500 }, obs);
    expect(r).toBeNull();
  });

  it("retourne l'unique obstacle bloquant", () => {
    const blocker = { center: { x: 100, y: 50 }, radius: 30 };
    const obs = [{ center: { x: 500, y: 500 }, radius: 10 }, blocker];
    const r = pickBlockingObstacle({ x: 0, y: 50 }, { x: 200, y: 50 }, obs);
    expect(r).toBe(blocker);
  });

  it("staggered screens : préfère l'obstacle le plus profondément bloquant (pénétration max)", () => {
    // Segment horizontal y=100, x ∈ [0, 200]
    // Obstacle A : centré à (50, 105), rayon 15 → pénétration = 15 - 5 = 10
    // Obstacle B : centré à (150, 102), rayon 20 → pénétration = 20 - 2 = 18
    // → B est plus bloquant
    const a = { center: { x: 50, y: 105 }, radius: 15 };
    const b = { center: { x: 150, y: 102 }, radius: 20 };
    const r = pickBlockingObstacle({ x: 0, y: 100 }, { x: 200, y: 100 }, [a, b]);
    expect(r).toBe(b);
  });

  it("ignore les obstacles dont la projection tombe hors du segment", () => {
    // Obstacle qui touche la prolongation infinie du segment, mais hors [start, end]
    const beyondEnd = { center: { x: 300, y: 100 }, radius: 50 };
    const r = pickBlockingObstacle({ x: 0, y: 100 }, { x: 200, y: 100 }, [beyondEnd]);
    expect(r).toBeNull();
  });

  it("retourne null pour un segment de longueur nulle", () => {
    const r = pickBlockingObstacle(
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      [{ center: { x: 100, y: 100 }, radius: 50 }]
    );
    expect(r).toBeNull();
  });
});

describe('pickBlockingCluster', () => {
  it("renvoie l'unique obstacle quand un seul bloque (parité avec pickBlockingObstacle)", () => {
    const obs = { center: { x: 100, y: 105 }, radius: 20 };
    const r = pickBlockingCluster({ x: 0, y: 100 }, { x: 200, y: 100 }, [obs]);
    expect(r).toBe(obs);
  });

  it("fusionne deux obstacles en super-cluster (centroid + rayon couvrant)", () => {
    // Deux écrans en série le long d'un segment horizontal
    const a = { center: { x: 60, y: 105 }, radius: 18 };
    const b = { center: { x: 140, y: 102 }, radius: 18 };
    const r = pickBlockingCluster({ x: 0, y: 100 }, { x: 200, y: 100 }, [a, b]);
    expect(r).not.toBeNull();
    expect(r).not.toBe(a);
    expect(r).not.toBe(b);
    // Centroid à mi-chemin x≈100
    expect(r!.center.x).toBeCloseTo(100, 0);
    // Rayon couvre les deux : doit englober chaque centre + son radius
    const dToA = Math.hypot(r!.center.x - a.center.x, r!.center.y - a.center.y) + a.radius;
    const dToB = Math.hypot(r!.center.x - b.center.x, r!.center.y - b.center.y) + b.radius;
    expect(r!.radius).toBeGreaterThanOrEqual(dToA - 0.01);
    expect(r!.radius).toBeGreaterThanOrEqual(dToB - 0.01);
  });

  it("ignore les obstacles non-bloquants même si la liste en contient", () => {
    const blocker = { center: { x: 100, y: 105 }, radius: 20 };
    const farAway = { center: { x: 100, y: 500 }, radius: 30 };
    const r = pickBlockingCluster({ x: 0, y: 100 }, { x: 200, y: 100 }, [blocker, farAway]);
    expect(r).toBe(blocker);
  });

  it("renvoie null quand aucun obstacle ne bloque", () => {
    const r = pickBlockingCluster(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [{ center: { x: 50, y: 200 }, radius: 10 }]
    );
    expect(r).toBeNull();
  });
});

describe('computeBallFrame', () => {
  it("porteur inchangé : ball suit avec offset constant (16, -16) à t=0", () => {
    const carrier = { x: 300, y: 300 };
    const r = computeBallFrame(carrier, carrier, false, 0);
    expect(r.inFlight).toBe(false);
    expect(r.pos.x).toBeCloseTo(316, 1);
    expect(r.pos.y).toBeCloseTo(284, 1);
  });

  it("porteur inchangé en mouvement : interpolation linéaire entre les deux positions + offset", () => {
    const a = { x: 100, y: 100 };
    const b = { x: 300, y: 200 };
    const r = computeBallFrame(a, b, false, 0.5);
    expect(r.inFlight).toBe(false);
    // Mid-point = (200, 150) + offset = (216, 134)
    expect(r.pos.x).toBeCloseTo(216, 1);
    expect(r.pos.y).toBeCloseTo(134, 1);
  });

  it("passe : t=0 le ballon est à l'origine, t=1 à destination, inFlight=true", () => {
    const a = { x: 100, y: 470 };
    const b = { x: 500, y: 470 };
    const r0 = computeBallFrame(a, b, true, 0);
    const r1 = computeBallFrame(a, b, true, 1);
    expect(r0.inFlight).toBe(true);
    expect(r0.pos.x).toBeCloseTo(116, 1); // a + offsetX
    expect(r0.pos.y).toBeCloseTo(454, 1); // a + offsetY
    expect(r1.pos.x).toBeCloseTo(516, 1);
    expect(r1.pos.y).toBeCloseTo(454, 1);
  });

  it("passe : à mi-trajet (t=0.5) le ballon est plus haut (y plus petit) qu'aux extrémités", () => {
    const a = { x: 100, y: 470 };
    const b = { x: 500, y: 470 };
    const mid = computeBallFrame(a, b, true, 0.5);
    // Repère SVG : y plus petit = plus haut. La parabole monte au milieu.
    expect(mid.pos.y).toBeLessThan(454);
  });

  it("passe courte : la hauteur de l'arc est inférieure à la version longue", () => {
    const aClose = { x: 280, y: 470 };
    const bClose = { x: 320, y: 470 };
    const aFar = { x: 100, y: 470 };
    const bFar = { x: 500, y: 470 };
    const midClose = computeBallFrame(aClose, bClose, true, 0.5);
    const midFar = computeBallFrame(aFar, bFar, true, 0.5);
    // Plus la passe est longue, plus la parabole est haute (y plus petit)
    expect(midFar.pos.y).toBeLessThan(midClose.pos.y);
  });
});
