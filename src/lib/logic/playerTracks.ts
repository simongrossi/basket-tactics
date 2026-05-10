import type {
  AppState,
  AttackerId,
  DefenderId,
  PlayerCount,
  Step,
} from '../types';
import {
  activeBallCarrier,
  getActiveAttackerIds,
  getActiveDefenderIds,
} from './players';
import { effectiveDefensePositions } from './engine';
import { distance } from './geometry';

/**
 * Type d'activité d'un joueur sur une transition (Step N → Step N+1).
 *
 *  - 'idle'      : aucun mouvement notable (< 5 px) et aucune annotation
 *  - 'dribble'   : annotation dribble OU porteur qui se déplace
 *  - 'cut'       : annotation cut OU non-porteur qui se déplace sans annotation
 *  - 'screen'    : annotation screen
 *  - 'pass'      : annotation pass (présente sur le passeur uniquement)
 *  - 'help'      : défenseur en aide (helpFactor > 0.4)
 *  - 'closeout'  : défenseur en closeout (closingOut === true)
 *  - 'tracking'  : défenseur qui suit son matchup (déplacement modéré)
 *  - 'pos'       : défenseur statique tenant sa position
 */
export type PlayerActivity =
  | 'idle'
  | 'dribble'
  | 'cut'
  | 'screen'
  | 'pass'
  | 'help'
  | 'closeout'
  | 'tracking'
  | 'pos';

export interface TrackSegment {
  /** Index du step de départ (transition step N → step N+1). */
  fromStepIdx: number;
  activity: PlayerActivity;
  /** Si le joueur est porteur de la balle pendant cette transition. */
  isCarrier: boolean;
  /** Détail textuel court pour tooltip ("→ panier", "→ écran D1", etc). */
  detail?: string;
  /** Distance parcourue en px (pour les attaquants, transition). */
  movePx: number;
}

export interface PlayerTrack {
  id: AttackerId | DefenderId;
  kind: 'attacker' | 'defender';
  segments: TrackSegment[];
}

const MIN_MOVE_PX = 5;
const DEF_HELP_FACTOR_MIN = 0.4;
const DEF_TRACKING_MIN_PX = 15;

/**
 * Construit les pistes par joueur à partir de l'état du scénario. Chaque
 * piste contient (nbSteps - 1) segments, un par transition entre deux étapes
 * consécutives. Les steps interpolés (isInterpolated) sont fusionnés avec
 * leur step terminal pour ne pas polluer la lecture.
 */
export function computePlayerTracks(state: AppState): PlayerTrack[] {
  // Réindexe les steps en gardant uniquement les non-interpolés. La modal
  // affiche les pistes à l'échelle des étapes "vraies" qui correspondent à
  // l'expérience utilisateur dans le panneau étapes.
  const allSteps = state.steps;
  const realSteps: { idx: number; step: Step }[] = [];
  allSteps.forEach((s, i) => {
    if (!s.isInterpolated) realSteps.push({ idx: i, step: s });
  });

  if (realSteps.length < 2) return [];

  const attackerIds = getActiveAttackerIds(state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);
  const tracks: PlayerTrack[] = [];

  // Pistes attaquants — basées sur annotations + diff de position.
  attackerIds.forEach((id) => {
    const segments: TrackSegment[] = [];
    for (let i = 0; i < realSteps.length - 1; i++) {
      const cur = realSteps[i].step;
      const nxt = realSteps[i + 1].step;
      const a = cur.off[id];
      const b = nxt.off[id];
      const move = a && b ? distance(a, b) : 0;
      const isCarrier = cur.ballCarrier === id;
      let activity: PlayerActivity = 'idle';
      let detail: string | undefined;

      // Annotation présente pour ce joueur sur Step N (décrit la transition).
      const annoMove = cur.annotations.find(
        (an) =>
          (an.type === 'cut' || an.type === 'screen' || an.type === 'dribble') &&
          an.fromId === id,
      );
      const annoPass = cur.annotations.find(
        (an) => an.type === 'pass' && an.fromId === id,
      );

      if (annoMove) {
        activity = annoMove.type as PlayerActivity;
        if (annoMove.type === 'screen' && annoMove.toId) detail = `→ ${annoMove.toId}`;
      } else if (annoPass) {
        activity = 'pass';
        if (annoPass.toId) detail = `→ ${annoPass.toId}`;
      } else if (move > MIN_MOVE_PX) {
        activity = isCarrier ? 'dribble' : 'cut';
      }

      segments.push({ fromStepIdx: i, activity, isCarrier, detail, movePx: move });
    }
    tracks.push({ id, kind: 'attacker', segments });
  });

  // Pistes défenseurs — basées sur effectiveDefensePositions + role.
  defenderIds.forEach((id) => {
    const segments: TrackSegment[] = [];
    for (let i = 0; i < realSteps.length - 1; i++) {
      const ia = realSteps[i].idx;
      const ib = realSteps[i + 1].idx;
      const defA = effectiveDefensePositions(state, ia)[id];
      const defB = effectiveDefensePositions(state, ib)[id];
      const move = defA && defB ? distance(defA, defB) : 0;
      let activity: PlayerActivity = 'pos';
      let detail: string | undefined;

      if (defB?.closingOut) {
        activity = 'closeout';
      } else if (defB && defB.helpFactor > DEF_HELP_FACTOR_MIN) {
        activity = 'help';
        if (defB.helpKind) detail = defB.helpKind;
      } else if (move > DEF_TRACKING_MIN_PX) {
        activity = 'tracking';
        if (defB?.matchedTo) detail = `↳ ${defB.matchedTo}`;
      }

      segments.push({ fromStepIdx: i, activity, isCarrier: false, detail, movePx: move });
    }
    tracks.push({ id, kind: 'defender', segments });
  });

  return tracks;
}

/**
 * Couleurs de fond par type d'activité, pour le rendu visuel. Bleus =
 * défense, oranges = attaque, gris = idle/position.
 */
export const ACTIVITY_COLORS: Record<PlayerActivity, { bg: string; fg: string; label: string }> = {
  idle:     { bg: '#f1f5f9', fg: '#94a3b8', label: 'idle' },
  pos:      { bg: '#e2e8f0', fg: '#64748b', label: 'position' },
  dribble:  { bg: '#fed7aa', fg: '#9a3412', label: 'dribble' },
  cut:      { bg: '#fde68a', fg: '#92400e', label: 'cut' },
  screen:   { bg: '#fca5a5', fg: '#991b1b', label: 'écran' },
  pass:     { bg: '#fbbf24', fg: '#78350f', label: 'passe' },
  tracking: { bg: '#bfdbfe', fg: '#1e3a8a', label: 'suit' },
  closeout: { bg: '#93c5fd', fg: '#1e3a8a', label: 'closeout' },
  help:     { bg: '#a5b4fc', fg: '#312e81', label: 'aide' },
};

/**
 * Helper : compte le nombre de steps "réels" (hors interpolés). Utile pour
 * dimensionner la timeline modal.
 */
export function countRealSteps(state: AppState): number {
  return state.steps.filter((s) => !s.isInterpolated).length;
}

/**
 * Convertit un index de step (dans state.steps incluant les interpolés) vers
 * l'index dans la liste filtrée des "vrais" steps. Sert à synchroniser le
 * curseur global avec les pistes affichées dans la modal.
 */
export function realStepIndex(state: AppState, fullStepIdx: number): number {
  let count = 0;
  for (let i = 0; i <= fullStepIdx && i < state.steps.length; i++) {
    if (!state.steps[i].isInterpolated) {
      if (i === fullStepIdx) return count;
      count++;
    }
  }
  return count;
}
