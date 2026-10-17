'use client';

import { useState, useEffect } from 'react';
import { InterfaceGate } from './interface/InterfaceLevel';
import type {
  AttackerId, ScriptedAction, OffensiveScriptedAction, ActionSide, DriveDirection,
  DefensiveActionType, DefensiveActionParams, DefensiveScriptedAction, PlayerCount,
  ScenarioBranch, ReadTrigger, ScreenRule,
} from '@/lib/types';
import { coverageBranchStats } from '@/lib/logic/reads/coverageRoll';
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
import { buildCanonicalReadBranches, buildDriveKickReads, buildBackdoorReads } from '@/lib/data/readLibrary';
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
  chain: 'Chaîne',
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
  onAddBranches: (branches: ScenarioBranch[]) => void;
  onUpdateBranch: (id: string, branch: ScenarioBranch) => void;
  onDeleteBranch: (id: string) => void;
  onSetActiveBranch: (id: string | null) => void;
  /** Id de la branche réactive auto-résolue (badge « Lecture : … »). */
  resolvedReadBranchId?: string | null;
  // -- Lecture probabiliste (Phase L proba) --
  probabilisticReadsEnabled?: boolean;
  coverageDistribution?: { coverage: ScreenRule; weight: number }[];
  rolledCoverage?: ScreenRule;
  onToggleProbabilisticReads: (enabled: boolean) => void;
  onSetCoverageDistribution: (dist: { coverage: ScreenRule; weight: number }[]) => void;
  onRerollCoverage: () => void;
  continuityLoop?: import('@/lib/types').ContinuityLoop;
  onSetContinuityLoop: (loop: import('@/lib/types').ContinuityLoop | null) => void;
  autoReplacementEnabled?: boolean;
  autoReplacementDepth?: number;
  onSetAutoReplacement: (enabled: boolean, depth: number) => void;
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

  // Phase L proba — couvertures lisibles = celles présentes dans les triggers
  // screen-coverage des branches.
  const readableCoverages = Array.from(
    new Set(
      props.scenarioBranches
        .filter((b) => b.trigger?.kind === 'screen-coverage')
        .flatMap((b) => (b.trigger?.kind === 'screen-coverage' ? b.trigger.coverage : [])),
    ),
  );
  const hasReactiveScreenBranches = readableCoverages.length > 0;
  const stats = coverageBranchStats({
    coverageDistribution: props.coverageDistribution,
    scenarioBranches: props.scenarioBranches,
  } as Parameters<typeof coverageBranchStats>[0]);
  const dist = props.coverageDistribution ?? [];

  // Phase Motion — continuity : actions offensives candidates pour borner la
  // boucle, et attaquants actifs pour la roue de rotation.
  const offActionsForLoop = props.scriptedActions
    .map((a, i) => ({ a, i }))
    .filter((x) => x.a.kind === 'offensive');
  const loopActive = !!props.continuityLoop;
  const loop = props.continuityLoop;
  const rotation = loop?.rotation ?? attackerIds;
  const defaultLoop = (): import('@/lib/types').ContinuityLoop | null => {
    if (offActionsForLoop.length < 2) return null;
    return {
      startActionId: offActionsForLoop[0].a.id,
      endActionId: offActionsForLoop[offActionsForLoop.length - 1].a.id,
      rotation: attackerIds,
      maxCycles: 3,
    };
  };

  // Phase Motion — auto-replacement : visible s'il existe une action déclencheuse.
  const AUTO_REPL_TRIGGERS = new Set(['basket-cut', 'backdoor-cut', 'flash-cut', 'give-and-go', 'drive']);
  const hasReplacementTrigger = props.scriptedActions.some(
    (a) => a.kind === 'offensive' && AUTO_REPL_TRIGGERS.has(a.type),
  );
  const replDepth = props.autoReplacementDepth ?? 2;

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

  // Une action est éligible aux lectures auto si on sait en lire la défense :
  //  - écran porteur (porteur + poseur) → lectures de couverture PnR
  //  - drive / iso (pénétrant) → lectures drive-and-kick (origine d'aide)
  //  - passe / kick-out / give-and-go (receveur) → lecture backdoor (deny)
  const isReadEligible = (a: OffensiveScriptedAction) =>
    (!!a.params.ballHandler && !!a.params.screener) ||
    !!a.params.driver ||
    !!a.params.to ||
    !!a.params.receiver;

  const handleInsertReads = (action: OffensiveScriptedAction) => {
    const candidates: ScenarioBranch[] = [];
    if (action.params.ballHandler && action.params.screener) {
      const weakSideId = attackerIds.find(
        (id) => id !== action.params.ballHandler && id !== action.params.screener,
      );
      candidates.push(...buildCanonicalReadBranches(action, { weakSideId }, newScriptedActionId));
    }
    if (action.params.driver) {
      candidates.push(
        ...buildDriveKickReads(action, { attackers: attackerIds }, newScriptedActionId),
      );
    }
    if (action.params.to || action.params.receiver) {
      candidates.push(...buildBackdoorReads(action, newScriptedActionId));
    }
    // Dedup par signature de déclencheur pour ne pas réinsérer une lecture déjà
    // présente sur cette action.
    const existing = new Set(
      props.scenarioBranches.map(branchTriggerSig).filter((s): s is string => s !== null),
    );
    const fresh = candidates.filter((b) => !existing.has(branchTriggerSig(b)!));
    if (fresh.length === 0) {
      window.alert('Les lectures standard de cette action sont déjà présentes.');
      return;
    }
    props.onAddBranches(fresh);
  };

  return (
    <Panel theme="offense" title="🎬 Scénario">
      <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.4 }}>
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
              autoActive={!activeBranch && props.resolvedReadBranchId === b.id}
              label={b.label}
              chips={triggerChips(b.trigger)}
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

      {/* Badge de lecture réactive : une branche s'est auto-activée selon la
          couverture défensive jouée (aucun choix manuel). */}
      {!activeBranch && props.resolvedReadBranchId && (() => {
        const read = props.scenarioBranches.find((b) => b.id === props.resolvedReadBranchId);
        if (!read) return null;
        const cov = triggerChips(read.trigger).join(' / ').toUpperCase();
        return (
          <div style={{
            fontSize: 11,
            color: '#6ee7b7',
            background: 'rgba(110, 231, 183, 0.12)',
            border: '1px solid rgba(110, 231, 183, 0.4)',
            borderRadius: 4,
            padding: '6px 8px',
          }}>
            🤖 Lecture auto : <strong>{read.label}</strong>
            {cov ? <> — déclencheur : <strong>{cov}</strong></> : null}
            <div style={{ color: '#a7f3d0', marginTop: 2 }}>
              L'offense s'adapte à la défense. Change la couverture défensive pour
              voir la lecture basculer.
            </div>
          </div>
        );
      })()}

      {/* Lecture probabiliste : la défense joue une distribution de couvertures
          tirée de façon seedée (Phase L proba). N'apparaît qu'avec des branches
          réactives screen-coverage et en mode Analyse/Dev. */}
      {hasReactiveScreenBranches && (
        <InterfaceGate min="analysis">
          <div style={{ marginTop: 10, padding: 8, border: '1px solid #334155', borderRadius: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={!!props.probabilisticReadsEnabled}
                onChange={(e) => props.onToggleProbabilisticReads(e.target.checked)}
              />
              🎲 Lecture probabiliste (tendances défensives)
            </label>

            {props.probabilisticReadsEnabled && (
              <div style={{ marginTop: 8 }}>
                {/* Éditeur de distribution */}
                {dist.map((d, di) => (
                  <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <select
                      value={d.coverage}
                      onChange={(e) => {
                        const next = dist.map((x, j) =>
                          j === di ? { ...x, coverage: e.target.value as ScreenRule } : x,
                        );
                        props.onSetCoverageDistribution(next);
                      }}
                      style={{ fontSize: 11 }}
                    >
                      {readableCoverages.map((cov) => (
                        <option key={cov} value={cov}>{cov}</option>
                      ))}
                    </select>
                    <input
                      type="number" min={0} max={100} step={5}
                      value={Math.round(d.weight * 100)}
                      onChange={(e) => {
                        const w = Math.max(0, parseInt(e.target.value) || 0) / 100;
                        const next = dist.map((x, j) => (j === di ? { ...x, weight: w } : x));
                        props.onSetCoverageDistribution(next);
                      }}
                      style={{ width: 56, fontSize: 11 }}
                    />
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>%</span>
                    <button
                      onClick={() => props.onSetCoverageDistribution(dist.filter((_, j) => j !== di))}
                      style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}
                      title="Retirer cette couverture"
                    >×</button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const used = new Set(dist.map((d) => d.coverage));
                    const next = readableCoverages.find((cov) => !used.has(cov));
                    if (next) props.onSetCoverageDistribution([...dist, { coverage: next, weight: 0.5 }]);
                  }}
                  style={{ fontSize: 10, padding: '2px 6px', border: '1px solid #94a3b8', borderRadius: 3, background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
                >+ couverture</button>

                {/* Bouton rejouer + couverture réalisée */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => props.onRerollCoverage()}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', cursor: 'pointer' }}
                  >🎲 Rejouer la défense</button>
                  {props.rolledCoverage && (
                    <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                      Tirage : <strong style={{ textTransform: 'uppercase' }}>{props.rolledCoverage}</strong>
                    </span>
                  )}
                </div>

                {/* Panneau stats */}
                <div style={{ marginTop: 8 }}>
                  {stats.map((s, si) => (
                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, marginBottom: 2 }}>
                      <span style={{ minWidth: 48, color: '#94a3b8', textTransform: 'uppercase' }}>{s.coverage}</span>
                      <div style={{ flex: 1, height: 8, background: '#0f172a', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(s.weight * 100)}%`, height: '100%', background: '#6366f1' }} />
                      </div>
                      <span style={{ minWidth: 80, color: '#cbd5e1' }}>{Math.round(s.weight * 100)}% {s.branchLabel}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </InterfaceGate>
      )}

      {/* Continuity / motion offense — boucle rotative (Phase Motion). N'apparaît
          qu'avec ≥ 2 actions offensives. */}
      {offActionsForLoop.length >= 2 && (
        <div style={{ marginTop: 10, padding: 8, border: '1px solid #334155', borderRadius: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={loopActive}
              onChange={(e) => props.onSetContinuityLoop(e.target.checked ? defaultLoop() : null)}
            />
            🔁 Continuité (motion) — boucle rotative
          </label>

          {loopActive && loop && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Plage de boucle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ color: '#94a3b8' }}>de</span>
                <select
                  value={loop.startActionId}
                  onChange={(e) => props.onSetContinuityLoop({ ...loop, startActionId: e.target.value })}
                  style={{ fontSize: 11 }}
                >
                  {offActionsForLoop.map((x) => (
                    <option key={x.a.id} value={x.a.id}>#{x.i + 1} {SCRIPTED_ACTIONS_CATALOG[x.a.type]?.label ?? x.a.type}</option>
                  ))}
                </select>
                <span style={{ color: '#94a3b8' }}>à</span>
                <select
                  value={loop.endActionId}
                  onChange={(e) => props.onSetContinuityLoop({ ...loop, endActionId: e.target.value })}
                  style={{ fontSize: 11 }}
                >
                  {offActionsForLoop.map((x) => (
                    <option key={x.a.id} value={x.a.id}>#{x.i + 1} {SCRIPTED_ACTIONS_CATALOG[x.a.type]?.label ?? x.a.type}</option>
                  ))}
                </select>
              </div>

              {/* Roue de rotation */}
              <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                <div style={{ color: '#94a3b8', marginBottom: 2 }}>Rotation des rôles :</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  {rotation.map((p, ri) => (
                    <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <strong>{p}</strong>
                      {ri < rotation.length - 1 && <span style={{ color: '#64748b' }}>→</span>}
                      <button
                        onClick={() => {
                          const next = [...rotation];
                          const j = (ri + 1) % next.length;
                          [next[ri], next[j]] = [next[j], next[ri]];
                          props.onSetContinuityLoop({ ...loop, rotation: next });
                        }}
                        title="Permuter avec le suivant"
                        style={{ border: 'none', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 10 }}
                      >⇄</button>
                    </span>
                  ))}
                  <span style={{ color: '#64748b' }}>↺</span>
                </div>
              </div>

              {/* Cycles max */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ color: '#94a3b8' }}>cycles max</span>
                <input
                  type="number" min={1} max={6} step={1}
                  value={loop.maxCycles}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(6, parseInt(e.target.value) || 1));
                    props.onSetContinuityLoop({ ...loop, maxCycles: v });
                  }}
                  style={{ width: 48, fontSize: 11 }}
                />
              </div>

              {/* Sortie sur lecture (option C) */}
              {props.scenarioBranches.some((b) => b.trigger?.kind === 'screen-coverage') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span style={{ color: '#94a3b8' }}>sortir si lecture</span>
                  <select
                    value={loop.exitBranchId ?? ''}
                    onChange={(e) => props.onSetContinuityLoop({ ...loop, exitBranchId: e.target.value || null })}
                    style={{ fontSize: 11 }}
                  >
                    <option value="">— aucune —</option>
                    {props.scenarioBranches
                      .filter((b) => b.trigger?.kind === 'screen-coverage')
                      .map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                  </select>
                </div>
              )}

              {/* Récap */}
              <div style={{ fontSize: 10, color: '#64748b' }}>
                Boucle : {rotation.join('→')} ↺ · {loop.maxCycles} cycles max
                {loop.exitBranchId ? ' · sortie sur lecture' : ''}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Auto-replacement — cascade de fill sur cut/drive (Phase Motion). */}
      {hasReplacementTrigger && (
        <div style={{ marginTop: 10, padding: 8, border: '1px solid #334155', borderRadius: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={!!props.autoReplacementEnabled}
              onChange={(e) => props.onSetAutoReplacement(e.target.checked, replDepth)}
            />
            ↪ Auto-replacement (maintien du spacing)
          </label>
          {props.autoReplacementEnabled && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ color: '#94a3b8' }}>profondeur de cascade</span>
                <input
                  type="number" min={1} max={4} step={1}
                  value={replDepth}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(4, parseInt(e.target.value) || 1));
                    props.onSetAutoReplacement(true, v);
                  }}
                  style={{ width: 48, fontSize: 11 }}
                />
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                Fill auto : cascade prof. {replDepth} sur cut/drive (le joueur derrière comble le spot vidé).
              </div>
            </div>
          )}
        </div>
      )}

      {activeBranch && (
        <div style={{
          fontSize: 11,
          color: '#fbbf24',
          background: 'rgba(251, 191, 36, 0.12)',
          border: '1px solid rgba(251, 191, 36, 0.4)',
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
              background: '#262a32',
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
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fdba74' }}>
                #{(idx + 1).toString().padStart(2, '0')}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb', flex: 1 }}>
                {def.label}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</span>
              {!activeBranch && isReadEligible(action) && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleInsertReads(action); }}
                  style={{
                    border: '1px solid #6ee7b7', background: '#0f2a22', cursor: 'pointer',
                    fontSize: 10, color: '#6ee7b7', padding: '2px 6px', borderRadius: 3,
                    fontWeight: 600,
                  }}
                  title="Insérer les lectures standard selon la défense lue (couverture PnR, origine d'aide sur drive, ou deny → backdoor)"
                >🤖 lectures auto</button>
              )}
              {!activeBranch && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleAddBranch(action.id); }}
                  style={{
                    border: '1px solid #fed7aa', background: '#262a32', cursor: 'pointer',
                    fontSize: 10, color: '#fdba74', padding: '2px 6px', borderRadius: 3,
                  }}
                  title="Créer une variante manuelle qui diverge après cette action"
                >+ variante</button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); props.onDeleteAction(action.id); }}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 13, color: '#f87171', padding: '2px 6px',
                }}
                title="Supprimer"
                aria-label={`Supprimer l’action ${action.label || def.label}`}
                className="bt-touch"
              >✕</button>
            </div>
            <div style={{ fontSize: 11, color: '#cbd5e1', padding: '0 10px 8px 28px' }}>
              {action.label || def.reader(action.params)}
            </div>

            {/* Panneau déplié */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid #2a2d35', padding: 10, background: '#1f2329' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#fdba74', marginBottom: 6 }}>
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
                      border: '1px solid #2a2d35', borderRadius: 4,
                      background: '#262a32',
                      color: idx === 0 ? '#6b7280' : '#cbd5e1',
                      opacity: idx === 0 ? 0.5 : 1,
                      cursor: idx === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >▲ monter</button>
                  <button
                    onClick={() => props.onMoveAction(action.id, 'down')}
                    disabled={idx === offensiveActions.length - 1}
                    style={{
                      flex: 1, padding: '6px 10px', fontSize: 11,
                      border: '1px solid #2a2d35', borderRadius: 4,
                      background: '#262a32',
                      color: idx === offensiveActions.length - 1 ? '#6b7280' : '#cbd5e1',
                      opacity: idx === offensiveActions.length - 1 ? 0.5 : 1,
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
                      borderTop: '1px dashed #2a2d35',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#93c5fd', marginBottom: 6 }}>
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
                                background: '#262a32', border: '1px solid #dbeafe', borderRadius: 4,
                                padding: '6px 8px', fontSize: 11, display: 'flex',
                                alignItems: 'center', gap: 6,
                              }}>
                                <span style={{ fontWeight: 600, color: '#93c5fd' }}>{cdef.label}</span>
                                <span style={{ color: '#cbd5e1', flex: 1 }}>{cdef.reader(cov.params)}</span>
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
                          background: '#262a32', color: '#93c5fd', cursor: 'pointer',
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
              fontSize: 10, fontWeight: 700, color: '#93c5fd',
              marginTop: 8, marginBottom: 4, letterSpacing: 0.5,
            }}>🛡️ DÉFENSE (LIBRE)</div>
            {free.map((act) => {
              const cdef = DEFENSIVE_ACTIONS_CATALOG[act.type];
              const isExpanded = expandedIds.has(act.id);
              return (
                <div key={act.id} style={{
                  border: '1px solid #dbeafe',
                  borderLeft: '3px solid #1e3a8a',
                  borderRadius: 6, background: '#262a32', overflow: 'hidden',
                }}>
                  <div onClick={() => toggleExpand(act.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', cursor: 'pointer', userSelect: 'none',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd' }}>🛡️</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb', flex: 1 }}>
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
                  <div style={{ fontSize: 11, color: '#cbd5e1', padding: '0 10px 8px 28px' }}>
                    {cdef.reader(act.params)} · steps : {(act.affectedSteps ?? []).join(',') || '—'}
                  </div>
                  {isExpanded && (
                    <div style={{ padding: 10, background: '#262a32' }}>
                      <DefensiveActionForm
                        action={act}
                        defenderIds={defenderIds}
                        attackerIds={attackerIds}
                        onChange={(updated) => props.onUpdateDefensiveAction(act.id, updated)}
                      />
                      <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, color: '#93c5fd' }}>
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
          background: '#262a32',
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
              border: '1px solid #e2e8f0', background: '#262a32', cursor: 'pointer', color: '#cbd5e1',
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
                    color: '#94a3b8',
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
                        background: '#262a32',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: c.accentText }}>{def.label}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{def.description}</span>
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
                  fontSize: 10, color: '#93c5fd', textTransform: 'uppercase',
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
                          background: '#262a32', cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#93c5fd' }}>{def.label}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{def.description}</div>
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
  const updateChain = (chain: AttackerId[], modes?: ('pass' | 'dho')[]) => {
    const nextParams = { ...action.params } as Record<string, unknown>;
    nextParams.chain = chain;
    if (modes) nextParams.chainLinkModes = modes; else delete nextParams.chainLinkModes;
    onChange({ ...action, params: nextParams as OffensiveScriptedAction['params'] });
  };
  const [zonePickerFor, setZonePickerFor] = useState<ParamKind | null>(null);
  const allParams: ParamKind[] = [...def.requiredParams, ...(def.optionalParams ?? [])];
  const isZoneParam = (k: ParamKind) =>
    k === 'targetZone' || k === 'screenZone' || k === 'fromZone';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, marginLeft: 24 }}>
      {allParams.map((paramKey) => (
        <div key={paramKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 80 }}>
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
        <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 80 }}>Libellé libre</span>
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

function ChainEditor({
  chain, modes, defaultMode, attackerIds, onChange,
}: {
  chain: AttackerId[];
  modes: ('pass' | 'dho')[] | undefined;
  defaultMode: 'pass' | 'dho';
  attackerIds: AttackerId[];
  onChange: (chain: AttackerId[], modes?: ('pass' | 'dho')[]) => void;
}) {
  const linkMode = (i: number): 'pass' | 'dho' => modes?.[i] ?? defaultMode;
  const setLinkMode = (i: number, m: 'pass' | 'dho') => {
    const next = Array.from({ length: Math.max(chain.length - 1, 0) }, (_, j) => (j === i ? m : linkMode(j)));
    onChange(chain, next);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
      {chain.map((p, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <select
              value={p}
              onChange={(e) => onChange(chain.map((x, j) => (j === i ? (e.target.value as AttackerId) : x)), modes)}
              style={{ fontSize: 11 }}
            >
              {attackerIds.map((id) => (<option key={id} value={id}>{id}</option>))}
            </select>
            {chain.length > 2 && (
              <button
                onClick={() => onChange(chain.filter((_, j) => j !== i), modes?.filter((_, j) => j !== Math.min(i, chain.length - 2)))}
                title="Retirer ce maillon"
                style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}
              >×</button>
            )}
          </div>
          {i < chain.length - 1 && (
            <button
              onClick={() => setLinkMode(i, linkMode(i) === 'pass' ? 'dho' : 'pass')}
              style={{ alignSelf: 'flex-start', fontSize: 9, padding: '1px 6px', borderRadius: 3, border: '1px solid #475569', background: '#1e293b', color: '#cbd5e1', cursor: 'pointer' }}
            >↓ {linkMode(i) === 'dho' ? 'DHO' : 'passe'}</button>
          )}
        </div>
      ))}
      <button
        onClick={() => {
          const used = new Set(chain);
          const next = attackerIds.find((id) => !used.has(id)) ?? attackerIds[0];
          onChange([...chain, next], modes);
        }}
        style={{ alignSelf: 'flex-start', fontSize: 10, padding: '2px 6px', border: '1px solid #94a3b8', borderRadius: 3, background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
      >+ maillon</button>
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
  if (def.requiredParams.includes('chain')) params.chain = ['O1', 'O2'];
  return params;
}

/** Signature unique d'un déclencheur de lecture (dedup d'insertion). */
function branchTriggerSig(b: ScenarioBranch): string | null {
  const t = b.trigger;
  if (!t) return null;
  switch (t.kind) {
    case 'screen-coverage': return `sc:${t.actionId}:${t.coverage.join('|')}`;
    case 'help-source': return `hs:${t.actionId}:${t.source.join('|')}`;
    case 'deny': return `deny:${t.actionId}:${t.receiver}`;
  }
}

/** Puces courtes décrivant la condition d'un déclencheur (UI). */
function triggerChips(t?: ReadTrigger): string[] {
  if (!t) return [];
  switch (t.kind) {
    case 'screen-coverage': return t.coverage;
    case 'help-source': return t.source.map((s) => `aide ${s}`);
    case 'deny': return [`deny ${t.receiver}`];
  }
}

function BranchTab({
  active, autoActive, label, chips, onClick, onRename, onDelete,
}: {
  active: boolean;
  autoActive?: boolean;
  label: string;
  chips?: string[];
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const isReactive = !!chips && chips.length > 0;
  // Une branche réactive auto-activée : anneau vert pointillé. Sélection
  // manuelle : fond orange plein. Réactive non active : liseré vert.
  const border = active
    ? '#ea580c'
    : autoActive
      ? '#6ee7b7'
      : isReactive
        ? '#3f6212'
        : '#2a2d35';
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
        fontWeight: active || autoActive ? 700 : 500,
        background: active ? '#ea580c' : autoActive ? 'rgba(110,231,183,0.15)' : '#262a32',
        color: active ? '#fff' : autoActive ? '#6ee7b7' : '#fdba74',
        border: `1px solid ${border}`,
        borderStyle: autoActive ? 'dashed' : 'solid',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      title={isReactive
        ? `Lecture réactive (${chips!.join(', ')}). Clic = épingler manuellement.`
        : (onRename ? 'Double-clic ou ✎ pour renommer' : undefined)}
    >
      {isReactive && <span style={{ fontSize: 9 }}>🤖</span>}
      <span>{label}</span>
      {onRename && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRename(); }}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 12, color: active ? '#fff' : '#fdba74', padding: '0 4px', lineHeight: 1,
          }}
          title="Renommer la variante"
          aria-label={`Renommer la variante ${label}`}
        >✎</button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, color: active ? '#fff' : '#f87171', padding: '0 4px', lineHeight: 1,
          }}
          title="Supprimer la variante"
          aria-label={`Supprimer la variante ${label}`}
        >×</button>
      )}
    </div>
  );
}
