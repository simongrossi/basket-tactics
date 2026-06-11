// Tests — templates d'attaque de zone (anti-zone offense).
//
// Garde-fous :
//  1. Intégrité structurelle : ids uniques, branches référencent des actions
//     existantes, sous-branches référencent des branches existantes.
//  2. Compilation : chemin principal + chaque branche (y compris la
//     sous-branche multi-niveaux) compilent sans erreur.
//  3. Chargement : loadTemplate active la défense de zone du template.
//  4. Règle 1 : aucun chevauchement d'attaquants dans les steps écrits à la main.

import { describe, expect, it } from 'vitest';
import { ANTI_ZONE_TEMPLATES } from '../antiZoneTemplates';
import { TEMPLATES } from '../templates';
import { compileScenario } from '@/lib/logic/compileScenario';
import { resolveActiveBranchPath, buildEffectiveActions } from '@/lib/logic/reads/branchPath';
import { loadTemplate } from '@/lib/state/transforms/coreTransforms';
import { makeInitialState } from '@/lib/data/initial';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import type { AttackerId } from '@/lib/types';

describe('anti-zone — intégrité structurelle', () => {
  it('3 templates anti-zone exportés et présents dans TEMPLATES', () => {
    expect(ANTI_ZONE_TEMPLATES).toHaveLength(3);
    ANTI_ZONE_TEMPLATES.forEach((t) => {
      expect(TEMPLATES.find((x) => x.id === t.id)).toBeDefined();
    });
  });

  it('tous taggés anti-zone + zone, avec defenseSystem zone + zoneType', () => {
    ANTI_ZONE_TEMPLATES.forEach((t) => {
      expect(t.tags).toContain('anti-zone');
      expect(t.tags).toContain('zone');
      expect(t.defenseSystem).toBe('zone');
      expect(t.zoneType).toMatch(/^zone-/);
    });
  });

  it('ids d\'actions uniques (main + branches) par template', () => {
    ANTI_ZONE_TEMPLATES.forEach((t) => {
      const ids = [
        ...(t.scriptedActions ?? []).map((a) => a.id),
        ...(t.scenarioBranches ?? []).flatMap((b) => b.actions.map((a) => a.id)),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('divergeAfterActionId pointe vers une action existante (main ou branche parente)', () => {
    ANTI_ZONE_TEMPLATES.forEach((t) => {
      const branches = t.scenarioBranches ?? [];
      branches.forEach((b) => {
        const sourceActions = b.parentBranchId
          ? branches.find((p) => p.id === b.parentBranchId)?.actions ?? []
          : t.scriptedActions ?? [];
        expect(
          sourceActions.find((a) => a.id === b.divergeAfterActionId),
          `${t.id} / ${b.id} : divergeAfterActionId ${b.divergeAfterActionId} introuvable`
        ).toBeDefined();
      });
    });
  });

  it('parentBranchId pointe vers une branche existante', () => {
    ANTI_ZONE_TEMPLATES.forEach((t) => {
      const branches = t.scenarioBranches ?? [];
      branches
        .filter((b) => b.parentBranchId)
        .forEach((b) => {
          expect(branches.find((p) => p.id === b.parentBranchId)).toBeDefined();
        });
    });
  });
});

describe('anti-zone — compilation', () => {
  it('le chemin principal compile pour chaque template', () => {
    ANTI_ZONE_TEMPLATES.forEach((t) => {
      const steps = compileScenario({
        initialOff: t.steps[0].off,
        initialBallCarrier: t.steps[0].ballCarrier,
        actions: t.scriptedActions ?? [],
      });
      expect(steps.length, `${t.id} : compilation main vide`).toBeGreaterThan(1);
    });
  });

  it('chaque branche compile (chemin multi-niveaux résolu via parentBranchId)', () => {
    ANTI_ZONE_TEMPLATES.forEach((t) => {
      const branches = t.scenarioBranches ?? [];
      branches.forEach((b) => {
        const path = resolveActiveBranchPath(branches, b.id);
        expect(path[path.length - 1]?.id).toBe(b.id);
        const steps = compileScenario({
          initialOff: t.steps[0].off,
          initialBallCarrier: t.steps[0].ballCarrier,
          actions: t.scriptedActions ?? [],
          activeBranchPath: path,
        });
        expect(steps.length, `${t.id} / ${b.id} : compilation branche vide`).toBeGreaterThan(1);
        // La dernière action de la branche doit avoir généré au moins un step.
        const lastAction = b.actions[b.actions.length - 1];
        expect(
          steps.find((s) => s.generatedBy === lastAction.id),
          `${t.id} / ${b.id} : la dernière action ${lastAction.id} n'a généré aucun step`
        ).toBeDefined();
      });
    });
  });

  it('surcharge 2-3 : la sous-branche (niveau 2) substitue bien la fin de la branche parente', () => {
    const t = ANTI_ZONE_TEMPLATES.find((x) => x.id === 'az-overload-23')!;
    const branches = t.scenarioBranches!;
    const sub = branches.find((b) => b.id === 'az-ov-b2')!;
    const path = resolveActiveBranchPath(branches, sub.id);
    expect(path.map((b) => b.id)).toEqual(['az-ov-b1', 'az-ov-b2']);
    const actions = buildEffectiveActions(t.scriptedActions!, path);
    const ids = actions.map((a) => a.id);
    // Main jusqu'à az-ov-3, puis kick-out de la branche 1, puis la sous-branche
    expect(ids).toEqual(['az-ov-1', 'az-ov-2', 'az-ov-3', 'az-ov-b1-1', 'az-ov-b2-1', 'az-ov-b2-2']);
    // Le tir corner de la branche 1 (az-ov-b1-2) est remplacé par le renversement
    expect(ids).not.toContain('az-ov-b1-2');
  });
});

describe('anti-zone — chargement (loadTemplate)', () => {
  it('active la défense de zone du template (system + type)', () => {
    const s0 = makeInitialState();
    expect(s0.defenseSystem).toBe('man');
    ANTI_ZONE_TEMPLATES.forEach((t) => {
      const s1 = loadTemplate(s0, t);
      expect(s1.defenseSystem).toBe('zone');
      expect(s1.zoneConfig.type).toBe(t.zoneType);
      expect(s1.scenarioBranches?.length).toBe(t.scenarioBranches?.length);
    });
  });

  it('un template sans defenseSystem ne touche pas au système courant', () => {
    const s0 = makeInitialState();
    const classic = TEMPLATES.find((t) => t.id === 'pnr-central')!;
    const s1 = loadTemplate(s0, classic);
    expect(s1.defenseSystem).toBe('man');
    expect(s1.zoneConfig.type).toBe(s0.zoneConfig.type);
  });
});

describe('anti-zone — Règle 1 (steps écrits à la main)', () => {
  it('aucune paire d\'attaquants sous PLAYER_MIN_CLEARANCE_PX dans les steps des templates', () => {
    ANTI_ZONE_TEMPLATES.forEach((t) => {
      t.steps.forEach((step, idx) => {
        const ids = Object.keys(step.off) as AttackerId[];
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const a = step.off[ids[i]];
            const b = step.off[ids[j]];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            expect(
              d,
              `${t.id} step ${idx} : ${ids[i]}–${ids[j]} à ${Math.round(d)}px`
            ).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX);
          }
        }
      });
    });
  });
});
