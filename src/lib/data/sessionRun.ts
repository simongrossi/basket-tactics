// U05 — déroulé d'une séance sur le terrain. État purement UI (hors AppState,
// hors undo) : séance et bloc en cours, minuteur du bloc. Persisté à part pour
// qu'un rechargement de la page retrouve le même bloc et le même minuteur.
//
// Toutes les fonctions sont PURES ; le temps (`now`, en ms) est injecté.

import type { PracticeSession, SessionBlock } from './practiceSessions';

export interface BlockTimer {
  /** Temps écoulé cumulé lors des phases de marche déjà terminées. */
  elapsedMs: number;
  /** Début de la phase de marche en cours, null si en pause. */
  runningSince: number | null;
}

export interface SessionRun {
  sessionId: string;
  blockIndex: number;
  timer: BlockTimer;
  /** Le brouillon du coach a été mis de côté (copie de récupération) au
   *  premier bloc chargé ; il sera restauré en fin de déroulé. */
  draftProtected: boolean;
}

export const SESSION_RUN_STORAGE_KEY = 'bt:session-run:v1';

const STOPPED: BlockTimer = { elapsedMs: 0, runningSince: null };

export function startRun(sessionId: string, blockIndex = 0): SessionRun {
  return { sessionId, blockIndex: Math.max(0, blockIndex), timer: STOPPED, draftProtected: false };
}

export function timerElapsedMs(timer: BlockTimer, now: number): number {
  return timer.elapsedMs + (timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince));
}

export function isTimerRunning(timer: BlockTimer): boolean {
  return timer.runningSince !== null;
}

export function startTimer(timer: BlockTimer, now: number): BlockTimer {
  return timer.runningSince === null ? { ...timer, runningSince: now } : timer;
}

export function pauseTimer(timer: BlockTimer, now: number): BlockTimer {
  return timer.runningSince === null ? timer : { elapsedMs: timerElapsedMs(timer, now), runningSince: null };
}

export function resetTimer(): BlockTimer {
  return STOPPED;
}

/** Temps restant du bloc en ms ; négatif = dépassement. */
export function blockRemainingMs(block: SessionBlock, timer: BlockTimer, now: number): number {
  return Math.max(0, block.durationMin || 0) * 60_000 - timerElapsedMs(timer, now);
}

/** `12:05`, ou `+01:30` en dépassement. */
export function formatCountdown(remainingMs: number): string {
  const over = remainingMs < 0;
  const totalSec = over ? Math.floor(-remainingMs / 1000) : Math.ceil(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${over ? '+' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Ce que le terrain doit afficher pour un bloc. */
export type BlockVisual =
  | { kind: 'system'; systemId: string }
  | { kind: 'template'; templateId: string }
  | { kind: 'none' };

export function blockVisual(block: SessionBlock, systemExists: (id: string) => boolean): BlockVisual {
  if (block.kind === 'system' && block.systemId && systemExists(block.systemId)) {
    return { kind: 'system', systemId: block.systemId };
  }
  if (block.templateId) return { kind: 'template', templateId: block.templateId };
  return { kind: 'none' };
}

/** Rattache un déroulé à sa séance : null si la séance ou tous ses blocs
 *  ont disparu ; index ramené dans les bornes si des blocs ont été retirés. */
export function reconcileRun(run: SessionRun | null, sessions: PracticeSession[]): SessionRun | null {
  if (!run) return null;
  const session = sessions.find((s) => s.id === run.sessionId);
  if (!session || session.blocks.length === 0) return null;
  if (run.blockIndex < session.blocks.length) return run;
  return { ...run, blockIndex: session.blocks.length - 1, timer: STOPPED };
}

export function parseSessionRun(raw: string | null): SessionRun | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SessionRun>;
    if (typeof v.sessionId !== 'string' || typeof v.blockIndex !== 'number') return null;
    const t = v.timer;
    const timer: BlockTimer = t && typeof t.elapsedMs === 'number'
      ? { elapsedMs: Math.max(0, t.elapsedMs), runningSince: typeof t.runningSince === 'number' ? t.runningSince : null }
      : STOPPED;
    return {
      sessionId: v.sessionId,
      blockIndex: Math.max(0, Math.floor(v.blockIndex)),
      timer,
      draftProtected: v.draftProtected === true,
    };
  } catch {
    return null;
  }
}
