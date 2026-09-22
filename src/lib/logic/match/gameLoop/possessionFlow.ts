// B3b — flux de possession : pause de transition (animations ballon /
// box-out / repli), résolution de la transition (rebond off, possession
// adverse, nouvelle possession maison).
//
// Extrait de `gameLoop.ts` (découpe 2026-06-11, refacto bit-identique).

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderId,
  Point,
} from '@/lib/types';
import { activeBallCarrier, activeOffense } from '../../players';
import { effectiveDefensePositions, getDefenseHoop } from '../../engine';
import { pushOutOfMany } from '../../geometry';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import { seededAiRng } from '../aiPossession';
import { computeRebound, type ReboundResult } from '../rebound';
import { buildInboundSetup } from '../../inboundSetup';
import { HALF_COURT_Y } from '../../awayPossessionSetup';
import {
  BOXOUT_ANIMATION_MS,
  DEFAULT_SHOT_CLOCK_MS,
  INBOUND_TIMER_MS,
  OFFENSIVE_REBOUND_SHOT_CLOCK_MS,
  TRANSITION_PAUSE_MS,
} from './constants';
import { cloneDef, cloneOff } from './helpers';
import { startAwayPossession } from './awayPossession';
import type { MatchState, TickMatchOptions } from './types';

export function isSessionDone(state: MatchState): boolean {
  // Session terminée = possession finie ET on a atteint maxPossessions.
  // (Si maxPossessions === null = endless, jamais "done" sans stop manuel.)
  if (state.outcome === null) return false;
  if (state.maxPossessions === null) return false;
  return state.possessionsPlayed >= state.maxPossessions;
}

export function handleTransitionPause(
  state: MatchState,
  dtMs: number,
  baseAppState: AppState,
  options: TickMatchOptions
): MatchState {
  // On laisse le temps avancer pendant la pause (pour que l'utilisateur
  // voie l'outcome avant de redémarrer). Compte aussi le tick.
  const next: MatchState = {
    ...state,
    off: cloneOff(state.off),
    defPos: cloneDef(state.defPos),
    ballPos: { ...state.ballPos },
    eventLog: [...state.eventLog],
    offBallIntents: { ...state.offBallIntents },
    tickCount: state.tickCount + 1,
    possessionTimeMs: state.possessionTimeMs + dtMs,
  };

  // Démarrage de la pause : mémoriser le start time côté possession.
  if (next.transitionStartedAtMs === null) {
    next.transitionStartedAtMs = next.possessionTimeMs;
  }

  // E.3 — animer le ballon : tireur → cercle → rebondeur (parabole).
  // Sur tir réussi (pas de pendingRebound), le ballon descend au cercle
  // puis reste. Sur tir manqué, il rebondit vers la position du rebondeur.
  if (baseAppState.physicsReboundsEnabled && next.shotPhysicalTrajectory) {
    const traj = next.shotPhysicalTrajectory;
    const elapsed = next.possessionTimeMs - next.transitionStartedAtMs!;
    const progress = Math.min(1, elapsed / TRANSITION_PAUSE_MS);
    const idx = Math.min(traj.length - 1, Math.floor(progress * traj.length));
    const pt = traj[idx];
    next.ballPos = {
      x: pt.x,
      y: pt.y - (pt.z ?? 0),
      z: pt.z ?? 0,
    };
  } else if (next.shotBallStartPos && next.transitionStartedAtMs !== null) {
    const hoop = getDefenseHoop(baseAppState, next.attackingTeam);
    const elapsed = next.possessionTimeMs - next.transitionStartedAtMs;
    const totalDuration = TRANSITION_PAUSE_MS;
    const progress = Math.min(1, elapsed / totalDuration);
    if (next.pendingRebound && next.pendingRebound.rebounder) {
      // Tir manqué : trajectoire shooter → cercle → rebondeur (2 phases).
      // Phase 1 (0-50%) : ballon va au cercle avec arc haut.
      // Phase 2 (50-100%) : ballon descend vers le rebondeur.
      const reboundPos = next.pendingRebound.position;
      if (progress < 0.5) {
        const t = progress / 0.5;
        const baseY =
          next.shotBallStartPos.y + (hoop.y - next.shotBallStartPos.y) * t;
        const baseX =
          next.shotBallStartPos.x + (hoop.x - next.shotBallStartPos.x) * t;
        // Arc parabolique : peak à t=0.5, hauteur 50 px au-dessus de la droite.
        const arc = 50 * 4 * t * (1 - t);
        next.ballPos = { x: baseX, y: baseY - arc };
      } else {
        const t = (progress - 0.5) / 0.5;
        const baseX = hoop.x + (reboundPos.x - hoop.x) * t;
        const baseY = hoop.y + (reboundPos.y - hoop.y) * t;
        // Petit ricoche bas (arc 25 px).
        const arc = 25 * 4 * t * (1 - t);
        next.ballPos = { x: baseX, y: baseY - arc };
      }
    } else {
      // Tir réussi : ballon va au cercle puis reste, avec arc complet.
      const t = progress;
      const baseX =
        next.shotBallStartPos.x + (hoop.x - next.shotBallStartPos.x) * t;
      const baseY =
        next.shotBallStartPos.y + (hoop.y - next.shotBallStartPos.y) * t;
      const arc = 60 * 4 * t * (1 - t);
      next.ballPos = { x: baseX, y: baseY - arc };
    }
  }

  // Box-Out V2 — animer les défenseurs vers leurs cibles sur les
  // premières BOXOUT_ANIMATION_MS de la pause, puis figer.
  if (next.boxOutTargets && next.boxOutStartedAtMs !== null) {
    const boxOutElapsed = next.possessionTimeMs - next.boxOutStartedAtMs;
    const progress = Math.min(1, boxOutElapsed / BOXOUT_ANIMATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    (Object.keys(next.boxOutTargets) as DefenderId[]).forEach((id) => {
      const target = next.boxOutTargets?.[id];
      const cur = next.defPos[id];
      if (!target || !cur) return;
      next.defPos[id] = {
        ...cur,
        x: cur.x + (target.x - cur.x) * eased * 0.3,
        y: cur.y + (target.y - cur.y) * eased * 0.3,
      };
    });
    // Quand animation finie, on bloque les cibles à leur valeur finale.
    if (progress >= 1) {
      (Object.keys(next.boxOutTargets) as DefenderId[]).forEach((id) => {
        const target = next.boxOutTargets?.[id];
        const cur = next.defPos[id];
        if (!target || !cur) return;
        next.defPos[id] = { ...cur, x: target.x, y: target.y };
      });
    }

    // Luttes de force (Box-out / Post-up) — opt-in via flag
    // `physicalContactBattlesEnabled`. Modélise le duel physique : le
    // défenseur en box-out qui touche un attaquant lui transmet une
    // poussée OPPOSÉE au panier (= éloigne l'attaquant de la zone de
    // rebond). Réaction newtonienne sur le défenseur (amortie ×0.3).
    // Rule 1 préservée par `pushOutOfMany` en fin de couche.
    if (baseAppState.physicalContactBattlesEnabled) {
      const hoop = getDefenseHoop(baseAppState, next.attackingTeam);
      const battleRadius = 40;
      const baseForce = 5; // px max / frame
      (Object.keys(next.boxOutTargets) as DefenderId[]).forEach((dId) => {
        const def = next.defPos[dId];
        if (!def) return;
        const attId = def.matchedTo as AttackerId;
        const att = next.off[attId];
        if (!att) return;
        const d = Math.hypot(def.x - att.x, def.y - att.y);
        if (d < 1 || d >= battleRadius) return;
        const fromHoopX = att.x - hoop.x;
        const fromHoopY = att.y - hoop.y;
        const fhMag = Math.hypot(fromHoopX, fromHoopY);
        if (fhMag < 1) return;
        const intensity = baseForce * (1 - d / battleRadius) * eased;
        const ux = fromHoopX / fhMag;
        const uy = fromHoopY / fhMag;
        next.off[attId] = {
          ...att,
          x: att.x + ux * intensity,
          y: att.y + uy * intensity,
        };
        next.defPos[dId] = {
          ...def,
          x: def.x - ux * intensity * 0.3,
          y: def.y - uy * intensity * 0.3,
        };
      });
      // Filet de sécurité Rule 1 : pushOut sur tous les attaquants contre
      // tous les défenseurs et autres attaquants.
      const attIds = Object.keys(next.off) as AttackerId[];
      const defIds = Object.keys(next.defPos) as DefenderId[];
      attIds.forEach((id) => {
        const obstacles: Point[] = [];
        attIds.forEach((other) => {
          if (other !== id) obstacles.push(next.off[other]);
        });
        defIds.forEach((dId) => {
          const d = next.defPos[dId];
          if (d) obstacles.push({ x: d.x, y: d.y });
        });
        next.off[id] = pushOutOfMany(next.off[id], obstacles, PLAYER_MIN_CLEARANCE_PX);
      });
    }
  }

  // Repli défensif (opt-in via defensiveTransitionEnabled) — pendant la
  // pause de transition, les ex-attaquants amorcent leur retraite vers
  // leur propre panier dès que la possession va basculer (shot-made,
  // turnover, rebond défensif). Sur rebond offensif ou outcome 'empty',
  // pas de repli (la même équipe garde la possession). Cap 3 px/tick,
  // freeze à <80 px du panier, filet Rule 1 final.
  if (baseAppState.defensiveTransitionEnabled && next.transitionStartedAtMs !== null) {
    const willSwitchPossession =
      next.outcome === 'shot-made' ||
      next.outcome === 'forced-shot-made' ||
      next.outcome === 'turnover-pass' ||
      next.outcome === 'turnover-drive' ||
      next.pendingRebound?.type === 'defensive';
    if (willSwitchPossession) {
      // Panier OWN des ex-attaquants = celui qu'attaquerait l'équipe opposée.
      const otherTeam = next.attackingTeam === 'home' ? 'away' : 'home';
      const ownHoop = getDefenseHoop(baseAppState, otherTeam);
      const REPLI_SPEED_PX_PER_TICK = 3;
      const ARRIVED_DIST_PX = 80;
      const attIds = Object.keys(next.off) as AttackerId[];
      attIds.forEach((aId) => {
        const att = next.off[aId];
        const dx = ownHoop.x - att.x;
        const dy = ownHoop.y - att.y;
        const d = Math.hypot(dx, dy);
        if (d < ARRIVED_DIST_PX) return;
        const ux = dx / d;
        const uy = dy / d;
        next.off[aId] = {
          ...att,
          x: att.x + ux * REPLI_SPEED_PX_PER_TICK,
          y: att.y + uy * REPLI_SPEED_PX_PER_TICK,
        };
      });
      // Filet Rule 1 : pushOut sur tous les ex-attaquants entre eux + contre
      // les défenseurs (qui peuvent eux-mêmes être en box-out à mi-couloir).
      const defIds = Object.keys(next.defPos) as DefenderId[];
      attIds.forEach((id) => {
        const obstacles: Point[] = [];
        attIds.forEach((other) => {
          if (other !== id) obstacles.push(next.off[other]);
        });
        defIds.forEach((dId) => {
          const d = next.defPos[dId];
          if (d) obstacles.push({ x: d.x, y: d.y });
        });
        next.off[id] = pushOutOfMany(next.off[id], obstacles, PLAYER_MIN_CLEARANCE_PX);
      });
    }
  }

  const elapsed = next.possessionTimeMs - next.transitionStartedAtMs;
  if (elapsed < TRANSITION_PAUSE_MS) {
    return next; // toujours en pause
  }

  // Pause terminée : on désarme le box-out (la transition va peut-être
  // reset les positions ou démarrer une nouvelle possession).
  next.boxOutTargets = null;
  next.boxOutStartedAtMs = null;
  // E.3 — désarme l'animation ballon (la transition gère la suite).
  // Le résultat animé doit survivre jusqu’à executeTransition (aucun nouveau tirage).
  next.shotBallStartPos = null;
  next.shotPhysicalTrajectory = null;

  // Pause terminée → résoudre la transition.
  return executeTransition(next, baseAppState, options);
}

export function executeTransition(
  state: MatchState,
  baseAppState: AppState,
  options: TickMatchOptions
): MatchState {
  const isMissedShot =
    state.outcome === 'shot-missed' || state.outcome === 'forced-shot-missed';
  const rng = seededAiRng(state.seed + state.tickCount + state.possession * 1000);

  // Cumule le score de cette possession sur le bon côté.
  const homeScore = state.homeScore + (state.attackingTeam === 'home' ? state.score : 0);
  const awayScore = state.awayScore + (state.attackingTeam === 'away' ? state.score : 0);
  const cumulativeScore = homeScore; // alias rétrocompat

  // On évalue le rebond ICI (mode E.1 V1) pour savoir si la possession
  // se termine ou continue (rebond offensif = même possession).
  // E.3 — Si `pendingRebound` a déjà été calculé au moment du tir, on
  // le réutilise (pour assurer la cohérence avec l'animation du ballon).
  const reboundRateOverride = options.offensiveReboundRate;
  let rebound: ReboundResult | null = null;
  let offensiveReboundDecided = false;
  if (isMissedShot) {
    if (reboundRateOverride !== undefined) {
      offensiveReboundDecided = rng() < reboundRateOverride;
    } else if (state.pendingRebound) {
      // E.3 — réutiliser le pré-calcul, pas de re-roll.
      rebound = state.pendingRebound;
      offensiveReboundDecided = rebound.type === 'offensive';
    } else {
      const hoop = getDefenseHoop(baseAppState, state.attackingTeam);
      const shotEvent = [...state.eventLog].reverse().find(
        (e) => e.type === 'shot' || e.type === 'forced-shot'
      );
      const shotPos = shotEvent?.shotPos ?? state.off[state.carrier] ?? hoop;
      rebound = computeRebound({
        off: state.off,
        defPos: state.defPos,
        hoop,
        shotPos,
        attackerProfiles: baseAppState.attackerProfiles,
        shooter: state.carrier,
        rng,
      });
      offensiveReboundDecided = rebound.type === 'offensive';
    }
  }

  // `possessionsPlayed` ne compte que les possessions maison TERMINÉES.
  // Un rebond offensif continue la même possession (pas d'incrément).
  // Une possession adverse stubbée n'incrémente pas non plus (= notre
  // possession maison ne change pas de "numéro" pendant l'aller-retour
  // adverse).
  const possessionContinues = offensiveReboundDecided;
  const homeEnded = state.attackingTeam === 'home' && !possessionContinues;
  const nextPossessionsPlayed = homeEnded
    ? state.possessionsPlayed + 1
    : state.possessionsPlayed;

  // Phase 1.4 — Stats équipe : sur tir manqué, le rebond va à l'équipe
  // qui le capture. Offensive rebound = même équipe que shooter; défensif
  // = équipe adverse.
  let teamStats = state.teamStats;
  if (isMissedShot) {
    const shooterTeam = state.attackingTeam;
    const reboundingTeam = offensiveReboundDecided
      ? shooterTeam
      : shooterTeam === 'home'
        ? 'away'
        : 'home';
    const statKey = offensiveReboundDecided ? 'oReb' : 'dReb';
    teamStats = {
      ...teamStats,
      [reboundingTeam]: {
        ...teamStats[reboundingTeam],
        [statKey]: teamStats[reboundingTeam][statKey] + 1,
      },
    };
  }

  // Session terminée → fige sans transition. L'outcome reste set, donc
  // isSessionDone() retournera true au tick suivant et le tick devient
  // no-op strict.
  if (
    state.maxPossessions !== null &&
    nextPossessionsPlayed >= state.maxPossessions
  ) {
    return {
      ...state,
      cumulativeScore,
      homeScore,
      awayScore,
      possessionsPlayed: nextPossessionsPlayed,
      pendingRebound: null,
      transitionStartedAtMs: null,
      teamStats,
    };
  }

  const stateForTransition: MatchState = {
    ...state,
    possessionsPlayed: nextPossessionsPlayed,
    teamStats,
  };

  // Branchage final selon le résultat du rebond / type d'outcome.
  if (isMissedShot) {
    if (offensiveReboundDecided) {
      return continueWithOffensiveRebound(
        stateForTransition,
        cumulativeScore,
        baseAppState,
        homeScore,
        awayScore,
        rebound
      );
    }
    // Mode legacy B3b (utilisé par les tests) : reboundRateOverride force
    // une transition directe vers la nouvelle possession maison, sans
    // passer par la possession adverse. Conservé pour rétrocompat tests.
    if (reboundRateOverride !== undefined) {
      return startFreshPossession(stateForTransition, baseAppState, cumulativeScore, homeScore, awayScore);
    }
    // Phase 2 — Rebond défensif : l'équipe DÉFENSIVE (= adverse de
    // l'attackingTeam actuel) récupère le ballon.
    if (state.attackingTeam === 'home') {
      // Home a raté, away récupère
      return startAwayPossession(stateForTransition, baseAppState, cumulativeScore, homeScore, awayScore, rebound);
    }
    // Away a raté, home récupère (pas d'inbound : rebond live)
    return startFreshPossession(stateForTransition, baseAppState, cumulativeScore, homeScore, awayScore);
  }

  // Tir réussi / turnover / forced shot manqué sans rebond off →
  // possession adverse (l'adversaire récupère la balle).
  if (state.attackingTeam === 'home') {
    return startAwayPossession(stateForTransition, baseAppState, cumulativeScore, homeScore, awayScore, null);
  }
  // Sinon (fin de possession adverse) : nouvelle possession maison.
  return startFreshPossession(stateForTransition, baseAppState, cumulativeScore, homeScore, awayScore);
}

export function continueWithOffensiveRebound(
  state: MatchState,
  cumulativeScore: number,
  baseAppState: AppState,
  homeScore: number = cumulativeScore,
  awayScore: number = state.awayScore,
  rebound?: ReboundResult | null
): MatchState {
  const hoop = getDefenseHoop(baseAppState, state.attackingTeam);
  // E.1 V1 — si rebond fourni et qu'il pointe vers un attaquant, on
  // l'utilise. Sinon (B3b legacy) : fallback heuristique = off-ball
  // le plus proche du panier.
  const shooter = state.carrier;
  let newCarrier: AttackerId;
  if (
    rebound &&
    rebound.type === 'offensive' &&
    rebound.rebounder &&
    rebound.rebounder.startsWith('O')
  ) {
    newCarrier = rebound.rebounder as AttackerId;
  } else {
    let best: AttackerId | null = null;
    let bestDist = Infinity;
    (Object.keys(state.off) as AttackerId[]).forEach((id) => {
      if (id === shooter) return;
      const p = state.off[id];
      if (!p) return;
      const d = Math.hypot(p.x - hoop.x, p.y - hoop.y);
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    });
    newCarrier = best ?? shooter;
  }
  const carrierPos = state.off[newCarrier];

  // Event log : marque le rebond pour le HUD.
  const eventLog = [
    ...state.eventLog,
    {
      possession: state.possession,
      clock: OFFENSIVE_REBOUND_SHOT_CLOCK_MS / 1000,
      actor: newCarrier,
      type: 'pass' as const, // type le plus proche sémantiquement (pas de 'rebound' enum)
      label: `Rebond offensif ${newCarrier} (continue)`,
    },
  ];

  return {
    ...state,
    carrier: newCarrier,
    ballPos: carrierPos ? { x: carrierPos.x + 16, y: carrierPos.y - 16 } : state.ballPos,
    shotClockMs: OFFENSIVE_REBOUND_SHOT_CLOCK_MS,
    score: 0,
    outcome: null,
    intent: { kind: 'idle' },
    offBallIntents: {},
    eventLog,
    cumulativeScore,
    homeScore,
    awayScore,
    // possessionsPlayed inchangé (= même possession qui continue)
    // possession ID inchangé
    transitionStartedAtMs: null,
  };
}

export function startFreshPossession(
  state: MatchState,
  baseAppState: AppState,
  cumulativeScore: number,
  homeScore: number = cumulativeScore,
  awayScore: number = state.awayScore
): MatchState {
  // Phase 2 — Détermine si la transition vient d'un panier marqué adverse :
  // si oui, home récupère le ballon pour une remise en jeu au baseline du
  // bas (BLOB box-set mirroré). Sinon (turnover away, rebond live), reprise
  // depuis l'étape de base au top.
  const awayJustScored =
    state.attackingTeam === 'away' &&
    (state.outcome === 'shot-made' || state.outcome === 'forced-shot-made');

  const step = baseAppState.steps[baseAppState.activeStep];
  if (!step) {
    return { ...state, cumulativeScore, possessionsPlayed: state.possessionsPlayed + 1 };
  }

  let newOff: AttackerPositions;
  let newCarrier: AttackerId;
  let inboundTimerMs: number | null = null;

  if (awayJustScored) {
    // Home inbound au bas du terrain : BLOB box-set mirroré autour de HALF_COURT_Y
    const inboundSetup = buildInboundSetup('inbound-baseline');
    newOff = Object.fromEntries(
      Object.entries(inboundSetup.off).map(([id, p]) => [
        id,
        { x: p.x, y: 2 * HALF_COURT_Y - p.y },
      ])
    ) as AttackerPositions;
    newCarrier = inboundSetup.inbounder;
    inboundTimerMs = INBOUND_TIMER_MS;
  } else {
    // Reprise depuis l'étape de base (positions "home" canoniques)
    newOff = cloneOff(activeOffense(step.off, baseAppState.playerCount));
    newCarrier = activeBallCarrier(step, baseAppState.playerCount);
  }

  const defPos = effectiveDefensePositions(baseAppState, baseAppState.activeStep);
  const carrierPos = newOff[newCarrier] ?? { x: 0, y: 0 };
  const newPossession = state.possession + 1;

  const eventLog = [
    ...state.eventLog,
    {
      possession: newPossession,
      clock: DEFAULT_SHOT_CLOCK_MS / 1000,
      actor: newCarrier,
      type: 'pass' as const,
      label: `— Nouvelle possession #${newPossession} —`,
    },
  ];

  return {
    ...state,
    off: newOff,
    defPos: cloneDef(defPos),
    carrier: newCarrier,
    ballPos: { x: carrierPos.x + 16, y: carrierPos.y - 16 },
    shotClockMs: DEFAULT_SHOT_CLOCK_MS,
    possessionTimeMs: 0,
    intent: { kind: 'idle' },
    offBallIntents: {},
    score: 0,
    outcome: null,
    eventLog,
    cumulativeScore,
    homeScore,
    awayScore,
    attackingTeam: 'home',
    possession: newPossession,
    transitionStartedAtMs: null,
    inboundTimerMs,
    // Reset stub fields (Phase 1 legacy)
    awayBallPos: null,
    awayPlayerPositions: null,
    // Reset animation/rebound state pour qu'aucun résidu de la possession
    // précédente ne persiste dans la nouvelle.
    pendingRebound: null,
    shotBallStartPos: null,
    shotPhysicalTrajectory: null,
    boxOutTargets: null,
    boxOutStartedAtMs: null,
  };
}
