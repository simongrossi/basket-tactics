import type {
  AttackerPositions,
  DetectedScreen,
  Point,
  AttackerId,
} from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';

/**
 * Type d'action détectée sur un écran porteur. Distingue les 8 lectures
 * classiques d'un pick-and-roll que doit reconnaître un coach :
 *
 * - `roll`        : le poseur d'écran court vers le panier après contact.
 * - `pop`         : le poseur d'écran ressort à 3pts après contact.
 * - `slip`        : le poseur part au panier AVANT contact (timing court).
 * - `short-roll`  : roll qui s'arrête au mid-range (espace pour passe + tir).
 * - `ghost`       : faux écran, le poseur sort à 3pts sans contact.
 * - `reject`      : le porteur drive du côté opposé à l'écran (le refuse).
 * - `snake`       : le porteur ressort par où il est venu (changement de
 *                   direction sous l'écran). Détecté avec 2 étapes d'historique.
 * - `re-screen`   : second écran posé immédiatement après par le même attaquant.
 */
export type ScreenAction =
  | 'roll'
  | 'pop'
  | 'slip'
  | 'short-roll'
  | 'ghost'
  | 'reject'
  | 'snake'
  | 're-screen';

export interface DetectedScreenAction {
  kind: ScreenAction;
  /** Score de confiance 0..1. <0.5 = signal faible, hypothèse par défaut. */
  confidence: number;
  /** Phrase courte expliquant pourquoi cette action a été retenue. Sert au
   *  debug pill et aux diagnostics coach. */
  reason: string;
}

/** Un attaquant est "au cercle" en dessous de cette distance du panier. */
const RIM_RADIUS = 100;
/** Mid-range : entre le cercle et l'arc 3pts. */
const MID_RADIUS_MIN = 100;
const MID_RADIUS_MAX = 220;
/** Distance "contact" entre poseur et porteur — sous ce seuil on considère
 *  que l'écran a été effectivement subi par le défenseur du porteur. */
const CONTACT_DIST = 55;
/** Delta minimal de distance au panier (px) pour caractériser un mouvement
 *  net du poseur — sous ce seuil, on considère qu'il n'a pas bougé. */
const MIN_MOTION_DELTA = 18;
/** Delta minimal de mouvement latéral du porteur pour parler de reject. */
const MIN_REJECT_LATERAL = 30;

/**
 * Détecte le type d'action déclenchée par un écran porteur, à partir des
 * positions courantes et précédentes des attaquants.
 *
 * Le moteur n'a pas accès au "moment du contact", donc les heuristiques
 * comparent positions à l'étape N-1 et à l'étape N. Pour `snake` et
 * `re-screen` qui demandent plus d'historique (N-2 ou step suivant),
 * fournir `prevPrevOff` et `prevScreen`.
 *
 * Si `prevOff` est null (étape 0), retourne hypothèse minimale.
 */
export function detectScreenAction(
  off: AttackerPositions,
  prevOff: AttackerPositions | null,
  screen: DetectedScreen,
  prevScreen: DetectedScreen | null = null,
  prevPrevOff: AttackerPositions | null = null,
  hoop: Point = HOOP
): DetectedScreenAction {
  // Re-screen : même paire (screener, carrier) déjà détectée à l'étape précédente.
  if (
    prevScreen &&
    prevScreen.screener === screen.screener &&
    prevScreen.carrier === screen.carrier
  ) {
    return {
      kind: 're-screen',
      confidence: 0.9,
      reason: `${screen.screener} repose un écran sur ${screen.carrier} (action en série)`,
    };
  }

  if (!prevOff) {
    return {
      kind: 'roll',
      confidence: 0.3,
      reason: 'pas d historique — hypothèse roll par défaut',
    };
  }

  const screenerNow = off[screen.screener];
  const screenerPrev = prevOff[screen.screener];
  const carrierNow = off[screen.carrier];
  const carrierPrev = prevOff[screen.carrier];
  if (!screenerNow || !screenerPrev || !carrierNow || !carrierPrev) {
    return { kind: 'roll', confidence: 0.3, reason: 'positions manquantes' };
  }

  const dHoopNow = distance(screenerNow, hoop);
  const dHoopPrev = distance(screenerPrev, hoop);
  const dHoopDelta = dHoopNow - dHoopPrev; // négatif = se rapproche du panier

  // "Contact" supposé si le poseur a été proche du porteur soit avant soit
  // pendant. Sinon → action sans contact réel (slip / ghost).
  const dContactPrev = distance(screenerPrev, carrierPrev);
  const dContactNow = distance(screenerNow, carrierNow);
  const hadContact = dContactPrev < CONTACT_DIST || dContactNow < CONTACT_DIST;

  // Slip : pas de contact + mouvement net vers le panier.
  if (!hadContact && dHoopDelta < -MIN_MOTION_DELTA) {
    return {
      kind: 'slip',
      confidence: 0.75,
      reason: `${screen.screener} part au panier sans poser l'écran (slip)`,
    };
  }

  // Ghost : pas de contact + mouvement vers l'extérieur (fake screen).
  if (!hadContact && dHoopDelta > MIN_MOTION_DELTA && dHoopNow > MID_RADIUS_MAX) {
    return {
      kind: 'ghost',
      confidence: 0.7,
      reason: `${screen.screener} fait un écran fantôme et ressort à 3pts`,
    };
  }

  // Snake : porteur revient sur son côté de départ (besoin de 2 steps de prev).
  if (prevPrevOff) {
    const carrierPrevPrev = prevPrevOff[screen.carrier];
    if (carrierPrevPrev) {
      const dx1 = carrierPrev.x - carrierPrevPrev.x;
      const dx2 = carrierNow.x - carrierPrev.x;
      // Snake = inversion de direction lattérale ET mouvement non négligeable
      // sur les deux segments.
      if (
        Math.abs(dx1) > 25 &&
        Math.abs(dx2) > 25 &&
        Math.sign(dx1) !== Math.sign(dx2)
      ) {
        return {
          kind: 'snake',
          confidence: 0.8,
          reason: `${screen.carrier} fait un snake dribble sous l'écran`,
        };
      }
    }
  }

  // Reject : porteur drive du côté OPPOSÉ à l'écran.
  // Le côté de l'écran = signe de (screener.x - carrier.x) à l'étape précédente.
  const screenSideX = screenerPrev.x - carrierPrev.x;
  const carrierMoveX = carrierNow.x - carrierPrev.x;
  if (
    Math.abs(screenSideX) > 20 &&
    Math.abs(carrierMoveX) > MIN_REJECT_LATERAL &&
    Math.sign(screenSideX) !== Math.sign(carrierMoveX)
  ) {
    return {
      kind: 'reject',
      confidence: 0.7,
      reason: `${screen.carrier} reject l'écran et drive côté opposé`,
    };
  }

  // Roll : poseur court vers le panier après contact.
  if (dHoopDelta < -MIN_MOTION_DELTA) {
    // Short-roll si le mouvement s'arrête au mid-range (pas jusqu'au cercle).
    if (dHoopNow > MID_RADIUS_MIN && dHoopNow < MID_RADIUS_MAX) {
      return {
        kind: 'short-roll',
        confidence: 0.75,
        reason: `${screen.screener} short-roll au mid-range (${Math.round(dHoopNow)}px du panier)`,
      };
    }
    if (dHoopNow <= RIM_RADIUS) {
      return {
        kind: 'roll',
        confidence: 0.9,
        reason: `${screen.screener} roule au cercle (-${Math.round(-dHoopDelta)}px)`,
      };
    }
    return {
      kind: 'roll',
      confidence: 0.7,
      reason: `${screen.screener} roule vers le panier`,
    };
  }

  // Pop : poseur ressort vers 3pts.
  if (dHoopDelta > MIN_MOTION_DELTA) {
    return {
      kind: 'pop',
      confidence: 0.85,
      reason: `${screen.screener} pop à 3pts (+${Math.round(dHoopDelta)}px du panier)`,
    };
  }

  // Mouvement ambigu : le poseur n'a quasi pas bougé. On retourne `roll`
  // par défaut avec confidence faible — c'est le cas typique d'un pick-and-roll
  // statique en cours de pose, pas encore résolu.
  return {
    kind: 'roll',
    confidence: 0.4,
    reason: 'écran posé, action non résolue (immobile)',
  };
}

/** Étiquette française courte pour l'UI. */
export function screenActionLabel(kind: ScreenAction): string {
  switch (kind) {
    case 'roll':       return 'roll';
    case 'pop':        return 'pop';
    case 'slip':       return 'slip';
    case 'short-roll': return 'short-roll';
    case 'ghost':      return 'ghost screen';
    case 'reject':     return 'reject';
    case 'snake':      return 'snake dribble';
    case 're-screen':  return 're-screen';
  }
}

/** Indique si l'action implique le poseur qui se dirige vers le panier
 *  (donc le low-man doit tagger). */
export function actionRequiresLowManTag(kind: ScreenAction): boolean {
  return kind === 'roll' || kind === 'short-roll' || kind === 'slip';
}

/** Indique si l'action met le poseur en position de tir extérieur — le
 *  défenseur du screener doit recover sur lui (pas drop). */
export function actionRequiresPopRecover(kind: ScreenAction): boolean {
  return kind === 'pop' || kind === 'ghost';
}

/** Indique si l'action invalide la couverture pré-écran (porteur change
 *  de plan). Utile pour signaler "couverture cassée par reject/snake". */
export function actionBreaksCoverage(kind: ScreenAction): boolean {
  return kind === 'reject' || kind === 'snake';
}
