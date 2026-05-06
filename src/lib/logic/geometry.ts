import type { Point } from '../types';
import { HOOP, PAINT } from '../data/court';

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distHoop(p: Point, hoop: Point = HOOP): number {
  return distance(p, hoop);
}

export function inPaint(p: Point, hoop: Point = HOOP): boolean {
  // PAINT est défini autour de HOOP top. Pour HOOP_OPPOSITE (bas), on
  // miroite la position autour de la ligne médiane (y=540) avant le test.
  if (hoop.y > 540) {
    const mirrored = { x: p.x, y: 2 * 540 - p.y };
    return mirrored.x >= PAINT.x1 && mirrored.x <= PAINT.x2 && mirrored.y >= PAINT.y1 && mirrored.y <= PAINT.y2;
  }
  return p.x >= PAINT.x1 && p.x <= PAINT.x2 && p.y >= PAINT.y1 && p.y <= PAINT.y2;
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function normalize(p: Point): Point {
  const len = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / len, y: p.y / len };
}

export function ballSide(carrierPos: Point | undefined): -1 | 0 | 1 {
  if (!carrierPos) return 0;
  const dx = carrierPos.x - HOOP.x;
  if (Math.abs(dx) < 30) return 0;
  return dx > 0 ? 1 : -1;
}

/**
 * Si `pos` est trop proche d'un `obstacle`, le pousse radialement
 * jusqu'à `minDist` du centre. Sinon retourne pos inchangé.
 */
export function pushOutOf(pos: Point, obstacle: Point, minDist: number): Point {
  const dx = pos.x - obstacle.x;
  const dy = pos.y - obstacle.y;
  const d = Math.hypot(dx, dy);
  if (d >= minDist) return pos;
  if (d < 0.01) {
    // Position confondue : on pousse arbitrairement vers la droite.
    return { x: obstacle.x + minDist, y: obstacle.y };
  }
  const k = minDist / d;
  return {
    x: obstacle.x + dx * k,
    y: obstacle.y + dy * k,
  };
}

/**
 * Pousse `pos` hors d'une liste d'obstacles. Plusieurs passes pour gérer les
 * cas en chaîne.
 */
export function pushOutOfMany(pos: Point, obstacles: Point[], minDist: number): Point {
  let result = pos;
  for (let iter = 0; iter < 5; iter++) {
    let moved = false;
    for (const obs of obstacles) {
      const next = pushOutOf(result, obs, minDist);
      if (next.x !== result.x || next.y !== result.y) {
        result = next;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return result;
}

/**
 * Solveur de collisions itératif sur une carte de défenseurs.
 * Pour chaque défenseur, on le pousse hors :
 *  - de tous les attaquants SAUF son matchedTo
 *  - de tous les autres défenseurs
 * On répète jusqu'à stabilité (ou maxIter).
 *
 * Mute defPos en place. minDist = écart minimal entre centres
 * (typiquement 2 * PLAYER_RADIUS + buffer).
 */
export function resolvePlayerCollisions<
  D extends { x: number; y: number; matchedTo: string }
>(
  defPos: Record<string, D>,
  off: Record<string, Point>,
  minDist: number,
  maxIter: number = 8
): void {
  const epsilon = 0.5;
  for (let iter = 0; iter < maxIter; iter++) {
    let anyMoved = false;
    for (const dId in defPos) {
      const p = defPos[dId];
      const matched = p.matchedTo;
      const obstacles: Point[] = [];
      for (const aId in off) {
        if (aId !== matched) obstacles.push(off[aId]);
      }
      for (const otherId in defPos) {
        if (otherId !== dId) obstacles.push({ x: defPos[otherId].x, y: defPos[otherId].y });
      }
      const pushed = pushOutOfMany({ x: p.x, y: p.y }, obstacles, minDist);
      if (Math.abs(pushed.x - p.x) > epsilon || Math.abs(pushed.y - p.y) > epsilon) {
        p.x = pushed.x;
        p.y = pushed.y;
        anyMoved = true;
      }
    }
    if (!anyMoved) break;
  }
}

/**
 * Easing qui ralentit autour de t=0.5 : la dérivée vaut 1+a aux extrémités
 * et 1-a au milieu. Visuellement, le défenseur ralentit en passant le
 * sommet du contournement (comme un humain qui négocie un écran).
 */
function easeSlowAtApex(t: number, a: number = 0.3): number {
  return t + (a * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);
}

/**
 * Position interpolée entre `start` et `end` au paramètre `t`,
 * MAIS en contournant `obstacle` via une courbe Bezier quadratique
 * si le segment direct passe au travers du cercle de l'obstacle.
 *
 * Le côté de contournement est choisi automatiquement : on dévie
 * dans la direction opposée à l'obstacle par rapport au segment direct.
 *
 * `obstacleRadius` peut représenter un cluster (poseur + son défenseur,
 * deux écrans qui se touchent…) — passer la demi-largeur du cluster +
 * une marge.
 */
export function curveAroundObstacle(
  start: Point,
  end: Point,
  obstacle: Point,
  obstacleRadius: number,
  t: number
): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return start;
  const ux = dx / len;
  const uy = dy / len;

  // Projection de l'obstacle sur le segment
  const ox = obstacle.x - start.x;
  const oy = obstacle.y - start.y;
  const proj = ox * ux + oy * uy;
  if (proj < 0 || proj > len) {
    // L'obstacle est hors du segment → ligne droite
    return { x: start.x + dx * t, y: start.y + dy * t };
  }
  const closestX = start.x + proj * ux;
  const closestY = start.y + proj * uy;
  const distToLine = Math.hypot(obstacle.x - closestX, obstacle.y - closestY);
  if (distToLine >= obstacleRadius) {
    return { x: start.x + dx * t, y: start.y + dy * t };
  }

  // Le segment passe à travers. On dévie perpendiculairement, du
  // côté OPPOSÉ à l'obstacle par rapport au segment.
  const perpX = -uy;
  const perpY = ux;
  const cross = ox * perpX + oy * perpY;
  const pushSign = cross >= 0 ? -1 : 1;

  // Amplitude proportionnelle à la pénétration : un frôlement ne
  // produit qu'une mini courbe, une traversée profonde une grande.
  const penetration = obstacleRadius - distToLine;
  const peak = penetration + 6; // juste assez pour dégager + marge
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const ctrlX = mx + perpX * 2 * peak * pushSign;
  const ctrlY = my + perpY * 2 * peak * pushSign;

  // Easing pour ralentir au sommet du contournement (effet "négociation")
  const te = easeSlowAtApex(t);
  const omt = 1 - te;
  return {
    x: omt * omt * start.x + 2 * omt * te * ctrlX + te * te * end.x,
    y: omt * omt * start.y + 2 * omt * te * ctrlY + te * te * end.y,
  };
}

/**
 * Sélectionne l'obstacle le plus bloquant pour le segment start→end.
 * "Le plus bloquant" = celui dont la pénétration dans le segment est la plus
 * profonde (rayon - distance à la ligne, parmi les obstacles entre start et end).
 * Retourne null si aucun obstacle ne traverse réellement le segment.
 *
 * Sert pour les écrans en série (staggered) : plutôt que de contourner le
 * premier obstacle de la liste (arbitraire), on contourne celui qui gêne
 * vraiment. Limite v1 : on ne fait qu'un seul contournement, pas un
 * enchaînement de courbes — un second obstacle plus loin sur le segment
 * est ignoré.
 */
export function pickBlockingObstacle(
  start: Point,
  end: Point,
  obstacles: { center: Point; radius: number }[]
): { center: Point; radius: number } | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return null;
  const ux = dx / len;
  const uy = dy / len;

  let best: { center: Point; radius: number } | null = null;
  let bestPen = 0;
  for (const obs of obstacles) {
    const ox = obs.center.x - start.x;
    const oy = obs.center.y - start.y;
    const proj = ox * ux + oy * uy;
    if (proj < 0 || proj > len) continue;
    const closestX = start.x + proj * ux;
    const closestY = start.y + proj * uy;
    const distToLine = Math.hypot(obs.center.x - closestX, obs.center.y - closestY);
    if (distToLine >= obs.radius) continue;
    const pen = obs.radius - distToLine;
    if (pen > bestPen) {
      bestPen = pen;
      best = obs;
    }
  }
  return best;
}

/**
 * Variante "staggered screens" : si plusieurs obstacles bloquent réellement
 * le segment, les fusionne en un super-cluster (centroid pondéré, rayon
 * couvrant l'enveloppe). curveAroundObstacle peut alors les contourner d'un
 * seul mouvement large plutôt que de slalomer entre eux.
 *
 * - 0 obstacle bloquant → null
 * - 1 obstacle → l'obstacle lui-même
 * - 2+ → super-cluster (centroid des centres, rayon = max(distance centroid →
 *   centre_i + radius_i))
 */
export function pickBlockingCluster(
  start: Point,
  end: Point,
  obstacles: { center: Point; radius: number }[]
): { center: Point; radius: number } | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return null;
  const ux = dx / len;
  const uy = dy / len;

  const blockers: { center: Point; radius: number }[] = [];
  for (const obs of obstacles) {
    const ox = obs.center.x - start.x;
    const oy = obs.center.y - start.y;
    const proj = ox * ux + oy * uy;
    if (proj < 0 || proj > len) continue;
    const closestX = start.x + proj * ux;
    const closestY = start.y + proj * uy;
    const distToLine = Math.hypot(obs.center.x - closestX, obs.center.y - closestY);
    if (distToLine >= obs.radius) continue;
    blockers.push(obs);
  }

  if (blockers.length === 0) return null;
  if (blockers.length === 1) return blockers[0];

  const cx = blockers.reduce((s, b) => s + b.center.x, 0) / blockers.length;
  const cy = blockers.reduce((s, b) => s + b.center.y, 0) / blockers.length;
  const center = { x: cx, y: cy };
  const radius = Math.max(
    ...blockers.map((b) => Math.hypot(b.center.x - cx, b.center.y - cy) + b.radius)
  );
  return { center, radius };
}

/**
 * Calcule un cluster (centre + rayon) à partir d'un noyau central et
 * d'éventuels obstacles voisins (à moins de `linkDist` du noyau).
 * Utile pour traiter "poseur d'écran + son défenseur" comme une seule
 * masse à contourner d'un coup, plutôt que deux courbes successives.
 */
export function makeCluster(
  core: Point,
  others: Point[],
  linkDist: number,
  baseRadius: number
): { center: Point; radius: number } {
  const members = [core, ...others.filter((o) => Math.hypot(o.x - core.x, o.y - core.y) <= linkDist)];
  if (members.length === 1) {
    return { center: { x: core.x, y: core.y }, radius: baseRadius };
  }
  const cx = members.reduce((s, p) => s + p.x, 0) / members.length;
  const cy = members.reduce((s, p) => s + p.y, 0) / members.length;
  const center = { x: cx, y: cy };
  const maxFar = Math.max(...members.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  return { center, radius: maxFar + baseRadius };
}
