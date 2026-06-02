'use client';

import { Plus, Copy, Trash2 } from 'lucide-react';
import type { AppState, AttackerId, InboundDefenseMode, InboundSide } from '@/lib/types';
import { activeBallCarrier, getActiveAttackerIds, isActiveAttacker } from '@/lib/logic/players';
import { Panel, Section, Button, COLORS } from './ui';

interface StepsPanelProps {
  state: AppState;
  onSetActiveStep: (idx: number) => void;
  onAddStep: () => void;
  onDuplicateStep: () => void;
  onDeleteStep: () => void;
  onSetStepLabel: (idx: number, label: string) => void;
  /** B.1 / F.4 / F.5 — patch partiel d'un step (duration, clockSeconds,
   *  shotClockRemaining…). Utilisé pour les inputs d'horloges sur le step
   *  actif. */
  onPatchStep?: (idx: number, patch: Partial<AppState['steps'][number]>) => void;
  /** A11 — Génère un step de rebond après un tir manqué (computeRebound +
   *  box-out auto). Le step actif doit avoir shotOutcome === 'missed'. */
  onAddShotReboundStep?: (options?: { seed?: number; sourceStepIdx?: number }) => void;
  /** E.1 stage 2b — Convertit/ajoute un step en mode "possession adverse"
   *  (mirror vertical des positions autour de y=540). Le mode 'insert'
   *  ajoute un step après ; 'replace' remplace le step actif. */
  onConvertStepToAwayPossession?: (options?: { mode?: 'insert' | 'replace'; sourceStepIdx?: number }) => void;
  /** A11 V3 — Setter combiné : clear outletPassPending sur step source +
   *  ajoute un step adverse (= chaîne rebond défensif → transition en
   *  1 clic). No-op si outletPassPending n'est pas posé. */
  onAddOutletPassStep?: (options?: { sourceStepIdx?: number }) => void;
  /** Transition sous-projet 1 — génère le fast-break (outlet + sprint des
   *  couloirs vers HOOP_OPPOSITE, full-court). Visible sur un rebond défensif. */
  onAddFastBreakSteps?: (options?: { sourceStepIdx?: number }) => void;
  onSetBallCarrier: (carrier: AttackerId) => void;
  onDeleteAnnotation: (idx: number) => void;
  onToggleAnnotationSprint?: (stepIdx: number, annoIdx: number) => void;
  onSetAnnotationFlipSide: (stepIdx: number, annIdx: number, side: 'left' | 'right' | undefined) => void;
  onAddFeinte: (stepIdx: number, annIdx: number, t: number) => void;
  onUpdateFeinte: (stepIdx: number, annIdx: number, feinteIdx: number, t: number) => void;
  onRemoveFeinte: (stepIdx: number, annIdx: number, feinteIdx: number) => void;
  /** F.3 — Convertit le step actif en setup de lancer franc. */
  onConvertToFreeThrow?: () => void;
  /** Convertit le step actif en setup de remise en jeu (BLOB ou SLOB). */
  onConvertToInbound?: (side: InboundSide) => void;
  /** Applique un mode défensif spécifique sur le step inbound actif. */
  onSetInboundDefenseMode?: (mode: InboundDefenseMode) => void;
  /** F.2 — Ajoute une étape course-rebond après un step LF (made/missed). */
  onAddFreeThrowReboundStep?: (made: boolean) => void;
  /** E.2 — Convertit le step actif en entre-deux (jump ball). */
  onConvertToJumpBall?: () => void;
}

const inboundButtonStyle = {
  flex: 1,
  fontSize: 10,
  padding: '4px 4px',
  borderRadius: 4,
  border: '1px solid #dc2626',
  background: '#262a32',
  color: '#fca5a5',
  cursor: 'pointer' as const,
  fontWeight: 600,
  minWidth: 0,
};

const ANNOTATION_LABELS: Record<'pass' | 'dribble' | 'cut' | 'screen', { label: string; symbol: string }> = {
  pass: { label: 'passe', symbol: '⇢' },
  dribble: { label: 'dribble', symbol: '∿' },
  cut: { label: 'course', symbol: '→' },
  screen: { label: 'écran', symbol: '⊥' },
};

function hasEntries(value: object | undefined): boolean {
  return !!value && Object.keys(value).length > 0;
}

function isBlankStepEntry(step: AppState['steps'][number]): boolean {
  return (
    step.annotations.length === 0 &&
    !step.label &&
    !step.context &&
    !hasEntries(step.defenseOverrides) &&
    !step.forcedScreener &&
    !step.manualOverride &&
    !step.generatedBy &&
    !step.shotOutcome &&
    !step.shotPos &&
    !step.rebounder &&
    !step.reboundType &&
    !step.outletPassPending &&
    !step.viewSide &&
    step.duration == null &&
    step.clockSeconds == null &&
    step.shotClockRemaining == null &&
    !step.sprintBoost
  );
}

export function getVisibleStepRows(state: AppState): { step: AppState['steps'][number]; index: number; number: number }[] {
  const realSteps = state.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => !step.isInterpolated);

  const rows: { step: AppState['steps'][number]; index: number; number: number }[] = [];
  realSteps.forEach(({ step, index }, realIdx) => {
    const blank = isBlankStepEntry(step);
    if (realSteps.length === 1 && blank) return;

    const previous = realSteps[realIdx - 1]?.step;
    const isInitialSetup = realIdx === 0 && blank;
    const isTrailingActionResult =
      realIdx === realSteps.length - 1 && blank && !!previous && previous.annotations.length > 0;

    if (isInitialSetup || isTrailingActionResult) return;
    rows.push({ step, index, number: rows.length + 1 });
  });

  return rows;
}

export function isPristineInitialStepList(state: AppState): boolean {
  return getVisibleStepRows(state).length === 0;
}

/**
 * Refonte UI Livraison 1 — panneau droite workspace :
 * liste des étapes du playbook + actions CRUD + 🏀 LF.
 *
 * Extrait de l'ancien `OffensePanel` (la section "Étapes").
 */
export function StepsPanel(props: StepsPanelProps) {
  const { state } = props;
  const c = COLORS.offense;
  const attackerIds = getActiveAttackerIds(state.playerCount);
  const visibleStepRows = getVisibleStepRows(state);
  const showEmptyStepList = visibleStepRows.length === 0;

  return (
    <Panel theme="offense" title="📖 Étapes">
      <Section theme="offense" label="Liste" open>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 320, overflow: 'auto' }}>
          {showEmptyStepList ? (
            <div
              style={{
                padding: '12px 8px',
                borderRadius: 5,
                border: `1px dashed ${c.border}`,
                background: '#fff',
                color: '#94a3b8',
                fontSize: 11,
                textAlign: 'center',
                fontStyle: 'italic',
              }}
            >
              Aucune étape
            </div>
          ) : visibleStepRows.map(({ step: s, index: i, number }) => {
            const isActive = i === state.activeStep;
            const carrier = activeBallCarrier(s, state.playerCount);
            const visibleAnnotations = s.annotations
              .map((annotation, index) => ({ annotation, index }))
              .filter(({ annotation }) =>
                isActiveAttacker(annotation.fromId, state.playerCount) &&
                (!annotation.toId || isActiveAttacker(annotation.toId, state.playerCount))
              );
            return (
              <div
                key={i}
                onClick={() => !isActive && props.onSetActiveStep(i)}
                style={{
                  padding: '5px 7px',
                  borderRadius: 5,
                  cursor: isActive ? 'default' : 'pointer',
                  fontSize: 11,
                  background: isActive ? c.bgSubtle : '#fff',
                  border: `1px solid ${isActive ? c.accent : c.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 600, color: c.accentText }}>#{number}</span>
                  {isActive ? (
                    <input
                      type="text"
                      value={s.label ?? ''}
                      placeholder="label de l'étape…"
                      onChange={(e) => props.onSetStepLabel(i, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ flex: 1, fontSize: 11, padding: '2px 4px', border: `1px solid ${c.border}`, borderRadius: 3 }}
                    />
                  ) : (
                    <span style={{ flex: 1, color: '#cbd5e1', fontStyle: s.label ? 'normal' : 'italic' }}>
                      {s.label || '(sans label)'}
                    </span>
                  )}
                  {s.switches && <span style={{ fontSize: 10, color: '#999' }}>↔</span>}
                  {s.context === 'free-throw' && (
                    <span
                      style={{ fontSize: 10, color: '#fbbf24', background: '#fef3c7', padding: '1px 4px', borderRadius: 3, fontWeight: 600 }}
                      title="Lancer franc — positions réglementaires figées"
                    >
                      🏀 LF
                    </span>
                  )}
                  {(s.context === 'inbound-baseline' ||
                    s.context === 'inbound-sideline-low' ||
                    s.context === 'inbound-sideline-high') && (
                    <span
                      style={{ fontSize: 10, color: '#fca5a5', background: '#fee2e2', padding: '1px 4px', borderRadius: 3, fontWeight: 600 }}
                      title={`Remise en jeu — ${
                        s.context === 'inbound-baseline'
                          ? 'ligne de fond (BLOB)'
                          : s.context === 'inbound-sideline-low'
                            ? 'touche bas (SLOB offensif)'
                            : 'touche haut (SLOB transition)'
                      }`}
                    >
                      ⏱ {s.context === 'inbound-baseline' ? 'BLOB' : 'SLOB'}
                    </span>
                  )}
                  {s.context === 'jump-ball' && (
                    <span
                      style={{ fontSize: 10, color: '#5b21b6', background: '#ede9fe', padding: '1px 4px', borderRadius: 3, fontWeight: 600 }}
                      title="Entre-deux (jump ball) — setup canonique cercle central"
                    >
                      🆙 JUMP
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#94a3b8' }}>
                  <span>porteur</span>
                  {isActive ? (
                    <select
                      value={carrier}
                      onChange={(e) => props.onSetBallCarrier(e.target.value as AttackerId)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 11 }}
                    >
                      {attackerIds.map((id) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ fontWeight: 500 }}>{carrier}</span>
                  )}
                  <span style={{ marginLeft: 'auto' }}>{visibleAnnotations.length} annot.</span>
                </div>
                {/* Horloges per-step (B.1 duration, F.4 clockSeconds, F.5 shotClockRemaining).
                    Visible uniquement sur l'étape active, et seulement si onPatchStep est branché. */}
                {isActive && props.onPatchStep && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: 4,
                      marginTop: 4,
                      fontSize: 9,
                      color: '#94a3b8',
                    }}
                  >
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }} title="B.1 — durée narrative de cette étape (s). Vide = défaut global.">
                      <span>durée (s)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="auto"
                        value={s.duration ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const v = raw === '' ? undefined : Math.max(0, parseFloat(raw) || 0);
                          props.onPatchStep!(i, { duration: v });
                        }}
                        style={{ fontSize: 10, padding: '2px 4px' }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }} title="F.4 — secondes restantes au chrono du quart à ce step. Vide = règle inactive.">
                      <span>quart (s)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="—"
                        value={s.clockSeconds ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const v = raw === '' ? undefined : Math.max(0, parseFloat(raw) || 0);
                          props.onPatchStep!(i, { clockSeconds: v });
                        }}
                        style={{ fontSize: 10, padding: '2px 4px' }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }} title="F.5 — secondes restantes au shot clock à ce step. Vide = règle inactive.">
                      <span>shot clk</span>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        placeholder="—"
                        value={s.shotClockRemaining ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const v = raw === '' ? undefined : Math.max(0, Math.min(24, parseFloat(raw) || 0));
                          props.onPatchStep!(i, { shotClockRemaining: v });
                        }}
                        style={{ fontSize: 10, padding: '2px 4px' }}
                      />
                    </label>
                  </div>
                )}
                {/* G.2 — Sprint boost contextuel (toggle sur step actif) */}
                {isActive && props.onPatchStep && (
                  <label
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      marginTop: 3,
                      fontSize: 9,
                      color: '#94a3b8',
                      cursor: 'pointer',
                    }}
                    title="G.2 — Sprint contextuel : vitesse max défense ×1.8 sur ce step (fast break / transition / run-out)."
                  >
                    <input
                      type="checkbox"
                      checked={!!s.sprintBoost}
                      onChange={(e) => props.onPatchStep!(i, { sprintBoost: e.target.checked || undefined })}
                      style={{ width: 12, height: 12, flex: '0 0 12px' }}
                    />
                    sprint (×1.8 vitesse défense)
                  </label>
                )}
                {/* Liste des annotations supprimables — visible seulement sur l'étape active */}
                {isActive && visibleAnnotations.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                    {visibleAnnotations.map(({ annotation: a, index }, ai) => {
                      const meta = ANNOTATION_LABELS[a.type];
                      return (
                        <div key={ai} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 10,
                            padding: '2px 4px',
                            borderRadius: 3,
                            background: '#262a32',
                            border: '1px solid #fed7aa',
                          }}
                        >
                          <span style={{ color: c.accent, fontWeight: 700, minWidth: 12, textAlign: 'center' }}>
                            {ai + 1}
                          </span>
                          <span style={{ fontSize: 11 }}>{meta.symbol}</span>
                          <span style={{ flex: 1, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {meta.label} {a.fromId}
                            {a.toId ? ` → ${a.toId}` : ''}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              props.onDeleteAnnotation(index);
                            }}
                            title="Supprimer cette action"
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: '#dc2626',
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 700,
                              padding: '0 4px',
                              lineHeight: 1,
                              borderRadius: 3,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#fee2e2';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            ×
                          </button>
                          </div>
                          {(a.type === 'cut' || a.type === 'dribble') && (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 3,
                                marginLeft: 18,
                                marginBottom: 3,
                                fontSize: 10,
                                color: '#9ca3af',
                              }}
                            >
                              <label
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  fontSize: 9,
                                  color: '#9ca3af',
                                  cursor: 'pointer',
                                  marginTop: 3,
                                }}
                                title="Sprint : le joueur atteint sa destination en 60% du temps de l'étape."
                              >
                                <input
                                  type="checkbox"
                                  checked={!!a.sprint}
                                  onChange={() => props.onToggleAnnotationSprint?.(i, index)}
                                  style={{ width: 11, height: 11 }}
                                />
                                sprint offensif (60% temps)
                              </label>
                              {a.type === 'cut' && (
                                <label
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#cbd5e1', marginTop: 3 }}
                                  title="Phy.O V3 V2 — si le défenseur matché est de ce côté de la ligne du cut, le cut part automatiquement du côté opposé (path miroité)."
                                >
                                  flip si déf.
                                  <select
                                    value={a.flipSideIfDefenderOn ?? 'none'}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      props.onSetAnnotationFlipSide(
                                        i, index,
                                        v === 'none' ? undefined : (v as 'left' | 'right'),
                                      );
                                    }}
                                    style={{ fontSize: 10 }}
                                  >
                                    <option value="none">non</option>
                                    <option value="left">à gauche</option>
                                    <option value="right">à droite</option>
                                  </select>
                                </label>
                              )}
                              {(a.feintes ?? []).map((tF, fi) => (
                                <div
                                  key={fi}
                                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                  <span style={{ minWidth: 40 }}>feinte {fi + 1}</span>
                                  <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={tF}
                                    onChange={(e) =>
                                      props.onUpdateFeinte(i, index, fi, parseFloat(e.target.value))
                                    }
                                    style={{ flex: 1 }}
                                    title={`Position de la feinte : ${(tF * 100).toFixed(0)}% de l'arc`}
                                  />
                                  <span style={{ minWidth: 30, textAlign: 'right' }}>
                                    {(tF * 100).toFixed(0)}%
                                  </span>
                                  <button
                                    onClick={() => props.onRemoveFeinte(i, index, fi)}
                                    title="Supprimer cette feinte"
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#dc2626',
                                      cursor: 'pointer',
                                      fontSize: 11,
                                      padding: '0 2px',
                                      lineHeight: 1,
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => props.onAddFeinte(i, index, 0.5)}
                                title="Ajouter une feinte à la moitié de l'arc"
                                style={{
                                  alignSelf: 'flex-start',
                                  padding: '2px 6px',
                                  fontSize: 10,
                                  background: 'transparent',
                                  border: '1px solid #94a3b8',
                                  borderRadius: 3,
                                  color: '#cbd5e1',
                                  cursor: 'pointer',
                                }}
                              >
                                + feinte
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}{/* /visibleAnnotations.map */}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {/* Action primaire : ajouter une étape — solid orange (accent
              offense). Action que le user fait le plus souvent. */}
          <button
            type="button"
            onClick={props.onAddStep}
            title="Ajouter une nouvelle étape"
            style={{
              flex: '1 1 0',
              minWidth: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              padding: '7px 8px',
              borderRadius: 6,
              border: '1px solid #ea580c',
              background: '#ea580c',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <Plus size={14} strokeWidth={2.5} /> étape
          </button>
          {/* Action secondaire : dupliquer — outline neutre */}
          <button
            type="button"
            onClick={props.onDuplicateStep}
            title="Dupliquer l'étape active"
            style={{
              flex: '1 1 0',
              minWidth: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 500,
              padding: '7px 8px',
              borderRadius: 6,
              border: '1px solid #2a2d35',
              background: '#262a32',
              color: '#cbd5e1',
              cursor: 'pointer',
            }}
          >
            <Copy size={13} strokeWidth={2} /> dup.
          </button>
          {/* Action destructive : supprimer — accent rouge */}
          <button
            type="button"
            onClick={props.onDeleteStep}
            title="Supprimer l'étape active"
            style={{
              flex: '1 1 0',
              minWidth: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 500,
              padding: '7px 8px',
              borderRadius: 6,
              border: '1px solid rgba(252, 165, 165, 0.4)',
              background: 'rgba(252, 165, 165, 0.10)',
              color: '#fca5a5',
              cursor: 'pointer',
            }}
          >
            <Trash2 size={13} strokeWidth={2} /> suppr.
          </button>
        </div>
        {/* A11 V1 — Saisie tir : 3 boutons (made / missed / annuler) sur step actif.
            Phase 1 = juste les inputs. Phase 2 ajoutera le bouton "étape rebond auto"
            quand shotOutcome === 'missed'. */}
        {props.onPatchStep && (() => {
          const activeStep = props.state.steps[props.state.activeStep];
          if (!activeStep || activeStep.isInterpolated) return null;
          const outcome = activeStep.shotOutcome;
          return (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 3, letterSpacing: 0.3 }}>
                TIR (A11)
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                <button
                  type="button"
                  onClick={() => props.onPatchStep!(props.state.activeStep, {
                    shotOutcome: outcome === 'made' ? undefined : 'made',
                    shotPos: outcome === 'made' ? undefined : (activeStep.shotPos ?? activeStep.off[activeStep.ballCarrier]),
                  })}
                  title="Marque ce step comme tir réussi. Cliquer à nouveau pour annuler."
                  style={{
                    flex: 1,
                    fontSize: 10,
                    padding: '4px 6px',
                    borderRadius: 4,
                    border: `1.5px solid ${outcome === 'made' ? '#22c55e' : 'rgba(34, 197, 94, 0.35)'}`,
                    background: outcome === 'made' ? '#22c55e' : '#262a32',
                    color: outcome === 'made' ? '#fff' : '#86efac',
                    cursor: 'pointer',
                    fontWeight: outcome === 'made' ? 700 : 500,
                  }}
                >
                  ✅ {outcome === 'made' ? 'RÉUSSI' : 'réussi'}
                </button>
                <button
                  type="button"
                  onClick={() => props.onPatchStep!(props.state.activeStep, {
                    shotOutcome: outcome === 'missed' ? undefined : 'missed',
                    shotPos: outcome === 'missed' ? undefined : (activeStep.shotPos ?? activeStep.off[activeStep.ballCarrier]),
                  })}
                  title="Marque ce step comme tir manqué. Débloque le bouton 'étape rebond auto'."
                  style={{
                    flex: 1,
                    fontSize: 10,
                    padding: '4px 6px',
                    borderRadius: 4,
                    border: `1.5px solid ${outcome === 'missed' ? '#dc2626' : 'rgba(252, 165, 165, 0.35)'}`,
                    background: outcome === 'missed' ? '#dc2626' : '#262a32',
                    color: outcome === 'missed' ? '#fff' : '#fca5a5',
                    cursor: 'pointer',
                    fontWeight: outcome === 'missed' ? 700 : 500,
                  }}
                >
                  ❌ {outcome === 'missed' ? 'MANQUÉ' : 'manqué'}
                </button>
                <button
                  type="button"
                  onClick={() => props.onPatchStep!(props.state.activeStep, {
                    shotOutcome: outcome === 'blocked' ? undefined : 'blocked',
                    shotPos: outcome === 'blocked' ? undefined : (activeStep.shotPos ?? activeStep.off[activeStep.ballCarrier]),
                  })}
                  title="V2 — Marque ce step comme tir contré. Sur étape rebond auto, le défenseur le plus proche du shooter récupère directement (= possession défensive)."
                  style={{
                    flex: 1,
                    fontSize: 10,
                    padding: '4px 6px',
                    borderRadius: 4,
                    border: `1.5px solid ${outcome === 'blocked' ? '#a855f7' : 'rgba(196, 181, 253, 0.35)'}`,
                    background: outcome === 'blocked' ? '#a855f7' : '#262a32',
                    color: outcome === 'blocked' ? '#fff' : '#c4b5fd',
                    cursor: 'pointer',
                    fontWeight: outcome === 'blocked' ? 700 : 500,
                  }}
                >
                  🛑 {outcome === 'blocked' ? 'CONTRÉ' : 'contré'}
                </button>
              </div>
              {outcome && (
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3, fontStyle: 'italic' }}>
                  Step marqué comme tir {outcome === 'made' ? 'réussi' : 'manqué'}.
                  Cliquer à nouveau pour annuler.
                </div>
              )}
              {(outcome === 'missed' || outcome === 'blocked') && props.onAddShotReboundStep && (
                <button
                  type="button"
                  onClick={() => {
                    const msg = outcome === 'blocked'
                      ? 'Générer une étape post-contre ? Le défenseur le plus proche du shooter récupère directement.'
                      : 'Générer une étape de rebond automatique ? Box-out défensif + rebondeur identifié par modèle probabiliste.';
                    if (confirm(msg)) {
                      props.onAddShotReboundStep!();
                    }
                  }}
                  title="A11 V1+V2 — Ajoute une étape post-tir : défenseurs en box-out, rebondeur identifié (computeRebound si manqué, contreur proche si bloqué)."
                  style={{
                    width: '100%',
                    fontSize: 10,
                    padding: '5px 6px',
                    borderRadius: 4,
                    border: '1px solid #f59e0b',
                    background: '#262a32',
                    color: '#fbbf24',
                    cursor: 'pointer',
                    fontWeight: 600,
                    marginTop: 4,
                  }}
                >
                  🏀 étape {outcome === 'blocked' ? 'post-contre' : 'rebond'} auto (A11)
                </button>
              )}
              {/* A11 V3 — Bouton "outlet → transition" combiné : clear le
                  flag outletPassPending et génère le step adverse en 1 clic.
                  Visible UNIQUEMENT quand outletPassPending: true (= rebond
                  défensif récent). */}
              {activeStep.outletPassPending && props.onAddOutletPassStep && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Générer la transition adverse ? Outlet pass joué + step adverse inséré (positions inversées verticalement).')) {
                      props.onAddOutletPassStep!();
                    }
                  }}
                  title="A11 V3 — Chaîne automatique : clear outletPassPending + ajoute step adverse (mirror y=540). Suite naturelle d'un rebond défensif."
                  style={{
                    width: '100%',
                    fontSize: 10,
                    padding: '5px 6px',
                    borderRadius: 4,
                    border: '1px solid #dc2626',
                    background: '#262a32',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    fontWeight: 600,
                    marginTop: 4,
                  }}
                >
                  🔄 outlet → transition adverse (A11 V3)
                </button>
              )}
              {/* Transition sous-projet 1 — fast-break full-court : outlet +
                  sprint des couloirs vers le panier opposé. Visible sur un
                  rebond défensif. */}
              {activeStep.reboundType === 'defensive' && props.onAddFastBreakSteps && (
                <button
                  type="button"
                  onClick={() => props.onAddFastBreakSteps!()}
                  title="Génère un fast-break (outlet + sprint des 3 couloirs vers le panier opposé, full-court). L'équipe qui rebondit court."
                  style={{
                    width: '100%',
                    fontSize: 10,
                    padding: '5px 6px',
                    borderRadius: 4,
                    border: '1px solid #f59e0b',
                    background: '#262a32',
                    color: '#fcd34d',
                    cursor: 'pointer',
                    fontWeight: 600,
                    marginTop: 4,
                  }}
                >
                  ⚡ fast-break (outlet + sprint couloirs)
                </button>
              )}
              {/* E.1 stage 2b — Bouton libre "Convertir en possession adverse"
                  disponible sur tout step actif. Permet d'éditer un scénario
                  en partant directement d'une phase adverse, ou de basculer
                  un step home → away (et inverse). */}
              {props.onConvertStepToAwayPossession && (() => {
                const isAway = activeStep.viewSide === 'away';
                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (isAway) {
                        if (confirm('Repasser ce step en mode "home" ? Les positions restent inchangées (juste l\'affichage).')) {
                          props.onPatchStep?.(props.state.activeStep, { viewSide: 'home' });
                        }
                      } else {
                        if (confirm('Convertir CE step en phase adverse ? Mirror vertical des positions autour de y=540 (= demi-court).')) {
                          props.onConvertStepToAwayPossession!({ mode: 'replace' });
                        }
                      }
                    }}
                    title={isAway
                      ? 'Step actuellement en mode adverse. Cliquer pour revenir en home (affichage uniquement).'
                      : 'Convertit ce step en phase adverse (mirror vertical des positions).'
                    }
                    style={{
                      width: '100%',
                      fontSize: 10,
                      padding: '5px 6px',
                      borderRadius: 4,
                      border: `1px solid ${isAway ? '#22c55e' : '#dc2626'}`,
                      background: '#262a32',
                      color: isAway ? '#86efac' : '#fca5a5',
                      cursor: 'pointer',
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {isAway ? '↩ revenir en mode home' : '↩ convertir en phase adverse'}
                  </button>
                );
              })()}
            </div>
          );
        })()}
        {props.onConvertToFreeThrow && (
          <div style={{ marginTop: 4 }}>
            <button
              type="button"
              onClick={() => {
                if (confirm('Convertir cette étape en lancer franc ? Les 10 joueurs seront repositionnés sur les emplacements réglementaires.')) {
                  props.onConvertToFreeThrow!();
                }
              }}
              style={{
                width: '100%',
                fontSize: 10,
                padding: '4px 6px',
                borderRadius: 4,
                border: '1px solid #f59e0b',
                background: '#262a32',
                color: '#fbbf24',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              title="Force les 10 positions sur les 6 slots du couloir LF + tireur + outlets 3pt. Marque le step comme context='free-throw'."
            >
              🏀 convertir en lancer franc
            </button>
          </div>
        )}
        {/* F.2 — boutons post-lancer : visibles uniquement si step actif est LF */}
        {props.onAddFreeThrowReboundStep &&
          props.state.steps[props.state.activeStep]?.context === 'free-throw' && (
            <div style={{ marginTop: 4, display: 'flex', gap: 3 }}>
              <button
                type="button"
                onClick={() => props.onAddFreeThrowReboundStep!(true)}
                title="Ajoute un step post-lancer : LF réussi, transition adverse."
                style={{
                  flex: 1,
                  fontSize: 10,
                  padding: '4px 4px',
                  borderRadius: 4,
                  border: '1px solid #10b981',
                  background: '#262a32',
                  color: '#065f46',
                  cursor: 'pointer',
                  fontWeight: 600,
                  minWidth: 0,
                }}
              >
                🏀 +1 LF réussi
              </button>
              <button
                type="button"
                onClick={() => props.onAddFreeThrowReboundStep!(false)}
                title="Ajoute un step post-lancer : LF manqué, course-rebond."
                style={{
                  flex: 1,
                  fontSize: 10,
                  padding: '4px 4px',
                  borderRadius: 4,
                  border: '1px solid #f59e0b',
                  background: '#262a32',
                  color: '#fbbf24',
                  cursor: 'pointer',
                  fontWeight: 600,
                  minWidth: 0,
                }}
              >
                ⚠ LF manqué + rebond
              </button>
            </div>
          )}
        {props.onConvertToInbound && (
          <div style={{ marginTop: 4, display: 'flex', gap: 3 }}>
            <button
              type="button"
              onClick={() => {
                if (confirm('Convertir cette étape en remise ligne de fond (BLOB) ? Box set classique.')) {
                  props.onConvertToInbound!('inbound-baseline');
                }
              }}
              style={inboundButtonStyle}
              title="Remise ligne de fond (BLOB). Passeur derrière le panier, 4 attaquants en Box set, défenseurs face-à-face."
            >
              ⏱ BLOB
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Convertir cette étape en remise de touche côté offensif (SLOB low) ?')) {
                  props.onConvertToInbound!('inbound-sideline-low');
                }
              }}
              style={inboundButtonStyle}
              title="Remise touche côté offensif. Passeur sur la touche au niveau du free throw line étendu."
            >
              ⏱ SLOB bas
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Convertir cette étape en remise de touche côté défensif (SLOB transition) ?')) {
                  props.onConvertToInbound!('inbound-sideline-high');
                }
              }}
              style={inboundButtonStyle}
              title="Remise touche côté défensif (transition, advance the ball)."
            >
              ⏱ SLOB haut
            </button>
          </div>
        )}
        {/* E.2 — bouton entre-deux (jump ball) */}
        {props.onConvertToJumpBall && (
          <div style={{ marginTop: 4 }}>
            <button
              type="button"
              onClick={() => {
                if (confirm('Convertir cette étape en entre-deux (jump ball) ? Pose 10 joueurs autour du cercle central, 2 sauteurs au centre.')) {
                  props.onConvertToJumpBall!();
                }
              }}
              style={{
                width: '100%',
                fontSize: 10,
                padding: '4px 6px',
                borderRadius: 4,
                border: '1px solid #7c3aed',
                background: '#262a32',
                color: '#5b21b6',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              title="Pose le setup canonique d'entre-deux : O1 + D1 sauteurs au cercle central, 4+4 joueurs autour en arc."
            >
              🆙 entre-deux (jump ball)
            </button>
          </div>
        )}
        {/* Defensive inbound mode : visible uniquement si step actif est inbound */}
        {props.onSetInboundDefenseMode &&
          props.state.steps[props.state.activeStep] &&
          (props.state.steps[props.state.activeStep].context === 'inbound-baseline' ||
            props.state.steps[props.state.activeStep].context === 'inbound-sideline-low' ||
            props.state.steps[props.state.activeStep].context === 'inbound-sideline-high') && (
            <div style={{ marginTop: 6, padding: '4px 6px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: '#fca5a5', marginBottom: 3, letterSpacing: 0.3 }}>
                🛡 DÉFENSE SUR REMISE
              </div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {([
                  { mode: 'man' as const, label: 'man', title: 'Man-to-man face à face standard.' },
                  { mode: 'face-guard' as const, label: 'face-guard', title: 'Refus de passe sur le receveur principal (shooter le plus proche du passeur).' },
                  { mode: 'deny-deny' as const, label: 'deny tout', title: 'Tous les défenseurs sur les lignes de passe (refus systématique).' },
                  { mode: 'zone-press' as const, label: 'zone press', title: 'Trap sur le passeur + denials + 1 sweeper arrière.' },
                ]).map(({ mode, label, title }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => props.onSetInboundDefenseMode!(mode)}
                    title={title}
                    style={{
                      flex: '1 1 auto',
                      fontSize: 9,
                      padding: '3px 6px',
                      borderRadius: 3,
                      border: '1px solid #fca5a5',
                      background: '#262a32',
                      color: '#fca5a5',
                      cursor: 'pointer',
                      fontWeight: 600,
                      minWidth: 0,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
      </Section>
    </Panel>
  );
}
