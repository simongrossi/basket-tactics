import type { AppState, AttackerId, ComputedDefense, DefenderId, Point } from '@/lib/types';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { activeOffense } from '@/lib/logic/players';
import { PLAYER_RADIUS } from '@/lib/data/court';

/**
 * Affiche en transparence les positions de tous les joueurs à l'étape donnée
 * (mode fantôme : ghost de l'étape N-1 quand on édite N). Cercles gris avec
 * contour pointillé, sans label, opacité 0.35.
 *
 * Recalcule volontairement `effectiveDefensePositions` pour le step demandé
 * (différent de la frame courante) — c'est l'usage légitime de cette fonction
 * en dehors du frameResolver de playback.
 */
export function GhostLayer({ state, stepIdx }: { state: AppState; stepIdx: number }) {
  const step = state.steps[stepIdx];
  if (!step) return null;
  const off = activeOffense(step.off, state.playerCount);
  const defPos = effectiveDefensePositions(state, stepIdx);
  const r = PLAYER_RADIUS;
  return (
    <g pointerEvents="none" opacity={0.35}>
      {(Object.entries(off) as [AttackerId, Point][]).map(([id, pos]) => (
        <circle
          key={`ghost-o-${id}`}
          cx={pos.x}
          cy={pos.y}
          r={r}
          fill="none"
          stroke="#D85A30"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      ))}
      {(Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).map(([id, p]) => (
        <circle
          key={`ghost-d-${id}`}
          cx={p.x}
          cy={p.y}
          r={r}
          fill="none"
          stroke="#378ADD"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      ))}
    </g>
  );
}
