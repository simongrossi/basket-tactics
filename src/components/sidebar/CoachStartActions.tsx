'use client';

import { Plus, BookOpen } from 'lucide-react';
import { SidebarNavItem } from './SidebarNavItem';
import { SIDEBAR } from './tokens';

export function CoachStartActions({ collapsed, onCreate, onTemplates }: {
  collapsed: boolean;
  onCreate: () => void;
  onTemplates: () => void;
  onSessions?: () => void;
}) {
  if (collapsed) {
    return (
      <nav aria-label="Préparer mon entraînement" style={{ padding: '4px 6px', borderBottom: `1px solid ${SIDEBAR.borderSubtle}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <SidebarNavItem icon={Plus} label="Nouveau système" collapsed onClick={onCreate} />
        <SidebarNavItem icon={BookOpen} label="Modèles" collapsed onClick={onTemplates} />
      </nav>
    );
  }
  return (
    <nav aria-label="Préparer mon entraînement" style={{ padding: '4px 8px 6px', borderBottom: `1px solid ${SIDEBAR.borderSubtle}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
      <button
        type="button"
        onClick={onCreate}
        className="bt-touch"
        title="Réinitialiser le terrain pour dessiner un nouveau système"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          padding: '6px 6px',
          borderRadius: 6,
          border: '1px solid rgba(234, 88, 12, 0.45)',
          background: 'rgba(234, 88, 12, 0.14)',
          color: '#fb923c',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <Plus size={13} strokeWidth={2.5} />
        <span>Nouveau</span>
      </button>
      <button
        type="button"
        onClick={onTemplates}
        className="bt-touch"
        title="Partir d'un système pré-construit de la bibliothèque"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          padding: '6px 6px',
          borderRadius: 6,
          border: `1px solid ${SIDEBAR.border}`,
          background: SIDEBAR.bgActive,
          color: SIDEBAR.text,
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <BookOpen size={13} strokeWidth={2} />
        <span>Modèles</span>
      </button>
    </nav>
  );
}

