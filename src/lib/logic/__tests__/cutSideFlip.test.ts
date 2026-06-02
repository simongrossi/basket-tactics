import { describe, it, expect } from 'vitest';
import { defenderSide, reflectAcrossAxis, maybeFlipCutPath } from '@/lib/logic/cutSideFlip';
import type { Point } from '@/lib/types';

const from: Point = { x: 0, y: 0 };
const to: Point = { x: 0, y: 100 }; // axe vertical, du bas vers le haut (y croissant)

// Path courbé vers la GAUCHE (x négatif au milieu).
const pathLeft: Point[] = [from, { x: -40, y: 50 }, to];

describe('defenderSide', () => {
  it("défenseur à gauche de l'axe from→to", () => {
    expect(defenderSide(from, to, { x: -30, y: 50 })).toBe('left');
  });
  it("défenseur à droite de l'axe", () => {
    expect(defenderSide(from, to, { x: 30, y: 50 })).toBe('right');
  });
  it("défenseur sur l'axe → on", () => {
    expect(defenderSide(from, to, { x: 0, y: 50 })).toBe('on');
  });
});

describe('reflectAcrossAxis', () => {
  it("réfléchit un point autour de l'axe from→to", () => {
    const p = reflectAcrossAxis({ x: -40, y: 50 }, from, to);
    expect(p.x).toBeCloseTo(40, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });
  it("un point SUR l'axe est invariant", () => {
    const p = reflectAcrossAxis({ x: 0, y: 30 }, from, to);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(30, 5);
  });
});

describe('maybeFlipCutPath', () => {
  it('defender du côté trigger (gauche) + flip="left" → path miroité', () => {
    const { path, flipped } = maybeFlipCutPath(pathLeft, from, to, 'left', { x: -30, y: 50 });
    expect(flipped).toBe(true);
    expect(path[1].x).toBeCloseTo(40, 5);
  });

  it('defender du côté opposé (droite) + flip="left" → path inchangé', () => {
    const { path, flipped } = maybeFlipCutPath(pathLeft, from, to, 'left', { x: 30, y: 50 });
    expect(flipped).toBe(false);
    expect(path[1].x).toBeCloseTo(-40, 5);
  });

  it('flip undefined → toujours inchangé', () => {
    const { path, flipped } = maybeFlipCutPath(pathLeft, from, to, undefined, { x: -30, y: 50 });
    expect(flipped).toBe(false);
    expect(path).toBe(pathLeft); // même référence
  });

  it('defPos undefined → inchangé (graceful)', () => {
    const { path, flipped } = maybeFlipCutPath(pathLeft, from, to, 'left', undefined);
    expect(flipped).toBe(false);
    expect(path).toBe(pathLeft);
  });

  it('endpoints préservés exactement après flip', () => {
    const { path } = maybeFlipCutPath(pathLeft, from, to, 'left', { x: -30, y: 50 });
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
  });

  it('flip de flip = identité (involution)', () => {
    const once = maybeFlipCutPath(pathLeft, from, to, 'left', { x: -30, y: 50 });
    const twice = maybeFlipCutPath(once.path, from, to, 'right', { x: 30, y: 50 });
    expect(twice.flipped).toBe(true);
    expect(twice.path[1].x).toBeCloseTo(-40, 5);
  });
});
