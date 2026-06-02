// Phase Motion C — ball-chain : route le ballon à travers une chaîne ordonnée
// de joueurs (reversal = passes, dho-chain = hand-offs, ou mixte). Délègue
// chaque lien aux générateurs un-lien existants. Voir
// docs/superpowers/specs/2026-06-02-ball-chain-design.md.

import type { OffensiveScriptedAction, Step } from '../../types';
import type { Generator } from './helpers';
import { genHandOff, genPass } from './tier1';

/** Déroule la chaîne `action.params.chain` en steps, lien par lien. Le mode de
 *  chaque lien = `chainLinkModes[i] ?? defaultMode`. Chaque lien reçoit un id
 *  namespacé `${action.id}#l${i}` (préservation manualOverride). Thread l'état :
 *  le dernier step d'un lien devient le `prev` du suivant. chain absent / < 2 →
 *  [] (no-op, comme les autres générateurs). */
export function expandBallChain(
  prev: Step,
  action: OffensiveScriptedAction,
  defaultMode: 'pass' | 'dho',
): Step[] {
  const chain = action.params.chain;
  if (!chain || chain.length < 2) return [];
  const modes = action.params.chainLinkModes;
  const steps: Step[] = [];
  let cur = prev;
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i];
    const b = chain[i + 1];
    const mode = modes?.[i] ?? defaultMode;
    const sub: OffensiveScriptedAction =
      mode === 'dho'
        ? { kind: 'offensive', id: `${action.id}#l${i}`, type: 'hand-off', params: { giver: a, receiver: b } }
        : { kind: 'offensive', id: `${action.id}#l${i}`, type: 'pass', params: { from: a, to: b } };
    const linkSteps = mode === 'dho' ? genHandOff(cur, sub) : genPass(cur, sub);
    steps.push(...linkSteps);
    if (linkSteps.length) cur = linkSteps[linkSteps.length - 1];
  }
  return steps;
}

export const genBallReversal: Generator = (prev, action) => expandBallChain(prev, action, 'pass');
export const genDhoChain: Generator = (prev, action) => expandBallChain(prev, action, 'dho');
