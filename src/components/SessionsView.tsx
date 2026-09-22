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
  blockFromTemplate,
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
  CalendarDays, Plus, Trash2, Copy, ArrowUp, ArrowDown, Printer, Play, AlertTriangle, ListPlus, Dumbbell,
} from 'lucide-react';
import { DRILL_TEMPLATES, type DrillTemplate } from '@/lib/data/drillTemplates';
import { DARK_PANEL } from './sidebar/SidebarThemeContext';

interface SessionsViewProps {
  library: UserLibrary;
  onCreateSession: (name: string) => string;
  onUpdateSession: (session: PracticeSession) => void;
  onDeleteSession: (id: string) => void;
  onDuplicateSession: (id: string) => void;
  /** U05 — séance sélectionnée, conservée par la page entre les vues. */
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  /** Déroulé : ouvre la séance sur le terrain à partir du bloc donné. */
  onRunBlock: (sessionId: string, blockIndex: number) => void;
  /** Déroulé en cours (null si aucun) : bandeau Reprendre / Terminer. */
  activeRun: { sessionId: string; blockIndex: number } | null;
  onResumeRun: () => void;
  onEndRun: () => void;
}

const C = {
  bg: DARK_PANEL.bg,
  bgSidebar: '#161a20',
  panel: DARK_PANEL.bgSubtle,
  panelRaised: DARK_PANEL.bgRaised,
  border: DARK_PANEL.border,
  borderSubtle: DARK_PANEL.borderSubtle,
  text: DARK_PANEL.text,
  muted: DARK_PANEL.textMuted,
  textDim: DARK_PANEL.textDim,
  accent: '#a78bfa',
  accentBg: 'rgba(167, 139, 250, 0.14)',
  blue: '#60a5fa',
  green: '#34d399',
  red: '#f87171',
  violet: '#a78bfa',
};

export function SessionsView({
  library,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  onDuplicateSession,
  selectedSessionId,
  onSelectSession,
  onRunBlock,
  activeRun,
  onResumeRun,
  onEndRun,
}: SessionsViewProps) {
  const sessions = getSessions(library);
  const selectedId = sessions.some((s) => s.id === selectedSessionId)
    ? selectedSessionId
    : sessions[0]?.id ?? null;
  const setSelectedId = onSelectSession;
  const runSession = activeRun ? sessions.find((s) => s.id === activeRun.sessionId) : undefined;
  const [showSystemPicker, setShowSystemPicker] = useState(false);
  const [showDrillPicker, setShowDrillPicker] = useState(false);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

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

  const handleAddDrill = (drill: DrillTemplate) => {
    if (!selected) return;
    onUpdateSession(addBlock(selected, blockFromTemplate(drill)));
    setShowDrillPicker(false);
  };

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      {/* ===== Liste des séances (gauche) ===== */}
      <div className="session-no-print" style={{ width: 240, borderRight: `1px solid ${C.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', background: C.bgSidebar }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingLeft: 4 }}>
          <CalendarDays size={15} color={C.accent} style={{ opacity: 0.8 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: C.textDim, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Séances</span>
        </div>
        <button onClick={handleCreate} className="session-btn-primary" style={btnBase}>
          <Plus size={14} /> Nouvelle séance
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
          {sessions.length === 0 && (
            <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5, padding: '8px 4px' }}>
              Aucune séance. Crée ta première séance d&apos;entraînement.
            </div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              onMouseEnter={() => setHoveredSessionId(s.id)}
              onMouseLeave={() => setHoveredSessionId(null)}
              style={{
                textAlign: 'left', padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${s.id === selectedId ? C.accent : 'transparent'}`,
                background: s.id === selectedId 
                  ? C.accentBg 
                  : (hoveredSessionId === s.id ? C.panel : 'transparent'),
                color: s.id === selectedId ? C.text : C.muted,
                display: 'flex', flexDirection: 'column', gap: 2,
                transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
              <span style={{ fontSize: 11, color: s.id === selectedId ? C.accent : C.textDim }}>
                {s.blocks.length} bloc{s.blocks.length > 1 ? 's' : ''} · {formatMinutes(sessionTotalMinutes(s))}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ===== Éditeur / fiche (droite) ===== */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeRun && runSession && (
          <div className="session-no-print" role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '16px 24px 0', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.accent}`, background: C.accentBg, fontSize: 13 }}>
            <span style={{ flex: 1, minWidth: 180 }}>
              Déroulé en cours : <strong>{runSession.name}</strong>, bloc {activeRun.blockIndex + 1}/{runSession.blocks.length}
              {runSession.blocks[activeRun.blockIndex] ? ` — ${runSession.blocks[activeRun.blockIndex].title}` : ''}
            </span>
            <button onClick={onResumeRun} className="session-btn-primary bt-touch" style={btnBase}><Play size={14} /> Reprendre</button>
            <button onClick={onEndRun} className="session-btn-ghost bt-touch" style={btnBase}>Terminer le déroulé</button>
          </div>
        )}
        {!selected ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim, fontSize: 13 }}>
            Sélectionne ou crée une séance.
          </div>
        ) : (
          <SessionEditor
            session={selected}
            library={library}
            allSystems={allSystems}
            showSystemPicker={showSystemPicker}
            setShowSystemPicker={setShowSystemPicker}
            showDrillPicker={showDrillPicker}
            setShowDrillPicker={setShowDrillPicker}
            onPatchSession={patchSession}
            onUpdateSession={onUpdateSession}
            onDeleteSession={(id) => {
              if (activeRun?.sessionId === id) onEndRun();
              onDeleteSession(id);
              setSelectedId(null);
            }}
            onDuplicateSession={onDuplicateSession}
            onAddFree={handleAddFree}
            onAddSystem={handleAddSystem}
            onAddDrill={handleAddDrill}
            onRunBlock={(idx) => onRunBlock(selected.id, idx)}
          />
        )}
      </div>

      <style>{`
        .session-input:focus {
          border-color: ${C.accent} !important;
          background: #1c1f26 !important;
        }
        .session-btn-primary {
          background: ${C.accent} !important;
          color: #1a1d23 !important;
          transition: background 120ms ease;
        }
        .session-btn-primary:hover {
          background: #c084fc !important;
        }
        .session-btn-secondary {
          background: ${C.accentBg} !important;
          border: 1px solid rgba(167, 139, 250, 0.4) !important;
          color: ${C.accent} !important;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .session-btn-secondary:hover {
          background: rgba(167, 139, 250, 0.25) !important;
          border-color: ${C.accent} !important;
        }
        .session-btn-ghost {
          background: transparent !important;
          border: 1px solid ${C.border} !important;
          color: ${C.muted} !important;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .session-btn-ghost:hover {
          background: ${C.panel} !important;
          color: ${C.text} !important;
          border-color: ${C.accent} !important;
        }
        .session-btn-danger-ghost {
          background: transparent !important;
          border: 1px solid rgba(239, 68, 68, 0.3) !important;
          color: ${C.red} !important;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .session-btn-danger-ghost:hover {
          background: rgba(239, 68, 68, 0.1) !important;
          border-color: ${C.red} !important;
        }
        .session-btn-open {
          background: rgba(52, 211, 153, 0.12) !important;
          border: 1px solid rgba(52, 211, 153, 0.3) !important;
          color: ${C.green} !important;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .session-btn-open:hover {
          background: rgba(52, 211, 153, 0.25) !important;
          border-color: ${C.green} !important;
        }
        .session-icon-btn {
          border: 1px solid ${C.border} !important;
          background: rgba(255, 255, 255, 0.02) !important;
          color: ${C.muted} !important;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .session-icon-btn:hover:not(:disabled) {
          background: ${C.panelRaised} !important;
          border-color: ${C.accent} !important;
          color: ${C.text} !important;
        }
        .session-delete-block-btn {
          border: 1px solid rgba(239, 68, 68, 0.3) !important;
          background: transparent !important;
          color: ${C.red} !important;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .session-delete-block-btn:hover {
          background: rgba(239, 68, 68, 0.1) !important;
          border-color: ${C.red} !important;
        }
        @media print {
          body * { visibility: hidden !important; }
          .session-print, .session-print * { visibility: visible !important; }
          .session-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            background: #fff !important;
            color: #000 !important;
            font-family: Inter, sans-serif !important;
          }
          .session-print h1 {
            color: #000 !important;
            font-size: 24px !important;
            margin-bottom: 8px !important;
            font-weight: 800 !important;
          }
          .session-print input, .session-print textarea, .session-print select {
            background: transparent !important;
            color: #000 !important;
            border: none !important;
            padding: 0 !important;
            outline: none !important;
            box-shadow: none !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
          }
          .session-print .block-row-card {
            border: 1px solid #e2e8f0 !important;
            background: #fff !important;
            color: #000 !important;
            box-shadow: none !important;
            margin-bottom: 8px !important;
          }
          .session-print .block-kind-badge {
            border: 1px solid #cbd5e1 !important;
            background: #f1f5f9 !important;
            color: #334155 !important;
          }
          .session-no-print { display: none !important; }
          .print-only { display: block !important; }
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
  showDrillPicker, setShowDrillPicker,
  onPatchSession, onUpdateSession, onDeleteSession, onDuplicateSession,
  onAddFree, onAddSystem, onAddDrill, onRunBlock,
}: {
  session: PracticeSession;
  library: UserLibrary;
  allSystems: SavedSystem[];
  showSystemPicker: boolean;
  setShowSystemPicker: (v: boolean) => void;
  showDrillPicker: boolean;
  setShowDrillPicker: (v: boolean) => void;
  onPatchSession: (patch: Partial<PracticeSession>) => void;
  onUpdateSession: (s: PracticeSession) => void;
  onDeleteSession: (id: string) => void;
  onDuplicateSession: (id: string) => void;
  onAddFree: () => void;
  onAddSystem: (sys: SavedSystem) => void;
  onAddDrill: (drill: DrillTemplate) => void;
  onRunBlock: (blockIndex: number) => void;
}) {
  const total = sessionTotalMinutes(session);

  return (
    <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>
      {/* Barre d'actions (non imprimée) */}
      <div className="session-no-print" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={() => onRunBlock(0)}
          disabled={session.blocks.length === 0}
          className="session-btn-primary bt-touch"
          style={{ ...btnBase, marginRight: 'auto', opacity: session.blocks.length === 0 ? 0.5 : 1 }}
          title="Montrer la séance bloc par bloc sur le terrain, avec minuteur et consignes"
        >
          <Play size={14} /> Dérouler la séance
        </button>
        <button onClick={() => window.print()} className="session-btn-ghost" style={btnBase}><Printer size={14} /> Imprimer</button>
        <button onClick={() => onDuplicateSession(session.id)} className="session-btn-ghost" style={btnBase}><Copy size={14} /> Dupliquer</button>
        <button
          onClick={() => { if (window.confirm(`Supprimer la séance « ${session.name} » ?`)) onDeleteSession(session.id); }}
          className="session-btn-danger-ghost"
          style={btnBase}
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
          className="session-no-print session-input"
          style={{
            ...inputBase,
            fontSize: 20,
            fontWeight: 800,
            marginBottom: 8,
            border: '1px solid transparent',
            background: 'transparent',
            padding: '4px 6px',
            marginLeft: -6,
          }}
          onFocus={(e) => {
            e.target.style.background = C.panel;
            e.target.style.borderColor = C.border;
          }}
          onBlur={(e) => {
            e.target.style.background = 'transparent';
            e.target.style.borderColor = 'transparent';
          }}
        />
        <h1 className="print-only" style={{ display: 'none' }}>{session.name}</h1>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
            Date
            <input
              type="date"
              value={session.date ?? ''}
              onChange={(e) => onPatchSession({ date: e.target.value || undefined })}
              className="session-input"
              style={{ ...inputBase, width: 'auto', fontSize: 12, padding: '4px 8px' }}
            />
          </label>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.accent, padding: '4px 12px', background: C.accentBg, border: `1px solid rgba(167, 139, 250, 0.3)`, borderRadius: 20, fontVariantNumeric: 'tabular-nums' }}>
            Total : {formatMinutes(total)}
          </span>
        </div>

        {/* Blocs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {session.blocks.length === 0 && (
            <div className="session-no-print" style={{ fontSize: 12, color: C.textDim, padding: '16px 0', textAlign: 'center' }}>
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
              onOpen={() => onRunBlock(idx)}
              onVisualize={() => onRunBlock(idx)}
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
            className="session-input"
            style={{ ...inputBase, marginTop: 4, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Ajout de blocs (non imprimé) */}
      <div className="session-no-print" style={{ display: 'flex', gap: 8, marginTop: 16, position: 'relative', flexWrap: 'wrap' }}>
        <button onClick={onAddFree} className="session-btn-primary" style={btnBase}><Plus size={14} /> Bloc libre</button>
        <button onClick={() => { setShowDrillPicker(!showDrillPicker); setShowSystemPicker(false); }} className="session-btn-secondary" style={btnBase}>
          <Dumbbell size={14} /> Exercice exemple
        </button>
        <button onClick={() => { setShowSystemPicker(!showSystemPicker); setShowDrillPicker(false); }} className="session-btn-secondary" style={btnBase}>
          <ListPlus size={14} /> Système de la biblio
        </button>
        {showDrillPicker && (
          <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 30, width: 380, maxHeight: 360, overflowY: 'auto', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', padding: 6 }}>
            {DRILL_TEMPLATES.map((drill) => (
              <button
                key={drill.title}
                onClick={() => onAddDrill(drill)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: C.text, cursor: 'pointer', transition: 'background 120ms ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.panel; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{drill.title}</span>
                  <span style={{ fontSize: 10, color: C.accent, background: C.accentBg, padding: '1px 6px', borderRadius: 10 }}>{drill.category}</span>
                  <span style={{ fontSize: 10, color: C.textDim, marginLeft: 'auto' }}>{formatMinutes(drill.durationMin)}</span>
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(drill.notes ?? '').split('\n')[0]}
                </div>
              </button>
            ))}
          </div>
        )}
        {showSystemPicker && (
          <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 30, width: 320, maxHeight: 320, overflowY: 'auto', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', padding: 6 }}>
            {allSystems.length === 0 ? (
              <div style={{ fontSize: 11, color: C.textDim, padding: 10, lineHeight: 1.5 }}>
                Aucun système sauvegardé. Sauvegarde un système depuis la Bibliothèque pour pouvoir l&apos;ajouter ici.
              </div>
            ) : (
              allSystems.map((sys) => (
                <button
                  key={sys.id}
                  onClick={() => onAddSystem(sys)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 12, transition: 'background 120ms ease, color 120ms ease' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = C.panel;
                    e.currentTarget.style.color = C.text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = C.text;
                  }}
                >
                  {sys.name}
                  {sys.tags && sys.tags.length > 0 && (
                    <span style={{ color: C.textDim, marginLeft: 6, fontSize: 10 }}>#{sys.tags.join(' #')}</span>
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
  block, index, total, orphan, onUpdate, onDelete, onMove, onOpen, onVisualize,
}: {
  block: SessionBlock;
  index: number;
  total: number;
  orphan: boolean;
  onUpdate: (patch: Partial<Omit<SessionBlock, 'id' | 'kind'>>) => void;
  onDelete: () => void;
  onMove: (dir: 'up' | 'down') => void;
  onOpen: () => void;
  onVisualize: () => void;
}) {
  const isSystem = block.kind === 'system';
  const hasVisual = !isSystem && !!block.templateId;
  return (
    <div className="block-row-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel }}>
      {/* Index + réordonnancement */}
      <div className="session-no-print" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <button onClick={() => onMove('up')} disabled={index === 0} className="session-icon-btn" style={iconBtn(index === 0)}><ArrowUp size={12} /></button>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.textDim }}>{index + 1}</span>
        <button onClick={() => onMove('down')} disabled={index === total - 1} className="session-icon-btn" style={iconBtn(index === total - 1)}><ArrowDown size={12} /></button>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="block-kind-badge" style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 6px', borderRadius: 4, color: isSystem ? C.blue : C.green, background: isSystem ? 'rgba(96,165,250,0.12)' : 'rgba(52,211,153,0.12)', border: `1px solid ${isSystem ? 'rgba(96,165,250,0.3)' : 'rgba(52,211,153,0.3)'}` }}>
            {isSystem ? 'Système' : 'Libre'}
          </span>
          <input
            value={block.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="session-input"
            style={{ ...inputBase, flex: 1, minWidth: 120, fontWeight: 700, fontSize: 14, background: '#1c1f26' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.muted }}>
            <input
              type="number" min={0} value={block.durationMin}
              onChange={(e) => onUpdate({ durationMin: Math.max(0, parseInt(e.target.value || '0', 10)) })}
              className="session-input"
              style={{ ...inputBase, width: 56, textAlign: 'right', padding: '4px 6px', background: '#1c1f26' }}
            />
            min
          </label>
        </div>

        {orphan && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.red }}>
            <AlertTriangle size={12} /> Système supprimé de la bibliothèque — bloc orphelin.
          </div>
        )}

        <textarea
          value={block.notes ?? ''}
          onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
          placeholder="Notes / consignes du bloc…"
          rows={block.notes && block.notes.includes('\n') ? Math.min(12, block.notes.split('\n').length + 1) : 2}
          className="session-input block-notes"
          style={{ ...inputBase, fontSize: 12, color: C.muted, background: '#1c1f26', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
        />
      </div>

      {/* Actions */}
      <div className="session-no-print" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isSystem && (
          <button onClick={onOpen} disabled={orphan} className="session-btn-open" style={{ ...btnBase, opacity: orphan ? 0.4 : 1, cursor: orphan ? 'not-allowed' : 'pointer', padding: '6px 10px' }} title="Dérouler la séance à partir de ce bloc">
            <Play size={13} /> Ouvrir
          </button>
        )}
        {hasVisual && (
          <button onClick={onVisualize} className="session-btn-open" style={{ ...btnBase, padding: '6px 10px' }} title="Dérouler la séance à partir de cet exercice">
            <Play size={13} /> Visualiser
          </button>
        )}
        <button onClick={onDelete} className="session-delete-block-btn" style={iconBtn(false)} title="Supprimer le bloc"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: C.panel, border: `1px solid ${C.border}`,
  color: C.text, borderRadius: 6, padding: '6px 10px', outline: 'none', fontSize: 13,
  transition: 'border-color 120ms ease, background 120ms ease',
};
const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
  padding: '8px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent',
  justifyContent: 'center',
};

function iconBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 22,
    borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
  };
}
