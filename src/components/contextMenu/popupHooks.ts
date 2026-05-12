// Hooks de positionnement / drag pour les popups (ContextMenu et dérivés).
//
//  - `useClampedPosition` : clamp dans le parent (ne déborde pas à droite/bas)
//  - `useDraggablePopup`  : popup déplaçable par drag d'un handle

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Repositionne un menu contextuel pour qu'il ne déborde pas du conteneur
 * parent (le wrap du SVG). Si le menu déborderait à droite, on l'ouvre vers
 * la gauche du clic ; idem en bas. Marge 8px du bord. Mesuré après mount
 * via useLayoutEffect (synchrone, sans flash visible).
 */
export function useClampedPosition(
  initialX: number,
  initialY: number,
  ref: React.RefObject<HTMLDivElement | null>
) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const rect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    let nx = initialX;
    let ny = initialY;
    const overflowRight = initialX + rect.width - (parentRect.width - 8);
    if (overflowRight > 0) nx = Math.max(8, initialX - rect.width);
    const overflowBottom = initialY + rect.height - (parentRect.height - 8);
    if (overflowBottom > 0) ny = Math.max(8, initialY - rect.height);
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialX, initialY]);
  return pos;
}

/**
 * Rend le popup déplaçable à la souris depuis un drag handle. La position
 * initiale (clamped) sert de point de départ ; le drag met à jour la
 * position en suivant le pointer. Le clic-en-dehors qui ferme le popup
 * doit être désactivé pendant le drag, d'où l'expose `isDragging`.
 *
 * Quand `initial` change (popup rouvert pour un autre joueur), la position
 * revient à `initial` — on n'hérite pas de l'ancien emplacement.
 */
export function useDraggablePopup(initial: { x: number; y: number }) {
  const [pos, setPos] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);

  // Reset à la position initiale quand on ouvre pour un nouveau joueur.
  useEffect(() => {
    setPos(initial);
  }, [initial.x, initial.y]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      if (!dragOffset.current) return;
      setPos({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const onUp = () => {
      setIsDragging(false);
      dragOffset.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isDragging]);

  const onPointerDown = (e: React.PointerEvent) => {
    // L'offset = clic - position actuelle (en coordonnées viewport, pas
    // parent). Le popup est en `position: absolute` dans son parent ; on
    // calcule la position parent->viewport pour obtenir un delta cohérent.
    const parent = (e.currentTarget as HTMLElement).parentElement?.parentElement;
    const parentRect = parent?.getBoundingClientRect();
    const parentX = parentRect?.left ?? 0;
    const parentY = parentRect?.top ?? 0;
    dragOffset.current = {
      x: e.clientX - (pos.x + parentX),
      y: e.clientY - (pos.y + parentY),
    };
    setIsDragging(true);
  };

  return { pos, isDragging, onPointerDown };
}
