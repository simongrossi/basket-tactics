// Ajustement de la cible défensive sur ÉCRAN PORTEUR.
//
// `applyScreenAdjustment(baseTarget, screen, rule, …)` modifie la cible
// homme-à-homme calculée en amont pour refléter la rule défensive choisie :
// over, hedge, under, drop, ice, blitz, weak, peel-switch. switch est traité
// au niveau matchups (cf. `applySwitch`).
//
// Convention de quality (0..100, défaut 50) :
//   q = quality / 100 ∈ [0, 1]
//   0   → ghost (effet quasi nul, écran "raté")
//   1   → lockdown (D1 plaqué au poseur, écran "parfait")
//   0.5 → standard
//
// Modèle géométrique commun à toutes les rules :
//   n  = (hoop - screener) normalisé  → "vers le panier"
//   perp = perpendiculaire à n (rotation 90°)
//   sideOfCarrier ∈ [-1, 1] = projection de (carrier - screener) sur perp
//     → continue, pas de flip de signe par Math.sign

import type {
  AttackerPositions,
  DefenderId,
  DetectedScreen,
  DropDepth,
  Matchups,
  Point,
  ScreenRule,
} from '../../types';
import { HOOP } from '../../data/court';
import { MIN_PLAYER_CLEARANCE_PX } from '../../data/physics';
import { distance, lerp as lerpPoint } from '../geometry';
import { pushOutOfCarrier, pushOutOfScreener, smoothstep } from './helpers';

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

  // Repère local de l'écran : axe vers le panier (n) + perpendiculaire (perp).
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

  // ----- OVER (D1 par-dessus l'écran) -----
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

  // ----- UNDER (D1 par-dessous l'écran) -----
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

  // ----- HEDGE (show & recover) -----
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

  // ----- DROP (D5 recule pour protéger l'arceau, D1 over léger) -----
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

  // ----- BLITZ (trap à deux sur le porteur) -----
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

  // ----- ICE / no-middle -----
  // Force le porteur vers la baseline. Le défenseur du porteur saute du
  // côté OPPOSÉ à where over l'aurait placé — il se met entre le porteur
  // et l'écran pour fermer le middle. Le défenseur du screener drop plus
  // profond pour protéger le drive baseline.
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

  // ----- WEAK (variante d'under, recover rapide) -----
  // Le défenseur du porteur passe sous mais reste au niveau de l'écran
  // (22px vs 36px) pour recover vite sur le shooter après screen. Le
  // défenseur du screener fait un drop léger (recover si pop).
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

  // ----- PEEL-SWITCH (drop puis switch quand le porteur dépasse D5) -----
  // Géométriquement traité comme `drop` ici. Le déclenchement du switch
  // effectif (quand le porteur dépasse screenerDef) est géré par engine.ts
  // qui appelle applySwitch en plus.
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
 * Applique un switch aux matchups : les deux défenseurs concernés échangent
 * leurs hommes. Appelé par le moteur quand `rule === 'switch'` ou quand
 * `peelSwitchShouldFire` retourne true.
 */
export function applySwitch(matchups: Matchups, screen: DetectedScreen): Matchups {
  const out = { ...matchups };
  const tmp = out[screen.carrierDef];
  out[screen.carrierDef] = out[screen.screenerDef];
  out[screen.screenerDef] = tmp;
  return out;
}
