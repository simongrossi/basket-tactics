// Règle 2.e — Matchup orphans.
//
// Un défenseur perdu en aide loin de son homePos ET son matchup naturel
// n'est plus couvert → signal au coach que la rotation a un trou ou qu'un
// défenseur n'est pas revenu.
//
// Cf. `detectMatchupOrphans` dans `threatResolution.ts`.

import type { DefenderId } from '../../../types';
import { initialDef, baseMatchups } from '../../../data/initial';
import { detectMatchupOrphans } from '../../threatResolution';
import type { CoachDiagnostic, Rule } from '../types';
import { isOutsideThreat, withProfile } from '../helpers';

export const matchupOrphansRule: Rule = (ctx) => {
  const { state, stepIdx, off, defPos, defenderIds, profiles } = ctx;

  const defPosForOrphans: Record<string, { x: number; y: number }> = {};
  const homePosForOrphans: Record<string, { x: number; y: number }> = {};
  defenderIds.forEach((dId: DefenderId) => {
    defPosForOrphans[dId] = { x: defPos[dId].x, y: defPos[dId].y };
    const home = state.defenseInitial[dId] ?? initialDef[dId];
    if (home) homePosForOrphans[dId] = { x: home.x, y: home.y };
  });

  const orphans = detectMatchupOrphans(off, defPosForOrphans, homePosForOrphans, baseMatchups);
  const out: CoachDiagnostic[] = [];

  orphans.forEach((o) => {
    const oLabel = withProfile(o.naturalAttacker, profiles?.[o.naturalAttacker]);
    out.push({
      id: `matchup-orphan-${o.defender}-${stepIdx}`,
      severity: isOutsideThreat(profiles?.[o.naturalAttacker]) ? 'critical' : 'warning',
      message: isOutsideThreat(profiles?.[o.naturalAttacker])
        ? `${o.defender} en aide loin de ${oLabel} (tireur libre à ${Math.round(o.closestDefDistance)}px)`
        : `${o.defender} en aide à ${Math.round(o.defDisplacement)}px de son home — ${oLabel} non couvert`,
      tag: 'matchup-orphan',
      defenders: [o.defender],
      attackers: [o.naturalAttacker],
    });
  });

  return out;
};
