// Tests — lectures multi-niveaux : résolution du chemin de branches
// et construction de la liste effective d'actions.

import { describe, it, expect } from 'vitest';
import type { ScenarioBranch, ScriptedAction } from '@/lib/types';
import { resolveActiveBranchPath, buildEffectiveActions } from '../branchPath';

function makeAction(id: string): ScriptedAction {
  return { kind: 'offensive', id, type: 'pass', params: { from: 'O1', to: 'O2' } } as unknown as ScriptedAction;
}

function makeBranch(
  id: string,
  divergeAfterActionId: string,
  actionIds: string[],
  parentBranchId?: string,
): ScenarioBranch {
  return {
    id,
    label: id,
    divergeAfterActionId,
    actions: actionIds.map(makeAction),
    parentBranchId,
  };
}

const mainActions = ['m1', 'm2', 'm3'].map(makeAction);

describe('resolveActiveBranchPath', () => {
  it('branche de niveau 1 (pas de parent) → chemin de longueur 1', () => {
    const b1 = makeBranch('b1', 'm1', ['b1a']);
    const path = resolveActiveBranchPath([b1], 'b1');
    expect(path.map((b) => b.id)).toEqual(['b1']);
  });

  it('sous-branche niveau 2 → chemin [parent, enfant]', () => {
    const b1 = makeBranch('b1', 'm1', ['b1a']);
    const b2 = makeBranch('b2', 'b1a', ['b2a'], 'b1');
    const path = resolveActiveBranchPath([b1, b2], 'b2');
    expect(path.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('sous-branche niveau 3 → chemin [b1, b2, b3]', () => {
    const b1 = makeBranch('b1', 'm1', ['b1a']);
    const b2 = makeBranch('b2', 'b1a', ['b2a'], 'b1');
    const b3 = makeBranch('b3', 'b2a', ['b3a'], 'b2');
    const path = resolveActiveBranchPath([b1, b2, b3], 'b3');
    expect(path.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('id introuvable → tableau vide', () => {
    expect(resolveActiveBranchPath([], 'inexistant')).toEqual([]);
  });

  it('chemin vide si id null-like → [] (appelé avec string vide)', () => {
    const b1 = makeBranch('b1', 'm1', []);
    // Le caller ne devrait pas appeler avec chaîne vide, mais on vérifie la robustesse
    expect(resolveActiveBranchPath([b1], '')).toEqual([]);
  });
});

describe('buildEffectiveActions', () => {
  it('chemin vide → actions principales inchangées', () => {
    const result = buildEffectiveActions(mainActions, []);
    expect(result.map((a) => a.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('niveau 1 : remplace la suite après le point de divergence', () => {
    const b1 = makeBranch('b1', 'm1', ['b1a', 'b1b']);
    const result = buildEffectiveActions(mainActions, [b1]);
    // [m1, b1a, b1b] — m2 et m3 remplacés
    expect(result.map((a) => a.id)).toEqual(['m1', 'b1a', 'b1b']);
  });

  it('niveau 2 : application en cascade (branche dans branche)', () => {
    const b1 = makeBranch('b1', 'm1', ['b1a', 'b1b']);
    const b2 = makeBranch('b2', 'b1a', ['b2a'], 'b1');
    const result = buildEffectiveActions(mainActions, [b1, b2]);
    // Après b1 : [m1, b1a, b1b]
    // Après b2 : [m1, b1a, b2a] (b1b remplacé)
    expect(result.map((a) => a.id)).toEqual(['m1', 'b1a', 'b2a']);
  });

  it('divergeAfterActionId invalide dans un niveau → branche ignorée, chaîne continue', () => {
    const b1 = makeBranch('b1', 'm1', ['b1a']);
    const b2Invalid = makeBranch('b2', 'inexistant', ['b2a'], 'b1');
    const result = buildEffectiveActions(mainActions, [b1, b2Invalid]);
    // b2 ignoré → résultat identique à b1 seul
    expect(result.map((a) => a.id)).toEqual(['m1', 'b1a']);
  });

  it('branche vide → tronque jusqu\'au point de divergence', () => {
    const b1 = makeBranch('b1', 'm2', []);
    const result = buildEffectiveActions(mainActions, [b1]);
    expect(result.map((a) => a.id)).toEqual(['m1', 'm2']);
  });
});
