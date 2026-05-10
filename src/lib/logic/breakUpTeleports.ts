import type { AttackerId, AttackerPositions, Step } from '../types';

/**
 * Décompose les "téléports" entre steps consécutifs : si un joueur bouge plus
 * que `maxPxPerStep` (~2.7 m) entre deux steps, on insère un ou plusieurs
 * steps intermédiaires avec positions interpolées linéairement.
 *
 * Préserve :
 *  - `manualOverride: true` → on n'altère pas la position de destination,
 *    mais on interpole quand même le trajet pour y arriver.
 *  - annotations → restent sur le step de destination (où l'action se conclut).
 *  - ballCarrier → les intermédiaires héritent du carrier du step PRÉCÉDENT
 *    (la balle n'a pas encore changé de mains avant la passe).
 *  - generatedBy → propagé sur les intermédiaires.
 *
 * Utilisé après `compileScenario` pour lisser les sorties de générateurs FIBA
 * qui placent les joueurs en un coup (back-screen, plonge, cut profond).
 */
export function breakUpTeleports(steps: Step[], maxPxPerStep = 100): Step[] {
  if (steps.length < 2) return steps;
  const result: Step[] = [steps[0]];

  for (let i = 1; i < steps.length; i++) {
    const prev = result[result.length - 1];
    const cur = steps[i];

    const playerIds = Object.keys(cur.off) as AttackerId[];
    let maxDist = 0;
    playerIds.forEach((id) => {
      const p = prev.off[id];
      const c = cur.off[id];
      if (!p || !c) return;
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d > maxDist) maxDist = d;
    });

    const segments = Math.max(1, Math.ceil(maxDist / maxPxPerStep));
    if (segments <= 1) {
      result.push(cur);
      continue;
    }

    // Insère segments-1 steps intermédiaires.
    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      const interpolatedOff = {} as AttackerPositions;
      playerIds.forEach((id) => {
        const p = prev.off[id];
        const c = cur.off[id];
        if (!p || !c) return;
        interpolatedOff[id] = {
          x: Math.round(p.x + (c.x - p.x) * t),
          y: Math.round(p.y + (c.y - p.y) * t),
        };
      });
      // Intermediate step : carrier du prev (la balle n'a pas encore commuté),
      // pas d'annotations (réservées au step terminal), même generatedBy.
      result.push({
        off: interpolatedOff,
        ballCarrier: prev.ballCarrier,
        annotations: [],
        generatedBy: cur.generatedBy,
        // Propage les directives défensives du step terminal pour que la
        // couverture (trap, switch, etc.) reste active pendant le déplacement.
        defensiveDirectives: cur.defensiveDirectives,
        assignmentOverrides: cur.assignmentOverrides,
        isInterpolated: true,
      });
    }

    result.push(cur);
  }

  return result;
}
