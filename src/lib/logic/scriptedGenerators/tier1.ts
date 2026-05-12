// Générateurs Tier 1 : actions FIBA de base (PnR, cuts, écrans, drive, passe…).
// Cf. helpers.ts pour les utilitaires partagés.

import type {
  Annotation,
  AttackerId,
  Point,
} from '@/lib/types';
import { COURT_CENTERLINE_X } from '@/lib/data/court';
import {
  HOOP,
  type Generator,
  annot,
  clamp,
  dist,
  lerp,
  makeStepFrom,
  move,
  resolveZonePoint,
  sideSignFromCarrier,
  towards,
} from './helpers';

// ============================================================
// 1. Pick-and-roll
// ============================================================

const genPickAndRoll: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const ballHandler = action.params.ballHandler as AttackerId;
  const side = (action.params.side ?? 'fort') as 'fort' | 'faible' | 'axe';
  if (!screener || !ballHandler) return [];

  const carrierPos = prev.off[ballHandler];
  const sign = sideSignFromCarrier(carrierPos, side);

  // Step 1 : screener vient à côté du porteur, ~25px latéral, légèrement vers panier.
  const screenerSetPos: Point = {
    x: carrierPos.x + sign * 30,
    y: carrierPos.y - 25,
  };
  const off1 = move(prev.off, screener, screenerSetPos);
  const ann1: Annotation[] = [
    annot('screen', screener, prev.off, off1, ballHandler),
  ];
  const step1 = makeStepFrom(off1, prev.ballCarrier, ann1, {
    generatedBy: action.id,
    label: 'Pose écran',
  });

  // Step 2 : porteur dribble + use screen ; screener roll vers panier.
  const handlerUsePos: Point = lerp(carrierPos, HOOP, 0.45);
  // Légèrement décalé du côté de l'écran
  handlerUsePos.x += sign * 15;
  const screenerRollPos: Point = lerp(screenerSetPos, HOOP, 0.6);
  const off2 = {
    ...off1,
    [ballHandler]: clamp(handlerUsePos),
    [screener]: clamp(screenerRollPos),
  };
  const ann2: Annotation[] = [
    annot('dribble', ballHandler, off1, off2),
    annot('cut', screener, off1, off2),
  ];
  const step2 = makeStepFrom(off2, ballHandler, ann2, {
    generatedBy: action.id,
    label: 'Use screen + roll',
  });

  // Step 3 : finition — porteur près du cercle ou kick possible ; roller au cercle.
  const handlerFinishPos = towards(off2[ballHandler], HOOP, 80);
  const rollerFinishPos = towards(off2[screener], HOOP, 60);
  const off3 = {
    ...off2,
    [ballHandler]: handlerFinishPos,
    [screener]: rollerFinishPos,
  };
  const ann3: Annotation[] = [
    annot('dribble', ballHandler, off2, off3),
    annot('cut', screener, off2, off3),
  ];
  const step3 = makeStepFrom(off3, ballHandler, ann3, {
    generatedBy: action.id,
    label: 'Finition',
  });

  return [step1, step2, step3];
};

// ============================================================
// 2. Pick-and-pop
// ============================================================

const genPickAndPop: Generator = (prev, action) => {
  // Identique au PnR pour step 1, mais step 2 = screener pop (s'écarte 3pts).
  const screener = action.params.screener as AttackerId;
  const ballHandler = action.params.ballHandler as AttackerId;
  const side = (action.params.side ?? 'fort') as 'fort' | 'faible' | 'axe';
  if (!screener || !ballHandler) return [];

  const carrierPos = prev.off[ballHandler];
  const sign = sideSignFromCarrier(carrierPos, side);

  const screenerSetPos: Point = { x: carrierPos.x + sign * 30, y: carrierPos.y - 25 };
  const off1 = move(prev.off, screener, screenerSetPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, ballHandler),
  ], { generatedBy: action.id, label: 'Pose écran' });

  // Pop : screener s'écarte du panier, vers la ligne 3pts du côté de l'écran.
  const handlerUsePos = clamp({ x: lerp(carrierPos, HOOP, 0.45).x + sign * 15, y: lerp(carrierPos, HOOP, 0.45).y });
  const popPos: Point = clamp({ x: 300 + sign * 200, y: 280 });
  const off2 = { ...off1, [ballHandler]: handlerUsePos, [screener]: popPos };
  const step2 = makeStepFrom(off2, ballHandler, [
    annot('dribble', ballHandler, off1, off2),
    annot('cut', screener, off1, off2),
  ], { generatedBy: action.id, label: 'Use screen + pop' });

  // Step 3 : porteur peut driver ou kick ; on choisit kick pour faire tourner la balle.
  const handlerFinishPos = towards(off2[ballHandler], HOOP, 50);
  const off3 = { ...off2, [ballHandler]: handlerFinishPos };
  const step3 = makeStepFrom(off3, ballHandler, [
    annot('dribble', ballHandler, off2, off3),
  ], { generatedBy: action.id, label: 'Continuation' });

  return [step1, step2, step3];
};

// ============================================================
// 3. Hand-off (DHO)
// ============================================================

const genHandOff: Generator = (prev, action) => {
  const giver = action.params.giver as AttackerId;
  const receiver = action.params.receiver as AttackerId;
  if (!giver || !receiver) return [];

  // Step 1 : giver dribble vers receiver (3/4 du chemin).
  const giverPos = prev.off[giver];
  const receiverPos = prev.off[receiver];
  const meeting = lerp(giverPos, receiverPos, 0.7);
  const off1 = move(prev.off, giver, meeting);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('dribble', giver, prev.off, off1),
  ], { generatedBy: action.id, label: 'Dribble vers receveur' });

  // Step 2 : remise main-en-main (passe), receiver passe au giver, giver continue derrière.
  // Le receiver attaque légèrement vers le panier. Le giver reste comme écran/dos au receveur.
  const receiverAttackPos = towards(receiverPos, HOOP, 60);
  const off2 = { ...off1, [receiver]: receiverAttackPos };
  const step2 = makeStepFrom(off2, receiver, [
    annot('pass', giver, off1, off2, receiver),
    annot('cut', receiver, off1, off2),
  ], { generatedBy: action.id, label: 'Hand-off' });

  return [step1, step2];
};

// ============================================================
// 4. Give-and-go
// ============================================================

const genGiveAndGo: Generator = (prev, action) => {
  const passer = action.params.passer as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  if (!passer || !cutter) return [];

  // Step 1 : passe simple.
  const off1 = { ...prev.off };
  const step1 = makeStepFrom(off1, cutter, [
    annot('pass', passer, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Passe' });

  // Step 2 : passer coupe vers panier ; cutter (qui a la balle) lui redonne.
  const passerCutPos = towards(prev.off[passer], HOOP, 120);
  const off2 = { ...off1, [passer]: passerCutPos };
  const step2 = makeStepFrom(off2, passer, [
    annot('cut', passer, off1, off2),
    annot('pass', cutter, off1, off2, passer),
  ], { generatedBy: action.id, label: 'Coupe + retour' });

  return [step1, step2];
};

// ============================================================
// 5. Basket cut
// ============================================================

const genBasketCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  if (!cutter) return [];
  const carrierPos = prev.off[prev.ballCarrier];
  const zonePoint = resolveZonePoint(action.params.targetZone, carrierPos);
  // Zone explicite → on y va directement. Sinon, comportement historique :
  // 65% du chemin vers le panier (ne pas finir collé au cercle).
  const newPos = zonePoint ?? lerp(prev.off[cutter], HOOP, 0.65);
  const off1 = move(prev.off, cutter, newPos);
  return [makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'Coupe panier' })];
};

// ============================================================
// 6. Backdoor cut
// ============================================================

const genBackdoorCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  if (!cutter) return [];
  const carrierPos = prev.off[prev.ballCarrier];
  const zonePoint = resolveZonePoint(action.params.targetZone, carrierPos);
  // Backdoor : on contourne en passant côté baseline (y vers panier, x s'écarte légèrement
  // côté ligne de fond avant de plonger).
  const start = prev.off[cutter];
  const sign = start.x <= COURT_CENTERLINE_X ? -1 : 1;
  const target: Point = zonePoint ?? clamp({
    x: 300 + sign * 80,        // près de la ligne de fond côté baseline
    y: HOOP.y + 30,             // juste en bas du cercle
  });
  const off1 = move(prev.off, cutter, target);
  return [makeStepFrom(off1, prev.ballCarrier, [
    annot('cut', cutter, prev.off, off1),
  ], { generatedBy: action.id, label: 'Backdoor' })];
};

// ============================================================
// 7. Flare cut (= flare-screen + cutter qui s'éloigne du ballon)
// ============================================================

const genFlare: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  const screener = action.params.screener as AttackerId;
  if (!cutter || !screener) return [];

  // Step 1 : screener vient se placer entre cutter et ballCarrier (côté ballon du cutter).
  const cutterPos = prev.off[cutter];
  const carrierPos = prev.off[prev.ballCarrier];
  const screenZonePoint = resolveZonePoint(action.params.screenZone, carrierPos);
  const targetZonePoint = resolveZonePoint(action.params.targetZone, carrierPos);

  const screenPos = screenZonePoint ?? lerp(cutterPos, carrierPos, 0.4);
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pose flare' });

  // Step 2 : cutter s'éloigne du ballon (ou rejoint la zone cible).
  let flarePos: Point;
  if (targetZonePoint) {
    flarePos = targetZonePoint;
  } else {
    const dx = cutterPos.x - carrierPos.x;
    const dy = cutterPos.y - carrierPos.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    flarePos = clamp({ x: cutterPos.x + (dx / len) * 90, y: cutterPos.y + (dy / len) * 90 });
  }
  const off2 = move(off1, cutter, flarePos);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Flare cutter' });

  return [step1, step2];
};

// ============================================================
// 8. Curl cut
// ============================================================

const genCurlCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  const screener = action.params.screener as AttackerId;
  if (!cutter || !screener) return [];

  const carrierPos = prev.off[prev.ballCarrier];
  const screenZonePoint = resolveZonePoint(action.params.screenZone, carrierPos);
  const targetZonePoint = resolveZonePoint(action.params.targetZone, carrierPos);

  // Step 1 : screener à mi-chemin entre cutter et panier (ou zone explicite).
  const screenPos = screenZonePoint ?? lerp(prev.off[cutter], HOOP, 0.4);
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pose écran' });

  // Step 2 : cutter curl autour de l'écran et continue vers la cible.
  const curlPos = targetZonePoint ?? towards(HOOP, prev.off[cutter], 40);
  const off2 = move(off1, cutter, curlPos);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Curl panier' });

  return [step1, step2];
};

// ============================================================
// 9. Shuffle cut (écran haut → panier)
// ============================================================

const genShuffleCut: Generator = (prev, action) => {
  const cutter = action.params.cutter as AttackerId;
  const screener = action.params.screener as AttackerId;
  if (!cutter || !screener) return [];

  const carrierPos = prev.off[prev.ballCarrier];
  const screenZonePoint = resolveZonePoint(action.params.screenZone, carrierPos);
  const targetZonePoint = resolveZonePoint(action.params.targetZone, carrierPos);

  // Step 1 : screener au high post (ou zone explicite).
  const screenPos: Point = screenZonePoint ?? { x: 300, y: 230 };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Écran haut' });

  // Step 2 : cutter passe par l'écran et plonge bas du poste (ou zone cible).
  const cutPos: Point = targetZonePoint ?? lerp(screenPos, HOOP, 0.7);
  const off2 = move(off1, cutter, cutPos);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Shuffle panier' });

  return [step1, step2];
};

// ============================================================
// 10. Pin-down (down screen) — libère le cutter vers le haut/aile
// ============================================================

const genPinDown: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  if (!screener || !cutter) return [];

  const carrierPos = prev.off[prev.ballCarrier];
  const screenZonePoint = resolveZonePoint(action.params.screenZone, carrierPos);
  const targetZonePoint = resolveZonePoint(action.params.targetZone, carrierPos);

  // Step 1 : screener descend juste au-dessus du cutter (ou zone explicite).
  const cutterPos = prev.off[cutter];
  const screenPos: Point = screenZonePoint ?? { x: cutterPos.x, y: cutterPos.y - 35 };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pose pin-down' });

  // Step 2 : cutter remonte (ou rejoint la zone cible).
  const popUpPos: Point = targetZonePoint ?? { x: cutterPos.x, y: cutterPos.y + 80 };
  const off2 = move(off1, cutter, popUpPos);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Pop sur écran' });

  return [step1, step2];
};

// ============================================================
// 11. Flare screen (alias flare-cut, mais reader différent)
// ============================================================

const genFlareScreen: Generator = (prev, action) => genFlare(prev, action);

// ============================================================
// 12. Back screen — cutter coupe vers panier en passant l'écran
// ============================================================

const genBackScreen: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  if (!screener || !cutter) return [];

  const carrierPos = prev.off[prev.ballCarrier];
  const screenZonePoint = resolveZonePoint(action.params.screenZone, carrierPos);
  const targetZonePoint = resolveZonePoint(action.params.targetZone, carrierPos);

  // Step 1 : screener se place "côté loin du panier" du cutter (ou zone explicite).
  const cutterPos = prev.off[cutter];
  const screenPos: Point = screenZonePoint ?? { x: cutterPos.x, y: cutterPos.y + 35 };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pose back-screen' });

  // Step 2 : cutter coupe vers le panier (ou zone cible).
  const cutPos = targetZonePoint ?? lerp(cutterPos, HOOP, 0.65);
  const off2 = move(off1, cutter, cutPos);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Coupe panier' });

  return [step1, step2];
};

// ============================================================
// 13. Cross screen — low post à low post opposé
// ============================================================

const genCrossScreen: Generator = (prev, action) => {
  const screener = action.params.screener as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  if (!screener || !cutter) return [];

  const cutterPos = prev.off[cutter];
  const carrierPos = prev.off[prev.ballCarrier];
  const screenZonePoint = resolveZonePoint(action.params.screenZone, carrierPos);
  const targetZonePoint = resolveZonePoint(action.params.targetZone, carrierPos);

  // Screener traverse au milieu de la raquette à hauteur du cutter (ou zone explicite).
  const screenPos: Point = screenZonePoint ?? { x: 300, y: cutterPos.y };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pose cross-screen' });

  // Cutter traverse vers l'autre côté (mirror x autour de 300, ou zone cible).
  const oppositeX = 600 - cutterPos.x;
  const cutPos: Point = targetZonePoint ?? { x: oppositeX, y: cutterPos.y };
  const off2 = move(off1, cutter, cutPos);
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
  ], { generatedBy: action.id, label: 'Coupe cross' });

  return [step1, step2];
};

// ============================================================
// 14. Screen the screener (StS) — 3 steps
// ============================================================

const genScreenTheScreener: Generator = (prev, action) => {
  const firstScreener = action.params.firstScreener as AttackerId;
  const secondScreener = action.params.secondScreener as AttackerId;
  const cutter = action.params.cutter as AttackerId;
  if (!firstScreener || !secondScreener || !cutter) return [];

  // Step 1 : firstScreener pose un écran pour cutter.
  const cutterPos = prev.off[cutter];
  const firstScreenPos: Point = { x: cutterPos.x, y: cutterPos.y - 35 };
  const off1 = move(prev.off, firstScreener, firstScreenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', firstScreener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: '1er écran' });

  // Step 2 : cutter coupe (vers haut/aile) ; secondScreener vient près de firstScreener.
  const cutterPopPos: Point = { x: cutterPos.x, y: Math.min(380, cutterPos.y + 90) };
  const secondScreenPos: Point = { x: firstScreenPos.x, y: firstScreenPos.y - 35 };
  const off2 = {
    ...off1,
    [cutter]: clamp(cutterPopPos),
    [secondScreener]: clamp(secondScreenPos),
  };
  const step2 = makeStepFrom(off2, prev.ballCarrier, [
    annot('cut', cutter, off1, off2),
    annot('screen', secondScreener, off1, off2, firstScreener),
  ], { generatedBy: action.id, label: 'Coupe + 2e écran' });

  // Step 3 : firstScreener utilise le 2e écran pour se libérer (remonte vers le top).
  const firstFreePos: Point = { x: firstScreenPos.x, y: Math.min(380, firstScreenPos.y + 80) };
  const off3 = move(off2, firstScreener, firstFreePos);
  const step3 = makeStepFrom(off3, prev.ballCarrier, [
    annot('cut', firstScreener, off2, off3),
  ], { generatedBy: action.id, label: 'Libération StS' });

  return [step1, step2, step3];
};

// ============================================================
// 15. Drive
// ============================================================

const genDrive: Generator = (prev, action) => {
  const driver = action.params.driver as AttackerId;
  const direction = action.params.direction ?? 'panier';
  if (!driver) return [];
  const driverPos = prev.off[driver];
  // Si zone cible explicite, elle prime sur la direction (qui ne sert qu'au reader).
  const zonePoint = resolveZonePoint(action.params.targetZone, driverPos);
  let target: Point;
  if (zonePoint) {
    target = zonePoint;
  } else if (direction === 'baseline') {
    const sign = driverPos.x <= COURT_CENTERLINE_X ? -1 : 1;
    target = clamp({ x: COURT_CENTERLINE_X + sign * 130, y: HOOP.y + 30 });
  } else if (direction === 'middle') {
    target = clamp({ x: COURT_CENTERLINE_X, y: HOOP.y + 50 });
  } else {
    target = lerp(driverPos, HOOP, 0.6);
  }
  const off1 = move(prev.off, driver, target);
  return [makeStepFrom(off1, driver, [
    annot('dribble', driver, prev.off, off1),
  ], { generatedBy: action.id, label: 'Drive' })];
};

// ============================================================
// 16. Pass
// ============================================================

const genPass: Generator = (prev, action) => {
  const from = action.params.from as AttackerId;
  const to = action.params.to as AttackerId;
  if (!from || !to) return [];
  const off1 = { ...prev.off };
  return [makeStepFrom(off1, to, [
    annot('pass', from, prev.off, off1, to),
  ], { generatedBy: action.id, label: 'Passe' })];
};

// ============================================================
// 17. Kick-out
// ============================================================

const genKickOut: Generator = (prev, action) => {
  const from = action.params.from as AttackerId;
  const to = action.params.to as AttackerId;
  if (!from || !to) return [];
  const off1 = { ...prev.off };
  return [makeStepFrom(off1, to, [
    annot('pass', from, prev.off, off1, to),
  ], { generatedBy: action.id, label: 'Kick-out' })];
};

// ============================================================
// 18. Shoot — clôture (positions inchangées, label "Tir")
// ============================================================

const genShoot: Generator = (prev, action) => {
  const shooter = action.params.shooter as AttackerId;
  if (!shooter) return [];
  const off1 = { ...prev.off };
  // Petit pas vers le panier pour signaler la prise du tir.
  const shootPos = towards(prev.off[shooter], HOOP, 20);
  off1[shooter] = shootPos;
  return [makeStepFrom(off1, shooter, [
    annot('cut', shooter, prev.off, off1),
  ], { generatedBy: action.id, label: 'Tir' })];
};

// ============================================================
// 19. Isolation
// ============================================================

const genIsolation: Generator = (prev, action) => {
  const driver = action.params.driver as AttackerId;
  if (!driver) return [];

  // Les 4 autres se répartissent dans les 4 coins (corners + slots) loin du driver.
  const corners: Point[] = [
    { x: 70, y: 130 },   // corner gauche
    { x: 530, y: 130 },  // corner droit
    { x: 90, y: 360 },   // slot gauche haut
    { x: 510, y: 360 },  // slot droit haut
  ];
  const others = (Object.keys(prev.off) as AttackerId[]).filter((id) => id !== driver);
  // Assigne chaque "other" au corner libre le plus proche de sa position actuelle.
  const remaining = [...corners];
  const newOff = { ...prev.off };
  for (const id of others) {
    const cur = prev.off[id];
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist(cur, remaining[i]);
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    newOff[id] = clamp(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  // Driver attaque légèrement.
  newOff[driver] = towards(prev.off[driver], HOOP, 40);

  const annotations: Annotation[] = [
    annot('dribble', driver, prev.off, newOff),
    ...others.map((id) => annot('cut', id, prev.off, newOff)),
  ];
  return [makeStepFrom(newOff, driver, annotations, {
    generatedBy: action.id, label: 'Isolation',
  })];
};

// ============================================================
// Exports nommés des générateurs Tier 1.
export {
  genPickAndRoll, genPickAndPop, genHandOff, genGiveAndGo, genBasketCut,
  genBackdoorCut, genFlare, genCurlCut, genShuffleCut, genPinDown,
  genFlareScreen, genBackScreen, genCrossScreen, genScreenTheScreener,
  genDrive, genPass, genKickOut, genShoot, genIsolation,
};
