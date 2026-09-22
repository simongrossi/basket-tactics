'use client';

/**
 * Bandeau d'aide affiché sur le terrain tant que le système est vierge
 * (après « Créer un système »). Disparaît dès la première action dessinée.
 * Ne capte aucun clic : le dessin reste possible à travers le bandeau.
 */
export function CoachDrawHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
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
      <strong style={{ color: '#fdba74' }}>Dessiner le système</strong>
      <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        <li>Choisis une action dans <b>Attaque</b> : course, passe, dribble, écran.</li>
        <li>Glisse depuis un joueur jusqu’à sa destination.</li>
        <li>Clique <b>+ étape</b> (panneau Étapes) pour dessiner la suite.</li>
      </ol>
    </div>
  );
}
