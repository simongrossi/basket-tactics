import type {
  ComputedDefense,
  ComputedAttackerVisuals,
  AttackerPositions,
  DefenderId,
  AttackerId,
  DefenderRules,
} from '@/lib/types';

interface FieldOfViewOverlayProps {
  defPos: ComputedDefense;
  off: AttackerPositions;
  attVisuals: ComputedAttackerVisuals;
  rules: DefenderRules;
  /** Toggle global qui force le cône sur TOUS les joueurs (défenseurs +
   *  attaquants). Combiné par OR logique avec les toggles individuels. */
  showAll?: boolean;
}

/**
 * Cône de vision (champ de vision) par joueur. Activable :
 *  - **Individuellement par défenseur** via `state.rules[id].showFieldOfView`
 *    (clic-droit → checkbox "champ de vision").
 *  - **Globalement pour tous les joueurs** (défenseurs ET attaquants) via
 *    `state.showFieldOfViewAll` (toggle dans le menu Paramètres).
 *
 * Géométrie :
 *  - Centre : position du joueur.
 *  - Direction : `gazeOrientation` (regard, clampé ±90° du corps en amont
 *    pour respecter la règle anatomique : pas de regard derrière la tête).
 *  - Ouverture : 120° (60° de chaque côté du regard) — vision humaine
 *    focale + périphérique nette.
 *  - Profondeur : 200 px (~5,4 m) — zone d'attention périphérique tactique.
 *  - Couleur : cyan semi-transparent. **Heatmap croisée** : l'opacité
 *    s'accumule naturellement aux intersections de plusieurs cônes,
 *    matérialisant les zones du terrain les mieux couvertes (vue par
 *    plusieurs défenseurs simultanément).
 *
 * Pourquoi 120° et pas 180° ? La vision humaine focale + périphérique
 * nette couvre ~120°. Au-delà, le joueur doit tourner la tête (= changer
 * son `gazeOrientation`).
 */
const FOV_HALF_ANGLE_DEG = 60;       // 60° de chaque côté = 120° total
const FOV_RADIUS_PX = 200;           // ~5,4 m de profondeur

export function FieldOfViewOverlay({ defPos, off, attVisuals, rules, showAll }: FieldOfViewOverlayProps) {
  const cones: { id: string; cx: number; cy: number; gaze: number }[] = [];

  // Défenseurs : cône si toggle global OU toggle individuel.
  (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).forEach(([id, p]) => {
    const enabled = showAll || rules[id]?.showFieldOfView === true;
    if (!enabled) return;
    cones.push({ id: `def-${id}`, cx: p.x, cy: p.y, gaze: p.gazeOrientation });
  });

  // Attaquants : cône si toggle global (pas de réglage individuel pour
  // l'instant — on peut en ajouter via un nouveau champ d'AttackerHands
  // si besoin futur).
  if (showAll) {
    (Object.entries(off) as [AttackerId, { x: number; y: number }][]).forEach(([id, pos]) => {
      const v = attVisuals[id];
      if (!v) return;
      cones.push({ id: `att-${id}`, cx: pos.x, cy: pos.y, gaze: v.gazeOrientation });
    });
  }

  if (cones.length === 0) return null;

  return (
    <g pointerEvents="none">
      {cones.map((c) => {
        const sector = describeSector(
          { x: c.cx, y: c.cy },
          c.gaze,
          FOV_HALF_ANGLE_DEG,
          FOV_RADIUS_PX
        );
        return (
          <g key={c.id}>
            {/* Remplissage cyan semi-transparent — l'opacité s'accumule
             *  naturellement par superposition SVG (heatmap croisée). */}
            <path d={sector} fill="#06b6d4" opacity={0.18} />
            {/* Contour discret pour délimiter chaque cône individuellement. */}
            <path
              d={sector}
              fill="none"
              stroke="#0891b2"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.4}
            />
          </g>
        );
      })}
    </g>
  );
}

function describeSector(
  center: { x: number; y: number },
  centerAngleDeg: number,
  halfAngleDeg: number,
  radius: number
): string {
  const startAngle = centerAngleDeg - halfAngleDeg;
  const endAngle = centerAngleDeg + halfAngleDeg;
  const start = polarToCartesian(center, startAngle, radius);
  const end = polarToCartesian(center, endAngle, radius);
  const largeArc = halfAngleDeg * 2 > 180 ? 1 : 0;
  return `M ${center.x} ${center.y} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function polarToCartesian(
  center: { x: number; y: number },
  angleDeg: number,
  radius: number
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + Math.sin(rad) * radius,
    y: center.y - Math.cos(rad) * radius,
  };
}
