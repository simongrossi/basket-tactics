// Helpers géométriques + types partagés par tous les générateurs FIBA.
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

export { HOOP }; // ré-export pour les sous-fichiers

export const clampX = (x: number) => Math.max(COURT.marginX, Math.min(COURT.innerMaxX, x));
export const clampY = (y: number) => Math.max(COURT.marginY, Math.min(COURT.innerMaxY, y));

/** Signe binaire du porteur par rapport à la ligne médiane (sans tolérance,
 *  pour les fallbacks qui ont besoin d'un -1/+1 strict). Utilise
 *  `sideSignFromCarrier` quand une zone explicite (fort/faible/axe) est
 *  donnée par l'utilisateur. */
export function carrierBaseSign(carrier: Point): -1 | 1 {
  return carrier.x < COURT_CENTERLINE_X ? -1 : 1;
}

export function clamp(p: Point): Point {
  return { x: clampX(p.x), y: clampY(p.y) };
}

export function lerp(a: Point, b: Point, t: number): Point {
  return clamp({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function towards(from: Point, to: Point, d: number): Point {
  const total = Math.max(1, dist(from, to));
  const t = Math.min(1, d / total);
  return lerp(from, to, t);
}

export function offset(p: Point, dx: number, dy: number): Point {
  return clamp({ x: p.x + dx, y: p.y + dy });
}

/** Résout une zone optionnelle vers un Point absolu, en référence au porteur.
 *  Renvoie null si `ref` n'est pas défini → le générateur garde son comportement
 *  par défaut (rétro-compatibilité avec les scénarios existants). */
export function resolveZonePoint(ref: ZoneRef | undefined, carrier: Point): Point | null {
  if (!ref) return null;
  return resolveZone(ref, ballSideFromCarrier(carrier));
}

/** "Côté fort" = côté où se trouve le porteur (signe de carrier.x - 300).
 *  "Côté faible" = opposé. "Axe" = x = 300.
 *  Quand le porteur est sur l'axe, on choisit conventionnellement +1 pour
 *  'fort' et -1 pour 'faible' afin que les deux options soient distinctes. */
export function sideSignFromCarrier(carrier: Point, side: 'fort' | 'faible' | 'axe' | undefined): -1 | 0 | 1 {
  if (side === 'axe') return 0;
  const carrierSign: -1 | 0 | 1 =
    carrier.x < COURT_CENTERLINE_X - 5 ? -1 : carrier.x > COURT_CENTERLINE_X + 5 ? 1 : 0;
  if (side === 'faible') {
    if (carrierSign === 0) return -1;
    return -carrierSign as -1 | 1;
  }
  return carrierSign === 0 ? 1 : carrierSign;
}

// Helpers de construction de Step
export function makeStepFrom(
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

export function move(off: AttackerPositions, id: AttackerId, p: Point): AttackerPositions {
  return { ...off, [id]: clamp(p) };
}

/** Construit une annotation entre `prev[id]` et `next[id]`. Pour les passes,
 *  la cible est la position du receveur DANS prev (pas next), conformément à
 *  la convention de rendu du ballon. */
export function annot(
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
