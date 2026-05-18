// K.0 — Types pour la détection d'anomalies de comportement joueur.
//
// Le détecteur d'anomalies est une couche d'observation passive
// branchée sur des paires (prevFrame, curFrame) ou (state, snapshot).
// Il ne mute rien (V1). La correction opt-in est gérée par K.7 V2.

import type { AttackerId, DefenderId } from '@/lib/types';

export type PlayerId = AttackerId | DefenderId;

export type AnomalyKind =
  | 'teleport'        // saut de position > seuil entre deux frames
  | 'aberrant-speed'  // vitesse instantanée > maxSpeed effective
  | 'detached'        // défenseur > seuil de son homme matché (hors aide/screen)
  | 'flicker'         // oscillation sign-change sur fenêtre 3 frames
  | 'gaze-out-of-range'; // regard > 90° du corps (input non clampé)

export type AnomalySeverity = 'info' | 'warning' | 'critical';

export interface AnomalyReport {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  playerId: PlayerId;
  /** Step à laquelle l'anomalie a été détectée (utilisé pour le diag coach). */
  stepIdx: number;
  /** Message court orienté coach (fr). */
  message: string;
  /** Valeur mesurée (px, px/step, deg, etc.) — sert au tri et aux tests. */
  value: number;
  /** Seuil franchi (même unité que `value`). */
  threshold: number;
}
