// Résolution de l'aide défensive et du deny (read-based offense, Phase L.3).
//
// Lecture seule du pipeline défensif : on appelle `computeDefenseTargets` au
// step de lecture et on interprète les flags déjà calculés par le moteur
// (`helpTriggered`, `denying`, `matchedTo`). Aucune position n'est mutée.

import type { AppState, AttackerId, HelpSource, Point } from '../../types';
import { computeDefenseTargets, getDefenseHoop } from '../engine';
import { activeOffense, activeBallCarrier } from '../players';
import { distance } from '../geometry';

/** Rayon (px) autour du panier en deçà duquel un aidant est considéré low-man. */
const LOW_HELP_RADIUS_PX = 130;

/**
 * Classe l'origine de l'aide d'après la position de l'homme libéré, relativement
 * au ballon et au panier. Pur et déterministe (testable sans le moteur) :
 *  - homme près du panier        → `low`
 *  - même côté que le ballon      → `strong`
 *  - côté opposé (ou axe ambigu ?) → `weak`
 */
export function classifyHelpOrigin(
  carrierPos: Point,
  freedManPos: Point,
  hoop: Point
): HelpSource {
  if (distance(freedManPos, hoop) < LOW_HELP_RADIUS_PX) return 'low';
  const carrierSide = Math.sign(carrierPos.x - hoop.x);
  const freedSide = Math.sign(freedManPos.x - hoop.x);
  // Axe (côté 0) traité comme "fort" : kick le plus court, pas de skip inutile.
  if (freedSide === 0 || freedSide === carrierSide) return 'strong';
  return 'weak';
}

/**
 * Origine de l'aide sur un drive, lue au step `atStepIdx`.
 *
 * On retient l'aidant le PLUS engagé (helpFactor max parmi les défenseurs
 * `helpTriggered`, hors défenseur du porteur), puis on classe la position de
 * SON homme (celui qu'il a quitté = l'attaquant libéré) :
 *  - près du panier         → `low`
 *  - même côté que le ballon → `strong`
 *  - côté opposé            → `weak`
 *
 * @returns la `HelpSource`, ou `null` si défense non-man, index invalide, ou
 *   aucune aide déclenchée à ce step.
 */
export function resolveHelpSource(
  state: AppState,
  atStepIdx: number
): HelpSource | null {
  if (atStepIdx < 0 || atStepIdx >= state.steps.length) return null;
  if (state.defenseSystem !== 'man') return null;

  const { positions } = computeDefenseTargets(state, atStepIdx);
  const step = state.steps[atStepIdx];
  const off = activeOffense(step.off, state.playerCount);
  const carrier = activeBallCarrier(step, state.playerCount);
  const carrierPos = off[carrier];
  if (!carrierPos) return null;
  const hoop = getDefenseHoop(state);

  // Aidant le plus engagé (hors défenseur du porteur).
  let bestHelper: { matchedTo: AttackerId; factor: number } | null = null;
  for (const d of Object.values(positions)) {
    if (!d.helpTriggered || d.isCarrierDefender) continue;
    const factor = d.helpFactor ?? 0;
    if (!bestHelper || factor > bestHelper.factor) {
      bestHelper = { matchedTo: d.matchedTo, factor };
    }
  }
  if (!bestHelper) return null;

  const freedManPos = off[bestHelper.matchedTo];
  if (!freedManPos) return null;

  return classifyHelpOrigin(carrierPos, freedManPos, hoop);
}

/**
 * Le défenseur du `receiver` refuse-t-il la ligne de passe (denying) au step
 * `atStepIdx` ? Sert à déclencher une lecture backdoor.
 *
 * @returns `true` si deny détecté, `false` sinon (et si défense non-man /
 *   index invalide / receveur non marqué).
 */
export function resolveDeny(
  state: AppState,
  atStepIdx: number,
  receiver: AttackerId
): boolean {
  if (atStepIdx < 0 || atStepIdx >= state.steps.length) return false;
  if (state.defenseSystem !== 'man') return false;

  const { positions } = computeDefenseTargets(state, atStepIdx);
  for (const d of Object.values(positions)) {
    if (d.matchedTo === receiver) return !!d.denying;
  }
  return false;
}
