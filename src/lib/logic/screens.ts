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
import { HOOP, PLAYER_RADIUS } from '../data/court';
import { distance } from './geometry';

/**
 * Filtre d'intention pour la détection d'écran : un attaquant qui PASSE par
 * hasard près du couple porteur/défenseur n'est pas un poseur. On compare
 * sa distance à la cible (carrierDef ou cutterDef) entre l'étape précédente
 * et l'étape courante :
 *
 *  - s'il s'EST RAPPROCHÉ ou est STATIQUE → intention plausible, on garde.
 *  - s'il s'ÉLOIGNE (cur > prev) avec une velocity ≥ 5 px → écran fantôme
 *    (croisement, pas pose), on rejette.
 *
 * Sans historique (`prevOff` absent), on accepte : on n'a pas de quoi juger.
 */
function hasScreenIntent(
  attackerId: AttackerId,
  curPos: Point,
  targetPos: Point,
  prevOff?: AttackerPositions
): boolean {
  if (!prevOff) return true;
  const prev = prevOff[attackerId];
  if (!prev) return true;
  const speed = Math.hypot(curPos.x - prev.x, curPos.y - prev.y);
  if (speed < 5) return true;
  const prevDist = Math.hypot(targetPos.x - prev.x, targetPos.y - prev.y);
  const curDist = Math.hypot(targetPos.x - curPos.x, targetPos.y - curPos.y);
  return curDist <= prevDist;
}

/**
 * Garantit qu'un point cible n'est pas à l'intérieur du cercle du poseur d'écran
 * (deux joueurs ne peuvent pas se superposer physiquement). Si trop proche,
 * on pousse le point dans la direction opposée jusqu'à un dégagement minimum.
 */
function pushOutOfScreener(target: Point, screenerPos: Point): Point {
  const minClearance = PLAYER_RADIUS * 2 + 2;
  const dx = target.x - screenerPos.x;
  const dy = target.y - screenerPos.y;
  const d = Math.hypot(dx, dy);
  if (d >= minClearance || d < 0.01) return target;
  const k = minClearance / d;
  return {
    x: screenerPos.x + dx * k,
    y: screenerPos.y + dy * k,
  };
}

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
  screenRadius: number,
  forcedScreener?: AttackerId,
  /** Positions des attaquants à l'étape précédente. Si fourni, on filtre les
   *  candidats par INTENTION : leur velocity doit avoir une composante non
   *  négligeable vers le couple porteur/défenseur. Sans cet historique, on
   *  retombe sur le critère de proximité pure (rétrocompat). */
  prevOff?: AttackerPositions
): DetectedScreen | null {
  const carrier = off[ballCarrier];
  if (!carrier) return null;

  let carrierDef: DefenderId | null = null;
  (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, o]) => {
    if (o === ballCarrier) carrierDef = d;
  });
  if (!carrierDef) return null;

  // Override utilisateur : l'attaquant désigné est le poseur, on saute
  // les checks de proximité (l'utilisateur a tranché).
  if (forcedScreener && forcedScreener !== ballCarrier && off[forcedScreener]) {
    let screenerDef: DefenderId | null = null;
    (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, o]) => {
      if (o === forcedScreener) screenerDef = d;
    });
    if (!screenerDef) return null;
    return {
      screener: forcedScreener,
      screenerDef,
      carrier: ballCarrier,
      carrierDef,
      screenerPos: off[forcedScreener],
    };
  }

  const cdPos = defenderPositions[carrierDef];

  let bestScreener: AttackerId | null = null;
  let bestScore = Infinity;

  (Object.entries(off) as [AttackerId, Point][]).forEach(([oId, p]) => {
    if (oId === ballCarrier) return;
    const dToCD = distance(p, cdPos);
    if (dToCD > screenRadius) return;
    const dToCarrier = distance(p, carrier);
    if (dToCarrier > 80) return;
    if (!hasScreenIntent(oId, p, cdPos, prevOff)) return;
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
  dropDepth: DropDepth = 'medium',
  hoop: Point = HOOP
): Point {
  if (rule === 'switch') return baseTarget;

  const isCarrierDef = defenderId === screen.carrierDef;
  const isScreenerDef = defenderId === screen.screenerDef;

  if (!isCarrierDef && !isScreenerDef) return baseTarget;

  const carrierPos = off[screen.carrier];
  const screenerPos = off[screen.screener];

  const dirToHoop = { x: hoop.x - screenerPos.x, y: hoop.y - screenerPos.y };
  const len = Math.hypot(dirToHoop.x, dirToHoop.y) || 1;
  const nx = dirToHoop.x / len;
  const ny = dirToHoop.y / len;
  const perpX = -ny;
  const perpY = nx;
  const sideOfCarrier = Math.sign(carrierPos.x - screenerPos.x) || 1;

  if (rule === 'over' && isCarrierDef) {
    const screenTightness = 1 - Math.min(distance(screenerPos, baseTarget), screenRadius) / screenRadius;
    const amplitude = 14 + screenTightness * 18;
    let target = {
      x: baseTarget.x + perpX * amplitude * sideOfCarrier,
      y: baseTarget.y + perpY * amplitude * sideOfCarrier,
    };
    target = pushOutOfScreener(target, screenerPos);
    return target;
  }

  if (rule === 'under' && isCarrierDef) {
    let target = { x: baseTarget.x + nx * 36, y: baseTarget.y + ny * 36 };
    target = pushOutOfScreener(target, screenerPos);
    return target;
  }

  if (rule === 'hedge' && isScreenerDef) {
    const carrierToScreenDist = distance(carrierPos, screenerPos);
    const showT = Math.max(0, Math.min(1, (carrierToScreenDist - screenRadius) / screenRadius));
    const showPos = {
      x: (screenerPos.x + carrierPos.x) / 2 - nx * 6,
      y: (screenerPos.y + carrierPos.y) / 2 - ny * 6,
    };
    return pushOutOfScreener(
      {
        x: showPos.x + (baseTarget.x - showPos.x) * showT,
        y: showPos.y + (baseTarget.y - showPos.y) * showT,
      },
      screenerPos
    );
  }

  if (rule === 'drop' && isScreenerDef) {
    const depthPx = dropDepth === 'shallow' ? 18 : dropDepth === 'deep' ? 55 : 35;
    return { x: screenerPos.x + nx * depthPx, y: screenerPos.y + ny * depthPx };
  }
  if (rule === 'drop' && isCarrierDef) {
    return pushOutOfScreener(
      {
        x: baseTarget.x + perpX * 14 * sideOfCarrier,
        y: baseTarget.y + perpY * 14 * sideOfCarrier,
      },
      screenerPos
    );
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

  // ICE / no-middle : force le porteur vers la baseline. Le défenseur du
  // porteur saute du côté OPPOSÉ à where over l'aurait placé — il se met
  // entre le porteur et l'écran pour fermer le middle. Le défenseur du
  // screener drop plus profond pour protéger le drive baseline.
  if (rule === 'ice' && isCarrierDef) {
    const screenTightness = 1 - Math.min(distance(screenerPos, baseTarget), screenRadius) / screenRadius;
    const amplitude = 18 + screenTightness * 16;
    let target = {
      // Note le -sideOfCarrier (vs +sideOfCarrier dans 'over') : on coupe
      // la trajectoire vers le middle au lieu de pousser dessus.
      x: baseTarget.x + perpX * amplitude * (-sideOfCarrier),
      y: baseTarget.y + perpY * amplitude * (-sideOfCarrier),
    };
    target = pushOutOfScreener(target, screenerPos);
    return target;
  }
  if (rule === 'ice' && isScreenerDef) {
    // Drop plus profond que medium (45px vs 35) pour absorber le drive baseline.
    return { x: screenerPos.x + nx * 45, y: screenerPos.y + ny * 45 };
  }

  // WEAK : variante d'under. Le défenseur du porteur passe sous mais reste
  // au niveau de l'écran (22px vs 36px) pour recover vite sur le shooter
  // après screen. Le défenseur du screener fait un drop léger (recover si pop).
  if (rule === 'weak' && isCarrierDef) {
    let target = { x: baseTarget.x + nx * 22, y: baseTarget.y + ny * 22 };
    target = pushOutOfScreener(target, screenerPos);
    return target;
  }
  if (rule === 'weak' && isScreenerDef) {
    return { x: screenerPos.x + nx * 22, y: screenerPos.y + ny * 22 };
  }

  // PEEL-SWITCH : géométriquement traité comme `drop` ici. Le déclenchement
  // du switch effectif (quand le porteur dépasse screenerDef) est géré
  // par engine.ts qui appelle applySwitch en plus.
  if (rule === 'peel-switch' && isScreenerDef) {
    const depthPx = dropDepth === 'shallow' ? 18 : dropDepth === 'deep' ? 55 : 35;
    return { x: screenerPos.x + nx * depthPx, y: screenerPos.y + ny * depthPx };
  }
  if (rule === 'peel-switch' && isCarrierDef) {
    return pushOutOfScreener(
      {
        x: baseTarget.x + perpX * 14 * sideOfCarrier,
        y: baseTarget.y + perpY * 14 * sideOfCarrier,
      },
      screenerPos
    );
  }

  return baseTarget;
}

/**
 * Détermine si peel-switch doit basculer en switch effectif à cette étape.
 * Critère : le porteur est passé "devant" le défenseur du screener — il a
 * franchi sa hauteur sur l'axe screener→panier ET continue vers le cercle.
 * À ce moment précis, le screenerDef "lâche" le screener pour peeler vers
 * le porteur (le carrierDef, qui s'est fait écranter, prend le screener).
 */
export function peelSwitchShouldFire(
  off: AttackerPositions,
  screen: DetectedScreen,
  screenerDefPos: Point,
  hoop: Point = HOOP
): boolean {
  const carrierPos = off[screen.carrier];
  if (!carrierPos) return false;
  // Distance du porteur au panier vs distance du screenerDef au panier.
  // Si le porteur est nettement plus proche du panier (≥30px), il a
  // dépassé l'écran et le switch a du sens.
  const dCarrierHoop = distance(carrierPos, hoop);
  const dScreenerDefHoop = distance(screenerDefPos, hoop);
  return dCarrierHoop + 30 < dScreenerDefHoop;
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
  screenRadius: number,
  /** Positions à l'étape précédente — active le filtre d'intention. */
  prevOff?: AttackerPositions
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
      if (!hasScreenIntent(screener, screenerPos, cutterDefPos, prevOff)) continue;

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

  // ---------------------------------------------------------------------
  // P4 — Reconnaissance d'enchaînements : stagger, elevator, hammer, flex.
  // On fusionne plusieurs écrans simples en un seul écran "structurel"
  // pour que les diagnostics et la couverture soient adaptés.
  // ---------------------------------------------------------------------
  return upgradeOffBallScreens(results, off, ballCarrier, HOOP);
}

/**
 * Détecte les enchaînements parmi les écrans non-porteur simples :
 *
 * - **stagger** : 2 pindowns sur le même cutter avec screeners alignés
 *   (l'un devant l'autre vers le panier). On garde un seul écran de
 *   type stagger avec second screener.
 * - **elevator** : 2 screeners très proches l'un de l'autre (à <55px),
 *   formant un "couloir" derrière le cutter. Détection : 2 screens sur
 *   le même cutter, screeners à <55px l'un de l'autre.
 * - **flex** : backscreen baseline (cutter passe derrière le screener
 *   à <80px du panier verticalement, large latéralement).
 * - **hammer** : cutter qui coupe baseline du côté OPPOSÉ au ballon vers
 *   le coin (utilisé pour libérer un tir de coin sur drive). Détecté
 *   comme un backscreen dont le cutter va vers le coin faible.
 */
function upgradeOffBallScreens(
  results: DetectedOffBallScreen[],
  off: AttackerPositions,
  ballCarrier: AttackerId,
  hoop: Point
): DetectedOffBallScreen[] {
  if (results.length === 0) return results;
  const ballPos = off[ballCarrier];
  // 1. Stagger / Elevator : groupe les screens par cutter.
  const byCutter = new Map<AttackerId, DetectedOffBallScreen[]>();
  results.forEach((s) => {
    const list = byCutter.get(s.cutter) ?? [];
    list.push(s);
    byCutter.set(s.cutter, list);
  });

  const consumed = new Set<DetectedOffBallScreen>();
  const upgraded: DetectedOffBallScreen[] = [];

  byCutter.forEach((screensForCutter) => {
    if (screensForCutter.length < 2) return;
    // On ne traite que les pindowns pour stagger/elevator.
    const pindowns = screensForCutter.filter((s) => s.type === 'pindown');
    if (pindowns.length < 2) return;
    const [a, b] = pindowns;
    const dist2screeners = Math.hypot(
      a.screenerPos.x - b.screenerPos.x,
      a.screenerPos.y - b.screenerPos.y
    );
    consumed.add(a);
    consumed.add(b);
    if (dist2screeners < 55) {
      // Elevator : screeners très proches.
      upgraded.push({
        ...a,
        type: 'elevator',
        secondScreener: b.screener,
        secondScreenerDef: b.screenerDef,
        secondScreenerPos: b.screenerPos,
      });
    } else {
      // Stagger : 2 pindowns alignés.
      upgraded.push({
        ...a,
        type: 'stagger',
        secondScreener: b.screener,
        secondScreenerDef: b.screenerDef,
        secondScreenerPos: b.screenerPos,
      });
    }
  });

  // 2. Flex / Hammer : backscreens baseline.
  results.forEach((s) => {
    if (consumed.has(s)) return;
    if (s.type !== 'backscreen') return;
    const cutterToBaseline = Math.abs(s.cutterPos.y - hoop.y);
    if (cutterToBaseline > 100) return; // pas baseline
    if (!ballPos) return;
    const ballSideX = Math.sign(ballPos.x - hoop.x) || 0;
    const cutterSideX = Math.sign(s.cutterPos.x - hoop.x) || 0;
    if (ballSideX !== 0 && cutterSideX !== 0 && ballSideX !== cutterSideX) {
      // Cutter va vers le côté FAIBLE (opposé du ballon) → hammer.
      consumed.add(s);
      upgraded.push({ ...s, type: 'hammer' });
    } else if (ballSideX !== 0 && cutterSideX === ballSideX) {
      // Cutter reste côté fort → flex.
      consumed.add(s);
      upgraded.push({ ...s, type: 'flex' });
    }
  });

  // 3. Tous les autres restent tels quels.
  results.forEach((s) => {
    if (!consumed.has(s)) upgraded.push(s);
  });

  return upgraded;
}

export function applyOffBallScreenAdjustment(
  baseTarget: Point,
  screen: DetectedOffBallScreen,
  rule: OffBallScreenRule,
  defenderId: DefenderId,
  off: AttackerPositions,
  ballPos: Point
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
    return pushOutOfScreener({ x: baseTarget.x + cx * 18, y: baseTarget.y + cy * 18 }, screenerPos);
  }

  if (rule === 'under' && isCutterDef) {
    return pushOutOfScreener({ x: baseTarget.x - cx * 22, y: baseTarget.y - cy * 22 }, screenerPos);
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

  // TOP-LOCK : le défenseur du cutter se positionne du CÔTÉ BALLON pour
  // empêcher la réception. Le côté ballon se calcule perpendiculairement
  // à l'axe screener→cutter : on projette le vecteur (cutter→ballon) sur
  // la perpendiculaire et on prend le signe. Le défenseur est aussi shifté
  // d'une touche vers le screener (high side) pour matérialiser le contact.
  if (rule === 'top-lock' && isCutterDef) {
    const perpX = -cy;
    const perpY = cx;
    const toBallX = ballPos.x - cutterPos.x;
    const toBallY = ballPos.y - cutterPos.y;
    const sideOfBall = Math.sign(perpX * toBallX + perpY * toBallY) || 1;
    return pushOutOfScreener(
      {
        x: baseTarget.x + perpX * 16 * sideOfBall - cx * 4,
        y: baseTarget.y + perpY * 16 * sideOfBall - cy * 4,
      },
      screenerPos
    );
  }

  // CHASE / TRAIL : le défenseur du shooter reste COLLÉ derrière le cutter
  // (pas sous l'écran). Différent d'un over standard : amplitude plus
  // marquée vers le cutter, jamais en retrait. Pour shooter qui sort de
  // pindown ou stagger.
  if (rule === 'chase' && isCutterDef) {
    return pushOutOfScreener(
      { x: baseTarget.x + cx * 24, y: baseTarget.y + cy * 24 },
      screenerPos
    );
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
