'use client';

import { useState, useEffect } from 'react';
import type { AttackerId, ScriptedAction, OffensiveScriptedAction, ActionSide, DriveDirection } from '@/lib/types';
import {
  SCRIPTED_ACTIONS_CATALOG,
  SCRIPTED_ACTIONS_BY_CATEGORY,
  type ParamKind,
  type ScriptedActionDefinition,
} from '@/lib/data/scriptedActionsCatalog';
import { newScriptedActionId } from '@/lib/logic/compileScenario';
import { Panel, Button, COLORS } from './ui';

const ATTACKER_IDS: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
const SIDES: ActionSide[] = ['fort', 'faible', 'axe'];
const DRIVE_DIRECTIONS: DriveDirection[] = ['panier', 'baseline', 'middle'];

const PARAM_LABELS: Record<ParamKind, string> = {
  ballHandler: 'Porteur',
  screener: 'Poseur d\'écran',
  cutter: 'Cutter',
  passer: 'Passeur',
  receiver: 'Receveur',
  giver: 'Donneur',
  driver: 'Pénétrant',
  shooter: 'Tireur',
  from: 'De',
  to: 'Vers',
  firstScreener: '1er poseur',
  secondScreener: '2e poseur',
  side: 'Côté',
  direction: 'Direction',
};

interface ScenarioPanelProps {
  scriptedActions: ScriptedAction[];
  onAddAction: (action: ScriptedAction) => void;
  onUpdateAction: (id: string, action: ScriptedAction) => void;
  onDeleteAction: (id: string) => void;
  onMoveAction: (id: string, dir: 'up' | 'down') => void;
  onClearAll: () => void;
}

export function ScenarioPanel(props: ScenarioPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const c = COLORS.offense;

  // Échap ferme le modal
  useEffect(() => {
    if (!showAddModal) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowAddModal(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showAddModal]);

  const handlePickAction = (def: ScriptedActionDefinition) => {
    const newAction: OffensiveScriptedAction = {
      kind: 'offensive',
      id: newScriptedActionId(),
      type: def.type,
      params: defaultParamsFor(def),
    };
    props.onAddAction(newAction);
    setEditingId(newAction.id);
    setShowAddModal(false);
  };

  // Phase 3 défense scriptable : la liste peut contenir des actions défensives ;
  // ce panneau ne gère pour l'instant que les offensives (la zone défensive
  // sera ajoutée Task 6).
  const offensiveActions = props.scriptedActions.filter(
    (a): a is OffensiveScriptedAction => a.kind === 'offensive'
  );

  return (
    <Panel theme="offense" title="🎬 Scénario">
      <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.4 }}>
        Empile des actions FIBA nommées. Le système génère automatiquement les
        étapes correspondantes. Tu peux toujours retoucher chaque étape à la
        main ensuite — les modifs manuelles seront préservées.
      </div>

      {/* Liste des actions */}
      {offensiveActions.length === 0 && (
        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: 8, textAlign: 'center' }}>
          Aucune action. Ajoute la première ci-dessous.
        </div>
      )}

      {offensiveActions.map((action, idx) => {
        const def = SCRIPTED_ACTIONS_CATALOG[action.type];
        const isEditing = editingId === action.id;
        return (
          <div
            key={action.id}
            style={{
              border: `1px solid ${c.border}`,
              borderRadius: 6,
              padding: 6,
              background: isEditing ? c.bg : '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.accent, minWidth: 18 }}>{idx + 1}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: c.accentText, flex: 1 }}>{def.label}</span>
              <button
                onClick={() => props.onMoveAction(action.id, 'up')}
                disabled={idx === 0}
                style={iconBtn(idx === 0)}
                title="Monter"
              >▲</button>
              <button
                onClick={() => props.onMoveAction(action.id, 'down')}
                disabled={idx === offensiveActions.length - 1}
                style={iconBtn(idx === offensiveActions.length - 1)}
                title="Descendre"
              >▼</button>
              <button
                onClick={() => setEditingId(isEditing ? null : action.id)}
                style={iconBtn(false)}
                title="Modifier"
              >⚙</button>
              <button
                onClick={() => props.onDeleteAction(action.id)}
                style={{ ...iconBtn(false), color: '#dc2626' }}
                title="Supprimer"
              >✕</button>
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2, marginLeft: 24 }}>
              {action.label || def.reader(action.params)}
            </div>
            {isEditing && (
              <ActionForm
                action={action}
                def={def}
                onChange={(updated) => props.onUpdateAction(action.id, updated)}
              />
            )}
          </div>
        );
      })}

      {/* Bouton d'ajout (déclenche le modal) */}
      <Button theme="offense" variant="solid" fullWidth onClick={() => setShowAddModal(true)}>
        ➕ Ajouter une action
      </Button>

      {offensiveActions.length > 0 && (
        <Button theme="neutral" onClick={() => {
          if (window.confirm('Effacer tout le scénario ?')) props.onClearAll();
        }}>
          🗑 Effacer le scénario
        </Button>
      )}

      {showAddModal && (
        <AddActionModal onClose={() => setShowAddModal(false)} onPick={handlePickAction} />
      )}
    </Panel>
  );
}

// ============================================================
// Modal popup d'ajout d'action
// ============================================================

interface AddActionModalProps {
  onClose: () => void;
  onPick: (def: ScriptedActionDefinition) => void;
}

function AddActionModal({ onClose, onPick }: AddActionModalProps) {
  const c = COLORS.offense;
  const [filter, setFilter] = useState('');
  const filterLower = filter.trim().toLowerCase();

  const matches = (def: ScriptedActionDefinition) =>
    !filterLower ||
    def.label.toLowerCase().includes(filterLower) ||
    def.fibaTerm.toLowerCase().includes(filterLower) ||
    def.description.toLowerCase().includes(filterLower);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          width: 'min(640px, 100%)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${c.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: c.accentText, flex: 1 }}>
            🎬 Ajouter une action FIBA
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: 13, padding: '4px 10px', borderRadius: 6,
              border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#475569',
            }}
            title="Fermer (Échap)"
          >✕</button>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: `1px solid ${c.border}` }}>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer (ex : flare, drive, hammer…)"
            autoFocus
            style={{
              width: '100%',
              fontSize: 13,
              padding: '7px 10px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ overflow: 'auto', padding: '10px 18px 14px', flex: 1 }}>
          {Object.entries(SCRIPTED_ACTIONS_BY_CATEGORY).map(([category, defs]) => {
            const visible = defs.filter(matches);
            if (visible.length === 0) return null;
            return (
              <div key={category} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                    letterSpacing: 0.5,
                    fontWeight: 600,
                  }}
                >
                  {category}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {visible.map((def) => (
                    <button
                      key={def.type}
                      onClick={() => onPick(def)}
                      title={def.fibaTerm}
                      style={{
                        textAlign: 'left',
                        fontSize: 12,
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: `1px solid ${c.border}`,
                        background: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: c.accentText }}>{def.label}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{def.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sous-composant : formulaire d'édition d'une action
// ============================================================

interface ActionFormProps {
  action: OffensiveScriptedAction;
  def: ScriptedActionDefinition;
  onChange: (updated: OffensiveScriptedAction) => void;
}

function ActionForm({ action, def, onChange }: ActionFormProps) {
  const updateParam = (key: ParamKind, value: string) => {
    onChange({ ...action, params: { ...action.params, [key]: value } });
  };
  const allParams: ParamKind[] = [...def.requiredParams, ...(def.optionalParams ?? [])];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, marginLeft: 24 }}>
      {allParams.map((paramKey) => (
        <div key={paramKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#475569', minWidth: 80 }}>
            {PARAM_LABELS[paramKey]}{def.requiredParams.includes(paramKey) ? ' *' : ''}
          </span>
          <select
            value={(action.params[paramKey] as string | undefined) ?? ''}
            onChange={(e) => updateParam(paramKey, e.target.value)}
            style={{ fontSize: 11, padding: '2px 4px', flex: 1 }}
          >
            <option value="">—</option>
            {paramOptionsFor(paramKey).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: '#475569', minWidth: 80 }}>Libellé libre</span>
        <input
          type="text"
          value={action.label ?? ''}
          onChange={(e) => onChange({ ...action, label: e.target.value || undefined })}
          placeholder={def.reader(action.params)}
          style={{ fontSize: 11, padding: '2px 4px', flex: 1, border: '1px solid #cbd5e1', borderRadius: 3 }}
        />
      </div>
    </div>
  );
}

function paramOptionsFor(key: ParamKind): string[] {
  if (key === 'side') return SIDES;
  if (key === 'direction') return DRIVE_DIRECTIONS;
  return ATTACKER_IDS;
}

function defaultParamsFor(def: ScriptedActionDefinition): OffensiveScriptedAction['params'] {
  const params: OffensiveScriptedAction['params'] = {};
  if (def.optionalParams?.includes('side')) params.side = 'fort';
  if (def.optionalParams?.includes('direction')) params.direction = 'panier';
  return params;
}

function iconBtn(disabled: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    padding: '2px 5px',
    border: '1px solid #e2e8f0',
    borderRadius: 4,
    background: '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? '#cbd5e1' : '#475569',
    minWidth: 22,
  };
}
