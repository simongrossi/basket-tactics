import { describe, it, expect } from 'vitest';
import { polylinePath, samplePolyline, simplifyPolyline } from '../polyline';

describe('samplePolyline', () => {
  it('retourne le seul point pour une polyline d\'1 sommet', () => {
    expect(samplePolyline([{ x: 10, y: 20 }], 0.5)).toEqual({ x: 10, y: 20 });
  });

  it('lerp linéaire pour 2 sommets (équivalent à un cut droit)', () => {
    const p = samplePolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], 0.5);
    expect(p.x).toBeCloseTo(50, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('start = points[0] à t=0, end = points[n-1] à t=1', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 30 }, { x: 100, y: 0 }];
    expect(samplePolyline(pts, 0)).toEqual(pts[0]);
    expect(samplePolyline(pts, 1)).toEqual(pts[2]);
  });

  it('passe par chaque waypoint à t = pos cumulative', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 100, y: 0 },
    ];
    // Total len = 100. Le waypoint 1 est à 40/100 = 0.4.
    const p = samplePolyline(pts, 0.4);
    expect(p.x).toBeCloseTo(40, 1);
    expect(p.y).toBeCloseTo(0, 1);
  });

  it('V-cut aller-retour : la spline traverse bien le pic', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 50 }, // pic
      { x: 0, y: 0 },   // retour au point de départ
    ];
    // Au milieu (t=0.5), on doit être proche du pic (50, 50).
    const mid = samplePolyline(pts, 0.5);
    expect(mid.x).toBeCloseTo(50, 0);
    expect(mid.y).toBeCloseTo(50, 0);
  });

  it("vitesse perçue ~constante : t=0.25 et t=0.75 sont à des distances similaires des extrémités", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 30, y: 30 },
      { x: 100, y: 0 },
    ];
    const a = samplePolyline(pts, 0.25);
    const b = samplePolyline(pts, 0.75);
    // Distances cumulatives sur la spline
    const dStart = Math.hypot(a.x, a.y);
    const dEnd = Math.hypot(b.x - 100, b.y);
    // À 25% / 75% de la longueur d'arc, on doit être à des distances comparables
    // (à 30% près) du point de départ / d'arrivée — preuve que la
    // reparamétrisation est en longueur d'arc, pas en t Catmull-Rom brut.
    expect(Math.abs(dStart - dEnd) / Math.max(dStart, dEnd)).toBeLessThan(0.3);
  });
});

describe('polylinePath', () => {
  it('vide pour 0 point', () => {
    expect(polylinePath([])).toBe('');
  });

  it('M seul pour 1 point', () => {
    expect(polylinePath([{ x: 10, y: 20 }])).toBe('M 10 20');
  });

  it('M + L pour 2 points (ligne droite)', () => {
    expect(polylinePath([{ x: 0, y: 0 }, { x: 100, y: 50 }])).toBe('M 0 0 L 100 50');
  });

  it('utilise des courbes C (cubic Bezier) pour 3+ points', () => {
    const d = polylinePath([
      { x: 0, y: 0 },
      { x: 50, y: 30 },
      { x: 100, y: 0 },
    ]);
    expect(d).toMatch(/^M 0 0/);
    expect(d).toContain('C ');
    // Doit terminer par le dernier point
    expect(d).toMatch(/100 0$/);
  });
});

describe('simplifyPolyline', () => {
  it('préserve une polyline de 2 points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(simplifyPolyline(pts, 5)).toEqual(pts);
  });

  it('supprime les points alignés avec la corde sous tolérance', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 25, y: 0.5 },
      { x: 50, y: 0 },
      { x: 75, y: 0.5 },
      { x: 100, y: 0 },
    ];
    const out = simplifyPolyline(pts, 5);
    expect(out).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it('garde les sommets qui dévient au-delà de la tolérance', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 30 }, // déviation forte
      { x: 100, y: 0 },
    ];
    const out = simplifyPolyline(pts, 5);
    expect(out).toHaveLength(3);
  });

  it('réduit un freehand bruyant (50 points) à une poignée de waypoints', () => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 50; i++) {
      pts.push({ x: i * 2, y: Math.sin(i / 10) * 30 });
    }
    const out = simplifyPolyline(pts, 3);
    expect(out.length).toBeLessThan(15);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });
});
