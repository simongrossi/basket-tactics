// Types de la game loop (Phase I — mode "▶ Play IA (live)").
//
// Extraits de `gameLoop.ts` (découpe 2026-06-11, refacto bit-identique).

import type {
  AttackerId,
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  Point,
} from '@/lib/types';
import type { OffensiveAction } from '../../offense';
import type {
  AiPossessionEvent,
  AiPossessionOutcome,
} from '../aiPossession';
import type { OffBallIntents } from '../decisions/offBallMover';
import type { ReboundResult } from '../rebound';

/** Intent en cours pour le porteur. Persiste entre ticks tant que
 *  l'action n'est pas terminée.
 *
 *  Phase E.1 V1 : ajout de `away-possession` pour modéliser le stub de
 *  possession adverse (shot clock tourne, pas de rendu, outcome au
 *  bout de AWAY_POSSESSION_DURATION_MS). */
export type CarrierIntent =
  | { kind: 'idle' }
  | { kind: 'drive'; target: Point; expectedAction: OffensiveAction }
  | { kind: 'pass'; receiver: AttackerId; progress: number; expectedAction: OffensiveAction }
  | { kind: 'shoot'; action: OffensiveAction; forced: boolean }
  | { kind: 'away-possession'; remainingMs: number }
  // Phase 1.2 — Montée de balle après remise en jeu en backcourt.
  // Le porteur drive vers la ligne médiane à vitesse réduite.
  // advanceTimerMs : timer FIBA 8s pour franchir la médiane (sinon violation).
  | { kind: 'advance'; targetY: number; advanceTimerMs: number };

/** État live d'une possession simulée par la game loop.
 *  Mutable (par tick) — pas dans `AppState` (transient UI). */
export interface MatchState {
  /** Positions courantes des 5 attaquants (mute par tick). */
  off: AttackerPositions;
  /** Positions courantes des 5 défenseurs (recomputées sur décision). */
  defPos: ComputedDefense;
  /** Porteur du ballon courant. */
  carrier: AttackerId;
  /** Position visuelle de la balle (suit porteur ou interpole pendant passe). */
  ballPos: Point;
  /** Shot clock restant en ms. */
  shotClockMs: number;
  /** Temps écoulé total depuis le début de la possession (ms). */
  possessionTimeMs: number;
  /** Nombre de ticks exécutés. */
  tickCount: number;
  /** Intent courant du porteur. */
  intent: CarrierIntent;
  /** Intents par off-ball (= non-carriers). Décidés tous les
   *  `DECISION_INTERVAL_TICKS` ticks, avancés à chaque tick. */
  offBallIntents: OffBallIntents;
  /** Score de la possession COURANTE (0/2/3) si terminée, sinon 0.
   *  Pour le score cumulé sur la session multi-possessions, voir
   *  `cumulativeScore`. */
  score: number;
  /** Outcome final si la possession est terminée, sinon `null` (= en cours). */
  outcome: AiPossessionOutcome | null;
  /** B3b — score cumulé sur toute la session (toutes possessions confondues).
   *  Phase E.1 V1 : alias historique pour `homeScore`. Maintenu pour
   *  rétrocompat (UI / tests existants). */
  cumulativeScore: number;
  /** Phase E.1 V1 — score domicile (notre équipe attaquante). */
  homeScore: number;
  /** Phase E.1 V1 — score visiteur (l'adversaire stub). */
  awayScore: number;
  /** Phase E.1 V1 — équipe qui attaque actuellement. Bascule sur rebond
   *  défensif, revient sur fin de possession adverse. */
  attackingTeam: 'home' | 'away';
  /** Timer de violation 5s de remise en jeu. `null` quand on n'est PAS
   *  en remise active (= passe déjà effectuée, ou step non inbound).
   *  Quand non-null, décompté à chaque tick et déclenche `turnover-pass`
   *  si la balle n'est pas passée à temps. */
  inboundTimerMs: number | null;
  /** Box-Out V2 — animation : cibles de box-out posées au moment de
   *  `resolveShot`. Pendant la pause de transition, chaque défenseur
   *  lerp depuis sa position pré-tir vers `boxOutTargets[id]` sur les
   *  premiers `BOXOUT_ANIMATION_MS` du timer. `null` hors phase rebond. */
  boxOutTargets: Partial<Record<DefenderId, Point>> | null;
  /** Box-Out V2 — instant (en ms `possessionTimeMs`) où le box-out a
   *  débuté. Utilisé pour calculer la progression d'animation. */
  boxOutStartedAtMs: number | null;
  /** E.3 — résultat de rebond pré-calculé au moment du tir.
   *  Permet d'animer le ballon vers la position du rebondeur PENDANT
   *  la pause de transition (au lieu de calculer à la fin et téléporter
   *  la balle). `null` hors phase rebond. */
  pendingRebound: ReboundResult | null;
  /** E.3 — position du ballon au moment du tir (= position du shooter).
   *  Point de départ de l'animation de trajectoire (shooter → cercle
   *  → rebondeur). */
  shotBallStartPos: Point | null;
  /** E.1 V2 stage 1 — position du ballon adverse pendant la phase
   *  `away-possession`. Animé entre 3-4 points imaginaires dans le
   *  back-court pour donner du mouvement visible. `null` hors away. */
  awayBallPos: Point | null;
  /** E.1 V2 stage 2a — positions des 5 joueurs adverses simulés
   *  pendant la phase `away-possession`. Calculées comme miroir des
   *  défenseurs home, puis animées vers leur panier (haut du terrain
   *  en full court, hors viewport en half court). `null` hors away. */
  awayPlayerPositions: Record<DefenderId, Point> | null;
  /** B3b — nombre de possessions terminées (= 0 si encore dans la 1ère). */
  possessionsPlayed: number;
  /** B3b — limite de possessions pour cette session. `null` = endless,
   *  l'utilisateur stoppe manuellement. */
  maxPossessions: number | null;
  /** B3b — timestamp ms du début de la pause de transition. Null si
   *  on est en possession active. Quand non-null et que `TRANSITION_PAUSE_MS`
   *  s'est écoulé, on déclenche la transition (rebond off ou new possession). */
  transitionStartedAtMs: number | null;
  /** Journal des événements typés pour debug + UI (HUD live). */
  eventLog: AiPossessionEvent[];
  /** Seed RNG utilisée (pour replay). */
  seed: number;
  /** Numéro de possession (1-indexé, pour multi-possessions futures). */
  possession: number;
  /** Phase 1.4 — Stats équipe agrégées sur la session. Invariant :
   *  teamStats.home.points === homeScore (idem away). */
  teamStats: {
    home: TeamStats;
    away: TeamStats;
  };
  /** Trajectoire physique 3D précalculée du tir (points avec z). */
  shotPhysicalTrajectory?: Point[] | null;
}

/** Phase 1.4 — Stats agrégées pour une équipe (cumul sur la session). */
export interface TeamStats {
  points: number;
  fgMade: number;
  fgAttempted: number;
  turnovers: number;
  /** Rebonds offensifs. */
  oReb: number;
  /** Rebonds défensifs. */
  dReb: number;
}

export function emptyTeamStats(): TeamStats {
  return {
    points: 0,
    fgMade: 0,
    fgAttempted: 0,
    turnovers: 0,
    oReb: 0,
    dReb: 0,
  };
}

export interface CreateMatchStateOptions {
  /** Seed pour la RNG. Default : Date.now(). */
  seed?: number;
  /** Shot clock initial en ms. Default : 24 000 (= 24 s FIBA). */
  shotClockMs?: number;
  /** Numéro de possession. Default : 1. */
  possession?: number;
  /** B3b — limite de possessions pour cette session. `null` ou
   *  undefined = endless (l'utilisateur stoppe manuellement). */
  maxPossessions?: number | null;
}

export interface TickMatchOptions {
  /** Créativité (0..1) qui module la "température" softmax de la
   *  sélection d'action. Default : 0.35 (légère variance vs meilleure EV). */
  creativity?: number;
  /** B3b — probabilité de rebond offensif sur tir manqué. Default 28 %.
   *  Surchargeable pour tests / scénarios où on veut forcer l'un ou l'autre. */
  offensiveReboundRate?: number;
  /** Phase 1.1 — Force le résultat (panier marqué ou non) du stub
   *  away-possession à sa fin. Permet de tester déterministiquement
   *  les transitions away→home avec/sans inbound. */
  awayScoreOverride?: boolean;
}
