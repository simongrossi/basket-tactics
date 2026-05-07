'use client';

import { useState } from 'react';
import type { AppState, AttackerId, Tool } from '@/lib/types';
import { TEMPLATES, type Template } from '@/lib/data/templates';
import { Panel, Section, Button, COLORS } from './ui';
import { TemplateLibraryModal } from './TemplateLibraryModal';

const ATTACKER_IDS: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];

interface OffensePanelProps {
  state: AppState;
  onSetActiveStep: (idx: number) => void;
  onAddStep: () => void;
  onDuplicateStep: () => void;
  onDeleteStep: () => void;
  onSetStepLabel: (idx: number, label: string) => void;
  onSetBallCarrier: (carrier: AttackerId) => void;
  onLoadTemplate: (template: Template) => void;
  onDeleteAnnotation: (idx: number) => void;
  onPlayToggle: () => void;
  onStop: () => void;
  isPlaying: boolean;
  tool: Tool;
  onSetTool: (t: Tool) => void;
  playbackSpeed: number;
  onSetPlaybackSpeed: (s: number) => void;
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
  const [libraryOpen, setLibraryOpen] = useState(false);

  return (
    <Panel theme="offense" title="⚪ Attaque">
      {/* Bouton compact qui ouvre la bibliothèque en modal — descriptions
          visibles, pas de friction sur l'espace du panel. */}
      <button
        onClick={() => setLibraryOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${c.border}`,
          borderLeft: `3px solid ${c.accent}`,
          background: c.bg,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          color: c.accentText,
          transition: 'background 120ms, border-color 120ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = c.bgSubtle;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = c.bg;
        }}
        title="Ouvrir la bibliothèque de systèmes prêts à l'emploi"
      >
        <span>📚 Bibliothèque ({TEMPLATES.length} systèmes)</span>
        <span style={{ fontSize: 10, color: c.accent, opacity: 0.7 }}>cliquer pour ouvrir →</span>
      </button>
      {libraryOpen && (
        <TemplateLibraryModal
          hasWorkInProgress={state.steps.length > 1 || state.steps[0].annotations.length > 0}
          onLoad={props.onLoadTemplate}
          onClose={() => setLibraryOpen(false)}
        />
      )}

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
            const isActive = i === state.activeStep;
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
                      value={s.ballCarrier}
                      onChange={(e) => props.onSetBallCarrier(e.target.value as AttackerId)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 11 }}
                    >
                      {ATTACKER_IDS.map((id) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ fontWeight: 500 }}>{s.ballCarrier}</span>
                  )}
                  <span style={{ marginLeft: 'auto' }}>{s.annotations.length} annot.</span>
                </div>
                {/* Liste des annotations supprimables — visible seulement sur l'étape active */}
                {isActive && s.annotations.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                    {s.annotations.map((a, ai) => {
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
                              props.onDeleteAnnotation(ai);
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

      <Section theme="offense" label="Lecture" open>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button theme="offense" variant={props.isPlaying ? 'solid' : 'outline'} onClick={props.onPlayToggle}>
            {props.isPlaying ? '⏸ pause' : '▶ play'}
          </Button>
          <Button theme="offense" onClick={props.onStop}>■ stop</Button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#57534e', minWidth: 50 }}>vitesse</span>
          <input
            type="range"
            min={0.3}
            max={2}
            step={0.1}
            value={props.playbackSpeed}
            onChange={(e) => props.onSetPlaybackSpeed(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, minWidth: 30, textAlign: 'right' }}>{props.playbackSpeed.toFixed(1)}×</span>
        </div>
      </Section>
    </Panel>
  );
}
