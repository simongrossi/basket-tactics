// Tests des transformations défense.

import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import * as defenseTx from '../transforms/defenseTransforms';

describe('defenseTransforms', () => {
  describe('updateRule / updateAllRules', () => {
    it("updateRule modifie uniquement le défenseur visé", () => {
      const s0 = makeInitialState();
      const s1 = defenseTx.updateRule(s0, 'D1', { helpPct: 80 });
      expect(s1.rules.D1.helpPct).toBe(80);
      expect(s1.rules.D2.helpPct).toBe(s0.rules.D2.helpPct);
    });

    it("updateAllRules applique le patch à tous", () => {
      const s0 = makeInitialState();
      const s1 = defenseTx.updateAllRules(s0, { helpPct: 30 });
      expect(s1.rules.D1.helpPct).toBe(30);
      expect(s1.rules.D2.helpPct).toBe(30);
      expect(s1.rules.D3.helpPct).toBe(30);
      expect(s1.rules.D4.helpPct).toBe(30);
      expect(s1.rules.D5.helpPct).toBe(30);
    });
  });

  describe('resetIndividualOverrides', () => {
    it("efface distance, maxSpeed, closeoutBoost, denyAggressiveness, screenNav", () => {
      const s0 = makeInitialState();
      const customized = defenseTx.updateRule(s0, 'D1', {
        distance: 35,
        maxSpeed: 120,
        closeoutBoost: 1.5,
        denyAggressiveness: 0.8,
        screenNav: 'over',
      });
      const reset = defenseTx.resetIndividualOverrides(customized);
      expect(reset.rules.D1.distance).toBeUndefined();
      expect(reset.rules.D1.maxSpeed).toBeUndefined();
      expect(reset.rules.D1.closeoutBoost).toBeUndefined();
      expect(reset.rules.D1.denyAggressiveness).toBeUndefined();
      expect(reset.rules.D1.screenNav).toBeUndefined();
    });

    it("ne touche pas les autres champs (helpPct, priority, vsCarrier)", () => {
      const s0 = makeInitialState();
      const reset = defenseTx.resetIndividualOverrides(s0);
      expect(reset.rules.D1.helpPct).toBe(s0.rules.D1.helpPct);
      expect(reset.rules.D1.priority).toBe(s0.rules.D1.priority);
    });
  });

  describe('clearDefenseOverride', () => {
    it("efface l'override d'un défenseur du step actif", () => {
      const s0 = makeInitialState();
      const withOverride = {
        ...s0,
        steps: [
          {
            ...s0.steps[0],
            defenseOverrides: { D1: { x: 100, y: 100 }, D2: { x: 200, y: 200 } },
          },
        ],
      };
      const s1 = defenseTx.clearDefenseOverride(withOverride, 'D1');
      expect(s1.steps[0].defenseOverrides).toEqual({ D2: { x: 200, y: 200 } });
    });

    it("supprime defenseOverrides si l'override visé était le dernier", () => {
      const s0 = makeInitialState();
      const withOne = {
        ...s0,
        steps: [{ ...s0.steps[0], defenseOverrides: { D1: { x: 100, y: 100 } } }],
      };
      const s1 = defenseTx.clearDefenseOverride(withOne, 'D1');
      expect(s1.steps[0].defenseOverrides).toBeUndefined();
    });
  });

  describe('setScreenRule', () => {
    it("met à jour screenRule ET efface tous les switches", () => {
      const s0 = makeInitialState();
      const withSwitches = {
        ...s0,
        steps: [{ ...s0.steps[0], switches: [['D1', 'D5']] as [string, string][] }],
      };
      const s1 = defenseTx.setScreenRule(withSwitches as never, 'ice');
      expect(s1.screenRule).toBe('ice');
      expect(s1.steps[0].switches).toBeUndefined();
    });
  });

  describe('resetSwitches', () => {
    it("efface les switches de toutes les étapes", () => {
      const s0 = makeInitialState();
      const withSwitches = {
        ...s0,
        steps: [
          { ...s0.steps[0], switches: [['D1', 'D5']] as [string, string][] },
        ],
      };
      const s1 = defenseTx.resetSwitches(withSwitches as never);
      expect(s1.steps[0].switches).toBeUndefined();
    });
  });

  describe('setDefenseSystem', () => {
    it("passe en zone et snap defenseInitial aux homePos de la zone", () => {
      const s0 = makeInitialState();
      const s1 = defenseTx.setDefenseSystem(s0, 'zone');
      expect(s1.defenseSystem).toBe('zone');
      // defenseInitial doit être recalculée — différente de l'initiale par défaut.
      expect(s1.defenseInitial).toBeDefined();
      expect(Object.keys(s1.defenseInitial!).length).toBeGreaterThan(0);
    });

    it("efface tous les defenseOverrides au changement de système", () => {
      const s0 = makeInitialState();
      const withOverrides = {
        ...s0,
        steps: [
          {
            ...s0.steps[0],
            defenseOverrides: { D1: { x: 100, y: 100 } },
          },
        ],
      };
      const s1 = defenseTx.setDefenseSystem(withOverrides, 'zone');
      expect(s1.steps[0].defenseOverrides).toBeUndefined();
    });
  });

  describe('clearAllDefenseOverridesActiveStep', () => {
    it("no-op si pas d'override", () => {
      const s0 = makeInitialState();
      expect(defenseTx.clearAllDefenseOverridesActiveStep(s0)).toBe(s0);
    });

    it("efface tous les overrides du step actif", () => {
      const s0 = makeInitialState();
      const withOverrides = {
        ...s0,
        steps: [
          {
            ...s0.steps[0],
            defenseOverrides: { D1: { x: 100, y: 100 }, D2: { x: 200, y: 200 } },
          },
        ],
      };
      const s1 = defenseTx.clearAllDefenseOverridesActiveStep(withOverrides);
      expect(s1.steps[0].defenseOverrides).toBeUndefined();
    });
  });

  describe('setDefenderSpeedProfile', () => {
    it('règle puis retire le profil athlétique d’un seul défenseur', () => {
      const s0 = makeInitialState();
      const s1 = defenseTx.setDefenderSpeedProfile(s0, 'D5', 'lent');
      expect(s1.defenderSpeedProfiles).toEqual({ D5: 'lent' });
      const s2 = defenseTx.setDefenderSpeedProfile(s1, 'D1', 'elite');
      expect(s2.defenderSpeedProfiles).toEqual({ D5: 'lent', D1: 'elite' });
      const s3 = defenseTx.setDefenderSpeedProfile(s2, 'D5', undefined);
      expect(s3.defenderSpeedProfiles).toEqual({ D1: 'elite' });
      expect(s0.defenderSpeedProfiles).toBeUndefined();
    });
  });
});
