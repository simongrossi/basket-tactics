// Zone matchup (un défenseur par attaquant, passage de relais) et zone 3-2
// (rotation sur ballon au coin).

import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { computeDefenseTargets, getDefenseHoop } from '@/lib/logic/engine';
import { distance } from '@/lib/logic/geometry';
import type { AppState, AttackerId, AttackerPositions, ZoneType } from '@/lib/types';
import { optimalAssignment } from '../matchupZone';
import { isCornerBall, zone32Situation } from '../zone32Rotation';

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

  it('le réglage « ballon au coin » n’affecte que le coin', () => {
    const wing = computeDefenseTargets(zoneState('zone-3-2', [{ off: SET, carrier: 'O3' }]), 0).positions;
    const wingOpt = computeDefenseTargets(zoneState('zone-3-2', [{ off: SET, carrier: 'O3' }], { cornerRotation: 'wing' }), 0).positions;
    expect(wing).toEqual(wingOpt);
  });

  it('situations reconnues', () => {
    const hoop = getDefenseHoop(makeInitialState());
    expect(zone32Situation({ x: 540, y: 110 }, hoop)).toBe('corner');
    expect(zone32Situation({ x: 300, y: 230 }, hoop)).toBe('high-post');
    expect(zone32Situation({ x: 490, y: 280 }, hoop)).toBe('wing');
    expect(zone32Situation({ x: 300, y: 380 }, hoop)).toBeNull();
  });
});

describe('zone 3-2 — poste haut', () => {
  // O4 reçoit au poste haut, O5 au poste bas droit.
  const highPost: Off = { ...SET, O4: { x: 300, y: 230 }, O5: { x: 430, y: 100 } };

  it('on pince : le bas libre monte, la pointe dans le dos, les ailes resserrent', () => {
    const state = zoneState('zone-3-2', [{ off: highPost, carrier: 'O4' }]);
    const res = computeDefenseTargets(state, 0).positions;
    const hoop = getDefenseHoop(state);
    // D4 (bas gauche, personne à son bloc) monte au contact, côté panier.
    expect(res.D4.isCarrierDefender).toBe(true);
    expect(distance(res.D4, hoop)).toBeLessThan(distance(highPost.O4, hoop));
    // D5 garde O5 au poste bas.
    expect(res.D5.matchedTo).toBe('O5');
    // La pointe est dans le dos du poste haut (plus loin du panier que lui).
    expect(distance(res.D1, hoop)).toBeGreaterThan(distance(highPost.O4, hoop));
    expect(distance(res.D1, highPost.O4)).toBeLessThan(45);
    // Les ailes se sont rapprochées de l'axe (par rapport à leur place 110 / 490).
    expect(res.D2.x).toBeGreaterThan(136);
    expect(res.D3.x).toBeLessThan(464);
  });

  it('sans joueur au poste bas, l’autre bas tient le cercle', () => {
    const noLow: Off = { ...highPost, O5: { x: 560, y: 300 } };
    const state = zoneState('zone-3-2', [{ off: noLow, carrier: 'O4' }]);
    const res = computeDefenseTargets(state, 0).positions;
    const hoop = getDefenseHoop(state);
    const rim = [res.D4, res.D5].filter((p) => !p.isCarrierDefender)[0];
    expect(distance(rim, hoop)).toBeLessThan(60);
  });
});

describe('zone 3-2 — aile et renversement', () => {
  it('ballon à l’aile : l’aile sort, la pointe ferme l’intervalle, le bas tient le poste bas', () => {
    const state = zoneState('zone-3-2', [{ off: SET, carrier: 'O3' }]);
    const res = computeDefenseTargets(state, 0).positions;
    const hoop = getDefenseHoop(state);
    expect(res.D3.isCarrierDefender).toBe(true);
    expect(distance(res.D3, SET.O3)).toBeLessThan(45);
    // Pointe côté ballon, entre le porteur et l'axe.
    expect(res.D1.x).toBeGreaterThan(hoop.x);
    expect(res.D1.x).toBeLessThan(SET.O3.x);
    // Bas côté ballon sur son poste bas (O5).
    expect(res.D5.matchedTo).toBe('O5');
    // Aile faible enfoncée : plus près de l'axe que sa place.
    expect(res.D2.x).toBeGreaterThan(136);
  });

  it('renversement : les rôles basculent en miroir sur l’autre aile', () => {
    const state = zoneState('zone-3-2', [{ off: SET, carrier: 'O3' }, { off: SET, carrier: 'O2' }]);
    const right = computeDefenseTargets(state, 0).positions;
    const left = computeDefenseTargets(state, 1).positions;
    const hoop = getDefenseHoop(state);
    // Ballon à gauche : D2 sort, D3 s'enfonce, la pointe passe côté gauche.
    expect(left.D2.isCarrierDefender).toBe(true);
    expect(left.D1.x).toBeLessThan(hoop.x);
    // Positions symétriques de part et d'autre de l'axe.
    expect(left.D3.x - hoop.x).toBeCloseTo(-(right.D2.x - hoop.x), 0);
    expect(left.D3.y).toBeCloseTo(right.D2.y, 0);
    expect(left.D1.x - hoop.x).toBeCloseTo(-(right.D1.x - hoop.x), 0);
  });

  it('ballon au sommet : pas de règle dédiée (moteur de zone générique)', () => {
    const top = computeDefenseTargets(zoneState('zone-3-2', [{ off: SET, carrier: 'O1' }]), 0).positions;
    expect(top.D1.matchedTo).toBe('O1');
  });
});

describe('zone 2-3 — règles par situation', () => {
  // Layout 2-3 : D1 garde gauche, D2 garde droit, D4 aile basse gauche,
  // D3 aile basse droite, D5 pivot.
  it('aile : le garde côté ballon sort, l’aile basse couvre le coin, le pivot tient le bloc', () => {
    const state = zoneState('zone-2-3', [{ off: SET, carrier: 'O3' }]);
    const res = computeDefenseTargets(state, 0).positions;
    const hoop = getDefenseHoop(state);
    expect(res.D2.isCarrierDefender).toBe(true);
    expect(distance(res.D2, SET.O3)).toBeLessThan(45);
    // Aile basse côté ballon entre le bloc et le coin.
    expect(res.D3.x).toBeGreaterThan(420);
    expect(Math.abs(res.D3.y - hoop.y)).toBeLessThan(100);
    // Pivot sur le bloc côté ballon (O5).
    expect(res.D5.matchedTo).toBe('O5');
    // Aile basse opposée au milieu de la raquette.
    expect(Math.abs(res.D4.x - hoop.x)).toBeLessThan(40);
  });

  it('coin : l’aile basse sort, l’aile opposée devant le cercle, le garde côté ballon au coude', () => {
    const corner: Off = { ...SET, O3: { x: 540, y: 110 }, O5: { x: 400, y: 140 } };
    const state = zoneState('zone-2-3', [{ off: corner, carrier: 'O3' }]);
    const res = computeDefenseTargets(state, 0).positions;
    const hoop = getDefenseHoop(state);
    expect(res.D3.isCarrierDefender).toBe(true);
    expect(distance(res.D3, corner.O3)).toBeLessThan(60);
    expect(distance(res.D4, hoop)).toBeLessThan(60);
    expect(res.D5.matchedTo).toBe('O5');
    // Garde côté ballon descendu au coude (sous sa place de 270).
    expect(res.D2.y).toBeLessThan(270);
    expect(res.D2.x).toBeGreaterThan(hoop.x);
  });

  it('poste haut : le pivot monte au contact, les ailes basses ferment les blocs, les gardes dans le dos', () => {
    const hp: Off = { ...SET, O4: { x: 300, y: 230 }, O5: { x: 430, y: 100 } };
    const state = zoneState('zone-2-3', [{ off: hp, carrier: 'O4' }]);
    const res = computeDefenseTargets(state, 0).positions;
    const hoop = getDefenseHoop(state);
    expect(res.D5.isCarrierDefender).toBe(true);
    expect(distance(res.D5, hoop)).toBeLessThan(distance(hp.O4, hoop));
    // Les deux ailes basses restent sur les blocs, de part et d'autre.
    expect(Math.abs(res.D3.y - hoop.y)).toBeLessThan(80);
    expect(Math.abs(res.D4.y - hoop.y)).toBeLessThan(80);
    expect(Math.sign(res.D3.x - hoop.x)).not.toBe(Math.sign(res.D4.x - hoop.x));
    // Gardes plus loin du panier que le porteur (dans son dos).
    expect(distance(res.D1, hoop)).toBeGreaterThan(distance(hp.O4, hoop));
    expect(distance(res.D2, hoop)).toBeGreaterThan(distance(hp.O4, hoop));
  });

  it('sommet : moteur générique', () => {
    const top = computeDefenseTargets(zoneState('zone-2-3', [{ off: SET, carrier: 'O1' }]), 0).positions;
    expect(Object.values(top).filter((p) => p.isCarrierDefender).length).toBeGreaterThanOrEqual(1);
  });
});

describe('zone 1-3-1 — règles par situation', () => {
  // Layout 1-3-1 : D1 pointe, D2 milieu gauche, D3 milieu centre, D4 milieu
  // droit, D5 défenseur de la ligne de fond.
  it('coin : le défenseur de la ligne de fond sort, l’aile ferme le poste bas, la pointe au coude', () => {
    const corner: Off = { ...SET, O3: { x: 540, y: 110 }, O5: { x: 400, y: 140 } };
    const state = zoneState('zone-1-3-1', [{ off: corner, carrier: 'O3' }]);
    const res = computeDefenseTargets(state, 0).positions;
    const hoop = getDefenseHoop(state);
    expect(res.D5.isCarrierDefender).toBe(true);
    expect(distance(res.D5, corner.O3)).toBeLessThan(60);
    expect(res.D4.matchedTo).toBe('O5');
    expect(Math.abs(res.D4.y - hoop.y)).toBeLessThan(100);
    expect(res.D1.x).toBeGreaterThan(hoop.x);
    expect(Math.abs(res.D1.y - hoop.y)).toBeLessThan(200);
  });

  it('aile : piège léger — l’aile sort, la pointe ferme côté milieu ; le milieu ferme le poste haut', () => {
    const state = zoneState('zone-1-3-1', [{ off: SET, carrier: 'O3' }]);
    const res = computeDefenseTargets(state, 0).positions;
    const hoop = getDefenseHoop(state);
    expect(res.D4.isCarrierDefender).toBe(true);
    expect(distance(res.D4, SET.O3)).toBeLessThan(45);
    // La pointe au contact du porteur, côté axe.
    expect(distance(res.D1, SET.O3)).toBeLessThan(80);
    expect(res.D1.x).toBeLessThan(SET.O3.x);
    // Le milieu reste au poste haut côté ballon.
    expect(Math.abs(res.D3.x - hoop.x)).toBeLessThan(60);
    expect(Math.abs(res.D3.y - hoop.y)).toBeGreaterThan(130);
    // Le défenseur de la ligne de fond couvre le bloc côté ballon.
    expect(res.D5.x).toBeGreaterThan(hoop.x);
  });

  it('miroir : ballon à l’aile gauche', () => {
    const res = computeDefenseTargets(zoneState('zone-1-3-1', [{ off: SET, carrier: 'O2' }]), 0).positions;
    expect(res.D2.isCarrierDefender).toBe(true);
    expect(res.D1.x).toBeGreaterThan(SET.O2.x);
  });
});
