// F.1 — Junk defenses (couvertures hybrides homme + zone).
//
// V1 box-and-1 livré 2026-05-18 : 4 zone + 1 chasseur.
// V2 livré 2026-05-18 : triangle-and-2 (3 zone + 2 chasseurs) et
//                       diamond-and-1 (4 zone losange + 1 chasseur).
//
// Logique commune :
//   - Identifie le(s) chaser(s) via leur matchup naturel (baseMatchups).
//   - Place les non-chasers sur les slots zone du type courant.
//   - Chaque chaser collé à 3/4 deny (gazeLock opponent), sans aide.
//   - Aucun helpFactor : pas d'aide en junk.
//
// Short-circuit du pipeline man comme la zone. Les overrides utilisateur
// (defenseOverrides) restent honorés en aval par effectiveDefensePositions.

import type {
  AppState,
  AttackerId,
  DefenderId,
  JunkType,
  Matchups,
  Point,
} from '../../types';
import { HOOP } from '../../data/court';
import { baseMatchups } from '../../data/initial';
import { activeBallCarrier, activeOffense, getActiveDefenderIds } from '../players';
import { getDefenseHoop } from '../engine';
import { computeDefenderOrientation } from '../orientation';
import type { DefenderTarget } from './types';
import { JUNK_CHASER_OFFSET_TO_HOOP_PX as CHASER_OFFSET_TO_HOOP_PX } from './constants';

/** F.1 V1 — Box formation : 4 défenseurs sur les corners de la raquette. */
const BOX_OFFSETS: { dx: number; dy: number }[] = [
  { dx: -80, dy: -60 }, // haut-gauche (côté tir)
  { dx: +80, dy: -60 }, // haut-droite
  { dx: -80, dy: +60 }, // bas-gauche
  { dx: +80, dy: +60 }, // bas-droite
];

/** F.1 V2 — Triangle formation : 3 défenseurs en triangle 1-2 (1 haut FT
 *  line, 2 bas blocks). Position haut "élevée" vers le tir pour fermer
 *  la pénétration centrale. */
const TRIANGLE_OFFSETS: { dx: number; dy: number }[] = [
  { dx: 0,   dy: -80 }, // pointe haute (FT line area)
  { dx: -70, dy: +55 }, // base gauche (block)
  { dx: +70, dy: +55 }, // base droite (block)
];

/** F.1 V2 — Diamond formation : 4 défenseurs en losange 1-2-1 (NCAA
 *  classique). 1 haut, 2 ailes, 1 bas. */
const DIAMOND_OFFSETS: { dx: number; dy: number }[] = [
  { dx: 0,    dy: -90 }, // pointe haute
  { dx: -85,  dy: 0   }, // aile gauche
  { dx: +85,  dy: 0   }, // aile droite
  { dx: 0,    dy: +65 }, // pointe basse (sous le cercle)
];

/** Retourne les offsets de slot selon le type de junk defense. */
function slotOffsetsFor(type: JunkType): { dx: number; dy: number }[] {
  switch (type) {
    case 'box-and-1': return BOX_OFFSETS;
    case 'triangle-and-2': return TRIANGLE_OFFSETS;
    case 'diamond-and-1': return DIAMOND_OFFSETS;
  }
}

/** Retourne le nombre de chasseurs attendus selon le type. Exporté pour
 *  l'UI (DefensePanel affiche 1 ou 2 pickers). */
export function chaserCountFor(type: JunkType): 1 | 2 {
  return type === 'triangle-and-2' ? 2 : 1;
}

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
  const junkType: JunkType = config?.type ?? 'box-and-1';
  const chaserAtts: AttackerId[] = [config?.chaser ?? 'O1'];
  if (junkType === 'triangle-and-2' && config?.chaser2 && config.chaser2 !== config.chaser) {
    chaserAtts.push(config.chaser2);
  }
  const chaserDefs: DefenderId[] = chaserAtts.map((att) => pickChaserDefender(att, defenderIds));

  // Le sens "vers le panier" dépend de attackingDirection :
  //   - up   (default) : panier en haut, y petit
  //   - down            : panier en bas, y grand
  // Les offsets dy<0 désignent "vers le tir" → on adapte le signe selon hoop.y.
  const dySign = hoop.y < 300 ? 1 : -1;

  const positions = {} as Record<DefenderId, DefenderTarget>;
  const matchupsApplied: Matchups = { ...baseMatchups };

  // Assigne les slots zone aux défenseurs non-chasers, dans l'ordre des
  // défenseurs actifs. L'assignement précis (qui prend quel slot) n'a pas
  // d'impact tactique : tous les défenseurs zone sont équivalents.
  const slotOffsets = slotOffsetsFor(junkType);
  const nonChasers = defenderIds.filter((d) => !chaserDefs.includes(d));
  nonChasers.forEach((dId, i) => {
    const slot = slotOffsets[i % slotOffsets.length];
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

  // Place les chasseurs (1 ou 2 selon le type) en marquage strict sur leur
  // homme. Position entre le panier et l'attaquant ciblé, légèrement reculée
  // pour 3/4 deny visuel. helpFactor = 0 → aucune aide.
  chaserDefs.forEach((chaserDef, idx) => {
    const chaserAtt = chaserAtts[idx];
    if (!chaserAtt) return;
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
      denying: !isCarrierTarget,
      orientation: 0,
      gazeOrientation: 0,
      facing: off[chaserAtt] ?? hoop,
      armBallSide: off[carrier] ?? hoop,
      armManSide: off[chaserAtt] ?? hoop,
      helpKind: 'none',
    };
    matchupsApplied[chaserDef] = chaserAtt;

    // Orientation : 3/4 deny (corps entre homme et ballon, regard sur
    // l'homme par gazeLock). Si le chaser EST le carrierDef, contest classique.
    const oriChaser = computeDefenderOrientation({
      defenderPos: { x: chaserPos.x, y: chaserPos.y },
      manPos: off[chaserAtt] ?? hoop,
      ballPos: off[carrier] ?? hoop,
      isCarrierDefender: isCarrierTarget,
      stance: isCarrierTarget ? undefined : 'deny-3q',
      gazeLock: isCarrierTarget ? undefined : 'opponent',
    });
    positions[chaserDef].orientation = oriChaser.bodyOrientation;
    positions[chaserDef].gazeOrientation = oriChaser.gazeOrientation;
    positions[chaserDef].facing = oriChaser.facing;
    positions[chaserDef].armBallSide = oriChaser.armBallSide;
    positions[chaserDef].armManSide = oriChaser.armManSide;
  });

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
