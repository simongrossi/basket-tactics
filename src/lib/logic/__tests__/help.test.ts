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
