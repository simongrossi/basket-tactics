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
  OffensiveScriptedAction,
  Point,
  Step,
} from '@/lib/types';
import { COURT, COURT_CENTERLINE_X, HOOP } from '@/lib/data/court';
import { resolveZone, ballSideFromCarrier, type ZoneRef } from '@/lib/data/courtZones';

// ============================================================
// Helpers géométriques
// ============================================================

const clampX = (x: number) => Math.max(COURT.marginX, Math.min(COURT.innerMaxX, x));
const clampY = (y: number) => Math.max(COURT.marginY, Math.min(COURT.innerMaxY, y));

/** Signe binaire du porteur par rapport à la ligne médiane (sans tolérance,
 *  pour les fallbacks qui ont besoin d'un -1/+1 strict). Utilise
 *  `sideSignFromCarrier` quand une zone explicite (fort/faible/axe) est
 *  donnée par l'utilisateur. */
function carrierBaseSign(carrier: Point): -1 | 1 {
  return carrier.x < COURT_CENTERLINE_X ? -1 : 1;
}

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

/** Résout une zone optionnelle vers un Point absolu, en référence au porteur.
 *  Renvoie null si `ref` n'est pas défini → le générateur garde son comportement
 *  par défaut (rétro-compatibilité avec les scénarios existants). */
function resolveZonePoint(ref: ZoneRef | undefined, carrier: Point): Point | null {
  if (!ref) return null;
  return resolveZone(ref, ballSideFromCarrier(carrier));
}

/** "Côté fort" = côté où se trouve le porteur (signe de carrier.x - 300).
 *  "Côté faible" = opposé. "Axe" = x = 300.
 *  Quand le porteur est sur l'axe, on choisit conventionnellement +1 pour
 *  'fort' et -1 pour 'faible' afin que les deux options soient distinctes. */
function sideSignFromCarrier(carrier: Point, side: 'fort' | 'faible' | 'axe' | undefined): -1 | 0 | 1 {
  if (side === 'axe') return 0;
  // Tolérance ±5 px pour considérer le porteur "dans l'axe" — plus stricte que
  // CARRIER_SIDE_TOLERANCE_PX (30) car ici on choisit fort/faible explicite.
  const carrierSign: -1 | 0 | 1 =
    carrier.x < COURT_CENTERLINE_X - 5 ? -1 : carrier.x > COURT_CENTERLINE_X + 5 ? 1 : 0;
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
  action: OffensiveScriptedAction
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
// TIER 2 — Cuts
// ============================================================

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

// ============================================================
// TIER 3 — Sets (entrées de jeu)
// ============================================================
//
// Un set produit 1 step "alignement" qui place les 5 attaquants dans la
// formation typique. Le coach empile ensuite les actions signature (Tier 1/2)
// par-dessus. Les positions sont déterministes (basées sur les zones FIBA/NBA
// du Phase 0) ; le coach peut ensuite les éditer via manualOverride.

function alignmentStep(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  actionId: string,
  label: string,
): Step {
  // Annotations de "cut" entre la position précédente et la nouvelle, pour
  // donner une trajectoire visible au moteur d'animation.
  // L'appelant fournit l'objet déjà mis à jour ; pas d'annotation ici, le
  // moteur de migration en ajoutera (`ensureAnnotationsForMovement`).
  return makeStepFrom(off, ballCarrier, [], { generatedBy: actionId, label });
}

const genHornsSet: Generator = (_prev, action) => {
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // meneur (PG spot)
    O2: clamp({ x: 120, y: 260 }), // aile gauche
    O3: clamp({ x: 480, y: 260 }), // aile droite
    O4: clamp({ x: 225, y: 235 }), // coude gauche
    O5: clamp({ x: 375, y: 235 }), // coude droit
  };
  return [alignmentStep(off1, 'O1', action.id, 'Horns 1-2-2')];
};

const genFloppySet: Generator = (_prev, action) => {
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 330 }), // meneur top
    O2: clamp({ x: 53, y: 80 }),   // tireur corner gauche
    O3: clamp({ x: 547, y: 80 }),  // tireur corner droit
    O4: clamp({ x: 225, y: 235 }), // grand coude gauche
    O5: clamp({ x: 375, y: 235 }), // grand coude droit
  };
  return [alignmentStep(off1, 'O1', action.id, 'Floppy')];
};

const genPistolSet: Generator = (_prev, action) => {
  // Pistol = entrée transition. Meneur + arrière côté fort, big traînant.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 470 }), // meneur (logo)
    O2: clamp({ x: 480, y: 380 }), // arrière côté droit (drag)
    O3: clamp({ x: 120, y: 380 }), // ailier côté gauche
    O4: clamp({ x: 547, y: 80 }),  // ailier 2 corner
    O5: clamp({ x: 300, y: 235 }), // pivot trail
  };
  return [alignmentStep(off1, 'O1', action.id, 'Pistol')];
};

const genUclaSet: Generator = (_prev, action) => {
  // 1-3-1 : meneur top, 3 ailiers/coude, pivot bas.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // meneur
    O2: clamp({ x: 120, y: 260 }), // aile G
    O3: clamp({ x: 480, y: 260 }), // aile D
    O4: clamp({ x: 300, y: 235 }), // haut poste (futur screener UCLA)
    O5: clamp({ x: 300, y: 95 }),  // pivot bas
  };
  return [alignmentStep(off1, 'O1', action.id, 'UCLA 1-3-1')];
};

const genIversonSet: Generator = (_prev, action) => {
  // Meneur top, 2 grands coudes, 2 ailiers en bas.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // meneur top
    O2: clamp({ x: 120, y: 260 }), // aile G basse
    O3: clamp({ x: 480, y: 260 }), // aile D basse
    O4: clamp({ x: 225, y: 235 }), // coude G
    O5: clamp({ x: 375, y: 235 }), // coude D
  };
  return [alignmentStep(off1, 'O1', action.id, 'Iverson')];
};

const genDiamondSet: Generator = (_prev, action) => {
  // Losange : 1 top, 2 mi-distance, 1 bas du poste, 1 axe.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // pointe haute
    O2: clamp({ x: 120, y: 260 }), // mi-G
    O3: clamp({ x: 480, y: 260 }), // mi-D
    O4: clamp({ x: 300, y: 165 }), // axe / mi-poste
    O5: clamp({ x: 300, y: 95 }),  // pointe basse
  };
  return [alignmentStep(off1, 'O1', action.id, 'Diamond')];
};

const genChicagoSet: Generator = (_prev, action) => {
  // Setup pour DHO + pin-down : meneur côté droit, big au coude droit.
  const off1: AttackerPositions = {
    O1: clamp({ x: 480, y: 260 }), // meneur aile D
    O2: clamp({ x: 120, y: 260 }), // ailier G
    O3: clamp({ x: 53, y: 80 }),   // tireur corner G
    O4: clamp({ x: 375, y: 235 }), // grand coude D (DHO)
    O5: clamp({ x: 225, y: 95 }),  // 5 low-block G (pin-down ensuite)
  };
  return [alignmentStep(off1, 'O1', action.id, 'Chicago setup')];
};

const genLoopSet: Generator = (_prev, action) => {
  // Cutter en bas, 2 screeners en stagger côté D.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // meneur top
    O2: clamp({ x: 547, y: 80 }),  // cutter corner D
    O3: clamp({ x: 120, y: 260 }), // aile G
    O4: clamp({ x: 375, y: 165 }), // 1er screener mi-poste D
    O5: clamp({ x: 375, y: 235 }), // 2e screener coude D
  };
  return [alignmentStep(off1, 'O1', action.id, 'Loop setup')];
};

const genAmericaSet: Generator = (_prev, action) => {
  // Triple écran : 3 grands alignés à gauche, 1 cutter qui les utilise.
  const off1: AttackerPositions = {
    O1: clamp({ x: 300, y: 420 }), // meneur top
    O2: clamp({ x: 547, y: 80 }),  // cutter coin D
    O3: clamp({ x: 225, y: 95 }),  // 1er écran low-block G
    O4: clamp({ x: 225, y: 165 }), // 2e écran mi-poste G
    O5: clamp({ x: 225, y: 235 }), // 3e écran coude G
  };
  return [alignmentStep(off1, 'O1', action.id, 'America (triple)')];
};

// ============================================================
// Registry
// ============================================================

export const SCRIPTED_GENERATORS: Record<string, Generator> = {
  // Tier 1
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
  // Tier 2 — Cuts
  'flash-cut': genFlashCut,
  'flex-cut': genFlexCut,
  'i-cut': genICut,
  'popout-cut': genPopoutCut,
  'shallow-cut': genShallowCut,
  'ucla-cut': genUclaCut,
  'v-cut': genVCut,
  'l-cut': genLCut,
  'banana-cut': genBananaCut,
  'iverson-cut': genIversonCut,
  // Tier 2 — Off-ball screens
  'staggered-screen': genStaggeredScreen,
  'elevator-screen': genElevatorScreen,
  'hammer-screen': genHammerScreen,
  'ram-screen': genRamScreen,
  'wide-screen': genWideScreen,
  'wiper-screen': genWiperScreen,
  'screen-away': genScreenAway,
  // Tier 2 — PnR variants
  slip: genSlip,
  reject: genReject,
  'drag-screen': genDragScreen,
  'step-up-screen': genStepUpScreen,
  'ghost-screen': genGhostScreen,
  // Tier 2 — Combinations
  'zoom-action': genZoomAction,
  'rip-dho': genRipDho,
  'slide-action': genSlideAction,
  'split-action': genSplitAction,
  'high-low-action': genHighLowAction,
  // Tier 2 — Replacements
  drift: genDrift,
  lift: genLift,
  replacement: genReplacement,
  // Tier 3 — Sets
  'horns-set': genHornsSet,
  'floppy-set': genFloppySet,
  'pistol-set': genPistolSet,
  'ucla-set': genUclaSet,
  'iverson-set': genIversonSet,
  'diamond-set': genDiamondSet,
  'chicago-set': genChicagoSet,
  'loop-set': genLoopSet,
  'america-set': genAmericaSet,
};
