// Tests L.1.2 — bibliothèque de lectures canoniques.

import { describe, expect, it } from 'vitest';
import type { OffensiveScriptedAction } from '@/lib/types';
import { SCRIPTED_GENERATORS } from '@/lib/logic/scriptedGenerators';
import {
  buildCanonicalReadBranches,
  CANONICAL_READ_COVERAGES,
} from '@/lib/data/readLibrary';

/** Fabrique d'id déterministe pour les tests. */
function counterIds() {
  let n = 0;
  return () => `id-${n++}`;
}

const PNR: OffensiveScriptedAction = {
  kind: 'offensive',
  id: 'pnr-1',
  type: 'pick-and-roll',
  params: { ballHandler: 'O1', screener: 'O5', side: 'fort' },
};

describe('buildCanonicalReadBranches', () => {
  it('produit une branche réactive par couverture canonique', () => {
    const branches = buildCanonicalReadBranches(PNR, {}, counterIds());
    expect(branches).toHaveLength(CANONICAL_READ_COVERAGES.length);
    branches.forEach((b) => {
      expect(b.trigger?.kind).toBe('screen-coverage');
      expect(b.trigger?.actionId).toBe('pnr-1');
      expect(b.divergeAfterActionId).toBe('pnr-1');
      expect(b.trigger?.coverage).toHaveLength(1);
    });
    const coverages = branches.map((b) => b.trigger!.coverage[0]);
    expect(coverages).toEqual(CANONICAL_READ_COVERAGES);
  });

  it('toutes les actions produites sont consommables par un générateur', () => {
    const branches = buildCanonicalReadBranches(PNR, { weakSideId: 'O3' }, counterIds());
    branches.forEach((b) => {
      b.actions.forEach((a) => {
        if (a.kind === 'offensive') {
          expect(SCRIPTED_GENERATORS[a.type]).toBeTypeOf('function');
        }
      });
    });
  });

  it('blitz sans côté faible → seulement la passe au roller', () => {
    const branches = buildCanonicalReadBranches(PNR, {}, counterIds());
    const blitz = branches.find((b) => b.trigger!.coverage[0] === 'blitz')!;
    expect(blitz.actions).toHaveLength(1);
    expect(blitz.actions[0]).toMatchObject({ type: 'pass', params: { from: 'O1', to: 'O5' } });
  });

  it('blitz avec côté faible → short roll + skip + tir', () => {
    const branches = buildCanonicalReadBranches(PNR, { weakSideId: 'O3' }, counterIds());
    const blitz = branches.find((b) => b.trigger!.coverage[0] === 'blitz')!;
    expect(blitz.actions.map((a) => a.kind === 'offensive' && a.type)).toEqual([
      'pass',
      'kick-out',
      'shoot',
    ]);
  });

  it('drop → pull-up / drive du porteur', () => {
    const branches = buildCanonicalReadBranches(PNR, {}, counterIds());
    const drop = branches.find((b) => b.trigger!.coverage[0] === 'drop')!;
    expect(drop.actions[0]).toMatchObject({ type: 'drive', params: { driver: 'O1' } });
  });

  it('hedge → re-screen (re-pick) avec mêmes porteur/poseur', () => {
    const branches = buildCanonicalReadBranches(PNR, {}, counterIds());
    const hedge = branches.find((b) => b.trigger!.coverage[0] === 'hedge')!;
    expect(hedge.actions[0]).toMatchObject({
      type: 'pick-and-roll',
      params: { ballHandler: 'O1', screener: 'O5' },
    });
  });

  it('retourne [] si la source n\'a pas de porteur + poseur', () => {
    const incomplete: OffensiveScriptedAction = {
      kind: 'offensive',
      id: 'x',
      type: 'drive',
      params: { driver: 'O1' },
    };
    expect(buildCanonicalReadBranches(incomplete, {}, counterIds())).toEqual([]);
  });
});
