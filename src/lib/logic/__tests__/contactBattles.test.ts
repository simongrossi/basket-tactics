// Tests "Luttes de force" (Box-out / Post-up) — flag opt-in qui modélise
// les duels physiques pendant la phase box-out par poussée vectorielle
// défenseur→attaquant, avec réaction newtonienne amortie.
// Doit garantir Rule 1 (clearance 34px) via le filet pushOutOfMany final.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerId, DefenderId } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import {
  MATCH_TICK_MS,
  createInitialMatchState,
  tickMatch,
} from '../match/gameLoop';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

function baseStateFromTemplate(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  const base = makeInitialState();
  return {
    ...base,
    steps: tpl.steps,
    defenseInitial: tpl.defenseInitial,
    activeStep: 0,
  };
}

/** Force un tir manqué + démarre la phase box-out en injectant directement
 *  des cibles. Les positions sont configurées pour qu'un défenseur D2 soit
 *  pile à côté de son attaquant matché O2, près du panier. */
function makeBoxOutScenario(physicalEnabled: boolean) {
  const baseState: AppState = {
    ...baseStateFromTemplate('pnr-central'),
    physicalContactBattlesEnabled: physicalEnabled,
  };
  const state = createInitialMatchState(baseState, { seed: 42 });

  // Place O2 et D2 collés près du panier (hoop défense home ≈ x=300, y=75).
  state.off.O2 = { x: 320, y: 130 };
  state.defPos.D2 = {
    ...state.defPos.D2,
    x: 320,
    y: 105, // au-dessus de O2 (entre O2 et le panier)
    matchedTo: 'O2',
  };
  // Arme une phase box-out artificielle
  state.boxOutTargets = {
    D2: { x: 320, y: 95 },
  };
  state.boxOutStartedAtMs = 0;
  state.possessionTimeMs = 100; // 100 ms après le démarrage
  state.transitionStartedAtMs = 0;
  state.outcome = 'shot-missed';

  return { baseState, state };
}

describe('Luttes de force (physicalContactBattlesEnabled)', () => {
  it("pousse l'attaquant à l'opposé du panier quand le flag est on", () => {
    const off = makeBoxOutScenario(false);
    const on = makeBoxOutScenario(true);

    const nextOff = tickMatch(off.state, MATCH_TICK_MS, off.baseState);
    const nextOn = tickMatch(on.state, MATCH_TICK_MS, on.baseState);

    // Distance O2 ↔ panier (y=75) après le tick.
    const distOff = Math.abs(nextOff.off.O2.y - 75);
    const distOn = Math.abs(nextOn.off.O2.y - 75);
    // O2 doit être STRICTEMENT plus loin du panier avec le flag actif.
    expect(distOn).toBeGreaterThan(distOff);
  });

  it('respecte la clearance Rule 1 entre tous les joueurs après poussée', () => {
    const { state, baseState } = makeBoxOutScenario(true);
    const next = tickMatch(state, MATCH_TICK_MS, baseState);

    const attIds = Object.keys(next.off) as AttackerId[];
    const defIds = Object.keys(next.defPos) as DefenderId[];
    // Attaquant ↔ attaquant
    for (let i = 0; i < attIds.length; i++) {
      for (let j = i + 1; j < attIds.length; j++) {
        const a = next.off[attIds[i]];
        const b = next.off[attIds[j]];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        expect(d).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      }
    }
    // Attaquant ↔ défenseur
    for (const aid of attIds) {
      for (const did of defIds) {
        const a = next.off[aid];
        const d = next.defPos[did];
        const dist = Math.hypot(a.x - d.x, a.y - d.y);
        expect(dist).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      }
    }
  });

  it('reste no-op (positions inchangées) quand le flag est off', () => {
    const { state, baseState } = makeBoxOutScenario(false);
    const o2Before = { ...state.off.O2 };
    const d2Before = { x: state.defPos.D2.x, y: state.defPos.D2.y };
    const next = tickMatch(state, MATCH_TICK_MS, baseState);
    // Sans flag : seul le lerp box-out classique opère (0.3 × eased × delta).
    // On vérifie qu'O2 n'a PAS bougé arrière/avant de plus d'un seuil minime.
    // Le lerp box-out cible le défenseur seulement, l'attaquant reste fixe.
    expect(next.off.O2.x).toBeCloseTo(o2Before.x, 1);
    expect(next.off.O2.y).toBeCloseTo(o2Before.y, 1);
    // D2 a peut-être bougé vers sa boxOutTarget — c'est attendu.
    expect(next.defPos.D2.x).toBeCloseTo(d2Before.x, 0);
  });
});
