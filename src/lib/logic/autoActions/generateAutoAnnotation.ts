// Génération automatique d'annotations (passe / écran) à partir d'une simple
// sélection de joueurs source + cible, en complément du tracé manuel par drag.
//
// Fonction pure : retourne une `Annotation` prête à passer à `addAnnotation()`.
// Ne mute rien, ne dépend que de `AppState`. Aucun impact sur le pipeline
// d'écran (`screens/`, `defense/pnrLayer.ts`, `frameResolver.ts`) — l'annotation
// produite est consommée exactement comme une annotation dessinée à la souris.
//
// Pour l'écran : le placement du poseur est calculé relativement à l'angle
// d'épaule (corps) du bénéficiaire — règle métier "côté droite/gauche/devant/dos
// du joueur", pas en coordonnées cardinales (Règle 4 du projet).

import type { Annotation, AppState, AttackerId, Point } from '@/lib/types';
import { HOOP, HOOP_OPPOSITE, PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import { pushOutOfMany } from '../geometry';
import { activeBallCarrier, activeOffense, getActiveAttackerIds, getActiveDefenderIds } from '../players';
import { computeAttackerOrientation } from '../orientation';

export type ScreenSide = 'gauche' | 'droite' | 'devant' | 'dos';

export interface AutoActionOpts {
  /** Côté de l'écran, relatif au corps du bénéficiaire. Requis pour 'screen'. */
  side?: ScreenSide;
}

/** Distance épaule-à-épaule entre poseur et bénéficiaire pour l'anchor d'écran.
 *  Un peu plus que la clearance minimale pour éviter un push-out systématique. */
const SCREEN_SHOULDER_OFFSET_PX = PLAYER_MIN_CLEARANCE_PX + 4;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Vecteur unitaire "avant" d'un corps à angle θ (degrés, convention nord-horaire,
 *  SVG y croissant vers le bas). 0° = nord, 90° = est, 180° = sud. */
function forwardVector(thetaDeg: number): Point {
  const r = toRad(thetaDeg);
  return { x: Math.sin(r), y: -Math.cos(r) };
}

/** Perpendiculaire horaire de `forward` = vecteur "droite" du joueur. */
function rightVector(thetaDeg: number): Point {
  const r = toRad(thetaDeg);
  return { x: Math.cos(r), y: Math.sin(r) };
}

/** Calcule l'angle de corps du bénéficiaire au step actif, en réutilisant la
 *  logique métier existante (porteur statique → panier, porteur dribble →
 *  direction du mouvement, idle → ballon). Respecte les overrides manuels. */
function beneficiaryBodyAngle(state: AppState, toId: AttackerId): number {
  const step = state.steps[state.activeStep];
  const prev = state.activeStep > 0 ? state.steps[state.activeStep - 1] : undefined;
  const off = activeOffense(step.off, state.playerCount);
  const carrier = activeBallCarrier(step, state.playerCount);
  const hoop = state.attackingDirection === 'down' ? HOOP_OPPOSITE : HOOP;
  const ballPos = off[carrier] ?? off[toId];
  const role = toId === carrier ? 'carrier' : 'idle';
  const manualOverride = state.attackerOrientations?.[toId];

  const result = computeAttackerOrientation({
    attackerPos: off[toId],
    role,
    ballPos,
    hoop,
    prevPos: prev ? activeOffense(prev.off, state.playerCount)[toId] : undefined,
    manualBody: manualOverride?.body,
    manualGaze: manualOverride?.gaze,
  });
  return result.bodyOrientation;
}

/** Collecte les positions des autres joueurs actifs (≠ fromId) pour push-out. */
function otherActivePlayerPositions(state: AppState, excludeId: AttackerId): Point[] {
  const step = state.steps[state.activeStep];
  const offIds = getActiveAttackerIds(state.playerCount);
  const defIds = getActiveDefenderIds(state.playerCount);
  const off = activeOffense(step.off, state.playerCount);
  const obstacles: Point[] = [];
  offIds.forEach((id) => {
    if (id === excludeId) return;
    const p = off[id];
    if (p) obstacles.push(p);
  });
  defIds.forEach((id) => {
    const p = step.defenseOverrides?.[id] ?? state.defenseInitial[id];
    if (p) obstacles.push(p);
  });
  return obstacles;
}

/** Génère une annotation auto à partir d'une sélection de joueurs.
 *  Retourne null pour les cas dégénérés (fromId === toId, joueurs absents,
 *  side manquant pour un écran). */
export function generateAutoAnnotation(
  kind: 'pass' | 'screen',
  fromId: AttackerId,
  toId: AttackerId,
  opts: AutoActionOpts | undefined,
  state: AppState
): Annotation | null {
  if (fromId === toId) return null;

  const step = state.steps[state.activeStep];
  if (!step) return null;
  const off = activeOffense(step.off, state.playerCount);
  const fromPos = off[fromId];
  const toPos = off[toId];
  if (!fromPos || !toPos) return null;

  if (kind === 'pass') {
    return {
      type: 'pass',
      fromId,
      toId,
      from: { x: fromPos.x, y: fromPos.y },
      to: { x: toPos.x, y: toPos.y },
    };
  }

  // kind === 'screen'
  const side = opts?.side;
  if (!side) return null;

  const theta = beneficiaryBodyAngle(state, toId);
  const forward = forwardVector(theta);
  const right = rightVector(theta);

  let anchor: Point;
  switch (side) {
    case 'droite':
      anchor = { x: toPos.x + right.x * SCREEN_SHOULDER_OFFSET_PX, y: toPos.y + right.y * SCREEN_SHOULDER_OFFSET_PX };
      break;
    case 'gauche':
      anchor = { x: toPos.x - right.x * SCREEN_SHOULDER_OFFSET_PX, y: toPos.y - right.y * SCREEN_SHOULDER_OFFSET_PX };
      break;
    case 'devant':
      anchor = { x: toPos.x + forward.x * SCREEN_SHOULDER_OFFSET_PX, y: toPos.y + forward.y * SCREEN_SHOULDER_OFFSET_PX };
      break;
    case 'dos':
      anchor = { x: toPos.x - forward.x * SCREEN_SHOULDER_OFFSET_PX, y: toPos.y - forward.y * SCREEN_SHOULDER_OFFSET_PX };
      break;
  }

  // Règle 1 du projet : push-out obligatoire avant tout write de position joueur.
  // On exclut le bénéficiaire car l'anchor lui est délibérément collé.
  const obstacles = otherActivePlayerPositions(state, toId).filter(
    (p) => !(p.x === fromPos.x && p.y === fromPos.y)
  );
  const safeAnchor = pushOutOfMany(anchor, obstacles, PLAYER_MIN_CLEARANCE_PX);

  return {
    type: 'screen',
    fromId,
    toId,
    from: { x: fromPos.x, y: fromPos.y },
    to: { x: Math.round(safeAnchor.x), y: Math.round(safeAnchor.y) },
    phase: 'end',
  };
}
