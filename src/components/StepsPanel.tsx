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
  onSetBallCarrier: (carrier: AttackerId) => void;
  onDeleteAnnotation: (idx: number) => void;
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

  return (
    <Panel theme="offense" title="📖 Étapes">
      <Section theme="offense" label="Liste" open>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 320, overflow: 'auto' }}>
          {state.steps.map((s, i) => {
            if (s.isInterpolated) return null;
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
                  <span style={{ fontWeight: 600, color: c.accentText }}>#{i + 1}</span>
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
                {/* Liste des annotations supprimables — visible seulement sur l'étape active */}
                {isActive && visibleAnnotations.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                    {visibleAnnotations.map(({ annotation: a, index }, ai) => {
                      const meta = ANNOTATION_LABELS[a.type];
                      return (
                        <div
                          key={ai}
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
                      );
                    })}
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
