// Détection des écrans HORS-BALLON (pindown, backscreen, flare, stagger,
// elevator, flex, hammer).
//
// Deux étapes :
//
//  1. `detectOffBallScreens` parcourt toutes les paires (cutter, screener)
//     non-porteurs et émet un écran simple (pindown / backscreen / flare).
//
//  2. `upgradeOffBallScreens` fusionne les enchaînements :
//     - 2 pindowns sur le même cutter avec screeners proches → elevator
//     - 2 pindowns sur le même cutter avec screeners alignés → stagger
//     - backscreen baseline côté faible → hammer
//     - backscreen baseline côté fort → flex

import type {
  AttackerId,
  AttackerPositions,
  DefenderId,
  DetectedOffBallScreen,
  Matchups,
  OffBallScreenType,
  Point,
} from '../../types';
import { HOOP } from '../../data/court';
import { OFFBALL_SCREEN_HYSTERESIS_PX } from '../../data/physics';
import { distance } from '../geometry';
import { hasScreenIntent } from './helpers';

/** Clé canonique d'une paire (cutter, screener) pour l'hystérésis. */
export function offBallScreenPairKey(cutter: AttackerId, screener: AttackerId): string {
  return `${cutter}:${screener}`;
}

/** Extrait l'ensemble des paires (cutter, screener) actives d'une liste
 *  d'écrans détectés — à fournir comme `prevScreenPairs` au step suivant
 *  pour activer l'hystérésis de maintien. Inclut le second screener des
 *  enchaînements stagger/elevator. */
export function offBallScreenPairKeys(
  screens: ReadonlyArray<DetectedOffBallScreen>,
): Set<string> {
  const keys = new Set<string>();
  for (const s of screens) {
    keys.add(offBallScreenPairKey(s.cutter, s.screener));
    if (s.secondScreener) {
      keys.add(offBallScreenPairKey(s.cutter, s.secondScreener));
    }
  }
  return keys;
}

export function detectOffBallScreens(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  matchups: Matchups,
  defenderPositions: Record<DefenderId, Point>,
  screenRadius: number,
  /** Positions à l'étape précédente — active le filtre d'intention. */
  prevOff?: AttackerPositions,
  /** Paires (cutter:screener) détectées au step précédent. Si une paire
   *  y figure, son rayon de détection est élargi de
   *  `OFFBALL_SCREEN_HYSTERESIS_PX` (hystérésis anti-clignotement). */
  prevScreenPairs?: ReadonlySet<string>
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

      // Hystérésis : si cette paire était détectée au step précédent,
      // on élargit le rayon de maintien pour éviter le clignotement
      // quand le défenseur du cutter navigue autour de l'écran.
      const wasActive = prevScreenPairs?.has(offBallScreenPairKey(cutter, screener)) ?? false;
      const effectiveRadius = wasActive
        ? screenRadius + OFFBALL_SCREEN_HYSTERESIS_PX
        : screenRadius;
      if (distance(screenerPos, cutterDefPos) > effectiveRadius) continue;
      if (distance(screenerPos, cutterPos) > 80) continue;
      if (!hasScreenIntent(screener, screenerPos, cutterDefPos, prevOff)) continue;

      let screenerDef: DefenderId | null = null;
      (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, o]) => {
        if (o === screener) screenerDef = d;
      });
      if (!screenerDef) continue;

      // Classification par position relative cutter ↔ screener et au ballon :
      //  - screener au-dessus du cutter (dy > 20)  → pindown
      //  - screener en-dessous            (dy < -20) → backscreen
      //  - même hauteur, plus proche du ballon       → flare
      //  - même hauteur, plus loin du ballon         → fallback pindown
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

  // P4 — Reconnaissance d'enchaînements : stagger, elevator, hammer, flex.
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
