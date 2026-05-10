import { describe, it, expect } from 'vitest';
import {
  detectBaselineDriveFromPositions,
  type BaselineDefenderInput,
} from '../baselineDrive';

const HOOP = { x: 300, y: 75 };

const defaultDef: Record<string, BaselineDefenderInput> = {
  D1: { x: 300, y: 380 },
  D2: { x: 170, y: 310 },
  D3: { x: 430, y: 310 },
  D4: { x: 240, y: 160 },
  D5: { x: 360, y: 160 },
};

describe('detectBaselineDriveFromPositions — hors zone', () => {
  it('retourne null si le porteur est au top de l\'arc (hors bande baseline)', () => {
    const r = detectBaselineDriveFromPositions('O1', { x: 300, y: 470 }, null, HOOP, defaultDef);
    expect(r).toBeNull();
  });

  it('retourne null si le porteur est dans la raquette (lateral < 95)', () => {
    const r = detectBaselineDriveFromPositions('O1', { x: 320, y: 100 }, null, HOOP, defaultDef);
    expect(r).toBeNull();
  });

  it('retourne null si le porteur est trop large (lateral > 260)', () => {
    const r = detectBaselineDriveFromPositions('O1', { x: 580, y: 100 }, null, HOOP, defaultDef);
    expect(r).toBeNull();
  });
});

describe('detectBaselineDriveFromPositions — phase static', () => {
  it('détecte un porteur posté en short corner droit', () => {
    const r = detectBaselineDriveFromPositions('O1', { x: 460, y: 100 }, null, HOOP, defaultDef);
    expect(r).not.toBeNull();
    expect(r!.phase).toBe('static');
    expect(r!.side).toBe(1);
  });

  it('détecte côté gauche', () => {
    const r = detectBaselineDriveFromPositions('O1', { x: 140, y: 100 }, null, HOOP, defaultDef);
    expect(r).not.toBeNull();
    expect(r!.side).toBe(-1);
  });
});

describe('detectBaselineDriveFromPositions — phase driving', () => {
  it('détecte un drive vers le panier (lateral diminue)', () => {
    const prev = { x: 540, y: 130 };
    const cur = { x: 480, y: 110 };
    const r = detectBaselineDriveFromPositions('O1', cur, prev, HOOP, defaultDef);
    expect(r).not.toBeNull();
    expect(r!.phase).toBe('driving');
  });

  it('reste static si le mouvement entre étapes est minime', () => {
    const prev = { x: 462, y: 100 };
    const cur = { x: 460, y: 100 };
    const r = detectBaselineDriveFromPositions('O1', cur, prev, HOOP, defaultDef);
    expect(r).not.toBeNull();
    expect(r!.phase).toBe('static');
  });
});

describe('detectBaselineDriveFromPositions — couverture', () => {
  it('uncovered=true quand aucun défenseur n\'est sur le couloir', () => {
    const def: Record<string, BaselineDefenderInput> = {
      D1: { x: 50, y: 500 },
      D2: { x: 50, y: 450 },
      D3: { x: 50, y: 400 },
      D4: { x: 50, y: 350 },
      D5: { x: 50, y: 300 },
    };
    const r = detectBaselineDriveFromPositions('O1', { x: 460, y: 100 }, null, HOOP, def);
    expect(r!.uncovered).toBe(true);
    expect(r!.closer!.perpDist).toBeGreaterThan(70);
  });

  it('uncovered=false quand un défenseur est sur le couloir carrier→panier', () => {
    const def: Record<string, BaselineDefenderInput> = {
      ...defaultDef,
      D5: { x: 380, y: 90 }, // entre O1 (460,100) et HOOP (300,75)
    };
    const r = detectBaselineDriveFromPositions('O1', { x: 460, y: 100 }, null, HOOP, def);
    expect(r!.uncovered).toBe(false);
    expect(r!.closer!.perpDist).toBeLessThan(70);
  });

  it('uncovered=true si le closer est en retard, même proche', () => {
    const def: Record<string, BaselineDefenderInput> = {
      ...defaultDef,
      D5: { x: 380, y: 90, late: true },
    };
    const r = detectBaselineDriveFromPositions('O1', { x: 460, y: 100 }, null, HOOP, def);
    expect(r!.uncovered).toBe(true);
    expect(r!.closer!.late).toBe(true);
  });

  it('expose le 2e plus proche défenseur (futur Étape 2)', () => {
    const r = detectBaselineDriveFromPositions('O1', { x: 460, y: 100 }, null, HOOP, defaultDef);
    expect(r!.second).not.toBeNull();
    expect(r!.second!.perpDist).toBeGreaterThanOrEqual(r!.closer!.perpDist);
  });

  it('paintHelpers liste les défenseurs déjà rentrés en raquette', () => {
    const def: Record<string, BaselineDefenderInput> = {
      ...defaultDef,
      D5: { x: 305, y: 100 }, // dHoop ~26
      D4: { x: 295, y: 130 }, // dHoop ~56
    };
    const r = detectBaselineDriveFromPositions('O1', { x: 460, y: 100 }, null, HOOP, def);
    expect(r!.paintHelpers).toContain('D5');
    expect(r!.paintHelpers).toContain('D4');
  });
});
