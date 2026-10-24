// Caméra du terrain : conversions écran ↔ unités terrain, zoom ancré,
// déplacement et bornes.
//
// Le SVG utilise `preserveAspectRatio="xMidYMid meet"` et un `viewBox`
// 600 × 560 (ou 600 × 1080). La caméra est le `transform` du groupe de
// contenu : `translate(x, y) scale(scale)` en UNITÉS SVG.
//
// Règle d'or : toute valeur exprimée en pixels CSS (position du doigt,
// molette, delta de pan) doit être convertie en unités SVG AVANT d'être
// appliquée à la caméra. Le code historique appliquait les pixels CSS
// directement : sur téléphone (échelle ≈ 0,59) le terrain se déplaçait
// ~1,7× plus vite que le doigt et le zoom dérivait.

import type { Point } from '../types';

export interface Camera {
  scale: number;
  x: number;
  y: number;
}

export interface ViewportMetrics {
  /** Largeur CSS du SVG. */
  width: number;
  /** Hauteur CSS du SVG. */
  height: number;
  /** Pixels CSS par unité SVG (viewBox « meet »). */
  s0: number;
  /** Décalage du viewBox dans le SVG (centrage xMidYMid). */
  offsetX: number;
  offsetY: number;
}

export const CAMERA_MIN_SCALE = 0.5;
export const CAMERA_MAX_SCALE = 5;

/** Métriques du viewBox pour une taille CSS donnée. */
export function viewportMetrics(
  width: number,
  height: number,
  viewBoxWidth: number,
  viewBoxHeight: number
): ViewportMetrics {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const s0 = Math.min(w / viewBoxWidth, h / viewBoxHeight);
  return {
    width: w,
    height: h,
    s0,
    offsetX: (w - viewBoxWidth * s0) / 2,
    offsetY: (h - viewBoxHeight * s0) / 2,
  };
}

/** Coordonnées écran (relatives au SVG) → unités SVG (repère du contenu
 *  avant le transform de caméra). */
export function screenToUser(screen: Point, m: ViewportMetrics): Point {
  return {
    x: (screen.x - m.offsetX) / m.s0,
    y: (screen.y - m.offsetY) / m.s0,
  };
}

/** Point du terrain → position écran (relative au SVG). */
export function courtToScreen(camera: Camera, point: Point, m: ViewportMetrics): Point {
  return {
    x: m.offsetX + m.s0 * (camera.x + camera.scale * point.x),
    y: m.offsetY + m.s0 * (camera.y + camera.scale * point.y),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Zoom centré sur un point écran : le point du terrain sous ce pixel reste
 *  sous ce pixel. */
export function zoomCameraAt(
  camera: Camera,
  screen: Point,
  m: ViewportMetrics,
  factor: number,
  minScale = CAMERA_MIN_SCALE,
  maxScale = CAMERA_MAX_SCALE
): Camera {
  const nextScale = clamp(camera.scale * factor, minScale, maxScale);
  if (nextScale === camera.scale) return camera;
  const k = nextScale / camera.scale;
  const u = screenToUser(screen, m);
  return {
    scale: nextScale,
    x: u.x - (u.x - camera.x) * k,
    y: u.y - (u.y - camera.y) * k,
  };
}

/** Déplacement de la caméra pour un delta en pixels CSS (positif = le
 *  contenu suit le doigt). */
export function panCamera(camera: Camera, dxScreen: number, dyScreen: number, m: ViewportMetrics): Camera {
  return {
    scale: camera.scale,
    x: camera.x + dxScreen / m.s0,
    y: camera.y + dyScreen / m.s0,
  };
}

/** Fenêtre visible en unités SVG (centrée par preserveAspectRatio). */
function visibleWindow(m: ViewportMetrics, viewBoxWidth: number, viewBoxHeight: number) {
  const winW = m.width / m.s0;
  const winH = m.height / m.s0;
  return {
    left: (viewBoxWidth - winW) / 2,
    top: (viewBoxHeight - winH) / 2,
    winW,
    winH,
  };
}

/** Garde le terrain visible : quand il est plus grand que la fenêtre, on ne
 *  peut pas le faire sortir ; quand il est plus petit, il est centré. */
export function clampCamera(
  camera: Camera,
  m: ViewportMetrics,
  viewBoxWidth: number,
  viewBoxHeight: number
): Camera {
  const { left, top, winW, winH } = visibleWindow(m, viewBoxWidth, viewBoxHeight);
  const contentW = camera.scale * viewBoxWidth;
  const contentH = camera.scale * viewBoxHeight;
  const x = contentW >= winW
    ? clamp(camera.x, left + winW - contentW, left)
    : left + (winW - contentW) / 2;
  const y = contentH >= winH
    ? clamp(camera.y, top + winH - contentH, top)
    : top + (winH - contentH) / 2;
  return { scale: camera.scale, x, y };
}

/** Cadrage initial : terrain entier, centré. */
export function fitCamera(
  m: ViewportMetrics,
  viewBoxWidth: number,
  viewBoxHeight: number
): Camera {
  return clampCamera({ scale: 1, x: 0, y: 0 }, m, viewBoxWidth, viewBoxHeight);
}
