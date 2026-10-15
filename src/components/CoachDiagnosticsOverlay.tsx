'use client';

import { useEffect, useRef, useState } from 'react';
import type { CoachDiagnostic } from '@/lib/logic/coachDiagnostics';
import { CoachDiagnostics } from './CoachDiagnostics';

interface Props {
  diagnostics: CoachDiagnostic[];
  inline?: boolean;
}

/**
 * Diagnostics du coach (alertes tactiques et lectures).
 * Quand inline=true, s'intègre harmonieusement dans la topbar sans masquer le terrain.
 */
export function CoachDiagnosticsOverlay({ diagnostics, inline }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (diagnostics.length === 0) return null;

  const critWarn = diagnostics.filter(
    (d) => !d.tag.startsWith('read-') && (d.severity === 'critical' || d.severity === 'warning')
  ).length;
  const reads = diagnostics.filter((d) => d.tag.startsWith('read-')).length;

  return (
    <div
      ref={ref}
      style={inline ? {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        zIndex: 50,
      } : {
        position: 'absolute',
        top: 8,
        right: 48,
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    >
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Lecture coach"
          aria-label="Ouvrir la lecture coach"
          className="bt-touch"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 30,
            padding: '0 10px',
            background: 'var(--bt-surface)',
            border: '1px solid var(--bt-border)',
            borderRadius: 15,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--bt-text)',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>💡</span>
          {critWarn > 0 && (
            <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              ⚠ {critWarn}
            </span>
          )}
          {critWarn > 0 && reads > 0 && <span style={{ opacity: 0.35 }}>·</span>}
          {reads > 0 && (
            <span style={{ color: '#93c5fd', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              → {reads}
            </span>
          )}
        </button>
      )}
      {open && (
        <div style={{
          position: inline ? 'absolute' : 'relative',
          top: inline ? 'calc(100% + 6px)' : undefined,
          right: inline ? 0 : undefined,
          maxWidth: 360,
          minWidth: 260,
          zIndex: 100,
          boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
        }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Replier"
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              zIndex: 1,
              width: 20,
              height: 20,
              padding: 0,
              border: '1px solid #343b47',
              borderRadius: 4,
              background: '#252b34',
              color: '#cbd5e1',
              fontSize: 12,
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
          <CoachDiagnostics diagnostics={diagnostics} />
        </div>
      )}
    </div>
  );
}
