import type { Point } from '../types';
import { CARRIER_SIDE_TOLERANCE_PX, HOOP, PAINT } from '../data/court';

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Distance perpendiculaire d'un point au segment [a,b]. Si la projection du
 * point tombe hors du segment, renvoie la distance à l'extrémité la plus
 * proche. Utilisé pour mesurer "à quelle distance d'un couloir d'attaque" se
 * trouve un défenseur.
 */
export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
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
  if (Math.abs(dx) < CARRIER_SIDE_TOLERANCE_PX) return 0;
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
 *  - de tous les attaquants SAUF son matchedTo (autorise la défense "coller")
 *  - de tous les autres défenseurs
 * On répète jusqu'à stabilité (ou maxIter).
 *
 * Note : pour les défenseurs en situation d'écran, la séparation visuelle
 * du porteur est garantie en amont dans `applyScreenAdjustment` (via
 * `pushOutOf` sur le porteur).
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
 *
 * `a=0.3` (défaut) : freinage léger, "frôle" l'obstacle.
 * `a→1.0` : quasi-pause au sommet (dérivée → 0). Sert au défenseur du
 *           porteur qui prend un écran solide / lockdown.
 *
 * Note : `a` est clampé à [0, 1.0] sinon la dérivée passe négative au sommet
 * (le joueur ferait marche arrière, visuellement absurde).
 */
function easeSlowAtApex(t: number, a: number = 0.3): number {
  const safeA = Math.max(0, Math.min(1.0, a));
  return t + (safeA * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);
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
  t: number,
  apexSlowness: number = 0.3,
  forcedPushSign?: number
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
  const pushSign = forcedPushSign !== undefined
    ? (forcedPushSign >= 0 ? 1 : -1)
    : (cross >= 0 ? -1 : 1);

  // Amplitude proportionnelle à la pénétration : un frôlement ne
  // produit qu'une mini courbe, une traversée profonde une grande.
  const penetration = obstacleRadius - distToLine;
  const peak = penetration + 6; // juste assez pour dégager + marge
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const ctrlX = mx + perpX * 2 * peak * pushSign;
  const ctrlY = my + perpY * 2 * peak * pushSign;

  // Easing pour ralentir au sommet du contournement (effet "négociation").
  // L'amplitude du ralentissement est paramétrable : 0.3 pour un évitement
  // courant, jusqu'à 1.0 pour une vraie pause sur l'écran (le défenseur
  // reste collé au poseur, le temps de négocier le contact).
  const te = easeSlowAtApex(t, apexSlowness);
  const omt = 1 - te;
  return {
    x: omt * omt * start.x + 2 * omt * te * ctrlX + te * te * end.x,
    y: omt * omt * start.y + 2 * omt * te * ctrlY + te * te * end.y,
  };
}

/**
 * Position du ballon entre deux étapes, en respectant deux cas :
 *
 * 1. Si le porteur n'a pas changé : le ballon suit le porteur (interpolation
 *    linéaire de sa position avec un offset constant pour qu'il flotte au-dessus
 *    de la main).
 *
 * 2. Si le porteur a changé (passe entrante) : le ballon décrit une parabole
 *    (Bezier quadratique avec un point de contrôle élevé au-dessus du segment)
 *    de l'ancien porteur vers le nouveau. La hauteur de l'arc est
 *    proportionnelle à la distance, plafonnée à 80px.
 *
 * `inFlight` permet au rendu de différencier visuellement le ballon en main
 * du ballon en l'air (taille, contour).
 */
export function computeBallFrame(
  prevCarrier: Point,
  nextCarrier: Point,
  carrierChanged: boolean,
  localT: number
): { pos: Point; inFlight: boolean } {
  const offsetX = 16;
  const offsetY = -16;

  if (!carrierChanged) {
    const x = prevCarrier.x + (nextCarrier.x - prevCarrier.x) * localT + offsetX;
    const y = prevCarrier.y + (nextCarrier.y - prevCarrier.y) * localT + offsetY;
    return { pos: { x, y }, inFlight: false };
  }

  const start = { x: prevCarrier.x + offsetX, y: prevCarrier.y + offsetY };
  const end = { x: nextCarrier.x + offsetX, y: nextCarrier.y + offsetY };
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  // Hauteur de l'arc proportionnelle à la distance, plafonnée. Soustraction
  // sur Y car le repère SVG a Y vers le bas — l'arc monte vers le haut.
  const lift = Math.min(80, dist * 0.28);
  const ctrlX = (start.x + end.x) / 2;
  const ctrlY = (start.y + end.y) / 2 - lift;
  const omt = 1 - localT;
  return {
    pos: {
      x: omt * omt * start.x + 2 * omt * localT * ctrlX + localT * localT * end.x,
      y: omt * omt * start.y + 2 * omt * localT * ctrlY + localT * localT * end.y,
    },
    inFlight: true,
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
 * Détecte une paire d'écrans staggered (en série) sur le segment, sur des
 * **côtés opposés** par rapport à la trajectoire directe. Utile pour
 * différencier le cas "deux écrans côte à côte" (super-cluster, un seul
 * détour large) du cas "deux écrans en quinconce" (weave réel, courbe
 * en S qui passe entre les deux).
 *
 * Retourne la paire ordonnée par projection le long du segment (le premier
 * écran rencontré en premier), ou null si :
 *  - moins de 2 écrans bloquent réellement le segment
 *  - tous les écrans bloquants sont du même côté (super-cluster suffit)
 */
export function pickStaggeredPair(
  start: Point,
  end: Point,
  obstacles: { center: Point; radius: number }[]
): [{ center: Point; radius: number }, { center: Point; radius: number }] | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return null;
  const ux = dx / len;
  const uy = dy / len;
  const perpX = -uy;
  const perpY = ux;

  // Filtre les bloqueurs réels et les annote (projection + côté signé)
  const blockers: { obs: { center: Point; radius: number }; proj: number; side: number }[] = [];
  for (const obs of obstacles) {
    const ox = obs.center.x - start.x;
    const oy = obs.center.y - start.y;
    const proj = ox * ux + oy * uy;
    if (proj < 0 || proj > len) continue;
    const closestX = start.x + proj * ux;
    const closestY = start.y + proj * uy;
    const distToLine = Math.hypot(obs.center.x - closestX, obs.center.y - closestY);
    if (distToLine >= obs.radius) continue;
    const cross = ox * perpX + oy * perpY;
    blockers.push({ obs, proj, side: Math.sign(cross) });
  }

  if (blockers.length < 2) return null;

  // Doit y avoir au moins un bloqueur de chaque côté
  const hasLeft = blockers.some((b) => b.side > 0);
  const hasRight = blockers.some((b) => b.side < 0);
  if (!hasLeft || !hasRight) return null;

  // Pour chaque côté, prend le bloqueur le plus précoce (proj le plus petit)
  const left = blockers.filter((b) => b.side > 0).sort((a, b) => a.proj - b.proj)[0];
  const right = blockers.filter((b) => b.side < 0).sort((a, b) => a.proj - b.proj)[0];

  // Renvoie ordonné par projection (front-to-back le long du segment)
  return left.proj <= right.proj ? [left.obs, right.obs] : [right.obs, left.obs];
}

/**
 * Position interpolée le long d'une courbe Bezier cubique qui weave entre
 * deux écrans staggered. Chaque point de contrôle est positionné à la
 * projection de l'écran sur le segment, poussé **perpendiculairement du
 * côté opposé** à l'écran (pour le contourner). Le résultat est une
 * courbe en S qui passe à droite de l'écran A, à gauche de l'écran B
 * (ou inversement).
 *
 * Pré-condition : les deux écrans sont sur des côtés opposés du segment
 * direct (cf. `pickStaggeredPair`).
 */
export function curveAroundStaggeredPair(
  start: Point,
  end: Point,
  obs1: { center: Point; radius: number },
  obs2: { center: Point; radius: number },
  t: number
): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return start;
  const ux = dx / len;
  const uy = dy / len;
  const perpX = -uy;
  const perpY = ux;

  // Pour chaque obstacle : projection sur le segment, côté signé,
  // point de contrôle poussé du côté OPPOSÉ.
  const ctrlFor = (obs: { center: Point; radius: number }) => {
    const ox = obs.center.x - start.x;
    const oy = obs.center.y - start.y;
    const proj = ox * ux + oy * uy;
    const closestX = start.x + proj * ux;
    const closestY = start.y + proj * uy;
    const distToLine = Math.hypot(obs.center.x - closestX, obs.center.y - closestY);
    const penetration = obs.radius - distToLine;
    const peak = Math.max(penetration + 8, 14);
    const cross = ox * perpX + oy * perpY;
    const sign = cross >= 0 ? -1 : 1; // pousse du côté opposé
    return {
      x: closestX + perpX * peak * sign,
      y: closestY + perpY * peak * sign,
    };
  };

  const ctrl1 = ctrlFor(obs1);
  const ctrl2 = ctrlFor(obs2);

  // Cubic Bezier : (1-t)³·P0 + 3(1-t)²·t·P1 + 3(1-t)·t²·P2 + t³·P3
  const omt = 1 - t;
  const omt2 = omt * omt;
  const omt3 = omt2 * omt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: omt3 * start.x + 3 * omt2 * t * ctrl1.x + 3 * omt * t2 * ctrl2.x + t3 * end.x,
    y: omt3 * start.y + 3 * omt2 * t * ctrl1.y + 3 * omt * t2 * ctrl2.y + t3 * end.y,
  };
}

/**
 * Longueur d'arc approximative de la trajectoire start→end qui contourne
 * `obstacle` via curveAroundObstacle, par échantillonnage uniforme en t.
 * Si aucun obstacle ne bloque, retourne la distance euclidienne directe.
 *
 * Sert à pénaliser le coût-temps d'un détour : un défenseur qui doit
 * faire le tour d'un pick-and-roll parcourt plus de pixels que la ligne
 * droite, donc épuise plus vite son budget de vitesse maximum.
 */
export function pathArcLength(
  start: Point,
  end: Point,
  obstacle: { center: Point; radius: number } | null,
  samples: number = 12
): number {
  if (!obstacle) return distance(start, end);
  let len = 0;
  let prev = curveAroundObstacle(start, end, obstacle.center, obstacle.radius, 0);
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const p = curveAroundObstacle(start, end, obstacle.center, obstacle.radius, t);
    len += distance(prev, p);
    prev = p;
  }
  return len;
}

/**
 * Friction de proximité : retourne un multiplicateur de vitesse ∈ [floor, 1]
 * basé sur la distance minimum atteinte entre le segment start→end et tous
 * les points `nearby` (échantillonné).
 *
 * - distance min ≥ threshold → 1.0 (pas de friction)
 * - distance min = 0         → floor (friction max, mais pas zéro :
 *   un défenseur ne s'arrête pas, il ralentit)
 * - linéaire entre les deux
 *
 * Modélise le contact "épaule" hors écran formel : frôler un attaquant non-
 * matché coûte un peu de vitesse même sans déclencher la logique d'écran.
 */
export function proximityFriction(
  start: Point,
  end: Point,
  nearby: Point[],
  threshold: number = 30,
  floor: number = 0.6,
  samples: number = 8
): number {
  if (nearby.length === 0) return 1;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return 1;
  let minDist = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const px = start.x + dx * t;
    const py = start.y + dy * t;
    for (const o of nearby) {
      const d = Math.hypot(o.x - px, o.y - py);
      if (d < minDist) minDist = d;
    }
  }
  if (minDist >= threshold) return 1;
  const tFriction = Math.max(0, minDist) / threshold;
  return floor + (1 - floor) * tFriction;
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
