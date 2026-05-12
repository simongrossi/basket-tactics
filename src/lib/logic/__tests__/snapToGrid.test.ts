// Tests #2 — snap-to-grid.

import { describe, expect, it } from 'vitest';
import { snapToGrid } from '../snapToGrid';
import { COURT_CENTERLINE_X, HOOP, PAINT, THREE_POINT_RADIUS } from '@/lib/data/court';

describe('snapToGrid', () => {
  it("aucun snap si point loin de toute ligne", () => {
    const out = snapToGrid({ x: 150, y: 300 });
    expect(out.snappedTo).toBeNull();
    expect(out.point).toEqual({ x: 150, y: 300 });
  });

  it("snape sur la ligne médiane (x=300) si à ≤ 8px", () => {
    const out = snapToGrid({ x: 305, y: 400 });
    expect(out.snappedTo).toBe('midline');
    expect(out.point.x).toBe(COURT_CENTERLINE_X);
    expect(out.point.y).toBe(400); // y inchangé
  });

  it("ne snape PAS si à > 8px de la médiane", () => {
    const out = snapToGrid({ x: 315, y: 400 });
    expect(out.snappedTo).toBeNull();
  });

  it("snape sur le bord gauche de la raquette", () => {
    const out = snapToGrid({ x: PAINT.x1 + 3, y: 100 });
    expect(out.snappedTo).toBe('paint-left');
    expect(out.point.x).toBe(PAINT.x1);
  });

  it("snape sur le bord droit de la raquette", () => {
    const out = snapToGrid({ x: PAINT.x2 - 2, y: 100 });
    expect(out.snappedTo).toBe('paint-right');
    expect(out.point.x).toBe(PAINT.x2);
  });

  it("snape sur la ligne LF (paint-bottom)", () => {
    // x=270 → loin de la médiane (30px) pour éviter la confusion avec midline
    const out = snapToGrid({ x: 270, y: PAINT.y2 - 3 });
    // paint-bottom et free-throw même y → paint-bottom priorisé en V1
    expect(out.snappedTo).toMatch(/paint-bottom|free-throw/);
    expect(out.point.y).toBe(PAINT.y2);
  });

  it("snape sur l'arc à 3pts (rayon 250 depuis HOOP)", () => {
    // Direction nord-est à 247px du panier
    const angle = Math.PI / 4;
    const r = 247; // 3px sous le rayon target → snap attendu
    const pt = { x: HOOP.x + Math.cos(angle) * r, y: HOOP.y + Math.sin(angle) * r };
    const out = snapToGrid(pt);
    expect(out.snappedTo).toBe('three-point-arc');
    const newR = Math.hypot(out.point.x - HOOP.x, out.point.y - HOOP.y);
    expect(newR).toBeCloseTo(THREE_POINT_RADIUS, 0);
  });

  it("snape sur le bloc gauche (HOOP.x - 70, HOOP.y + 80)", () => {
    const out = snapToGrid({ x: HOOP.x - 73, y: HOOP.y + 78 });
    expect(out.snappedTo).toBe('block-left');
    expect(out.point.x).toBe(HOOP.x - 70);
    expect(out.point.y).toBe(HOOP.y + 80);
  });

  it("snape sur le bloc droit", () => {
    const out = snapToGrid({ x: HOOP.x + 73, y: HOOP.y + 78 });
    expect(out.snappedTo).toBe('block-right');
    expect(out.point.x).toBe(HOOP.x + 70);
    expect(out.point.y).toBe(HOOP.y + 80);
  });

  it("priorise le plus proche en cas de multi-candidats", () => {
    // Point très proche du bloc gauche (à 2px) ET aussi proche de la médiane
    // (HOOP.x - 70 = 230, donc dist à médiane = 70 → trop loin de toute façon).
    // Test plutôt : point proche du coin (paint-left + paint-top), proche tag
    // qui donne la plus petite distance.
    const out = snapToGrid({ x: PAINT.x1 + 1, y: PAINT.y1 + 5 });
    // x est à 1px de paint-left, y à 5px de paint-top → paint-left gagne
    expect(out.snappedTo).toBe('paint-left');
  });

  it("respecte le threshold custom", () => {
    // À 15px de la médiane, default threshold = 8 → no snap
    const a = snapToGrid({ x: 285, y: 400 });
    expect(a.snappedTo).toBeNull();
    // Avec threshold = 20 → snap
    const b = snapToGrid({ x: 285, y: 400 }, 20);
    expect(b.snappedTo).toBe('midline');
  });
});
