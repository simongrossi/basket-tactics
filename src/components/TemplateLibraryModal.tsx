'use client';

import { useEffect } from 'react';
import { TEMPLATES, type Template } from '@/lib/data/templates';
import { COLORS } from './ui';

interface TemplateLibraryModalProps {
  hasWorkInProgress: boolean;
  onLoad: (template: Template) => void;
  onClose: () => void;
}

export function TemplateLibraryModal({ hasWorkInProgress, onLoad, onClose }: TemplateLibraryModalProps) {
  const c = COLORS.offense;

  // Échap pour fermer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleLoad = (t: Template) => {
    if (hasWorkInProgress) {
      if (!confirm(`Charger "${t.name}" ? Le travail en cours sera remplacé.`)) return;
    }
    onLoad(t);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '85vh',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: `1px solid ${c.border}`,
            background: c.bg,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.accentText, letterSpacing: '-0.01em' }}>
              📚 Bibliothèque de systèmes
            </div>
            <div style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>
              {TEMPLATES.length} systèmes prêts à l'emploi · clic pour charger
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: 20,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#64748b',
              padding: '4px 10px',
              borderRadius: 4,
              lineHeight: 1,
            }}
            title="Fermer (Échap)"
          >
            ×
          </button>
        </header>

        <div
          style={{
            padding: 16,
            overflow: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleLoad(t)}
              title={`Charger ${t.name}`}
              style={{
                textAlign: 'left',
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: '#fff',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                transition: 'border-color 120ms, background 120ms, transform 120ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = c.accent;
                e.currentTarget.style.background = c.bg;
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = c.border;
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    flex: '0 0 26px',
                    borderRadius: 6,
                    background: c.accent,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {t.steps.length}
                </div>
                <div style={{ fontWeight: 700, color: c.accentText, fontSize: 13, letterSpacing: '-0.01em' }}>
                  {t.name}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#57534e', lineHeight: 1.4 }}>
                {t.description}
              </div>
            </button>
          ))}
        </div>

        <footer
          style={{
            padding: '8px 16px',
            borderTop: `1px solid ${c.border}`,
            fontSize: 10,
            color: '#94a3b8',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Astuce : importer un JSON pour charger un système custom</span>
          <span>Échap pour fermer</span>
        </footer>
      </div>
    </div>
  );
}
