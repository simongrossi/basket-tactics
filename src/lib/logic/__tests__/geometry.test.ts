import { describe, it, expect } from 'vitest';
import { pickBlockingObstacle } from '../geometry';

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
