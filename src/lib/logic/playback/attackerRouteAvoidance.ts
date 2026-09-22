import type { Point } from '@/lib/types';
import { curveAroundObstacle, pickBlockingCluster } from '../geometry';
import { polylineLength, samplePolyline } from '../polyline';

type Obstacle = { center: Point; radius: number };

/** Déforme uniquement la portion entre deux points de passage.
 * Le timing reste celui de la trajectoire, jamais celui du segment d'étapes.
 * Les collisions résiduelles restent traitées par les solveurs du renderer. */
export function avoidAttackerRoute(
  position: Point, path: Point[], progress: number, obstacles: Obstacle[],
): Point {
  if (path.length < 2 || progress <= 0 || progress >= 1) return position;
  const length = polylineLength(path);
  if (length < 1e-6) return position;
  const target = progress * length;
  let travelled = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];
    const legLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (travelled + legLength < target) { travelled += legLength; continue; }
    if (legLength < 1e-6) continue;
    const legT = (target - travelled) / legLength;
    if (legT < 1e-8 || legT > 1 - 1e-8) return position;

    // Une spline peut déjà contourner un joueur placé sur sa corde :
    // seuls les obstacles rencontrés par la courbe réelle sont retenus.
    let blockers = obstacles;
    let samples: Point[] = [];
    if (path.length > 2) {
      samples = Array.from({ length: 25 }, (_, k) =>
        samplePolyline(path, (travelled + legLength * k / 24) / length));
      blockers = obstacles.filter((obstacle) => samples.some((point, k) => k > 0 &&
        pickBlockingCluster(samples[k - 1], point, [obstacle]) !== null));
    }
    const blocking = pickBlockingCluster(start, end, blockers);
    if (!blocking) {
      // Cas d'une spline qui déborde de sa corde (virage serré) :
      // une bosse continue, nulle aux points de passage, éloigne la
      // portion réellement en contact sans redresser tout le trajet.
      let dx = 0;
      let dy = 0;
      for (const obstacle of blockers) {
        if (samples.length === 0) continue;
        let nearest = 0;
        for (let k = 1; k < samples.length; k++) {
          if (Math.hypot(samples[k].x - obstacle.center.x, samples[k].y - obstacle.center.y)
            < Math.hypot(samples[nearest].x - obstacle.center.x, samples[nearest].y - obstacle.center.y)) nearest = k;
        }
        const closest = samples[nearest];
        const distance = Math.hypot(closest.x - obstacle.center.x, closest.y - obstacle.center.y);
        if (distance >= obstacle.radius) continue;
        const contactT = nearest / (samples.length - 1);
        const envelope = 4 * legT * (1 - legT);
        const contactEnvelope = Math.max(0.1, 4 * contactT * (1 - contactT));
        const shift = (obstacle.radius - distance + 6) * envelope / contactEnvelope;
        dx += shift * (distance > 1e-6 ? (closest.x - obstacle.center.x) / distance : -(end.y - start.y) / legLength);
        dy += shift * (distance > 1e-6 ? (closest.y - obstacle.center.y) / distance : (end.x - start.x) / legLength);
      }
      return dx === 0 && dy === 0 ? position : { x: position.x + dx, y: position.y + dy };
    }
    const curved = curveAroundObstacle(start, end, blocking.center, blocking.radius, legT,
      path.length === 2 ? 0.3 : 0);
    // Correction additive : conserve la spline, son côté choisi et le drift.
    return {
      x: position.x + curved.x - (start.x + (end.x - start.x) * legT),
      y: position.y + curved.y - (start.y + (end.y - start.y) * legT),
    };
  }
  return position;
}
