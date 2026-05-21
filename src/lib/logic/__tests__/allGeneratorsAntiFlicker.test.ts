// P0.1 — Audit anti-flicker pour TOUS les générateurs scripted FIBA.
//
// Vérifie que chaque générateur du registry SCRIPTED_GENERATORS produit
// une séquence de steps SANS demi-tour à 180° step→step (flicker
// critical Phase K K.4). Hérité du fix PnR (genPickAndRoll) qui a livré
// l'idée du dwell "Tenue écran" entre la pose et le roll.
//
// Le test compile une action de chaque type avec des params par défaut,
// puis scanne toutes les fenêtres 3-frame avec detectFlicker. Les
// générateurs qui produisent des flickers critical sont listés
// nominativement dans le message d'erreur pour faciliter le fix
// (pattern : insérer un step de "tenue" entre les phases de chaque
// action où un joueur change radicalement de direction).

import { describe, it, expect } from 'vitest';
import { SCRIPTED_GENERATORS } from '../scriptedGenerators';
import { compileScenario } from '../compileScenario';
import {
  detectFlicker,
  type FrameSnapshot,
} from '../anomaly/anomalyDetector';
import type { AttackerPositions, ScriptedAction, ScriptedActionType } from '../../types';

const initialOff: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 130, y: 380 },
  O3: { x: 470, y: 380 },
  O4: { x: 220, y: 230 },
  O5: { x: 380, y: 230 },
};

/** Params par défaut pour chaque type d'action.
 *  Choix orientés vers un scénario "demi-terrain side fort" classique. */
const DEFAULT_PARAMS: Record<string, Record<string, unknown>> = {
  // Tier 1
  'pick-and-roll': { screener: 'O5', ballHandler: 'O1', side: 'fort' },
  'pick-and-pop': { screener: 'O5', ballHandler: 'O1', side: 'fort' },
  'hand-off': { giver: 'O2', receiver: 'O1' },
  'give-and-go': { passer: 'O1', cutter: 'O2' },
  'basket-cut': { cutter: 'O3' },
  'backdoor-cut': { cutter: 'O3' },
  'flare-cut': { cutter: 'O2' },
  'curl-cut': { cutter: 'O2', screener: 'O4' },
  'shuffle-cut': { cutter: 'O2' },
  'pin-down': { screener: 'O4', cutter: 'O2' },
  'flare-screen': { screener: 'O4', cutter: 'O2' },
  'back-screen': { screener: 'O4', cutter: 'O2' },
  'cross-screen': { screener: 'O4', cutter: 'O5' },
  'screen-the-screener': { firstScreener: 'O4', secondScreener: 'O5', cutter: 'O2' },
  drive: { driver: 'O1' },
  pass: { passer: 'O1', receiver: 'O3' },
  'kick-out': { passer: 'O1', receiver: 'O2' },
  shoot: { shooter: 'O1' },
  isolation: { iso: 'O1' },

  // Tier 2 — Cuts
  'flash-cut': { cutter: 'O4' },
  'flex-cut': { cutter: 'O2', screener: 'O4' },
  'i-cut': { cutter: 'O2' },
  'popout-cut': { cutter: 'O2' },
  'shallow-cut': { cutter: 'O2' },
  'ucla-cut': { cutter: 'O2', screener: 'O4' },
  'v-cut': { cutter: 'O2' },
  'l-cut': { cutter: 'O2' },
  'banana-cut': { cutter: 'O2' },
  'iverson-cut': { cutter: 'O1', firstScreener: 'O4', secondScreener: 'O5' },

  // Tier 2 — Off-ball screens
  'staggered-screen': { cutter: 'O2', firstScreener: 'O4', secondScreener: 'O5' },
  'elevator-screen': { cutter: 'O2', firstScreener: 'O4', secondScreener: 'O5' },
  'hammer-screen': { screener: 'O4', cutter: 'O2' },
  'ram-screen': { firstScreener: 'O4', secondScreener: 'O5', ballHandler: 'O1' },
  'wide-screen': { screener: 'O4', cutter: 'O2' },
  'wiper-screen': { screener: 'O4', cutter: 'O2' },
  'screen-away': { passer: 'O1', receiver: 'O2', screener: 'O4', cutter: 'O3' },

  // Tier 2 — PnR variants
  slip: { screener: 'O5', ballHandler: 'O1', side: 'fort' },
  reject: { screener: 'O5', ballHandler: 'O1', side: 'fort' },
  'drag-screen': { screener: 'O5', ballHandler: 'O1' },
  'step-up-screen': { screener: 'O5', ballHandler: 'O1' },
  'ghost-screen': { screener: 'O5', ballHandler: 'O1' },

  // Tier 2 — Combinations
  'zoom-action': { giver: 'O2', cutter: 'O1', screener: 'O4' },
  'rip-dho': { giver: 'O2', cutter: 'O1', screener: 'O4' },
  'slide-action': { cutter: 'O2', screener: 'O4' },
  'split-action': { passer: 'O1', receiver: 'O3', screener: 'O4', cutter: 'O2' },
  'high-low-action': { from: 'O4', to: 'O5' },

  // Tier 2 — Replacements
  drift: { cutter: 'O3' },
  lift: { cutter: 'O3' },
  replacement: { cutter: 'O3' },

  // Tier 3 — Sets (positionnement seul, peu de mouvement)
  'horns-set': {},
  'floppy-set': {},
  'pistol-set': {},
  'ucla-set': {},
  'iverson-set': {},
  'diamond-set': {},
  'chicago-set': {},
  'loop-set': {},
  'america-set': {},
};

function runFlickerScanForType(type: string): { criticals: string[]; stepCount: number } {
  const params = DEFAULT_PARAMS[type] ?? {};
  const actions: ScriptedAction[] = [
    { kind: 'offensive', id: `test-${type}`, type: type as ScriptedActionType, params },
  ];
  const compiled = compileScenario({
    initialOff,
    initialBallCarrier: 'O1',
    actions,
  });

  const emptyDef = {} as FrameSnapshot['defPos'];
  const snapshots: FrameSnapshot[] = compiled.map((s, i) => ({
    stepIdx: i,
    off: s.off,
    defPos: emptyDef,
  }));

  const criticals: string[] = [];
  for (let i = 2; i < snapshots.length; i++) {
    const reports = detectFlicker(snapshots[i - 2], snapshots[i - 1], snapshots[i]);
    reports
      .filter((r) => r.severity === 'critical')
      .forEach((r) => criticals.push(`step ${i} ${r.playerId}: ${r.message}`));
  }

  return { criticals, stepCount: compiled.length };
}

describe('P0.1 — Audit anti-flicker tous générateurs scripted', () => {
  // Liste explicite vs. SCRIPTED_GENERATORS pour détecter une nouvelle action
  // ajoutée sans params par défaut configurés (test affichera l'absence).
  it('toutes les actions du registry ont des params par défaut configurés', () => {
    const registered = Object.keys(SCRIPTED_GENERATORS).sort();
    const known = Object.keys(DEFAULT_PARAMS).sort();
    const missing = registered.filter((t) => !known.includes(t));
    expect(missing, `Actions sans params défaut : ${missing.join(', ')}`).toEqual([]);
  });

  // Test agrégé : on liste tous les générateurs avec flickers critical pour
  // pouvoir fixer en batch. Le test fail si AU MOINS UN générateur produit
  // un flicker critical.
  it('aucun générateur ne produit de flicker critical step→step (180° flip)', () => {
    const culprits: Record<string, string[]> = {};
    Object.keys(SCRIPTED_GENERATORS).forEach((type) => {
      const { criticals } = runFlickerScanForType(type);
      if (criticals.length > 0) {
        culprits[type] = criticals;
      }
    });

    const summary = Object.keys(culprits)
      .map((t) => `  ${t}:\n    ${culprits[t].join('\n    ')}`)
      .join('\n');

    expect(
      culprits,
      `Générateurs avec flicker critical détecté (cf. fix PnR pour pattern dwell) :\n${summary}`,
    ).toEqual({});
  });
});
