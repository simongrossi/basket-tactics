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
        top: 52,
        transform: 'translateX(-50%)',
        zIndex: 15,
        pointerEvents: 'none',
        maxWidth: 'min(520px, calc(100% - 100px))',
        padding: '10px 14px',
        borderRadius: 10,
        background: 'rgba(15, 23, 42, 0.90)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(251, 146, 60, 0.38)',
        color: '#f8fafc',
        fontSize: 12,
        lineHeight: 1.4,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <strong style={{ color: '#fdba74', fontSize: 12.5 }}>🏀 Créer ton système en 3 gestes</strong>
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
            width: 24,
            height: 24,
            padding: 0,
            border: '1px solid #475569',
            borderRadius: 6,
            background: '#1e293b',
            color: '#f8fafc',
            cursor: 'pointer',
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        <div style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: '#fdba74', fontWeight: 800, fontSize: 11, marginBottom: 2 }}>① Choisir l'outil</div>
          <div style={{ fontSize: 11, color: '#e2e8f0' }}>Clique sur <b>Passe</b>, <b>Course</b>, <b>Dribble</b> ou <b>Écran</b>.</div>
        </div>
        <div style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: '#fdba74', fontWeight: 800, fontSize: 11, marginBottom: 2 }}>② Tracer sur le terrain</div>
          <div style={{ fontSize: 11, color: '#e2e8f0' }}>Glisse depuis un joueur jusqu’à sa cible.</div>
        </div>
        <div style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: '#fdba74', fontWeight: 800, fontSize: 11, marginBottom: 2 }}>③ Enchaîner</div>
          <div style={{ fontSize: 11, color: '#e2e8f0' }}>Clique sur <b>+ étape</b> pour dessiner la suite.</div>
        </div>
      </div>
    </div>
  );
}

