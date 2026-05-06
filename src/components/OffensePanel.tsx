'use client';

import type { AppState, AttackerId, Tool } from '@/lib/types';
import { TEMPLATES, type Template } from '@/lib/data/templates';
import { Panel, Section, Button, COLORS } from './ui';

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
  onPlayToggle: () => void;
  onStop: () => void;
  isPlaying: boolean;
  tool: Tool;
  onSetTool: (t: Tool) => void;
  playbackSpeed: number;
  onSetPlaybackSpeed: (s: number) => void;
}

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

  return (
    <Panel theme="offense" title="⚪ Attaque">
      <Section theme="offense" label="Outils" open>
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

      <Section theme="offense" label="Bibliothèque systèmes">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (state.steps.length > 1 || state.steps[0].annotations.length > 0) {
                  if (!confirm(`Charger "${t.name}" ? Le travail en cours sera remplacé.`)) return;
                }
                props.onLoadTemplate(t);
              }}
              title={t.description}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                fontSize: 11,
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: '#fff',
                cursor: 'pointer',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                transition: 'border-color 120ms, background 120ms, transform 120ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = c.accent;
                e.currentTarget.style.background = c.bg;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = c.border;
                e.currentTarget.style.background = '#fff';
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  flex: '0 0 28px',
                  borderRadius: 6,
                  background: c.accent,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {t.steps.length}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: c.accentText, fontSize: 12 }}>{t.name}</div>
                <div style={{ fontSize: 10, color: '#78716c', marginTop: 2, lineHeight: 1.35 }}>
                  {t.description}
                </div>
              </div>
            </button>
          ))}
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
