// Couche 5.5 — Bump auto sur cutters (B10).
//
// Quand un cut hors-ballon est détecté (`detectCuts`), un défenseur sur la
// trajectoire prev → cur du cutter peut faire un **léger contact** pour
// ralentir l'attaquant. C'est la réaction défensive standard sur un cut
// non-marqué : "bump and recover" — pas un switch, juste un toucher.
//
// Critères pour qu'un défenseur soit retenu comme "bumper" :
//   - distance perpendiculaire à la ligne prev→cur du cutter ≤ 40 px
//   - PAS le défenseur naturel du cutter (qui suit déjà directement)
//   - PAS engagé en aide active (`helpFactor` < 0.3)
//   - PAS en rotation PnR (`pnrRole` undefined)
//
// Le défenseur retenu reçoit un offset de 12 px vers la position courante
// du cutter (effet de "léger contact").
//
// V1 — opt-in via `state.autoBumpCutters` (default false, rétrocompat).
// Si activé, peut bumper au maximum 1 défenseur par cut détecté.

import type { AttackerId, AttackerPositions, DefenderId, Matchups, Point } from '../../types';
import { distance, pointToSegmentDistance } from '../geometry';
import { detectCuts } from '../threatResolution';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';
import {
  CUTTER_BUMP_MAX_PERP_DIST_PX as MAX_PERP_DIST_PX,
  CUTTER_BUMP_OFFSET_PX as BUMP_OFFSET_PX,
  CUTTER_BUMP_HELP_BUSY_THRESHOLD as HELP_BUSY_THRESHOLD,
} from './constants';

export function applyCutterBumpLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  if (!ctx.state.autoBumpCutters) return;
  if (!ctx.prevOff) return; // detectCuts a besoin de prevOff

  const { off, ballCarrier, hoop, defenderIds } = ctx;

  // Format defPos attendu par detectCuts (Record<DefenderId, Point>).
  const defPosForCuts: Record<string, Point> = {};
  defenderIds.forEach((dId) => {
    defPosForCuts[dId] = { x: positions[dId].x, y: positions[dId].y };
  });

  const cuts = detectCuts(
    off,
    ctx.prevOff,
    ballCarrier,
    hoop,
    defPosForCuts,
    matchups
  );

  for (const cut of cuts) {
    const prevCutterPos = ctx.prevOff[cut.cutter as AttackerId];
    const curCutterPos = off[cut.cutter as AttackerId];
    if (!prevCutterPos || !curCutterPos) continue;
    // Cut court = ne crée pas vraiment de trajectoire à bumper.
    if (distance(prevCutterPos, curCutterPos) < 20) continue;

    // Cutter defender via matchups (peut être null si activé hors player count).
    let cutterDef: DefenderId | null = null;
    (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, a]) => {
      if (a === (cut.cutter as AttackerId)) cutterDef = d;
    });

    // Trouve le meilleur candidat (le plus proche perpendiculairement, max 1).
    let bestBumper: DefenderId | null = null;
    let bestPerp = Infinity;
    for (const dId of defenderIds) {
      if (dId === cutterDef) continue; // déjà le marqueur direct
      const target = positions[dId];
      if (!target) continue;
      if ((target.helpFactor ?? 0) > HELP_BUSY_THRESHOLD) continue;
      if (target.pnrRole) continue;
      const perp = pointToSegmentDistance(
        { x: target.x, y: target.y },
        prevCutterPos,
        curCutterPos
      );
      if (perp > MAX_PERP_DIST_PX) continue;
      if (perp < bestPerp) {
        bestPerp = perp;
        bestBumper = dId;
      }
    }

    if (!bestBumper) continue;

    // Applique l'offset vers la position courante du cutter.
    const bumper = positions[bestBumper];
    const toCutterX = curCutterPos.x - bumper.x;
    const toCutterY = curCutterPos.y - bumper.y;
    const len = Math.hypot(toCutterX, toCutterY);
    if (len < 1) continue;
    bumper.x = Math.round(bumper.x + (toCutterX / len) * BUMP_OFFSET_PX);
    bumper.y = Math.round(bumper.y + (toCutterY / len) * BUMP_OFFSET_PX);
  }
}

// Pour les tests : référence aux constantes internes.
export const _internals = { MAX_PERP_DIST_PX, BUMP_OFFSET_PX, HELP_BUSY_THRESHOLD };

// AttackerPositions importé pour le typage côté detectCuts (compat).
type _Used = AttackerPositions;
