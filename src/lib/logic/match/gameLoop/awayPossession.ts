// Possession adverse : Phase 2 (vraie possession symétrique via swap des
// positions) + stub legacy E.1 V1/V2 (animation pendant `away-possession`).
//
// Extraite de `gameLoop.ts` (découpe 2026-06-11, refacto bit-identique).

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  Point,
} from '@/lib/types';
import { activeBallCarrier, activeOffense } from '../../players';
import { effectiveDefensePositions } from '../../engine';
import { buildInboundSetup } from '../../inboundSetup';
import { HALF_COURT_Y, buildAwayPossessionSetup } from '../../awayPossessionSetup';
import type { ReboundResult } from '../rebound';
import {
  AWAY_POSSESSION_DURATION_MS,
  AWAY_SCORE_PROBABILITY,
  DEFAULT_SHOT_CLOCK_MS,
  INBOUND_TIMER_MS,
} from './constants';
import { buildMinimalDefense, cloneDef, cloneOff } from './helpers';
import type { MatchState } from './types';

/**
 * Démarre une possession adverse RÉELLE (Phase 2, plus de stub).
 *
 * Au lieu de l'ancien stub (intent='away-possession' + animation hardcodée),
 * on swap les positions : l'away devient l'équipe attaquante (state.off),
 * notre équipe home devient les défenseurs (state.defPos), mirrored
 * autour de HALF_COURT_Y pour les placer dans la moitié bas du terrain
 * où l'away attaque HOOP_OPPOSITE (y=1005).
 *
 * Deux cas selon le contexte du transition :
 * - Panier home marqué (`isMadeShot=true`) : away inbound au top en BLOB
 *   box-set (y < 170) + timer remise 5s. L'IA fera la passe rentrante
 *   puis Phase 1.2 advance vers le bas-court.
 * - Rebond défensif ou turnover : away directement en attack formation
 *   au bas (utilise `buildAwayPossessionSetup` mirror de la step source).
 */
export function startAwayPossession(
  state: MatchState,
  baseAppState: AppState,
  cumulativeScore: number,
  homeScore: number,
  awayScore: number,
  rebound: ReboundResult | null
): MatchState {
  const reboundLabel = rebound?.rebounder
    ? `Rebond défensif ${rebound.rebounder}`
    : "Fin de possession maison — transition adverse";
  const eventLog = [
    ...state.eventLog,
    {
      possession: state.possession,
      clock: state.shotClockMs / 1000,
      actor: state.carrier,
      type: 'pass' as const,
      label: reboundLabel,
    },
  ];

  const isMadeShot =
    state.outcome === 'shot-made' || state.outcome === 'forced-shot-made';
  const inboundTimerMs = isMadeShot ? INBOUND_TIMER_MS : null;
  const attackerIds: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
  const defenderIds: DefenderId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

  let newOff: AttackerPositions;
  let newDef: ComputedDefense;
  let newCarrier: AttackerId;

  if (isMadeShot) {
    // Away inbound au TOP — BLOB box-set au-dessus du panier home
    // (l'away vient juste d'encaisser et inbound depuis sa baseline
    // défensive = derrière le panier home y=75).
    const inboundSetup = buildInboundSetup('inbound-baseline');
    newOff = cloneOff(inboundSetup.off);
    newCarrier = inboundSetup.inbounder;
    newDef = buildMinimalDefense(inboundSetup.def, attackerIds, defenderIds);
  } else {
    // Rebond défensif / turnover : away directement en attack formation
    // au bas du terrain (mirror du source step home).
    const awaySetup = buildAwayPossessionSetup(baseAppState, baseAppState.activeStep);
    newOff = cloneOff(awaySetup.off);
    newCarrier = awaySetup.ballCarrier;
    newDef = buildMinimalDefense(awaySetup.def, attackerIds, defenderIds);
  }

  const carrierPos = newOff[newCarrier] ?? { x: 300, y: 540 };

  return {
    ...state,
    off: newOff,
    defPos: newDef,
    carrier: newCarrier,
    ballPos: { x: carrierPos.x + 16, y: carrierPos.y - 16 },
    score: 0,
    outcome: null,
    intent: { kind: 'idle' },
    offBallIntents: {},
    eventLog,
    cumulativeScore,
    homeScore,
    awayScore,
    attackingTeam: 'away',
    transitionStartedAtMs: null,
    inboundTimerMs,
    // Phase 2 : plus de stub render, on rend les VRAIES positions via state.off
    awayPlayerPositions: null,
    awayBallPos: null,
    shotClockMs: DEFAULT_SHOT_CLOCK_MS,
    possessionTimeMs: 0,
    // Reset animation/rebound state pour qu'aucun résidu de la possession
    // précédente ne persiste dans la nouvelle.
    pendingRebound: null,
    shotBallStartPos: null,
    shotPhysicalTrajectory: null,
    boxOutTargets: null,
    boxOutStartedAtMs: null,
  };
}

/**
 * Avance la possession adverse stubbée. Décrémente le timer, et quand
 * il atteint 0, tire au sort l'outcome (score ou non), met à jour
 * `awayScore`, puis enchaîne sur une possession maison.
 */
export function advanceAwayPossession(
  state: MatchState,
  dtMs: number,
  baseAppState: AppState,
  rng: () => number,
  awayScoreOverride?: boolean
): MatchState {
  if (state.intent.kind !== 'away-possession') return state;
  const remaining = state.intent.remainingMs - dtMs;
  if (remaining > 0) {
    // Phase 1.1 — Pendant la phase d'inbound visible (inboundTimerMs !== null),
    // on fige les positions BLOB posées par startAwayPossession. Le shot
    // clock continue de tourner mais les sprites restent en place.
    // Le timer d'inbound est décrémenté par tickMatch en amont, donc ici
    // on lit l'état post-décrément.
    //
    // Au bout de ~3s (= timer < 2000), on désarme l'inbound : la passe
    // rentrante virtuelle est "faite", le stub animation prend le relais.
    if (state.inboundTimerMs !== null && state.inboundTimerMs > 0) {
      if (state.inboundTimerMs <= 2_000) {
        // Désarme le timer → tick suivant utilise le stub animation
        return {
          ...state,
          intent: { kind: 'away-possession', remainingMs: remaining },
          shotClockMs: Math.max(0, remaining),
          inboundTimerMs: null,
        };
      }
      return {
        ...state,
        intent: { kind: 'away-possession', remainingMs: remaining },
        shotClockMs: Math.max(0, remaining),
      };
    }
    // E.1 V2 stage 1 + 2a — anime le ballon adverse ET les 5 positions
    // des joueurs adverses pendant la possession stubbée.
    const totalDuration = AWAY_POSSESSION_DURATION_MS;
    const elapsed = totalDuration - remaining;
    const progress = Math.max(0, Math.min(1, elapsed / totalDuration));
    const awayBallPos = computeAwayBallPosition(progress, baseAppState);
    const awayPlayerPositions = computeAwayPlayerPositions(
      progress,
      state.defPos,
      baseAppState
    );
    return {
      ...state,
      intent: { kind: 'away-possession', remainingMs: remaining },
      shotClockMs: Math.max(0, remaining),
      awayBallPos,
      awayPlayerPositions,
    };
  }
  // Possession adverse terminée : outcome.
  const made = awayScoreOverride ?? (rng() < AWAY_SCORE_PROBABILITY);
  const pts = made ? 2 : 0;
  const newAwayScore = state.awayScore + pts;
  const eventLog = [
    ...state.eventLog,
    {
      possession: state.possession,
      clock: 0,
      actor: state.carrier,
      type: 'shot' as const,
      label: made ? `Adversaire +${pts} pts` : 'Adversaire — tir manqué',
      points: pts,
    },
  ];
  // Enchaîne directement sur une nouvelle possession maison.
  const step = baseAppState.steps[baseAppState.activeStep];
  if (!step) {
    return {
      ...state,
      awayScore: newAwayScore,
      intent: { kind: 'idle' },
      attackingTeam: 'home',
      eventLog,
    };
  }
  // Phase 1.1 — Si l'away vient de marquer, home récupère le ballon
  // pour une remise en jeu : BLOB box-set mirroré derrière la baseline
  // away (y > 1060 en full court). Sinon (tir adverse manqué = rebond
  // live), reprise depuis l'étape de base.
  const inboundSetup = made ? buildInboundSetup('inbound-baseline') : null;
  const baseOff = activeOffense(step.off, baseAppState.playerCount);
  const off: AttackerPositions = inboundSetup
    ? (Object.fromEntries(
        Object.entries(inboundSetup.off).map(([id, p]) => [
          id,
          { x: p.x, y: 2 * HALF_COURT_Y - p.y },
        ])
      ) as AttackerPositions)
    : baseOff;
  const carrier: AttackerId = inboundSetup
    ? inboundSetup.inbounder
    : activeBallCarrier(step, baseAppState.playerCount);
  const defPos = effectiveDefensePositions(baseAppState, baseAppState.activeStep);
  const carrierPos = off[carrier] ?? { x: 0, y: 0 };
  const newPossession = state.possession + 1;
  return {
    ...state,
    off: cloneOff(off),
    defPos: cloneDef(defPos),
    carrier,
    ballPos: { x: carrierPos.x + 16, y: carrierPos.y - 16 },
    shotClockMs: DEFAULT_SHOT_CLOCK_MS,
    possessionTimeMs: 0,
    intent: { kind: 'idle' },
    offBallIntents: {},
    score: 0,
    outcome: null,
    eventLog,
    awayScore: newAwayScore,
    attackingTeam: 'home',
    possession: newPossession,
    // possessionsPlayed déjà incrémenté au startAwayPossession (fin de
    // la possession maison précédente). Ici on démarre juste la suivante.
    transitionStartedAtMs: null,
    awayBallPos: null, // désarme l'animation
    awayPlayerPositions: null,
    // Phase 1.1 — Si away vient de marquer, home a 5s pour rentrer la balle.
    // Sinon (tir manqué adverse = rebond live), pas d'inbound.
    inboundTimerMs: made ? INBOUND_TIMER_MS : null,
    // Phase 1.4 — Stats équipe : le stub away a tenté 1 tir, réussi ou non.
    teamStats: {
      ...state.teamStats,
      away: {
        ...state.teamStats.away,
        points: state.teamStats.away.points + pts,
        fgMade: state.teamStats.away.fgMade + (made ? 1 : 0),
        fgAttempted: state.teamStats.away.fgAttempted + 1,
      },
    },
  };
}

/**
 * E.1 V2 stage 2a — Calcule les positions des 5 joueurs adverses
 * simulés pendant leur possession. Initialement = miroir vertical des
 * défenseurs home autour de y=540 (centre du full court). À mesure
 * que la possession progresse, les adversaires "remontent" vers leur
 * panier (= côté bas du terrain home).
 *
 * Convention V1 : on indexe les positions par DefenderId pour simplifier
 * le tracking (D1 adverse = miroir de D1 home, etc.). Pas de notion de
 * matchups inversés en mémoire (= V2 stage 2b).
 */
export function computeAwayPlayerPositions(
  progress: number,
  homeDefPos: ComputedDefense,
  baseAppState: AppState
): Record<DefenderId, Point> {
  const isFullCourt = baseAppState.fullCourt === true;
  const out = {} as Record<DefenderId, Point>;
  // Positions initiales : miroir vertical autour de la ligne médiane.
  // En full court, ligne médiane = y=540. En half court, on simule
  // un miroir autour de y=540 mais ça déborde du viewport visible —
  // les positions seront partiellement hors-écran (acceptable, le
  // ballon principal awayBallPos reste visible).
  const mirrorAxisY = 540;

  // Une vague de "remontée" pendant la possession : à progress=0 les
  // adversaires sont dans leur back-court, à progress=1 ils sont
  // proches du panier home (= ils ont attaqué).
  // En full court, panier home = (300, 75) — donc ils remontent vers
  // y faible. En half court, idem mais les positions de départ sont
  // y >> 540 (déborde) puis convergent vers y=540-300 visible.
  const targetHoopY = isFullCourt ? 90 : 200; // approximation visible
  // L'amplitude de la course dépend du progress et du joueur (les
  // intérieurs courent plus vite, les ailiers moins).
  const courseFactors: Record<DefenderId, number> = {
    D1: 0.5,  // PG adverse, modère
    D2: 0.6,  // SG, course
    D3: 0.65, // SF, course
    D4: 0.85, // PF, course intérieur
    D5: 0.95, // C, le plus rapide vers le panier
  };

  (Object.keys(homeDefPos) as DefenderId[]).forEach((id) => {
    const homePos = homeDefPos[id];
    if (!homePos) {
      out[id] = { x: 300, y: mirrorAxisY };
      return;
    }
    // Position miroir initiale.
    const mirrorX = homePos.x;
    const mirrorY = 2 * mirrorAxisY - homePos.y;
    // Course vers le panier home selon le facteur du joueur.
    const factor = courseFactors[id] ?? 0.5;
    const reachY = mirrorY + (targetHoopY - mirrorY) * progress * factor;
    out[id] = { x: mirrorX, y: reachY };
  });

  return out;
}

/**
 * E.1 V2 stage 1 — Calcule la position du ballon adverse pendant sa
 * possession stubbée. Anime entre 4 waypoints dans le back-court
 * (full court : moitié haute; half court : on simule un déplacement
 * latéral). 4 phases = passe-passe-drive-tir.
 */
export function computeAwayBallPosition(progress: number, baseAppState: AppState): Point {
  // 4 waypoints qui simulent une possession adverse :
  // - W0 : outlet ball-side (= setup)
  // - W1 : relai milieu de terrain
  // - W2 : drive ball-side
  // - W3 : tir sous-cercle adverse (= bord opposé du terrain)
  //
  // Half-court (innerMaxY = 540) : on anime dans la zone 350-540
  // pour donner l'illusion d'un back-court.
  // Full-court : on anime dans la moitié haute (y > 600 si HOOP en
  // bas, mais par défaut on inverse symétriquement).
  const isFullCourt = baseAppState.fullCourt === true;
  // Pour simplifier : on suppose hoop home en haut (y=75). L'adverse
  // attaque vers le bas (y vers 1005 si full court, sinon on simule
  // dans le bas du half court y=450-540).
  const baseY = isFullCourt ? 800 : 480; // zone de jeu adverse simulée
  const yRange = isFullCourt ? 180 : 60;

  // Waypoints :
  const waypoints: Point[] = [
    { x: 480, y: baseY + yRange }, // W0 outlet droite
    { x: 360, y: baseY + yRange * 0.5 }, // W1 relai milieu
    { x: 240, y: baseY }, // W2 drive
    { x: 300, y: isFullCourt ? 1005 : baseY - yRange * 0.6 }, // W3 tir
  ];

  // Segment courant : progress [0,1] divisé en 3 segments
  // (W0→W1, W1→W2, W2→W3).
  const numSegments = waypoints.length - 1;
  const segIdx = Math.min(numSegments - 1, Math.floor(progress * numSegments));
  const segT = progress * numSegments - segIdx;
  const from = waypoints[segIdx];
  const to = waypoints[segIdx + 1];
  // Arc parabolique léger sur le segment de tir (segIdx === 2)
  let arc = 0;
  if (segIdx === 2) {
    arc = 30 * 4 * segT * (1 - segT);
  }
  return {
    x: from.x + (to.x - from.x) * segT,
    y: from.y + (to.y - from.y) * segT - arc,
  };
}
