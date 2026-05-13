'use client';

import type { AppState, AttackerId } from '@/lib/types';
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
}

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
                    <span style={{ flex: 1, color: '#57534e', fontStyle: s.label ? 'normal' : 'italic' }}>
                      {s.label || '(sans label)'}
                    </span>
                  )}
                  {s.switches && <span style={{ fontSize: 10, color: '#999' }}>↔</span>}
                  {s.context === 'free-throw' && (
                    <span
                      style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', padding: '1px 4px', borderRadius: 3, fontWeight: 600 }}
                      title="Lancer franc — positions réglementaires figées"
                    >
                      🏀 LF
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#78716c' }}>
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
                            background: '#fff',
                            border: '1px solid #fed7aa',
                          }}
                        >
                          <span style={{ color: c.accent, fontWeight: 700, minWidth: 12, textAlign: 'center' }}>
                            {ai + 1}
                          </span>
                          <span style={{ fontSize: 11 }}>{meta.symbol}</span>
                          <span style={{ flex: 1, color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <Button theme="offense" onClick={props.onAddStep}>+ étape</Button>
          <Button theme="offense" onClick={props.onDuplicateStep}>dup.</Button>
          <Button theme="offense" onClick={props.onDeleteStep}>suppr.</Button>
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
                background: '#fff',
                color: '#92400e',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              title="Force les 10 positions sur les 6 slots du couloir LF + tireur + outlets 3pt. Marque le step comme context='free-throw'."
            >
              🏀 convertir en lancer franc
            </button>
          </div>
        )}
      </Section>
    </Panel>
  );
}
