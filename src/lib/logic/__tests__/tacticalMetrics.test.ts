import { describe, it, expect } from 'vitest';
import type { Point } from '../../types';
import {
  buildSpacingGraph,
  totalSpacing,
  avgPairwiseDistance,
  maxPairwiseDistance,
  centralityScores,
  pivotPlayer,
  convexHull,
  polygonArea,
  pointInPolygon,
} from '../tactical/spacingGraph';
import {
  buildEJO,
  signedDistanceToAxis,
  inCorridor,
  corridorBlockers,
  EJO_CORRIDOR_NARROW_PX,
} from '../tactical/ejo';
import { readEJP } from '../tactical/ejp';
import { evaluateSpacing } from '../tactical/levelHeuristic';

describe('spacingGraph', () => {
  it('buildSpacingGraph : matrice symétrique, diag à 0, valeurs cohérentes', () => {
    const g = buildSpacingGraph({
      A: { x: 0, y: 0 },
      B: { x: 3, y: 0 },
      C: { x: 0, y: 4 },
    });
    expect(g.ids).toEqual(['A', 'B', 'C']);
    expect(g.dist[0][0]).toBe(0);
    expect(g.dist[1][1]).toBe(0);
    expect(g.dist[0][1]).toBeCloseTo(3, 6);
    expect(g.dist[1][0]).toBeCloseTo(3, 6);
    expect(g.dist[0][2]).toBeCloseTo(4, 6);
    expect(g.dist[1][2]).toBeCloseTo(5, 6);
  });

  it('totalSpacing : 5 joueurs en pentagone régulier → 10 arêtes', () => {
    const r = 100;
    const players: Record<string, Point> = {};
    for (let k = 0; k < 5; k++) {
      const a = ((2 * Math.PI) / 5) * k;
      players[`P${k}`] = { x: r * Math.cos(a), y: r * Math.sin(a) };
    }
    const g = buildSpacingGraph(players);
    // 5 arêtes courtes (côtés) + 5 longues (diagonales)
    const side = 2 * r * Math.sin(Math.PI / 5);
    const diag = 2 * r * Math.sin((2 * Math.PI) / 5);
    expect(totalSpacing(g)).toBeCloseTo(5 * side + 5 * diag, 4);
    expect(avgPairwiseDistance(g)).toBeCloseTo((5 * side + 5 * diag) / 10, 4);
  });

  it('centralityScores : sur un plus-sign, le centre minimise', () => {
    const players: Record<string, Point> = {
      C: { x: 0, y: 0 },
      N: { x: 0, y: -100 },
      S: { x: 0, y: 100 },
      E: { x: 100, y: 0 },
      W: { x: -100, y: 0 },
    };
    const g = buildSpacingGraph(players);
    const scores = centralityScores(g);
    for (const id of ['N', 'S', 'E', 'W']) {
      expect(scores.C).toBeLessThan(scores[id]);
    }
    expect(pivotPlayer(g)).toBe('C');
  });

  it('convexHull : carré → 4 sommets', () => {
    const sq: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(convexHull(sq)).toHaveLength(4);
  });

  it('convexHull : carré + 1 point intérieur → 4 sommets', () => {
    const sq: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ];
    expect(convexHull(sq)).toHaveLength(4);
  });

  it('convexHull : 3 points colinéaires → 2 sommets', () => {
    const line: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(convexHull(line)).toHaveLength(2);
  });

  it('polygonArea : carré 100×100 → 10000', () => {
    const sq: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(polygonArea(sq)).toBeCloseTo(10000, 6);
  });

  it('pointInPolygon : centre dedans, point extérieur dehors', () => {
    const sq: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon({ x: 50, y: 50 }, sq)).toBe(true);
    expect(pointInPolygon({ x: -1, y: 50 }, sq)).toBe(false);
    expect(pointInPolygon({ x: 101, y: 50 }, sq)).toBe(false);
  });

  it('maxPairwiseDistance : diagonale d’un carré', () => {
    const g = buildSpacingGraph({
      A: { x: 0, y: 0 },
      B: { x: 10, y: 0 },
      C: { x: 10, y: 10 },
      D: { x: 0, y: 10 },
    });
    expect(maxPairwiseDistance(g)).toBeCloseTo(Math.sqrt(200), 6);
  });
});

describe('ejo (couloir ballon → cible)', () => {
  it('buildEJO : axe ballon → panier dirigé vers le nord', () => {
    const c = buildEJO({ x: 300, y: 200 }, { x: 300, y: 75 });
    expect(c.length).toBeCloseTo(125, 6);
    expect(c.axis.x).toBeCloseTo(0, 6);
    expect(c.axis.y).toBeCloseTo(-1, 6);
    expect(c.halfWidthPx).toBe(EJO_CORRIDOR_NARROW_PX);
  });

  it('signedDistanceToAxis : symétrie autour de l’axe', () => {
    const c = buildEJO({ x: 300, y: 200 }, { x: 300, y: 75 });
    const dRight = signedDistanceToAxis({ x: 340, y: 150 }, c);
    const dLeft = signedDistanceToAxis({ x: 260, y: 150 }, c);
    expect(dRight).toBeCloseTo(40, 6);
    expect(dLeft).toBeCloseTo(-40, 6);
  });

  it('inCorridor : largeur configurable', () => {
    const wide = buildEJO({ x: 300, y: 200 }, { x: 300, y: 75 }, 55);
    const narrow = buildEJO({ x: 300, y: 200 }, { x: 300, y: 75 }, 20);
    const p = { x: 330, y: 150 };
    expect(inCorridor(p, wide)).toBe(true);
    expect(inCorridor(p, narrow)).toBe(false);
  });

  it('inCorridor : hors longueur (derrière le ballon ou au-delà du panier)', () => {
    const c = buildEJO({ x: 300, y: 200 }, { x: 300, y: 75 });
    expect(inCorridor({ x: 300, y: 250 }, c)).toBe(false); // derrière le ballon
    expect(inCorridor({ x: 300, y: 50 }, c)).toBe(false); // au-delà du panier
    expect(inCorridor({ x: 300, y: 150 }, c)).toBe(true);
  });

  it('corridorBlockers : ne retient que les défenseurs dans le couloir, triés par proximité au ballon', () => {
    const c = buildEJO({ x: 300, y: 200 }, { x: 300, y: 75 });
    const blockers = corridorBlockers(c, {
      D1: { x: 305, y: 170 }, // dans, proche du ballon
      D2: { x: 295, y: 100 }, // dans, proche du panier
      D3: { x: 500, y: 150 }, // hors couloir (latéral)
      D4: { x: 300, y: 250 }, // derrière le ballon
    });
    expect(blockers).toEqual(['D1', 'D2']);
  });
});

describe('ejp (repère égocentré du porteur)', () => {
  it('porteur face au panier, défenseur devant → secteur front', () => {
    const r = readEJP({ x: 300, y: 300 }, 0, { x: 300, y: 250 });
    expect(r.sector).toBe('front');
    expect(r.bearingDeg).toBeCloseTo(0, 6);
    expect(r.distance).toBeCloseTo(50, 6);
  });

  it('porteur face nord, défenseur à l’est → secteur right', () => {
    const r = readEJP({ x: 300, y: 300 }, 0, { x: 350, y: 300 });
    expect(r.sector).toBe('right');
  });

  it('porteur face nord, défenseur au sud → secteur back', () => {
    const r = readEJP({ x: 300, y: 300 }, 0, { x: 300, y: 350 });
    expect(r.sector).toBe('back');
  });

  it('porteur face nord, défenseur à l’ouest → secteur left', () => {
    const r = readEJP({ x: 300, y: 300 }, 0, { x: 250, y: 300 });
    expect(r.sector).toBe('left');
  });

  it('rotation du porteur reclasse le défenseur', () => {
    const defender = { x: 350, y: 300 }; // est en absolu
    const facingNorth = readEJP({ x: 300, y: 300 }, 0, defender);
    const facingEast = readEJP({ x: 300, y: 300 }, 90, defender);
    expect(facingNorth.sector).toBe('right');
    expect(facingEast.sector).toBe('front');
  });

  it('diagonales : secteur frontRight quand défenseur en haut à droite', () => {
    const r = readEJP({ x: 300, y: 300 }, 0, { x: 350, y: 250 });
    expect(r.sector).toBe('frontRight');
  });
});

describe('evaluateSpacing (niveau Mérand)', () => {
  it('5 joueurs empilés → grappe', () => {
    const players: Record<string, Point> = {
      A: { x: 300, y: 100 },
      B: { x: 300, y: 103 },
      C: { x: 300, y: 105 },
      D: { x: 300, y: 108 },
      E: { x: 300, y: 110 },
    };
    const r = evaluateSpacing(players);
    expect(r.level).toBe('grappe');
  });

  it('5 joueurs alignés sur 400 px → comète', () => {
    const players: Record<string, Point> = {
      A: { x: 100, y: 300 },
      B: { x: 200, y: 300 },
      C: { x: 300, y: 300 },
      D: { x: 400, y: 300 },
      E: { x: 500, y: 300 },
    };
    const r = evaluateSpacing(players);
    expect(r.level).toBe('comete');
    expect(r.ejeArea).toBe(0);
    expect(r.diameter).toBeCloseTo(400, 6);
  });

  it('5 joueurs en pentagone régulier r=150 → expert', () => {
    const r = 150;
    const players: Record<string, Point> = {};
    for (let k = 0; k < 5; k++) {
      const a = ((2 * Math.PI) / 5) * k;
      players[`P${k}`] = { x: 300 + r * Math.cos(a), y: 300 + r * Math.sin(a) };
    }
    const report = evaluateSpacing(players);
    expect(report.level).toBe('expert');
    expect(report.ejeArea).toBeGreaterThan(40000);
  });
});
