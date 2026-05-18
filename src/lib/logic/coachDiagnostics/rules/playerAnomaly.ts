// K.6 — Règle coach d'anomalies de comportement joueur.
//
// Branche les détecteurs purs K.1 / K.2 / K.3 sur le pipeline coach.
// Active seulement si `state.anomalyDetectionEnabled === true` (opt-in
// strict pour éviter de polluer le panneau coach des scénarios standard).
//
// K.4 (flicker) et K.5 (gaze) ne sont pas branchées ici : K.4 nécessite
// 3 frames consécutives (incompatible avec l'API "step-by-step" du
// pipeline coach), K.5 nécessite les visuels orientés (calculés au render,
// pas dans coachDiagnostics).

import {
  detectTeleport,
  detectAberrantSpeed,
  detectDetachedDefenders,
  flattenDefPos,
  type FrameSnapshot,
} from '../../anomaly/anomalyDetector';
import type { AnomalyReport } from '../../anomaly/types';
import { effectiveDefensePositions } from '../../engine';
import { activeOffense } from '../../players';
import type { CoachDiagnostic, CoachSeverity, Rule } from '../types';

function mapSeverity(s: AnomalyReport['severity']): CoachSeverity {
  if (s === 'critical') return 'critical';
  if (s === 'warning') return 'warning';
  return 'info';
}

function reportToDiagnostic(r: AnomalyReport): CoachDiagnostic {
  const isDefender = r.playerId.startsWith('D');
  return {
    id: `anomaly-${r.kind}-${r.playerId}-${r.stepIdx}`,
    severity: mapSeverity(r.severity),
    message: r.message,
    tag: `anomaly-${r.kind}`,
    defenders: isDefender ? [r.playerId as 'D1'] : [],
    attackers: isDefender ? [] : [r.playerId as 'O1'],
  };
}

export const playerAnomalyRule: Rule = (ctx) => {
  const { state, stepIdx, defPos, off } = ctx;
  if (!state.anomalyDetectionEnabled) return [];

  const reports: AnomalyReport[] = [];

  // K.3 — décroché : single-frame, valable uniquement en man-to-man.
  if (state.defenseSystem === 'man') {
    reports.push(...detectDetachedDefenders(off, defPos, stepIdx));
  }

  // K.1 + K.2 — nécessitent un step précédent.
  if (stepIdx >= 1) {
    const prevStep = state.steps[stepIdx - 1];
    if (prevStep) {
      const prevOff = activeOffense(prevStep.off, state.playerCount);
      const prevDef = effectiveDefensePositions(state, stepIdx - 1);
      const prev: FrameSnapshot = {
        off: prevOff,
        defPos: flattenDefPos(prevDef),
        stepIdx: stepIdx - 1,
      };
      const cur: FrameSnapshot = {
        off,
        defPos: flattenDefPos(defPos),
        stepIdx,
      };
      reports.push(...detectTeleport(prev, cur));
      reports.push(...detectAberrantSpeed(prev, cur, state.defenseMaxSpeed, state.rules));
    }
  }

  return reports.map(reportToDiagnostic);
};
