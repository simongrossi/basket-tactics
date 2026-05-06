import { describe, it, expect } from 'vitest';
import { isInTrapZone, pickTrapHelper, trapTarget } from '../trap';
import type { AttackerPositions, DefenderPositions, Matchups } from '../../types';

describe('isInTrapZone', () => {
  it('détecte le coin gauche fond (x bas, y bas)', () => {
    expect(isInTrapZone({ x: 60, y: 80 })).toBe(true);
  });

  it('détecte le coin droit fond', () => {
    expect(isInTrapZone({ x: 540, y: 80 })).toBe(true);
  });

  it('ne détecte pas le centre du terrain', () => {
    expect(isInTrapZone({ x: 300, y: 300 })).toBe(false);
  });

  it("ne détecte pas le haut de la raquette (trop central, y trop haut)", () => {
    expect(isInTrapZone({ x: 300, y: 100 })).toBe(false);
  });

  it("ne détecte pas le milieu de terrain (y trop bas)", () => {
    expect(isInTrapZone({ x: 60, y: 500 })).toBe(false);
  });

  it("détecte la sideline gauche mi-terrain (au-delà du coin baseline)", () => {
    expect(isInTrapZone({ x: 60, y: 350 })).toBe(true);
  });

  it("détecte la sideline droite mi-terrain", () => {
    expect(isInTrapZone({ x: 540, y: 350 })).toBe(true);
  });

  it("ne détecte pas la zone à mi-distance des sidelines (x=200)", () => {
    expect(isInTrapZone({ x: 200, y: 350 })).toBe(false);
  });
});

describe('pickTrapHelper', () => {
  const off: AttackerPositions = {
    O1: { x: 60, y: 80 },   // porteur dans le coin
    O2: { x: 200, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 380, y: 230 },
  };
  const matchups: Matchups = { D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5' };

  it("choisit le défenseur non-porteur le plus proche du porteur", () => {
    const def: DefenderPositions = {
      D1: { x: 60, y: 90 },     // déf du porteur, exclu
      D2: { x: 100, y: 100 },   // proche du porteur
      D3: { x: 470, y: 380 },   // loin
      D4: { x: 220, y: 230 },
      D5: { x: 380, y: 230 },
    };
    const helper = pickTrapHelper(off, def, matchups, 'O1');
    expect(helper).toBe('D2');
  });

  it("retourne null s'il n'y a pas de défenseur du porteur", () => {
    // matchups avec aucun déf sur O1
    const broken: Matchups = { D1: 'O3', D2: 'O2', D3: 'O5', D4: 'O4', D5: 'O3' };
    const def: DefenderPositions = {
      D1: { x: 60, y: 90 }, D2: { x: 100, y: 100 },
      D3: { x: 470, y: 380 }, D4: { x: 220, y: 230 }, D5: { x: 380, y: 230 },
    };
    const helper = pickTrapHelper(off, def, broken, 'O1');
    expect(helper).toBeNull();
  });
});

describe('trapTarget', () => {
  it("place le helper côté opposé au carrierDef, en avant du porteur", () => {
    const carrier = { x: 60, y: 80 };
    const carrierDef = { x: 60, y: 100 }; // côté panier
    const target = trapTarget(carrier, carrierDef);
    // Le helper doit être de l'AUTRE côté du porteur que le carrierDef
    // → carrierDef est en y=100 (sous le porteur), donc helper en y < 80
    expect(target.y).toBeLessThan(carrier.y);
  });

  it("garde le helper proche du porteur (distance < 50px)", () => {
    const carrier = { x: 60, y: 80 };
    const carrierDef = { x: 60, y: 100 };
    const target = trapTarget(carrier, carrierDef);
    const d = Math.hypot(target.x - carrier.x, target.y - carrier.y);
    expect(d).toBeLessThan(50);
  });
});
