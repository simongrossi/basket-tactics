'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { SIDEBAR } from './tokens';

type Props = {
  presentMode: boolean;
  onTogglePresentMode: () => void;
  isPlayerMode?: boolean;
  onTogglePlayerMode?: () => void;
  onOpenPlayerTimeline: () => void;
  /** E.2 — Ouvre la modal d'export GIF / WebM. */
  onOpenExport: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  onShare?: () => Promise<string>;
  onCopySituation?: () => void;
  onCopyAnimation?: () => void;
  onPasteSituation?: () => void;
};

export function SidebarOverflowMenu({
  presentMode,
  onTogglePresentMode,
  isPlayerMode = false,
  onTogglePlayerMode,
  onOpenPlayerTimeline,
  onOpenExport,
  onExport,
  onImport,
  onReset,
  onShare,
  onCopySituation,
  onCopyAnimation,
  onPasteSituation,
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [portalPos, setPortalPos] = useState<{ right: number; top: number } | null>(null);

  // Recalcule la position du portail quand le menu s'ouvre. Le popup est rendu
  // dans document.body via createPortal pour échapper à overflow:hidden de
  // la barre d'outils.
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPortalPos({
      right: window.innerWidth - rect.right,
      top: rect.bottom + 6,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  // Le menu lui-même, à rendre via portail pour qu'il échappe à overflow:hidden.
  const menuNode = open && portalPos && typeof document !== 'undefined' && (
    <div
      ref={(el) => {
        // On garde une ref sur le menu pour le test "click outside" via
        // containerRef (qui couvre bouton + menu).
        if (containerRef.current && el && !containerRef.current.contains(el)) {
          // Note : on ne peut pas vraiment "ajouter" un élément au containerRef,
          // donc on track le menu séparément via menuRef (cf. plus bas).
        }
      }}
      style={{
        position: 'fixed',
        right: portalPos.right,
        top: portalPos.top,
        maxHeight: `calc(100vh - ${portalPos.top + 8}px)`,
        overflowY: 'auto',
        minWidth: 220,
        background: SIDEBAR.bgActive,
        border: `1px solid ${SIDEBAR.border}`,
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        zIndex: 1000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Item
        onClick={run(onTogglePresentMode)}
        label={presentMode ? 'Quitter plein écran' : 'Plein écran'}
      />
      {onTogglePlayerMode && (
        <Item
          onClick={run(onTogglePlayerMode)}
          label={isPlayerMode ? '✍️ Mode Éditeur' : '📖 Mode Lecteur (Joueur)'}
        />
      )}
      <Item onClick={run(onOpenPlayerTimeline)} label="Timeline par joueur" />
      <Item onClick={run(onOpenExport)} label="🎥 Exporter (GIF / WebM)" />
      <Divider />
      {onCopySituation && <Item onClick={run(onCopySituation)} label="Copier la situation (code)" />}
      {onCopyAnimation && <Item onClick={run(onCopyAnimation)} label="Copier l’animation (code)" />}
      {onPasteSituation && <Item onClick={run(onPasteSituation)} label="Coller une situation / animation" />}
      {(onCopySituation || onCopyAnimation || onPasteSituation) && <Divider />}
      {onShare && (
        <>
          <Item
            onClick={async () => {
              try {
                const url = await onShare();
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch (err) {
                console.error('Failed to copy share link:', err);
                alert('Erreur lors de la copie du lien.');
              }
            }}
            label={copied ? '✓ Lien copié !' : '🔗 Partager tactique (lien)'}
            style={copied ? { color: '#34d399', fontWeight: 650 } : undefined}
          />
          <Divider />
        </>
      )}
      <Item
        onClick={run(() => {
          if (typeof window !== 'undefined') window.location.href = '/simulation';
        })}
        label="🎬 Mode simulation →"
      />
      <Divider />
      <Item onClick={run(onExport)} label="Exporter JSON" />
      <Item onClick={run(onImport)} label="Importer JSON" />
      <Divider />
      <Item onClick={run(onReset)} label="Reset complet" danger />
    </div>
  );

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        className="bt-icon-btn"
        onClick={() => setOpen((o) => !o)}
        title="Actions globales"
        aria-label="Actions globales"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {menuNode && createPortal(menuNode, document.body)}
    </div>
  );
}

function Item({
  onClick,
  label,
  danger,
  style,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        fontSize: 12,
        padding: '7px 10px',
        borderRadius: 5,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: danger ? '#fca5a5' : SIDEBAR.text,
        fontWeight: 500,
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'rgba(239, 68, 68, 0.15)' : SIDEBAR.bgHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: SIDEBAR.border, margin: '4px 6px' }} />;
}
