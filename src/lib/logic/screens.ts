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
import { MIN_PLAYER_CLEARANCE_PX } from '../data/physics';
import { distance, lerp as lerpPoint } from './geometry';

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
/**
 * Smoothstep continu sur [edge0, edge1]. Remplace les `Math.max(0, Math.min(1, x))`
 * pour éviter les discontinuités de dérivée aux bornes — ce qui crée un saut
 * visuel quand une distance franchit le seuil.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function pushOutOfScreener(target: Point, screenerPos: Point): Point {
  const minClearance = MIN_PLAYER_CLEARANCE_PX;
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
 * Pousse un défenseur hors du porteur en respectant la clearance minimale.
 * `direction` (optionnel) impose le côté de poussée : utile en mode "under"
 * où D1 doit rester du côté opposé au panier, ou en "hedge agressif" où D5
 * doit rester côté panier. Si direction non fournie, pousse radialement.
 *
 * Crucial pour les écrans : sans cela, à faible quality D1/D5 peuvent
 * atterrir à <34px du porteur (chevauchement visuel) alors que la cible
 * a été calculée avec une amplitude < clearance.
 */
function pushOutOfCarrier(
  target: Point,
  carrierPos: Point,
  preferredDir?: { x: number; y: number }
): Point {
  const minClearance = MIN_PLAYER_CLEARANCE_PX;
  const dx = target.x - carrierPos.x;
  const dy = target.y - carrierPos.y;
  const d = Math.hypot(dx, dy);
  if (d >= minClearance) return target;
  // Construction d'une direction de poussée CONTINUE :
  // - on part de la direction radiale (target - carrier), qui est toujours
  //   bien définie tant que d > 0.01.
  // - on AJOUTE la direction préférée (sideOfCarrier × perp) qui guide vers
  //   la bonne route (over/under/etc.). Quand sideOfCarrier ≈ 0, la
  //   préférée est ~nulle → on retombe sur le radial pur (continu).
  //   Quand sideOfCarrier ≈ ±1, la préférée domine → côté privilégié.
  // Cette somme normalisée évite les sauts à la transition de signe.
  let dirX = dx;
  let dirY = dy;
  if (d > 0.01) {
    dirX = dx / d;
    dirY = dy / d;
  } else {
    // Target colle au porteur. On part d'une orientation arbitraire +y.
    dirX = 0;
    dirY = 1;
  }
  if (preferredDir) {
    // On pondère la direction préférée par sa magnitude (sideOfCarrier ∈
    // [-1, 1]) — pas de normalisation, pour éviter le flip à magnitude faible.
    // Coefficient 2 pour que la préférée domine quand |sideOfCarrier| > 0.5.
    dirX += preferredDir.x * 2;
    dirY += preferredDir.y * 2;
  }
  const dlen = Math.hypot(dirX, dirY) || 1;
  return {
    x: carrierPos.x + (dirX / dlen) * minClearance,
    y: carrierPos.y + (dirY / dlen) * minClearance,
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
  hoop: Point = HOOP,
  quality: number = 50
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
  // SIDE OF CARRIER — version géométriquement continue.
  // On NORMALISE le vecteur poseur→porteur puis on projette sur l'axe
  // perpendiculaire à l'axe poseur→panier. Cela donne `sideOfCarrier`
  // strictement continu dans [-1, 1] :
  //  - le porteur tourne autour du poseur → la projection varie sans saut
  //  - le porteur traverse l'axe poseur→panier → sideOfCarrier passe par 0
  //    proprement (pas de flip de signe par Math.sign)
  // Math.sign créerait une téléportation d'un côté à l'autre quand le porteur
  // change de côté pour un micro-décalage.
  const sToCx = carrierPos.x - screenerPos.x;
  const sToCy = carrierPos.y - screenerPos.y;
  const sToCLen = Math.hypot(sToCx, sToCy) || 1;
  const sideOfCarrier = (sToCx * perpX + sToCy * perpY) / sToCLen;

  // q ∈ [0, 1] : 0 = ghost (effet quasi nul), 1 = lockdown (D1 plaqué).
  const q = Math.max(0, Math.min(100, quality)) / 100;

  if (rule === 'over' && isCarrierDef) {
    // D1 est BLOQUÉ par le poseur, juste derrière lui côté basket.
    // Position cible = sur le poseur, légèrement reculé (vers le panier).
    // Distance par rapport à O1 ≈ |O1 - S| + lag, ce qui suffit à voir D1
    // "stuck" pendant que O1 va prendre l'avantage.
    const lagBack = 5 + 25 * q; // 5px à q=0, 30px à q=1, du côté basket
    const sideOffset = 8 + 8 * q; // léger décalage perpendiculaire (route over)
    let target = {
      x: screenerPos.x + nx * lagBack + perpX * sideOffset * sideOfCarrier,
      y: screenerPos.y + ny * lagBack + perpY * sideOffset * sideOfCarrier,
    };
    // À q=0, on revient quasi à la cible de base pour préserver le cas "faux écran".
    target = lerpPoint(baseTarget, target, q * 0.85 + 0.15);
    target = pushOutOfScreener(target, screenerPos);
    // Garantit la séparation visuelle avec le porteur (côté basket, route over).
    target = pushOutOfCarrier(target, carrierPos, { x: nx, y: ny });
    return target;
  }

  if (rule === 'under' && isCarrierDef) {
    // D1 passe SOUS l'écran : il est BEHIND O1 (côté opposé au basket), au
    // niveau du poseur. O1 prend l'avance pour shooter pull-up ou attaquer
    // si D5 est en drop. q module la distance derrière O1.
    const lagBehind = 20 + 35 * q; // 20px à q=0, 55px à q=1, côté opposé au basket
    const candidate = {
      x: carrierPos.x - nx * lagBehind,
      y: carrierPos.y - ny * lagBehind,
    };
    let target = lerpPoint(baseTarget, candidate, q * 0.85 + 0.15);
    target = pushOutOfScreener(target, screenerPos);
    // D1 doit rester côté OPPOSÉ au panier par rapport à O1 (under = derrière).
    target = pushOutOfCarrier(target, carrierPos, { x: -nx, y: -ny });
    return target;
  }

  if (rule === 'hedge' && isScreenerDef) {
    // D5 sort agressivement DEVANT O1 (entre O1 et le panier). À q=0 reste
    // à mi-chemin S↔C (= comportement legacy). À q=1 D5 est carrément
    // devant O1 côté basket, pour neutraliser le porteur le temps que D1
    // recover.
    const carrierToScreenDist = distance(carrierPos, screenerPos);
    // smoothstep au lieu de clamp dur : la dérivée est nulle aux bornes,
    // donc pas de discontinuité quand le porteur franchit le cercle d'écran.
    const showT = smoothstep(screenRadius, 2 * screenRadius, carrierToScreenDist);
    const showPos = {
      x: (screenerPos.x + carrierPos.x) / 2 - nx * 6,
      y: (screenerPos.y + carrierPos.y) / 2 - ny * 6,
    };
    const legacyTarget = {
      x: showPos.x + (baseTarget.x - showPos.x) * showT,
      y: showPos.y + (baseTarget.y - showPos.y) * showT,
    };
    // Position "agressive" : devant O1 côté basket
    const aggressiveAdvance = 25 + 35 * q;
    const aggressiveTarget = {
      x: carrierPos.x + nx * aggressiveAdvance,
      y: carrierPos.y + ny * aggressiveAdvance,
    };
    // Interpoler entre legacy (q=0) et aggressive (q=1).
    const blended = lerpPoint(legacyTarget, aggressiveTarget, q);
    let target = pushOutOfScreener(blended, screenerPos);
    // D5 doit rester côté basket par rapport à O1 (devant lui).
    target = pushOutOfCarrier(target, carrierPos, { x: nx, y: ny });
    return target;
  }

  if (rule === 'hedge' && isCarrierDef) {
    // D1 est plaqué AU poseur (route over qui a échoué sur l'écran). Le
    // poseur est entre lui et le porteur. D1 doit se retrouver DU CÔTÉ
    // OPPOSÉ au porteur par rapport au poseur — c'est-à-dire qu'il est
    // BLOQUÉ par le poseur, qui est entre lui et O1.
    //
    // Géométriquement : on prend la direction (carrier → screener),
    // prolongée AU-DELÀ du screener d'une distance MIN_CLEARANCE pour
    // que D1 soit pile derrière le poseur, côté opposé au porteur.
    // smoothstep : la dérivée tend vers 0 au seuil, pas de saut d'amplitude
    // quand baseTarget franchit le cercle d'écran.
    const tightness = 1 - smoothstep(0, screenRadius, distance(screenerPos, baseTarget));
    const legacyAmplitude = 8 + tightness * 8;
    const legacyTarget = {
      x: baseTarget.x + perpX * legacyAmplitude * sideOfCarrier,
      y: baseTarget.y + perpY * legacyAmplitude * sideOfCarrier,
    };
    // Direction carrier → screener (unitaire) : continue jusqu'à dépasser
    // le poseur du clearance minimal. D1 se retrouve "derrière" le poseur
    // par rapport au porteur.
    const cToSx = screenerPos.x - carrierPos.x;
    const cToSy = screenerPos.y - carrierPos.y;
    const cToSLen = Math.hypot(cToSx, cToSy) || 1;
    const cToSUx = cToSx / cToSLen;
    const cToSUy = cToSy / cToSLen;
    const stuckTarget = {
      x: screenerPos.x + cToSUx * MIN_PLAYER_CLEARANCE_PX * 0.7,
      y: screenerPos.y + cToSUy * MIN_PLAYER_CLEARANCE_PX * 0.7,
    };
    let target = lerpPoint(legacyTarget, stuckTarget, q);
    target = pushOutOfScreener(target, screenerPos);
    // Clearance avec O1 garantie en poussant dans la direction
    // (target → carrier inversée) — si target est déjà du côté opposé,
    // pushOutOfCarrier ne change rien.
    target = pushOutOfCarrier(target, carrierPos, {
      x: cToSUx, // direction carrier → screener → au-delà
      y: cToSUy,
    });
    return target;
  }

  if (rule === 'drop' && isScreenerDef) {
    const depthPx = dropDepth === 'shallow' ? 18 : dropDepth === 'deep' ? 55 : 35;
    return { x: screenerPos.x + nx * depthPx, y: screenerPos.y + ny * depthPx };
  }
  if (rule === 'drop' && isCarrierDef) {
    // En drop, D5 absorbe la pénétration. D1 doit over par-dessus en
    // étant retardé proportionnellement à la qualité de l'écran. q=0 →
    // léger décalage 14px (legacy), q=1 → D1 plaqué au poseur (mais
    // moins que en hedge, car D5 prend la charge).
    const legacyTarget = {
      x: baseTarget.x + perpX * 14 * sideOfCarrier,
      y: baseTarget.y + perpY * 14 * sideOfCarrier,
    };
    const lagBack = 5 + 18 * q;
    const stuckTarget = {
      x: screenerPos.x + nx * lagBack + perpX * 8 * sideOfCarrier,
      y: screenerPos.y + ny * lagBack + perpY * 8 * sideOfCarrier,
    };
    let target = lerpPoint(legacyTarget, stuckTarget, q * 0.7);
    target = pushOutOfScreener(target, screenerPos);
    // D1 en drop reste côté basket (over léger), clearance garantie avec O1.
    target = pushOutOfCarrier(target, carrierPos, { x: nx, y: ny });
    return target;
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
    const screenTightness = 1 - smoothstep(0, screenRadius, distance(screenerPos, baseTarget));
    const amplitude = 18 + screenTightness * 16;
    let target = {
      // Note le -sideOfCarrier (vs +sideOfCarrier dans 'over') : on coupe
      // la trajectoire vers le middle au lieu de pousser dessus.
      x: baseTarget.x + perpX * amplitude * (-sideOfCarrier),
      y: baseTarget.y + perpY * amplitude * (-sideOfCarrier),
    };
    target = pushOutOfScreener(target, screenerPos);
    // D1 ferme le middle, du côté -sideOfCarrier (perpendiculaire au panier).
    target = pushOutOfCarrier(target, carrierPos, {
      x: perpX * (-sideOfCarrier),
      y: perpY * (-sideOfCarrier),
    });
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
    // weak = under léger, D1 côté panier (sous le poseur, prêt à recover).
    target = pushOutOfCarrier(target, carrierPos, { x: nx, y: ny });
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
    let target = pushOutOfScreener(
      {
        x: baseTarget.x + perpX * 14 * sideOfCarrier,
        y: baseTarget.y + perpY * 14 * sideOfCarrier,
      },
      screenerPos
    );
    target = pushOutOfCarrier(target, carrierPos, {
      x: perpX * sideOfCarrier,
      y: perpY * sideOfCarrier,
    });
    return target;
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

  const cutDir = { x: cutterPos.x - screenerPos.x, y: cutterPos.y - screenerPos.y };
  const cutLen = Math.hypot(cutDir.x, cutDir.y) || 1;
  const cx = cutDir.x / cutLen;
  const cy = cutDir.y / cutLen;
  const perpX = -cy;
  const perpY = cx;
  const doubleScreenBonus = screeners.length > 1 ? 1 : 0;

  if (rule === 'over' && isCutterDef) {
    return pushOutOfScreeners(
      {
        x: screenerPos.x - cx * (MIN_PLAYER_CLEARANCE_PX + q * 8),
        y: screenerPos.y - cy * (MIN_PLAYER_CLEARANCE_PX + q * 8),
      },
      screeners
    );
  }

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

  if (rule === 'bump' && isScreenerDef) {
    const ownScreener = screeners.find((s) => s.defender === defenderId)?.pos ?? screenerPos;
    const sideOfCutter = Math.sign(cutterPos.x - screenerPos.x) || 1;
    return {
      x: ownScreener.x + perpX * (10 + q * 8) * sideOfCutter,
      y: ownScreener.y + perpY * (10 + q * 8) * sideOfCutter,
    };
  }

  // TOP-LOCK : le défenseur du cutter se positionne du CÔTÉ BALLON pour
  // empêcher la réception. Le côté ballon se calcule perpendiculairement
  // à l'axe screener→cutter : on projette le vecteur (cutter→ballon) sur
  // la perpendiculaire et on prend le signe. Le défenseur est aussi shifté
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

  // CHASE / TRAIL : le défenseur du shooter reste COLLÉ derrière le cutter
  // (pas sous l'écran). Différent d'un over standard : amplitude plus
  // marquée vers le cutter, jamais en retrait. Pour shooter qui sort de
  // pindown ou stagger.
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

function pushOutOfScreeners(
  target: Point,
  screeners: Array<{ defender: DefenderId; pos: Point }>
): Point {
  return screeners.reduce((p, s) => pushOutOfScreener(p, s.pos), target);
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
