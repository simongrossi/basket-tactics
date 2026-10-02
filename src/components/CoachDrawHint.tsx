'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const DISMISSED_KEY = 'bt:coach-draw-hint:dismissed:v1';

/**
 * Bandeau d'aide affiché sur le terrain tant que le système est vierge
 * (après « Créer un système »). Disparaît dès la première action dessinée.
 * Peut être masqué durablement avec la croix. Seul ce bouton capte les
 * clics : le dessin reste possible à travers le reste du bandeau.
 */
export function CoachDrawHint({ visible }: { visible: boolean }) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch { /* La fermeture reste possible si le stockage est indisponible. */ }
  };

  // Attendre la préférence locale évite de réafficher l'aide au chargement.
  if (!visible || dismissed !== false) return null;
  return (
    <div
      role="note"
      aria-label="Comment dessiner un système"
      style={{
        position: 'absolute',
        left: '50%',
        // En haut, sous les boutons du terrain : le bas est occupé par le
        // porteur (O1) dans les placements de départ.
        top: 58,
        transform: 'translateX(-50%)',
        zIndex: 15,
        pointerEvents: 'none',
        maxWidth: 'min(420px, calc(100% - 120px))',
        padding: '8px 14px',
        borderRadius: 8,
        background: 'var(--bt-bg)',
        border: '1px solid var(--bt-border-strong)',
        color: 'var(--bt-text)',
        fontSize: 12,
        lineHeight: 1.45,
        boxShadow: 'var(--bt-shadow)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <strong style={{ color: 'var(--bt-orange-text)' }}>Dessiner le système</strong>
        <button
          type="button"
          className="bt-touch"
          aria-label="Masquer l’aide au dessin"
          title="Masquer l’aide au dessin"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={dismiss}
          style={{
            pointerEvents: 'auto',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            width: 28,
            height: 28,
            padding: 0,
            border: '1px solid var(--bt-border-strong)',
            borderRadius: 4,
            background: 'var(--bt-surface)',
            color: 'var(--bt-text)',
            cursor: 'pointer',
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        <li>Choisis une action dans <b>Attaque</b> : course, passe, dribble, écran.</li>
        <li>Glisse depuis un joueur jusqu’à sa destination.</li>
        <li>Clique <b>+ étape</b> (panneau Étapes) pour dessiner la suite.</li>
      </ol>
    </div>
  );
}
