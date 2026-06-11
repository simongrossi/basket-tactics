// Constantes de la game loop (Phase I — mode "▶ Play IA (live)").
//
// Extraites de `gameLoop.ts` (découpe 2026-06-11, refacto bit-identique).
// Tout tuning de la simulation live passe par ce fichier.

import type { ShotZone } from '../../threats';

/** Cadence du tick — 30 Hz / 33 ms, alignée sur `usePlaybackAnimation`.
 *  Donne une animation fluide (60 fps via setInterval est dur sans rAF).
 *  La cadence DÉCISIONNELLE (= quand l'IA choisit une nouvelle action)
 *  est plus basse : carrier en idle décide à chaque tick (≈ instantané
 *  dès qu'il termine l'action courante), off-ball décide tous les
 *  `DECISION_INTERVAL_TICKS` ticks (~1 s).
 *
 *  Note historique : 200 ms (5 Hz) à l'origine — trop lent visuellement,
 *  l'utilisateur voyait 5 images/s, saccadé. Bump à 30 Hz avec scaling
 *  proportionnel des constantes de vitesse / intervalle. */
export const MATCH_TICK_MS = 33;

/** Shot clock initial en millisecondes. Surchargeable via options. */
export const DEFAULT_SHOT_CLOCK_MS = 24_000;

/** Reset shot clock après rebond offensif. NBA FIBA = 14 s. */
export const OFFENSIVE_REBOUND_SHOT_CLOCK_MS = 14_000;

/** Seuil "low clock" où on force le tir si on a une option. */
export const LOW_CLOCK_MS = 4_500;

/** B3b — pause après fin de possession avant transition. Permet au HUD
 *  d'afficher l'outcome ("tir réussi", "perte", etc.) avant de relancer
 *  la possession suivante. 1.5 s = lisible sans casser le rythme. */
export const TRANSITION_PAUSE_MS = 1_500;

/** B3b — probabilité de rebond offensif sur tir manqué. Stub très simple
 *  basé sur stats moyennes NBA (~25-28 %). Conservé pour rétrocompat
 *  des tests, mais E.1 V1 remplace par un modèle géométrique. */
export const DEFAULT_OFFENSIVE_REBOUND_RATE = 0.28;

/** Durée maximale de remise en jeu (FIBA / NBA : 5 secondes pour
 *  faire la passe rentrante). Au-delà = violation, possession perdue.
 *  Décompté côté live quand `step.context` débute par 'inbound-'. */
export const INBOUND_TIMER_MS = 5_000;

/** Phase E.1 V1 — paramètres de la possession adverse stubbée.
 *  Sur rebond défensif, on simule l'équipe adverse qui attaque sans
 *  rendu visuel : le shot clock tourne, puis on tire au sort un outcome. */
export const AWAY_POSSESSION_DURATION_MS = 12_000;
/** Proba de score sur la possession adverse stubbée. 50 % × 2 pts =
 *  1.0 PPP adverse (en-dessous de la moyenne NBA ~1.1 mais assumée
 *  comme stub — on calibrera en V2 si nécessaire). */
export const AWAY_SCORE_PROBABILITY = 0.5;
/** Décalage de box-out : chaque défenseur shift vers son matched
 *  attaquant + offset panier. Visuel pendant la résolution du tir. */
export const BOXOUT_OFFSET_PX = 18;

/** Box-Out V2 — durée d'animation. Sur 500 ms (~15 ticks à 30 Hz),
 *  les défenseurs lerp depuis leur position pré-tir vers leur position
 *  de box-out. Après, ils restent figés sur la cible jusqu'à la fin
 *  de la pause de transition (≈ 1500 - 500 = 1000 ms supplémentaires). */
export const BOXOUT_ANIMATION_MS = 500;

/** Vitesse max du porteur en px/tick. À 30 Hz et 8 px/tick = 240 px/s
 *  ≈ 6.5 m/s, sprint réaliste basket. Avant : 50 px à 5 Hz (même vitesse,
 *  mais saut visible par image). */
export const MAX_CARRIER_STEP_PX = 8;

export const DEFAULT_CREATIVITY = 0.35;

/** B3a — seuil de contestation. Un défenseur à ≤ CONTEST_THRESHOLD_PX
 *  du tireur compte le tir comme "contesté". Aligné avec
 *  `contestMultiplier` dans `offense.ts` (palier à 80 px).
 *  À 30 px (~80 cm), c'est une vraie main au visage du shooter. */
export const CONTEST_THRESHOLD_PX = 30;

/** Labels FR par zone de tir pour les events lisibles côté HUD. */
export const SHOT_ZONE_LABELS: Record<ShotZone, string> = {
  rim: 'au cercle',
  paint: 'dans la raquette',
  mid: 'à mi-distance',
  three: 'à 3 pts',
  deep: 'longue distance',
};
