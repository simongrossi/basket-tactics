import { describe, it, expect } from 'vitest';
import { computeHelpTarget } from '../help';
import type { DefenderRule, DetectedTriggers } from '../../types';

const HOOP = { x: 300, y: 75 };

const noTriggers: DetectedTriggers = { drive: false, post: false, paint: false, any: false };
const driveTriggers: DetectedTriggers = { drive: true, post: false, paint: false, any: true };

const ruleSag = (helpPct: number, priority: DefenderRule['priority'] = 'man'): DefenderRule => ({
  helpPct,
  priority,
  vsCarrier: 'coller',
});

describe('computeHelpTarget — sag baseline weak-side (régression)', () => {
  it('un défenseur weak-side reçoit un sag baseline même sans trigger', () => {
    // Ballon à droite (x=400), attaquant weak-side à gauche (x=200)
    const carrier = { x: 400, y: 470 };
    const att = { x: 200, y: 380 };
    const manPos = { x: 200, y: 300 };
    const r = computeHelpTarget(manPos, ruleSag(50), noTriggers, carrier, att, 1);
    expect(r.helpFactor).toBeGreaterThan(0);
    // La cible se rapproche du panier (sag vers la raquette)
    expect(r.target.x).not.toBe(manPos.x);
  });
});

describe('computeHelpTarget — strong-side denial', () => {
  // Tous les tests ci-dessous : ballon strong-side droite, attaquant strong-side droite
  const carrier = { x: 400, y: 470 };

  it("un défenseur strong-side proche du ballon est tiré vers la ligne de passe (denial)", () => {
    const att = { x: 470, y: 380 }; // ~108px du porteur → < 250 ✓
    const manPos = { x: 470, y: 300 }; // entre att et panier
    const r = computeHelpTarget(manPos, ruleSag(20), noTriggers, carrier, att, 1);
    expect(r.helpFactor).toBeGreaterThan(0);
    expect(r.denying).toBe(true);
    // La cible doit s'être rapprochée de la ligne carrier ↔ att.
    // Distance(target, segment) < distance(manPos, segment)
    const segDist = (p: { x: number; y: number }) => {
      const ax = att.x - carrier.x;
      const ay = att.y - carrier.y;
      const lenSq = ax * ax + ay * ay;
      const t = Math.max(0, Math.min(1, ((p.x - carrier.x) * ax + (p.y - carrier.y) * ay) / lenSq));
      const px = carrier.x + ax * t;
      const py = carrier.y + ay * t;
      return Math.hypot(p.x - px, p.y - py);
    };
    expect(segDist(r.target)).toBeLessThan(segDist(manPos));
  });

  it("le denial est plus fort quand l'attaquant est plus près du ballon", () => {
    // Cas A : attaquant proche (50px du porteur)
    const attClose = { x: 410, y: 425 };
    const manClose = { x: 410, y: 350 };
    const rClose = computeHelpTarget(manClose, ruleSag(20), noTriggers, carrier, attClose, 1);

    // Cas B : attaquant loin mais < 250 (~200px)
    const attFar = { x: 420, y: 270 };
    const manFar = { x: 420, y: 195 };
    const rFar = computeHelpTarget(manFar, ruleSag(20), noTriggers, carrier, attFar, 1);

    expect(rClose.helpFactor).toBeGreaterThan(rFar.helpFactor);
  });

  it("pas de denial si l'attaquant est à plus de 250px du ballon", () => {
    const att = { x: 580, y: 100 };
    const manPos = { x: 580, y: 80 };
    const r = computeHelpTarget(manPos, ruleSag(20), noTriggers, carrier, att, 1);
    expect(r.helpFactor).toBe(0);
    expect(r.target).toEqual(manPos);
  });

  it("pas de denial automatique pour un défenseur priority='paint' (il garde la raquette)", () => {
    const att = { x: 470, y: 380 };
    const manPos = { x: 470, y: 300 };
    const r = computeHelpTarget(manPos, ruleSag(20, 'paint'), noTriggers, carrier, att, 1);
    expect(r.helpFactor).toBe(0);
    expect(r.target).toEqual(manPos);
  });

  it("pas de denial quand un trigger est actif (l'aide prime sur le denial)", () => {
    const att = { x: 470, y: 380 };
    const manPos = { x: 470, y: 300 };
    const r = computeHelpTarget(manPos, ruleSag(50), driveTriggers, carrier, att, 1);
    // Avec trigger : on bascule sur la branche d'aide normale (priority=man → aim=manPos
    // → pas de mouvement non plus, mais via un autre code path).
    // Le test critique : on n'a PAS pris la branche denial.
    // Indirect : helpFactor = (helpPct/100) * sideFactor où sideFactor=0.35 pour strong-side
    expect(r.helpFactor).toBeCloseTo(0.5 * 0.35, 2);
  });

  it("denyAggressiveness=0 désactive complètement le denial automatique", () => {
    const att = { x: 470, y: 380 };
    const manPos = { x: 470, y: 300 };
    const r = computeHelpTarget(manPos, ruleSag(20), noTriggers, carrier, att, 1, undefined, undefined, 0);
    expect(r.helpFactor).toBe(0);
    expect(r.denying).toBeFalsy();
    expect(r.target).toEqual(manPos);
  });

  it("denyAggressiveness=0.7 produit un pull plus fort que la valeur défaut 0.45", () => {
    const att = { x: 470, y: 380 };
    const manPos = { x: 470, y: 300 };
    const rDefault = computeHelpTarget(manPos, ruleSag(20), noTriggers, carrier, att, 1, undefined, undefined, 0.45);
    const rStrong = computeHelpTarget(manPos, ruleSag(20), noTriggers, carrier, att, 1, undefined, undefined, 0.7);
    expect(rStrong.helpFactor).toBeGreaterThan(rDefault.helpFactor);
  });

  it("pas de denial pour un défenseur weak-side (l'attaquant est de l'autre côté)", () => {
    const attWeak = { x: 130, y: 380 };
    const manPos = { x: 130, y: 300 };
    // ballSide=1 (droite), myAttSide=-1 (gauche) → weak-side
    const r = computeHelpTarget(manPos, ruleSag(20), noTriggers, carrier, attWeak, 1);
    // weak-side prend la branche sag baseline, pas la branche denial
    // helpFactor doit être (helpPct/100)*0.5 = 0.1
    expect(r.helpFactor).toBeCloseTo(0.1, 2);
    expect(r.denying).toBeFalsy();
  });
});

describe('computeHelpTarget — rim protection sur drive (priority paint)', () => {
  // Scénario : porteur drive de top of arc vers la raquette, mais n'est pas
  // encore arrivé. Le pivot adverse (O5) campe en strong high. Sans fix,
  // le helper paint vise O5 (post threat) et reste passif sur le drive.
  // Avec fix, l'aim glisse vers la ligne porteur→panier (drop zone) pour
  // que le pivot step-up sur la trajectoire avant le rim.
  const ruleP: DefenderRule = { helpPct: 75, priority: 'paint', vsCarrier: 'bumper' };
  const carrier = { x: 350, y: 290 }; // entre arc et raquette, drive en cours
  const off = {
    O1: carrier,
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 380, y: 230 }, // strong high, dans le seuil 120 d'un block
  };
  // D5 placé en stance manTarget classique sur O5 (~entre O5 et panier)
  const manPos = { x: 362, y: 194 };
  const att = off.O5;

  it("helpAim DOIT être sur la ligne porteur→panier (rim protection)", () => {
    const r = computeHelpTarget(manPos, ruleP, driveTriggers, carrier, att, 1, off, HOOP);
    expect(r.aim).toBeDefined();
    // Distance perpendiculaire helpAim → ligne carrier→hoop
    const ax = HOOP.x - carrier.x;
    const ay = HOOP.y - carrier.y;
    const lenSq = ax * ax + ay * ay;
    const t = ((r.aim!.x - carrier.x) * ax + (r.aim!.y - carrier.y) * ay) / lenSq;
    const projX = carrier.x + ax * t;
    const projY = carrier.y + ay * t;
    const distToLine = Math.hypot(r.aim!.x - projX, r.aim!.y - projY);
    expect(distToLine).toBeLessThan(20);
  });

  it("helpAim NE DOIT PAS être collé sur le pivot adverse (O5) sur drive actif", () => {
    const r = computeHelpTarget(manPos, ruleP, driveTriggers, carrier, att, 1, off, HOOP);
    expect(r.aim).toBeDefined();
    const distToO5 = Math.hypot(r.aim!.x - off.O5.x, r.aim!.y - off.O5.y);
    expect(distToO5).toBeGreaterThan(30);
  });

  it("helpAim DOIT être dans la drop zone (50–150 px du panier)", () => {
    const r = computeHelpTarget(manPos, ruleP, driveTriggers, carrier, att, 1, off, HOOP);
    expect(r.aim).toBeDefined();
    const dHoop = Math.hypot(r.aim!.x - HOOP.x, r.aim!.y - HOOP.y);
    expect(dHoop).toBeGreaterThanOrEqual(50);
    expect(dHoop).toBeLessThanOrEqual(150);
  });

  it("sans drive trigger, le helper paint reste sur le post adverse (régression)", () => {
    // Sans trigger, on tombe dans la branche sag/denial, pas dans rim-protect.
    // L'aim peut être différent ou undefined ; ce qui compte : on ne triggere
    // PAS la rim protection alors qu'il n'y a pas de menace de drive.
    const r = computeHelpTarget(manPos, ruleP, noTriggers, carrier, att, 1, off, HOOP);
    if (r.aim) {
      const ax = HOOP.x - carrier.x;
      const ay = HOOP.y - carrier.y;
      const lenSq = ax * ax + ay * ay;
      const t = ((r.aim.x - carrier.x) * ax + (r.aim.y - carrier.y) * ay) / lenSq;
      const projX = carrier.x + ax * t;
      const projY = carrier.y + ay * t;
      const distToLine = Math.hypot(r.aim.x - projX, r.aim.y - projY);
      // Sans drive, on n'exige PAS que aim soit sur la ligne — c'est juste
      // une régression : on s'assure que la nouvelle logique drive ne
      // pollue pas le cas sans trigger.
      // Soit aim est ailleurs (ex. sur O5), soit `kind !== 'active-help'`.
      expect(r.kind === 'active-help' && distToLine < 20).toBe(false);
    }
  });
});

describe('computeHelpTarget — paint helper pondéré par proximité', () => {
  // Avec priority='paint' et un trigger drive, l'aide doit dépendre de la
  // distance du défenseur courant à la cible d'aide. Un défenseur en coin
  // opposé n'est pas censé peser autant qu'un wing strong-side proche.
  const ruleP: DefenderRule = { helpPct: 100, priority: 'paint', vsCarrier: 'coller' };
  const carrier = { x: 400, y: 470 };
  // Attaquant dans la raquette pour activer la sélection de blockTarget
  const offWithPaintThreat = {
    O1: carrier,
    O2: { x: 290, y: 130 }, // proche du low-block (HOOP est y=75)
    O3: { x: 600, y: 0 },
    O4: { x: 0, y: 500 },
    O5: { x: 600, y: 500 },
  };

  it("un défenseur loin de la cible d'aide a un helpFactor réduit vs un défenseur proche", () => {
    // Cas A : défenseur loin (coin opposé bas-gauche)
    const manFar = { x: 50, y: 540 };
    const attFar = { x: 50, y: 540 };
    const rFar = computeHelpTarget(
      manFar, ruleP, driveTriggers, carrier, attFar, 1, offWithPaintThreat, HOOP
    );

    // Cas B : défenseur proche de la raquette (wing weak-side à mi-distance)
    const manNear = { x: 250, y: 200 };
    const attNear = { x: 250, y: 200 };
    const rNear = computeHelpTarget(
      manNear, ruleP, driveTriggers, carrier, attNear, 1, offWithPaintThreat, HOOP
    );

    expect(rNear.helpFactor).toBeGreaterThan(rFar.helpFactor);
  });

  it("le défenseur déjà sur place (dist < 120) garde un helpFactor pleinement utile", () => {
    const manClose = { x: 270, y: 150 }; // ~quasi sur le low-block
    const attClose = { x: 270, y: 150 };
    const r = computeHelpTarget(
      manClose, ruleP, driveTriggers, carrier, attClose, 1, offWithPaintThreat, HOOP
    );
    // helpPct=100, sideFactor=1 (même côté ballon dans ce cas-ci) → helpFactor brut = 1
    // proximité < 120 → coef = 1
    expect(r.helpFactor).toBeGreaterThanOrEqual(0.95);
  });
});

// ============================================================================
// CVT 1.2 — computeHelpForces (forces vectorielles avec arrive amorti)
// ============================================================================

import { computeHelpForces } from '../help';
import { composeTarget } from '../steeringEngine';

describe('computeHelpForces — bit-équivalence en zone loin', () => {
  it('produit un target ≈ legacy.target via composeTarget (defenderRef loin)', () => {
    const carrier = { x: 400, y: 470 };
    const att = { x: 200, y: 380 };
    const manPos = { x: 200, y: 300 };
    const defenderRef = { x: 100, y: 100 }; // loin de manPos et de l'aim
    const legacy = computeHelpTarget(manPos, ruleSag(50), noTriggers, carrier, att, 1);
    const fres = computeHelpForces(defenderRef, manPos, ruleSag(50), noTriggers, carrier, att, 1, undefined);
    const composed = fres.forces.length > 0
      ? composeTarget(defenderRef, fres.forces)
      : fres.target;
    expect(Math.hypot(composed.x - legacy.target.x, composed.y - legacy.target.y)).toBeLessThan(1e-6);
  });

  it("préserve toute la métadonnée legacy (factor/denying/triggered/aim/kind/priority)", () => {
    const carrier = { x: 400, y: 470 };
    const att = { x: 350, y: 400 }; // strong-side (att.x > hoop.x, ballSide=+1)
    const manPos = { x: 350, y: 400 };
    const defenderRef = { x: 0, y: 0 };
    const legacy = computeHelpTarget(manPos, ruleSag(50), noTriggers, carrier, att, 1);
    const fres = computeHelpForces(defenderRef, manPos, ruleSag(50), noTriggers, carrier, att, 1, undefined);
    expect(fres.helpFactor).toBe(legacy.helpFactor);
    expect(fres.denying).toBe(legacy.denying);
    expect(fres.triggered).toBe(legacy.triggered);
    expect(fres.priority).toBe(legacy.priority);
    expect(fres.kind).toBe(legacy.kind);
    if (legacy.aim) {
      expect(fres.aim).toEqual(legacy.aim);
    }
  });

  it('helpMode disabled → target = manPos, forces vides ou seek 0 vers manPos', () => {
    const carrier = { x: 400, y: 470 };
    const att = { x: 200, y: 380 };
    const manPos = { x: 250, y: 350 };
    const defenderRef = manPos; // pile sur manPos → forces vides
    const rule: DefenderRule = { helpPct: 50, priority: 'man', vsCarrier: 'coller', helpMode: 'disabled' };
    const fres = computeHelpForces(defenderRef, manPos, rule, noTriggers, carrier, att, 1, undefined);
    expect(fres.helpFactor).toBe(0);
    expect(fres.kind).toBe('none');
    expect(fres.forces).toEqual([]);
  });
});

describe('computeHelpForces — amortissement zone proche (1.1b appliqué à help)', () => {
  it('defenderRef à 6 px du legacy target → composé à 3 px de defenderRef (dampening)', () => {
    const carrier = { x: 400, y: 470 };
    const att = { x: 350, y: 400 };
    const manPos = { x: 350, y: 400 };
    const legacy = computeHelpTarget(manPos, ruleSag(50), noTriggers, carrier, att, 1);
    // Place defenderRef à 6 px du target, dans la direction de manPos
    const dxToTarget = legacy.target.x - manPos.x;
    const dyToTarget = legacy.target.y - manPos.y;
    const lenT = Math.hypot(dxToTarget, dyToTarget) || 1;
    const dirX = dxToTarget / lenT;
    const dirY = dyToTarget / lenT;
    const defenderRef = { x: legacy.target.x - dirX * 6, y: legacy.target.y - dirY * 6 };
    const fres = computeHelpForces(defenderRef, manPos, ruleSag(50), noTriggers, carrier, att, 1, undefined);
    const composed = fres.forces.length > 0
      ? composeTarget(defenderRef, fres.forces)
      : fres.target;
    const dDefToComposed = Math.hypot(composed.x - defenderRef.x, composed.y - defenderRef.y);
    // Si le legacy a effectivement écarté le target de manPos (helpFactor > 0),
    // la cible legacy est distincte de manPos et l'amortissement fire.
    if (lenT > 1e-3 && Math.abs(legacy.helpFactor) > 1e-9) {
      expect(dDefToComposed).toBeCloseTo(3, 4); // d²/radius = 36/12 = 3 px
    }
  });
});

describe('computeHelpTarget — help-side split line (P1.1, opt-in)', () => {
  // Ballon à droite, homme weak-side à gauche À DEUX PASSES (> 250 px du ballon).
  const carrier = { x: 450, y: 470 };
  const attFar = { x: 150, y: 350 }; // dist ≈ 323 px → 2 passes
  const attNear = { x: 240, y: 420 }; // dist ≈ 168 px → 1 passe
  const manPosFar = { x: 150, y: 280 };
  const manPosNear = { x: 240, y: 340 };
  const splitOn = { helpSideStance: true };

  it('flag on + weak-side + 2 passes → stance split line (kind dédié, aim sur l\'axe à hauteur du ballon)', () => {
    const r = computeHelpTarget(
      manPosFar, ruleSag(50), noTriggers, carrier, attFar, 1,
      undefined, HOOP, 0.45, 1, splitOn
    );
    expect(r.kind).toBe('helpside-splitline');
    expect(r.aim).toBeDefined();
    expect(r.aim!.x).toBe(HOOP.x); // split line = axe panier
    expect(r.aim!.y).toBe(carrier.y); // à hauteur du ballon
    expect(r.helpFactor).toBeGreaterThan(0);
  });

  it('le pull vers la split line est plus fort que le sag legacy', () => {
    const legacy = computeHelpTarget(
      manPosFar, ruleSag(50), noTriggers, carrier, attFar, 1
    );
    const split = computeHelpTarget(
      manPosFar, ruleSag(50), noTriggers, carrier, attFar, 1,
      undefined, HOOP, 0.45, 1, splitOn
    );
    const distLegacy = Math.abs(legacy.target.x - HOOP.x);
    const distSplit = Math.abs(split.target.x - HOOP.x);
    expect(distSplit).toBeLessThan(distLegacy);
  });

  it('flag on mais homme à UNE passe (< 250 px) → sag legacy inchangé', () => {
    const withFlag = computeHelpTarget(
      manPosNear, ruleSag(50), noTriggers, carrier, attNear, 1,
      undefined, HOOP, 0.45, 1, splitOn
    );
    const without = computeHelpTarget(
      manPosNear, ruleSag(50), noTriggers, carrier, attNear, 1
    );
    expect(withFlag.kind).toBe('sag-weakside');
    expect(withFlag.target).toEqual(without.target);
  });

  it('flag on + strong-side → denial inchangé', () => {
    const attStrong = { x: 400, y: 380 };
    const manStrong = { x: 400, y: 300 };
    const withFlag = computeHelpTarget(
      manStrong, ruleSag(50), noTriggers, carrier, attStrong, 1,
      undefined, HOOP, 0.45, 1, splitOn
    );
    const without = computeHelpTarget(
      manStrong, ruleSag(50), noTriggers, carrier, attStrong, 1
    );
    expect(withFlag.kind).toBe('denial-strongside');
    expect(withFlag.target).toEqual(without.target);
  });

  it('flag off (default) → sag legacy strictement préservé (régression)', () => {
    const r = computeHelpTarget(
      manPosFar, ruleSag(50), noTriggers, carrier, attFar, 1
    );
    expect(r.kind).toBe('sag-weakside');
  });

  it('trigger actif → l\'aide active prime, pas de split line', () => {
    const r = computeHelpTarget(
      manPosFar, ruleSag(50), driveTriggers, carrier, attFar, 1,
      undefined, HOOP, 0.45, 1, splitOn
    );
    expect(r.kind).not.toBe('helpside-splitline');
  });
});
