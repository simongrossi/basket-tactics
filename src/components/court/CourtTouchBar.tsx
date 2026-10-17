'use client';

// U04 — commandes tactiles du terrain. Chaque geste qui demandait une touche
// (Maj, Ctrl/⌘, Échap, Suppr, clic droit) a ici un bouton équivalent, pour
// construire et corriger un système au doigt sans clavier externe.

import type { AttackerId, DefenderId, Tool } from '@/lib/types';
import type { StickyModifiers } from '@/hooks/useCourtPointerHandlers';
import { Move, SendHorizontal, Waves, Route, PanelTop, StickyNote, Sparkles, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface CourtTouchBarProps {
  tool: Tool;
  onSetTool?: (t: Tool) => void;
  gesturesOnly?: boolean;
  modifiers: StickyModifiers;
  onChangeModifiers: (next: StickyModifiers) => void;
  /** Nombre de flèches de l'étape affichée (0 = bouton masqué). */
  annotationCount: number;
  onDeleteLastAnnotation: () => void;
  pendingAutoSourceId: AttackerId | null;
  onCancelPendingAuto: () => void;
  selectedDefenders: Set<DefenderId>;
  onClearSelection: () => void;
  /** Ouvre le popover d'orchestration tactique d'étape */
  onOpenComposer?: () => void;
  /** Progression d'étape directe sur le terrain (Déplacer > + Étape > Passe > + Étape...) */
  stepIndicator?: string;
  canPrevStep?: boolean;
  canNextStep?: boolean;
  onPrevStep?: () => void;
  onNextStep?: () => void;
  onAddStep?: () => void;
}

const FREEHAND_TOOLS: Tool[] = ['dribble', 'cut', 'screen'];

const QUICK_TOOLS: { value: Tool; label: string; shortKey: string; Icon: LucideIcon }[] = [
  { value: 'move', label: 'Déplacer', shortKey: '1', Icon: Move },
  { value: 'pass', label: 'Passe', shortKey: '2', Icon: SendHorizontal },
  { value: 'dribble', label: 'Dribble', shortKey: '3', Icon: Waves },
  { value: 'cut', label: 'Course', shortKey: '4', Icon: Route },
  { value: 'screen', label: 'Écran', shortKey: '5', Icon: PanelTop },
  { value: 'text', label: 'Note', shortKey: '6', Icon: StickyNote },
];

export function CourtTouchBar(props: CourtTouchBarProps) {
  const { tool, onSetTool, gesturesOnly, modifiers, onChangeModifiers } = props;
  const toggle = (key: keyof StickyModifiers) =>
    onChangeModifiers({ ...modifiers, [key]: !modifiers[key] });

  const selectionCount = props.selectedDefenders.size;

  return (
    <div
      role="toolbar"
      aria-label="Commandes tactiles du terrain"
      className="bt-court-touchbar"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Pilule d'outils rapides sur le terrain — accessible quel que soit l'onglet ouvert */}
      {onSetTool && !gesturesOnly && (
        <div
          role="group"
          aria-label="Outils de tracé rapides"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            padding: 3,
            borderRadius: 8,
            background: 'var(--bt-touchbar-bg)',
            border: '1px solid var(--bt-touchbar-border)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.14)',
            pointerEvents: 'auto',
          }}
        >
          {QUICK_TOOLS.map(({ value, label, shortKey, Icon }) => {
            const active = tool === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => onSetTool(value)}
                title={`${label} (touche ${shortKey})`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: active ? '1px solid #fdba74' : '1px solid transparent',
                  background: active ? '#d85a30' : 'transparent',
                  color: active ? '#ffffff' : 'var(--bt-touchbar-text)',
                  fontSize: 11,
                  fontWeight: active ? 700 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                <Icon size={13} strokeWidth={2.3} />
                <span>{label}</span>
              </button>
            );
          })}
          {props.onOpenComposer && (
            <button
              type="button"
              onClick={props.onOpenComposer}
              title="Assistant de combinaison tactique d'étape"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                marginLeft: 2,
                borderRadius: 6,
                border: '1px solid rgba(251, 146, 60, 0.35)',
                background: 'rgba(234, 88, 12, 0.14)',
                color: 'var(--bt-orange-soft, #fb923c)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Sparkles size={12} strokeWidth={2.3} />
              <span>Combiner</span>
            </button>
          )}
          {props.onAddStep && (
            <>
              <span
                aria-hidden="true"
                style={{
                  width: 1,
                  height: 18,
                  background: 'var(--bt-touchbar-border)',
                  margin: '0 3px',
                }}
              />
              {props.stepIndicator && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 1,
                    marginRight: 2,
                  }}
                >
                  {props.onPrevStep && (
                    <button
                      type="button"
                      onClick={props.onPrevStep}
                      disabled={!props.canPrevStep}
                      title="Étape précédente (←)"
                      aria-label="Étape précédente"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 22,
                        height: 22,
                        padding: 0,
                        borderRadius: 5,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--bt-touchbar-text)',
                        cursor: props.canPrevStep ? 'pointer' : 'not-allowed',
                        opacity: props.canPrevStep ? 0.9 : 0.3,
                      }}
                    >
                      <ChevronLeft size={14} strokeWidth={2.4} />
                    </button>
                  )}
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--bt-touchbar-text)',
                      padding: '0 3px',
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {props.stepIndicator}
                  </span>
                  {props.onNextStep && (
                    <button
                      type="button"
                      onClick={props.onNextStep}
                      disabled={!props.canNextStep}
                      title="Étape suivante (→)"
                      aria-label="Étape suivante"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 22,
                        height: 22,
                        padding: 0,
                        borderRadius: 5,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--bt-touchbar-text)',
                        cursor: props.canNextStep ? 'pointer' : 'not-allowed',
                        opacity: props.canNextStep ? 0.9 : 0.3,
                      }}
                    >
                      <ChevronRight size={14} strokeWidth={2.4} />
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={props.onAddStep}
                title="Valider l'étape actuelle et ajouter l'étape suivante (+ Étape)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid #ea580c',
                  background: 'linear-gradient(180deg, #f97316 0%, #ea580c 100%)',
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(234, 88, 12, 0.35)',
                  whiteSpace: 'nowrap',
                }}
              >
                <Plus size={13} strokeWidth={2.6} />
                <span>Étape</span>
              </button>
            </>
          )}
          {tool === 'move' && (
            <>
              <span
                aria-hidden="true"
                style={{
                  width: 1,
                  height: 18,
                  background: 'var(--bt-touchbar-border)',
                  margin: '0 3px',
                }}
              />
              <ToggleButton
                pressed={!!modifiers.multiSelect}
                onClick={() => toggle('multiSelect')}
                label="Sélection multiple"
                hint="Touchez des défenseurs ou glissez sur le vide pour les entourer (équivalent Maj)"
              />
              <ToggleButton
                pressed={!!modifiers.snap}
                onClick={() => toggle('snap')}
                label="Aimanter"
                hint="Placer le joueur sur les repères du terrain (équivalent Ctrl/⌘)"
              />
            </>
          )}
          {FREEHAND_TOOLS.includes(tool) && (
            <>
              <span
                aria-hidden="true"
                style={{
                  width: 1,
                  height: 18,
                  background: 'var(--bt-touchbar-border)',
                  margin: '0 3px',
                }}
              />
              <ToggleButton
                pressed={!!modifiers.freehand}
                onClick={() => toggle('freehand')}
                label="Tracé libre"
                hint="Dessiner la trajectoire du doigt : courbe, V-cut, L-cut (équivalent Maj)"
              />
            </>
          )}
        </div>
      )}

      {/* Quand onSetTool n'est pas fourni ou en mode gesturesOnly, afficher les toggles dans leur conteneur */}
      {(!onSetTool || gesturesOnly) && (
        <>
          {tool === 'move' && (
            <>
              <ToggleButton
                pressed={!!modifiers.multiSelect}
                onClick={() => toggle('multiSelect')}
                label="Sélection multiple"
                hint="Touchez des défenseurs ou glissez sur le vide pour les entourer (équivalent Maj)"
              />
              <ToggleButton
                pressed={!!modifiers.snap}
                onClick={() => toggle('snap')}
                label="Aimanter"
                hint="Placer le joueur sur les repères du terrain (équivalent Ctrl/⌘)"
              />
            </>
          )}
          {FREEHAND_TOOLS.includes(tool) && (
            <ToggleButton
              pressed={!!modifiers.freehand}
              onClick={() => toggle('freehand')}
              label="Tracé libre"
              hint="Dessiner la trajectoire du doigt : courbe, V-cut, L-cut (équivalent Maj)"
            />
          )}
        </>
      )}

      {selectionCount > 0 && (
        <button type="button" className="bt-touchbar-btn" onClick={props.onClearSelection}>
          Désélectionner ({selectionCount})
        </button>
      )}
      {props.pendingAutoSourceId && (
        <button type="button" className="bt-touchbar-btn" onClick={props.onCancelPendingAuto}>
          Annuler la passe de {props.pendingAutoSourceId}
        </button>
      )}
      {props.annotationCount > 0 && (
        <button
          type="button"
          className="bt-touchbar-btn"
          onClick={props.onDeleteLastAnnotation}
          title="Supprimer la dernière flèche de l’étape (Suppr)"
        >
          Supprimer la dernière flèche
        </button>
      )}
    </div>
  );
}

function ToggleButton({ pressed, onClick, label, hint }: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      className="bt-touchbar-btn"
      aria-pressed={pressed}
      onClick={onClick}
      title={hint}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 6,
        border: pressed ? '1px solid #fdba74' : '1px solid transparent',
        background: pressed ? '#d85a30' : 'transparent',
        color: pressed ? '#ffffff' : 'var(--bt-touchbar-text)',
        fontSize: 11,
        fontWeight: pressed ? 700 : 600,
        cursor: 'pointer',
        boxShadow: 'none',
        transition: 'all 0.12s ease',
      }}
    >
      {label}
    </button>
  );
}
