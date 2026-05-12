// Règle 2.c — Attaque ligne de fond (man + zone).
//
// Le porteur dans la bande baseline (deep corner / short corner) avec :
//   - phase 'driving'  → mouvement actif vers le panier
//   - phase 'static'   → posté en position d'attaque imminente
//
// Cas couverts :
//  - uncovered + driving → ligne de fond ouverte ('critical' si threat, sinon 'warning')
//  - uncovered + static  → posté sans pression ('info')
//  - covered  + late     → closeout baseline en retard ('warning')
//  - covered  + driving  → ligne de fond fermée ('good')

import { detectBaselineDrive } from '../../baselineDrive';
import type { CoachDiagnostic, Rule } from '../types';
import { isOutsideThreat, withProfile } from '../helpers';

export const baselineDriveRule: Rule = (ctx) => {
  const { state, stepIdx, profiles } = ctx;
  const baseline = detectBaselineDrive(state, stepIdx);
  if (!baseline) return [];

  const sideLabel = baseline.side === -1 ? 'G' : 'D';
  const oLabel = withProfile(baseline.carrier, profiles?.[baseline.carrier]);
  const closerLabel = baseline.closer
    ? `${baseline.closer.id} à ${Math.round(baseline.closer.perpDist)}px`
    : 'aucun défenseur proche';

  const out: CoachDiagnostic[] = [];

  if (baseline.uncovered && baseline.phase === 'driving') {
    const isThreat = isOutsideThreat(profiles?.[baseline.carrier])
      || profiles?.[baseline.carrier] === 'slasher';
    out.push({
      id: `baseline-drive-open-${baseline.carrier}`,
      severity: isThreat ? 'critical' : 'warning',
      message: isThreat
        ? `Ligne de fond ouverte : ${oLabel} attaque corner ${sideLabel} — ${closerLabel}`
        : `Ligne de fond non fermée côté ${sideLabel} : ${oLabel} pénètre — ${closerLabel}`,
      tag: 'baseline-drive-open',
      defenders: baseline.closer ? [baseline.closer.id] : [],
      attackers: [baseline.carrier],
    });
  } else if (baseline.uncovered && baseline.phase === 'static') {
    out.push({
      id: `baseline-drive-soft-${baseline.carrier}`,
      severity: 'info',
      message: `${oLabel} posté côté ${sideLabel} en zone baseline — ${closerLabel}`,
      tag: 'baseline-drive-soft',
      defenders: baseline.closer ? [baseline.closer.id] : [],
      attackers: [baseline.carrier],
    });
  } else if (!baseline.uncovered && baseline.closer?.late) {
    out.push({
      id: `baseline-drive-late-${baseline.carrier}`,
      severity: 'warning',
      message: `Closeout baseline en retard : ${baseline.closer.id} sur ${oLabel}`,
      tag: 'baseline-drive-late',
      defenders: [baseline.closer.id],
      attackers: [baseline.carrier],
    });
  } else if (!baseline.uncovered && baseline.phase === 'driving' && baseline.closer) {
    out.push({
      id: `baseline-drive-closed-${baseline.carrier}`,
      severity: 'good',
      message: `Ligne de fond fermée par ${baseline.closer.id} sur ${oLabel}`,
      tag: 'baseline-drive-closed',
      defenders: [baseline.closer.id],
      attackers: [baseline.carrier],
    });
  }

  return out;
};
