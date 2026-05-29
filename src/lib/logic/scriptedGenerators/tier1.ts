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
  screenAndCut,
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

  // Step 1b : "Tenue écran" — le screener TIENT la position pendant que le
  // porteur s'engage. Évite le flicker step→step (cf. Phase K K.4) : sans ce
  // step, le screener arrive en pose et fait demi-tour à 180° en 1 step pour
  // démarrer le roll, ce qui produit un saut visuel + flicker critical sur
  // la trajectoire. Avec dwell, la vélocité du screener décroît à 0 avant le
  // demi-tour.
  const handlerEngagePos: Point = clamp(towards(carrierPos, screenerSetPos, 25));
  const off1b = { ...off1, [ballHandler]: handlerEngagePos };
  const ann1b: Annotation[] = [
    annot('dribble', ballHandler, off1, off1b),
  ];
  const step1b = makeStepFrom(off1b, ballHandler, ann1b, {
    generatedBy: action.id,
    label: 'Tenue écran',
  });

  // Step 2 : porteur dribble + use screen ; screener roll vers panier.
  const handlerUsePos: Point = lerp(carrierPos, HOOP, 0.45);
  // Légèrement décalé du côté de l'écran
  handlerUsePos.x += sign * 15;
  const screenerRollPos: Point = lerp(screenerSetPos, HOOP, 0.6);
  const off2 = {
    ...off1b,
    [ballHandler]: clamp(handlerUsePos),
    [screener]: clamp(screenerRollPos),
  };
  const ann2: Annotation[] = [
    annot('dribble', ballHandler, off1b, off2),
    annot('cut', screener, off1b, off2),
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

  return [step1, step1b, step2, step3];
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

const genFlare: Generator = (prev, action) =>
  screenAndCut(prev, action, {
    screener: action.params.screener as AttackerId,
    cutter: action.params.cutter as AttackerId,
    screenLabel: 'Pose flare',
    cutLabel: 'Flare cutter',
    // Screener entre cutter et porteur (côté ballon du cutter).
    screenDefault: ({ cutterPos, carrierPos }) => lerp(cutterPos, carrierPos, 0.4),
    // Cutter s'éloigne du ballon de 90 px.
    cutDefault: ({ cutterPos, carrierPos }) => {
      const dx = cutterPos.x - carrierPos.x;
      const dy = cutterPos.y - carrierPos.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      return clamp({ x: cutterPos.x + (dx / len) * 90, y: cutterPos.y + (dy / len) * 90 });
    },
  });

// ============================================================
// 8. Curl cut
// ============================================================

const genCurlCut: Generator = (prev, action) =>
  screenAndCut(prev, action, {
    screener: action.params.screener as AttackerId,
    cutter: action.params.cutter as AttackerId,
    screenLabel: 'Pose écran',
    cutLabel: 'Curl panier',
    // Screener à mi-chemin entre cutter et panier.
    screenDefault: ({ cutterPos }) => lerp(cutterPos, HOOP, 0.4),
    // Cutter curl autour de l'écran vers le panier.
    cutDefault: ({ cutterPos }) => towards(HOOP, cutterPos, 40),
  });

// ============================================================
// 9. Shuffle cut (écran haut → panier)
// ============================================================

const genShuffleCut: Generator = (prev, action) =>
  screenAndCut(prev, action, {
    screener: action.params.screener as AttackerId,
    cutter: action.params.cutter as AttackerId,
    screenLabel: 'Écran haut',
    cutLabel: 'Shuffle panier',
    // Screener au high post.
    screenDefault: () => ({ x: 300, y: 230 }),
    // Cutter passe l'écran et plonge bas du poste.
    cutDefault: ({ screenPos }) => lerp(screenPos, HOOP, 0.7),
  });

// ============================================================
// 10. Pin-down (down screen) — libère le cutter vers le haut/aile
// ============================================================

const genPinDown: Generator = (prev, action) =>
  screenAndCut(prev, action, {
    screener: action.params.screener as AttackerId,
    cutter: action.params.cutter as AttackerId,
    screenLabel: 'Pose pin-down',
    cutLabel: 'Pop sur écran',
    // Screener descend juste au-dessus du cutter.
    screenDefault: ({ cutterPos }) => ({ x: cutterPos.x, y: cutterPos.y - 35 }),
    // Cutter remonte (pop).
    cutDefault: ({ cutterPos }) => ({ x: cutterPos.x, y: cutterPos.y + 80 }),
  });

// ============================================================
// 11. Flare screen (alias flare-cut, mais reader différent)
// ============================================================

const genFlareScreen: Generator = (prev, action) => genFlare(prev, action);

// ============================================================
// 12. Back screen — cutter coupe vers panier en passant l'écran
// ============================================================

const genBackScreen: Generator = (prev, action) =>
  screenAndCut(prev, action, {
    screener: action.params.screener as AttackerId,
    cutter: action.params.cutter as AttackerId,
    screenLabel: 'Pose back-screen',
    cutLabel: 'Coupe panier',
    // Screener côté "loin du panier" du cutter.
    screenDefault: ({ cutterPos }) => ({ x: cutterPos.x, y: cutterPos.y + 35 }),
    // Cutter coupe vers le panier.
    cutDefault: ({ cutterPos }) => lerp(cutterPos, HOOP, 0.65),
  });

// ============================================================
// 13. Cross screen — low post à low post opposé
// ============================================================

const genCrossScreen: Generator = (prev, action) =>
  screenAndCut(prev, action, {
    screener: action.params.screener as AttackerId,
    cutter: action.params.cutter as AttackerId,
    screenLabel: 'Pose cross-screen',
    cutLabel: 'Coupe cross',
    // Screener au milieu de la raquette, à hauteur du cutter.
    screenDefault: ({ cutterPos }) => ({ x: 300, y: cutterPos.y }),
    // Cutter traverse côté opposé (mirror x autour de 300).
    cutDefault: ({ cutterPos }) => ({ x: 600 - cutterPos.x, y: cutterPos.y }),
  });

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
