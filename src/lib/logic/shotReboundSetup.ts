// A11 V1 — Builder pur pour le step de rebond après tir manqué.
//
// Pattern identique à F.2 `buildFreeThrowReboundSetup` (course-rebond
// post-lancer franc), généralisé aux tirs live :
//   1. Récupère les positions du step source (where the shot was taken).
//   2. Calcule des positions box-out pour les défenseurs (chacun entre
//      son matched et le panier, à BOXOUT_OFFSET_PX du matched).
//   3. Appelle `computeRebound` (modèle probabiliste de match/rebound.ts)
//      pour identifier qui récupère.
//   4. Retourne un setup complet, consommé par le setter
//      `addShotReboundStep` qui injecte ça dans state.steps.
//
// Module pur : prend un AppState, retourne un nouvel objet. Pas de
// side-effect. Le RNG est injectable via `options.seed` pour la
// reproductibilité des tests.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
  Point,
} from '../types';
import { effectiveDefensePositions, getDefenseHoop } from './engine';
import { activeBallCarrier, activeOffense, getActiveDefenderIds } from './players';
import { computeRebound, type ReboundType } from './match/rebound';
import { getShotPosForStep } from './shotTracking';

/** Distance défenseur ↔ son matched lors du box-out (px). Identique à
 *  la valeur utilisée par la game loop (`gameLoop.BOXOUT_OFFSET_PX`). */
const BOXOUT_OFFSET_PX = 18;

/** Décalage en px du rebondeur attaquant vers le cercle après rebond
 *  offensif (= le rebondeur saute au cercle, prêt pour la 2e chance). */
const REBOUNDER_OFFENSIVE_PULL_PX = 25;

/** Décalage en px du rebondeur défenseur vers le cercle après rebond
 *  défensif (= secure le ballon sous le cercle). */
const REBOUNDER_DEFENSIVE_PULL_PX = 20;

export interface BuildShotReboundOptions {
  /** Graine RNG pour reproductibilité tests. Si absent, Math.random. */
  seed?: number;
}

export interface ShotReboundSetup {
  /** Positions attaquants du step de rebond. Identiques au step source
   *  sauf pour le rebondeur si offensif (poussé vers le cercle). */
  off: AttackerPositions;
  /** Positions défenseurs en box-out. À appliquer via defenseOverrides
   *  pour figer (équivalent au pattern F.2 free-throw). */
  def: DefenderPositions;
  /** Porteur du step de rebond. Rebondeur si attaquant ; shooter
   *  d'origine sinon (informatif, le diag coach voit le rebondeur via
   *  `rebounder`). */
  ballCarrier: AttackerId;
  /** Joueur qui a récupéré la balle. null si team-out. */
  rebounder: AttackerId | DefenderId | null;
  /** Type du rebond. */
  reboundType: ReboundType;
}

/** Petit RNG seedé déterministe (xorshift32 simplifié). Conserve la
 *  reproductibilité même si Math.random change selon le runtime. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 0x12345678;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff);
  };
}

/**
 * Construit le setup d'un step de rebond à partir du step source
 * (= step où le tir a été pris, doit avoir `shotOutcome === 'missed'`).
 *
 * Le setup retourné peut être injecté dans state.steps via le setter
 * `addShotReboundStep`.
 */
export function buildShotReboundSetup(
  state: AppState,
  sourceStepIdx: number,
  options: BuildShotReboundOptions = {}
): ShotReboundSetup {
  const sourceStep = state.steps[sourceStepIdx];
  if (!sourceStep) {
    throw new Error(`buildShotReboundSetup: sourceStepIdx ${sourceStepIdx} invalide`);
  }

  const off = activeOffense(sourceStep.off, state.playerCount);
  const defPos = effectiveDefensePositions(state, sourceStepIdx);
  const hoop = getDefenseHoop(state);
  const shooter = activeBallCarrier(sourceStep, state.playerCount);
  const shotPos = getShotPosForStep(sourceStep, state.playerCount) ?? hoop;

  // 1. Positions défenseurs en box-out : chacun entre matched et panier.
  const boxOutDef: DefenderPositions = {} as DefenderPositions;
  const defenderIds = getActiveDefenderIds(state.playerCount);
  defenderIds.forEach((dId) => {
    const def = defPos[dId];
    if (!def) return;
    const matched = def.matchedTo;
    const att = off[matched];
    if (!att) {
      boxOutDef[dId] = { x: def.x, y: def.y };
      return;
    }
    const dx = hoop.x - att.x;
    const dy = hoop.y - att.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) {
      boxOutDef[dId] = { x: def.x, y: def.y };
      return;
    }
    boxOutDef[dId] = {
      x: att.x + (dx / d) * BOXOUT_OFFSET_PX,
      y: att.y + (dy / d) * BOXOUT_OFFSET_PX,
    };
  });

  // 2. Calcul du rebond probabiliste (réutilise computeRebound de match/).
  const rng = options.seed !== undefined ? seededRng(options.seed) : Math.random;
  const reboundResult = computeRebound({
    off,
    defPos,
    hoop,
    shotPos,
    attackerProfiles: state.attackerProfiles,
    shooter,
    rng,
  });

  // 3. Ajustement des positions selon le type de rebond.
  const finalOff: AttackerPositions = { ...off };
  const finalDef: DefenderPositions = { ...boxOutDef };
  let ballCarrier: AttackerId = shooter;

  if (reboundResult.type === 'offensive' && reboundResult.rebounder) {
    const reb = reboundResult.rebounder as AttackerId;
    // Le rebondeur attaquant saute au cercle.
    const cur = off[reb];
    if (cur) {
      const dx = hoop.x - cur.x;
      const dy = hoop.y - cur.y;
      const d = Math.hypot(dx, dy);
      const pull = Math.min(REBOUNDER_OFFENSIVE_PULL_PX, d);
      finalOff[reb] = d > 0.01 ? {
        x: cur.x + (dx / d) * pull,
        y: cur.y + (dy / d) * pull,
      } : cur;
    }
    ballCarrier = reb;
  } else if (reboundResult.type === 'defensive' && reboundResult.rebounder) {
    const reb = reboundResult.rebounder as DefenderId;
    // Le rebondeur défenseur secure sous le cercle.
    const cur = boxOutDef[reb];
    if (cur) {
      const dx = hoop.x - cur.x;
      const dy = hoop.y - cur.y;
      const d = Math.hypot(dx, dy);
      const pull = Math.min(REBOUNDER_DEFENSIVE_PULL_PX, d);
      finalDef[reb] = d > 0.01 ? {
        x: cur.x + (dx / d) * pull,
        y: cur.y + (dy / d) * pull,
      } : cur;
    }
    // ballCarrier reste l'attaquant shooter (le moteur n'accepte qu'un
    // AttackerId comme carrier). Le diag coach sait via `rebounder` que
    // la possession est défensive et qu'une transition doit suivre.
    ballCarrier = shooter;
  }

  return {
    off: finalOff,
    def: finalDef,
    ballCarrier,
    rebounder: reboundResult.rebounder,
    reboundType: reboundResult.type,
  };
}

/** Helper pour générer un label lisible pour le step de rebond. */
export function reboundStepLabel(setup: ShotReboundSetup): string {
  if (setup.reboundType === 'offensive' && setup.rebounder) {
    return `Rebond offensif ${setup.rebounder}`;
  }
  if (setup.reboundType === 'defensive' && setup.rebounder) {
    return `Rebond défensif ${setup.rebounder}`;
  }
  return 'Rebond team-out';
}

/** Export pour les tests. */
export { BOXOUT_OFFSET_PX, REBOUNDER_OFFENSIVE_PULL_PX, REBOUNDER_DEFENSIVE_PULL_PX };
