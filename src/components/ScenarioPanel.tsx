'use client';

import { useState, useEffect } from 'react';
import type {
  AttackerId, ScriptedAction, OffensiveScriptedAction, ActionSide, DriveDirection,
  DefensiveActionType, DefensiveActionParams, DefensiveScriptedAction, PlayerCount,
  ScenarioBranch,
} from '@/lib/types';
import { getActiveAttackerIds, getActiveDefenderIds } from '@/lib/logic/players';
import {
  SCRIPTED_ACTIONS_CATALOG,
  SCRIPTED_ACTIONS_BY_CATEGORY,
  type ParamKind,
  type ScriptedActionDefinition,
} from '@/lib/data/scriptedActionsCatalog';
import {
  DEFENSIVE_ACTIONS_CATALOG,
  ALL_DEFENSIVE_ACTION_TYPES,
} from '@/lib/data/defensiveActionsCatalog';
import type { ZoneRef } from '@/lib/data/courtZones';
import { newScriptedActionId } from '@/lib/logic/compileScenario';
import { ZoneSelect, ZonePickerModal } from './ZonePicker';
import { inferDefensiveDefaults } from '@/lib/logic/defensiveDefaults';
import { AddCoverageModal } from './AddCoverageModal';
import { DefensiveActionForm } from './DefensiveActionForm';
import { Panel, Button, COLORS } from './ui';

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
  targetZone: 'Zone cible',
  screenZone: 'Zone de l\'écran',
  fromZone: 'Zone de départ',
};

interface ScenarioPanelProps {
  scriptedActions: ScriptedAction[];
  scenarioBranches: ScenarioBranch[];
  activeBranchId: string | null;
  onAddAction: (action: ScriptedAction) => void;
  onUpdateAction: (id: string, action: ScriptedAction) => void;
  onDeleteAction: (id: string) => void;
  onMoveAction: (id: string, dir: 'up' | 'down') => void;
  onClearAll: () => void;
  onAddDefensiveAction: (
    type: DefensiveActionType,
    params: DefensiveActionParams,
    parentActionId?: string,
    affectedSteps?: number[],
  ) => void;
  onUpdateDefensiveAction: (id: string, updated: DefensiveScriptedAction) => void;
  onDeleteDefensiveAction: (id: string) => void;
  onAddBranch: (branch: ScenarioBranch) => void;
  onUpdateBranch: (id: string, branch: ScenarioBranch) => void;
  onDeleteBranch: (id: string) => void;
  onSetActiveBranch: (id: string | null) => void;
  playerCount: PlayerCount;
}

export function ScenarioPanel(props: ScenarioPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [addCoverageFor, setAddCoverageFor] = useState<string | null>(null);
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const c = COLORS.offense;
  const attackerIds = getActiveAttackerIds(props.playerCount);
  const defenderIds = getActiveDefenderIds(props.playerCount);

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
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(newAction.id);
      return next;
    });
    setShowAddModal(false);
  };

  const activeBranch = props.scenarioBranches.find((b) => b.id === props.activeBranchId) ?? null;
  // Phase 3 défense scriptable : la liste peut contenir des actions défensives ;
  // ce panneau ne gère pour l'instant que les offensives (la zone défensive
  // sera ajoutée Task 6). En mode branche active, on affiche les actions de la
  // branche au lieu du chemin principal.
  const offensiveActions = (activeBranch ? activeBranch.actions : props.scriptedActions).filter(
    (a): a is OffensiveScriptedAction => a.kind === 'offensive'
  );

  const handleAddBranch = (afterActionId: string) => {
    const label = window.prompt('Nom de la variante (ex: "Si drop", "Si switch")', `Variante ${props.scenarioBranches.length + 1}`);
    if (!label) return;
    const newBranch: ScenarioBranch = {
      id: newScriptedActionId(),
      label,
      divergeAfterActionId: afterActionId,
      actions: [],
    };
    props.onAddBranch(newBranch);
    props.onSetActiveBranch(newBranch.id);
  };

  const handleRenameBranch = (b: ScenarioBranch) => {
    const label = window.prompt('Renommer la variante', b.label);
    if (!label || label === b.label) return;
    props.onUpdateBranch(b.id, { ...b, label });
  };

  return (
    <Panel theme="offense" title="🎬 Scénario">
      <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.4 }}>
        Empile des actions FIBA nommées. Le système génère automatiquement les
        étapes correspondantes. Tu peux toujours retoucher chaque étape à la
        main ensuite — les modifs manuelles seront préservées.
      </div>

      {/* Sélecteur de branches : visible quand au moins une variante existe */}
      {props.scenarioBranches.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
          padding: '4px 0',
          borderBottom: '1px solid #fed7aa',
        }}>
          <BranchTab
            active={!activeBranch}
            label="Principal"
            onClick={() => props.onSetActiveBranch(null)}
          />
          {props.scenarioBranches.map((b) => (
            <BranchTab
              key={b.id}
              active={activeBranch?.id === b.id}
              label={b.label}
              onClick={() => props.onSetActiveBranch(b.id)}
              onRename={() => handleRenameBranch(b)}
              onDelete={() => {
                if (window.confirm(`Supprimer la variante "${b.label}" ?`)) {
                  props.onDeleteBranch(b.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {activeBranch && (
        <div style={{
          fontSize: 11,
          color: '#92400e',
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 4,
          padding: '6px 8px',
        }}>
          Variante active : <strong>{activeBranch.label}</strong> — diverge après l'action #{
            (props.scriptedActions.findIndex((a) => a.id === activeBranch.divergeAfterActionId) + 1)
              .toString().padStart(2, '0')
          } du chemin principal. Les actions ajoutées ici remplacent la suite du principal.
        </div>
      )}

      {/* Liste des actions */}
      {offensiveActions.length === 0 && (
        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: 8, textAlign: 'center' }}>
          Aucune action. Ajoute la première ci-dessous.
        </div>
      )}

      {offensiveActions.map((action, idx) => {
        const def = SCRIPTED_ACTIONS_CATALOG[action.type];
        if (!def) return null;
        const isExpanded = expandedIds.has(action.id);
        return (
          <div
            key={action.id}
            style={{
              border: '1px solid #fed7aa',
              borderLeft: '3px solid #ea580c',
              borderRadius: 6,
              background: '#fff',
              overflow: 'hidden',
            }}
          >
            {/* Header cliquable */}
            <div
              onClick={() => toggleExpand(action.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: '#9a3412' }}>
                #{(idx + 1).toString().padStart(2, '0')}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', flex: 1 }}>
                {def.label}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</span>
              {!activeBranch && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleAddBranch(action.id); }}
                  style={{
                    border: '1px solid #fed7aa', background: '#fff7ed', cursor: 'pointer',
                    fontSize: 10, color: '#9a3412', padding: '2px 6px', borderRadius: 3,
                  }}
                  title="Créer une variante qui diverge après cette action"
                >+ variante</button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); props.onDeleteAction(action.id); }}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 13, color: '#dc2626', padding: '2px 6px',
                }}
                title="Supprimer"
              >✕</button>
            </div>
            <div style={{ fontSize: 11, color: '#475569', padding: '0 10px 8px 28px' }}>
              {action.label || def.reader(action.params)}
            </div>

            {/* Panneau déplié */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid #f3f4f6', padding: 10, background: '#fffbf5' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9a3412', marginBottom: 6 }}>
                  PARAMÈTRES
                </div>
                <ActionForm
                  action={action}
                  def={def}
                  attackerIds={attackerIds}
                  onChange={(updated) => props.onUpdateAction(action.id, updated)}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button
                    onClick={() => props.onMoveAction(action.id, 'up')}
                    disabled={idx === 0}
                    style={{
                      flex: 1, padding: '6px 10px', fontSize: 11,
                      border: '1px solid #cbd5e1', borderRadius: 4,
                      background: idx === 0 ? '#f1f5f9' : '#fff',
                      cursor: idx === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >▲ monter</button>
                  <button
                    onClick={() => props.onMoveAction(action.id, 'down')}
                    disabled={idx === offensiveActions.length - 1}
                    style={{
                      flex: 1, padding: '6px 10px', fontSize: 11,
                      border: '1px solid #cbd5e1', borderRadius: 4,
                      background: idx === offensiveActions.length - 1 ? '#f1f5f9' : '#fff',
                      cursor: idx === offensiveActions.length - 1 ? 'not-allowed' : 'pointer',
                    }}
                  >▼ descendre</button>
                </div>

                {/* Couvertures défensives attachées à cette offensive */}
                {(() => {
                  const attached = props.scriptedActions.filter(
                    (a): a is DefensiveScriptedAction =>
                      a.kind === 'defensive' && a.parentActionId === action.id,
                  );
                  return (
                    <div style={{
                      marginTop: 12, paddingTop: 10,
                      borderTop: '1px dashed #e2e8f0',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#1e3a8a', marginBottom: 6 }}>
                        🛡️ COUVERTURES DÉFENSIVES
                      </div>
                      {attached.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginBottom: 6 }}>
                          (aucune)
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                          {attached.map((cov) => {
                            const cdef = DEFENSIVE_ACTIONS_CATALOG[cov.type];
                            return (
                              <div key={cov.id} style={{
                                background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4,
                                padding: '6px 8px', fontSize: 11, display: 'flex',
                                alignItems: 'center', gap: 6,
                              }}>
                                <span style={{ fontWeight: 600, color: '#1e3a8a' }}>{cdef.label}</span>
                                <span style={{ color: '#475569', flex: 1 }}>{cdef.reader(cov.params)}</span>
                                <button
                                  onClick={() => props.onDeleteDefensiveAction(cov.id)}
                                  style={{
                                    border: 'none', background: 'transparent', cursor: 'pointer',
                                    fontSize: 12, color: '#dc2626',
                                  }}
                                  title="Supprimer la couverture"
                                >✕</button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <button
                        onClick={() => setAddCoverageFor(action.id)}
                        style={{
                          fontSize: 11, padding: '5px 10px',
                          border: '1px solid #1e3a8a', borderRadius: 4,
                          background: '#fff', color: '#1e3a8a', cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >+ ajouter une couverture</button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}

      {/* Actions défensives libres */}
      {(() => {
        const free = props.scriptedActions.filter(
          (a): a is DefensiveScriptedAction =>
            a.kind === 'defensive' && a.parentActionId === undefined,
        );
        if (free.length === 0) return null;
        return (
          <>
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#1e3a8a',
              marginTop: 8, marginBottom: 4, letterSpacing: 0.5,
            }}>🛡️ DÉFENSE (LIBRE)</div>
            {free.map((act) => {
              const cdef = DEFENSIVE_ACTIONS_CATALOG[act.type];
              const isExpanded = expandedIds.has(act.id);
              return (
                <div key={act.id} style={{
                  border: '1px solid #dbeafe',
                  borderLeft: '3px solid #1e3a8a',
                  borderRadius: 6, background: '#fff', overflow: 'hidden',
                }}>
                  <div onClick={() => toggleExpand(act.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', cursor: 'pointer', userSelect: 'none',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a' }}>🛡️</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', flex: 1 }}>
                      {cdef.label}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); props.onDeleteDefensiveAction(act.id); }}
                      style={{
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        fontSize: 13, color: '#dc2626', padding: '2px 6px',
                      }}
                    >✕</button>
                  </div>
                  <div style={{ fontSize: 11, color: '#475569', padding: '0 10px 8px 28px' }}>
                    {cdef.reader(act.params)} · steps : {(act.affectedSteps ?? []).join(',') || '—'}
                  </div>
                  {isExpanded && (
                    <div style={{ padding: 10, background: '#eff6ff' }}>
                      <DefensiveActionForm
                        action={act}
                        defenderIds={defenderIds}
                        attackerIds={attackerIds}
                        onChange={(updated) => props.onUpdateDefensiveAction(act.id, updated)}
                      />
                      <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, color: '#1e3a8a' }}>
                        STEPS CIBLES
                      </div>
                      <input
                        type="text"
                        defaultValue={(act.affectedSteps ?? []).join(',')}
                        onBlur={(e) => {
                          const parsed = e.target.value
                            .split(',').map((s) => parseInt(s.trim(), 10))
                            .filter((n) => Number.isFinite(n) && n >= 0);
                          props.onUpdateDefensiveAction(act.id, { ...act, affectedSteps: parsed });
                        }}
                        placeholder="ex: 1,2,3"
                        style={{
                          fontSize: 11, padding: '4px 8px', borderRadius: 4,
                          border: '1px solid #cbd5e1', width: '100%',
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </>
        );
      })()}

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
        <AddActionModal
          onClose={() => setShowAddModal(false)}
          onPick={handlePickAction}
          onPickDefensive={(type) => {
            // Action libre : defaults minimaux, l'user complète après
            props.onAddDefensiveAction(type, { defenders: [] }, undefined, [0]);
            setShowAddModal(false);
          }}
        />
      )}

      {addCoverageFor && (() => {
        const parent = props.scriptedActions.find((a) => a.id === addCoverageFor);
        if (!parent || parent.kind !== 'offensive') return null;
        return (
          <AddCoverageModal
            onClose={() => setAddCoverageFor(null)}
            onPick={(type: DefensiveActionType) => {
              const params = inferDefensiveDefaults(type, parent);
              props.onAddDefensiveAction(type, params, parent.id);
              setAddCoverageFor(null);
            }}
          />
        );
      })()}
    </Panel>
  );
}

// ============================================================
// Modal popup d'ajout d'action
// ============================================================

interface AddActionModalProps {
  onClose: () => void;
  onPick: (def: ScriptedActionDefinition) => void;
  onPickDefensive: (type: DefensiveActionType) => void;
}

function AddActionModal({ onClose, onPick, onPickDefensive }: AddActionModalProps) {
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

          {/* Catégorie défense — actions libres */}
          {(() => {
            const visibleDef = ALL_DEFENSIVE_ACTION_TYPES.filter((type) => {
              const def = DEFENSIVE_ACTIONS_CATALOG[type];
              if (!filterLower) return true;
              return (
                def.label.toLowerCase().includes(filterLower) ||
                def.fibaTerm.toLowerCase().includes(filterLower) ||
                def.description.toLowerCase().includes(filterLower)
              );
            });
            if (visibleDef.length === 0) return null;
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 10, color: '#1e3a8a', textTransform: 'uppercase',
                  marginBottom: 6, letterSpacing: 0.5, fontWeight: 600,
                }}>
                  🛡️ Défense (libre)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {visibleDef.map((type) => {
                    const def = DEFENSIVE_ACTIONS_CATALOG[type];
                    return (
                      <button
                        key={type}
                        onClick={() => onPickDefensive(type)}
                        title={def.fibaTerm}
                        style={{
                          textAlign: 'left', fontSize: 12,
                          padding: '8px 10px',
                          border: '1px solid #dbeafe', borderRadius: 6,
                          background: '#fff', cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#1e3a8a' }}>{def.label}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{def.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
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
  attackerIds: AttackerId[];
  onChange: (updated: OffensiveScriptedAction) => void;
}

function ActionForm({ action, def, attackerIds, onChange }: ActionFormProps) {
  const updateParam = (key: ParamKind, value: string | undefined) => {
    const nextParams = { ...action.params } as Record<string, unknown>;
    if (value === undefined || value === '') delete nextParams[key];
    else nextParams[key] = value;
    onChange({ ...action, params: nextParams as OffensiveScriptedAction['params'] });
  };
  const updateZoneParam = (key: ParamKind, value: ZoneRef | undefined) => {
    updateParam(key, value);
  };
  const [zonePickerFor, setZonePickerFor] = useState<ParamKind | null>(null);
  const allParams: ParamKind[] = [...def.requiredParams, ...(def.optionalParams ?? [])];
  const isZoneParam = (k: ParamKind) =>
    k === 'targetZone' || k === 'screenZone' || k === 'fromZone';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, marginLeft: 24 }}>
      {allParams.map((paramKey) => (
        <div key={paramKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#475569', minWidth: 80 }}>
            {PARAM_LABELS[paramKey]}{def.requiredParams.includes(paramKey) ? ' *' : ''}
          </span>
          {isZoneParam(paramKey) ? (
            <ZoneSelect
              value={action.params[paramKey] as ZoneRef | undefined}
              onChange={(z) => updateZoneParam(paramKey, z)}
              onOpenPicker={() => setZonePickerFor(paramKey)}
            />
          ) : (
            <select
              value={(action.params[paramKey] as string | undefined) ?? ''}
              onChange={(e) => updateParam(paramKey, e.target.value)}
              style={{ fontSize: 11, padding: '2px 4px', flex: 1 }}
            >
              <option value="">—</option>
              {paramOptionsFor(paramKey, attackerIds).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
        </div>
      ))}
      {zonePickerFor && (
        <ZonePickerModal
          initialValue={action.params[zonePickerFor] as ZoneRef | undefined}
          onConfirm={(z) => { updateZoneParam(zonePickerFor, z); setZonePickerFor(null); }}
          onCancel={() => setZonePickerFor(null)}
        />
      )}
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

function paramOptionsFor(key: ParamKind, attackerIds: AttackerId[]): string[] {
  if (key === 'side') return SIDES;
  if (key === 'direction') return DRIVE_DIRECTIONS;
  // Les paramètres "zone" sont rendus via <ZoneSelect>, pas via ce dropdown.
  return attackerIds;
}

function defaultParamsFor(def: ScriptedActionDefinition): OffensiveScriptedAction['params'] {
  const params: OffensiveScriptedAction['params'] = {};
  if (def.optionalParams?.includes('side')) params.side = 'fort';
  if (def.optionalParams?.includes('direction')) params.direction = 'panier';
  return params;
}

function BranchTab({
  active, label, onClick, onRename, onDelete,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onDoubleClick={(e) => { e.stopPropagation(); onRename?.(); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        background: active ? '#ea580c' : '#fff',
        color: active ? '#fff' : '#9a3412',
        border: '1px solid #fed7aa',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      title={onRename ? `Double-clic pour renommer` : undefined}
    >
      <span>{label}</span>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 11, color: active ? '#fff' : '#dc2626', padding: 0, lineHeight: 1,
          }}
          title="Supprimer la variante"
        >×</button>
      )}
    </div>
  );
}
