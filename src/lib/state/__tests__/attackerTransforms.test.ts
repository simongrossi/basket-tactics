// Tests des transformations attaquants.

import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import * as attackerTx from '../transforms/attackerTransforms';

describe('attackerTransforms', () => {
  describe('setAttackerHand', () => {
    it("ajoute attackerHands depuis defaults si absent", () => {
      const s0 = makeInitialState();
      const s1 = attackerTx.setAttackerHand(s0, 'O3', 'left');
      expect(s1.attackerHands?.O3).toBe('left');
      // Les autres restent right (default).
      expect(s1.attackerHands?.O1).toBe('right');
    });
  });

  describe('setAttackerOrientation', () => {
    it("crée l'entrée puis l'enrichit", () => {
      const s0 = makeInitialState();
      const s1 = attackerTx.setAttackerOrientation(s0, 'O1', { body: 90 });
      expect(s1.attackerOrientations?.O1).toEqual({ body: 90 });
      const s2 = attackerTx.setAttackerOrientation(s1, 'O1', { gaze: 45 });
      expect(s2.attackerOrientations?.O1).toEqual({ body: 90, gaze: 45 });
    });

    it("supprime l'entrée si tous les champs sont undefined", () => {
      const s0 = makeInitialState();
      const s1 = attackerTx.setAttackerOrientation(s0, 'O1', { body: 90, gaze: 45 });
      const s2 = attackerTx.setAttackerOrientation(s1, 'O1', { body: undefined, gaze: undefined });
      expect(s2.attackerOrientations?.O1).toBeUndefined();
    });

    it("nettoie une seule clé", () => {
      const s0 = attackerTx.setAttackerOrientation(makeInitialState(), 'O1', { body: 90, gaze: 45 });
      const s1 = attackerTx.setAttackerOrientation(s0, 'O1', { body: undefined });
      expect(s1.attackerOrientations?.O1).toEqual({ gaze: 45 });
    });
  });

  describe('setAttackerProfile', () => {
    it("met à jour le profil offensif d'un joueur", () => {
      const s0 = makeInitialState();
      const s1 = attackerTx.setAttackerProfile(s0, 'O1', 'shooter');
      expect(s1.attackerProfiles?.O1).toBe('shooter');
      // Les autres conservent leurs défauts.
      expect(s1.attackerProfiles?.O2).toBeDefined();
    });
  });
});
