'use client';

import { useEffect, useRef, useState } from 'react';
import { CLASSIC_TEMPLATES, LAB_TEMPLATES, type Template } from '@/lib/data/templates';
import type { UserLibrary, SavedSystem, SavedFolder } from '@/lib/data/library';
import { COLORS } from './ui';

/** Identifiant abstrait pour le dossier "Systèmes classiques" (read-only). */
const CLASSIC_FOLDER_ID = '__classic__';
/** Identifiant abstrait pour le dossier "🧪 Lab dev" (read-only). */
const LAB_FOLDER_ID = '__lab__';

interface LibraryModalProps {
  hasWorkInProgress: boolean;
  library: UserLibrary;
  /** Charge un système (snapshot complet). */
  onLoadSavedSystem: (sys: SavedSystem) => void;
  /** Charge un template legacy (steps + defenseInitial seulement). */
  onLoadTemplate: (t: Template) => void;
  /** Sauvegarde l'état courant comme nouveau système dans le folder donné. */
  onSaveCurrent: (folderId: string, name: string, description?: string) => void;
  onRenameSystem: (systemId: string, newName: string) => void;
  onDeleteSystem: (systemId: string) => void;
  onMoveSystem: (systemId: string, targetFolderId: string) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onExportFolder: (folderId: string) => string | null;
  onImportFolder: (json: string) => void;
  onClose: () => void;
  /**
   * Mode d'affichage. 'modal' (défaut) = overlay centré + backdrop ;
   * 'inline' = card rendue dans le flux (refonte UI : vue routée depuis
   * la sidebar gauche).
   */
  mode?: 'modal' | 'inline';
}

export function LibraryModal(props: LibraryModalProps) {
  const c = COLORS.offense;
  const {
    library, hasWorkInProgress, onLoadSavedSystem, onLoadTemplate, onSaveCurrent,
    onRenameSystem, onDeleteSystem, onMoveSystem, onCreateFolder, onRenameFolder,
    onDeleteFolder, onExportFolder, onImportFolder, onClose,
    mode = 'modal',
  } = props;
  const inline = mode === 'inline';

  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    library.folders[0]?.id ?? CLASSIC_FOLDER_ID
  );
  const [renameTarget, setRenameTarget] = useState<
    | { kind: 'system'; id: string; current: string }
    | { kind: 'folder'; id: string; current: string }
    | null
  >(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (renameTarget || showSaveDialog) return; // priorité au popup
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, renameTarget, showSaveDialog]);

  // Données du dossier sélectionné.
  const isClassic = selectedFolderId === CLASSIC_FOLDER_ID;
  const isLab = selectedFolderId === LAB_FOLDER_ID;
  const isReadOnlyFolder = isClassic || isLab;
  const templatesForFolder = isClassic ? CLASSIC_TEMPLATES : isLab ? LAB_TEMPLATES : [];
  const userFolder = library.folders.find((f) => f.id === selectedFolderId) ?? null;

  const handleLoadSaved = (sys: SavedSystem) => {
    if (hasWorkInProgress) {
      if (!confirm(`Charger "${sys.name}" ? Le travail en cours sera remplacé.`)) return;
    }
    onLoadSavedSystem(sys);
    onClose();
  };
  const handleLoadTemplate = (t: Template) => {
    if (hasWorkInProgress) {
      if (!confirm(`Charger "${t.name}" ? Le travail en cours sera remplacé.`)) return;
    }
    onLoadTemplate(t);
    onClose();
  };

  const handleExportFolder = () => {
    if (isReadOnlyFolder || !userFolder) return;
    const json = onExportFolder(userFolder.id);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${userFolder.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result ?? '');
        onImportFolder(text);
      } catch (err) {
        alert(`Import impossible : ${err instanceof Error ? err.message : 'JSON invalide'}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      onClick={inline ? undefined : onClose}
      style={
        inline
          ? {
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'stretch',
              justifyContent: 'center',
              padding: 0,
              boxSizing: 'border-box',
              background: '#1a1d23',
            }
          : {
              position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
              zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 24,
            }
      }
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={
          inline
            ? {
                width: '100%', maxWidth: 1100,
                background: '#1a1d23',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }
            : {
                width: '100%', maxWidth: 920, maxHeight: '85vh',
                background: '#fff', borderRadius: 12,
                boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }
        }
      >
        {/* En mode inline, la sidebar gauche indique déjà la vue active —
            pas besoin de header "Bibliothèque · X dossier(s)" + bouton ×. */}
        {!inline && (
          <header
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderBottom: `1px solid ${c.border}`, background: c.bg,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.accentText, letterSpacing: '-0.01em' }}>
                📚 Bibliothèque
              </div>
              <div style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>
                Systèmes classiques · {library.folders.length} dossier(s) personnel(s)
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                fontSize: 20, border: 'none', background: 'transparent',
                cursor: 'pointer', color: '#64748b', padding: '4px 10px',
                borderRadius: 4, lineHeight: 1,
              }}
              title="Fermer (Échap)"
            >
              ×
            </button>
          </header>
        )}

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Sidebar dossiers */}
          <aside
            style={{
              width: 240, borderRight: `1px solid ${c.border}`, padding: 12,
              overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
              background: '#fafaf9',
            }}
          >
            <FolderRow
              label={`📦 Systèmes classiques`}
              count={CLASSIC_TEMPLATES.length}
              active={selectedFolderId === CLASSIC_FOLDER_ID}
              onClick={() => setSelectedFolderId(CLASSIC_FOLDER_ID)}
            />
            <FolderRow
              label={`🧪 Lab dev`}
              count={LAB_TEMPLATES.length}
              active={selectedFolderId === LAB_FOLDER_ID}
              onClick={() => setSelectedFolderId(LAB_FOLDER_ID)}
            />
            <div style={{ fontSize: 9, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 8, marginBottom: 2, paddingLeft: 4 }}>
              Mes dossiers
            </div>
            {library.folders.map((f) => (
              <FolderRow
                key={f.id}
                label={`📁 ${f.name}`}
                count={f.systems.length}
                active={selectedFolderId === f.id}
                onClick={() => setSelectedFolderId(f.id)}
                onRename={() => setRenameTarget({ kind: 'folder', id: f.id, current: f.name })}
                onDelete={
                  library.folders.length > 1
                    ? () => {
                        if (confirm(`Supprimer le dossier "${f.name}" et ses ${f.systems.length} systèmes ?`)) {
                          onDeleteFolder(f.id);
                          if (selectedFolderId === f.id) {
                            const remaining = library.folders.filter((g) => g.id !== f.id);
                            setSelectedFolderId(remaining[0]?.id ?? CLASSIC_FOLDER_ID);
                          }
                        }
                      }
                    : undefined
                }
              />
            ))}
            <button
              onClick={() => {
                const name = prompt('Nom du nouveau dossier :');
                if (name && name.trim()) onCreateFolder(name.trim());
              }}
              style={{
                marginTop: 6, padding: '6px 8px', fontSize: 11,
                border: `1px dashed ${c.border}`, borderRadius: 6,
                background: 'transparent', color: c.accentText, cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              + nouveau dossier
            </button>
          </aside>

          {/* Pane systèmes */}
          <div style={{ flex: 1, padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isReadOnlyFolder ? (
              <>
                <div style={{ fontSize: 11, color: '#78716c' }}>
                  {isClassic
                    ? "Systèmes prêts à l'emploi (lecture seule). Clic pour charger."
                    : "Bancs de test exhaustifs des écrans — outils dev. Chaque template = un scénario continu (≤ 18 s) pour valider visuellement les comportements engine."}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 10,
                  }}
                >
                  {templatesForFolder.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleLoadTemplate(t)}
                      title={`Charger ${t.name}`}
                      style={{
                        textAlign: 'left', padding: 12, borderRadius: 8,
                        border: `1px solid ${c.border}`, background: '#fff',
                        cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            width: 26, height: 26, borderRadius: 6, background: c.accent,
                            color: '#fff', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 11, fontWeight: 700,
                          }}
                        >
                          {t.steps.length}
                        </div>
                        <div style={{ fontWeight: 700, color: c.accentText, fontSize: 13 }}>
                          {t.name}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#57534e', lineHeight: 1.4 }}>
                        {t.description}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : userFolder ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: c.accentText }}>
                    {userFolder.name} · {userFolder.systems.length} système(s)
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setShowSaveDialog(true)}
                      style={smallBtn(c.accent, '#fff')}
                    >
                      + sauvegarder l'état courant
                    </button>
                    <button onClick={handleExportFolder} style={smallBtn('transparent', c.accentText, c.border)}>
                      ⬇ exporter
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={smallBtn('transparent', c.accentText, c.border)}
                    >
                      ⬆ importer
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImportFile(f);
                        if (e.target) e.target.value = '';
                      }}
                    />
                  </div>
                </div>
                {userFolder.systems.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#a8a29e', padding: 24, textAlign: 'center', fontStyle: 'italic' }}>
                    Aucun système dans ce dossier. Utilise "+ sauvegarder l'état courant" pour en créer un.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {userFolder.systems.map((s) => (
                      <SystemCard
                        key={s.id}
                        system={s}
                        accent={c.accent}
                        accentText={c.accentText}
                        border={c.border}
                        bg={c.bg}
                        onLoad={() => handleLoadSaved(s)}
                        onRename={() => setRenameTarget({ kind: 'system', id: s.id, current: s.name })}
                        onDelete={() => {
                          if (confirm(`Supprimer le système "${s.name}" ?`)) onDeleteSystem(s.id);
                        }}
                        otherFolders={library.folders.filter((f) => f.id !== userFolder.id)}
                        onMove={(target) => onMoveSystem(s.id, target)}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>

        <footer
          style={{
            padding: '8px 16px', borderTop: `1px solid ${c.border}`,
            fontSize: 10, color: '#94a3b8', display: 'flex', justifyContent: 'space-between',
          }}
        >
          <span>Tous les systèmes personnels sont sauvegardés en local (localStorage).</span>
          {/* "Échap pour fermer" n'a de sens qu'en modal — en inline,
              la sidebar reste accessible pour naviguer ailleurs. */}
          {!inline && <span>Échap pour fermer</span>}
        </footer>
      </div>

      {renameTarget && (
        <RenameDialog
          current={renameTarget.current}
          label={renameTarget.kind === 'folder' ? 'Renommer le dossier' : 'Renommer le système'}
          onSubmit={(newName) => {
            if (renameTarget.kind === 'folder') onRenameFolder(renameTarget.id, newName);
            else onRenameSystem(renameTarget.id, newName);
            setRenameTarget(null);
          }}
          onCancel={() => setRenameTarget(null)}
        />
      )}

      {showSaveDialog && userFolder && (
        <SaveDialog
          targetFolderName={userFolder.name}
          onSubmit={(name, desc) => {
            onSaveCurrent(userFolder.id, name, desc);
            setShowSaveDialog(false);
          }}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}

// --- helpers ---
function smallBtn(bg: string, fg: string, border?: string): React.CSSProperties {
  return {
    padding: '4px 8px', fontSize: 10, fontWeight: 600,
    border: `1px solid ${border ?? bg}`, borderRadius: 4,
    background: bg, color: fg, cursor: 'pointer',
  };
}

function FolderRow({
  label, count, active, onClick, onRename, onDelete,
}: {
  label: string; count: number; active: boolean;
  onClick: () => void; onRename?: () => void; onDelete?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        padding: '6px 8px', borderRadius: 5, cursor: 'pointer',
        background: active ? '#fff' : 'transparent',
        border: `1px solid ${active ? '#e5e5e5' : 'transparent'}`,
        fontSize: 12, fontWeight: 500, color: '#1c1917',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label} <span style={{ color: '#a8a29e', fontSize: 10 }}>({count})</span>
      </span>
      {(onRename || onDelete) && (
        <span style={{ display: 'flex', gap: 2 }}>
          {onRename && (
            <button
              onClick={(e) => { e.stopPropagation(); onRename(); }}
              title="Renommer"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 10, padding: 2 }}
            >
              ✎
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Supprimer"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 10, padding: 2, color: '#dc2626' }}
            >
              🗑
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function SystemCard({
  system, accent, accentText, border, bg,
  onLoad, onRename, onDelete, onMove, otherFolders,
}: {
  system: SavedSystem;
  accent: string; accentText: string; border: string; bg: string;
  onLoad: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: (targetFolderId: string) => void;
  otherFolders: SavedFolder[];
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        textAlign: 'left', padding: 12, borderRadius: 8,
        border: `1px solid ${hover ? accent : border}`,
        background: hover ? bg : '#fff',
        display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'border-color 120ms, background 120ms',
      }}
    >
      <button
        onClick={onLoad}
        style={{
          all: 'unset', cursor: 'pointer', display: 'flex',
          flexDirection: 'column', gap: 6,
        }}
        title={`Charger ${system.name}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 26, height: 26, borderRadius: 6, background: accent,
              color: '#fff', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 11, fontWeight: 700,
            }}
          >
            {system.steps.length}
          </div>
          <div style={{ fontWeight: 700, color: accentText, fontSize: 13 }}>
            {system.name}
          </div>
        </div>
        {system.description && (
          <div style={{ fontSize: 11, color: '#57534e', lineHeight: 1.4 }}>
            {system.description}
          </div>
        )}
        <div style={{ fontSize: 9, color: '#a8a29e' }}>
          {system.defenseSystem === 'zone' ? `zone ${system.zoneConfig.type.replace('zone-', '')}` : 'individuelle'} ·
          {' '}sauvegardé {new Date(system.updatedAt).toLocaleDateString('fr-FR')}
        </div>
      </button>
      {hover && (
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2, background: '#fff', padding: 2, borderRadius: 4, border: `1px solid ${border}` }}>
          <button
            onClick={onRename}
            title="Renommer"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, padding: 2 }}
          >
            ✎
          </button>
          {otherFolders.length > 0 && (
            <select
              onChange={(e) => {
                if (e.target.value) onMove(e.target.value);
                e.target.value = '';
              }}
              defaultValue=""
              title="Déplacer vers"
              style={{ border: 'none', background: 'transparent', fontSize: 11, cursor: 'pointer' }}
            >
              <option value="" disabled>↪</option>
              {otherFolders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={onDelete}
            title="Supprimer"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, padding: 2, color: '#dc2626' }}
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

function RenameDialog({
  current, label, onSubmit, onCancel,
}: {
  current: string; label: string;
  onSubmit: (newName: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(current);
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', padding: 18, borderRadius: 8, minWidth: 320,
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{label}</div>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) onSubmit(value.trim());
            if (e.key === 'Escape') onCancel();
          }}
          style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #d6d3d1', borderRadius: 4 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
          <button onClick={onCancel} style={smallBtn('transparent', '#57534e', '#d6d3d1')}>Annuler</button>
          <button
            onClick={() => value.trim() && onSubmit(value.trim())}
            disabled={!value.trim()}
            style={smallBtn('#D85A30', '#fff')}
          >
            Renommer
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveDialog({
  targetFolderName, onSubmit, onCancel,
}: {
  targetFolderName: string;
  onSubmit: (name: string, description?: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', padding: 18, borderRadius: 8, minWidth: 380,
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          Sauvegarder dans "{targetFolderName}"
        </div>
        <div style={{ fontSize: 11, color: '#78716c', marginBottom: 10 }}>
          Capture les positions, annotations, défense, profils joueurs, zone, écrans.
        </div>
        <input
          autoFocus
          type="text"
          placeholder="Nom du système (ex: PNR central + flare)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onSubmit(name.trim(), description.trim() || undefined);
            if (e.key === 'Escape') onCancel();
          }}
          style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #d6d3d1', borderRadius: 4, marginBottom: 6 }}
        />
        <textarea
          placeholder="Description (optionnelle)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #d6d3d1', borderRadius: 4, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
          <button onClick={onCancel} style={smallBtn('transparent', '#57534e', '#d6d3d1')}>Annuler</button>
          <button
            onClick={() => name.trim() && onSubmit(name.trim(), description.trim() || undefined)}
            disabled={!name.trim()}
            style={smallBtn('#D85A30', '#fff')}
          >
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
}
