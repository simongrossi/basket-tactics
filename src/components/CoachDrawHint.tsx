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
        background: 'rgba(15, 23, 42, 0.88)',
        border: '1px solid #334155',
        color: '#f8fafc',
        fontSize: 12,
        lineHeight: 1.45,
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <strong style={{ color: '#fdba74' }}>Dessiner le système</strong>
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
            border: '1px solid #475569',
            borderRadius: 4,
            background: '#1e293b',
            color: '#f8fafc',
            cursor: 'pointer',
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        <li>Choisis une action dans <b>Attaque</b> : Course, Passe, Dribble, Écran.</li>
        <li>Glisse depuis un joueur jusqu’à sa destination.</li>
        <li>Clique sur <b>+ Étape</b> (ou <b>+ étape</b>) pour dessiner la suite sans changer d’onglet.</li>
      </ol>
    </div>
  );
}

