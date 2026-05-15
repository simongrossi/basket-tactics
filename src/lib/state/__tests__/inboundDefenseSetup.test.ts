// Tests defensive inbound mode — vérifie que chaque mode produit un
// placement défensif distinct cohérent avec la stratégie basket.

import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import {
  convertStepToInbound,
  setInboundDefenseMode,
} from '../transforms/stepTransforms';
import { distance } from '@/lib/logic/geometry';
import type { AppState } from '@/lib/types';

function withInbound(): AppState {
  return convertStepToInbound(makeInitialState(), 'inbound-baseline');
}

describe('setInboundDefenseMode — no-op hors inbound', () => {
  it("ne modifie pas le state si step.context n'est pas inbound-*", () => {
    const s = makeInitialState();
    const result = setInboundDefenseMode(s, 'zone-press');
    expect(result).toBe(s);
  });
});

describe('setInboundDefenseMode — mode man', () => {
  it('place chaque défenseur entre son homme et le panier', () => {
    const s = setInboundDefenseMode(withInbound(), 'man');
    const step = s.steps[s.activeStep];
    const inbounder = step.ballCarrier;
    // Pour chaque défenseur Dk matched à Ok (k != inbounder), Dk doit
    // être entre Ok et le panier (= y < Ok.y pour panier en haut).
    (['D2', 'D3', 'D4', 'D5'] as const).forEach((dId, i) => {
      const oId = (`O${i + 2}`) as keyof typeof step.off;
      const def = step.defenseOverrides?.[dId];
      const att = step.off[oId];
      if (!def || !att) return;
      // Convention : panier au-dessus (y=75) → Dk a y < att.y.
      // (Sauf si l'attaquant est lui-même au-dessus du panier, cas
      // dégénéré non-applicable ici.)
      if (att.y > 75) {
        expect(def.y).toBeLessThan(att.y);
      }
    });
  });
});

describe('setInboundDefenseMode — mode deny-deny', () => {
  it("place chaque défenseur sur la ligne de passe (entre son homme et le passeur)", () => {
    const s = setInboundDefenseMode(withInbound(), 'deny-deny');
    const step = s.steps[s.activeStep];
    const inbounder = step.ballCarrier;
    const passerPos = step.off[inbounder];
    (['D2', 'D3', 'D4', 'D5'] as const).forEach((dId, i) => {
      const oId = (`O${i + 2}`) as keyof typeof step.off;
      const def = step.defenseOverrides?.[dId];
      const att = step.off[oId];
      if (!def || !att) return;
      // Distance Def→Passer < Distance Att→Passer (le défenseur est
      // "en avant" de l'attaquant vers le passeur).
      const dToPasser = distance(def, passerPos);
      const aToPasser = distance(att, passerPos);
      expect(dToPasser).toBeLessThan(aToPasser);
    });
  });
});

describe('setInboundDefenseMode — mode face-guard', () => {
  it("ne dénie qu'un seul attaquant (le receveur principal = plus proche du passeur)", () => {
    const s = setInboundDefenseMode(withInbound(), 'face-guard');
    const step = s.steps[s.activeStep];
    const inbounder = step.ballCarrier;
    const passerPos = step.off[inbounder];
    // Trouver le receveur principal (plus proche du passeur, hors inbounder)
    let primaryId: keyof typeof step.off | null = null;
    let bestDist = Infinity;
    (Object.keys(step.off) as Array<keyof typeof step.off>).forEach((id) => {
      if (id === inbounder) return;
      const d = distance(passerPos, step.off[id]);
      if (d < bestDist) {
        bestDist = d;
        primaryId = id;
      }
    });
    // Le défenseur du primaryId doit être en deny (entre primary et passeur)
    if (primaryId) {
      const primaryIdx = (['O1', 'O2', 'O3', 'O4', 'O5'] as const).indexOf(primaryId);
      const dId = (`D${primaryIdx + 1}`) as 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
      const def = step.defenseOverrides?.[dId];
      const att = step.off[primaryId];
      if (def && att) {
        expect(distance(def, passerPos)).toBeLessThan(distance(att, passerPos));
      }
    }
  });
});

describe('setInboundDefenseMode — mode zone-press', () => {
  it('place 2 défenseurs proches du passeur (trap)', () => {
    const s = setInboundDefenseMode(withInbound(), 'zone-press');
    const step = s.steps[s.activeStep];
    const inbounder = step.ballCarrier;
    const passerPos = step.off[inbounder];
    // D1 + D2 doivent être proches du passeur (< 60 px du passeur).
    const d1 = step.defenseOverrides?.D1;
    const d2 = step.defenseOverrides?.D2;
    expect(d1).toBeDefined();
    expect(d2).toBeDefined();
    if (d1 && d2) {
      expect(distance(d1, passerPos)).toBeLessThan(60);
      expect(distance(d2, passerPos)).toBeLessThan(60);
    }
  });
});

describe('setInboundDefenseMode — différents modes = différentes positions', () => {
  it('man et deny-deny produisent des positions distinctes', () => {
    const inbState = withInbound();
    const manState = setInboundDefenseMode(inbState, 'man');
    const denyState = setInboundDefenseMode(inbState, 'deny-deny');
    const manD2 = manState.steps[manState.activeStep].defenseOverrides?.D2;
    const denyD2 = denyState.steps[denyState.activeStep].defenseOverrides?.D2;
    expect(manD2).toBeDefined();
    expect(denyD2).toBeDefined();
    if (manD2 && denyD2) {
      expect(distance(manD2, denyD2)).toBeGreaterThan(10);
    }
  });
});
