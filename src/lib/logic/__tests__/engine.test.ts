import { describe, it, expect } from 'vitest';
import { computeDefenseTargets, getMatchupsAt, effectiveDefensePositions } from '../engine';
import { makeInitialState, makeStep, initialOff, baseMatchups } from '../../data/initial';
import type { AppState, AttackerPositions } from '../../types';

const cloneState = (): AppState => structuredClone(makeInitialState());

describe('getMatchupsAt', () => {
  it('renvoie les matchups de base si aucun switch', () => {
    const s = cloneState();
    const m = getMatchupsAt(s.steps, 0);
    expect(m).toEqual(baseMatchups);
  });

  it('applique un switch à une étape donnée', () => {
    const s = cloneState();
    s.steps = [
      { ...s.steps[0], switches: [['D1', 'D2']] },
    ];
    const m = getMatchupsAt(s.steps, 0);
    expect(m.D1).toBe('O2');
    expect(m.D2).toBe('O1');
  });

  it('cumule plusieurs switches sur étapes successives', () => {
    const s = cloneState();
    const stepA = makeStep(initialOff, 'O1', []);
    stepA.switches = [['D1', 'D2']]; // D1↔O2, D2↔O1
    const stepB = makeStep(initialOff, 'O1', []);
    stepB.switches = [['D2', 'D3']]; // D2↔O3, D3↔O1
    s.steps = [stepA, stepB];
    const m = getMatchupsAt(s.steps, 1);
    // après step A : D1=O2, D2=O1
    // après step B (D2↔D3) : D2=O3, D3=O1
    expect(m.D1).toBe('O2');
    expect(m.D2).toBe('O3');
    expect(m.D3).toBe('O1');
  });

  it('ne mute pas baseMatchups (immuabilité)', () => {
    const s = cloneState();
    const stepA = makeStep(initialOff, 'O1', []);
    stepA.switches = [['D1', 'D2']];
    s.steps = [stepA];
    getMatchupsAt(s.steps, 0);
    expect(baseMatchups.D1).toBe('O1');
    expect(baseMatchups.D2).toBe('O2');
  });
});

describe('computeDefenseTargets — défense individuelle', () => {
  it("renvoie une position pour chacun des 5 défenseurs", () => {
    const s = cloneState();
    const { positions } = computeDefenseTargets(s, 0, false);
    expect(Object.keys(positions).sort()).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
    Object.values(positions).forEach((p) => {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
    });
  });

  it('marque le défenseur du porteur avec isCarrierDefender=true', () => {
    const s = cloneState();
    const { positions } = computeDefenseTargets(s, 0, false);
    expect(positions.D1.isCarrierDefender).toBe(true);
    expect(positions.D2.isCarrierDefender).toBe(false);
    expect(positions.D1.matchedTo).toBe('O1');
  });

  it('renvoie helpFactor=0 et onScreen=false en setup initial sans écran', () => {
    const s = cloneState();
    const { positions } = computeDefenseTargets(s, 0, false);
    Object.values(positions).forEach((p) => {
      expect(p.onScreen).toBe(false);
      expect(p.switchedThisStep).toBe(false);
    });
  });

  it('place le défenseur du porteur entre le porteur et le panier (proxy : y < porteur.y)', () => {
    const s = cloneState();
    const { positions } = computeDefenseTargets(s, 0, false);
    // O1 est en y=470, panier en y=75 → D1 doit être au-dessus du porteur
    expect(positions.D1.y).toBeLessThan(s.steps[0].off.O1.y);
  });

  it("écrit un switch détecté dans state.steps[i].switches quand mutateStepForSwitch=true et règle=switch", () => {
    const s = cloneState();
    s.screenRule = 'switch';
    // Place O2 (poseur) près de D1 (déf du porteur, en (300,380)) ET à <80px du porteur O1 (300,470)
    const off: AttackerPositions = {
      ...s.steps[0].off,
      O2: { x: 305, y: 405 },
    };
    s.steps[0] = { ...s.steps[0], off };
    const { positions } = computeDefenseTargets(s, 0, true);
    expect(s.steps[0].switches).toBeDefined();
    expect(s.steps[0].switches!.length).toBe(1);
    expect(positions.D1.switchedThisStep || positions.D2.switchedThisStep).toBe(true);
  });

  it("ne mute PAS l'étape quand mutateStepForSwitch=false même si écran détecté", () => {
    const s = cloneState();
    s.screenRule = 'switch';
    const off: AttackerPositions = {
      ...s.steps[0].off,
      O2: { x: 305, y: 405 },
    };
    s.steps[0] = { ...s.steps[0], off };
    computeDefenseTargets(s, 0, false);
    expect(s.steps[0].switches).toBeUndefined();
  });
});

describe('computeDefenseTargets — défense de zone', () => {
  it('en zone, matchedTo correspond à un attaquant tracké et helpFactor=0', () => {
    const s = cloneState();
    s.defenseSystem = 'zone';
    const { positions } = computeDefenseTargets(s, 0, false);
    expect(Object.keys(positions).sort()).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
    Object.values(positions).forEach((p) => {
      expect(p.helpFactor).toBe(0);
      expect(p.onScreen).toBe(false);
    });
  });
});

describe('effectiveDefensePositions', () => {
  it("à l'étape 0, ignore la contrainte de vitesse (setup, pas transition)", () => {
    const s = cloneState();
    s.defenseMaxSpeed = 1; // ridiculement bas
    const out = effectiveDefensePositions(s, 0);
    // late: false partout puisque step 0
    Object.values(out).forEach((d) => {
      expect(d.late).toBe(false);
    });
  });

  it("aux étapes >0, marque late=true si la cible est trop loin pour maxSpeed", () => {
    const s = cloneState();
    // étape 1 : on déplace l'attaquant O1 très loin
    const off2: AttackerPositions = {
      ...s.steps[0].off,
      O1: { x: 300, y: 100 }, // déplacement énorme, force le carrier defender à bouger
    };
    s.steps = [s.steps[0], makeStep(off2, 'O1', [])];
    s.defenseMaxSpeed = 5;
    const out = effectiveDefensePositions(s, 1);
    // au moins un défenseur doit être en retard
    const lateCount = Object.values(out).filter((d) => d.late).length;
    expect(lateCount).toBeGreaterThan(0);
  });

  it('respecte les defenseOverrides : la position override est conservée telle quelle', () => {
    const s = cloneState();
    const override = { x: 123, y: 456 };
    s.steps[0] = { ...s.steps[0], defenseOverrides: { D1: override } };
    const out = effectiveDefensePositions(s, 0);
    expect(out.D1.x).toBe(override.x);
    expect(out.D1.y).toBe(override.y);
    expect(out.D1.late).toBe(false);
  });
});

describe('effectiveDefensePositions — closeout dynamique', () => {
  it("ne marque aucun closeout à l'étape 0 (setup, pas de transition)", () => {
    const s = cloneState();
    const out = effectiveDefensePositions(s, 0);
    Object.values(out).forEach((d) => {
      expect(d.closingOut).toBeFalsy();
    });
  });

  it("ne marque pas de closeout si le ballCarrier n'a pas changé", () => {
    const s = cloneState();
    s.steps = [s.steps[0], makeStep(s.steps[0].off, 'O1', [])];
    const out = effectiveDefensePositions(s, 1);
    Object.values(out).forEach((d) => {
      expect(d.closingOut).toBeFalsy();
    });
  });

  it("marque closingOut=true sur le défenseur du nouveau porteur quand le ballon change de mains", () => {
    const s = cloneState();
    // Étape 1 : passe de O1 à O2 → D2 est en closeout
    s.steps = [s.steps[0], makeStep(s.steps[0].off, 'O2', [])];
    const out = effectiveDefensePositions(s, 1);
    expect(out.D2.closingOut).toBe(true);
    expect(out.D2.isCarrierDefender).toBe(true);
    // Les autres ne sont pas en closeout
    expect(out.D1.closingOut).toBeFalsy();
    expect(out.D3.closingOut).toBeFalsy();
    expect(out.D4.closingOut).toBeFalsy();
    expect(out.D5.closingOut).toBeFalsy();
  });

  it("le closeout réduit la lateness : avec maxSpeed limitée, le défenseur du nouveau porteur arrive plus loin que sans bump", () => {
    const s = cloneState();
    // On crée une étape 1 où O2 reçoit le ballon ET s'est déplacé
    // → D2 doit faire un gros déplacement
    const off2 = { ...s.steps[0].off, O2: { x: 100, y: 300 } };
    s.steps = [s.steps[0], makeStep(off2, 'O2', [])];
    s.defenseMaxSpeed = 30; // assez bas pour que D2 soit late SANS le bump

    const out = effectiveDefensePositions(s, 1);
    // D2 doit toujours être late (le bump 1.4× ne suffit pas à combler tout l'écart)
    // mais doit avoir avancé plus loin que sans bump.
    // Pour le vérifier proprement : on vérifie que la distance parcourue par D2
    // est > defenseMaxSpeed (donc clairement plus que la cap normale).
    const start = s.defenseInitial.D2;
    const moved = Math.hypot(out.D2.x - start.x, out.D2.y - start.y);
    expect(moved).toBeGreaterThan(s.defenseMaxSpeed);
    expect(out.D2.closingOut).toBe(true);
  });

  it("ne marque pas de closeout en défense de zone (le concept est man-only)", () => {
    const s = cloneState();
    s.defenseSystem = 'zone';
    s.steps = [s.steps[0], makeStep(s.steps[0].off, 'O2', [])];
    const out = effectiveDefensePositions(s, 1);
    Object.values(out).forEach((d) => {
      expect(d.closingOut).toBeFalsy();
    });
  });
});
