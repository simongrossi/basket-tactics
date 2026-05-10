import type { AppState, AttackerId, ComputedDefense, DefenderId, Point } from '@/lib/types';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { activeOffense } from '@/lib/logic/players';
import { PLAYER_RADIUS } from '@/lib/data/court';

/**
 * Affiche en transparence les positions de tous les joueurs à l'étape N-1
 * quand on édite l'étape N. Aide à comprendre d'où viennent les joueurs et
 * éviter les téléportations involontaires.
 *
 * - Cercles pointillés à la position N-1 (couleur du camp atténuée)
 * - Flèche fine entre N-1 et N pour chaque joueur qui a bougé > 5 px
 *
 * Recalcule volontairement `effectiveDefensePositions` pour le step demandé
 * (différent de la frame courante) — c'est l'usage légitime de cette fonction
 * en dehors du frameResolver de playback.
 */
export function GhostLayer({
  state,
  stepIdx,
  currentStepIdx,
}: {
  state: AppState;
  stepIdx: number;
  currentStepIdx?: number;
}) {
  const step = state.steps[stepIdx];
  if (!step) return null;
  const prevOff = activeOffense(step.off, state.playerCount);
  const prevDef = effectiveDefensePositions(state, stepIdx);

  // Pour les flèches, on a besoin des positions de l'étape courante.
  const curIdx = currentStepIdx ?? stepIdx + 1;
  const curStep = state.steps[curIdx];
  const curOff = curStep ? activeOffense(curStep.off, state.playerCount) : null;
  const curDef = curStep ? effectiveDefensePositions(state, curIdx) : null;

  const r = PLAYER_RADIUS;

  return (
    <g pointerEvents="none">
      {/* Définit la flèche réutilisable */}
      <defs>
        <marker
          id="ghost-arrow-off"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#D85A30" opacity={0.5} />
        </marker>
        <marker
          id="ghost-arrow-def"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#378ADD" opacity={0.5} />
        </marker>
      </defs>

      {/* Cercles ghost des positions N-1 */}
      <g opacity={0.45}>
        {(Object.entries(prevOff) as [AttackerId, Point][]).map(([id, pos]) => (
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
        {(Object.entries(prevDef) as [DefenderId, ComputedDefense[DefenderId]][]).map(([id, p]) => (
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

      {/* Flèches fines N-1 → N pour les joueurs qui ont bougé */}
      {curOff && curDef && (
        <g opacity={0.5}>
          {(Object.entries(prevOff) as [AttackerId, Point][]).map(([id, p1]) => {
            const p2 = curOff[id];
            if (!p2) return null;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const d = Math.hypot(dx, dy);
            if (d < 5) return null;
            // Décale le départ et l'arrivée pour ne pas pénétrer les cercles
            const t1 = r / d;
            const t2 = 1 - (r + 4) / d;
            return (
              <line
                key={`ghost-arrow-o-${id}`}
                x1={p1.x + dx * t1}
                y1={p1.y + dy * t1}
                x2={p1.x + dx * t2}
                y2={p1.y + dy * t2}
                stroke="#D85A30"
                strokeWidth={1.5}
                strokeDasharray="2 3"
                markerEnd="url(#ghost-arrow-off)"
              />
            );
          })}
          {(Object.entries(prevDef) as [DefenderId, ComputedDefense[DefenderId]][]).map(([id, p1]) => {
            const p2 = curDef[id];
            if (!p2) return null;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const d = Math.hypot(dx, dy);
            if (d < 5) return null;
            const t1 = r / d;
            const t2 = 1 - (r + 4) / d;
            return (
              <line
                key={`ghost-arrow-d-${id}`}
                x1={p1.x + dx * t1}
                y1={p1.y + dy * t1}
                x2={p1.x + dx * t2}
                y2={p1.y + dy * t2}
                stroke="#378ADD"
                strokeWidth={1.5}
                strokeDasharray="2 3"
                markerEnd="url(#ghost-arrow-def)"
              />
            );
          })}
        </g>
      )}
    </g>
  );
}
