// Règle 3ter — Écrans non-porteur (P4).
//
// Détecte les enchaînements (stagger, elevator, flex, hammer) ET signale
// les défenseurs late sur ces actions. Vocabulaire coach : "chase late on
// shooter", "hammer baseline ouvert", "stagger : prendre le 2ᵉ écran
// agressivement".
//
// Skipée intégralement en zone defense.

import type { AttackerId, DefenderId, Point } from '../../../types';
import { getMatchupsAt } from '../../engine';
import { detectOffBallScreens } from '../../screens';
import type { CoachDiagnostic, Rule } from '../types';
import { isOutsideThreat, withProfile } from '../helpers';

export const offBallScreensRule: Rule = (ctx) => {
  const { state, stepIdx, off, carrier, defPos, defenderIds, profiles } = ctx;
  if (state.defenseSystem !== 'man') return [];

  const matchupsAt = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);
  const prevDefMap: Record<DefenderId, Point> = {} as Record<DefenderId, Point>;
  defenderIds.forEach((d) => {
    prevDefMap[d] = { x: defPos[d].x, y: defPos[d].y };
  });

  const offBallScreens = detectOffBallScreens(off, carrier, matchupsAt, prevDefMap, state.screenRadius);
  const out: CoachDiagnostic[] = [];

  offBallScreens.forEach((obs) => {
    const cutterLabel = withProfile(obs.cutter, profiles?.[obs.cutter]);
    const cutterDef = defPos[obs.cutterDef];
    const cutterIsShooter = isOutsideThreat(profiles?.[obs.cutter]);
    const cutterDefLate = cutterDef?.late === true;

    switch (obs.type) {
      case 'stagger':
        out.push({
          id: `stagger-${obs.cutter}`,
          severity: cutterDefLate ? 'critical' : 'info',
          message: cutterDefLate
            ? `Stagger sur ${cutterLabel} : ${obs.cutterDef} en retard, double écran efficace`
            : `Stagger sur ${cutterLabel} : ${obs.cutterDef} doit chase agressif sur les 2 écrans`,
          tag: 'stagger',
          defenders: [obs.cutterDef, obs.screenerDef, obs.secondScreenerDef].filter(Boolean) as DefenderId[],
          attackers: [obs.cutter, obs.screener, obs.secondScreener].filter(Boolean) as AttackerId[],
        });
        break;
      case 'elevator':
        out.push({
          id: `elevator-${obs.cutter}`,
          severity: 'critical',
          message: `Elevator sur ${cutterLabel} : couloir entre ${obs.screener} et ${obs.secondScreener} — switch obligatoire`,
          tag: 'elevator',
          defenders: [obs.cutterDef, obs.screenerDef, obs.secondScreenerDef].filter(Boolean) as DefenderId[],
          attackers: [obs.cutter, obs.screener, obs.secondScreener].filter(Boolean) as AttackerId[],
        });
        break;
      case 'hammer':
        out.push({
          id: `hammer-${obs.cutter}`,
          severity: cutterIsShooter ? 'critical' : 'warning',
          message: cutterIsShooter
            ? `Hammer baseline : ${cutterLabel} libère un 3 corner faible — fermer impérativement`
            : `Hammer baseline sur ${cutterLabel} — coupe arrière côté faible`,
          tag: 'hammer',
          defenders: [obs.cutterDef, obs.screenerDef],
          attackers: [obs.cutter, obs.screener],
        });
        break;
      case 'flex':
        out.push({
          id: `flex-${obs.cutter}`,
          severity: 'warning',
          message: `Flex baseline : ${cutterLabel} coupe corner→corner — bumper obligatoire`,
          tag: 'flex',
          defenders: [obs.cutterDef, obs.screenerDef],
          attackers: [obs.cutter, obs.screener],
        });
        break;
      case 'pindown':
      case 'flare':
      case 'backscreen':
        // Diagnostics légers seulement si le défenseur du cutter est late.
        if (cutterDefLate) {
          const typeLabel =
            obs.type === 'pindown' ? 'pindown' :
            obs.type === 'flare' ? 'flare' : 'backscreen';
          out.push({
            id: `offball-late-${obs.cutter}`,
            severity: cutterIsShooter ? 'critical' : 'warning',
            message: `${typeLabel} sur ${cutterLabel} : ${obs.cutterDef} en retard${cutterIsShooter ? ' — tir 3 ouvert' : ''}`,
            tag: `offball-${obs.type}-late`,
            defenders: [obs.cutterDef, obs.screenerDef],
            attackers: [obs.cutter, obs.screener],
          });
        }
        break;
    }
  });

  return out;
};
