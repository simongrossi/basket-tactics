'use client';

// U05 — barre de déroulé de séance, au-dessus du terrain. Garde le contexte
// de la séance pendant qu'on montre ses blocs : bloc courant, précédent /
// suivant, minuteur, consignes, variantes du système et retour au plan.

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ListChecks, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { PracticeSession } from '@/lib/data/practiceSessions';
import type { ScenarioBranch } from '@/lib/types';
import {
  blockRemainingMs,
  formatCountdown,
  isTimerRunning,
  type SessionRun,
} from '@/lib/data/sessionRun';

interface SessionRunBarProps {
  session: PracticeSession;
  run: SessionRun;
  now: number;
  /** Variantes du système affiché (vide si aucune ou bloc libre). */
  branches: ScenarioBranch[];
  activeBranchId: string | null;
  onSetActiveBranch: (id: string | null) => void;
  onGoToBlock: (index: number) => void;
  onToggleTimer: () => void;
  onResetTimer: () => void;
  onBackToSession: () => void;
  onEnd: () => void;
}

export function SessionRunBar(props: SessionRunBarProps) {
  const { session, run, now } = props;
  const [showNotes, setShowNotes] = useState(true);
  const block = session.blocks[run.blockIndex];
  if (!block) return null;
  const total = session.blocks.length;
  const remaining = blockRemainingMs(block, run.timer, now);
  const running = isTimerRunning(run.timer);
  const over = remaining < 0;
  const branchChoices = variantChoices(props.branches);
  const hasReactive = props.branches.some((b) => b.trigger);

  return (
    <section className="bt-session-run" aria-label={`Déroulé de la séance ${session.name}`}>
      <div className="bt-session-run-row">
        <button type="button" className="bt-touch bt-run-btn" onClick={props.onBackToSession} title="Revenir au plan de la séance (le déroulé reste en cours)">
          <ListChecks size={16} aria-hidden /> Ma séance
        </button>
        <div className="bt-run-title">
          <span className="bt-run-kicker">{session.name} · bloc {run.blockIndex + 1}/{total}</span>
          <strong>{block.title}</strong>
        </div>
        <div className="bt-run-nav">
          <button
            type="button"
            className="bt-touch bt-run-btn"
            onClick={() => props.onGoToBlock(run.blockIndex - 1)}
            disabled={run.blockIndex === 0}
            aria-label="Bloc précédent"
            title={run.blockIndex > 0 ? `Bloc précédent : ${session.blocks[run.blockIndex - 1].title}` : 'Premier bloc'}
          >
            <ChevronLeft size={18} aria-hidden /> Précédent
          </button>
          <button
            type="button"
            className="bt-touch bt-run-btn"
            onClick={() => props.onGoToBlock(run.blockIndex + 1)}
            disabled={run.blockIndex >= total - 1}
            aria-label="Bloc suivant"
            title={run.blockIndex < total - 1 ? `Bloc suivant : ${session.blocks[run.blockIndex + 1].title}` : 'Dernier bloc'}
          >
            Suivant <ChevronRight size={18} aria-hidden />
          </button>
        </div>
        <div className={`bt-run-timer${over ? ' is-over' : ''}`} role="timer" aria-live="off" aria-label={`Temps ${over ? 'dépassé' : 'restant'} du bloc`}>
          <span className="bt-run-clock">{formatCountdown(remaining)}</span>
          <span className="bt-run-clock-total">/ {block.durationMin} min</span>
          <button
            type="button"
            className="bt-touch bt-run-btn"
            onClick={props.onToggleTimer}
            aria-label={running ? 'Mettre le minuteur en pause' : 'Démarrer le minuteur'}
          >
            {running ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </button>
          <button type="button" className="bt-touch bt-run-btn" onClick={props.onResetTimer} aria-label="Remettre le minuteur à zéro">
            <RotateCcw size={16} aria-hidden />
          </button>
        </div>
        <button type="button" className="bt-touch bt-run-btn" onClick={props.onEnd} title="Terminer le déroulé et retrouver le brouillon d’avant la séance">
          <X size={16} aria-hidden /> Terminer
        </button>
      </div>

      {branchChoices.length > 0 && (
        <div className="bt-session-run-row" role="group" aria-label="Variantes du système">
          <span className="bt-run-kicker">Variante</span>
          <button
            type="button"
            className="bt-touch bt-run-chip"
            aria-pressed={props.activeBranchId === null}
            onClick={() => props.onSetActiveBranch(null)}
          >
            {hasReactive ? 'Lecture auto' : 'Principale'}
          </button>
          {branchChoices.map((b) => (
            <button
              key={b.id}
              type="button"
              className="bt-touch bt-run-chip"
              aria-pressed={props.activeBranchId === b.id}
              onClick={() => props.onSetActiveBranch(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {block.notes && (
        <div className="bt-run-notes">
          <button
            type="button"
            className="bt-run-notes-toggle"
            aria-expanded={showNotes}
            onClick={() => setShowNotes((v) => !v)}
          >
            Consignes {showNotes ? '▾' : '▸'}
          </button>
          {showNotes && <p>{block.notes}</p>}
        </div>
      )}
    </section>
  );
}

/** Variantes sélectionnables, sous-variantes libellées par leur chemin
 *  (« Si drop › Si le pivot roule »). */
export function variantChoices(branches: ScenarioBranch[]): { id: string; label: string }[] {
  const byId = new Map(branches.map((b) => [b.id, b]));
  const pathLabel = (b: ScenarioBranch): string => {
    const labels = [b.label];
    const seen = new Set([b.id]);
    let parent = b.parentBranchId ? byId.get(b.parentBranchId) : undefined;
    while (parent && !seen.has(parent.id)) {
      labels.unshift(parent.label);
      seen.add(parent.id);
      parent = parent.parentBranchId ? byId.get(parent.parentBranchId) : undefined;
    }
    return labels.join(' › ');
  };
  return branches.map((b) => ({ id: b.id, label: pathLabel(b) }));
}

/** Bloc sans visualisation (échauffement, physique…) : la carte remplace le
 *  terrain pour ne pas montrer le système d'un autre bloc. */
export function SessionBlockCard({ title, notes, durationMin }: { title: string; notes?: string; durationMin: number }) {
  return (
    <div className="bt-session-block-card">
      <span className="bt-run-kicker">Bloc libre · {durationMin} min</span>
      <h2>{title}</h2>
      {notes ? <p>{notes}</p> : <p className="bt-run-muted">Aucune consigne pour ce bloc.</p>}
    </div>
  );
}
