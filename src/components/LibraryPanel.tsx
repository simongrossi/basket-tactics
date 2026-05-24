'use client';

import { useState } from 'react';
import type { AppState } from '@/lib/types';
import { CLASSIC_TEMPLATES, LAB_TEMPLATES, type Template } from '@/lib/data/templates';
import type { UserLibrary, SavedSystem } from '@/lib/data/library';
import { Panel, COLORS } from './ui';
import { LibraryModal } from './LibraryModal';

interface LibraryPanelProps {
  state: AppState;
  library: UserLibrary;
  onLoadTemplate: (template: Template) => void;
  onLoadSavedSystem: (sys: SavedSystem) => void;
  onSaveSystem: (folderId: string, name: string, description?: string, tags?: string[]) => void;
  onRenameSystem: (systemId: string, newName: string) => void;
  onDeleteSystem: (systemId: string) => void;
  onMoveSystem: (systemId: string, targetFolderId: string) => void;
  onSetSystemTags: (systemId: string, tags: string[]) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onExportFolder: (folderId: string) => string | null;
  onImportFolder: (json: string) => void;
}

/**
 * Bloc dédié à la bibliothèque : un bouton qui ouvre la modal complète,
 * + un raccourci "sauvegarder l'état courant" si l'utilisateur a un
 * dossier personnel disponible.
 */
export function LibraryPanel(props: LibraryPanelProps) {
  const c = COLORS.offense;
  const [open, setOpen] = useState(false);
  const { state, library } = props;
  const hasWork = state.steps.length > 1 || state.steps[0].annotations.length > 0;
  const userSystemCount = library.folders.reduce((sum, f) => sum + f.systems.length, 0);
  const classicCount = CLASSIC_TEMPLATES.length;
  const labCount = LAB_TEMPLATES.length;
  const totalCount = classicCount + labCount + userSystemCount;

  return (
    <Panel theme="offense" title="📚 Bibliothèque">
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${c.border}`,
          borderLeft: `3px solid ${c.accent}`,
          background: c.bg,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          color: c.accentText,
          transition: 'background 120ms, border-color 120ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = c.bgSubtle; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = c.bg; }}
        title={`${classicCount} systèmes classiques + ${labCount} lab dev + ${userSystemCount} sauvegardés`}
      >
        <span>📚 {totalCount} systèmes ({classicCount} classiques + {labCount} 🧪 lab dev + {userSystemCount} mes systèmes)</span>
        <span style={{ fontSize: 10, color: c.accent, opacity: 0.7 }}>ouvrir →</span>
      </button>
      {open && (
        <LibraryModal
          hasWorkInProgress={hasWork}
          library={library}
          onLoadTemplate={props.onLoadTemplate}
          onLoadSavedSystem={props.onLoadSavedSystem}
          onSaveCurrent={props.onSaveSystem}
          onRenameSystem={props.onRenameSystem}
          onDeleteSystem={props.onDeleteSystem}
          onMoveSystem={props.onMoveSystem}
          onSetSystemTags={props.onSetSystemTags}
          onCreateFolder={props.onCreateFolder}
          onRenameFolder={props.onRenameFolder}
          onDeleteFolder={props.onDeleteFolder}
          onExportFolder={props.onExportFolder}
          onImportFolder={props.onImportFolder}
          onClose={() => setOpen(false)}
        />
      )}
    </Panel>
  );
}
