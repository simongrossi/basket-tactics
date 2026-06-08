// Tests des transformations transverses : tool, patch, playerCount, reset.

import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import * as coreTx from '../transforms/coreTransforms';

describe('coreTransforms', () => {
  describe('setTool', () => {
    it("met à jour state.tool", () => {
      const s0 = makeInitialState();
      const s1 = coreTx.setTool(s0, 'pass');
      expect(s1.tool).toBe('pass');
    });
  });

  describe('patch', () => {
    it("applique un patch superficiel", () => {
      const s0 = makeInitialState();
      const s1 = coreTx.patch(s0, { defenseDistance: 60 });
      expect(s1.defenseDistance).toBe(60);
      // Les autres champs intacts.
      expect(s1.steps).toBe(s0.steps);
    });
  });

  describe('setPlayerCount', () => {
    it("normalise pour le nouveau player count", () => {
      const s0 = makeInitialState();
      const s1 = coreTx.setPlayerCount(s0, 3);
      expect(s1.playerCount).toBe(3);
      // L'état est normalisé : positions et matchups cohérents.
      expect(s1.steps[0].off).toBeDefined();
    });
  });

  describe('resetAll', () => {
    it("retourne un état initial frais (pas de reset side-effect ici)", () => {
      const s0 = coreTx.resetAll();
      expect(s0.steps.length).toBeGreaterThan(0);
      expect(s0.activeStep).toBe(0);
    });
  });

  describe('setPlayerName', () => {
    it("définit le nom personnalisé du joueur dans playerNames", () => {
      const s0 = makeInitialState();
      const s1 = coreTx.setPlayerName(s0, 'O1', 'Tony Parker');
      expect(s1.playerNames?.O1).toBe('Tony Parker');
    });
  });

  describe('setPlayerNumber', () => {
    it("définit le numéro de maillot personnalisé du joueur dans playerNumbers", () => {
      const s0 = makeInitialState();
      const s1 = coreTx.setPlayerNumber(s0, 'O1', '9');
      expect(s1.playerNumbers?.O1).toBe('9');
    });
  });

  describe('importState', () => {
    it("conserve la compatibilité ascendante pour les anciennes sauvegardes", () => {
      const s0 = makeInitialState();
      const oldState = { ...s0 } as any;
      delete oldState.playerNames;
      delete oldState.playerNumbers;
      delete oldState.showPlayerNames;

      const imported = coreTx.importState(oldState);
      expect(imported.playerNames).toEqual({});
      expect(imported.playerNumbers).toEqual({});
      expect(imported.showPlayerNames).toBe(true);
    });
  });

  describe('loadTemplate', () => {
    it("charge les étapes et les champs de scénario nodal s'ils existent", () => {
      const s0 = makeInitialState();
      const template = {
        id: 'test-template',
        name: 'Test Template',
        description: 'Test Desc',
        defenseInitial: {},
        steps: [
          { label: 'Step 1', off: {}, ballCarrier: 'O1', annotations: [] },
        ] as any,
        scriptedActions: [
          {
            kind: 'offensive',
            id: 'act-1',
            type: 'pick-and-roll',
            params: { ballHandler: 'O1', screener: 'O5' },
          },
        ] as any,
        scenarioBranches: [
          { id: 'branch-1', name: 'Branch 1', actions: [], divergeAfterActionId: 'act-1' },
        ],
        continuityLoop: { anchorActionId: 'act-1', loopLength: 1 },
        autoReplacementEnabled: true,
        autoReplacementDepth: 3,
      };

      const s1 = coreTx.loadTemplate(s0, template as any);
      expect(s1.steps.length).toBe(1);
      expect(s1.scriptedActions).toEqual(template.scriptedActions);
      expect(s1.scenarioBranches).toEqual(template.scenarioBranches);
      expect(s1.continuityLoop).toEqual(template.continuityLoop);
      expect(s1.autoReplacementEnabled).toBe(true);
      expect(s1.autoReplacementDepth).toBe(3);
    });

    it("utilise des valeurs par défaut pour les champs de scénario s'ils n'existent pas", () => {
      const s0 = makeInitialState();
      const template = {
        id: 'test-template-empty',
        name: 'Test Template Empty',
        description: 'Test Desc',
        defenseInitial: {},
        steps: [
          { label: 'Step 1', off: {}, ballCarrier: 'O1', annotations: [] },
        ] as any,
      };

      const s1 = coreTx.loadTemplate(s0, template as any);
      expect(s1.scriptedActions).toEqual([]);
      expect(s1.scenarioBranches).toEqual([]);
      expect(s1.activeBranchId).toBeNull();
      expect(s1.continuityLoop).toBeUndefined();
      expect(s1.autoReplacementEnabled).toBeUndefined();
      expect(s1.autoReplacementDepth).toBeUndefined();
    });
  });
});
