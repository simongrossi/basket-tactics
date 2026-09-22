import type { AttackerId } from '../../../types';
import { MOVEMENT_WARNING_SPEED_MPS, pxToMeters } from '../../../data/physics';
import { effectiveDefensePositions } from '../../engine';
import { attackerTrajectoryAt } from '../../playbackTrajectory';
import { resolveAnnotationTiming } from '../../annotationTiming';
import { fullStepToSeconds, getStepDurationSeconds } from '../../timecode';
import { getActiveAttackerIds } from '../../players';
import { distance } from '../../geometry';
import { resolveRealismFlags } from '../../realismProfile';
import type { CoachDiagnostic, Rule, RuleContext } from '../types';
import { realStepIndices } from '../../playback/realSteps';

/** Diagnostic of requested motion, before collision/snap limiters can hide an
 * impossible arrival. This is a speed warning, not an athletic certification:
 * acceleration, fatigue and defensive detours can require additional time.
 */
export const movementDurationRule: Rule = (ctx) => {
  const reals = realStepIndices(ctx.state.steps);
  if (reals.length < 2) return [];
  let transition = 0;
  while (transition + 1 < reals.length - 1 && reals[transition + 1] <= ctx.stepIdx) transition++;
  const duration = getStepDurationSeconds(ctx.state, reals[transition]);
  const byPlayer = new Map<string, CoachDiagnostic>();
  for (let source = reals[transition]; source < reals[transition + 1]; source++) {
    for (const diagnostic of segmentWarnings(ctx, source, transition, duration)) {
      const player = [...diagnostic.attackers, ...diagnostic.defenders][0];
      if (!byPlayer.has(player)) byPlayer.set(player, diagnostic);
    }
  }
  return [...byPlayer.values()];
};

function segmentWarnings({ state, defenderIds }: RuleContext, source: number, transition: number, duration: number): CoachDiagnostic[] {
  const seconds = fullStepToSeconds(state, source + 1) - fullStepToSeconds(state, source);
  if (!(seconds > 0)) return [];
  const out: CoachDiagnostic[] = [];
  const realism = resolveRealismFlags(state);
  const warn = (id: string, speed: number, attacker?: AttackerId) => {
    if (!Number.isFinite(speed) || speed <= MOVEMENT_WARNING_SPEED_MPS * 1.01) return;
    out.push({
      id: `movement-duration-${id}-${source}`,
      tag: 'movement-duration', severity: 'warning',
      message: `${id} — transition ${transition + 1} → ${transition + 2} (${duration.toFixed(2)} s) : ${attacker ? 'pointe demandée ≈' : 'vitesse minimale'} ${speed.toFixed(1)} m/s, au-delà du repère du modèle (${MOVEMENT_WARNING_SPEED_MPS} m/s). Allonger la durée${attacker ? ' ou la fenêtre de l’action' : ''}, ou raccourcir le trajet.`,
      attackers: attacker ? [attacker] : [],
      defenders: attacker ? [] : defenderIds.filter(d => d === id),
    });
  };
  for (const id of getActiveAttackerIds(state.playerCount)) {
    // Include annotation boundaries so even a very short action window cannot
    // disappear between samples. Sampling uses the renderer's trajectory helper
    // (waypoints, sprint, stale annotations and screen arrival included).
    const times = new Set(Array.from({ length: 121 }, (_, i) => i / 120));
    for (const index of [source, source + 1]) {
      for (const ann of state.steps[index].annotations) {
        if (ann.fromId !== id || !['cut', 'dribble', 'screen'].includes(ann.type)) continue;
        const timing = resolveAnnotationTiming(ann, getStepDurationSeconds(state, index));
        const start = Math.max(0, index - source + timing.tStart);
        const end = Math.min(1, index - source + timing.tEnd);
        if (!Number.isFinite(start + end) || end <= start) continue;
        for (let i = 0; i <= 20; i++) times.add(start + (end - start) * i / 20);
      }
    }
    let previous: { t: number; point: { x: number; y: number } } | undefined;
    let peak = 0;
    for (const t of [...times].sort((a, b) => a - b)) {
      const point = attackerTrajectoryAt(state.steps, source, id, t,
        index => getStepDurationSeconds(state, index), {
          enabled: realism.attackerVelocityProfileEnabled,
          tierFor: player => state.attackerSpeedProfiles?.[player],
          durationSec: getStepDurationSeconds(state, source),
          accelerationEnabled: realism.attackerAccelerationEnabled,
          acceleration: realism.attackerAcceleration,
          momentumEnabled: realism.attackerMomentumEnabled,
          momentum: realism.attackerMomentum,
        }).position;
      if (previous && t - previous.t > 1e-8) {
        peak = Math.max(peak, pxToMeters(distance(previous.point, point)) / ((t - previous.t) * seconds));
      }
      previous = { t, point };
    }
    warn(id, peak, id);
  }
  // Endpoint distance is a conservative lower bound for the defensive route.
  // Legacy maxSpeed is px/step, so it must not be mistaken for a m/s limit.
  const before = effectiveDefensePositions(state, source);
  const after = effectiveDefensePositions(state, source + 1);
  for (const id of defenderIds) warn(id, pxToMeters(distance(before[id], after[id])) / seconds);
  return out;
}
