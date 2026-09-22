// Poursuite défensive V4 — modulateurs d'accélération en LECTURE.
// Mêmes règles que la poursuite au drag (useCourtFrame, V2/V3), appliquées à
// la rampe d'accélération P3.1 : un défenseur lent, qui doit reculer ou qui
// ne voit pas son homme démarre moins vite ; un défenseur élite, bien orienté
// et qui voit son homme, plus vite. La fatigue n'est pas reprise : sur une
// possession, le seuil du drag (≈ 8 m) serait atteint par tous en quelques
// secondes — elle relève du match simulé.

export type DefenderSpeedProfile = 'elite' | 'standard' | 'lent' | undefined;

/** Écart angulaire absolu (0..180°) entre deux caps en degrés. */
function angleGap(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export interface PursuitModulatorInput {
  profile: DefenderSpeedProfile;
  /** Cap du déplacement voulu (degrés, 0 = vers le haut du terrain). */
  moveDeg?: number;
  /** Orientation du corps du défenseur (même convention). */
  bodyDeg?: number;
  /** Orientation du regard du défenseur. */
  gazeDeg?: number;
  /** Cap du défenseur vers son homme. */
  toManDeg?: number;
}

export function pursuitAccelerationMultiplier(input: PursuitModulatorInput): number {
  const profile = input.profile === 'elite' ? 1.3 : input.profile === 'lent' ? 0.7 : 1;
  let footwork = 1;
  if (input.moveDeg != null && input.bodyDeg != null) {
    const gap = angleGap(input.moveDeg, input.bodyDeg);
    if (gap > 90) footwork = 0.6; // course arrière
    else if (gap > 60) footwork = 0.7; // pas chassés latéraux
  }
  let gaze = 1;
  if (input.gazeDeg != null && input.toManDeg != null) {
    const gap = angleGap(input.toManDeg, input.gazeDeg);
    if (gap < 60) gaze = 1.2; // voit son homme partir
    else if (gap > 120) gaze = 0.7; // pris à contre-pied
  }
  return profile * footwork * gaze;
}

/** Cap (degrés, 0 = haut du terrain) d'un vecteur, convention des sprites. */
export function headingDeg(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}
