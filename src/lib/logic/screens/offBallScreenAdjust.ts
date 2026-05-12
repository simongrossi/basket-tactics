// Ajustement de la cible défensive sur ÉCRAN HORS-BALLON (pindown, backscreen,
// flare, stagger, elevator, flex, hammer).
//
// Rules supportées : over, under, bump, top-lock, chase, switch.
// switch est traité au niveau matchups (cf. `applySwitchOffBall`).
//
// Convention de quality : identique à l'écran porteur (cf. carrierScreenAdjust).

import type {
  AttackerPositions,
  DefenderId,
  DetectedOffBallScreen,
  Matchups,
  OffBallScreenRule,
  Point,
} from '../../types';
import { MIN_PLAYER_CLEARANCE_PX } from '../../data/physics';
import { distance } from '../geometry';
import { pushOutOfScreener, pushOutOfScreeners } from './helpers';

export function applyOffBallScreenAdjustment(
  baseTarget: Point,
  screen: DetectedOffBallScreen,
  rule: OffBallScreenRule,
  defenderId: DefenderId,
  off: AttackerPositions,
  ballPos: Point,
  quality: number = 50
): Point {
  if (rule === 'switch') return baseTarget;

  const isCutterDef = defenderId === screen.cutterDef;
  const isScreenerDef =
    defenderId === screen.screenerDef || defenderId === screen.secondScreenerDef;
  if (!isCutterDef && !isScreenerDef) return baseTarget;

  const q = Math.max(0, Math.min(100, quality)) / 100;
  if (q < 0.05) return baseTarget;

  const screeners = offBallScreenerContacts(screen, off);
  const screenerPos = pickOffBallContactScreener(screen, screeners, baseTarget);
  const cutterPos = screen.cutterPos;

  // Repère local : axe screener → cutter (c) + perpendiculaire.
  const cutDir = { x: cutterPos.x - screenerPos.x, y: cutterPos.y - screenerPos.y };
  const cutLen = Math.hypot(cutDir.x, cutDir.y) || 1;
  const cx = cutDir.x / cutLen;
  const cy = cutDir.y / cutLen;
  const perpX = -cy;
  const perpY = cx;
  // Bonus de "lourdeur" si stagger/elevator (deux poseurs) : le défenseur
  // doit travailler plus pour les éviter.
  const doubleScreenBonus = screeners.length > 1 ? 1 : 0;

  // ----- OVER (cutter def passe devant le screener) -----
  if (rule === 'over' && isCutterDef) {
    return pushOutOfScreeners(
      {
        x: screenerPos.x - cx * (MIN_PLAYER_CLEARANCE_PX + q * 8),
        y: screenerPos.y - cy * (MIN_PLAYER_CLEARANCE_PX + q * 8),
      },
      screeners
    );
  }

  // ----- UNDER (cutter def passe en arrière du screener) -----
  if (rule === 'under' && isCutterDef) {
    const toBall = { x: ballPos.x - cutterPos.x, y: ballPos.y - cutterPos.y };
    const awayFromBallSide = (perpX * toBall.x + perpY * toBall.y) >= 0 ? -1 : 1;
    const lag = 24 + q * 26 + doubleScreenBonus * 14;
    const wrap = (10 + q * 18 + doubleScreenBonus * 8) * awayFromBallSide;
    return pushOutOfScreeners(
      {
        x: baseTarget.x - cx * lag + perpX * wrap,
        y: baseTarget.y - cy * lag + perpY * wrap,
      },
      screeners
    );
  }

  // ----- BUMP (screener def fait contact pour ralentir le cutter) -----
  if (rule === 'bump' && isScreenerDef) {
    const ownScreener = screeners.find((s) => s.defender === defenderId)?.pos ?? screenerPos;
    const sideOfCutter = Math.sign(cutterPos.x - screenerPos.x) || 1;
    return {
      x: ownScreener.x + perpX * (10 + q * 8) * sideOfCutter,
      y: ownScreener.y + perpY * (10 + q * 8) * sideOfCutter,
    };
  }

  // ----- TOP-LOCK -----
  // Le défenseur du cutter se positionne du CÔTÉ BALLON pour empêcher la
  // réception. Le côté ballon se calcule perpendiculairement à l'axe
  // screener→cutter : on projette le vecteur (cutter→ballon) sur la
  // perpendiculaire et on prend le signe. Le défenseur est aussi shifté
  // d'une touche vers le screener (high side) pour matérialiser le contact.
  if (rule === 'top-lock' && isCutterDef) {
    const toBallX = ballPos.x - cutterPos.x;
    const toBallY = ballPos.y - cutterPos.y;
    const sideOfBall = Math.sign(perpX * toBallX + perpY * toBallY) || 1;
    return pushOutOfScreeners(
      {
        x: baseTarget.x + perpX * (10 + q * 16) * sideOfBall - cx * (4 + q * 5),
        y: baseTarget.y + perpY * (10 + q * 16) * sideOfBall - cy * (4 + q * 5),
      },
      screeners
    );
  }

  // ----- CHASE / TRAIL -----
  // Le défenseur du shooter reste COLLÉ derrière le cutter (pas sous
  // l'écran). Différent d'un over standard : amplitude plus marquée vers
  // le cutter, jamais en retrait. Pour shooter qui sort de pindown ou stagger.
  if (rule === 'chase' && isCutterDef) {
    return pushOutOfScreeners(
      {
        x: screenerPos.x - cx * (MIN_PLAYER_CLEARANCE_PX + q * 10),
        y: screenerPos.y - cy * (MIN_PLAYER_CLEARANCE_PX + q * 10),
      },
      screeners
    );
  }

  return baseTarget;
}

/** Tous les poseurs concernés par l'écran (1 pour simple, 2 pour
 *  stagger/elevator). Position résolue depuis `off` si disponible. */
function offBallScreenerContacts(
  screen: DetectedOffBallScreen,
  off: AttackerPositions
): Array<{ defender: DefenderId; pos: Point }> {
  const out = [{ defender: screen.screenerDef, pos: off[screen.screener] ?? screen.screenerPos }];
  if (screen.secondScreener && screen.secondScreenerDef && screen.secondScreenerPos) {
    out.push({
      defender: screen.secondScreenerDef,
      pos: off[screen.secondScreener] ?? screen.secondScreenerPos,
    });
  }
  return out;
}

/** Sélectionne LE poseur de contact dans le cas multi-poseurs :
 *   - 1 seul → trivial
 *   - elevator → centroïde (les deux poseurs forment un mur fusionné)
 *   - stagger / autres → le poseur le plus proche de l'ancre (= baseTarget)
 *     pour que le défenseur réagisse au poseur qu'il franchit en premier */
function pickOffBallContactScreener(
  screen: DetectedOffBallScreen,
  screeners: Array<{ defender: DefenderId; pos: Point }>,
  anchor: Point
): Point {
  if (screeners.length === 1) return screeners[0].pos;
  if (screen.type === 'elevator') {
    return {
      x: screeners.reduce((sum, s) => sum + s.pos.x, 0) / screeners.length,
      y: screeners.reduce((sum, s) => sum + s.pos.y, 0) / screeners.length,
    };
  }
  return screeners.reduce((best, s) => {
    const bestDist = distance(anchor, best.pos);
    const dist = distance(anchor, s.pos);
    return dist < bestDist ? s : best;
  }).pos;
}

/**
 * Applique un switch aux matchups sur un écran hors-ballon : cutterDef et
 * screenerDef échangent leurs hommes. Appelé par le moteur quand
 * `rule === 'switch'` pour un écran off-ball.
 */
export function applySwitchOffBall(
  matchups: Matchups,
  screen: DetectedOffBallScreen
): Matchups {
  const out = { ...matchups };
  const tmp = out[screen.cutterDef];
  out[screen.cutterDef] = out[screen.screenerDef];
  out[screen.screenerDef] = tmp;
  return out;
}
