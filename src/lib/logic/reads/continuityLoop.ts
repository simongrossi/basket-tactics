// Phase Motion — continuity offense : déroulé (unroll) au compile-time d'une
// plage d'actions, avec rotation des rôles. Purs. Voir
// docs/superpowers/specs/2026-06-02-continuity-motion-offense-design.md.

import type { AttackerId, ContinuityLoop, ScriptedAction, ScriptedActionParams } from '../../types';

/** Champs de params qui référencent un joueur (à remapper par σ^k). Les autres
 *  (side, direction, zones) sont laissés intacts. */
const PLAYER_FIELDS = [
  'ballHandler', 'screener', 'cutter', 'passer', 'receiver', 'giver',
  'driver', 'shooter', 'from', 'to', 'firstScreener', 'secondScreener',
] as const;

/** σ^k(p) : avance le joueur `p` de k crans sur la roue `rotation`. Joueur
 *  hors roue → identité. */
function sigmaPow(p: AttackerId, rotation: AttackerId[], k: number): AttackerId {
  const idx = rotation.indexOf(p);
  if (idx < 0) return p;
  return rotation[(idx + k) % rotation.length];
}

/** Remappe les champs joueur de `params` par σ^k. Champs non-joueur intacts. */
export function rotateActionParams(
  params: ScriptedActionParams,
  rotation: AttackerId[],
  k: number,
): ScriptedActionParams {
  if (k === 0) return params;
  const out: ScriptedActionParams = { ...params };
  for (const f of PLAYER_FIELDS) {
    const v = params[f];
    if (v) out[f] = sigmaPow(v, rotation, k);
  }
  return out;
}

const MAX_CYCLES_CAP = 6;

/** Applique σ^k à une action OFFENSIVE et lui donne un id de cycle unique
 *  (`${id}#c${k}`) pour le namespacing des manualOverride. k=0 = identité. */
function rotateAction(action: ScriptedAction, rotation: AttackerId[], k: number): ScriptedAction {
  if (action.kind !== 'offensive' || k === 0) return action;
  return { ...action, id: `${action.id}#c${k}`, params: rotateActionParams(action.params, rotation, k) };
}

function isPermutationOf(rotation: AttackerId[], active: AttackerId[]): boolean {
  if (rotation.length !== active.length) return false;
  const set = new Set(rotation);
  if (set.size !== rotation.length) return false; // doublons
  return active.every((a) => set.has(a));
}

export interface ContinuityExpandOptions {
  /** Vrai au cycle k → la boucle sort tôt (cycle k NON joué). */
  exitAtCycle?: (cycle: number) => boolean;
  /** Actions de finition jouées (remappées σ^k) à la sortie anticipée. */
  exitActions?: ScriptedAction[];
}

/** Déroule la boucle de continuité en une liste d'actions plate.
 *  Boucle invalide (rotation non-permutation, plage invalide, corps non
 *  exclusivement offensif) → renvoie `actions` inchangé (fallback legacy). */
export function expandContinuityLoop(
  actions: ScriptedAction[],
  loop: ContinuityLoop | undefined | null,
  activeAttackers: AttackerId[],
  options?: ContinuityExpandOptions,
): ScriptedAction[] {
  if (!loop) return actions;
  if (!isPermutationOf(loop.rotation, activeAttackers)) return actions;

  const startIdx = actions.findIndex((a) => a.id === loop.startActionId);
  const endIdx = actions.findIndex((a) => a.id === loop.endActionId);
  if (startIdx < 0 || endIdx < 0 || startIdx > endIdx) return actions;

  const body = actions.slice(startIdx, endIdx + 1);
  if (body.some((a) => a.kind !== 'offensive')) return actions;

  const before = actions.slice(0, startIdx);
  const after = actions.slice(endIdx + 1);
  const cycles = Math.max(1, Math.min(MAX_CYCLES_CAP, Math.floor(loop.maxCycles)));

  const out: ScriptedAction[] = [...before];
  for (let k = 0; k < cycles; k++) {
    if (options?.exitAtCycle?.(k)) {
      for (const a of options.exitActions ?? []) out.push(rotateAction(a, loop.rotation, k));
      return [...out, ...after];
    }
    for (const a of body) out.push(rotateAction(a, loop.rotation, k));
  }
  return [...out, ...after];
}
