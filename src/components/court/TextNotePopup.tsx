import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Position viewport (clientX/clientY) où ancrer le popup. */
  screen: { x: number; y: number };
  /** Texte initial (vide pour création). */
  initialText: string;
  /** Vrai en mode édition d'une note existante : affiche le bouton `×`. */
  isEditing: boolean;
  /** Soumission. Le caller décide : texte non vide → addTextNote /
   *  updateTextNote ; texte vide → équivalent suppression (gérée par
   *  onCancel pour la création, onDelete pour l'édition). */
  onSubmit: (text: string) => void;
  /** Suppression explicite (bouton `×` ou texte vide en édition). */
  onDelete: () => void;
  /** Annulation (Échap, ou clic extérieur avec texte vide en création). */
  onCancel: () => void;
}

export function TextNotePopup({
  screen,
  initialText,
  isEditing,
  onSubmit,
  onDelete,
  onCancel,
}: Props) {
  const [text, setText] = useState(initialText);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Focus automatique à l'ouverture.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Fermeture au clic extérieur. Le listener est posé après le pointerdown
  // d'ouverture (effet exécuté après render) — aucun conflit.
  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        const trimmed = text.trim();
        if (isEditing) {
          // Édition : vide = supprime ; sinon submit.
          if (trimmed) onSubmit(trimmed);
          else onDelete();
        } else {
          // Création : vide = annule ; sinon submit.
          if (trimmed) onSubmit(trimmed);
          else onCancel();
        }
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [isEditing, onCancel, onDelete, onSubmit, text]);

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        left: screen.x,
        top: screen.y,
        zIndex: 1000,
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.2)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        borderRadius: 6,
        padding: 6,
        display: 'flex',
        gap: 4,
        alignItems: 'center',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="note…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const trimmed = text.trim();
            if (isEditing && !trimmed) onDelete();
            else if (trimmed) onSubmit(trimmed);
            else onCancel();
          } else if (e.key === 'Escape') {
            onCancel();
          }
        }}
        style={{
          minWidth: 180,
          padding: '4px 6px',
          fontSize: 13,
          border: '1px solid #ccc',
          borderRadius: 4,
        }}
      />
      {isEditing && (
        <button
          type="button"
          onClick={onDelete}
          title="Supprimer la note"
          style={{
            padding: '2px 8px',
            cursor: 'pointer',
            color: '#b00',
            background: 'transparent',
            border: 'none',
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
