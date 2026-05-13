import { describe, it, expect } from 'vitest';
import { computeOffBallPositions } from '../autoOffense';
import { HOOP } from '../../data/court';
import {
  buildSpacingGraph,
  totalSpacing,
  buildEJO,
  inCorridor,
  EJO_CORRIDOR_NARROW_PX,
} from '../tactical';
import type { AttackerPositions, AttackerProfiles } from '../../types';

describe('computeOffBallPositions', () => {
  it("retourne 4 positions (tous les hors-porteur), aucune pour le porteur", () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 150, y: 400 },
      O3: { x: 450, y: 400 },
      O4: { x: 230, y: 250 },
      O5: { x: 350, y: 200 },
    };
    const result = computeOffBallPositions(off, 'O1', HOOP);
    expect(result).toHaveLength(4);
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(['O2', 'O3', 'O4', 'O5']);
  });

  it('améliore (ou maintient) le total spacing à partir d\'une grappe', () => {
    // 5 joueurs empilés autour du même point (grappe pathologique).
    const off: AttackerPositions = {
      O1: { x: 300, y: 350 },
      O2: { x: 305, y: 355 },
      O3: { x: 295, y: 355 },
      O4: { x: 300, y: 345 },
      O5: { x: 305, y: 345 },
    };
    const initialSpacing = totalSpacing(buildSpacingGraph(off));
    const result = computeOffBallPositions(off, 'O1', HOOP);
    const after: AttackerPositions = { ...off };
    for (const r of result) after[r.id] = r.pos;
    const finalSpacing = totalSpacing(buildSpacingGraph(after));
    expect(finalSpacing).toBeGreaterThan(initialSpacing * 5);
  });

  it('candidates respectent l\'anneau du profil shooter (3pts et au-delà)', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 150, y: 400 },
      O3: { x: 450, y: 400 },
      O4: { x: 230, y: 250 },
      O5: { x: 350, y: 200 },
    };
    const profiles: AttackerProfiles = {
      O1: 'creator',
      O2: 'shooter',
      O3: 'shooter',
      O4: 'creator',
      O5: 'rim-roller',
    };
    const result = computeOffBallPositions(off, 'O1', HOOP, profiles);
    const o2 = result.find((r) => r.id === 'O2')!;
    const o3 = result.find((r) => r.id === 'O3')!;
    const distO2 = Math.hypot(o2.pos.x - HOOP.x, o2.pos.y - HOOP.y);
    const distO3 = Math.hypot(o3.pos.x - HOOP.x, o3.pos.y - HOOP.y);
    // Shooter ring [240, 320]
    expect(distO2).toBeGreaterThanOrEqual(240);
    expect(distO2).toBeLessThanOrEqual(320);
    expect(distO3).toBeGreaterThanOrEqual(240);
    expect(distO3).toBeLessThanOrEqual(320);
  });

  it('rim-roller naturellement proche du panier (anneau [40, 120])', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 150, y: 400 },
      O3: { x: 450, y: 400 },
      O4: { x: 230, y: 250 },
      O5: { x: 350, y: 200 },
    };
    const profiles: AttackerProfiles = {
      O1: 'creator',
      O2: 'shooter',
      O3: 'shooter',
      O4: 'stretch-big',
      O5: 'rim-roller',
    };
    const result = computeOffBallPositions(off, 'O1', HOOP, profiles);
    const o5 = result.find((r) => r.id === 'O5')!;
    const d = Math.hypot(o5.pos.x - HOOP.x, o5.pos.y - HOOP.y);
    expect(d).toBeGreaterThanOrEqual(40);
    expect(d).toBeLessThanOrEqual(120);
  });

  it('un profil neutre (shooter) tend à éviter le couloir ballon→panier', () => {
    // Porteur au sud, panier au nord → couloir vertical x ≈ 300.
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },  // porteur sur l'axe
      O2: { x: 200, y: 400 },
      O3: { x: 400, y: 400 },
      O4: { x: 230, y: 250 },
      O5: { x: 350, y: 200 },
    };
    const profiles: AttackerProfiles = {
      O1: 'creator',
      O2: 'shooter',
      O3: 'shooter',
      O4: 'shooter',
      O5: 'shooter',  // tous shooters → pénalité de couloir active
    };
    const result = computeOffBallPositions(off, 'O1', HOOP, profiles);
    const ejo = buildEJO(off.O1, HOOP, EJO_CORRIDOR_NARROW_PX);
    const insideCorridorCount = result.filter((r) => inCorridor(r.pos, ejo)).length;
    // Idéalement zéro, on tolère 1 pour ne pas casser le test si le packing
    // optimal force un joueur sur l'axe.
    expect(insideCorridorCount).toBeLessThanOrEqual(1);
  });
});
