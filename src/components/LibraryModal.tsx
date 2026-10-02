'use client';

import { useInterfaceLevel } from './interface/InterfaceLevel';

import { useEffect, useId, useRef, useState } from 'react';
import { CLASSIC_TEMPLATES, LAB_TEMPLATES, type Template } from '@/lib/data/templates';
import type { UserLibrary, SavedSystem, SavedFolder } from '@/lib/data/library';
import { collectTagCounts, normalizeTag } from '@/lib/data/library';
import { COLORS } from './ui';

/** Identifiant abstrait pour le dossier "Systèmes classiques" (read-only). */
const CLASSIC_FOLDER_ID = '__classic__';
/** Identifiant abstrait pour le dossier "🧪 Lab dev" (read-only). */
const LAB_FOLDER_ID = '__lab__';

interface LibraryModalProps {
  initialSection?: 'saved' | 'templates';
  hasWorkInProgress: boolean;
  library: UserLibrary;
  /** Charge un système (snapshot complet). */
  onLoadSavedSystem: (sys: SavedSystem) => void;
  /** Charge un template legacy (steps + defenseInitial seulement). */
  onLoadTemplate: (t: Template) => void;
  /** Sauvegarde l'état courant comme nouveau système dans le folder donné. */
  onSaveCurrent: (folderId: string, name: string, description?: string, tags?: string[]) => void;
  onSetSystemTags: (systemId: string, tags: string[]) => void;
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
    library, hasWorkInProgress, onLoadSavedSystem, onLoadTemplate, onSaveCurrent, onSetSystemTags,
    onRenameSystem, onDeleteSystem, onMoveSystem, onCreateFolder, onRenameFolder,
    onDeleteFolder, onExportFolder, onImportFolder, onClose,
    mode = 'modal',
  } = props;
  const inline = mode === 'inline';
  const { development } = useInterfaceLevel();
  const visibleLabTemplates = development ? LAB_TEMPLATES : [];

  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    props.initialSection === 'templates' ? CLASSIC_FOLDER_ID : library.folders[0]?.id ?? CLASSIC_FOLDER_ID
  );
  /** Filtre transverse par tag — quand non-null, prime sur `selectedFolderId`
   *  pour le rendu du pane de droite (affiche tous les systèmes matchant
   *  ce tag, toutes sources confondues : classiques + lab + user). */
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
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
  const isClassic = selectedFolderId === CLASSIC_FOLDER_ID || (!development && selectedFolderId === LAB_FOLDER_ID);
  const isLab = development && selectedFolderId === LAB_FOLDER_ID;
  const isReadOnlyFolder = isClassic || isLab;
  const templatesForFolder = isClassic ? CLASSIC_TEMPLATES : isLab ? LAB_TEMPLATES : [];
  const userFolder = library.folders.find((f) => f.id === selectedFolderId) ?? null;

  // Tous les tags présents (suggestions d'autocomplete partagées par les
  // éditeurs de TagEditor et la sidebar Catégories).
  const allTagSuggestions = collectTagCounts([
    ...CLASSIC_TEMPLATES,
    ...visibleLabTemplates,
    ...library.folders.flatMap((f) => f.systems),
  ]).map((t) => t.tag);

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
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : true}
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
              background: 'var(--bt-bg)',
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
                background: 'var(--bt-bg)',
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
              <div style={{ fontSize: 11, color: 'var(--bt-text-dim)', marginTop: 2 }}>
                Systèmes classiques · {library.folders.length} dossier(s) personnel(s)
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                fontSize: 20, border: 'none', background: 'transparent',
                cursor: 'pointer', color: 'var(--bt-text-dim)', padding: '4px 10px',
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
              active={selectedTag === null && isClassic}
              onClick={() => { setSelectedTag(null); setSelectedFolderId(CLASSIC_FOLDER_ID); }}
            />
            {development && <FolderRow
              label={`🧪 Lab dev`}
              count={LAB_TEMPLATES.length}
              active={selectedTag === null && selectedFolderId === LAB_FOLDER_ID}
              onClick={() => { setSelectedTag(null); setSelectedFolderId(LAB_FOLDER_ID); }}
            />}
            <div style={{ fontSize: 9, color: 'var(--bt-text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 8, marginBottom: 2, paddingLeft: 4 }}>
              Mes dossiers
            </div>
            {library.folders.map((f) => (
              <FolderRow
                key={f.id}
                label={`📁 ${f.name}`}
                count={f.systems.length}
                active={selectedTag === null && selectedFolderId === f.id}
                onClick={() => { setSelectedTag(null); setSelectedFolderId(f.id); }}
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
            <NewFolderForm onCreate={onCreateFolder} inline={inline} accent={c.accentText} border={c.border} />

            {/* 🏷 Catégories — tags collectés sur classiques + lab + user.
                Click = filtre transverse (override la sélection de dossier). */}
            {(() => {
              const allSystems = [
                ...CLASSIC_TEMPLATES,
                ...visibleLabTemplates,
                ...library.folders.flatMap((f) => f.systems),
              ];
              const tags = collectTagCounts(allSystems);
              if (tags.length === 0) return null;
              return (
                <>
                  <div style={{ fontSize: 9, color: 'var(--bt-text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 10, marginBottom: 2, paddingLeft: 4 }}>
                    🏷 Catégories
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 4px' }}>
                    {tags.map(({ tag, count }) => {
                      const active = selectedTag === tag;
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            if (active) {
                              // Toggle off → retombe sur la sélection de dossier active.
                              setSelectedTag(null);
                            } else {
                              setSelectedTag(tag);
                            }
                          }}
                          title={`Filtrer par #${tag} (${count} systèmes)`}
                          style={{
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: 999,
                            border: active ? '1px solid #a78bfa' : '1px solid var(--bt-border)',
                            background: active ? 'rgba(167, 139, 250, 0.22)' : 'transparent',
                            color: active ? 'var(--bt-text)' : 'var(--bt-text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          #{tag} <span style={{ opacity: 0.6 }}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </aside>

          {/* Pane systèmes */}
          <div style={{ flex: 1, padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedTag ? (
              (() => {
                // Mode filtre par tag — mélange templates + user systems.
                const matchingTemplates = [...CLASSIC_TEMPLATES, ...visibleLabTemplates].filter(
                  (t) => t.tags?.includes(selectedTag),
                );
                const matchingUserSystems = library.folders.flatMap((f) =>
                  f.systems
                    .filter((s) => s.tags?.includes(selectedTag))
                    .map((s) => ({ sys: s, folder: f })),
                );
                const total = matchingTemplates.length + matchingUserSystems.length;
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: inline ? 'var(--bt-text)' : c.accentText }}>
                        🏷 #{selectedTag} · {total} système{total > 1 ? 's' : ''}
                      </div>
                      <button
                        onClick={() => setSelectedTag(null)}
                        title="Retirer le filtre"
                        style={{
                          fontSize: 11, padding: '2px 8px',
                          border: '1px solid #94a3b8', borderRadius: 4,
                          background: 'transparent', color: 'var(--bt-text-muted)', cursor: 'pointer',
                        }}
                      >
                        × retirer le filtre
                      </button>
                    </div>
                    {total === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--bt-text-dim)', padding: 24, textAlign: 'center', fontStyle: 'italic' }}>
                        Aucun système avec ce tag.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                          gap: 10,
                        }}
                      >
                        {matchingTemplates.map((t) => (
                          <button
                            key={`tpl-${t.id}`}
                            onClick={() => handleLoadTemplate(t)}
                            title={`Charger ${t.name}`}
                            style={{
                              textAlign: 'left', padding: 12, borderRadius: 8,
                              border: `1px solid ${c.border}`, background: '#fff',
                              cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 26, height: 26, borderRadius: 6, background: c.accent,
                                color: '#fff', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: 11, fontWeight: 700,
                              }}>
                                {t.steps.length}
                              </div>
                              <div style={{ fontWeight: 700, color: c.accentText, fontSize: 13 }}>
                                {t.name}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--bt-text-muted)', lineHeight: 1.4 }}>
                              {t.description}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--bt-text-dim)' }}>
                              {(t.tags ?? []).map((tg) => `#${tg}`).join(' ')}
                            </div>
                          </button>
                        ))}
                        {matchingUserSystems.map(({ sys: s, folder }) => (
                          <SystemCard
                            key={`usr-${s.id}`}
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
                            otherFolders={library.folders.filter((f) => f.id !== folder.id)}
                            onMove={(target) => onMoveSystem(s.id, target)}
                            onSetTags={onSetSystemTags}
                            allTagSuggestions={allTagSuggestions}
                          />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()
            ) : isReadOnlyFolder ? (
              <>
                <div style={{ fontSize: 11, color: 'var(--bt-text-dim)' }}>
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
                      <div style={{ fontSize: 11, color: 'var(--bt-text-muted)', lineHeight: 1.4 }}>
                        {t.description}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : userFolder ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600,
                    color: inline ? 'var(--bt-text)' : c.accentText,
                  }}>
                    {userFolder.name} · {userFolder.systems.length} système(s)
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setShowSaveDialog(true)}
                      style={
                        inline
                          ? darkPrimaryBtn(c.accentStrong)
                          : smallBtn(c.accentStrong, '#fff')
                      }
                    >
                      + sauvegarder l'état courant
                    </button>
                    <button
                      onClick={handleExportFolder}
                      style={
                        inline
                          ? darkSecondaryBtn()
                          : smallBtn('transparent', c.accentText, c.border)
                      }
                    >
                      ⬇ exporter
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={
                        inline
                          ? darkSecondaryBtn()
                          : smallBtn('transparent', c.accentText, c.border)
                      }
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
                  <div style={{ fontSize: 12, color: 'var(--bt-text-dim)', padding: 24, textAlign: 'center', fontStyle: 'italic' }}>
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
                        onSetTags={onSetSystemTags}
                        allTagSuggestions={allTagSuggestions}
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
            fontSize: 10, color: 'var(--bt-text-dim)', display: 'flex', justifyContent: 'space-between',
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
          tagSuggestions={allTagSuggestions}
          onSubmit={(name, desc, tags) => {
            onSaveCurrent(userFolder.id, name, desc, tags);
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

// Boutons style dark moderne — cohérence avec la sidebar gauche (items
// Terrain/Playbook/etc.). Primaire = accent saturé avec teinte subtile,
// secondaire = fond transparent + bordure dark.
function darkPrimaryBtn(accent: string): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${accent}`,
    borderRadius: 6,
    background: accent,
    color: '#fff',
    cursor: 'pointer',
  };
}
function darkSecondaryBtn(): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    border: '1px solid var(--bt-border)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--bt-text-muted)',
    cursor: 'pointer',
  };
}

function FolderRow({
  label, count, active, onClick, onRename, onDelete,
}: {
  label: string; count: number; active: boolean;
  onClick: () => void; onRename?: () => void; onDelete?: () => void;
}) {
  // Aligné sur le style des items de la sidebar gauche (Terrain, Playbook…) :
  // ligne 34px, fond dark hover/active, accent violet, texte clair.
  return (
    <div
      onClick={onClick}
      role="button"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        padding: '0 10px', height: 34, borderRadius: 6, cursor: 'pointer',
        background: active ? 'rgba(167, 139, 250, 0.14)' : 'transparent',
        color: active ? 'var(--bt-text)' : 'var(--bt-text-muted)',
        fontSize: 13, fontWeight: active ? 600 : 500,
        transition: 'background 120ms ease, color 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--bt-surface)';
          e.currentTarget.style.color = '#f3f4f6';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#cbd5e1';
        }
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {label}{' '}
        <span style={{ color: 'var(--bt-text-dim)', fontSize: 11, fontWeight: 500 }}>
          ({count})
        </span>
      </span>
      {(onRename || onDelete) && (
        <span style={{ display: 'flex', gap: 2 }}>
          {onRename && (
            <button
              onClick={(e) => { e.stopPropagation(); onRename(); }}
              title="Renommer"
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 11, padding: 2, color: 'var(--bt-text-dim)',
              }}
            >
              ✎
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Supprimer"
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 11, padding: 2, color: 'var(--bt-red-text)',
              }}
            >
              🗑
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/** Mini-éditeur de tags : chips cliquables + input texte avec datalist
 *  d'autocomplete sur les tags déjà existants dans la bibliothèque. */
function TagEditor({
  tags, suggestions, onChange, compact = false,
}: {
  tags: string[];
  suggestions?: string[];
  onChange: (next: string[]) => void;
  /** Variante compacte (utilisée dans les SystemCard). */
  compact?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const datalistId = useId();

  const addDraft = (raw?: string) => {
    const candidate = raw !== undefined ? raw : draft;
    const t = normalizeTag(candidate);
    if (!t || tags.includes(t)) {
      setDraft('');
      return;
    }
    onChange([...tags, t]);
    setDraft('');
  };

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
      }}
    >
      {tags.map((t) => (
        <span
          key={t}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            fontSize: compact ? 10 : 11,
            padding: compact ? '1px 4px 1px 6px' : '2px 5px 2px 7px',
            borderRadius: 999,
            background: 'rgba(167, 139, 250, 0.18)',
            color: 'var(--bt-violet-text)',
            border: '1px solid rgba(167, 139, 250, 0.42)',
          }}
        >
          #{t}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange(tags.filter((x) => x !== t));
            }}
            title={`Retirer #${t}`}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: '#7c3aed', fontSize: compact ? 11 : 12, fontWeight: 700,
              padding: '0 2px', lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        list={suggestions && suggestions.length > 0 ? datalistId : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addDraft();
          } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            // Retire le dernier tag à Backspace sur input vide.
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => { if (draft.trim()) addDraft(); }}
        placeholder={tags.length === 0 ? '+ tag (Entrée)' : '+ tag'}
        style={{
          fontSize: compact ? 10 : 11,
          padding: compact ? '1px 4px' : '2px 5px',
          minWidth: 70,
          border: '1px dashed #94a3b8',
          borderRadius: 4,
          background: 'transparent',
          color: 'var(--bt-text)',
        }}
      />
      {suggestions && suggestions.length > 0 && (
        <datalist id={datalistId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

function NewFolderForm({
  onCreate, inline, accent, border,
}: {
  onCreate: (name: string) => void;
  inline: boolean;
  accent: string;
  border: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={
          inline
            ? {
                marginTop: 6, padding: '8px 10px', fontSize: 12,
                border: '1px dashed var(--bt-border)', borderRadius: 6,
                background: 'transparent', color: 'var(--bt-text-muted)', cursor: 'pointer',
                textAlign: 'left',
              }
            : {
                marginTop: 6, padding: '6px 8px', fontSize: 11,
                border: `1px dashed ${border}`, borderRadius: 6,
                background: 'transparent', color: accent, cursor: 'pointer',
                textAlign: 'left',
              }
        }
      >
        + nouveau dossier
      </button>
    );
  }

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName('');
    setOpen(false);
  };
  const cancel = () => {
    setName('');
    setOpen(false);
  };

  return (
    <div
      style={{
        marginTop: 6, padding: 8, borderRadius: 6,
        border: `1px solid var(--bt-border)`, background: 'var(--bt-bg)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <input
        type="text"
        value={name}
        autoFocus
        placeholder="Nom du dossier"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') cancel();
        }}
        style={{
          fontSize: 12, padding: '4px 6px', borderRadius: 4,
          background: '#0f1117', color: 'var(--bt-text)', border: '1px solid var(--bt-border)',
        }}
      />
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <button
          onClick={cancel}
          style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 4,
            background: 'transparent', color: 'var(--bt-text-dim)',
            border: '1px solid var(--bt-border)', cursor: 'pointer',
          }}
        >
          Annuler
        </button>
        <button
          onClick={submit}
          disabled={!name.trim()}
          style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 4,
            background: name.trim() ? accent : 'var(--bt-border-strong)',
            color: '#fff',
            border: 'none', cursor: name.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          Créer
        </button>
      </div>
    </div>
  );
}

function SystemCard({
  system, accent, accentText, border, bg,
  onLoad, onRename, onDelete, onMove, otherFolders,
  onSetTags, allTagSuggestions,
}: {
  system: SavedSystem;
  accent: string; accentText: string; border: string; bg: string;
  onLoad: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: (targetFolderId: string) => void;
  otherFolders: SavedFolder[];
  onSetTags: (systemId: string, tags: string[]) => void;
  allTagSuggestions: string[];
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 116 }}>
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
          <div style={{ fontSize: 11, color: 'var(--bt-text-muted)', lineHeight: 1.4 }}>
            {system.description}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--bt-text-dim)' }}>
          {system.defenseSystem === 'zone' ? `zone ${system.zoneConfig.type.replace('zone-', '')}` : 'individuelle'} ·
          {' '}sauvegardé {new Date(system.updatedAt).toLocaleDateString('fr-FR')}
        </div>
      </button>
      {/* Éditeur de tags inline. Hors du <button> pour ne pas déclencher onLoad. */}
      <div onClick={(e) => e.stopPropagation()}>
        <TagEditor
          tags={system.tags ?? []}
          suggestions={allTagSuggestions}
          onChange={(next) => onSetTags(system.id, next)}
          compact
        />
      </div>
      {/* U04 — actions toujours visibles : le survol n'existe pas au doigt. */}
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2, background: '#fff', padding: 2, borderRadius: 4, border: `1px solid ${border}` }}>
          <button
            onClick={onRename}
            title="Renommer"
            aria-label={`Renommer ${system.name}`}
            className="bt-touch"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, padding: 2 }}
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
              aria-label={`Déplacer ${system.name} vers un autre dossier`}
              className="bt-touch"
              style={{ border: 'none', background: 'transparent', fontSize: 14, cursor: 'pointer' }}
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
            aria-label={`Supprimer ${system.name}`}
            className="bt-touch"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, padding: 2, color: 'var(--bt-red-text)' }}
          >
            🗑
          </button>
        </div>
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
      role="dialog"
      aria-modal="true"
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
  targetFolderName, tagSuggestions, onSubmit, onCancel,
}: {
  targetFolderName: string;
  tagSuggestions: string[];
  onSubmit: (name: string, description?: string, tags?: string[]) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const submit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim(), description.trim() || undefined, tags.length > 0 ? tags : undefined);
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
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
        <div style={{ fontSize: 11, color: 'var(--bt-text-dim)', marginBottom: 10 }}>
          Capture les positions, annotations, défense, profils joueurs, zone, écrans.
        </div>
        <input
          autoFocus
          type="text"
          placeholder="Nom du système (ex: PNR central + flare)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) submit();
            if (e.key === 'Escape') onCancel();
          }}
          style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #d6d3d1', borderRadius: 4, marginBottom: 6 }}
        />
        <textarea
          placeholder="Description (optionnelle)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #d6d3d1', borderRadius: 4, resize: 'vertical', marginBottom: 6 }}
        />
        <div style={{ fontSize: 10, color: 'var(--bt-text-dim)', marginBottom: 4 }}>
          🏷 Tags (Entrée pour ajouter, suggestions depuis tags existants) :
        </div>
        <TagEditor tags={tags} suggestions={tagSuggestions} onChange={setTags} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
          <button onClick={onCancel} style={smallBtn('transparent', '#57534e', '#d6d3d1')}>Annuler</button>
          <button
            onClick={submit}
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
