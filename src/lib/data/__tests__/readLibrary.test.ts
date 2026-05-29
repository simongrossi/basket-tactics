// Tests L.1.2 — bibliothèque de lectures canoniques.

import { describe, expect, it } from 'vitest';
import type { OffensiveScriptedAction, ScenarioBranch, ScreenRule } from '@/lib/types';
import { SCRIPTED_GENERATORS } from '@/lib/logic/scriptedGenerators';
import {
  buildCanonicalReadBranches,
  buildDriveKickReads,
  buildBackdoorReads,
  CANONICAL_READ_COVERAGES,
  DRIVE_KICK_SOURCES,
} from '@/lib/data/readLibrary';

/** Couverture d'une branche écran (narrowing de l'union ReadTrigger). */
const covOf = (b: ScenarioBranch): ScreenRule[] =>
  b.trigger?.kind === 'screen-coverage' ? b.trigger.coverage : [];

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
      expect(covOf(b)).toHaveLength(1);
    });
    const coverages = branches.map((b) => covOf(b)[0]);
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
    const blitz = branches.find((b) => covOf(b)[0] === 'blitz')!;
    expect(blitz.actions).toHaveLength(1);
    expect(blitz.actions[0]).toMatchObject({ type: 'pass', params: { from: 'O1', to: 'O5' } });
  });

  it('blitz avec côté faible → short roll + skip + tir', () => {
    const branches = buildCanonicalReadBranches(PNR, { weakSideId: 'O3' }, counterIds());
    const blitz = branches.find((b) => covOf(b)[0] === 'blitz')!;
    expect(blitz.actions.map((a) => a.kind === 'offensive' && a.type)).toEqual([
      'pass',
      'kick-out',
      'shoot',
    ]);
  });

  it('drop → pull-up / drive du porteur', () => {
    const branches = buildCanonicalReadBranches(PNR, {}, counterIds());
    const drop = branches.find((b) => covOf(b)[0] === 'drop')!;
    expect(drop.actions[0]).toMatchObject({ type: 'drive', params: { driver: 'O1' } });
  });

  it('hedge → re-screen (re-pick) avec mêmes porteur/poseur', () => {
    const branches = buildCanonicalReadBranches(PNR, {}, counterIds());
    const hedge = branches.find((b) => covOf(b)[0] === 'hedge')!;
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

const DRIVE: OffensiveScriptedAction = {
  kind: 'offensive',
  id: 'drive-1',
  type: 'drive',
  params: { driver: 'O1' },
};

describe('buildDriveKickReads (L.3)', () => {
  const helpOf = (b: ScenarioBranch) =>
    b.trigger?.kind === 'help-source' ? b.trigger.source : [];

  it('une branche par origine d\'aide, déclencheurs help-source', () => {
    const branches = buildDriveKickReads(
      DRIVE, { attackers: ['O1', 'O2', 'O3', 'O4', 'O5'] }, counterIds(),
    );
    expect(branches).toHaveLength(DRIVE_KICK_SOURCES.length);
    expect(branches.flatMap(helpOf)).toEqual(DRIVE_KICK_SOURCES);
    branches.forEach((b) => expect(b.divergeAfterActionId).toBe('drive-1'));
  });

  it('receveur fallback = 1er attaquant ≠ pénétrant ; actions consommables', () => {
    const branches = buildDriveKickReads(
      DRIVE, { attackers: ['O1', 'O2', 'O3', 'O4', 'O5'] }, counterIds(),
    );
    branches.forEach((b) => {
      b.actions.forEach((a) => {
        if (a.kind === 'offensive') expect(SCRIPTED_GENERATORS[a.type]).toBeTypeOf('function');
      });
      const first = b.actions[0];
      if (first.kind === 'offensive') {
        expect(first.params.from).toBe('O1');
        expect(first.params.to).toBe('O2'); // 1er ≠ driver
      }
    });
  });

  it('receveurs explicites par origine', () => {
    const branches = buildDriveKickReads(
      DRIVE,
      { receivers: { weak: 'O3', strong: 'O2', low: 'O5' }, attackers: ['O1', 'O2', 'O3', 'O4', 'O5'] },
      counterIds(),
    );
    const low = branches.find((b) => helpOf(b)[0] === 'low')!;
    const lowFirst = low.actions[0];
    expect(lowFirst.kind === 'offensive' && lowFirst.params.to).toBe('O5');
  });

  it('retourne [] sans pénétrant', () => {
    const noDriver: OffensiveScriptedAction = { kind: 'offensive', id: 'x', type: 'drive', params: {} };
    expect(buildDriveKickReads(noDriver, {}, counterIds())).toEqual([]);
  });
});

describe('buildBackdoorReads (L.3)', () => {
  it('passe avec receveur → une lecture deny + backdoor-cut', () => {
    const pass: OffensiveScriptedAction = {
      kind: 'offensive', id: 'pass-1', type: 'pass', params: { from: 'O1', to: 'O3' },
    };
    const branches = buildBackdoorReads(pass, counterIds());
    expect(branches).toHaveLength(1);
    const t = branches[0].trigger;
    expect(t?.kind === 'deny' && t.receiver).toBe('O3');
    expect(branches[0].actions[0]).toMatchObject({ type: 'backdoor-cut', params: { cutter: 'O3' } });
  });

  it('retourne [] sans receveur', () => {
    const drive: OffensiveScriptedAction = { kind: 'offensive', id: 'x', type: 'drive', params: { driver: 'O1' } };
    expect(buildBackdoorReads(drive, counterIds())).toEqual([]);
  });
});
