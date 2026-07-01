import { describe, it, expect } from 'vitest';
import {
  sideWithTolerance,
  strictSide,
  binarySide,
  ballSide,
  attackerSide,
  isWeakSide,
  isStrongSide,
} from '../courtSides';
import { CARRIER_SIDE_TOLERANCE_PX, HOOP } from '../../data/court';

describe('courtSides — sémantique avec bande centrale', () => {
  it('retourne 0 dans la bande centrale (strictement < tolerance)', () => {
    expect(sideWithTolerance(HOOP.x)).toBe(0);
    expect(sideWithTolerance(HOOP.x + CARRIER_SIDE_TOLERANCE_PX - 1)).toBe(0);
    expect(sideWithTolerance(HOOP.x - CARRIER_SIDE_TOLERANCE_PX + 1)).toBe(0);
  });

  it('la borne exacte de tolerance est HORS bande (comportement historique)', () => {
    expect(sideWithTolerance(HOOP.x + CARRIER_SIDE_TOLERANCE_PX)).toBe(1);
    expect(sideWithTolerance(HOOP.x - CARRIER_SIDE_TOLERANCE_PX)).toBe(-1);
  });

  it('ballSide : undefined → 0, sinon bande centrale autour de HOOP.x', () => {
    expect(ballSide(undefined)).toBe(0);
    expect(ballSide({ x: HOOP.x + 100, y: 300 })).toBe(1);
    expect(ballSide({ x: HOOP.x - 100, y: 300 })).toBe(-1);
    expect(ballSide({ x: HOOP.x + 10, y: 300 })).toBe(0);
  });

  it('attackerSide : identique à ballSide mais hoop paramétrable', () => {
    const hoop = { x: 260, y: 75 };
    expect(attackerSide({ x: 260 + 40, y: 300 }, hoop)).toBe(1);
    expect(attackerSide({ x: 260 - 40, y: 300 }, hoop)).toBe(-1);
    expect(attackerSide({ x: 260 + 20, y: 300 }, hoop)).toBe(0);
  });
});

describe('courtSides — sémantique stricte (help.ts / zoneDefense)', () => {
  it('signe pur sans bande centrale', () => {
    expect(strictSide(HOOP.x + 1)).toBe(1);
    expect(strictSide(HOOP.x - 1)).toBe(-1);
    expect(strictSide(HOOP.x)).toBe(0);
  });

  it('équivalent à Math.sign(x - refX) || 0 (forme historique de help.ts)', () => {
    for (const x of [0, 150, 299.5, 300, 300.5, 450, 600]) {
      expect(strictSide(x, 300)).toBe(Math.sign(x - 300) || 0);
    }
  });

  it('refX personnalisé (COURT_CENTER_X de zoneDefense)', () => {
    expect(strictSide(310, 300)).toBe(1);
    expect(strictSide(290, 300)).toBe(-1);
  });
});

describe('courtSides — binarySide (offset latéral manDefense)', () => {
  it("l'axe compte comme droite (x >= refX ? 1 : -1, forme historique)", () => {
    expect(binarySide(HOOP.x)).toBe(1);
    expect(binarySide(HOOP.x + 1)).toBe(1);
    expect(binarySide(HOOP.x - 1)).toBe(-1);
  });
});

describe('courtSides — prédicats weak/strong', () => {
  it('weak-side : côtés définis et opposés', () => {
    expect(isWeakSide(-1, 1)).toBe(true);
    expect(isWeakSide(1, -1)).toBe(true);
    expect(isWeakSide(1, 1)).toBe(false);
    expect(isWeakSide(0, 1)).toBe(false);
    expect(isWeakSide(1, 0)).toBe(false);
    expect(isWeakSide(0, 0)).toBe(false);
  });

  it('strong-side : côtés définis et identiques', () => {
    expect(isStrongSide(1, 1)).toBe(true);
    expect(isStrongSide(-1, -1)).toBe(true);
    expect(isStrongSide(1, -1)).toBe(false);
    expect(isStrongSide(0, 1)).toBe(false);
    expect(isStrongSide(1, 0)).toBe(false);
  });

  it('un côté ne peut jamais être à la fois weak et strong', () => {
    const sides = [-1, 0, 1] as const;
    for (const a of sides) {
      for (const b of sides) {
        expect(isWeakSide(a, b) && isStrongSide(a, b)).toBe(false);
      }
    }
  });
});
