import type { ComputedDefense, DefenderId, DefenderRules } from '@/lib/types';

interface FieldOfViewOverlayProps {
  defPos: ComputedDefense;
  rules: DefenderRules;
}

/**
 * Cône de vision (champ de vision) par défenseur, activable individuellement
 * via `state.rules[id].showFieldOfView = true` (toggle dans le menu contextuel).
 *
 * Géométrie :
 *  - Centre : position du défenseur.
 *  - Direction : `gazeOrientation` (regard, déjà clampé ±90° du corps en amont).
 *  - Ouverture : 120° (60° de chaque côté du regard) — vision humaine réaliste.
 *  - Profondeur : 200 px (~5,4 m) — zone d'attention périphérique tactique.
 *  - Couleur : cyan semi-transparent (heatmap pour ne pas masquer le terrain).
 *
 * Pourquoi 120° et pas 180° ? La vision humaine focale + périphérique nette
 * couvre ~120°, le reste est en vision floue / mouvement détecté seulement.
 * Un défenseur "voit" ce qui se passe dans ce cône — au-delà, il doit
 * tourner la tête (ce qui correspond à un changement de gaze).
 */
const FOV_HALF_ANGLE_DEG = 60;       // 60° de chaque côté du regard = 120° total
const FOV_RADIUS_PX = 200;           // ~5,4 m de profondeur

export function FieldOfViewOverlay({ defPos, rules }: FieldOfViewOverlayProps) {
  const entries = (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).filter(
    ([id]) => rules[id]?.showFieldOfView === true
  );
  if (entries.length === 0) return null;

  return (
    <g pointerEvents="none">
      {entries.map(([id, p]) => {
        const sector = describeSector(
          { x: p.x, y: p.y },
          p.gazeOrientation,
          FOV_HALF_ANGLE_DEG,
          FOV_RADIUS_PX
        );
        return (
          <g key={`fov-${id}`}>
            <path d={sector} fill="#06b6d4" opacity={0.18} />
            <path d={sector} fill="none" stroke="#0891b2" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
          </g>
        );
      })}
    </g>
  );
}

/**
 * Décrit un secteur SVG (= cône) centré sur `center`, ouvert autour de
 * `centerAngleDeg` (angle horaire depuis le NORD, convention orientation.ts),
 * avec une demi-ouverture `halfAngleDeg` et un rayon `radius`.
 *
 * Path : Move au centre, Line vers début arc, Arc, Close.
 */
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
  // sweep=1 : sens horaire (cohérent avec notre convention atan2(dx, -dy)).
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
