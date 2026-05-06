import type {
  Point,
  AttackerId,
  DefenderId,
  AttackerPositions,
  Matchups,
  DetectedScreen,
  DetectedOffBallScreen,
  OffBallScreenType,
  ScreenRule,
  OffBallScreenRule,
  DropDepth,
} from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';

/**
 * Détecte automatiquement un écran porteur :
 * un attaquant non-porteur se positionne près du défenseur du porteur.
 *
 * TODO palier 4 : la détection actuelle est basée sur la proximité.
 * Améliorations possibles :
 *  - utiliser explicitement les annotations 'screen' dessinées par l'utilisateur
 *  - vérifier que le poseur d'écran est bien orienté vers le défenseur (pas
 *    juste à côté par hasard)
 *  - gérer les écrans en mouvement (slip, ghost screen)
 *
 * Pour l'instant, on cherche le poseur d'écran le plus probable parmi tous
 * les attaquants non-porteurs : celui qui minimise (dist au défenseur du
 * porteur) + 0.5 * (dist au porteur).
 */
export function detectScreen(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  matchups: Matchups,
  defenderPositions: Record<DefenderId, Point>,
  screenRadius: number
): DetectedScreen | null {
  const carrier = off[ballCarrier];
  if (!carrier) return null;

  let carrierDef: DefenderId | null = null;
  (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, o]) => {
    if (o === ballCarrier) carrierDef = d;
  });
  if (!carrierDef) return null;

  const cdPos = defenderPositions[carrierDef];

  let bestScreener: AttackerId | null = null;
  let bestScore = Infinity;

  (Object.entries(off) as [AttackerId, Point][]).forEach(([oId, p]) => {
    if (oId === ballCarrier) return;
    const dToCD = distance(p, cdPos);
    if (dToCD > screenRadius) return;
    const dToCarrier = distance(p, carrier);
    if (dToCarrier > 80) return;
    const score = dToCD + dToCarrier * 0.5;
    if (score < bestScore) {
      bestScore = score;
      bestScreener = oId;
    }
  });

  if (!bestScreener) return null;

  let screenerDef: DefenderId | null = null;
  (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, o]) => {
    if (o === bestScreener) screenerDef = d;
  });
  if (!screenerDef) return null;

  return {
    screener: bestScreener,
    screenerDef,
    carrier: ballCarrier,
    carrierDef,
    screenerPos: off[bestScreener],
  };
}

export function applyScreenAdjustment(
  baseTarget: Point,
  screen: DetectedScreen,
  rule: ScreenRule,
  defenderId: DefenderId,
  off: AttackerPositions,
  screenRadius: number = 35,
  dropDepth: DropDepth = 'medium'
): Point {
  if (rule === 'switch') return baseTarget;

  const isCarrierDef = defenderId === screen.carrierDef;
  const isScreenerDef = defenderId === screen.screenerDef;

  if (!isCarrierDef && !isScreenerDef) return baseTarget;

  const carrierPos = off[screen.carrier];
  const screenerPos = off[screen.screener];

  const dirToHoop = { x: HOOP.x - screenerPos.x, y: HOOP.y - screenerPos.y };
  const len = Math.hypot(dirToHoop.x, dirToHoop.y) || 1;
  const nx = dirToHoop.x / len;
  const ny = dirToHoop.y / len;
  const perpX = -ny;
  const perpY = nx;
  const sideOfCarrier = Math.sign(carrierPos.x - screenerPos.x) || 1;

  if (rule === 'over' && isCarrierDef) {
    const screenTightness = 1 - Math.min(distance(screenerPos, baseTarget), screenRadius) / screenRadius;
    const amplitude = 4 + screenTightness * 8;
    return {
      x: baseTarget.x + perpX * amplitude * sideOfCarrier,
      y: baseTarget.y + perpY * amplitude * sideOfCarrier,
    };
  }

  if (rule === 'under' && isCarrierDef) {
    return { x: baseTarget.x + nx * 24, y: baseTarget.y + ny * 24 };
  }

  if (rule === 'hedge' && isScreenerDef) {
    const carrierToScreenDist = distance(carrierPos, screenerPos);
    const showT = Math.max(0, Math.min(1, (carrierToScreenDist - screenRadius) / screenRadius));
    const showPos = {
      x: (screenerPos.x + carrierPos.x) / 2 - nx * 6,
      y: (screenerPos.y + carrierPos.y) / 2 - ny * 6,
    };
    return {
      x: showPos.x + (baseTarget.x - showPos.x) * showT,
      y: showPos.y + (baseTarget.y - showPos.y) * showT,
    };
  }

  if (rule === 'drop' && isScreenerDef) {
    const depthPx = dropDepth === 'shallow' ? 18 : dropDepth === 'deep' ? 55 : 35;
    return { x: screenerPos.x + nx * depthPx, y: screenerPos.y + ny * depthPx };
  }
  if (rule === 'drop' && isCarrierDef) {
    return {
      x: baseTarget.x + perpX * 6 * sideOfCarrier,
      y: baseTarget.y + perpY * 6 * sideOfCarrier,
    };
  }

  if (rule === 'blitz') {
    const dirSC = { x: carrierPos.x - screenerPos.x, y: carrierPos.y - screenerPos.y };
    const lenSC = Math.hypot(dirSC.x, dirSC.y) || 1;
    const ux = dirSC.x / lenSC;
    const uy = dirSC.y / lenSC;
    const pxSC = -uy;
    const pySC = ux;
    const trapDist = 18;
    const forwardOffset = 14;
    const angleSign = isCarrierDef ? 1 : -1;
    return {
      x: carrierPos.x - ux * forwardOffset + pxSC * trapDist * angleSign,
      y: carrierPos.y - uy * forwardOffset + pySC * trapDist * angleSign,
    };
  }

  return baseTarget;
}

/**
 * Applique un switch aux matchups : les deux défenseurs concernés échangent leurs hommes.
 */
export function applySwitch(matchups: Matchups, screen: DetectedScreen): Matchups {
  const out = { ...matchups };
  const tmp = out[screen.carrierDef];
  out[screen.carrierDef] = out[screen.screenerDef];
  out[screen.screenerDef] = tmp;
  return out;
}

export function detectOffBallScreens(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  matchups: Matchups,
  defenderPositions: Record<DefenderId, Point>,
  screenRadius: number
): DetectedOffBallScreen[] {
  const results: DetectedOffBallScreen[] = [];
  const nonCarriers = (Object.keys(off) as AttackerId[]).filter((id) => id !== ballCarrier);

  for (const cutter of nonCarriers) {
    let cutterDef: DefenderId | null = null;
    (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, o]) => {
      if (o === cutter) cutterDef = d;
    });
    if (!cutterDef) continue;

    const cutterDefPos = defenderPositions[cutterDef];
    const cutterPos = off[cutter];

    for (const screener of nonCarriers) {
      if (screener === cutter) continue;
      const screenerPos = off[screener];

      if (distance(screenerPos, cutterDefPos) > screenRadius) continue;
      if (distance(screenerPos, cutterPos) > 80) continue;

      let screenerDef: DefenderId | null = null;
      (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, o]) => {
        if (o === screener) screenerDef = d;
      });
      if (!screenerDef) continue;

      let type: OffBallScreenType;
      const dy = screenerPos.y - cutterPos.y;
      const ballPos = off[ballCarrier];
      const screenerDistToBall = ballPos ? distance(screenerPos, ballPos) : Infinity;
      const cutterDistToBall = ballPos ? distance(cutterPos, ballPos) : Infinity;

      if (dy > 20) {
        type = 'pindown';
      } else if (dy < -20) {
        type = 'backscreen';
      } else if (screenerDistToBall < cutterDistToBall) {
        type = 'flare';
      } else {
        type = 'pindown';
      }

      results.push({
        type,
        screener,
        screenerDef,
        cutter,
        cutterDef,
        screenerPos,
        cutterPos,
      });
    }
  }

  return results;
}

export function applyOffBallScreenAdjustment(
  baseTarget: Point,
  screen: DetectedOffBallScreen,
  rule: OffBallScreenRule,
  defenderId: DefenderId,
  off: AttackerPositions
): Point {
  if (rule === 'switch') return baseTarget;

  const isCutterDef = defenderId === screen.cutterDef;
  const isScreenerDef = defenderId === screen.screenerDef;
  if (!isCutterDef && !isScreenerDef) return baseTarget;

  const screenerPos = screen.screenerPos;
  const cutterPos = screen.cutterPos;

  const cutDir = { x: cutterPos.x - screenerPos.x, y: cutterPos.y - screenerPos.y };
  const cutLen = Math.hypot(cutDir.x, cutDir.y) || 1;
  const cx = cutDir.x / cutLen;
  const cy = cutDir.y / cutLen;

  if (rule === 'over' && isCutterDef) {
    return { x: baseTarget.x + cx * 10, y: baseTarget.y + cy * 10 };
  }

  if (rule === 'under' && isCutterDef) {
    return { x: baseTarget.x - cx * 12, y: baseTarget.y - cy * 12 };
  }

  if (rule === 'bump' && isScreenerDef) {
    const perpX = -cy;
    const perpY = cx;
    const sideOfCutter = Math.sign(cutterPos.x - screenerPos.x) || 1;
    return {
      x: screenerPos.x + perpX * 12 * sideOfCutter,
      y: screenerPos.y + perpY * 12 * sideOfCutter,
    };
  }

  return baseTarget;
}

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
