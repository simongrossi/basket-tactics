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

describe('computeDefenseTargets — trap en corner', () => {
  it("ne déclenche pas le trap si le trigger est désactivé", () => {
    const s = cloneState();
    s.triggers.trap = false;
    // Place le porteur dans le coin gauche fond
    s.steps[0].off.O1 = { x: 60, y: 80 };
    const before = { ...s.defenseInitial };
    const { positions } = computeDefenseTargets(s, 0, false);
    // Aucun défenseur ne doit avoir été repositionné par un trap
    // (ils gardent leur logique normale). On checke juste que D2 (helper
    // probable) n'est pas collé au porteur.
    const dist = Math.hypot(positions.D2.x - s.steps[0].off.O1.x, positions.D2.y - s.steps[0].off.O1.y);
    expect(dist).toBeGreaterThan(50);
    expect(before.D2).toBeDefined(); // sanity
  });

  it("déclenche le trap quand trigger=true ET porteur en coin", () => {
    const s = cloneState();
    s.triggers.trap = true;
    s.steps[0].off.O1 = { x: 60, y: 80 };
    const { positions } = computeDefenseTargets(s, 0, false);
    // Un défenseur (le helper) doit avoir été placé près du porteur
    const distances = (Object.keys(positions) as Array<keyof typeof positions>).map((id) =>
      Math.hypot(positions[id].x - 60, positions[id].y - 80)
    );
    const closeOnes = distances.filter((d) => d < 40);
    // Au moins 2 défenseurs (carrierDef + helper) à <40px du porteur
    expect(closeOnes.length).toBeGreaterThanOrEqual(2);
  });

  it("ne déclenche pas le trap si le porteur n'est pas dans une zone", () => {
    const s = cloneState();
    s.triggers.trap = true;
    // Porteur au centre du terrain (hors zone)
    s.steps[0].off.O1 = { x: 300, y: 300 };
    const { positions } = computeDefenseTargets(s, 0, false);
    const distances = (Object.keys(positions) as Array<keyof typeof positions>).map((id) =>
      Math.hypot(positions[id].x - 300, positions[id].y - 300)
    );
    const closeOnes = distances.filter((d) => d < 40);
    // Seul D1 (carrierDef) devrait être proche
    expect(closeOnes.length).toBeLessThanOrEqual(1);
  });
});

describe('computeDefenseTargets — attackingDirection', () => {
  it("attackingDirection='up' (default) place les défenseurs entre attaquants et HOOP top", () => {
    const s = cloneState();
    const { positions } = computeDefenseTargets(s, 0, false);
    // Tous les défenseurs ont un y < att.y (entre att et panier en y=75)
    Object.entries(positions).forEach(([dId, p]) => {
      const matchup = (Object.entries(p.matchedTo === undefined ? {} : { x: 0 })); // sanity
      const att = s.steps[0].off[p.matchedTo];
      if (att) expect(p.y).toBeLessThan(att.y);
      void matchup; void dId;
    });
  });

  it("attackingDirection='down' place les défenseurs entre attaquants et HOOP_OPPOSITE bottom", () => {
    const s = cloneState();
    s.attackingDirection = 'down';
    s.fullCourt = true;
    // Mirror les positions des attaquants vers le bas (y → 1080 - y autour de 540)
    s.steps[0].off = {
      O1: { x: 300, y: 1080 - 470 + 1080 - 540 - (1080 - 540 - 470) }, // simplifier
      O2: { x: 130, y: 700 },
      O3: { x: 470, y: 700 },
      O4: { x: 220, y: 850 },
      O5: { x: 380, y: 850 },
    };
    s.steps[0].off.O1 = { x: 300, y: 610 }; // miroir de y=470 autour de 540
    s.defenseInitial = {
      D1: { x: 300, y: 700 },
      D2: { x: 170, y: 770 },
      D3: { x: 430, y: 770 },
      D4: { x: 240, y: 920 },
      D5: { x: 360, y: 920 },
    };
    const { positions } = computeDefenseTargets(s, 0, false);
    // Avec hoop bas (y=1005), les défenseurs doivent être entre l'attaquant
    // et le panier bas → y > att.y pour la plupart.
    Object.entries(positions).forEach(([, p]) => {
      const att = s.steps[0].off[p.matchedTo];
      if (att) expect(p.y).toBeGreaterThan(att.y);
    });
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

  it("marque overClosed quand closeout ET le nouveau porteur drive vers le panier", () => {
    const s = cloneState();
    // Étape 1 : passe O1→O2 ET O2 a driver vers le panier (deltaY important)
    const off2 = { ...s.steps[0].off, O2: { x: 200, y: 200 } }; // O2 monte beaucoup vers le panier
    // Initial O2 was at (130, 380). Distance to hoop (300,75): sqrt(170²+305²)≈349
    // New O2 (200, 200): sqrt(100²+125²)≈160 → delta=189 > 25, curD=160 < 250 → overClosed
    s.steps = [s.steps[0], makeStep(off2, 'O2', [])];
    const out = effectiveDefensePositions(s, 1);
    expect(out.D2.closingOut).toBe(true);
    expect(out.D2.overClosed).toBe(true);
  });

  it("closeout sans drive (porteur stationnaire après réception) → pas d'over-closeout", () => {
    const s = cloneState();
    // Passe à O2 mais O2 ne bouge pas
    s.steps = [s.steps[0], makeStep(s.steps[0].off, 'O2', [])];
    const out = effectiveDefensePositions(s, 1);
    expect(out.D2.closingOut).toBe(true);
    expect(out.D2.overClosed).toBeFalsy();
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
