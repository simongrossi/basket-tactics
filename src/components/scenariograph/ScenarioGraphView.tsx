'use client';

import { useState, useMemo } from 'react';
import type {
  AppState,
  ScenarioBranch,
  ScriptedAction,
  OffensiveScriptedAction,
  DefensiveScriptedAction,
  ContinuityLoop,
  AttackerId,
  DefenderId,
  ScriptedActionType,
  ActionSide,
  DriveDirection,
} from '@/lib/types';
import {
  SCRIPTED_ACTIONS_CATALOG,
  type ParamKind,
  type ScriptedActionDefinition,
} from '@/lib/data/scriptedActionsCatalog';
import {
  DEFENSIVE_ACTIONS_CATALOG,
} from '@/lib/data/defensiveActionsCatalog';
import { getActiveAttackerIds, getActiveDefenderIds } from '@/lib/logic/players';
import { newScriptedActionId } from '@/lib/logic/compileScenario';
import {
  buildCanonicalReadBranches,
  buildDriveKickReads,
  buildBackdoorReads,
} from '@/lib/data/readLibrary';
import { ZoneSelect, ZonePickerModal } from '../ZonePicker';
import { DefensiveActionForm } from '../DefensiveActionForm';
import { GraphCanvas } from './GraphCanvas';
import { MiniCourtPreview } from './MiniCourtPreview';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Sparkles,
  GitBranch,
} from 'lucide-react';
import type { ZoneRef } from '@/lib/data/courtZones';

const SIDES: ActionSide[] = ['fort', 'faible', 'axe'];
const DRIVE_DIRECTIONS: DriveDirection[] = ['panier', 'baseline', 'middle'];

const PARAM_LABELS: Record<string, string> = {
  ballHandler: 'Porteur',
  screener: "Poseur d'écran",
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
  screenZone: "Zone de l'écran",
  fromZone: 'Zone de départ',
  chain: 'Chaîne',
};

interface ScenarioGraphViewProps {
  state: AppState;
  activeStep: number;
  onSetActiveStep: (idx: number) => void;
  onAddScriptedAction: (action: ScriptedAction) => void;
  onUpdateScriptedAction: (id: string, action: ScriptedAction) => void;
  onDeleteScriptedAction: (id: string) => void;
  onMoveScriptedAction: (id: string, dir: 'up' | 'down') => void;
  onAddScenarioBranch: (branch: ScenarioBranch) => void;
  onUpdateScenarioBranch: (id: string, branch: ScenarioBranch) => void;
  onDeleteScenarioBranch: (id: string) => void;
  onSetActiveBranch: (id: string | null) => void;
  onSetContinuityLoop: (loop: ContinuityLoop | null) => void;
  onClose: () => void;
}

export function ScenarioGraphView({
  state,
  activeStep,
  onSetActiveStep,
  onAddScriptedAction,
  onUpdateScriptedAction,
  onDeleteScriptedAction,
  onMoveScriptedAction,
  onAddScenarioBranch,
  onUpdateScenarioBranch,
  onDeleteScenarioBranch,
  onSetActiveBranch,
  onSetContinuityLoop,
  onClose,
}: ScenarioGraphViewProps) {
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  const attackerIds = useMemo(() => getActiveAttackerIds(state.playerCount), [state.playerCount]);
  const defenderIds = useMemo(() => getActiveDefenderIds(state.playerCount), [state.playerCount]);

  const activeBranch = useMemo(() => {
    return state.activeBranchId
      ? state.scenarioBranches?.find((b) => b.id === state.activeBranchId) || null
      : null;
  }, [state.activeBranchId, state.scenarioBranches]);

  const currentActions = useMemo(() => {
    return activeBranch ? activeBranch.actions : (state.scriptedActions ?? []);
  }, [activeBranch, state.scriptedActions]);

  const selectedAction = useMemo(() => {
    return currentActions.find((a) => a.id === selectedActionId) || null;
  }, [currentActions, selectedActionId]);

  const selectedActionIndex = useMemo(() => {
    return currentActions.findIndex((a) => a.id === selectedActionId);
  }, [currentActions, selectedActionId]);

  const handleSelectedAction = (action: ScriptedAction | null, branchId: string | null) => {
    setSelectedActionId(action ? action.id : null);
    if (branchId) {
      onSetActiveBranch(branchId);
    }
  };

  const handleTypeChange = (newType: ScriptedActionType) => {
    if (!selectedAction || selectedAction.kind !== 'offensive') return;
    const def = SCRIPTED_ACTIONS_CATALOG[newType];
    if (!def) return;
    const updated: ScriptedAction = {
      kind: 'offensive',
      id: selectedAction.id,
      type: newType,
      params: defaultParamsFor(def),
    };
    onUpdateScriptedAction(selectedAction.id, updated);
  };

  const handleDefensiveTypeChange = (newType: any) => {
    if (!selectedAction || selectedAction.kind !== 'defensive') return;
    const def = DEFENSIVE_ACTIONS_CATALOG[newType as keyof typeof DEFENSIVE_ACTIONS_CATALOG];
    if (!def) return;
    const updated: ScriptedAction = {
      kind: 'defensive',
      id: selectedAction.id,
      type: newType,
      parentActionId: selectedAction.parentActionId,
      affectedSteps: selectedAction.affectedSteps,
      params: defaultDefensiveParamsFor(def),
    };
    onUpdateScriptedAction(selectedAction.id, updated);
  };

  const handleOffensiveActionChange = (updated: OffensiveScriptedAction) => {
    onUpdateScriptedAction(updated.id, updated);
  };

  const handleDefensiveActionChange = (updated: DefensiveScriptedAction) => {
    onUpdateScriptedAction(updated.id, updated);
  };

  const handleInsertAfter = () => {
    if (!selectedAction) return;
    const idx = selectedActionIndex;
    if (idx === -1) return;

    const newAction: ScriptedAction = {
      kind: 'offensive',
      id: newScriptedActionId(),
      type: 'pass',
      params: { from: 'O1', to: 'O2' },
      label: 'Passe',
    };

    onAddScriptedAction(newAction);

    // Décaler l'action pour la placer juste après selectedAction
    const moves = currentActions.length - (idx + 1);
    for (let k = 0; k < moves; k++) {
      onMoveScriptedAction(newAction.id, 'up');
    }

    setSelectedActionId(newAction.id);
  };

  const handleAddActionAtEnd = () => {
    const newAction: ScriptedAction = {
      kind: 'offensive',
      id: newScriptedActionId(),
      type: 'pass',
      params: { from: 'O1', to: 'O2' },
      label: 'Passe',
    };
    onAddScriptedAction(newAction);
    setSelectedActionId(newAction.id);
  };

  const handleAddDefensiveActionAtEnd = () => {
    const newAction: ScriptedAction = {
      kind: 'defensive',
      id: newScriptedActionId(),
      type: 'help-and-recover',
      params: { defenders: ['D1'], target: 'O1' },
      label: 'Help & recover',
    };
    onAddScriptedAction(newAction);
    setSelectedActionId(newAction.id);
  };

  const handleDeleteAction = () => {
    if (!selectedAction) return;
    onDeleteScriptedAction(selectedAction.id);
    setSelectedActionId(null);
  };

  const handleAddBranch = (afterActionId: string) => {
    const label = window.prompt(
      'Nom de la variante (ex: "Si drop", "Si switch")',
      `Variante ${(state.scenarioBranches?.length ?? 0) + 1}`
    );
    if (!label) return;
    const newBranch: ScenarioBranch = {
      id: newScriptedActionId(),
      label,
      divergeAfterActionId: afterActionId,
      actions: [],
    };
    onAddScenarioBranch(newBranch);
    onSetActiveBranch(newBranch.id);
  };

  const handleInsertReads = (action: OffensiveScriptedAction) => {
    const candidates: ScenarioBranch[] = [];
    if (action.params.ballHandler && action.params.screener) {
      const weakSideId = attackerIds.find(
        (id) => id !== action.params.ballHandler && id !== action.params.screener
      );
      candidates.push(...buildCanonicalReadBranches(action, { weakSideId }, newScriptedActionId));
    }
    if (action.params.driver) {
      candidates.push(
        ...buildDriveKickReads(action, { attackers: attackerIds }, newScriptedActionId)
      );
    }
    if (action.params.to || action.params.receiver) {
      candidates.push(...buildBackdoorReads(action, newScriptedActionId));
    }
    const existing = new Set(
      state.scenarioBranches?.map(branchTriggerSig).filter((s): s is string => s !== null) ?? []
    );
    const fresh = candidates.filter((b) => !existing.has(branchTriggerSig(b)!));
    if (fresh.length === 0) {
      window.alert('Les lectures standard de cette action sont déjà présentes.');
      return;
    }
    fresh.forEach((branch) => onAddScenarioBranch(branch));
  };

  const isReadEligible = (a: ScriptedAction) => {
    if (a.kind !== 'offensive') return false;
    return (
      (!!a.params.ballHandler && !!a.params.screener) ||
      !!a.params.driver ||
      !!a.params.to ||
      !!a.params.receiver
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        background: '#0f172a',
        color: '#fff',
        position: 'relative',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Panneau Latéral Gauche : Properties Editor */}
      <div
        style={{
          width: 320,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 20,
          overflowY: 'auto',
        }}
      >
        {/* Header du panneau */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
            title="Retour au terrain"
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#f97316', letterSpacing: 0.5 }}>
              SCÉNARIO NODAL
            </span>
            <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
              Éditeur Graphique de Jeu
            </span>
          </div>
        </div>

        <div style={{ width: '100%', height: 1, background: 'rgba(255, 255, 255, 0.08)', marginBottom: 20 }} />

        {/* Détails de l'action sélectionnée */}
        {selectedAction ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Tag / Badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: selectedAction.kind === 'offensive' ? '#fdba74' : '#93c5fd',
                  background: selectedAction.kind === 'offensive' ? 'rgba(253, 186, 116, 0.1)' : 'rgba(147, 197, 253, 0.1)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: selectedAction.kind === 'offensive' ? '1px solid rgba(253, 186, 116, 0.2)' : '1px solid rgba(147, 197, 253, 0.2)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Action #{selectedActionIndex + 1} ({selectedAction.kind === 'offensive' ? 'Attaque' : 'Défense'})
              </span>
            </div>

            {/* Type selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Type d'action
              </span>
              {selectedAction.kind === 'offensive' ? (
                <select
                  value={selectedAction.type}
                  onChange={(e) => handleTypeChange(e.target.value as ScriptedActionType)}
                  style={{
                    fontSize: 12,
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#fff',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {Object.values(SCRIPTED_ACTIONS_CATALOG).map((def) => (
                    <option key={def.type} value={def.type}>
                      {def.label}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={selectedAction.type}
                  onChange={(e) => handleDefensiveTypeChange(e.target.value as any)}
                  style={{
                    fontSize: 12,
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#fff',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {Object.values(DEFENSIVE_ACTIONS_CATALOG).map((def) => (
                    <option key={def.type} value={def.type}>
                      {def.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Formulaire des paramètres */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Paramètres
              </span>
              {selectedAction.kind === 'offensive' ? (
                <ActionForm
                  action={selectedAction}
                  def={SCRIPTED_ACTIONS_CATALOG[selectedAction.type]}
                  attackerIds={attackerIds}
                  onChange={handleOffensiveActionChange}
                />
              ) : (
                <DefensiveActionForm
                  action={selectedAction}
                  defenderIds={defenderIds}
                  attackerIds={attackerIds}
                  onChange={handleDefensiveActionChange}
                />
              )}
            </div>

            <div style={{ width: '100%', height: 1, background: 'rgba(255, 255, 255, 0.08)', margin: '10px 0' }} />

            {/* Reordonner l'action */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Ordonner
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onMoveScriptedAction(selectedAction.id, 'up')}
                  disabled={selectedActionIndex === 0}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: selectedActionIndex === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: selectedActionIndex === 0 ? '#475569' : '#cbd5e1',
                    cursor: selectedActionIndex === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ArrowUp size={12} /> Monter
                </button>
                <button
                  onClick={() => onMoveScriptedAction(selectedAction.id, 'down')}
                  disabled={selectedActionIndex === currentActions.length - 1}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: selectedActionIndex === currentActions.length - 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: selectedActionIndex === currentActions.length - 1 ? '#475569' : '#cbd5e1',
                    cursor: selectedActionIndex === currentActions.length - 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ArrowDown size={12} /> Descendre
                </button>
              </div>
            </div>

            {/* Insertion d'actions & branches */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <button
                onClick={handleInsertAfter}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: '#16a34a',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} /> Insérer après
              </button>

              {selectedAction.kind === 'offensive' && (
                <>
                  {isReadEligible(selectedAction) && (
                    <button
                      onClick={() => handleInsertReads(selectedAction as OffensiveScriptedAction)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: 'rgba(168, 85, 247, 0.1)',
                        border: '1px solid rgba(168, 85, 247, 0.4)',
                        color: '#c084fc',
                        cursor: 'pointer',
                      }}
                    >
                      <Sparkles size={14} /> Lectures auto (Phase L)
                    </button>
                  )}

                  <button
                    onClick={() => handleAddBranch(selectedAction.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: 'rgba(139, 92, 246, 0.1)',
                      border: '1px solid rgba(139, 92, 246, 0.4)',
                      color: '#a78bfa',
                      cursor: 'pointer',
                    }}
                  >
                    <GitBranch size={14} /> Créer une Variante
                  </button>
                </>
              )}

              <button
                onClick={handleDeleteAction}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  cursor: 'pointer',
                  marginTop: 10,
                }}
              >
                <Trash2 size={14} /> Supprimer l'Action
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1, justifyContent: 'center' }}>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 8,
                padding: 16,
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
              👉 Sélectionnez un nœud d'action sur le graphe pour configurer ses paramètres, ordonner son déroulé ou insérer de nouvelles branches tactiques.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleAddActionAtEnd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: '#f97316',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} /> Action à la fin
              </button>
              <button
                onClick={handleAddDefensiveActionAtEnd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#60a5fa',
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} /> Directive défensive libre
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Workspace (Graph Canvas + Floating Indicators + PiP) */}
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>
        {/* Canvas */}
        <GraphCanvas
          state={state}
          activeStep={activeStep}
          onSetActiveStep={onSetActiveStep}
          onAddScriptedAction={onAddScriptedAction}
          onUpdateScriptedAction={onUpdateScriptedAction}
          onDeleteScriptedAction={onDeleteScriptedAction}
          onAddScenarioBranch={onAddScenarioBranch}
          onDeleteScenarioBranch={onDeleteScenarioBranch}
          onSetActiveBranch={onSetActiveBranch}
          onSelectedAction={handleSelectedAction}
          selectedActionId={selectedActionId}
        />

        {/* Floating Active Branch Pill (top-left) */}
        {state.activeBranchId && (() => {
          const branch = state.scenarioBranches?.find((b) => b.id === state.activeBranchId);
          return (
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(109, 40, 217, 0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                borderRadius: 8,
                padding: '8px 12px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                zIndex: 10,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 800,
                    color: '#c4b5fd',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Variante active
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                  {branch?.label || 'Sans nom'}
                </span>
              </div>
              <button
                onClick={() => onSetActiveBranch(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
              >
                Retour
              </button>
            </div>
          );
        })()}

        {/* Floating Mini Court (PiP) */}
        <MiniCourtPreview
          state={state}
          activeStep={activeStep}
          onSetActiveStep={onSetActiveStep}
        />
      </div>
    </div>
  );
}

// ============================================================
// Local Component: ActionForm (copied/adapted from ScenarioPanel)
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

  const updateChain = (chain: AttackerId[], modes?: ('pass' | 'dho')[]) => {
    const nextParams = { ...action.params } as Record<string, unknown>;
    nextParams.chain = chain;
    if (modes) nextParams.chainLinkModes = modes; else delete nextParams.chainLinkModes;
    onChange({ ...action, params: nextParams as OffensiveScriptedAction['params'] });
  };

  const [zonePickerFor, setZonePickerFor] = useState<ParamKind | null>(null);
  const allParams = useMemo(() => {
    return [...def.requiredParams, ...(def.optionalParams ?? [])];
  }, [def]);

  const isZoneParam = (k: ParamKind) =>
    k === 'targetZone' || k === 'screenZone' || k === 'fromZone';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
      {allParams.map((paramKey) => (
        <div key={paramKey} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
            {PARAM_LABELS[paramKey]}{def.requiredParams.includes(paramKey) ? ' *' : ''}
          </span>
          {paramKey === 'chain' ? (
            <ChainEditor
              chain={(action.params.chain as AttackerId[] | undefined) ?? []}
              modes={action.params.chainLinkModes as ('pass' | 'dho')[] | undefined}
              defaultMode={action.type === 'dho-chain' ? 'dho' : 'pass'}
              attackerIds={attackerIds}
              onChange={updateChain}
            />
          ) : isZoneParam(paramKey) ? (
            <ZoneSelect
              value={action.params[paramKey] as ZoneRef | undefined}
              onChange={(z) => updateZoneParam(paramKey, z)}
              onOpenPicker={() => setZonePickerFor(paramKey)}
            />
          ) : (
            <select
              value={(action.params[paramKey] as string | undefined) ?? ''}
              onChange={(e) => updateParam(paramKey, e.target.value)}
              style={{
                fontSize: 11,
                padding: '4px 6px',
                borderRadius: 4,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#fff',
                width: '100%',
                outline: 'none',
              }}
            >
              <option value="">—</option>
              {paramOptionsFor(paramKey, attackerIds).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
      {zonePickerFor && (
        <ZonePickerModal
          initialValue={action.params[zonePickerFor] as ZoneRef | undefined}
          onConfirm={(z) => {
            updateZoneParam(zonePickerFor, z);
            setZonePickerFor(null);
          }}
          onCancel={() => setZonePickerFor(null)}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>Libellé personnalisé</span>
        <input
          type="text"
          value={action.label ?? ''}
          onChange={(e) => onChange({ ...action, label: e.target.value || undefined })}
          placeholder={def.reader(action.params)}
          style={{
            fontSize: 11,
            padding: '4px 6px',
            borderRadius: 4,
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#fff',
            width: '100%',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
}

// ============================================================
// Local Component: ChainEditor (copied/adapted from ScenarioPanel)
// ============================================================

function ChainEditor({
  chain,
  modes,
  defaultMode,
  attackerIds,
  onChange,
}: {
  chain: AttackerId[];
  modes: ('pass' | 'dho')[] | undefined;
  defaultMode: 'pass' | 'dho';
  attackerIds: AttackerId[];
  onChange: (chain: AttackerId[], modes?: ('pass' | 'dho')[]) => void;
}) {
  const linkMode = (i: number): 'pass' | 'dho' => modes?.[i] ?? defaultMode;
  const setLinkMode = (i: number, m: 'pass' | 'dho') => {
    const next = Array.from(
      { length: Math.max(chain.length - 1, 0) },
      (_, j) => (j === i ? m : linkMode(j))
    );
    onChange(chain, next);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {chain.map((p, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={p}
              onChange={(e) =>
                onChange(
                  chain.map((x, j) => (j === i ? (e.target.value as AttackerId) : x)),
                  modes
                )
              }
              style={{
                fontSize: 11,
                padding: '2px 4px',
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#fff',
                borderRadius: 4,
                outline: 'none',
              }}
            >
              {attackerIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            {chain.length > 2 && (
              <button
                onClick={() =>
                  onChange(
                    chain.filter((_, j) => j !== i),
                    modes?.filter((_, j) => j !== Math.min(i, chain.length - 2))
                  )
                }
                title="Retirer"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                ×
              </button>
            )}
          </div>
          {i < chain.length - 1 && (
            <button
              onClick={() => setLinkMode(i, linkMode(i) === 'pass' ? 'dho' : 'pass')}
              style={{
                alignSelf: 'flex-start',
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid #475569',
                background: '#1e293b',
                color: '#cbd5e1',
                cursor: 'pointer',
              }}
            >
              ↓ {linkMode(i) === 'dho' ? 'DHO' : 'passe'}
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => {
          const used = new Set(chain);
          const next = attackerIds.find((id) => !used.has(id)) ?? attackerIds[0];
          onChange([...chain, next], modes);
        }}
        style={{
          alignSelf: 'flex-start',
          fontSize: 10,
          padding: '3px 8px',
          border: '1px solid #475569',
          borderRadius: 4,
          background: 'transparent',
          color: '#cbd5e1',
          cursor: 'pointer',
          marginTop: 2,
        }}
      >
        + Maillon
      </button>
    </div>
  );
}

// ============================================================
// Parameter Helper Functions
// ============================================================

function paramOptionsFor(key: string, attackerIds: AttackerId[]): string[] {
  if (key === 'side') return SIDES;
  if (key === 'direction') return DRIVE_DIRECTIONS;
  return attackerIds;
}

function defaultParamsFor(def: ScriptedActionDefinition): OffensiveScriptedAction['params'] {
  const params: OffensiveScriptedAction['params'] = {};
  if (def.optionalParams?.includes('side')) params.side = 'fort';
  if (def.optionalParams?.includes('direction')) params.direction = 'panier';
  if (def.requiredParams.includes('chain')) params.chain = ['O1', 'O2'];
  return params;
}

function defaultDefensiveParamsFor(def: any): any {
  const params: any = { defenders: ['D1'] };
  if (def.requiredParams.includes('target')) params.target = 'O1';
  if (def.requiredParams.includes('swapWith')) params.swapWith = 'D2';
  if (def.requiredParams.includes('thirdSwap')) params.thirdSwap = 'D3';
  if (def.requiredParams.includes('dropDepth') || def.optionalParams?.includes('dropDepth'))
    params.dropDepth = 'medium';
  return params;
}

/** Signature unique d'un déclencheur de lecture (dedup d'insertion). */
function branchTriggerSig(b: ScenarioBranch): string | null {
  const t = b.trigger;
  if (!t) return null;
  switch (t.kind) {
    case 'screen-coverage':
      return `sc:${t.actionId}:${t.coverage.join('|')}`;
    case 'help-source':
      return `hs:${t.actionId}:${t.source.join('|')}`;
    case 'deny':
      return `deny:${t.actionId}:${t.receiver}`;
  }
}
