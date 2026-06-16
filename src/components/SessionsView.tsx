'use client';

// Vue Séances (coaching #3) — planificateur d'entraînement. Construit une
// séance comme un agenda de blocs chronométrés : systèmes de la bibliothèque
// ou blocs libres (échauffement, physique, scrimmage). Fiche imprimable
// (@media print) + déroulé interactif (« Ouvrir » charge le système dans le
// terrain en mode présentation).

import { useState, useMemo } from 'react';
import type { UserLibrary, SavedSystem } from '@/lib/data/library';
import {
  type PracticeSession,
  type SessionBlock,
  makeFreeBlock,
  makeSystemBlock,
  sessionTotalMinutes,
  formatMinutes,
  addBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  isOrphanBlock,
  getSessions,
} from '@/lib/data/practiceSessions';
import {
  CalendarDays, Plus, Trash2, Copy, ArrowUp, ArrowDown, Printer, Play, AlertTriangle, ListPlus,
} from 'lucide-react';

interface SessionsViewProps {
  library: UserLibrary;
  onCreateSession: (name: string) => string;
  onUpdateSession: (session: PracticeSession) => void;
  onDeleteSession: (id: string) => void;
  onDuplicateSession: (id: string) => void;
  /** Déroulé interactif : charge le système dans le terrain (mode présentation). */
  onOpenSystem: (systemId: string) => void;
}

const C = {
  bg: '#0f172a', panel: 'rgba(30,41,59,0.7)', border: 'rgba(255,255,255,0.1)',
  text: '#f3f4f6', muted: '#94a3b8', accent: '#f97316', accentDeep: '#ea580c',
  blue: '#60a5fa', green: '#34d399', red: '#f87171', violet: '#a78bfa',
};

export function SessionsView({
  library,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  onDuplicateSession,
  onOpenSystem,
}: SessionsViewProps) {
  const sessions = getSessions(library);
  const [selectedId, setSelectedId] = useState<string | null>(sessions[0]?.id ?? null);
  const [showSystemPicker, setShowSystemPicker] = useState(false);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId],
  );

  const allSystems: SavedSystem[] = useMemo(
    () => library.folders.flatMap((f) => f.systems),
    [library.folders],
  );

  const handleCreate = () => {
    const name = window.prompt('Nom de la séance', `Séance ${sessions.length + 1}`);
    if (!name) return;
    const id = onCreateSession(name);
    setSelectedId(id);
  };

  const patchSession = (patch: Partial<PracticeSession>) => {
    if (!selected) return;
    onUpdateSession({ ...selected, ...patch });
  };

  const handleAddFree = () => {
    if (!selected) return;
    onUpdateSession(addBlock(selected, makeFreeBlock('Nouveau bloc')));
  };

  const handleAddSystem = (sys: SavedSystem) => {
    if (!selected) return;
    onUpdateSession(addBlock(selected, makeSystemBlock(sys.id, sys.name)));
    setShowSystemPicker(false);
  };

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      {/* ===== Liste des séances (gauche) ===== */}
      <div className="session-no-print" style={{ width: 260, borderRight: `1px solid ${C.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', background: 'rgba(15,23,42,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <CalendarDays size={18} color={C.accent} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.accent, letterSpacing: 0.5 }}>SÉANCES</span>
        </div>
        <button onClick={handleCreate} style={btnPrimary}>
          <Plus size={14} /> Nouvelle séance
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
          {sessions.length === 0 && (
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, padding: '8px 4px' }}>
              Aucune séance. Crée ta première séance d&apos;entraînement.
            </div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${s.id === selectedId ? C.accent : C.border}`,
                background: s.id === selectedId ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.03)',
                color: C.text, display: 'flex', flexDirection: 'column', gap: 2,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
              <span style={{ fontSize: 10, color: C.muted }}>
                {s.blocks.length} bloc{s.blocks.length > 1 ? 's' : ''} · {formatMinutes(sessionTotalMinutes(s))}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ===== Éditeur / fiche (droite) ===== */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selected ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>
            Sélectionne ou crée une séance.
          </div>
        ) : (
          <SessionEditor
            session={selected}
            library={library}
            allSystems={allSystems}
            showSystemPicker={showSystemPicker}
            setShowSystemPicker={setShowSystemPicker}
            onPatchSession={patchSession}
            onUpdateSession={onUpdateSession}
            onDeleteSession={(id) => { onDeleteSession(id); setSelectedId(null); }}
            onDuplicateSession={onDuplicateSession}
            onAddFree={handleAddFree}
            onAddSystem={handleAddSystem}
            onOpenSystem={onOpenSystem}
          />
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .session-print, .session-print * { visibility: visible !important; }
          .session-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; padding: 0 !important; background: #fff !important; color: #000 !important; }
          .session-no-print { display: none !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// Éditeur d'une séance
// ============================================================

function SessionEditor({
  session, library, allSystems, showSystemPicker, setShowSystemPicker,
  onPatchSession, onUpdateSession, onDeleteSession, onDuplicateSession,
  onAddFree, onAddSystem, onOpenSystem,
}: {
  session: PracticeSession;
  library: UserLibrary;
  allSystems: SavedSystem[];
  showSystemPicker: boolean;
  setShowSystemPicker: (v: boolean) => void;
  onPatchSession: (patch: Partial<PracticeSession>) => void;
  onUpdateSession: (s: PracticeSession) => void;
  onDeleteSession: (id: string) => void;
  onDuplicateSession: (id: string) => void;
  onAddFree: () => void;
  onAddSystem: (sys: SavedSystem) => void;
  onOpenSystem: (systemId: string) => void;
}) {
  const total = sessionTotalMinutes(session);

  return (
    <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>
      {/* Barre d'actions (non imprimée) */}
      <div className="session-no-print" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => window.print()} style={btnGhost}><Printer size={14} /> Imprimer</button>
        <button onClick={() => onDuplicateSession(session.id)} style={btnGhost}><Copy size={14} /> Dupliquer</button>
        <button
          onClick={() => { if (window.confirm(`Supprimer la séance « ${session.name} » ?`)) onDeleteSession(session.id); }}
          style={{ ...btnGhost, color: C.red, borderColor: 'rgba(248,113,113,0.4)' }}
        >
          <Trash2 size={14} /> Supprimer
        </button>
      </div>

      {/* Fiche imprimable */}
      <div className="session-print">
        {/* En-tête */}
        <input
          value={session.name}
          onChange={(e) => onPatchSession({ name: e.target.value })}
          className="session-no-print"
          style={{ ...inputBase, fontSize: 22, fontWeight: 800, marginBottom: 8 }}
        />
        <h1 className="print-only" style={{ display: 'none' }}>{session.name}</h1>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
            Date
            <input
              type="date"
              value={session.date ?? ''}
              onChange={(e) => onPatchSession({ date: e.target.value || undefined })}
              style={{ ...inputBase, width: 'auto', fontSize: 12, padding: '4px 8px' }}
            />
          </label>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, padding: '4px 12px', border: `1px solid ${C.accent}`, borderRadius: 20 }}>
            Total : {formatMinutes(total)}
          </span>
        </div>

        {/* Blocs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {session.blocks.length === 0 && (
            <div className="session-no-print" style={{ fontSize: 12, color: C.muted, padding: '16px 0', textAlign: 'center' }}>
              Séance vide. Ajoute un bloc système ou un bloc libre ci-dessous.
            </div>
          )}
          {session.blocks.map((block, idx) => (
            <BlockRow
              key={block.id}
              block={block}
              index={idx}
              total={session.blocks.length}
              orphan={isOrphanBlock(block, library)}
              onUpdate={(patch) => onUpdateSession(updateBlock(session, block.id, patch))}
              onDelete={() => onUpdateSession(deleteBlock(session, block.id))}
              onMove={(dir) => onUpdateSession(moveBlock(session, block.id, dir))}
              onOpen={() => block.systemId && onOpenSystem(block.systemId)}
            />
          ))}
        </div>

        {/* Notes de séance */}
        <div style={{ marginTop: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes de séance</span>
          <textarea
            value={session.notes ?? ''}
            onChange={(e) => onPatchSession({ notes: e.target.value || undefined })}
            placeholder="Objectifs, points d'attention, consignes…"
            rows={3}
            style={{ ...inputBase, marginTop: 4, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Ajout de blocs (non imprimé) */}
      <div className="session-no-print" style={{ display: 'flex', gap: 8, marginTop: 16, position: 'relative', flexWrap: 'wrap' }}>
        <button onClick={onAddFree} style={btnPrimary}><Plus size={14} /> Bloc libre</button>
        <button onClick={() => setShowSystemPicker(!showSystemPicker)} style={btnSecondary}>
          <ListPlus size={14} /> Système de la biblio
        </button>
        {showSystemPicker && (
          <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 30, width: 320, maxHeight: 320, overflowY: 'auto', background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', padding: 8 }}>
            {allSystems.length === 0 ? (
              <div style={{ fontSize: 11, color: C.muted, padding: 10, lineHeight: 1.5 }}>
                Aucun système sauvegardé. Sauvegarde un système depuis la Bibliothèque pour pouvoir l&apos;ajouter ici.
              </div>
            ) : (
              allSystems.map((sys) => (
                <button
                  key={sys.id}
                  onClick={() => onAddSystem(sys)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 12 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {sys.name}
                  {sys.tags && sys.tags.length > 0 && (
                    <span style={{ color: C.muted, marginLeft: 6, fontSize: 10 }}>#{sys.tags.join(' #')}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Ligne de bloc
// ============================================================

function BlockRow({
  block, index, total, orphan, onUpdate, onDelete, onMove, onOpen,
}: {
  block: SessionBlock;
  index: number;
  total: number;
  orphan: boolean;
  onUpdate: (patch: Partial<Omit<SessionBlock, 'id' | 'kind'>>) => void;
  onDelete: () => void;
  onMove: (dir: 'up' | 'down') => void;
  onOpen: () => void;
}) {
  const isSystem = block.kind === 'system';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel }}>
      {/* Index + réordonnancement */}
      <div className="session-no-print" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <button onClick={() => onMove('up')} disabled={index === 0} style={iconBtn(index === 0)}><ArrowUp size={12} /></button>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.muted }}>{index + 1}</span>
        <button onClick={() => onMove('down')} disabled={index === total - 1} style={iconBtn(index === total - 1)}><ArrowDown size={12} /></button>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 6px', borderRadius: 4, color: isSystem ? C.blue : C.green, background: isSystem ? 'rgba(96,165,250,0.12)' : 'rgba(52,211,153,0.12)', border: `1px solid ${isSystem ? 'rgba(96,165,250,0.3)' : 'rgba(52,211,153,0.3)'}` }}>
            {isSystem ? 'Système' : 'Libre'}
          </span>
          <input
            value={block.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            style={{ ...inputBase, flex: 1, minWidth: 120, fontWeight: 700, fontSize: 14 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.muted }}>
            <input
              type="number" min={0} value={block.durationMin}
              onChange={(e) => onUpdate({ durationMin: Math.max(0, parseInt(e.target.value || '0', 10)) })}
              style={{ ...inputBase, width: 56, textAlign: 'right', padding: '4px 6px' }}
            />
            min
          </label>
        </div>

        {orphan && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.red }}>
            <AlertTriangle size={12} /> Système supprimé de la bibliothèque — bloc orphelin.
          </div>
        )}

        <input
          value={block.notes ?? ''}
          onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
          placeholder="Notes / consignes du bloc…"
          style={{ ...inputBase, fontSize: 12, color: C.muted }}
        />
      </div>

      {/* Actions */}
      <div className="session-no-print" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isSystem && (
          <button onClick={onOpen} disabled={orphan} style={{ ...btnOpen, opacity: orphan ? 0.4 : 1, cursor: orphan ? 'not-allowed' : 'pointer' }} title="Ouvrir dans le terrain (présentation)">
            <Play size={13} /> Ouvrir
          </button>
        )}
        <button onClick={onDelete} style={iconBtn(false, C.red)} title="Supprimer le bloc"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #334155',
  color: '#f3f4f6', borderRadius: 6, padding: '6px 10px', outline: 'none', fontSize: 13,
};
const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
  padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent',
};
const btnPrimary: React.CSSProperties = { ...btnBase, background: C.accentDeep, color: '#fff', justifyContent: 'center' };
const btnSecondary: React.CSSProperties = { ...btnBase, background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.4)', color: C.blue };
const btnGhost: React.CSSProperties = { ...btnBase, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: '#cbd5e1' };
const btnOpen: React.CSSProperties = { ...btnBase, background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.4)', color: C.green, padding: '6px 10px' };

function iconBtn(disabled: boolean, color = '#cbd5e1'): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 22,
    borderRadius: 5, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)',
    color: disabled ? '#475569' : color, cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
