'use client';

import { useState, useEffect } from 'react';

import { Plus, ChevronLeft, ChevronRight, BookmarkCheck, BookmarkPlus, Trash2 } from 'lucide-react';
import type { ActionTimingAnchor, AttackerPositions, Tool } from '@/lib/types';
import type { StickyModifiers } from '@/hooks/useCourtPointerHandlers';
import { Panel, Section, COLORS } from './ui';
import { useSidebarTheme, DARK_PANEL } from './sidebar/SidebarThemeContext';
import { InterfaceGate } from './interface/InterfaceLevel';
import { TOOL_KEYS } from '@/hooks/useKeyboardShortcuts';
import {
  STARTING_FORMATIONS,
  loadCustomStartingFormations,
  saveCustomStartingFormation,
  deleteCustomStartingFormation,
  type StartingFormation,
} from '@/lib/data/startingFormations';

interface OffenseToolsPanelProps {
  tool: Tool;
  onSetTool: (t: Tool) => void;
  actionTimingAnchor?: ActionTimingAnchor;
  onSetActionTimingAnchor?: (mode: ActionTimingAnchor) => void;
  onApplyStartingFormation?: (formationId: string) => void;
  onOpenComposer?: () => void;
  modifiers?: StickyModifiers;
  onChangeModifiers?: (next: StickyModifiers) => void;
  /** Contrôles d'étape rapides pour dessiner sans changer d'onglet */
  stepIndicator?: string;
  canPrevStep?: boolean;
  canNextStep?: boolean;
  onPrevStep?: () => void;
  onNextStep?: () => void;
  onAddStep?: () => void;
  /** Fige la disposition courante comme le départ (Étape 0) du système */
  onSetStartingPosition?: () => void;
  currentAttackerPositions?: AttackerPositions;
}


const shortcutKeyFor = (tool: Tool): string =>
  (Object.keys(TOOL_KEYS).find((k) => TOOL_KEYS[k] === tool) ?? '').toUpperCase();

const TOOLS: { value: Tool; label: string }[] = [
  { value: 'move', label: 'Déplacer' },
  { value: 'pass', label: 'Passe' },
  { value: 'dribble', label: 'Dribble' },
  { value: 'cut', label: 'Course' },
  { value: 'screen', label: 'Écran' },
  { value: 'text', label: 'Note' },
];

function ToolIcon({ tool, color }: { tool: Tool; color: string }) {
  switch (tool) {
    case 'move':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M8 2 v12 M2 8 h12 M5 5 L2 8 L5 11 M11 5 L14 8 L11 11 M5 5 L8 2 L11 5 M5 11 L8 14 L11 11" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'pass':
      return (
        <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
          <line x1="1" y1="5" x2="16" y2="5" stroke={color} strokeWidth="1.7" strokeDasharray="2 2.5" strokeLinecap="round" />
          <path d="M15 1 L20 5 L15 9" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'dribble':
      return (
        <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
          <path d="M1 5 Q3 0 5 5 T9 5 T13 5 T17 5" stroke={color} strokeWidth="1.7" fill="none" strokeLinecap="round" />
          <path d="M16 1 L20 5 L16 9" stroke={color} strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'cut':
      return (
        <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
          <line x1="1" y1="5" x2="16" y2="5" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
          <path d="M15 1 L20 5 L15 9" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'text':
      return (
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
          <rect x={1} y={2} width={14} height={12} rx={2}
                fill="none" stroke={color} strokeWidth={1.5}/>
          <text x={8} y={11} textAnchor="middle"
                fontSize={9} fontWeight={700} fill={color}>T</text>
        </svg>
      );
    case 'screen':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <line x1="8" y1="2" x2="8" y2="11" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
          <line x1="3" y1="12" x2="13" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
  }
}

export function OffenseToolsPanel(props: OffenseToolsPanelProps) {
  const c = COLORS.offense;
  const { dark } = useSidebarTheme();
  const idleBg = dark ? DARK_PANEL.bgSubtle : '#fff';
  const idleBorder = dark ? DARK_PANEL.border : c.border;
  const idleText = dark ? DARK_PANEL.text : c.accentText;
  const actionTimingAnchor = props.actionTimingAnchor ?? 'start';
  return (
    <Panel theme="offense" title="⚪ Attaque">
      <Section theme="offense" label="Tracer sur le terrain" open>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 5,
          }}
        >
          {TOOLS.map((t) => {
            const active = props.tool === t.value;
            const shortcut = shortcutKeyFor(t.value);
            return (
              <button
                key={t.value}
                onClick={() => props.onSetTool(t.value)}
                title={`Outil ${t.label} (touche ${shortcut})`}
                aria-pressed={active}
                className="bt-touch"
                style={{
                  fontSize: 12,
                  padding: '8px 8px',
                  borderRadius: 6,
                  border: `1.5px solid ${active ? c.accent : idleBorder}`,
                  background: active ? '#c2410c' : idleBg,
                  color: active ? '#fff' : idleText,
                  cursor: 'pointer',
                  fontWeight: active ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: active ? '0 1px 4px rgba(194, 65, 12, 0.35)' : 'none',
                  transition: 'all 0.12s ease',
                }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <ToolIcon tool={t.value} color={active ? '#fff' : idleText} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.label}
                  </span>
                </div>
                {shortcut && (
                  <kbd
                    style={{
                      fontSize: 9,
                      padding: '1px 4px',
                      borderRadius: 3,
                      background: active ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.06)',
                      color: active ? '#ffffff' : 'inherit',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                    }}
                  >
                    {shortcut}
                  </kbd>
                )}
              </button>
            );
          })}
        </div>

        {/* Contrôle d'étape rapide : dessiner étape par étape sans quitter l'onglet Attaque */}
        {props.onAddStep && (
          <div
            style={{
              marginTop: 8,
              padding: '5px 6px',
              borderRadius: 6,
              border: `1px solid ${idleBorder}`,
              background: idleBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 4,
              minWidth: 0,
            }}
          >
            {props.onPrevStep && props.onNextStep && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 1, minWidth: 0, flex: '1 1 auto' }}>
                <button
                  type="button"
                  onClick={props.onPrevStep}
                  disabled={!props.canPrevStep}
                  title="Étape précédente (←)"
                  aria-label="Étape précédente"
                  style={{
                    width: 24,
                    height: 24,
                    padding: 0,
                    borderRadius: 4,
                    border: 'none',
                    background: 'transparent',
                    color: idleText,
                    cursor: props.canPrevStep ? 'pointer' : 'not-allowed',
                    opacity: props.canPrevStep ? 1 : 0.35,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: idleText,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textAlign: 'center',
                    flex: '1 1 auto',
                    minWidth: 0,
                  }}
                >
                  {props.stepIndicator === 'Placement de départ' ? 'Départ' : (props.stepIndicator || 'Étape 1')}
                </span>
                <button
                  type="button"
                  onClick={props.onNextStep}
                  disabled={!props.canNextStep}
                  title="Étape suivante (→)"
                  aria-label="Étape suivante"
                  style={{
                    width: 24,
                    height: 24,
                    padding: 0,
                    borderRadius: 4,
                    border: 'none',
                    background: 'transparent',
                    color: idleText,
                    cursor: props.canNextStep ? 'pointer' : 'not-allowed',
                    opacity: props.canNextStep ? 1 : 0.35,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={props.onAddStep}
              title="Valider cette étape et préparer l'étape suivante (+ étape)"
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '5px 9px',
                borderRadius: 5,
                border: '1px solid #ea580c',
                background: 'linear-gradient(180deg, #f97316 0%, #ea580c 100%)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Plus size={13} strokeWidth={2.5} />
              <span>Étape</span>
            </button>
          </div>
        )}

        {props.onOpenComposer && (
          <button
            type="button"
            className="bt-touch"
            onClick={props.onOpenComposer}
            title="Orchestrateur tactique d'étape : définir les actions combinées (écrans, coupes, passes) en 1 clic sans dessiner"
            style={{
              width: '100%',
              marginTop: 6,
              padding: '7px 10px',
              borderRadius: 6,
              border: '1px solid rgba(234, 88, 12, 0.45)',
              background: 'linear-gradient(180deg, rgba(234, 88, 12, 0.22) 0%, rgba(194, 65, 12, 0.28) 100%)',
              color: '#fb923c',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span>⚡ Assistant d&apos;étape (1 clic)</span>
          </button>
        )}

        <InterfaceGate min="analysis">
          {props.onSetActionTimingAnchor && (
            <label
              title="Coché : le tracé arrive au moment courant de la timeline. Décoché : il démarre au moment courant."
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginTop: 6,
                padding: '6px 8px',
                borderRadius: 6,
                border: `1px solid ${actionTimingAnchor === 'end' ? c.accent : idleBorder}`,
                background: actionTimingAnchor === 'end'
                  ? (dark ? 'rgba(216, 90, 48, 0.18)' : '#fff7ed')
                  : idleBg,
                color: actionTimingAnchor === 'end' ? c.accentText : idleText,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span>Ancrer à la fin de l&apos;action</span>
              <input
                type="checkbox"
                checked={actionTimingAnchor === 'end'}
                onChange={(e) => props.onSetActionTimingAnchor?.(e.target.checked ? 'end' : 'start')}
              />
            </label>
          )}
        </InterfaceGate>

        {props.onChangeModifiers && props.modifiers && (
          <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              type="button"
              className="bt-touch"
              onClick={() => props.onChangeModifiers?.({ ...props.modifiers, multiSelect: !props.modifiers?.multiSelect })}
              title="Sélectionner plusieurs joueurs pour les déplacer ou leur assigner une règle ensemble (équivalent Maj)"
              style={{
                padding: '6px 4px',
                borderRadius: 6,
                border: `1px solid ${props.modifiers.multiSelect ? c.accent : idleBorder}`,
                background: props.modifiers.multiSelect ? (dark ? 'rgba(216, 90, 48, 0.25)' : '#ffedd5') : idleBg,
                color: props.modifiers.multiSelect ? c.accentText : idleText,
                fontSize: 11,
                fontWeight: props.modifiers.multiSelect ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              🔗 Multi-sélection
            </button>
            <button
              type="button"
              className="bt-touch"
              onClick={() => props.onChangeModifiers?.({ ...props.modifiers, snap: !props.modifiers?.snap })}
              title="Aimanter les joueurs aux repères géométriques clés du terrain (équivalent Ctrl/⌘)"
              style={{
                padding: '6px 4px',
                borderRadius: 6,
                border: `1px solid ${props.modifiers.snap ? c.accent : idleBorder}`,
                background: props.modifiers.snap ? (dark ? 'rgba(216, 90, 48, 0.25)' : '#ffedd5') : idleBg,
                color: props.modifiers.snap ? c.accentText : idleText,
                fontSize: 11,
                fontWeight: props.modifiers.snap ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              🧲 Aimanter
            </button>
          </div>
        )}
      </Section>

      {props.onApplyStartingFormation && (
        <Section theme="offense" label="Placement de départ" open>
          {props.onSetStartingPosition && (
            <button
              type="button"
              className="bt-touch"
              onClick={props.onSetStartingPosition}
              title="Figer la disposition actuelle des joueurs comme la position de départ (Étape 0) du système"
              style={{
                width: '100%',
                marginBottom: 8,
                padding: '7px 10px',
                borderRadius: 6,
                border: '1px solid #ea580c',
                background: 'linear-gradient(180deg, #f97316 0%, #ea580c 100%)',
                color: '#fff',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 1px 4px rgba(234, 88, 12, 0.35)',
              }}
            >
              <BookmarkCheck size={14} strokeWidth={2.4} />
              <span>Figer comme début de système</span>
            </button>
          )}

          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Formations classiques
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
            {[
              { id: '5-out', label: '5-Out (Ouvert)' },
              { id: '4-out-1-in', label: '4-Out 1-In' },
              { id: 'horns', label: 'Horns (Cornes)' },
              { id: '1-4-high', label: '1-4 Haut' },
              { id: '1-4-low', label: '1-4 Bas' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className="bt-touch"
                onClick={() => props.onApplyStartingFormation?.(f.id)}
                title={`Disposer instantanément l'équipe en ${f.label}`}
                style={{
                  fontSize: 11,
                  padding: '6px 4px',
                  borderRadius: 5,
                  border: `1px solid ${idleBorder}`,
                  background: idleBg,
                  color: idleText,
                  cursor: 'pointer',
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <CustomFormationsManager
            currentPositions={props.currentAttackerPositions}
            onApply={props.onApplyStartingFormation}
            idleBorder={idleBorder}
            idleBg={idleBg}
            idleText={idleText}
          />
        </Section>
      )}
    </Panel>
  );
}

function CustomFormationsManager({
  currentPositions,
  onApply,
  idleBorder,
  idleBg,
  idleText,
}: {
  currentPositions?: AttackerPositions;
  onApply?: (id: string) => void;
  idleBorder: string;
  idleBg: string;
  idleText: string;
}) {
  const [customList, setCustomList] = useState<StartingFormation[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [presetName, setPresetName] = useState('');

  useEffect(() => {
    setCustomList(loadCustomStartingFormations());
  }, []);

  const handleSave = () => {
    if (!presetName.trim() || !currentPositions) return;
    const newFormation: StartingFormation = {
      id: `custom-${Date.now()}`,
      name: presetName.trim(),
      description: 'Formation personnalisée enregistrée par le coach.',
      positions: structuredClone(currentPositions),
    };
    const updated = saveCustomStartingFormation(newFormation);
    setCustomList(updated);
    setPresetName('');
    setIsAdding(false);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteCustomStartingFormation(id);
    setCustomList(updated);
  };

  return (
    <div style={{ marginTop: 6, borderTop: `1px solid ${idleBorder}`, paddingTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Mes formations ({customList.length})
        </span>
        {!isAdding && currentPositions && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            title="Enregistrer la disposition actuelle en tant que formation réutilisable"
            style={{
              border: 'none',
              background: 'transparent',
              color: '#ea580c',
              fontSize: 10.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: 0,
            }}
          >
            <BookmarkPlus size={12} strokeWidth={2.4} />
            <span>+ Enregistrer</span>
          </button>
        )}
      </div>

      {isAdding && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <input
            type="text"
            value={presetName}
            placeholder="Nom du départ (ex: Box, Stagger...)"
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setIsAdding(false);
            }}
            autoFocus
            style={{
              flex: 1,
              fontSize: 11,
              padding: '3px 6px',
              borderRadius: 4,
              border: '1px solid #ea580c',
              background: idleBg,
              color: idleText,
            }}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!presetName.trim()}
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 4,
              border: 'none',
              background: '#ea580c',
              color: '#fff',
              cursor: presetName.trim() ? 'pointer' : 'not-allowed',
              opacity: presetName.trim() ? 1 : 0.5,
            }}
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => setIsAdding(false)}
            style={{
              fontSize: 10.5,
              padding: '3px 6px',
              borderRadius: 4,
              border: `1px solid ${idleBorder}`,
              background: idleBg,
              color: '#94a3b8',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {customList.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {customList.map((f) => (
            <div
              key={f.id}
              onClick={() => onApply?.(f.id)}
              title={`Appliquer "${f.name}"`}
              style={{
                fontSize: 11,
                padding: '5px 6px',
                borderRadius: 5,
                border: `1px solid ${idleBorder}`,
                background: idleBg,
                color: idleText,
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 4,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
              </span>
              <button
                type="button"
                onClick={(e) => handleDelete(f.id, e)}
                title="Supprimer cette formation enregistrée"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#94a3b8';
                }}
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        !isAdding && (
          <div style={{ fontSize: 10.5, color: '#94a3b8', fontStyle: 'italic', padding: '2px 0' }}>
            Aucun départ personnalisé. Placez vos joueurs et cliquez sur + Enregistrer.
          </div>
        )
      )}
    </div>
  );
}


