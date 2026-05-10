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
  /** Active les cônes sur **tous les joueurs** (défenseurs + attaquants). */
  showAll?: boolean;
  /** Active les cônes sur tous les défenseurs uniquement. */
  showAllDefenders?: boolean;
  /** Active les cônes sur tous les attaquants uniquement. */
  showAllAttackers?: boolean;
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
 *  - Direction : `gazeOrientation` (regard, clampé ±60° du corps en amont
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
// Profondeur étendue au-delà des limites du demi-terrain canonique
// (600×560 px) et du terrain complet (600×1080 px). Distance max
// diagonale ≈ 1230 px depuis un coin opposé. Le cône est rendu jusqu'à
// cette portée puis clippé visuellement par le viewBox SVG du terrain
// (les zones hors-terrain sont simplement masquées).
const FOV_RADIUS_PX = 1300;

type ConeKind = 'def' | 'att';

const CONE_STYLE: Record<ConeKind, { fill: string; stroke: string }> = {
  // Défenseurs : cyan (cohérent avec les cercles bleus défense).
  def: { fill: '#06b6d4', stroke: '#0891b2' },
  // Attaquants : orange (cohérent avec les cercles orange attaque).
  att: { fill: '#f97316', stroke: '#c2410c' },
};

export function FieldOfViewOverlay({
  defPos, off, attVisuals, rules, showAll, showAllDefenders, showAllAttackers,
}: FieldOfViewOverlayProps) {
  const cones: { id: string; cx: number; cy: number; gaze: number; kind: ConeKind }[] = [];
  const defOn = !!(showAll || showAllDefenders);
  const attOn = !!(showAll || showAllAttackers);

  // Défenseurs : cône si toggle "tous" OU toggle "tous défenseurs" OU
  // toggle individuel (clic-droit).
  (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).forEach(([id, p]) => {
    const enabled = defOn || rules[id]?.showFieldOfView === true;
    if (!enabled) return;
    cones.push({ id: `def-${id}`, cx: p.x, cy: p.y, gaze: p.gazeOrientation, kind: 'def' });
  });

  // Attaquants : cône si toggle "tous" OU toggle "tous attaquants".
  if (attOn) {
    (Object.entries(off) as [AttackerId, { x: number; y: number }][]).forEach(([id, pos]) => {
      const v = attVisuals[id];
      if (!v) return;
      cones.push({ id: `att-${id}`, cx: pos.x, cy: pos.y, gaze: v.gazeOrientation, kind: 'att' });
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
        const style = CONE_STYLE[c.kind];
        return (
          <g key={c.id}>
            {/* Remplissage semi-transparent — l'opacité s'accumule par
             *  superposition SVG (heatmap croisée). Cyan = défenseurs,
             *  orange = attaquants. Les zones où les deux teintes se
             *  recouvrent matérialisent les ligne de passe / duels. */}
            <path d={sector} fill={style.fill} opacity={0.18} />
            <path
              d={sector}
              fill="none"
              stroke={style.stroke}
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
