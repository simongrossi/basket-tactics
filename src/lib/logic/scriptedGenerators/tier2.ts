// Générateurs Tier 2 : variantes avancées (cuts spécialisés, off-ball screens,
// PnR variants, combinaisons, replacements). Cf. helpers.ts pour les utilitaires.

import type {
  Annotation,
  AttackerId,
  AttackerPositions,
  Point,
} from '@/lib/types';
import type { ZoneRef } from '@/lib/data/courtZones';
import { COURT_CENTERLINE_X } from '@/lib/data/court';
import {
  HOOP,
  type Generator,
  annot,
  carrierBaseSign,
  clamp,
  dist,
  lerp,
  makeStepFrom,
  move,
  offset,
  resolveZonePoint,
  sideSignFromCarrier,
  towards,
} from './helpers';
import { genBasketCut } from './tier1';

const HIGH_POST_LEFT: Point = { x: 225, y: 235 };

/** Helper : retourne la zone explicite si fournie, sinon le défaut donné. */
function zoneOrDefault(
  ref: ZoneRef | undefined, carrier: Point, fallback: Point,
): Point {
  return resolveZonePoint(ref, carrier) ?? fallback;
}

const genFlashCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  if (!cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  const target = zoneOrDefault(action.params.targetZone, carrier, { x: 300, y: 235 });
  const off1 = move(prev.off, cutter, target);
  return [makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'Flash cut' })];
};

const genFlexCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  const screener = action.params.screener as AttackerId;
  if (!cutter || !screener) return [];
  const carrier = prev.off[prev.ballCarrier];

  // Step 1 : cross-screen au low post.
  const screenPos = resolveZonePoint(action.params.screenZone, carrier) ?? { x: 300, y: 95 };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Cross-screen low' });

  // Step 2 : cutter coupe vers low-block fort.
  const target = zoneOrDefault(
    action.params.targetZone, carrier,
    { x: carrierBaseSign(carrier) === -1 ? 225 : 375, y: 95 },
  );
  const off2 = move(off1, cutter, target);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Flex panier' });
  return [step1, step2];
};

const genICut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  if (!cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  const start = prev.off[cutter];
  // Step 1 : plonge vers panier.
  const dive = lerp(start, HOOP, 0.7);
  const off1 = move(prev.off, cutter, dive);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'I-cut plonge' });
  // Step 2 : ressort vers la zone (ou point de départ).
  const out = zoneOrDefault(action.params.targetZone, carrier, start);
  const off2 = move(off1, cutter, out);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'I-cut ressort' });
  return [step1, step2];
};

const genPopoutCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  if (!cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  const target = zoneOrDefault(action.params.targetZone, carrier, { x: carrier.x, y: carrier.y + 20 });
  const off1 = move(prev.off, cutter, target);
  return [makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'Popout' })];
};

const genShallowCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  if (!cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  // Défaut : top → corner fort.
  const fallback: Point = carrierBaseSign(carrier) === -1 ? { x: 53, y: 80 } : { x: 547, y: 80 };
  const target = zoneOrDefault(action.params.targetZone, carrier, fallback);
  const off1 = move(prev.off, cutter, target);
  return [makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'Shallow cut' })];
};

const genUclaCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  const screener = action.params.screener as AttackerId;
  if (!cutter || !screener) return [];
  const carrier = prev.off[prev.ballCarrier];
  // Step 1 : screener au high post (ou zone explicite).
  const screenPos = resolveZonePoint(action.params.screenZone, carrier) ?? HIGH_POST_LEFT;
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Écran haut poste' });
  // Step 2 : cutter coupe vers low-block (ou zone cible).
  const target = zoneOrDefault(action.params.targetZone, carrier, { x: 225, y: 95 });
  const off2 = move(off1, cutter, target);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'UCLA panier' });
  return [step1, step2];
};

const genVCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  if (!cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  // Démarquage en V : aller-retour autour du point de départ.
  // Pour un seul step, on amène directement le cutter à sa cible (ou départ).
  const start = prev.off[cutter];
  const target = zoneOrDefault(action.params.targetZone, carrier, start);
  const off1 = move(prev.off, cutter, target);
  return [makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'V-cut' })];
};

const genLCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  if (!cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  const start = prev.off[cutter];
  const target = zoneOrDefault(action.params.targetZone, carrier, start);
  const off1 = move(prev.off, cutter, target);
  return [makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'L-cut' })];
};

const genBananaCut: Generator = (prev, action) => {
  // Banana = basket cut avec courbure (rendu animation), pour la position
  // finale on traite comme un basket cut.
  return genBasketCut(prev, action);
};

const genIversonCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  const a = action.params.firstScreener as AttackerId;
  const b = action.params.secondScreener as AttackerId;
  if (!cutter || !a || !b) return [];
  const carrier = prev.off[prev.ballCarrier];
  // Step 1 : screeners au coude G et coude D.
  const off1 = { ...prev.off, [a]: clamp({ x: 225, y: 235 }), [b]: clamp({ x: 375, y: 235 }) };
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', a, prev.off, off1, cutter),
    annot('screen', b, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Coudes' });
  // Step 2 : cutter traverse horizontalement.
  const start = prev.off[cutter];
  const target = zoneOrDefault(action.params.targetZone, carrier, { x: 600 - start.x, y: 235 });
  const off2 = move(off1, cutter, target);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Iverson cut' });
  return [step1, step2];
};

// ============================================================
// TIER 2 — Off-ball screens
// ============================================================

const genStaggeredScreen: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  const a = action.params.firstScreener as AttackerId;
  const b = action.params.secondScreener as AttackerId;
  if (!cutter || !a || !b) return [];
  const carrier = prev.off[prev.ballCarrier];
  const cutterPos = prev.off[cutter];

  // Step 1 : 1er écran proche du cutter.
  const screen1: Point = { x: cutterPos.x, y: cutterPos.y - 50 };
  const off1 = move(prev.off, a, screen1);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', a, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Stagger 1er écran' });

  // Step 2 : 2e écran plus haut, non adjacent.
  const screen2: Point = { x: cutterPos.x, y: cutterPos.y - 110 };
  const off2 = move(off1, b, screen2);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('screen', b, off1, off2, cutter),
  ], { generatedBy: action.id, label: 'Stagger 2e écran' });

  // Step 3 : cutter remonte vers la cible (ou nail par défaut).
  const target = zoneOrDefault(action.params.targetZone, carrier, { x: 300, y: 235 });
  const off3 = move(off2, cutter, target);
  const step3 = makeStepFrom(off3, prev.ballCarrier, [
    annot('cut', cutter, off2, off3),
  ], { generatedBy: action.id, label: 'Use stagger' });
  return [step1, step2, step3];
};

const genElevatorScreen: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  const a = action.params.firstScreener as AttackerId;
  const b = action.params.secondScreener as AttackerId;
  if (!cutter || !a || !b) return [];
  const carrier = prev.off[prev.ballCarrier];

  // Step 1 : écrans à 30px de chaque côté du cutter.
  const cutterPos = prev.off[cutter];
  const off1 = {
    ...prev.off,
    [a]: clamp({ x: cutterPos.x - 30, y: cutterPos.y - 30 }),
    [b]: clamp({ x: cutterPos.x + 30, y: cutterPos.y - 30 }),
  };
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', a, prev.off, off1, cutter),
    annot('screen', b, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pose ascenseur' });

  // Step 2 : cutter passe entre + remonte. Screeners se referment.
  const target = zoneOrDefault(action.params.targetZone, carrier, { x: cutterPos.x, y: cutterPos.y + 60 });
  const off2 = {
    ...off1,
    [cutter]: clamp(target),
    [a]: clamp({ x: cutterPos.x - 10, y: cutterPos.y - 30 }),
    [b]: clamp({ x: cutterPos.x + 10, y: cutterPos.y - 30 }),
  };
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Ferme + cutter sort' });
  return [step1, step2];
};

const genHammerScreen: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  if (!screener || !cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  // Hammer = écran côté faible pour libérer un tireur au corner faible.
  const cutterPos = prev.off[cutter];
  const screenPos = resolveZonePoint(action.params.screenZone, carrier)
    ?? { x: cutterPos.x, y: cutterPos.y - 30 };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Hammer pose' });

  const fallback: Point = carrierBaseSign(carrier) === -1 ? { x: 547, y: 80 } : { x: 53, y: 80 }; // corner faible
  const target = zoneOrDefault(action.params.targetZone, carrier, fallback);
  const off2 = move(off1, cutter, target);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Hammer corner' });
  return [step1, step2];
};

const genRamScreen: Generator = (prev, action) => {
  const a = action.params.firstScreener as AttackerId;
  const b = action.params.secondScreener as AttackerId;
  const ballHandler = action.params.ballHandler as AttackerId;
  if (!a || !b || !ballHandler) return [];
  // Step 1 : a (RAM) pose un écran sur b.
  const bPos = prev.off[b];
  const ramPos: Point = { x: bPos.x, y: bPos.y - 30 };
  const off1 = move(prev.off, a, ramPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', a, prev.off, off1, b),
  ], { generatedBy: action.id, label: 'RAM' });
  // Step 2 : b monte poser le PnR pour ballHandler.
  const carrierPos = prev.off[ballHandler];
  const screenPnRPos: Point = { x: carrierPos.x + 30, y: carrierPos.y - 25 };
  const off2 = move(off1, b, screenPnRPos);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('screen', b, off1, off2, ballHandler),
  ], { generatedBy: action.id, label: 'PnR ballon' });
  return [step1, step2];
};

const genWideScreen: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  if (!screener || !cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  const cutterPos = prev.off[cutter];
  // Wide screen = cross-screen haut, hors raquette.
  const screenPos = resolveZonePoint(action.params.screenZone, carrier) ?? { x: 300, y: 320 };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Wide pose' });
  const target = zoneOrDefault(action.params.targetZone, carrier, { x: 600 - cutterPos.x, y: cutterPos.y });
  const off2 = move(off1, cutter, target);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Wide cut' });
  return [step1, step2];
};

const genWiperScreen: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  if (!screener || !cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  const cutterPos = prev.off[cutter];
  // Step 1 : flare screen.
  const screen1: Point = { x: cutterPos.x + 25, y: cutterPos.y };
  const off1 = move(prev.off, screener, screen1);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Flare' });
  // Step 2 : cutter flare.
  const flarePos: Point = { x: cutterPos.x + 60, y: cutterPos.y };
  const off2 = move(off1, cutter, flarePos);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Cutter flare' });
  // Step 3 : pin-down (essuie-glace inverse) → cutter pop vers cible.
  const target = zoneOrDefault(action.params.targetZone, carrier, { x: cutterPos.x, y: cutterPos.y + 90 });
  const off3 = move(off2, cutter, target);
  const step3 = makeStepFrom(off3, prev.ballCarrier, [
    annot('cut', cutter, off2, off3),
  ], { generatedBy: action.id, label: 'Pin-down' });
  return [step1, step2, step3];
};

const genScreenAway: Generator = (prev, action) => {
  const passer = action.params.passer as AttackerId;
  const receiver = action.params.receiver as AttackerId;
  const screener = action.params.screener as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  if (!passer || !receiver || !screener || !cutter) return [];
  // Step 1 : passe.
  const off1 = { ...prev.off };
  const step1 = makeStepFrom(off1, receiver, [
    annot('pass', passer, prev.off, off1, receiver),
  ], { generatedBy: action.id, label: 'Passe' });
  // Step 2 : screener pose un écran pour cutter du côté opposé.
  const cutterPos = prev.off[cutter];
  const screenPos: Point = { x: cutterPos.x, y: cutterPos.y - 35 };
  const carrier = off1[receiver];
  const target = zoneOrDefault(action.params.targetZone, carrier, { x: cutterPos.x, y: cutterPos.y + 80 });
  const off2 = { ...off1, [screener]: clamp(screenPos), [cutter]: clamp(target) };
  const step2 = makeStepFrom(off2, receiver, [
    annot('screen', screener, off1, off2, cutter),
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Screen away' });
  return [step1, step2];
};

// ============================================================
// TIER 2 — PnR variants
// ============================================================

const genSlip: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const ballHandler = action.params.ballHandler as AttackerId;
  if (!screener || !ballHandler) return [];
  const side = (action.params.side ?? 'fort') as 'fort' | 'faible' | 'axe';
  const carrierPos = prev.off[ballHandler];
  const sign = sideSignFromCarrier(carrierPos, side);
  // Step 1 : screener feint de poser.
  const fakePos: Point = { x: carrierPos.x + sign * 25, y: carrierPos.y - 10 };
  const off1 = move(prev.off, screener, fakePos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', screener, prev.off, off1),
  ], { generatedBy: action.id, label: 'Feint écran' });
  // Step 2 : screener slip vers cible (panier ou zone).
  const target = zoneOrDefault(action.params.targetZone, carrierPos, lerp(fakePos, HOOP, 0.7));
  const off2 = move(off1, screener, target);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', screener, off1, off2),
  ], { generatedBy: action.id, label: 'Slip panier' });
  return [step1, step2];
};

const genReject: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const ballHandler = action.params.ballHandler as AttackerId;
  if (!screener || !ballHandler) return [];
  const side = (action.params.side ?? 'fort') as 'fort' | 'faible' | 'axe';
  const carrierPos = prev.off[ballHandler];
  const sign = sideSignFromCarrier(carrierPos, side);
  // Step 1 : screener pose côté demandé.
  const screenPos: Point = { x: carrierPos.x + sign * 30, y: carrierPos.y - 25 };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, ballHandler),
  ], { generatedBy: action.id, label: 'Pose écran' });
  // Step 2 : porteur reject (attaque côté opposé à l'écran).
  const target = zoneOrDefault(action.params.targetZone, carrierPos, {
    x: carrierPos.x - sign * 80, y: carrierPos.y - 80,
  });
  const off2 = move(off1, ballHandler, target);
  const step2 = makeStepFrom(off2, ballHandler, [
    annot('dribble', ballHandler, off1, off2),
  ], { generatedBy: action.id, label: 'Reject' });
  return [step1, step2];
};

const genDragScreen: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const ballHandler = action.params.ballHandler as AttackerId;
  if (!screener || !ballHandler) return [];
  // Drag = PnR en transition, vers axe central.
  const carrierPos = prev.off[ballHandler];
  const screenPos: Point = { x: 300, y: carrierPos.y - 30 };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, ballHandler),
  ], { generatedBy: action.id, label: 'Pose drag' });
  const handlerPos = lerp(carrierPos, HOOP, 0.45);
  const off2 = { ...off1, [ballHandler]: clamp(handlerPos), [screener]: lerp(screenPos, HOOP, 0.5) };
  const step2 = makeStepFrom(off2, ballHandler, [
    annot('dribble', ballHandler, off1, off2),
    annot('cut', screener, off1, off2),
  ], { generatedBy: action.id, label: 'Use drag' });
  return [step1, step2];
};

const genStepUpScreen: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const ballHandler = action.params.ballHandler as AttackerId;
  if (!screener || !ballHandler) return [];
  // Step-up = écran qui pousse le porteur vers la baseline.
  const carrierPos = prev.off[ballHandler];
  const sign = carrierBaseSign(carrierPos);
  const screenPos: Point = { x: carrierPos.x, y: carrierPos.y + 25 }; // dans le dos vs panier
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, ballHandler),
  ], { generatedBy: action.id, label: 'Step-up pose' });
  // Step 2 : porteur attaque baseline.
  const baselinePos: Point = clamp({ x: 300 + sign * 130, y: HOOP.y + 30 });
  const off2 = { ...off1, [ballHandler]: baselinePos };
  const step2 = makeStepFrom(off2, ballHandler, [
    annot('dribble', ballHandler, off1, off2),
  ], { generatedBy: action.id, label: 'Drive baseline' });
  // Step 3 : screener roll.
  const rollPos = lerp(screenPos, HOOP, 0.6);
  const off3 = { ...off2, [screener]: rollPos };
  const step3 = makeStepFrom(off3, ballHandler, [
    annot('cut', screener, off2, off3),
  ], { generatedBy: action.id, label: 'Step-up roll' });
  return [step1, step2, step3];
};

const genGhostScreen: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const ballHandler = action.params.ballHandler as AttackerId;
  if (!screener || !ballHandler) return [];
  const carrierPos = prev.off[ballHandler];
  // Step 1 : screener vient feindre.
  const fakePos: Point = { x: carrierPos.x + 20, y: carrierPos.y - 20 };
  const off1 = move(prev.off, screener, fakePos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', screener, prev.off, off1),
  ], { generatedBy: action.id, label: 'Ghost feinte' });
  // Step 2 : screener coupe sans contact (ghost).
  const target = zoneOrDefault(action.params.targetZone, carrierPos, lerp(fakePos, HOOP, 0.7));
  const off2 = move(off1, screener, target);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', screener, off1, off2),
  ], { generatedBy: action.id, label: 'Ghost cut' });
  return [step1, step2];
};

// ============================================================
// TIER 2 — Combinations
// ============================================================

const genZoomAction: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  const giver = action.params.giver as AttackerId;
  if (!screener || !cutter || !giver) return [];
  // Step 1 : pin-down (screener bas, cutter remonte).
  const cutterPos = prev.off[cutter];
  const pinDownPos: Point = { x: cutterPos.x, y: cutterPos.y - 35 };
  const off1 = move(prev.off, screener, pinDownPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pin-down' });
  const popUp: Point = { x: cutterPos.x, y: cutterPos.y + 60 };
  const off2 = move(off1, cutter, popUp);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Cutter remonte' });
  // Step 2 : DHO du giver vers cutter.
  const giverPos = prev.off[giver];
  const meet = lerp(giverPos, popUp, 0.7);
  const off3 = move(off2, giver, meet);
  const step3 = makeStepFrom(off3, cutter, [
    annot('pass', giver, off2, off3, cutter),
  ], { generatedBy: action.id, label: 'DHO' });
  return [step1, step2, step3];
};

const genRipDho: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  const giver = action.params.giver as AttackerId;
  if (!screener || !cutter || !giver) return [];
  // Step 1 : back-screen.
  const cutterPos = prev.off[cutter];
  const backPos: Point = { x: cutterPos.x, y: cutterPos.y + 35 };
  const off1 = move(prev.off, screener, backPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Back-screen' });
  // Step 2 : cutter coupe vers panier puis remonte.
  const cutPos = lerp(cutterPos, HOOP, 0.5);
  const off2 = move(off1, cutter, cutPos);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Cutter plonge' });
  // Step 3 : DHO du giver.
  const meet = lerp(prev.off[giver], cutPos, 0.6);
  const off3 = move(off2, giver, meet);
  const step3 = makeStepFrom(off3, cutter, [
    annot('pass', giver, off2, off3, cutter),
  ], { generatedBy: action.id, label: 'DHO' });
  return [step1, step2, step3];
};

const genSlideAction: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  const screener = action.params.screener as AttackerId;
  if (!cutter || !screener) return [];
  const carrier = prev.off[prev.ballCarrier];
  // Step 1 : cutter vers dunker faible (par défaut).
  const fallback: Point = carrierBaseSign(carrier) === -1 ? { x: 405, y: 90 } : { x: 195, y: 90 };
  const target = zoneOrDefault(action.params.targetZone, carrier, fallback);
  const off1 = move(prev.off, cutter, target);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'Slide cutter' });
  // Step 2 : screener roll.
  const off2 = move(off1, screener, lerp(prev.off[screener], HOOP, 0.6));
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', screener, off1, off2),
  ], { generatedBy: action.id, label: 'Roll' });
  return [step1, step2];
};

const genSplitAction: Generator = (prev, action) => {
  const passer = action.params.passer as AttackerId;
  const receiver = action.params.receiver as AttackerId;
  const screener = action.params.screener as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  if (!passer || !receiver || !screener || !cutter) return [];
  // Step 1 : passe au poste.
  const off1 = { ...prev.off };
  const step1 = makeStepFrom(off1, receiver, [
    annot('pass', passer, prev.off, off1, receiver),
  ], { generatedBy: action.id, label: 'Passe poste' });
  // Step 2 : split — screener pose, cutter coupe.
  const cutterPos = prev.off[cutter];
  const screenPos: Point = lerp(cutterPos, prev.off[receiver], 0.4);
  const cutPos = lerp(cutterPos, HOOP, 0.55);
  const off2 = { ...off1, [screener]: clamp(screenPos), [cutter]: clamp(cutPos) };
  const step2 = makeStepFrom(off2, receiver, [
    annot('screen', screener, off1, off2, cutter),
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Split' });
  return [step1, step2];
};

const genHighLowAction: Generator = (prev, action) => {
  const from = action.params.from as AttackerId;
  const to = action.params.to as AttackerId;
  if (!from || !to) return [];
  const off1 = { ...prev.off };
  return [makeStepFrom(off1, to, [
    annot('pass', from, prev.off, off1, to),
  ], { generatedBy: action.id, label: 'High-low' })];
};

// ============================================================
// TIER 2 — Replacements
// ============================================================

const genDrift: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  if (!cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  // Default : drift vers le corner du même côté que le cutter.
  const start = prev.off[cutter];
  const fallback: Point = carrierBaseSign(start) === -1 ? { x: 53, y: 80 } : { x: 547, y: 80 };
  const target = zoneOrDefault(action.params.targetZone, carrier, fallback);
  const off1 = move(prev.off, cutter, target);
  return [makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'Drift' })];
};

const genLift: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  if (!cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  const target = zoneOrDefault(action.params.targetZone, carrier, { x: 300, y: 330 });
  const off1 = move(prev.off, cutter, target);
  return [makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'Lift' })];
};

const genReplacement: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  if (!cutter) return [];
  const carrier = prev.off[prev.ballCarrier];
  // targetZone est requis pour cette action — fallback peu utile mais sûr.
  const target = zoneOrDefault(action.params.targetZone, carrier, prev.off[cutter]);
  const off1 = move(prev.off, cutter, target);
  return [makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'Replacement' })];
};

export {
  genFlashCut, genFlexCut, genICut, genPopoutCut, genShallowCut,
  genUclaCut, genVCut, genLCut, genBananaCut, genIversonCut,
  genStaggeredScreen, genElevatorScreen, genHammerScreen, genRamScreen,
  genWideScreen, genWiperScreen, genScreenAway,
  genSlip, genReject, genDragScreen, genStepUpScreen, genGhostScreen,
  genZoomAction, genRipDho, genSlideAction, genSplitAction, genHighLowAction,
  genDrift, genLift, genReplacement,
};
