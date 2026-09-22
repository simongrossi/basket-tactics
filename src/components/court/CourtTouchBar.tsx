'use client';

// U04 — commandes tactiles du terrain. Chaque geste qui demandait une touche
// (Maj, Ctrl/⌘, Échap, Suppr, clic droit) a ici un bouton équivalent, pour
// construire et corriger un système au doigt sans clavier externe.

import type { AttackerId, DefenderId, Tool } from '@/lib/types';
import type { StickyModifiers } from '@/hooks/useCourtPointerHandlers';

interface CourtTouchBarProps {
  tool: Tool;
  modifiers: StickyModifiers;
  onChangeModifiers: (next: StickyModifiers) => void;
  /** Nombre de flèches de l'étape affichée (0 = bouton masqué). */
  annotationCount: number;
  onDeleteLastAnnotation: () => void;
  pendingAutoSourceId: AttackerId | null;
  onCancelPendingAuto: () => void;
  selectedDefenders: Set<DefenderId>;
  onClearSelection: () => void;
}

const FREEHAND_TOOLS: Tool[] = ['dribble', 'cut', 'screen'];

export function CourtTouchBar(props: CourtTouchBarProps) {
  const { tool, modifiers, onChangeModifiers } = props;
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
      {selectionCount > 0 && (
        <button type="button" className="bt-touch bt-touchbar-btn" onClick={props.onClearSelection}>
          Désélectionner ({selectionCount})
        </button>
      )}
      {props.pendingAutoSourceId && (
        <button type="button" className="bt-touch bt-touchbar-btn" onClick={props.onCancelPendingAuto}>
          Annuler la passe de {props.pendingAutoSourceId}
        </button>
      )}
      {props.annotationCount > 0 && (
        <button
          type="button"
          className="bt-touch bt-touchbar-btn"
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
      className="bt-touch bt-touchbar-btn"
      aria-pressed={pressed}
      onClick={onClick}
      title={hint}
    >
      {label}
    </button>
  );
}
