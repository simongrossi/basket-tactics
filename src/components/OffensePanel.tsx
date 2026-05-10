'use client';

import type { AppState, AttackerId, Tool } from '@/lib/types';
import { activeBallCarrier, getActiveAttackerIds, isActiveAttacker } from '@/lib/logic/players';
import { Panel, Section, Button, COLORS } from './ui';

interface OffensePanelProps {
  state: AppState;
  onSetActiveStep: (idx: number) => void;
  onAddStep: () => void;
  onDuplicateStep: () => void;
  onDeleteStep: () => void;
  onSetStepLabel: (idx: number, label: string) => void;
  onSetBallCarrier: (carrier: AttackerId) => void;
  onDeleteAnnotation: (idx: number) => void;
  tool: Tool;
  onSetTool: (t: Tool) => void;
}

const ANNOTATION_LABELS: Record<'pass' | 'dribble' | 'cut' | 'screen', { label: string; symbol: string }> = {
  pass: { label: 'passe', symbol: '⇢' },
  dribble: { label: 'dribble', symbol: '∿' },
  cut: { label: 'course', symbol: '→' },
  screen: { label: 'écran', symbol: '⊥' },
};

const TOOLS: { value: Tool; label: string }[] = [
  { value: 'move', label: 'déplacer' },
  { value: 'pass', label: 'passe' },
  { value: 'dribble', label: 'dribble' },
  { value: 'cut', label: 'course' },
  { value: 'screen', label: 'écran' },
];

function ToolIcon({ tool, color }: { tool: Tool; color: string }) {
  switch (tool) {
    case 'move':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 2 v12 M2 8 h12 M5 5 L2 8 L5 11 M11 5 L14 8 L11 11 M5 5 L8 2 L11 5 M5 11 L8 14 L11 11" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'pass':
      return (
        <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
          <line x1="1" y1="5" x2="16" y2="5" stroke={color} strokeWidth="1.6" strokeDasharray="2 2.5" strokeLinecap="round" />
          <path d="M15 1 L20 5 L15 9" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'dribble':
      return (
        <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
          <path d="M1 5 Q3 0 5 5 T9 5 T13 5 T17 5" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M16 1 L20 5 L16 9" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'cut':
      return (
        <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
          <line x1="1" y1="5" x2="16" y2="5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M15 1 L20 5 L15 9" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'screen':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <line x1="8" y1="2" x2="8" y2="11" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <line x1="3" y1="12" x2="13" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
  }
}

export function OffensePanel(props: OffensePanelProps) {
  const { state } = props;
  const c = COLORS.offense;
  const attackerIds = getActiveAttackerIds(state.playerCount);

  return (
    <Panel theme="offense" title="⚪ Attaque">
      <Section theme="offense" label="Actions" open>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {TOOLS.map((t) => {
            const active = props.tool === t.value;
            return (
              <button
                key={t.value}
                onClick={() => props.onSetTool(t.value)}
                style={{
                  flex: '1 0 calc(33% - 4px)',
                  fontSize: 11,
                  padding: '6px 6px',
                  borderRadius: 6,
                  border: `1px solid ${active ? c.accent : c.border}`,
                  background: active ? c.accent : '#fff',
                  color: active ? '#fff' : c.accentText,
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <ToolIcon tool={t.value} color={active ? '#fff' : c.accentText} />
                {t.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section theme="offense" label="Étapes" open>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflow: 'auto' }}>
          {state.steps.map((s, i) => {
            // Steps interpolés (lissage des téléports) ne sont pas affichés
            // dans la liste utilisateur — ils restent dans state.steps pour
            // le playback mais ne sont pas éditables.
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
      </Section>
    </Panel>
  );
}
