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
});
