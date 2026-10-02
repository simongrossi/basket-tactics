'use client';

import { X } from 'lucide-react';
import { SHORTCUT_GROUPS } from '@/hooks/useShellShortcuts';

// Aide-mémoire des raccourcis clavier (touche « ? »).
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="bt-palette-backdrop" onMouseDown={onClose}>
      <div
        className="bt-palette bt-shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Raccourcis clavier"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      >
        <header className="bt-panel-head">
          <h2>Raccourcis clavier</h2>
          <button type="button" autoFocus className="bt-icon-btn" onClick={onClose} title="Fermer" aria-label="Fermer">
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="bt-shortcuts-body">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <div className="bt-palette-group">{group.title}</div>
              <dl>
                {group.items.map((item) => (
                  <div key={item.keys} className="bt-shortcut-row">
                    <dt>{item.label}</dt>
                    <dd><kbd>{item.keys}</kbd></dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
