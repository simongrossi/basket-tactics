// J.6 — Golden snapshots pour visual regression.
//
// Pour 4 templates de référence, on capture le scene state à des
// instants clés et on le compare au snapshot stocké. Toute modification
// du moteur qui décale les positions sera détectée automatiquement.
//
// Si le diff est volontaire (ex: nouveau comportement défensif), regenerer
// les snapshots via :
//   npx vitest run j6GoldenSnapshots -u
//
// Cap : 4 templates choisis pour couvrir des situations distinctes :
//   - ucla-cut          : coupe classique (off-ball motion)
//   - pnr-central       : PnR cœur de terrain (carrierDef en contact)
//   - pindown-corner    : pindown latéral (off-ball screen)
//   - floppy            : double pindown miroir (off-ball complexe)

import { describe, expect, it } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import { snapshotScene } from '@/lib/logic/playback/sceneSnapshot';

const GOLDEN_IDS = ['ucla-cut', 'pnr-central', 'pindown-corner', 'floppy'] as const;

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId);
  if (!tpl) throw new Error(`Template introuvable : ${tplId}`);
  return {
    ...makeInitialState(),
    steps: structuredClone(tpl.steps),
    defenseInitial: structuredClone(tpl.defenseInitial),
    activeStep: 0,
  };
}

describe('J.6 — golden scene snapshots', () => {
  for (const tplId of GOLDEN_IDS) {
    it(`snapshot stable pour template ${tplId}`, () => {
      const state = buildState(tplId);
      const snapshot = snapshotScene(state, tplId);
      expect(snapshot).toMatchSnapshot();
    });
  }

  it('snapshot label correspond à l\'argument label', () => {
    const state = buildState('ucla-cut');
    const snap = snapshotScene(state, 'my-custom-label');
    expect(snap.label).toBe('my-custom-label');
  });

  it('sample points par défaut couvrent toutes les transitions', () => {
    const state = buildState('ucla-cut');
    const snap = snapshotScene(state, 'ucla-cut');
    // Nombre attendu : 2 × (steps - 1) + 1 = 2 * transitions + 1.
    const totalTransitions = state.steps.length - 1;
    expect(snap.frames.length).toBe(2 * totalTransitions + 1);
  });

  it('sample points custom respectés', () => {
    const state = buildState('pnr-central');
    const snap = snapshotScene(state, 'pnr-central', [0, 0.5, 1]);
    expect(snap.frames.length).toBe(3);
    expect(snap.frames.map((f) => f.t)).toEqual([0, 0.5, 1]);
  });

  it('positions arrondies à 1 décimale (stabilité cross-machine)', () => {
    const state = buildState('ucla-cut');
    const snap = snapshotScene(state, 'ucla-cut', [0.5]);
    const frame = snap.frames[0];
    Object.values(frame.off).forEach((p) => {
      // Multiplier par 10 doit donner un entier (tolérance flottants).
      expect(Math.abs(p.x * 10 - Math.round(p.x * 10))).toBeLessThan(0.0001);
      expect(Math.abs(p.y * 10 - Math.round(p.y * 10))).toBeLessThan(0.0001);
    });
  });

  it('def snapshot inclut matchedTo et flags non-default', () => {
    const state = buildState('pnr-central');
    const snap = snapshotScene(state, 'pnr-central', [0]);
    const frame = snap.frames[0];
    // D1 doit avoir un matchedTo défini.
    expect(frame.def.D1.matchedTo).toBeDefined();
    // helpFactor: 0 → champ omis. helpFactor > 0 → champ présent (peut
    // arriver selon le template).
    Object.values(frame.def).forEach((d) => {
      if (d.helpFactor !== undefined) {
        expect(d.helpFactor).toBeGreaterThan(0);
      }
    });
  });
});
