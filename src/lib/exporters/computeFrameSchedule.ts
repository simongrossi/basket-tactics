// E.2 — Cadencement d'un export : combien de frames et quel pas en `t` step.
// Pur, déterministe, sans dépendance DOM/React.

export interface FrameScheduleInput {
  /** Durée totale du système en secondes (1× canonique). */
  totalSeconds: number;
  /** Dernier step réel (state.steps.length - 1). */
  lastStepIdx: number;
  /** Images par seconde de l'export. */
  fps: number;
}

export interface FrameSchedule {
  /** Nombre total de frames à produire (>= 1). */
  frameCount: number;
  /** Incrément de `t` step entre deux frames consécutives. */
  dt: number;
}

export function computeFrameSchedule(input: FrameScheduleInput): FrameSchedule {
  const totalSeconds = Math.max(0, input.totalSeconds);
  const lastStepIdx = Math.max(0, input.lastStepIdx);
  const fps = Math.max(1, input.fps);
  const frameCount = Math.max(1, Math.ceil(totalSeconds * fps));
  const dt = frameCount > 1 ? lastStepIdx / (frameCount - 1) : 0;
  return { frameCount, dt };
}
