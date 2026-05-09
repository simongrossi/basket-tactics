'use client';

import { useState, useEffect, useRef } from 'react';

interface FloatingActionsMenuProps {
  presentMode: boolean;
  onTogglePresentMode: () => void;
  onOpenPlaybook: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
}

export function FloatingActionsMenu(props: FloatingActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clic extérieur ferme le menu
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

  // Échap ferme le menu (sans propager — empêche la sortie de plein écran)
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

  const runAndClose = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', top: 8, right: 8, zIndex: 50 }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        title="Actions globales"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '1px solid #cbd5e1',
          background: '#fff',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          fontWeight: 700,
          color: '#334155',
          boxShadow: '0 1px 3px rgba(15,23,42,0.12)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 38,
            right: 0,
            minWidth: 200,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 6px 16px rgba(15,23,42,0.12)',
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <MenuItem
            onClick={runAndClose(props.onTogglePresentMode)}
            label={props.presentMode ? '✕ quitter plein écran' : '🎬 plein écran'}
          />
          <MenuItem onClick={runAndClose(props.onOpenPlaybook)} label="📄 playbook PDF" />
          <MenuItem onClick={runAndClose(props.onExport)} label="exporter JSON" />
          <MenuItem onClick={runAndClose(props.onImport)} label="importer JSON" />
          <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0' }} />
          <MenuItem
            onClick={runAndClose(props.onReset)}
            label="reset complet"
            color="#b91c1c"
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick, label, color,
}: {
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        fontSize: 12,
        padding: '6px 10px',
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: color ?? '#334155',
        fontWeight: 500,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#f1f5f9';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {label}
    </button>
  );
}
