// F.1 V1 — Junk defense (Box-and-1).
//
// Défense hybride : 4 défenseurs en zone autour de la raquette (formation
// "box") + 1 chasseur en marquage strict sur un shooter cible. Utilisée
// niveau lycée / NCAA / U18 contre une équipe à 1-2 stars marquées.
//
// V1 logique :
//   - Identifie le chaser (défenseur dont matchup naturel = junkConfig.chaser).
//   - 4 autres défenseurs sur 4 slots fixes autour du panier (corners de
//     la raquette : haut-gauche, haut-droite, bas-gauche, bas-droite).
//   - Chaser collé à 3/4 deny (`offBallStance: 'deny-3q'` virtuel), entre
//     le panier et son homme avec léger overlap vers le porteur.
//   - Aucun helpFactor sur le chaser : il ne quitte JAMAIS son homme.
//
// V1 short-circuit : appelée à la place de baseTargets, comme la couche
// zone. Les overrides de placement utilisateur (defenseOverrides) restent
// honorés en aval par effectiveDefensePositions.

import type {
  AppState,
  AttackerId,
  DefenderId,
  Matchups,
  Point,
} from '../../types';
import { HOOP } from '../../data/court';
import { baseMatchups } from '../../data/initial';
import { activeBallCarrier, activeOffense, getActiveDefenderIds } from '../players';
import { getDefenseHoop } from '../engine';
import { computeDefenderOrientation } from '../orientation';
import type { DefenderTarget } from './types';

/** Offsets des 4 slots zone par rapport au panier (en px). Calibré sur la
 *  raquette FIBA : 80 px ≈ moitié-largeur, 60 px ≈ profondeur depuis le cercle. */
const BOX_OFFSETS: { dx: number; dy: number }[] = [
  { dx: -80, dy: -60 }, // haut-gauche (côté tir)
  { dx: +80, dy: -60 }, // haut-droite
  { dx: -80, dy: +60 }, // bas-gauche
  { dx: +80, dy: +60 }, // bas-droite
];

/** Recul du chaser depuis son homme vers le panier (entre eux). */
const CHASER_OFFSET_TO_HOOP_PX = 18;

export function computeJunkDefenseTargets(
  state: AppState,
  stepIdx: number
): { positions: Record<DefenderId, DefenderTarget>; matchupsApplied: Matchups } {
  const cur = state.steps[stepIdx];
  const off = activeOffense(cur.off, state.playerCount);
  const carrier = activeBallCarrier(cur, state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);
  const hoop = getDefenseHoop(state);

  const config = state.junkConfig;
  // Fallback : si pas de config (cas dégénéré), retombe sur baseMatchups
  // statiques avec une box neutre — le composant UI devrait empêcher ce cas.
  const chaserAtt: AttackerId = config?.chaser ?? 'O1';
  const chaserDef = pickChaserDefender(chaserAtt, defenderIds);

  // Le sens "vers le panier" dépend de attackingDirection :
  //   - up   (default) : panier en haut, y petit
  //   - down            : panier en bas, y grand
  // BOX_OFFSETS dy<0 désigne "vers le tir" → on adapte le signe selon hoop.y.
  const dySign = hoop.y < 300 ? 1 : -1;

  const positions = {} as Record<DefenderId, DefenderTarget>;
  const matchupsApplied: Matchups = { ...baseMatchups };

  // Assigne les 4 slots box aux 4 défenseurs non-chasers, dans l'ordre
  // des défenseurs actifs. L'assignement précis (qui prend quel slot)
  // n'a pas d'impact tactique en V1 : tous les 4 sont équivalents en zone.
  const nonChasers = defenderIds.filter((d) => d !== chaserDef);
  nonChasers.forEach((dId, i) => {
    const slot = BOX_OFFSETS[i % BOX_OFFSETS.length];
    const x = hoop.x + slot.dx;
    const y = hoop.y + slot.dy * dySign;
    const matched: AttackerId = baseMatchups[dId];
    const ballPos: Point = off[carrier] ?? { x: hoop.x, y: hoop.y };
    const manPos: Point = off[matched] ?? ballPos;
    const ori = computeDefenderOrientation({
      defenderPos: { x, y },
      manPos,
      ballPos,
      isCarrierDefender: false,
      stance: 'sag',
    });
    positions[dId] = {
      x, y,
      helpFactor: 0,
      isCarrierDefender: false,
      matchedTo: matched,
      onScreen: false,
      switchedThisStep: false,
      orientation: ori.bodyOrientation,
      gazeOrientation: ori.gazeOrientation,
      facing: ori.facing,
      armBallSide: ori.armBallSide,
      armManSide: ori.armManSide,
      helpKind: 'none',
    };
  });

  // Place le chaser en marquage strict sur son homme. Position entre le
  // panier et l'attaquant ciblé, légèrement reculée pour 3/4 deny visuel.
  // helpFactor = 0 → ne participe à aucune aide.
  const chaserPos = chaserAttPos(off, chaserAtt, hoop);
  const isCarrierTarget = carrier === chaserAtt;
  positions[chaserDef] = {
    x: chaserPos.x,
    y: chaserPos.y,
    helpFactor: 0,
    isCarrierDefender: isCarrierTarget,
    matchedTo: chaserAtt,
    onScreen: false,
    switchedThisStep: false,
    denying: !isCarrierTarget, // 3/4 deny visuel quand le shooter n'a pas le ballon
    orientation: 0, // calculé en bas
    gazeOrientation: 0,
    facing: off[chaserAtt] ?? hoop,
    armBallSide: off[carrier] ?? hoop,
    armManSide: off[chaserAtt] ?? hoop,
    helpKind: 'none',
  };
  // Force le matchup chaser → chaserAtt (peut différer du natural si le
  // user choisit un autre attaquant que celui aligné statiquement).
  matchupsApplied[chaserDef] = chaserAtt;

  // Orientation du chaser : 3/4 deny (corps entre homme et ballon, regard
  // sur l'homme par gazeLock). Si le chaser EST le carrierDef, contest classique.
  const chaserManPos = off[chaserAtt] ?? hoop;
  const chaserBallPos = off[carrier] ?? hoop;
  const oriChaser = computeDefenderOrientation({
    defenderPos: { x: chaserPos.x, y: chaserPos.y },
    manPos: chaserManPos,
    ballPos: chaserBallPos,
    isCarrierDefender: isCarrierTarget,
    stance: isCarrierTarget ? undefined : 'deny-3q',
    gazeLock: isCarrierTarget ? undefined : 'opponent',
  });
  positions[chaserDef].orientation = oriChaser.bodyOrientation;
  positions[chaserDef].gazeOrientation = oriChaser.gazeOrientation;
  positions[chaserDef].facing = oriChaser.facing;
  positions[chaserDef].armBallSide = oriChaser.armBallSide;
  positions[chaserDef].armManSide = oriChaser.armManSide;

  return { positions, matchupsApplied };
}

/** Sélectionne le défenseur qui devient chaser : par convention, celui
 *  dont le matchup naturel pointe sur le chaserAtt (D1↔O1, etc.). */
function pickChaserDefender(chaserAtt: AttackerId, defenderIds: DefenderId[]): DefenderId {
  for (const dId of defenderIds) {
    if (baseMatchups[dId] === chaserAtt) return dId;
  }
  // Fallback : si aucune correspondance (cas dégénéré), prend le premier.
  return defenderIds[0] ?? 'D1';
}

/** Position cible du chaser : entre le panier et le shooter ciblé, légèrement
 *  reculée. Quand le shooter porte la balle, on colle directement (carrierDef
 *  classique) avec offset minimal pour respecter la clearance min. */
function chaserAttPos(off: Record<AttackerId, Point>, chaser: AttackerId, hoop: Point): Point {
  const att = off[chaser];
  if (!att) {
    // Fallback raisonnable : au panier
    return { x: hoop.x, y: hoop.y + (hoop.y < 300 ? 60 : -60) };
  }
  const dx = hoop.x - att.x;
  const dy = hoop.y - att.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.1) {
    return { x: att.x, y: att.y + 30 };
  }
  // Recule de CHASER_OFFSET_TO_HOOP_PX vers le panier depuis la position
  // de l'attaquant. Donne un visuel "topside / 3-4 deny".
  const t = CHASER_OFFSET_TO_HOOP_PX / dist;
  return {
    x: att.x + dx * t,
    y: att.y + dy * t,
  };
}

// Pour info : HOOP est exporté ici uniquement pour les tests/imports tiers,
// la valeur réelle vient de getDefenseHoop(state) (dépend de attackingDirection).
export { HOOP };
