// Tests CVT Chantier 2 — Influence Map.

import { describe, expect, it } from 'vitest';
import {
  buildDrivingLane,
  buildPassingLanes,
  interposeForce,
  interposeForcesAgainstLanes,
  projectOnSegment,
  signedPerpDistance,
} from '@/lib/logic/influenceMap';
import { composeTarget } from '@/lib/logic/steeringEngine';
import type { AttackerPositions } from '@/lib/types';
import { HOOP, HOOP_OPPOSITE } from '@/lib/data/court';

const P = (x: number, y: number) => ({ x, y });

const FULL_OFF: AttackerPositions = {
  O1: P(300, 480),
  O2: P(100, 380),
  O3: P(500, 380),
  O4: P(200, 200),
  O5: P(400, 200),
};

describe('buildPassingLanes', () => {
  it('génère un segment pour chaque non-porteur présent', () => {
    const lanes = buildPassingLanes('O1', FULL_OFF.O1!, FULL_OFF);
    expect(lanes).toHaveLength(4);
    const toIds = lanes.map((l) => l.toId).sort();
    expect(toIds).toEqual(['O2', 'O3', 'O4', 'O5']);
    expect(lanes.every((l) => l.kind === 'pass')).toBe(true);
    expect(lanes.every((l) => l.a === FULL_OFF.O1)).toBe(true);
  });

  it('exclut le porteur lui-même', () => {
    const lanes = buildPassingLanes('O1', FULL_OFF.O1!, FULL_OFF);
    expect(lanes.find((l) => l.toId === 'O1')).toBeUndefined();
  });

  it('filtre les attaquants absents', () => {
    const partial = { O1: FULL_OFF.O1, O2: FULL_OFF.O2 } as AttackerPositions;
    const lanes = buildPassingLanes('O1', partial.O1!, partial);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].toId).toBe('O2');
  });
});

describe('buildDrivingLane', () => {
  it('segment porteur → HOOP par défaut', () => {
    const lane = buildDrivingLane(FULL_OFF.O1!);
    expect(lane.kind).toBe('drive');
    expect(lane.toId).toBe('hoop');
    expect(lane.a).toBe(FULL_OFF.O1);
    expect(lane.b).toEqual(HOOP);
  });

  it('panier paramétrable (HOOP_OPPOSITE pour cycle home/away)', () => {
    const lane = buildDrivingLane(FULL_OFF.O1!, HOOP_OPPOSITE);
    expect(lane.b).toEqual(HOOP_OPPOSITE);
  });
});

describe('signedPerpDistance', () => {
  it('positive à gauche du vecteur a→b', () => {
    // Segment a→b vers la droite (axe x positif).
    // Point au-dessus (y plus petit en écran) = côté +y dans coord-écran.
    // Convention : signe = produit vectoriel z. (b-a) × (p-a) avec a→b = +x
    // → (1, 0) × (0, dy) = dx*(p.y - a.y) - dy*(p.x - a.x) = 1*dy - 0 = dy
    // Donc p.y > a.y → positif.
    const d = signedPerpDistance(P(50, 60), P(0, 0), P(100, 0));
    expect(d).toBeCloseTo(60, 6);
  });

  it('négative de l\'autre côté', () => {
    const d = signedPerpDistance(P(50, -40), P(0, 0), P(100, 0));
    expect(d).toBeCloseTo(-40, 6);
  });

  it('zéro si le point est sur la droite', () => {
    expect(signedPerpDistance(P(50, 0), P(0, 0), P(100, 0))).toBeCloseTo(0, 6);
  });

  it('zéro si segment dégénéré (a === b)', () => {
    expect(signedPerpDistance(P(10, 10), P(0, 0), P(0, 0))).toBe(0);
  });

  it('cohérence avec géométrie : magnitude = distance perpendiculaire à la droite', () => {
    const a = P(0, 0);
    const b = P(3, 4); // segment de longueur 5
    // Point perpendiculaire à (3, 4) avec offset = (-4, 3) normalisé = (-0.8, 0.6)
    // À distance 5 du segment : p = (1.5, 2) + 5*(-0.8, 0.6) = (-2.5, 5)
    const p = P(-2.5, 5);
    const d = signedPerpDistance(p, a, b);
    expect(Math.abs(d)).toBeCloseTo(5, 5);
  });
});

describe('projectOnSegment', () => {
  it('projection orthogonale à l\'intérieur du segment', () => {
    const proj = projectOnSegment(P(50, 30), P(0, 0), P(100, 0));
    expect(proj.x).toBeCloseTo(50, 6);
    expect(proj.y).toBeCloseTo(0, 6);
  });

  it('clampe à l\'extrémité a si projection avant a', () => {
    const proj = projectOnSegment(P(-20, 30), P(0, 0), P(100, 0));
    expect(proj).toEqual(P(0, 0));
  });

  it('clampe à l\'extrémité b si projection après b', () => {
    const proj = projectOnSegment(P(200, 30), P(0, 0), P(100, 0));
    expect(proj).toEqual(P(100, 0));
  });

  it('segment dégénéré → renvoie a', () => {
    expect(projectOnSegment(P(50, 50), P(10, 10), P(10, 10))).toEqual(P(10, 10));
  });
});

describe('interposeForce', () => {
  it('seek vers la projection (poussée vers la ligne)', () => {
    const defenderRef = P(50, 30);
    const a = P(0, 0);
    const b = P(100, 0);
    // Projection de defender sur (0,0)-(100,0) = (50, 0)
    const f = interposeForce(defenderRef, a, b, 10, 'interpose-test');
    // Direction = (50, 0) - (50, 30) normalisé = (0, -1)
    expect(f.direction.x).toBeCloseTo(0, 6);
    expect(f.direction.y).toBeCloseTo(-1, 6);
    expect(f.weight).toBe(10);
  });

  it('force morte si déjà sur la ligne', () => {
    const f = interposeForce(P(50, 0), P(0, 0), P(100, 0), 10, 'on-line');
    expect(f.weight).toBe(0);
    expect(f.direction).toEqual({ x: 0, y: 0 });
  });

  it('force morte si weight ≤ 0', () => {
    const f = interposeForce(P(50, 30), P(0, 0), P(100, 0), 0, 'w0');
    expect(f.weight).toBe(0);
  });

  it("composé avec composeTarget → cible = projection", () => {
    const defenderRef = P(50, 30);
    const a = P(0, 0);
    const b = P(100, 0);
    const f = interposeForce(defenderRef, a, b, 30, 'interpose');
    // |proj - def| = 30 → weight = 30 → composeTarget = defenderRef + dir * 30 = (50, 0) = projection
    const composed = composeTarget(defenderRef, [f]);
    expect(composed.x).toBeCloseTo(50, 6);
    expect(composed.y).toBeCloseTo(0, 6);
  });
});

describe('interposeForcesAgainstLanes', () => {
  it('émet une force par lane avec label détaillé', () => {
    const lanes = buildPassingLanes('O1', FULL_OFF.O1!, FULL_OFF);
    const forces = interposeForcesAgainstLanes(P(300, 300), lanes, 10);
    expect(forces).toHaveLength(4);
    expect(forces.every((f) => f.label.startsWith('interpose-pass-O'))).toBe(true);
  });

  it('liste vide → tableau vide', () => {
    expect(interposeForcesAgainstLanes(P(0, 0), [], 10)).toEqual([]);
  });
});
