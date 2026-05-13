import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { generateAutoAnnotation } from '../generateAutoAnnotation';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import type { AppState } from '@/lib/types';

describe('generateAutoAnnotation — passe', () => {
  it('crée une annotation rectiligne from=pos(fromId), to=pos(toId), pas de waypoints', () => {
    const s = makeInitialState();
    const o1 = s.steps[0].off.O1;
    const o3 = s.steps[0].off.O3;
    const ann = generateAutoAnnotation('pass', 'O1', 'O3', undefined, s);
    expect(ann).not.toBeNull();
    expect(ann!.type).toBe('pass');
    expect(ann!.fromId).toBe('O1');
    expect(ann!.toId).toBe('O3');
    expect(ann!.from).toEqual({ x: o1.x, y: o1.y });
    expect(ann!.to).toEqual({ x: o3.x, y: o3.y });
    expect(ann!.waypoints).toBeUndefined();
  });

  it('retourne null si fromId === toId', () => {
    const s = makeInitialState();
    expect(generateAutoAnnotation('pass', 'O2', 'O2', undefined, s)).toBeNull();
  });
});

describe('generateAutoAnnotation — écran', () => {
  it('retourne null si side manquant', () => {
    const s = makeInitialState();
    expect(generateAutoAnnotation('screen', 'O5', 'O1', undefined, s)).toBeNull();
    expect(generateAutoAnnotation('screen', 'O5', 'O1', {}, s)).toBeNull();
  });

  it('place l\'anchor à environ une largeur d\'épaule du bénéficiaire (4 côtés)', () => {
    const s = makeInitialState();
    const b = s.steps[0].off.O1;
    const sides = ['gauche', 'droite', 'devant', 'dos'] as const;
    for (const side of sides) {
      const ann = generateAutoAnnotation('screen', 'O5', 'O1', { side }, s);
      expect(ann, `side=${side}`).not.toBeNull();
      const d = Math.hypot(ann!.to.x - b.x, ann!.to.y - b.y);
      // L'anchor doit être proche du shoulder-offset (peut être ajusté par push-out
      // contre d'autres joueurs). On vérifie qu'il est dans un anneau raisonnable.
      expect(d, `side=${side} distance to=${d.toFixed(1)}`).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      expect(d, `side=${side} distance to=${d.toFixed(1)}`).toBeLessThan(PLAYER_MIN_CLEARANCE_PX + 30);
    }
  });

  it('écran "droite" : anchor à droite du corps du bénéficiaire (porteur statique → orienté panier au nord)', () => {
    const s = makeInitialState();
    // O1 est le porteur initial, à mi-distance, panier au-dessus → corps orienté nord (θ≈0).
    // forward = (0,-1), right = (1, 0) → anchor "droite" est à droite (x+).
    const b = s.steps[0].off.O1;
    const ann = generateAutoAnnotation('screen', 'O5', 'O1', { side: 'droite' }, s);
    expect(ann).not.toBeNull();
    expect(ann!.to.x).toBeGreaterThan(b.x); // shifted right
    expect(Math.abs(ann!.to.y - b.y)).toBeLessThan(10); // pas de shift vertical significatif
  });

  it('écran "gauche" : anchor symétrique de "droite" autour du bénéficiaire', () => {
    const s = makeInitialState();
    const b = s.steps[0].off.O1;
    const ann = generateAutoAnnotation('screen', 'O5', 'O1', { side: 'gauche' }, s);
    expect(ann).not.toBeNull();
    expect(ann!.to.x).toBeLessThan(b.x);
    expect(Math.abs(ann!.to.y - b.y)).toBeLessThan(10);
  });

  it('écran "devant" : anchor en avant du corps (vers le panier pour porteur statique)', () => {
    const s = makeInitialState();
    const b = s.steps[0].off.O1;
    // forward de O1 orienté panier (nord) → devant est y plus petit (vers le haut SVG).
    const ann = generateAutoAnnotation('screen', 'O5', 'O1', { side: 'devant' }, s);
    expect(ann).not.toBeNull();
    expect(ann!.to.y).toBeLessThan(b.y);
  });

  it('écran "dos" : anchor derrière le corps', () => {
    const s = makeInitialState();
    const b = s.steps[0].off.O1;
    const ann = generateAutoAnnotation('screen', 'O5', 'O1', { side: 'dos' }, s);
    expect(ann).not.toBeNull();
    expect(ann!.to.y).toBeGreaterThan(b.y);
  });

  it('invariant overlap : l\'anchor respecte PLAYER_MIN_CLEARANCE_PX avec TOUS les autres joueurs', () => {
    const s = makeInitialState();
    const sides = ['gauche', 'droite', 'devant', 'dos'] as const;
    for (const side of sides) {
      const ann = generateAutoAnnotation('screen', 'O5', 'O1', { side }, s);
      expect(ann).not.toBeNull();
      const anchor = ann!.to;
      const allOff = s.steps[0].off;
      const allDef = s.defenseInitial;
      // L'anchor est à côté de O1 (bénéficiaire) → on s'autorise une proximité,
      // mais tous les AUTRES joueurs doivent être à clearance.
      (['O2', 'O3', 'O4', 'O5'] as const).forEach((id) => {
        const p = allOff[id];
        if (!p) return;
        const d = Math.hypot(anchor.x - p.x, anchor.y - p.y);
        expect(d, `${side} anchor ↔ ${id}`).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      });
      (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((id) => {
        const p = allDef[id];
        if (!p) return;
        const d = Math.hypot(anchor.x - p.x, anchor.y - p.y);
        expect(d, `${side} anchor ↔ ${id}`).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      });
    }
  });

  it('phase = "end" par défaut', () => {
    const s = makeInitialState();
    const ann = generateAutoAnnotation('screen', 'O5', 'O1', { side: 'droite' }, s);
    expect(ann!.phase).toBe('end');
  });

  it('respecte un override manuel de bodyOrientation du bénéficiaire', () => {
    const s = makeInitialState();
    // Force O1 à regarder vers l'est (θ=90° = droite SVG). Right = (cos 90, sin 90) = (0,1).
    // Donc l'écran "droite" devrait être en y+ (sous le joueur en SVG).
    const sOverride: AppState = {
      ...s,
      attackerOrientations: { O1: { body: 90 } },
    };
    const b = sOverride.steps[0].off.O1;
    const ann = generateAutoAnnotation('screen', 'O5', 'O1', { side: 'droite' }, sOverride);
    expect(ann).not.toBeNull();
    expect(ann!.to.y).toBeGreaterThan(b.y);
    expect(Math.abs(ann!.to.x - b.x)).toBeLessThan(10);
  });
});
