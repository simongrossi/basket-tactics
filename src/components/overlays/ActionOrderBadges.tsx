import type { AttackerId, Step } from '@/lib/types';

/**
 * Petits ronds numérotés 1, 2, 3… placés au pied du joueur initiateur de
 * chaque annotation, dans l'ordre où les actions sont enregistrées sur
 * l'étape. Permet de lire le séquencement sans comparer N et N+1.
 *
 * Si un même joueur initie plusieurs annotations sur l'étape, ses numéros
 * sont empilés horizontalement (1 puis 2 à côté).
 *
 * Utilisé dans `StepThumbnail` (vignettes PDF) et dans `CourtView` (vue
 * d'édition, gated par `state.showActionOrder`).
 */
export function ActionOrderBadges({ step }: { step: Step }) {
  const offsetByActor: Partial<Record<AttackerId, number>> = {};
  return (
    <g pointerEvents="none">
      {step.annotations.map((a, i) => {
        const pos = step.off[a.fromId];
        if (!pos) return null;
        const stackIndex = offsetByActor[a.fromId] ?? 0;
        offsetByActor[a.fromId] = stackIndex + 1;
        const cx = pos.x - 18 + stackIndex * 14;
        const cy = pos.y + 18;
        return (
          <g key={`order-${i}`}>
            <circle cx={cx} cy={cy} r={7} fill="#1e293b" stroke="#fff" strokeWidth={1.5} />
            <text
              x={cx}
              y={cy + 3.2}
              textAnchor="middle"
              fill="#fff"
              fontSize={9}
              fontWeight={700}
            >
              {i + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
}
