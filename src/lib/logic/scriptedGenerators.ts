// Générateurs déterministes pour les 18 actions FIBA Tier 1.
// Chaque générateur prend le step précédent (positions de départ) et produit
// 1 à 3 nouveaux Step[] que le moteur d'animation existant joue tels quels.
//
// Géométrie : HOOP={x:300,y:75}, baseline y≈20, top of the key y≈300.
// "Vers le panier" = y décroît. x<300 = côté gauche, x>300 = côté droit.

import type {
  Annotation,
  AttackerId,
  AttackerPositions,
  Point,
  ScriptedAction,
  Step,
} from '@/lib/types';
import { HOOP, COURT } from '@/lib/data/court';

// ============================================================
// Helpers géométriques
// ============================================================

const clampX = (x: number) => Math.max(COURT.marginX, Math.min(COURT.innerMaxX, x));
const clampY = (y: number) => Math.max(COURT.marginY, Math.min(COURT.innerMaxY, y));

function clamp(p: Point): Point {
  return { x: clampX(p.x), y: clampY(p.y) };
}

function lerp(a: Point, b: Point, t: number): Point {
  return clamp({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function towards(from: Point, to: Point, d: number): Point {
  const total = Math.max(1, dist(from, to));
  const t = Math.min(1, d / total);
  return lerp(from, to, t);
}

function offset(p: Point, dx: number, dy: number): Point {
  return clamp({ x: p.x + dx, y: p.y + dy });
}

/** "Côté fort" = côté où se trouve le porteur (signe de carrier.x - 300).
 *  "Côté faible" = opposé. "Axe" = x = 300.
 *  Quand le porteur est sur l'axe, on choisit conventionnellement +1 pour
 *  'fort' et -1 pour 'faible' afin que les deux options soient distinctes. */
function sideSignFromCarrier(carrier: Point, side: 'fort' | 'faible' | 'axe' | undefined): -1 | 0 | 1 {
  if (side === 'axe') return 0;
  const carrierSign: -1 | 0 | 1 = carrier.x < 295 ? -1 : carrier.x > 305 ? 1 : 0;
  if (side === 'faible') {
    if (carrierSign === 0) return -1;
    return -carrierSign as -1 | 1;
  }
  // fort par défaut
  return carrierSign === 0 ? 1 : carrierSign;
}

// Helpers de construction de Step
function makeStepFrom(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  annotations: Annotation[],
  meta: { generatedBy: string; label?: string }
): Step {
  return {
    off: structuredClone(off),
    ballCarrier,
    annotations,
    generatedBy: meta.generatedBy,
    ...(meta.label ? { label: meta.label } : {}),
  };
}

function move(off: AttackerPositions, id: AttackerId, p: Point): AttackerPositions {
  return { ...off, [id]: clamp(p) };
}

// Une annotation entre prev[id] et next[id]
function annot(
  type: Annotation['type'],
  fromId: AttackerId,
  prev: AttackerPositions,
  next: AttackerPositions,
  toId?: AttackerId
): Annotation {
  return {
    type,
    fromId,
    toId: toId ?? null,
    from: { ...prev[fromId] },
    to: type === 'pass' && toId ? { ...prev[toId] } : { ...next[fromId] },
  };
}

// ============================================================
// Signature commune
// ============================================================

export type Generator = (
  prev: Step,
  action: ScriptedAction
) => Step[];

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
  const newPos = lerp(prev.off[cutter], HOOP, 0.65);
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
  // Backdoor : on contourne en passant côté baseline (y vers panier, x s'écarte légèrement
  // côté ligne de fond avant de plonger).
  const start = prev.off[cutter];
  const sign = start.x <= 300 ? -1 : 1;
  const target: Point = clamp({
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
  const screenPos = lerp(cutterPos, carrierPos, 0.4);
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pose flare' });

  // Step 2 : cutter s'éloigne du ballon (direction opposée carrierPos→cutterPos).
  const dx = cutterPos.x - carrierPos.x;
  const dy = cutterPos.y - carrierPos.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const flarePos = clamp({ x: cutterPos.x + (dx / len) * 90, y: cutterPos.y + (dy / len) * 90 });
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

  // Step 1 : screener à mi-chemin entre cutter et panier.
  const screenPos = lerp(prev.off[cutter], HOOP, 0.4);
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pose écran' });

  // Step 2 : cutter curl autour de l'écran et continue vers le panier (proche du cercle).
  const curlPos = towards(HOOP, prev.off[cutter], 40); // ~40px du cercle, dans la direction du cutter
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

  // Step 1 : screener au high post.
  const screenPos: Point = { x: 300, y: 230 };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Écran haut' });

  // Step 2 : cutter passe par le high post et plonge bas du poste.
  const cutPos: Point = lerp(screenPos, HOOP, 0.7);
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

  // Step 1 : screener descend juste au-dessus du cutter (entre cutter et panier).
  const cutterPos = prev.off[cutter];
  const screenPos: Point = { x: cutterPos.x, y: cutterPos.y - 35 };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pose pin-down' });

  // Step 2 : cutter remonte (s'éloigne du panier) à l'aile/3pts.
  // On garantit un déplacement minimum de 80px vers le haut (y croissant), même
  // si le cutter part déjà bas — l'écran déplace l'horizon défensif.
  const popUpPos: Point = { x: cutterPos.x, y: cutterPos.y + 80 };
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

  // Step 1 : screener se place "côté loin du panier" du cutter (dos du défenseur).
  const cutterPos = prev.off[cutter];
  const screenPos: Point = { x: cutterPos.x, y: cutterPos.y + 35 };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pose back-screen' });

  // Step 2 : cutter coupe vers le panier (lerp vers HOOP).
  const cutPos = lerp(cutterPos, HOOP, 0.65);
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
  // Screener traverse pour aller au milieu de la raquette, à hauteur du cutter.
  const screenPos: Point = { x: 300, y: cutterPos.y };
  const off1 = move(prev.off, screener, screenPos);
  const step1 = makeStepFrom(off1, prev.ballCarrier, [
    annot('screen', screener, prev.off, off1, cutter),
  ], { generatedBy: action.id, label: 'Pose cross-screen' });

  // Cutter traverse vers l'autre côté (mirror x autour de 300).
  const oppositeX = 600 - cutterPos.x;
  const cutPos: Point = { x: oppositeX, y: cutterPos.y };
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
  let target: Point;
  if (direction === 'baseline') {
    const sign = driverPos.x <= 300 ? -1 : 1;
    target = clamp({ x: 300 + sign * 130, y: HOOP.y + 30 });
  } else if (direction === 'middle') {
    target = clamp({ x: 300, y: HOOP.y + 50 });
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
// Registry
// ============================================================

export const SCRIPTED_GENERATORS: Record<string, Generator> = {
  'pick-and-roll': genPickAndRoll,
  'pick-and-pop': genPickAndPop,
  'hand-off': genHandOff,
  'give-and-go': genGiveAndGo,
  'basket-cut': genBasketCut,
  'backdoor-cut': genBackdoorCut,
  'flare-cut': genFlare,
  'curl-cut': genCurlCut,
  'shuffle-cut': genShuffleCut,
  'pin-down': genPinDown,
  'flare-screen': genFlareScreen,
  'back-screen': genBackScreen,
  'cross-screen': genCrossScreen,
  'screen-the-screener': genScreenTheScreener,
  drive: genDrive,
  pass: genPass,
  'kick-out': genKickOut,
  shoot: genShoot,
  isolation: genIsolation,
};
