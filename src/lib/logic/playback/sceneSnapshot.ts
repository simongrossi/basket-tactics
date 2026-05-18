// J.6 — Snapshot scene state pour visual regression.
//
// Capture les positions clés des joueurs à des instants choisis du
// playback, sous forme d'objet sérialisable stable (positions arrondies
// à 1 décimale). Comparable via `toMatchSnapshot` de Vitest pour
// détecter automatiquement les régressions visuelles du moteur.
//
// Module pur, opt-in via les tests dédiés.

import type { AppState, AttackerId, DefenderId } from '../../types';
import { resolveFrameAt } from './frameResolver';

export interface PlayerSnapshot {
  /** Position arrondie à 1 décimale (px). Stabilise les snapshots face
   *  aux changements numériques mineurs (floating point). */
  x: number;
  y: number;
}

export interface DefenderSnapshot extends PlayerSnapshot {
  matchedTo: AttackerId;
  helpFactor?: number; // arrondi à 2 décimales si > 0
  helpTriggered?: boolean;
  onScreen?: boolean;
  screenPhase?: string;
}

export interface FrameSnapshot {
  /** Index global échantillonné (peut être fractionnaire). */
  t: number;
  /** Position du ballon. */
  ball: PlayerSnapshot & { inFlight: boolean };
  /** Position de chaque attaquant actif. */
  off: Record<AttackerId, PlayerSnapshot>;
  /** Position + état clé de chaque défenseur actif. */
  def: Record<DefenderId, DefenderSnapshot>;
}

export interface SceneSnapshot {
  /** Identifiant du scénario (pour grouping). */
  label: string;
  /** Frames échantillonnées dans l'ordre. */
  frames: FrameSnapshot[];
}

/** Arrondit à n décimales (stable cross-machines). */
function round(v: number, decimals: number = 1): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

/**
 * Génère un snapshot reproductible pour un AppState donné, à des points
 * d'échantillonnage choisis.
 *
 * @param state              AppState complet.
 * @param label              Identifiant lisible (= id du template usuellement).
 * @param sampleTs           Array de valeurs `t` globales (entiers ou
 *                           fractionnaires) où échantillonner. Default :
 *                           début + milieu + fin de chaque transition.
 */
export function snapshotScene(
  state: AppState,
  label: string,
  sampleTs?: number[],
): SceneSnapshot {
  const totalSteps = state.steps.length - 1;
  const ts = sampleTs ?? defaultSampleTs(totalSteps);
  const frames: FrameSnapshot[] = [];

  for (const t of ts) {
    const frame = resolveFrameAt(state, t);
    if (!frame) continue;
    const off: Record<string, PlayerSnapshot> = {};
    Object.entries(frame.off).forEach(([id, p]) => {
      off[id] = { x: round(p.x), y: round(p.y) };
    });
    const def: Record<string, DefenderSnapshot> = {};
    Object.entries(frame.defPos).forEach(([id, d]) => {
      def[id] = {
        x: round(d.x),
        y: round(d.y),
        matchedTo: d.matchedTo,
        ...(d.helpFactor > 0 ? { helpFactor: round(d.helpFactor, 2) } : {}),
        ...(d.helpTriggered ? { helpTriggered: true } : {}),
        ...(d.onScreen ? { onScreen: true } : {}),
        ...(d.screenPhase ? { screenPhase: d.screenPhase } : {}),
      };
    });
    frames.push({
      t,
      ball: { x: round(frame.ballPos.x), y: round(frame.ballPos.y), inFlight: frame.ballInFlight },
      off: off as Record<AttackerId, PlayerSnapshot>,
      def: def as Record<DefenderId, DefenderSnapshot>,
    });
  }

  return { label, frames };
}

/** Échantillons par défaut : début (t=0), milieu et fin de chaque transition. */
function defaultSampleTs(totalSteps: number): number[] {
  if (totalSteps < 1) return [0];
  const ts: number[] = [];
  for (let i = 0; i < totalSteps; i++) {
    ts.push(i);          // début transition (= step exact)
    ts.push(i + 0.5);    // milieu transition
  }
  ts.push(totalSteps);    // fin = dernier step exact
  return ts;
}
