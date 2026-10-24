// Poignées SVG draggables sur les annotations de mouvement (cut / dribble /
// screen) de l'étape active. Chaque annotation expose trois types de handles :
//
//  - `from` (cercle vert) — point de départ (= position joueur début d'étape)
//  - `to`   (cercle rouge) — point d'arrivée (= position joueur fin d'étape,
//    phase 'end', ou position début étape, phase 'start')
//  - `wp`   (petit cercle bleu) — chaque waypoint d'une courbe (V-cut,
//    freehand). Pas de cascade — édition pure du chemin.
//
// L'overlay n'apparaît qu'en pause (`!isPlaying`) pour ne pas polluer la
// lecture. Drag avec pointer capture pour gérer correctement les release
// hors du sprite.

import { useCallback, useRef, useState } from 'react';
import type { Annotation, AnnotationType, Point } from '@/lib/types';

type MovementType = Extract<AnnotationType, 'cut' | 'dribble' | 'screen'>;
const MOVEMENT_TYPES: MovementType[] = ['cut', 'dribble', 'screen'];
function isMovement(a: Annotation): a is Annotation & { type: MovementType } {
  return (MOVEMENT_TYPES as AnnotationType[]).includes(a.type);
}

type HandleKind = 'from' | 'to' | 'wp';
interface DragState {
  annoIdx: number;
  kind: HandleKind;
  wpIdx?: number;
}

interface AnnotationHandlesProps {
  annotations: Annotation[];
  stepIdx?: number;
  /** Si fourni, n'affiche que les poignées de cette annotation (sélection). */
  only?: { stepIdx: number; index: number } | null;
  /** Renvoie le point SVG correspondant à l'événement pointer (factorisé par
   *  useCourtPointerHandlers, on ré-utilise la même fonction). */
  svgPoint: (evt: React.PointerEvent) => Point;
  onCommitFrom: (annoIdx: number, p: Point) => void;
  onCommitTo: (annoIdx: number, p: Point) => void;
  onCommitWaypoint: (annoIdx: number, wpIdx: number, p: Point) => void;
  /** Ajoute un point de courbure à une trajectoire droite (poignée milieu). */
  onAddWaypoint?: (annoIdx: number, p: Point) => void;
  /** Annotations stockées ici mais affichées sur une autre étape (arrivées). */
  isHidden?: (a: Annotation) => boolean;
  /** Échelle écran courante (px CSS par unité terrain). */
  screenScale?: number;
}

const HANDLE_R = 6;
const WP_R = 5;

interface HandleDotProps {
  cx: number;
  cy: number;
  /** Rayon visuel (unités terrain). */
  r: number;
  fill: string;
  strokeWidth: number;
  /** Rayon de la cible invisible : ≥ 44 px écran de diamètre. */
  hitR: number;
  title: string;
  onDown: (e: React.PointerEvent) => void;
  onMove: (e: React.PointerEvent) => void;
  onUp: (e: React.PointerEvent) => void;
}

/** Poignée = petit disque visible + large cible invisible. La cible est
 *  dimensionnée en pixels écran par l'appelant, pour rester confortable au
 *  doigt même quand le terrain est réduit ou dézoomé. */
function HandleDot({ cx, cy, r, fill, strokeWidth, hitR, title, onDown, onMove, onUp }: HandleDotProps) {
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        fillOpacity={0.85}
        stroke="#fff"
        strokeWidth={strokeWidth}
        pointerEvents="none"
      />
      <circle
        cx={cx}
        cy={cy}
        r={hitR}
        fill="rgba(0,0,0,0)"
        style={{ cursor: 'grab' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <title>{title}</title>
      </circle>
    </g>
  );
}

export function AnnotationHandles(props: AnnotationHandlesProps) {
  const { annotations, svgPoint, onCommitFrom, onCommitTo, onCommitWaypoint } = props;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const captureTargetRef = useRef<SVGElement | null>(null);
  // Tailles en pixels écran : 18 px de diamètre visuel minimum, 44 px de
  // cible tactile minimum.
  const scale = Math.max(0.1, props.screenScale ?? 1);
  const handleR = Math.max(HANDLE_R, 9 / scale);
  const wpR = Math.max(WP_R, 7 / scale);
  const hitR = Math.max(handleR + 3, 22 / scale);

  const startDrag = useCallback((e: React.PointerEvent, ds: DragState) => {
    e.stopPropagation();
    e.preventDefault();
    captureTargetRef.current = e.currentTarget as SVGElement;
    captureTargetRef.current.setPointerCapture(e.pointerId);
    setDrag(ds);
    setPreviewPoint(svgPoint(e));
  }, [svgPoint]);

  /** Poignée de courbure : crée le waypoint au milieu du segment puis le
   *  traîne immédiatement. Les deux opérations sont deux entrées d'historique
   *  (création + déplacement), toutes deux annulables. */
  const startCurveDrag = useCallback((e: React.PointerEvent, annoIdx: number, mid: Point) => {
    if (!props.onAddWaypoint) return;
    e.stopPropagation();
    e.preventDefault();
    props.onAddWaypoint(annoIdx, mid);
    captureTargetRef.current = e.currentTarget as SVGElement;
    captureTargetRef.current.setPointerCapture(e.pointerId);
    setDrag({ annoIdx, kind: 'wp', wpIdx: 0 });
    setPreviewPoint(svgPoint(e));
  }, [props.onAddWaypoint, svgPoint]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag) return;
    e.stopPropagation();
    setPreviewPoint(svgPoint(e));
  }, [drag, svgPoint]);

  const onUp = useCallback((e: React.PointerEvent) => {
    if (!drag) return;
    e.stopPropagation();
    const pt = svgPoint(e);
    if (drag.kind === 'from') onCommitFrom(drag.annoIdx, pt);
    else if (drag.kind === 'to') onCommitTo(drag.annoIdx, pt);
    else if (drag.kind === 'wp' && drag.wpIdx !== undefined) onCommitWaypoint(drag.annoIdx, drag.wpIdx, pt);
    if (captureTargetRef.current) {
      try { captureTargetRef.current.releasePointerCapture(e.pointerId); } catch {}
    }
    captureTargetRef.current = null;
    setDrag(null);
    setPreviewPoint(null);
  }, [drag, onCommitFrom, onCommitTo, onCommitWaypoint, svgPoint]);

  return (
    <g aria-label="annotation-handles">
      {annotations.map((a, annoIdx) => {
        if (!isMovement(a) || props.isHidden?.(a)) return null;
        // Sélection active : on ne montre que la trajectoire choisie, pour
        // éviter l'empilement de poignées sur une étape chargée.
        if (props.only && (props.only.index !== annoIdx || props.only.stepIdx !== props.stepIdx)) return null;
        const dragging = drag?.annoIdx === annoIdx ? drag : null;
        const from = dragging?.kind === 'from' && previewPoint ? previewPoint : a.from;
        const to = dragging?.kind === 'to' && previewPoint ? previewPoint : a.to;

        return (
          <g key={annoIdx} data-anno-idx={annoIdx} data-annotation-idx={annoIdx} data-annotation-step={props.stepIdx}>
            <HandleDot
              cx={from.x}
              cy={from.y}
              r={handleR}
              fill="#22c55e"
              strokeWidth={1.5}
              hitR={hitR}
              title={`début (${a.type})`}
              onDown={(e) => startDrag(e, { annoIdx, kind: 'from' })}
              onMove={onMove}
              onUp={onUp}
            />
            <HandleDot
              cx={to.x}
              cy={to.y}
              r={handleR}
              fill="#dc2626"
              strokeWidth={1.5}
              hitR={hitR}
              title={`fin (${a.type})`}
              onDown={(e) => startDrag(e, { annoIdx, kind: 'to' })}
              onMove={onMove}
              onUp={onUp}
            />
            {(a.waypoints ?? []).length === 0 && props.onAddWaypoint && (() => {
              const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
              return (
                <g>
                  <circle
                    cx={mid.x}
                    cy={mid.y}
                    r={Math.max(3, wpR * 0.65)}
                    fill="var(--bt-surface, #fff)"
                    stroke="#2563eb"
                    strokeWidth={1.2}
                    strokeDasharray="2 2"
                    opacity={0.9}
                    pointerEvents="none"
                  />
                  <circle
                    cx={mid.x}
                    cy={mid.y}
                    r={hitR}
                    fill="rgba(0,0,0,0)"
                    style={{ cursor: 'copy' }}
                    onPointerDown={(e) => startCurveDrag(e, annoIdx, mid)}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                  >
                    <title>Courber la trajectoire</title>
                  </circle>
                </g>
              );
            })()}
            {(a.waypoints ?? []).map((wp, wpIdx) => {
              const live = dragging?.kind === 'wp' && dragging.wpIdx === wpIdx && previewPoint ? previewPoint : wp;
              return (
                <HandleDot
                  key={wpIdx}
                  cx={live.x}
                  cy={live.y}
                  r={wpR}
                  fill="#2563eb"
                  strokeWidth={1.2}
                  hitR={hitR}
                  title={`point intermédiaire ${wpIdx + 1}`}
                  onDown={(e) => startDrag(e, { annoIdx, kind: 'wp', wpIdx })}
                  onMove={onMove}
                  onUp={onUp}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
