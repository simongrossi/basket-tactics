'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { SIDEBAR } from './tokens';

type Props = {
  presentMode: boolean;
  onTogglePresentMode: () => void;
  onOpenPlayerTimeline: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  collapsed?: boolean;
};

export function SidebarOverflowMenu({
  presentMode,
  onTogglePresentMode,
  onOpenPlayerTimeline,
  onExport,
  onImport,
  onReset,
  collapsed = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Actions globales"
        aria-label="Actions globales"
        style={{
          width: 28,
          height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 6,
          background: open ? SIDEBAR.bgHover : 'transparent',
          color: open ? SIDEBAR.text : SIDEBAR.textMuted,
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = SIDEBAR.bgHover;
          e.currentTarget.style.color = SIDEBAR.text;
        }}
        onMouseLeave={(e) => {
          if (open) return;
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = SIDEBAR.textMuted;
        }}
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            left: collapsed ? 0 : 'auto',
            right: collapsed ? 'auto' : 0,
            minWidth: 220,
            background: SIDEBAR.bgActive,
            border: `1px solid ${SIDEBAR.border}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            zIndex: 100,
          }}
        >
          <Item
            onClick={run(onTogglePresentMode)}
            label={presentMode ? 'Quitter plein écran' : 'Plein écran'}
          />
          <Item onClick={run(onOpenPlayerTimeline)} label="Timeline par joueur" />
          <Divider />
          <Item onClick={run(onExport)} label="Exporter JSON" />
          <Item onClick={run(onImport)} label="Importer JSON" />
          <Divider />
          <Item onClick={run(onReset)} label="Reset complet" danger />
        </div>
      )}
    </div>
  );
}

function Item({
  onClick,
  label,
  danger,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
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
