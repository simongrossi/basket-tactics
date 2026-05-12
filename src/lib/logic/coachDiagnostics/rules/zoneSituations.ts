// Règle 3bis — Diagnostics spécifiques à la défense de zone (P3).
//
//  - overload côté ballon (3+ attaquants d'un même côté)
//  - short corner / high post non couverts (zones critiques en zone)
//  - skip pass : rotation en retard détectée
//
// Skipée intégralement en man defense.

import type { DefenderId } from '../../../types';
import { activeBallCarrier, activeOffense } from '../../players';
import { distance } from '../../geometry';
import { detectOverload, detectSkipPass, findCriticalZoneAttackers } from '../../zoneSituations';
import type { CoachDiagnostic, Rule } from '../types';
import { withProfile } from '../helpers';

export const zoneSituationsRule: Rule = (ctx) => {
  const { state, stepIdx, off, carrier, defPos, defenderIds, hoop, profiles } = ctx;
  if (state.defenseSystem !== 'zone') return [];

  const out: CoachDiagnostic[] = [];

  // ----- Overload -----
  const overload = detectOverload(off, carrier, hoop);
  if (overload.intensity > 0) {
    const sideLabel = overload.side === -1 ? 'gauche' : 'droite';
    out.push({
      id: 'zone-overload',
      severity: overload.intensity >= 1 ? 'warning' : 'info',
      message: `Overload côté ${sideLabel} (${overload.count} attaquants) — la zone doit glisser fort`,
      tag: 'zone-overload',
      defenders: [],
      attackers: [],
    });
  }

  // ----- Short corner / high post -----
  const critical = findCriticalZoneAttackers(off, hoop);
  critical.forEach((c) => {
    // Trouve le défenseur le plus proche.
    let nearestDef: DefenderId | null = null;
    let nearestDist = Infinity;
    defenderIds.forEach((dId) => {
      const d = defPos[dId];
      const dd = distance({ x: d.x, y: d.y }, c.pos);
      if (dd < nearestDist) {
        nearestDist = dd;
        nearestDef = dId;
      }
    });
    const oLabel = withProfile(c.attackerId, profiles?.[c.attackerId]);
    const zoneLabel = c.zone === 'short-corner' ? 'short corner' : 'high post';
    if (nearestDist > 100) {
      out.push({
        id: `critical-zone-${c.attackerId}`,
        severity: 'critical',
        message: `${zoneLabel} ouvert : ${oLabel} sans défenseur proche (${Math.round(nearestDist)}px)`,
        tag: c.zone === 'short-corner' ? 'short-corner-open' : 'high-post-open',
        defenders: nearestDef ? [nearestDef] : [],
        attackers: [c.attackerId],
      });
    } else if (nearestDist > 60) {
      out.push({
        id: `critical-zone-soft-${c.attackerId}`,
        severity: 'warning',
        message: `${zoneLabel} : ${oLabel} mou couvert par ${nearestDef ?? '?'} (${Math.round(nearestDist)}px)`,
        tag: c.zone === 'short-corner' ? 'short-corner-soft' : 'high-post-soft',
        defenders: nearestDef ? [nearestDef] : [],
        attackers: [c.attackerId],
      });
    }
  });

  // ----- Skip pass : entre prev step et current -----
  const prevStep = stepIdx > 0 ? state.steps[stepIdx - 1] : null;
  const skip = prevStep
    ? detectSkipPass(
        activeOffense(prevStep.off, state.playerCount),
        off,
        activeBallCarrier(prevStep, state.playerCount),
        carrier,
        hoop
      )
    : null;
  if (skip) {
    // Y a-t-il des défenseurs late ? La rotation est en retard si oui.
    const lateCount = defenderIds.filter((dId) => defPos[dId]?.late).length;
    if (lateCount >= 2) {
      out.push({
        id: 'skip-rotation-late',
        severity: 'critical',
        message: `Skip pass — ${lateCount} défenseurs en retard sur la rotation`,
        tag: 'skip-rotation-late',
        defenders: defenderIds.filter((dId) => defPos[dId]?.late),
        attackers: [carrier],
      });
    } else if (lateCount === 1) {
      out.push({
        id: 'skip-rotation-soft',
        severity: 'warning',
        message: `Skip pass — 1 défenseur en retard, fermer la ligne suivante`,
        tag: 'skip-rotation-soft',
        defenders: defenderIds.filter((dId) => defPos[dId]?.late),
        attackers: [carrier],
      });
    } else {
      out.push({
        id: 'skip-rotation-ok',
        severity: 'good',
        message: `Skip pass : zone tournée à temps`,
        tag: 'skip-rotation-ok',
        defenders: [],
        attackers: [carrier],
      });
    }
  }

  return out;
};
