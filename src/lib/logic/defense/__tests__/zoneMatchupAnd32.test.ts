// Zone matchup (un défenseur par attaquant, passage de relais) et zone 3-2
// (rotation sur ballon au coin).

import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { computeDefenseTargets, getDefenseHoop } from '@/lib/logic/engine';
import { distance } from '@/lib/logic/geometry';
import type { AppState, AttackerId, AttackerPositions, ZoneType } from '@/lib/types';
import { optimalAssignment } from '../matchupZone';
import { isCornerBall } from '../zone32Rotation';

type Off = Record<AttackerId, { x: number; y: number }>;

function zoneState(type: ZoneType, frames: Array<{ off: Off; carrier: AttackerId }>, extra: Partial<AppState['zoneConfig']> = {}): AppState {
  const base = makeInitialState();
  return {
    ...base,
    defenseSystem: 'zone',
    zoneConfig: { ...base.zoneConfig, type, ...extra },
    steps: frames.map((f) => ({ off: f.off as AttackerPositions, ballCarrier: f.carrier, annotations: [] })),
    activeStep: 0,
  };
}

// Attaque 1-2-2 : meneur en tête, deux ailes, deux au poste bas.
const SET: Off = {
  O1: { x: 300, y: 360 },
  O2: { x: 110, y: 280 },
  O3: { x: 490, y: 280 },
  O4: { x: 230, y: 120 },
  O5: { x: 370, y: 120 },
};

describe('zone matchup — appariement un pour un', () => {
  it('chaque attaquant a un défenseur, aucun doublon', () => {
    const res = computeDefenseTargets(zoneState('zone-matchup', [{ off: SET, carrier: 'O1' }]), 0);
    const men = Object.values(res.positions).map((p) => p.matchedTo);
    expect(new Set(men).size).toBe(5);
  });

  it('appariement par la zone, pas par le numéro', () => {
    // O2 et O3 échangent leur place : les défenseurs de zone suivent la place.
    const swapped = { ...SET, O2: SET.O3, O3: SET.O2 };
    const a = computeDefenseTargets(zoneState('zone-matchup', [{ off: SET, carrier: 'O1' }]), 0).positions;
    const b = computeDefenseTargets(zoneState('zone-matchup', [{ off: swapped, carrier: 'O1' }]), 0).positions;
    const guardOf = (res: typeof a, att: AttackerId) =>
      Object.entries(res).find(([, p]) => p.matchedTo === att)![0];
    expect(guardOf(b, 'O3')).toBe(guardOf(a, 'O2'));
    expect(guardOf(b, 'O2')).toBe(guardOf(a, 'O3'));
  });

  it('continuité : on garde son homme quand l’attaque bouge peu', () => {
    const moved: Off = { ...SET, O2: { x: 125, y: 265 }, O4: { x: 240, y: 135 } };
    const state = zoneState('zone-matchup', [{ off: SET, carrier: 'O1' }, { off: moved, carrier: 'O1' }]);
    const a = computeDefenseTargets(state, 0).matchupsApplied;
    const b = computeDefenseTargets(state, 1).matchupsApplied;
    expect(b).toEqual(a);
  });

  it('passage de relais : le coupeur qui traverse est pris par la zone d’arrivée', () => {
    const cutToCorner: Off = { ...SET, O2: { x: 540, y: 110 }, O1: { x: 170, y: 320 } };
    const state = zoneState('zone-matchup', [
      { off: SET, carrier: 'O3' },
      { off: cutToCorner, carrier: 'O3' },
    ]);
    const before = computeDefenseTargets(state, 0).positions;
    const after = computeDefenseTargets(state, 1).positions;
    const guardOf = (res: typeof before, att: AttackerId) =>
      Object.entries(res).find(([, p]) => p.matchedTo === att)![0];
    // Le défenseur d'origine de O2 (côté gauche) ne traverse pas le terrain.
    expect(guardOf(after, 'O2')).not.toBe(guardOf(before, 'O2'));
    // Le défenseur du porteur ne lâche pas le ballon.
    expect(guardOf(after, 'O3')).toBe(guardOf(before, 'O3'));
    // Toujours un pour un.
    expect(new Set(Object.values(after).map((p) => p.matchedTo)).size).toBe(5);
    // Le relais est signalé.
    expect(after[guardOf(after, 'O2') as 'D1'].switchedThisStep).toBe(true);
  });

  it('stable : même attaque deux étapes de suite → mêmes duels', () => {
    const cutToCorner: Off = { ...SET, O2: { x: 540, y: 110 }, O1: { x: 170, y: 320 } };
    const state = zoneState('zone-matchup', [
      { off: SET, carrier: 'O3' },
      { off: cutToCorner, carrier: 'O3' },
      { off: cutToCorner, carrier: 'O3' },
    ]);
    expect(computeDefenseTargets(state, 2).matchupsApplied).toEqual(computeDefenseTargets(state, 1).matchupsApplied);
  });

  it('côté faible : le défenseur s’enfonce vers la raquette, côté ballon il reste proche', () => {
    const state = zoneState('zone-matchup', [{ off: SET, carrier: 'O3' }]);
    const res = computeDefenseTargets(state, 0).positions;
    const hoop = getDefenseHoop(state);
    const guard = (att: AttackerId) => Object.values(res).find((p) => p.matchedTo === att)!;
    // O2 (aile gauche) est côté faible : son défenseur est plus loin de lui
    // que le défenseur de O5 (poste bas côté ballon) du sien.
    expect(distance(guard('O2'), SET.O2)).toBeGreaterThan(distance(guard('O5'), SET.O5));
    // Et plus près du panier que son homme.
    expect(distance(guard('O2'), hoop)).toBeLessThan(distance(SET.O2, hoop));
  });

  it('affectation optimale : coût total minimal', () => {
    const m = optimalAssignment(['D1', 'D2'], ['O1', 'O2'], (d, o) =>
      (d === 'D1' && o === 'O2') || (d === 'D2' && o === 'O1') ? 1 : 10);
    expect(m).toEqual({ D1: 'O2', D2: 'O1' });
  });

  it('pur : n’écrit rien dans l’état, deux appels identiques', () => {
    const state = zoneState('zone-matchup', [{ off: SET, carrier: 'O1' }, { off: SET, carrier: 'O2' }]);
    const snapshot = structuredClone(state);
    const a = computeDefenseTargets(state, 1);
    expect(computeDefenseTargets(state, 1)).toEqual(a);
    expect(state).toEqual(snapshot);
  });
});

describe('zone 3-2 — rotation sur ballon au coin', () => {
  const corner: Off = { ...SET, O3: { x: 540, y: 110 }, O5: { x: 400, y: 140 } };

  it('détection du coin', () => {
    const hoop = getDefenseHoop(makeInitialState());
    expect(isCornerBall({ x: 540, y: 110 }, hoop)).toBe(true);
    expect(isCornerBall({ x: 490, y: 280 }, hoop)).toBe(false);
    expect(isCornerBall({ x: 320, y: 110 }, hoop)).toBe(false);
  });

  it('le bas côté ballon sort, l’aile redescend au poste bas, le bas faible devant le cercle', () => {
    const state = zoneState('zone-3-2', [{ off: corner, carrier: 'O3' }]);
    const res = computeDefenseTargets(state, 0).positions;
    const hoop = getDefenseHoop(state);
    // Layout 3-2 : D5 = bas droit, D3 = aile droite, D4 = bas gauche, D1 = pointe, D2 = aile gauche.
    expect(res.D5.matchedTo).toBe('O3');
    expect(res.D5.isCarrierDefender).toBe(true);
    expect(distance(res.D5, corner.O3)).toBeLessThan(60);
    expect(res.D3.x).toBeCloseTo(370, 0);
    expect(res.D3.y).toBeCloseTo(130, 0);
    expect(res.D3.matchedTo).toBe('O5');
    expect(distance(res.D4, hoop)).toBeLessThan(60);
    // La pointe descend au coude côté ballon.
    expect(res.D1.x).toBeGreaterThan(hoop.x);
    // Aucun attaquant rattaché deux fois hors porteur.
    const off = Object.values(res).filter((p) => !p.isCarrierDefender).map((p) => p.matchedTo)
      .filter((m) => m !== 'O3');
    expect(new Set(off).size).toBe(off.length);
  });

  it('miroir : ballon au coin gauche', () => {
    const left: Off = { ...SET, O2: { x: 60, y: 110 }, O4: { x: 200, y: 140 } };
    const res = computeDefenseTargets(zoneState('zone-3-2', [{ off: left, carrier: 'O2' }]), 0).positions;
    expect(res.D4.matchedTo).toBe('O2');
    expect(res.D2.x).toBeCloseTo(230, 0);
    expect(res.D2.y).toBeCloseTo(130, 0);
  });

  it('réglage « l’aile sort » : comportement du moteur générique', () => {
    const res = computeDefenseTargets(zoneState('zone-3-2', [{ off: corner, carrier: 'O3' }], { cornerRotation: 'wing' }), 0).positions;
    expect(distance(res.D3, corner.O3)).toBeLessThan(distance(res.D5, corner.O3));
  });

  it('hors coin : pas de rotation spéciale', () => {
    const wing = computeDefenseTargets(zoneState('zone-3-2', [{ off: SET, carrier: 'O3' }]), 0).positions;
    const wingOpt = computeDefenseTargets(zoneState('zone-3-2', [{ off: SET, carrier: 'O3' }], { cornerRotation: 'wing' }), 0).positions;
    expect(wing).toEqual(wingOpt);
  });
});
