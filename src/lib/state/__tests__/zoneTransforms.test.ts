// Tests des transformations zones.

import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import * as zoneTx from '../transforms/zoneTransforms';

describe('zoneTransforms', () => {
  describe('setZoneOverride / clearZoneOverride', () => {
    it("ajoute puis efface un override de région", () => {
      const s0 = makeInitialState();
      const s1 = zoneTx.setZoneOverride(s0, 'top-left', { homePos: { x: 100, y: 100 } });
      expect(s1.zoneOverrides?.['top-left']).toEqual({ homePos: { x: 100, y: 100 } });
      const s2 = zoneTx.clearZoneOverride(s1, 'top-left');
      expect(s2.zoneOverrides).toBeUndefined();
    });

    it("supprime l'override si tous les champs sont undefined", () => {
      const s0 = zoneTx.setZoneOverride(makeInitialState(), 'top-left', {
        homePos: { x: 100, y: 100 },
      });
      const s1 = zoneTx.setZoneOverride(s0, 'top-left', {
        homePos: undefined,
        radius: undefined,
        mode: undefined,
      });
      expect(s1.zoneOverrides).toBeUndefined();
    });

    it("clearZoneOverride no-op si region absente", () => {
      const s0 = makeInitialState();
      expect(zoneTx.clearZoneOverride(s0, 'unknown')).toBe(s0);
    });
  });

  describe('setZoneEditMode', () => {
    it("toggle on/off", () => {
      const s0 = makeInitialState();
      expect(zoneTx.setZoneEditMode(s0, true).zoneEditMode).toBe(true);
      expect(zoneTx.setZoneEditMode(s0, false).zoneEditMode).toBe(false);
    });
  });

  describe('updateZoneConfig', () => {
    it("patch simple sans changement de type", () => {
      const s0 = makeInitialState();
      const s1 = zoneTx.updateZoneConfig(s0, { verticalOffset: 20 });
      expect(s1.zoneConfig.verticalOffset).toBe(20);
      // Si pas de changement de type, defenseInitial est inchangé.
      expect(s1.defenseInitial).toBe(s0.defenseInitial);
    });

    it("changement de type → resnap defenseInitial + clear overrides", () => {
      const s0 = makeInitialState();
      const withOverrides = {
        ...s0,
        zoneConfig: { ...s0.zoneConfig, type: 'zone-2-3' as const },
        zoneOverrides: { foo: { homePos: { x: 1, y: 1 } } },
        steps: [
          {
            ...s0.steps[0],
            defenseOverrides: { D1: { x: 0, y: 0 } },
          },
        ],
      };
      const s1 = zoneTx.updateZoneConfig(withOverrides, { type: 'zone-3-2' });
      expect(s1.zoneConfig.type).toBe('zone-3-2');
      // Resnap : defenseInitial doit être recalculée.
      expect(s1.defenseInitial).not.toBe(s0.defenseInitial);
      // Overrides régionaux et step purgés.
      expect(s1.zoneOverrides).toBeUndefined();
      expect(s1.steps[0].defenseOverrides).toBeUndefined();
    });
  });
});
