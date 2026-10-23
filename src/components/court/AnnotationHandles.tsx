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
  /** Renvoie le point SVG correspondant à l'événement pointer (factorisé par
   *  useCourtPointerHandlers, on ré-utilise la même fonction). */
  svgPoint: (evt: React.PointerEvent) => Point;
  onCommitFrom: (annoIdx: number, p: Point) => void;
  onCommitTo: (annoIdx: number, p: Point) => void;
  onCommitWaypoint: (annoIdx: number, wpIdx: number, p: Point) => void;
  /** Annotations stockées ici mais affichées sur une autre étape (arrivées). */
  isHidden?: (a: Annotation) => boolean;
}

const HANDLE_R = 6;
const WP_R = 5;

export function AnnotationHandles(props: AnnotationHandlesProps) {
  const { annotations, svgPoint, onCommitFrom, onCommitTo, onCommitWaypoint } = props;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const captureTargetRef = useRef<SVGElement | null>(null);

  const startDrag = useCallback((e: React.PointerEvent, ds: DragState) => {
    e.stopPropagation();
    e.preventDefault();
    captureTargetRef.current = e.currentTarget as SVGElement;
    captureTargetRef.current.setPointerCapture(e.pointerId);
    setDrag(ds);
    setPreviewPoint(svgPoint(e));
  }, [svgPoint]);

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
        const dragging = drag?.annoIdx === annoIdx ? drag : null;
        const from = dragging?.kind === 'from' && previewPoint ? previewPoint : a.from;
        const to = dragging?.kind === 'to' && previewPoint ? previewPoint : a.to;

        return (
          <g key={annoIdx} data-anno-idx={annoIdx} data-annotation-idx={annoIdx} data-annotation-step={props.stepIdx}>
            <circle
              cx={from.x}
              cy={from.y}
              r={HANDLE_R}
              fill="#22c55e"
              fillOpacity={0.85}
              stroke="#fff"
              strokeWidth={1.5}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => startDrag(e, { annoIdx, kind: 'from' })}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <title>début ({a.type})</title>
            </circle>
            <circle
              cx={to.x}
              cy={to.y}
              r={HANDLE_R}
              fill="#dc2626"
              fillOpacity={0.85}
              stroke="#fff"
              strokeWidth={1.5}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => startDrag(e, { annoIdx, kind: 'to' })}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <title>fin ({a.type})</title>
            </circle>
            {(a.waypoints ?? []).map((wp, wpIdx) => {
              const live = dragging?.kind === 'wp' && dragging.wpIdx === wpIdx && previewPoint ? previewPoint : wp;
              return (
                <circle
                  key={wpIdx}
                  cx={live.x}
                  cy={live.y}
                  r={WP_R}
                  fill="#2563eb"
                  fillOpacity={0.8}
                  stroke="#fff"
                  strokeWidth={1.2}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => startDrag(e, { annoIdx, kind: 'wp', wpIdx })}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                >
                  <title>point intermédiaire {wpIdx + 1}</title>
                </circle>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
