'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useLibrary } from '@/hooks/useLibrary';
import { SHORTCUT_LABELS, scrubTarget, useKeyboardShortcuts, type ShortcutMode } from '@/hooks/useKeyboardShortcuts';
import { useMatchLoop } from '@/hooks/useMatchLoop';
import { useSidebarState } from '@/hooks/useSidebarState';
import { Sidebar, type ToolGroup } from '@/components/sidebar/Sidebar';
import { SIDEBAR } from '@/components/sidebar/tokens';
import { Swords, Shield, ListOrdered, GitBranch, Undo2, Redo2 } from 'lucide-react';
import { OffenseToolsPanel } from '@/components/OffenseToolsPanel';
import { StepsPanel } from '@/components/StepsPanel';
import { ScenarioPanel } from '@/components/ScenarioPanel';
import { ScenarioReader } from '@/components/ScenarioReader';
import { DefensePanel } from '@/components/DefensePanel';
import { CoachStartActions } from '@/components/sidebar/CoachStartActions';
import { SidebarOverflowMenu } from '@/components/sidebar/SidebarOverflowMenu';
import { ParametresPanel } from '@/components/ParametresPanel';
import { LibraryModal } from '@/components/LibraryModal';
import { SessionsView } from '@/components/SessionsView';
import { SidebarThemeProvider } from '@/components/sidebar/SidebarThemeContext';
import { Timeline } from '@/components/Timeline';
import { PresentationBar } from '@/components/PresentationBar';
import { nextRealStepIndex, prevRealStepIndex } from '@/lib/logic/playback/realSteps';
import { CourtView } from '@/components/CourtView';
import { LiveMatchOverlay } from '@/components/LiveMatchOverlay';
import { MiniBoxScore } from '@/components/MiniBoxScore';
import { PlaybookView } from '@/components/PlaybookView';
import { PlayerTimelineModal } from '@/components/PlayerTimelineModal';
import { MultiTrackTimeline } from '@/components/MultiTrackTimeline';
import { ScenarioGraphView } from '@/components/scenariograph/ScenarioGraphView';
import { InterfaceGate } from '@/components/interface/InterfaceLevel';
import { MetricsBar } from '@/components/MetricsBar';
import { MetricsChart } from '@/components/MetricsChart';
import { CoachDiagnosticsOverlay } from '@/components/CoachDiagnosticsOverlay';
import { ExportModal } from '@/components/ExportModal';
import { computeFrameCoachAnalysis } from '@/lib/logic/frameCoachAnalysis';
import type { DisplayedCourtFrame } from '@/hooks/useCourtFrame';
import type { ActionTimingAnchor, AddAnnotationOptions, Annotation, AppState, Step } from '@/lib/types';
import { createShareHash } from '@/lib/state/urlCompression';
import { findTemplate } from '@/lib/data/templates';
import { getSessions, type PracticeSession } from '@/lib/data/practiceSessions';
import { blockVisual, isTimerRunning, pauseTimer, reconcileRun, resetTimer, startRun, startTimer } from '@/lib/data/sessionRun';
import { useSessionRun } from '@/hooks/useSessionRun';
import { SessionBlockCard, SessionRunBar } from '@/components/SessionRunBar';

export default function Page() {
  const app = useAppState();
  const lib = useLibrary();
  const sidebar = useSidebarState();
  const [libraryEntry, setLibraryEntry] = useState({ section: 'saved' as 'saved' | 'templates', key: 0 });
  const currentSavedSystem = lib.library.folders.flatMap((f) => f.systems)
    .find((system) => system.id === app.state.librarySystemId);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackT, setPlaybackT] = useState<number | null>(null);
  const [showPlayerTimeline, setShowPlayerTimeline] = useState(false);
  const [showMultiTrack, setShowMultiTrack] = useState(false);
  const [scrubT, setScrubT] = useState<number | null>(null);
  const [playbackStartT, setPlaybackStartT] = useState(0);
  const [presentMode, setPresentMode] = useState(false);
  const [isPlayerMode, setIsPlayerMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // E.2 — État d'export : `exportT` (instant à capturer) primera dans
  // useCourtFrame sur scrub/playback ; `courtSvgRef` permet au capture
  // loop de lire le SVG live. Par défaut null → comportement inchangé.
  const [exportT, setExportT] = useState<number | null>(null);
  const courtSvgRef = useRef<SVGSVGElement | null>(null);
  // E.2 — Ouverture de la modal d'export. La modal elle-même drive
  // `setExportT` quand l'utilisateur clique "Démarrer".
  const [showExportModal, setShowExportModal] = useState(false);

  // B4 — Game loop "▶ Play IA (live)" : hook unique remonté au niveau page
  // pour partager le matchState live entre CourtView (rendu terrain) et
  // SimulationSection (HUD événements + contrôles).
  // P3 B6 — vitesse modifiable en cours pour accélérer les tests.
  const [matchSpeed, setMatchSpeed] = useState(1);
  const matchLoop = useMatchLoop({ baseState: app.state, speed: matchSpeed });

  // A.2 — helpers plein écran navigateur natif. Best-effort : peut échouer
  // si appelé hors d'un geste utilisateur ou si bloqué par le navigateur.
  const requestNativeFullscreen = useCallback(() => {
    if (typeof document !== 'undefined' && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);
  const exitNativeFullscreen = useCallback(() => {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // A.2 — Mode présentation v2 : le toggle "plein écran" demande aussi le
  // plein écran navigateur natif, pour cacher la barre d'onglets (utile sur
  // tablette pour vraiment tout libérer).
  const handleTogglePresentMode = useCallback(() => {
    setPresentMode((p) => {
      if (p) exitNativeFullscreen();
      else requestNativeFullscreen();
      return !p;
    });
  }, [requestNativeFullscreen, exitNativeFullscreen]);

  // E.1 V1 + A.2 — mode "match plein écran" : active fullCourt +
  // presentMode + browser fullscreen en une seule action.
  const handleEnterFullscreenMatch = useCallback(() => {
    if (!app.state.fullCourt) {
      app.patch({ fullCourt: true });
    }
    setPresentMode(true);
    requestNativeFullscreen();
  }, [app, requestNativeFullscreen]);
  const handleExitFullscreenMatch = useCallback(() => {
    setPresentMode(false);
    exitNativeFullscreen();
  }, [exitNativeFullscreen]);

  // Phase 1.3 — Mode démo : 10 possessions, full court, ×2 speed, en 1 clic.
  // Réutilise handleEnterFullscreenMatch pour fullCourt + presentMode.
  const handleStartDemoMode = useCallback(() => {
    handleEnterFullscreenMatch();
    setMatchSpeed(2);
    matchLoop.start({ maxPossessions: 10 });
  }, [handleEnterFullscreenMatch, matchLoop]);

  // U05 — déroulé de séance : la séance et le bloc en cours restent connus
  // de la page (et persistés) pendant qu'on montre les blocs sur le terrain.
  // Le brouillon du coach n'est mis de côté qu'une fois, au premier bloc
  // chargé, puis restauré en fin de déroulé.
  const sessionRunState = useSessionRun();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const sessions = useMemo(() => getSessions(lib.library), [lib.library]);
  const sessionRun = lib.hydrated && sessionRunState.hydrated
    ? reconcileRun(sessionRunState.run, sessions)
    : null;
  const runSession = sessionRun ? sessions.find((s) => s.id === sessionRun.sessionId) ?? null : null;
  const runBlock = runSession && sessionRun ? runSession.blocks[sessionRun.blockIndex] ?? null : null;
  const runBlockVisual = runBlock
    ? blockVisual(runBlock, (id) => lib.library.folders.some((f) => f.systems.some((sys) => sys.id === id)))
    : null;
  useEffect(() => {
    if (!lib.hydrated || !sessionRunState.hydrated) return;
    if (sessionRun !== sessionRunState.run) sessionRunState.setRun(sessionRun);
  }, [lib.hydrated, sessionRun, sessionRunState]);

  /** Charge le visuel d'un bloc. Retourne le nouvel état de protection du
   *  brouillon, ou null si le chargement a été refusé. */
  const showSessionBlock = useCallback((session: PracticeSession, index: number, draftProtected: boolean): boolean | null => {
    const block = session.blocks[index];
    if (!block) return null;
    const visual = blockVisual(block, (id) => lib.library.folders.some((f) => f.systems.some((sys) => sys.id === id)));
    setIsPlaying(false);
    setScrubT(null);
    setPlaybackT(null);
    if (visual.kind === 'system') {
      const sys = lib.library.folders.flatMap((f) => f.systems).find((x) => x.id === visual.systemId)!;
      return app.importState(lib.loadSystem(app.state, sys), { keepRecovery: draftProtected }) ? true : null;
    }
    if (visual.kind === 'template') {
      const template = findTemplate(visual.templateId);
      if (!template) return draftProtected;
      return app.loadTemplate(template, { keepRecovery: draftProtected }) ? true : null;
    }
    return draftProtected;
  }, [lib, app]);

  const handleRunSessionBlock = useCallback((sessionId: string, index: number, enterPlayer = true) => {
    const session = sessions.find((x) => x.id === sessionId);
    if (!session || session.blocks.length === 0) return;
    const idx = Math.max(0, Math.min(session.blocks.length - 1, index));
    const protectedDraft = showSessionBlock(session, idx, sessionRun?.draftProtected ?? false);
    if (protectedDraft === null) return;
    sessionRunState.setRun({ ...startRun(sessionId, idx), draftProtected: protectedDraft });
    setSelectedSessionId(sessionId);
    sidebar.setActiveView('court');
    if (enterPlayer) setIsPlayerMode(true);
  }, [sessions, showSessionBlock, sessionRun, sessionRunState, sidebar]);

  const handleResumeSessionRun = useCallback(() => {
    if (!sessionRun || !runSession) return;
    // Recharge le bloc (l'état du terrain a pu changer entre-temps) sans
    // toucher au minuteur.
    const protectedDraft = showSessionBlock(runSession, sessionRun.blockIndex, sessionRun.draftProtected);
    if (protectedDraft === null) return;
    sessionRunState.setRun({ ...sessionRun, draftProtected: protectedDraft });
    sidebar.setActiveView('court');
    setIsPlayerMode(true);
  }, [sessionRun, runSession, showSessionBlock, sessionRunState, sidebar]);

  const handleBackToSession = useCallback(() => {
    setIsPlaying(false);
    setIsPlayerMode(false);
    if (sessionRun) setSelectedSessionId(sessionRun.sessionId);
    sidebar.setActiveView('sessions');
  }, [sessionRun, sidebar]);

  const handleEndSessionRun = useCallback(() => {
    if (sessionRun?.draftProtected) app.restoreDraft();
    if (sessionRun) setSelectedSessionId(sessionRun.sessionId);
    sessionRunState.setRun(null);
    setIsPlaying(false);
    setIsPlayerMode(false);
    sidebar.setActiveView('sessions');
  }, [sessionRun, app, sessionRunState, sidebar]);

  const [displayedCourt, setDisplayedCourt] = useState<DisplayedCourtFrame | null>(null);
  const analysis = useMemo(() => {
    if (!displayedCourt || displayedCourt.state !== app.state) return null;
    return computeFrameCoachAnalysis(app.state, displayedCourt.frame, displayedCourt.dynamic);
  }, [app.state, displayedCourt]);
  const metrics = analysis?.metrics ?? null;
  const bestAction = analysis?.bestAction ?? null;
  const coachDiagnostics = analysis?.diagnostics ?? [];
  const screenAction = analysis?.screenAction ?? null;

  const actionTimingAnchor = app.state.actionTimingAnchor ?? 'start';
  const annotationFullT = scrubT ?? playbackT ?? null;

  const handleSetActionTimingAnchor = useCallback((mode: ActionTimingAnchor) => {
    app.patch({ actionTimingAnchor: mode });
  }, [app]);

  const handleAddAnnotation = useCallback(
    (annotation: Annotation, options?: AddAnnotationOptions) => {
      app.addAnnotation(annotation, {
        ...options,
        fullT: options?.fullT ?? annotationFullT,
        timingAnchor: options?.timingAnchor ?? actionTimingAnchor,
      });
    },
    [actionTimingAnchor, annotationFullT, app],
  );

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) {
      // Pause : fige l'instant courant en propageant playbackT dans scrubT,
      // ce qui pilote l'affichage de la frame intermédiaire (cf. scrubFrame
      // dans CourtView). L'utilisateur peut alors faire une capture sur cet
      // instant t précis. Stop (⏹) reste séparé pour revenir au début.
      if (playbackT != null) setScrubT(playbackT);
      setPlaybackT(null);
      setIsPlaying(false);
    } else {
      // Reprend la lecture : si scrubT existe (pause précédente), reprendre
      // depuis cet instant t ; sinon (depuis idle), démarrer du début.
      setPlaybackStartT(scrubT != null && scrubT < app.state.steps.length - 1 ? scrubT : 0);
      setScrubT(null);
      setPlaybackT(null);
      setIsPlaying(true);
    }
  }, [isPlaying, playbackT, scrubT, app.state.steps.length]);

  // A.2 — si l'utilisateur quitte le plein écran natif (Échap navigateur,
  // F11, geste système), on sort aussi du mode présentation pour rester
  // cohérent avec l'état affiché.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => {
      if (!document.fullscreenElement) setPresentMode(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Détection du mode lecteur depuis l'URL (hash ou query string)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      const search = window.location.search;
      const hasPlayer = hash.includes('mode=player') || search.includes('mode=player');
      if (hasPlayer) {
        setIsPlayerMode(true);
        sidebar.setActiveView('court');
      }
    }
  }, []);

  // U03 — un seul gestionnaire clavier : une touche = une action selon la
  // vue (terrain uniquement), le mode (édition / lecteur / présentation),
  // la lecture en cours et le focus. Voir resolveShortcut.
  const shortcutMode: ShortcutMode = presentMode ? 'present' : isPlayerMode ? 'player' : 'edit';
  useKeyboardShortcuts({
    courtVisible: sidebar.activeView === 'court',
    mode: shortcutMode,
    isPlaying,
    onAction: (action) => {
      switch (action.type) {
        case 'undo': app.undo(); break;
        case 'redo': app.redo(); break;
        case 'playPause': handlePlayToggle(); break;
        case 'step':
          if (shortcutMode === 'edit') {
            setScrubT(null);
            app.setActiveStep(app.state.activeStep + action.delta);
          } else {
            app.setActiveStep(action.delta > 0
              ? nextRealStepIndex(app.state.steps, app.state.activeStep)
              : prevRealStepIndex(app.state.steps, app.state.activeStep));
          }
          break;
        case 'scrub': {
          const totalT = Math.max(0, app.state.steps.length - 1);
          setScrubT(scrubTarget(scrubT ?? playbackT ?? app.state.activeStep, action.delta, action.resolution, totalT));
          break;
        }
        case 'tool': app.setTool(action.tool); break;
        case 'deleteLastAnnotation': app.deleteLastAnnotation(); break;
        case 'exitPresent':
          setPresentMode(false);
          exitNativeFullscreen();
          break;
      }
    },
  });

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify({ ...app.state, librarySystemId: undefined }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'systeme_basket.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [app.state]);

  const handleShare = useCallback(async () => {
    return window.location.origin + window.location.pathname + await createShareHash(app.state);
  }, [app.state]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(String(ev.target?.result)) as AppState;
          app.importState({ ...data, librarySystemId: undefined });
        } catch {
          alert('JSON invalide');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [app]
  );

  const handleLoadAiSteps = useCallback((steps: Step[], startStepIndex: number) => {
    setIsPlaying(false);
    setPlaybackT(null);
    setPlaybackStartT(startStepIndex);
    setScrubT(startStepIndex);
    app.patch({
      steps: structuredClone(steps),
      activeStep: startStepIndex,
    });
  }, [app]);

  return (
    <main
      style={{
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        background: '#1a1d23',
        padding: '8px 12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        color: '#e5e7eb',
      }}
    >
      {!presentMode && !isPlayerMode && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 12 }}>
          {sidebar.activeView === 'court' && (
            <div role="group" aria-label="Historique des modifications" style={{ display: 'flex', gap: 6 }}>
              <HistoryButton label="Annuler" shortcut={SHORTCUT_LABELS.undo} disabled={!app.canUndo || isPlaying} onClick={app.undo} icon={<Undo2 size={16} aria-hidden />} />
              <HistoryButton label="Rétablir" shortcut={SHORTCUT_LABELS.redo} disabled={!app.canRedo || isPlaying} onClick={app.redo} icon={<Redo2 size={16} aria-hidden />} />
            </div>
          )}
          <strong>{currentSavedSystem?.name ?? 'Brouillon'}</strong>
          <span role="status" style={{ color: app.saveStatus === 'error' || lib.saveStatus === 'error' ? '#fca5a5' : '#cbd5e1' }}>
            {app.saveStatus === 'error' || lib.saveStatus === 'error'
              ? 'Sauvegarde impossible — exportez votre travail'
              : app.saveStatus === 'pending' || lib.saveStatus === 'pending'
                ? 'Sauvegarde en cours…' : 'Brouillon conservé sur cet appareil'}
          </span>
          {currentSavedSystem && <button className="bt-touch" style={{ padding: '4px 12px', border: '1px solid #64748b', borderRadius: 6, background: '#29313e', color: '#f8fafc', cursor: 'pointer' }}
            onClick={() => lib.updateSystem(currentSavedSystem.id, app.state)}>
            Enregistrer dans « {currentSavedSystem.name} »
          </button>}
          <button className="bt-touch" style={{ padding: '4px 12px', border: '1px solid #64748b', borderRadius: 6, background: '#29313e', color: '#f8fafc', cursor: 'pointer' }} onClick={() => sidebar.setActiveView('library')}>
            Enregistrer une copie…
          </button>
          {app.hasRecovery && <button className="bt-touch" style={{ padding: '4px 12px', border: '1px solid #64748b', borderRadius: 6, background: '#29313e', color: '#f8fafc', cursor: 'pointer' }} onClick={app.restoreDraft}>
            Retrouver le brouillon précédent
          </button>}
        </div>
      )}
      <div
        className={presentMode || isPlayerMode ? 'layout-grid presenting' : 'layout-grid'}
        style={{
          // Refonte UI — largeur de la sidebar pilotée par useSidebarState.
          // Le mode présentation force une seule colonne (cf. .presenting).
          ['--sidebar-w' as string]: `${
            sidebar.collapsed ? SIDEBAR.widthCollapsed : SIDEBAR.widthExpanded
          }px`,
        }}
      >
        {!presentMode && !isPlayerMode && (
          <Sidebar
            startActions={<CoachStartActions
              collapsed={sidebar.collapsed}
              onCreate={() => {
                if (!app.resetAll()) return;
                matchLoop.stop();
                setIsPlaying(false);
                setScrubT(null);
                setPlaybackT(null);
                setIsPlayerMode(false);
                sidebar.setActiveView('court');
              }}
              onTemplates={() => {
                setLibraryEntry(entry => ({ section: 'templates', key: entry.key + 1 }));
                sidebar.setActiveView('library');
              }}
              onSessions={() => sidebar.setActiveView('sessions')}
            />}
            activeView={sidebar.activeView}
            collapsed={sidebar.collapsed}
            onSelectView={(view) => {
              if (view === 'library') setLibraryEntry(entry => ({ section: 'saved', key: entry.key + 1 }));
              sidebar.setActiveView(view);
            }}
            onToggleCollapse={sidebar.toggleCollapse}
            version="0.18.0"
            overflowMenu={
              <SidebarOverflowMenu
                presentMode={presentMode}
                onTogglePresentMode={handleTogglePresentMode}
                isPlayerMode={isPlayerMode}
                onTogglePlayerMode={() => setIsPlayerMode((v) => {
                  // Entrer en mode lecteur force la vue terrain : la sidebar
                  // est masquée, sans ça on resterait bloqué sur une vue
                  // routée (Paramètres, Bibliothèque…) sans moyen d'en sortir.
                  if (!v) sidebar.setActiveView('court');
                  return !v;
                })}
                onOpenPlayerTimeline={() => setShowPlayerTimeline(true)}
                onOpenExport={() => setShowExportModal(true)}
                onExport={handleExport}
                onImport={handleImport}
                onReset={app.resetAll}
                onShare={handleShare}
                collapsed={sidebar.collapsed}
              />
            }
            toolGroups={[
              {
                id: 'offense',
                icon: Swords,
                label: 'Attaque',
                accent: '#f97316',
                defaultOpen: true,
                content: (
                  <OffenseToolsPanel
                    tool={app.state.tool}
                    onSetTool={app.setTool}
                    actionTimingAnchor={actionTimingAnchor}
                    onSetActionTimingAnchor={handleSetActionTimingAnchor}
                  />
                ),
              },
              {
                id: 'defense',
                icon: Shield,
                label: 'Défense',
                accent: '#3b82f6',
                content: (
                  <DefensePanel
                    state={app.state}
                    onSetScreenRule={app.setScreenRule}
                    onResetSwitches={app.resetSwitches}
                    onPatch={app.patch}
                    onUpdateRule={app.updateRule}
                    onUpdateAllRules={app.updateAllRules}
                    onResetIndividualOverrides={app.resetIndividualOverrides}
                    onSetDefenseSystem={app.setDefenseSystem}
                    onUpdateZoneConfig={app.updateZoneConfig}
                    onApplyDefensePreset={app.applyDefensePreset}
                    onClearAllDefenseOverrides={app.clearAllDefenseOverridesActiveStep}
                    onClearAllDefenseOverridesAnimated={app.clearAllDefenseOverridesActiveStepAnimated}
                    matchLoop={matchLoop}
                    matchSpeed={matchSpeed}
                    onSetMatchSpeed={setMatchSpeed}
                    onLoadAiSteps={handleLoadAiSteps}
                    onEnterFullscreenMatch={handleEnterFullscreenMatch}
                    onStartDemoMode={handleStartDemoMode}
                    scriptedDefenseEnabled={app.state.defenseScriptedDirectivesEnabled}
                    onToggleScriptedDefense={app.toggleScriptedDefense}
                    userDefensePresets={lib.library.defensePresets}
                    onSaveDefensePreset={(name) => lib.saveDefensePreset(app.state, name)}
                    onApplyUserDefensePreset={(preset) => {
                      const {
                        id: _id, name: _name, description: _desc, createdAt: _t,
                        ...defensePatch
                      } = preset;
                      app.patch(defensePatch);
                    }}
                    onDeleteDefensePreset={lib.deleteDefensePreset}
                  />
                ),
              },
              {
                id: 'steps',
                icon: ListOrdered,
                label: 'Étapes',
                accent: '#f97316',
                content: (
                  <StepsPanel
                    state={app.state}
                    onSetActiveStep={app.setActiveStep}
                    onAddStep={app.addStep}
                    onDuplicateStep={app.duplicateStep}
                    onDeleteStep={app.deleteStep}
                    onSetStepLabel={app.setStepLabel}
                    onPatchStep={app.patchStep}
                    onAddShotReboundStep={app.addShotReboundStep}
                    onConvertStepToAwayPossession={app.convertStepToAwayPossession}
                    onAddOutletPassStep={app.addOutletPassStep}
                    onAddFastBreakSteps={app.addFastBreakSteps}
                    onSetBallCarrier={app.setBallCarrier}
                    onDeleteAnnotation={app.deleteAnnotation}
                    onToggleAnnotationSprint={app.toggleAnnotationSprint}
                    onSetAnnotationFlipSide={app.setAnnotationFlipSide}
                    onAddFeinte={app.addFeinte}
                    onUpdateFeinte={app.updateFeinte}
                    onRemoveFeinte={app.removeFeinte}
                    onConvertToFreeThrow={app.convertStepToFreeThrow}
                    onConvertToInbound={app.convertStepToInbound}
                    onSetInboundDefenseMode={app.setInboundDefenseMode}
                    onAddFreeThrowReboundStep={app.addFreeThrowReboundStep}
                    onConvertToJumpBall={app.convertStepToJumpBall}
                  />
                ),
              },
              {
                id: 'scenario',
                icon: GitBranch,
                label: 'Scénario',
                accent: '#a78bfa',
                content: (
                  <ScenarioPanel
                    scriptedActions={app.state.scriptedActions ?? []}
                    scenarioBranches={app.state.scenarioBranches ?? []}
                    activeBranchId={app.state.activeBranchId ?? null}
                    playerCount={app.state.playerCount}
                    onAddAction={app.addScriptedAction}
                    onUpdateAction={app.updateScriptedAction}
                    onDeleteAction={app.deleteScriptedAction}
                    onMoveAction={app.moveScriptedAction}
                    onClearAll={app.clearScriptedActions}
                    onAddDefensiveAction={app.addDefensiveAction}
                    onUpdateDefensiveAction={app.updateDefensiveAction}
                    onDeleteDefensiveAction={app.deleteDefensiveAction}
                    onAddBranch={app.addScenarioBranch}
                    onAddBranches={app.addScenarioBranches}
                    onUpdateBranch={app.updateScenarioBranch}
                    onDeleteBranch={app.deleteScenarioBranch}
                    onSetActiveBranch={app.setActiveBranch}
                    resolvedReadBranchId={app.state.resolvedReadBranchId ?? null}
                    probabilisticReadsEnabled={app.state.probabilisticReadsEnabled}
                    coverageDistribution={app.state.coverageDistribution}
                    rolledCoverage={app.state.rolledCoverage}
                    onToggleProbabilisticReads={app.toggleProbabilisticReads}
                    onSetCoverageDistribution={app.setCoverageDistribution}
                    onRerollCoverage={app.rerollCoverage}
                    continuityLoop={app.state.continuityLoop}
                    onSetContinuityLoop={app.setContinuityLoop}
                    autoReplacementEnabled={app.state.autoReplacementEnabled}
                    autoReplacementDepth={app.state.autoReplacementDepth}
                    onSetAutoReplacement={app.setAutoReplacement}
                  />
                ),
              },
            ]}
          />
        )}

        <div className={`center-col${sidebar.activeView !== 'court' ? ' center-col-view inline-view-scope' : sessionRun ? ' has-session-run' : ''}`}>
          {sidebar.activeView === 'playbook' && (
            <SidebarThemeProvider dark>
              <PlaybookView
                state={app.state}
                mode="inline"
                onClose={() => sidebar.setActiveView('court')}
              />
            </SidebarThemeProvider>
          )}
          {sidebar.activeView === 'library' && (
            <SidebarThemeProvider dark>
              <LibraryModal
                key={libraryEntry.key}
                initialSection={libraryEntry.section}
                mode="inline"
                hasWorkInProgress={
                  app.state.steps.length > 1 || app.state.steps[0].annotations.length > 0
                }
                library={lib.library}
                onLoadSavedSystem={(sys) => app.importState(lib.loadSystem(app.state, sys))}
                onLoadTemplate={app.loadTemplate}
                onSaveCurrent={(folderId, name, description, tags) => {
                  const id = lib.saveSystem(app.state, folderId, name, description, tags);
                  app.patch({ librarySystemId: id });
                }}
                onSetSystemTags={lib.setSystemTags}
                onRenameSystem={lib.renameSystem}
                onDeleteSystem={lib.deleteSystem}
                onMoveSystem={lib.moveSystem}
                onCreateFolder={lib.createFolder}
                onRenameFolder={lib.renameFolder}
                onDeleteFolder={lib.deleteFolder}
                onExportFolder={lib.exportFolder}
                onImportFolder={lib.importFolder}
                onClose={() => sidebar.setActiveView('court')}
              />
            </SidebarThemeProvider>
          )}
          {sidebar.activeView === 'settings' && (
            <SidebarThemeProvider dark>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  overflow: 'auto',
                  padding: '24px 28px',
                  background: '#171a20',
                  borderRadius: 8,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ maxWidth: 1040, margin: '0 auto' }}>
                  <ParametresPanel
                    state={app.state}
                    onPatch={app.patch}
                    onSetPlayerCount={app.setPlayerCount}
                    onAutoPositionOffBall={app.autoPositionOffBall}
                    onTogglePlayerDisqualified={app.togglePlayerDisqualified}
                    onClearDisqualified={app.clearDisqualified}
                  />
                </div>
              </div>
            </SidebarThemeProvider>
          )}
          {sidebar.activeView === 'sessions' && (
            <SidebarThemeProvider dark>
              <SessionsView
                library={lib.library}
                onCreateSession={lib.createSession}
                onUpdateSession={lib.updateSession}
                onDeleteSession={lib.deleteSession}
                onDuplicateSession={lib.duplicateSession}
                selectedSessionId={selectedSessionId}
                onSelectSession={setSelectedSessionId}
                onRunBlock={handleRunSessionBlock}
                activeRun={sessionRun}
                onResumeRun={handleResumeSessionRun}
                onEndRun={handleEndSessionRun}
              />
            </SidebarThemeProvider>
          )}
          {sidebar.activeView === 'scenariograph' && (
            <SidebarThemeProvider dark>
              <ScenarioGraphView
                state={app.state}
                activeStep={app.state.activeStep}
                onSetActiveStep={app.setActiveStep}
                onAddScriptedAction={app.addScriptedAction}
                onUpdateScriptedAction={app.updateScriptedAction}
                onDeleteScriptedAction={app.deleteScriptedAction}
                onMoveScriptedAction={app.moveScriptedAction}
                onAddScenarioBranch={app.addScenarioBranch}
                onUpdateScenarioBranch={app.updateScenarioBranch}
                onDeleteScenarioBranch={app.deleteScenarioBranch}
                onSetActiveBranch={app.setActiveBranch}
                onSetContinuityLoop={app.setContinuityLoop}
                onClose={() => sidebar.setActiveView('court')}
              />
            </SidebarThemeProvider>
          )}
          {sidebar.activeView === 'court' && (
          <>
          {sessionRun && runSession && (
            <SessionRunBar
              session={runSession}
              run={sessionRun}
              now={sessionRunState.now}
              branches={runBlockVisual?.kind === 'none' ? [] : app.state.scenarioBranches ?? []}
              activeBranchId={app.state.activeBranchId ?? null}
              onSetActiveBranch={app.setActiveBranch}
              onGoToBlock={(idx) => handleRunSessionBlock(sessionRun.sessionId, idx, isPlayerMode)}
              onToggleTimer={() => sessionRunState.setRun((r) => r && {
                ...r,
                timer: isTimerRunning(r.timer) ? pauseTimer(r.timer, Date.now()) : startTimer(r.timer, Date.now()),
              })}
              onResetTimer={() => sessionRunState.setRun((r) => r && { ...r, timer: resetTimer() })}
              onBackToSession={handleBackToSession}
              onEnd={handleEndSessionRun}
            />
          )}
          <div style={{ position: 'relative', minHeight: 0, overflow: 'hidden', display: 'grid' }}>
            {runBlock && runBlockVisual?.kind === 'none' && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'grid' }}>
                <SessionBlockCard title={runBlock.title} notes={runBlock.notes} durationMin={runBlock.durationMin} />
              </div>
            )}
            {isPlayerMode && (
              <div className="player-header">
                <div className="player-brand">
                  <span style={{ color: '#ea580c' }}>🏀</span> Basket Tactics
                  <span style={{
                    fontSize: 10,
                    background: 'rgba(234, 88, 12, 0.2)',
                    color: '#fdba74',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontWeight: '600',
                    marginLeft: 6,
                  }}>LECTEUR</span>
                </div>
                <div className="player-step-info">
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Étape {(() => {
                      const realIndices: number[] = [];
                      app.state.steps.forEach((s, idx) => { if (!s.isInterpolated) realIndices.push(idx); });
                      const currentRealIdx = realIndices.indexOf(app.state.activeStep);
                      return currentRealIdx !== -1 ? currentRealIdx + 1 : app.state.activeStep + 1;
                    })()} sur {app.state.steps.filter(s => !s.isInterpolated).length || 1}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {app.state.steps[app.state.activeStep]?.label || 'Sans description'}
                  </div>
                </div>
                <button className="player-edit-btn" onClick={() => setIsPlayerMode(false)}>
                  ✍️ Mode Éditeur
                </button>
              </div>
            )}
            {app.state.showCoachDiagnostics !== false && !isPlayerMode && (
              <CoachDiagnosticsOverlay diagnostics={coachDiagnostics} />
            )}
            {/* E.1 V1 — HUD compact en overlay quand mode présentation actif
                pendant un match live. Sans ça l'utilisateur perd toute info
                (score, shot clock) en passant en plein écran. */}
            {presentMode && matchLoop.matchState && (
              <LiveMatchOverlay
                matchState={matchLoop.matchState}
                onStop={matchLoop.stop}
                onExitPresent={handleExitFullscreenMatch}
              />
            )}
            {/* Phase 1.4 — Mini box score live (Pts/FG%/TO/REB par équipe)
                quand match multi-possessions en mode présentation. */}
            {presentMode && matchLoop.matchState && (
              <MiniBoxScore matchState={matchLoop.matchState} />
            )}
            <CourtView
              onFrameChange={setDisplayedCourt}
              state={app.state}
              diagnostics={isPlayerMode ? [] : coachDiagnostics}
              onMoveAttacker={app.moveAttacker}
              onMoveDefender={app.moveDefender}
              onBeginPlayerDrag={app.beginPlayerDrag}
              onMoveAttackerDuringDrag={app.moveAttackerDuringDrag}
              onMoveDefenderDuringDrag={app.moveDefenderDuringDrag}
              onCommitPlayerDrag={app.commitPlayerDrag}
              onBeginDefenderPursuit={app.beginDefenderPursuit}
              onEndDefenderPursuit={app.endDefenderPursuit}
              onAddAnnotation={handleAddAnnotation}
              onAddTextNote={app.addTextNote}
              onUpdateTextNote={app.updateTextNote}
              onRemoveTextNote={app.removeTextNote}
              onUpdateRule={app.updateRule}
              onClearDefenseOverride={app.clearDefenseOverride}
              onApplyDefenderProfile={app.applyDefenderProfile}
              onSetBallCarrier={app.setBallCarrier}
              onSetForcedScreener={app.setForcedScreener}
              onClearAnnotationsFor={app.clearAnnotationsFor}
              onSetAttackerHand={app.setAttackerHand}
              onSetAttackerProfile={app.setAttackerProfile}
              onSetAttackerSpeedTier={app.setAttackerSpeedTier}
              onSetAttackerOrientation={app.setAttackerOrientation}
              onSetZoneOverride={app.setZoneOverride}
              onClearZoneOverride={app.clearZoneOverride}
              onSetPlayerName={app.setPlayerName}
              onSetPlayerNumber={app.setPlayerNumber}
              onDeleteAnnotation={app.deleteAnnotation}
              onSetAnnotationFrom={app.setAnnotationFrom}
              onSetAnnotationTo={app.setAnnotationTo}
              onSetAnnotationWaypoint={app.setAnnotationWaypoint}
              onSetTool={app.setTool}
              onSetActionTimingAnchor={handleSetActionTimingAnchor}
              isPlaying={isPlaying}
              playbackSpeed={playbackSpeed}
              scrubT={scrubT}
              playbackStartT={playbackStartT}
              onPlaybackTick={setPlaybackT}
              onPlaybackEnd={() => {
                setIsPlaying(false);
                setPlaybackT(null);
                setPlaybackStartT(0);
                setScrubT(app.state.steps.length - 1);
                app.setActiveStep(app.state.steps.length - 1);
              }}
              defenseReleaseTransition={app.defenseReleaseTransition}
              defenderPursuit={app.defenderPursuit}
              liveMatchState={matchLoop.matchState}
              exportT={exportT}
              externalSvgRef={courtSvgRef}
              isPlayerMode={isPlayerMode}
            />
            {/* Coaching #1 — télécommande de présentation pas-à-pas, en
                overlay sur le terrain en mode lecteur (sans match live). */}
            {isPlayerMode && !matchLoop.matchState && (
              <PresentationBar
                steps={app.state.steps}
                activeStep={app.state.activeStep}
                onSetActiveStep={app.setActiveStep}
                onTogglePlay={handlePlayToggle}
                isPlaying={isPlaying}
              />
            )}
          </div>
          {(app.state.scriptedActions?.length ?? 0) > 0 && !isPlayerMode && (
            <ScenarioReader
              scriptedActions={app.state.scriptedActions ?? []}
              activeStep={app.state.activeStep}
              stepToActionId={app.state.steps.map((s) => s.generatedBy)}
            />
          )}
          {!isPlayerMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <Timeline
                state={app.state}
                onSetActiveStep={app.setActiveStep}
                onScrub={setScrubT}
                isPlaying={isPlaying}
                scrubT={scrubT}
                playbackT={playbackT}
                onPlayToggle={handlePlayToggle}
                onStop={() => {
                  setIsPlaying(false);
                  setPlaybackT(null);
                  setScrubT(null);
                  setPlaybackStartT(0);
                  app.setActiveStep(0);
                }}
                playbackSpeed={playbackSpeed}
                onSetPlaybackSpeed={setPlaybackSpeed}
              />
            </div>
            {!isPlayerMode && (
              <button
                onClick={() => setShowMultiTrack((v) => !v)}
                title={showMultiTrack ? 'Masquer les pistes joueurs' : 'Afficher les pistes joueurs (multi-track)'}
                className="bt-touch"
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  border: '1px solid #2a2d35',
                  borderRadius: 6,
                  background: showMultiTrack ? 'rgba(216, 90, 48, 0.2)' : '#2f343d',
                  color: showMultiTrack ? '#fdba74' : '#cbd5e1',
                  cursor: 'pointer',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {showMultiTrack ? '▼' : '▲'} pistes
              </button>
            )}
          </div>
          )}
          {showMultiTrack && !isPlayerMode && (
            <MultiTrackTimeline
              state={app.state}
              fullT={scrubT ?? playbackT ?? app.state.activeStep}
              onJumpToRealStep={(realIdx) => {
                let count = 0;
                for (let i = 0; i < app.state.steps.length; i++) {
                  if (!app.state.steps[i].isInterpolated) {
                    if (count === realIdx) {
                      app.setActiveStep(i);
                      break;
                    }
                    count++;
                  }
                }
              }}
              onTogglePhase={app.setAnnotationPhase}
              onTrimTiming={app.setAnnotationTiming}
              onSetTimingAbs={app.setAnnotationTimingAbs}
              onSetQuality={app.setAnnotationQuality}
            />
          )}
          {metrics && !isPlayerMode && <MetricsBar playerCount={app.state.playerCount} metrics={metrics} bestAction={bestAction} screenAction={screenAction} />}
          {!isPlayerMode && (
            <InterfaceGate min="analysis"><MetricsChart
              state={app.state}
              activeStep={app.state.activeStep}
              onSetActiveStep={app.setActiveStep}
            /></InterfaceGate>
          )}
          </>
          )}
        </div>

      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      {showPlayerTimeline && (
        <PlayerTimelineModal
          state={app.state}
          currentFullStepIdx={app.state.activeStep}
          onClose={() => setShowPlayerTimeline(false)}
          onJumpToRealStep={(realIdx) => {
            // Convertit realStepIdx → fullStepIdx en sautant les interpolés
            let count = 0;
            for (let i = 0; i < app.state.steps.length; i++) {
              if (!app.state.steps[i].isInterpolated) {
                if (count === realIdx) {
                  app.setActiveStep(i);
                  break;
                }
                count++;
              }
            }
          }}
        />
      )}
      {showExportModal && (
        <ExportModal
          state={app.state}
          svgRef={courtSvgRef}
          setExportT={setExportT}
          onClose={() => setShowExportModal(false)}
        />
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .layout-grid {
          display: grid;
          grid-template-columns: var(--sidebar-w, 240px) 1fr;
          grid-template-rows: minmax(0, 1fr);
          gap: 10px;
          flex: 1;
          min-height: 0;
          transition: grid-template-columns 160ms ease;
        }
        .layout-grid.presenting {
          grid-template-columns: 1fr;
        }
        .player-header {
          position: absolute;
          top: 14px;
          left: 14px;
          right: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          z-index: 50;
          pointer-events: none;
        }
        .player-brand {
          background: rgba(30, 41, 59, 0.85);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px 14px;
          border-radius: 8px;
          color: #fff;
          font-size: 13px;
          font-weight: bold;
          display: flex;
          align-items: center;
          pointer-events: auto;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        .player-step-info {
          background: rgba(30, 41, 59, 0.85);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px 18px;
          border-radius: 8px;
          color: #fff;
          text-align: center;
          pointer-events: auto;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          max-width: 400px;
          flex: 1;
          min-width: 0;
        }
        .player-edit-btn {
          background: rgba(234, 88, 12, 0.9);
          border: 1px solid #ea580c;
          color: #fff;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          pointer-events: auto;
          box-shadow: 0 4px 12px rgba(234, 88, 12, 0.3);
          transition: background 0.2s;
        }
        .player-edit-btn:hover {
          background: #ea580c;
        }

        @media (max-width: 640px) {
          .player-header {
            flex-direction: column;
            align-items: stretch;
            top: 8px;
            left: 8px;
            right: 8px;
            gap: 6px;
          }
          .player-brand {
            display: none;
          }
          .player-step-info {
            max-width: none;
            padding: 6px 12px;
          }
          .player-edit-btn {
            padding: 6px 12px;
            text-align: center;
          }
        }
        .center-col {
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto auto;
          gap: 6px;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        /* U05 — barre de déroulé au-dessus du terrain. */
        .center-col.has-session-run {
          grid-template-rows: auto minmax(0, 1fr) auto auto;
        }
        .center-col.center-col-view {
          /* Vues routées (Playbook, Bibliothèque, Paramètres) : une seule
             rangée plein hauteur, pas de timeline ni metrics, fond dark
             bleu-gris cohérent avec la sidebar. */
          grid-template-rows: 1fr;
          background: #1a1d23;
          border-radius: 8px;
          color: #e5e7eb;
        }
        /* Overrides dark pour la Timeline + Metrics + ScenarioReader +
           CoachDiagnostics sous le court (vue Terrain). Ne touche pas le SVG
           du court lui-même (les couleurs SVG sont des attributs fill/stroke,
           pas style inline). */
        .center-col:not(.center-col-view) [style*="background: rgb(255, 255, 255)"]:not(input):not(select):not(textarea),
        .center-col:not(.center-col-view) [style*="background: rgb(255,255,255)"]:not(input):not(select):not(textarea),
        .center-col:not(.center-col-view) [style*="background: #fff"]:not(input):not(select):not(textarea),
        .center-col:not(.center-col-view) [style*="background:#fff"]:not(input):not(select):not(textarea),
        .center-col:not(.center-col-view) [style*="background: #FFFFFF"]:not(input):not(select):not(textarea),
        .center-col:not(.center-col-view) [style*="background: #ffffff"]:not(input):not(select):not(textarea) {
          background: #2f343d !important;
        }
        /* Inputs/selects/textarea aussi dans le court view (Timeline a un
           range slider qui apparaît avec scrollbar/track natifs blancs). */
        .center-col:not(.center-col-view) select,
        .center-col:not(.center-col-view) input[type="text"],
        .center-col:not(.center-col-view) input[type="number"],
        .center-col:not(.center-col-view) input[type="search"] {
          background: #262a32 !important;
          color: #f3f4f6 !important;
          border-color: #2a2d35 !important;
        }
        /* Placeholders lisibles dans toute la sidebar + court view */
        .sidebar-tools-scope input::placeholder,
        .sidebar-tools-scope textarea::placeholder,
        .center-col:not(.center-col-view) input::placeholder,
        .center-col:not(.center-col-view) textarea::placeholder {
          color: #94a3b8 !important;
          opacity: 1;
        }
        .center-col:not(.center-col-view) [style*="background: rgb(241, 245, 249)"],
        .center-col:not(.center-col-view) [style*="background: #f1f5f9"] {
          background: #262a32 !important;
        }
        .center-col:not(.center-col-view) [style*="background: rgb(203, 213, 225)"],
        .center-col:not(.center-col-view) [style*="background: #cbd5e1"] {
          background: #3a3f48 !important;
        }
        .center-col:not(.center-col-view) [style*="border: 1px solid rgb(226, 232, 240)"],
        .center-col:not(.center-col-view) [style*="border: 1px solid #e2e8f0"],
        .center-col:not(.center-col-view) [style*="border: 1px solid rgb(203, 213, 225)"],
        .center-col:not(.center-col-view) [style*="border: 1px solid #cbd5e1"] {
          border-color: #2a2d35 !important;
        }
        .center-col:not(.center-col-view) [style*="color: rgb(71, 85, 105)"],
        .center-col:not(.center-col-view) [style*="color: #475569"],
        .center-col:not(.center-col-view) [style*="color: rgb(51, 65, 85)"],
        .center-col:not(.center-col-view) [style*="color: #334155"],
        .center-col:not(.center-col-view) [style*="color: rgb(100, 116, 139)"],
        .center-col:not(.center-col-view) [style*="color: #64748b"],
        .center-col:not(.center-col-view) [style*="color: rgb(87, 83, 78)"],
        .center-col:not(.center-col-view) [style*="color: #57534e"] {
          color: #e5e7eb !important;
        }
        /* Inversion sémantique : textes foncés saturés (vert/rouge/amber/bleu)
           → versions claires pour rester lisibles sur fond dark mais préserver
           le sens (vert=bon, rouge=mauvais, amber=warning, bleu=info). */
        .center-col:not(.center-col-view) [style*="color: rgb(6, 95, 70)"],
        .center-col:not(.center-col-view) [style*="color: #065f46"] {
          color: #6ee7b7 !important;
        }
        .center-col:not(.center-col-view) [style*="color: rgb(153, 27, 27)"],
        .center-col:not(.center-col-view) [style*="color: #991b1b"],
        .center-col:not(.center-col-view) [style*="color: rgb(127, 29, 29)"],
        .center-col:not(.center-col-view) [style*="color: #7f1d1d"] {
          color: #fca5a5 !important;
        }
        .center-col:not(.center-col-view) [style*="color: rgb(146, 64, 14)"],
        .center-col:not(.center-col-view) [style*="color: #92400e"],
        .center-col:not(.center-col-view) [style*="color: rgb(180, 83, 9)"],
        .center-col:not(.center-col-view) [style*="color: #b45309"],
        .center-col:not(.center-col-view) [style*="color: rgb(124, 45, 18)"],
        .center-col:not(.center-col-view) [style*="color: #7c2d12"] {
          color: #fbbf24 !important;
        }
        .center-col:not(.center-col-view) [style*="color: rgb(30, 58, 138)"],
        .center-col:not(.center-col-view) [style*="color: #1e3a8a"],
        .center-col:not(.center-col-view) [style*="color: rgb(30, 64, 175)"],
        .center-col:not(.center-col-view) [style*="color: #1e40af"] {
          color: #93c5fd !important;
        }
        /* Bordures pastel chips MetricsBar */
        .center-col:not(.center-col-view) [style*="border: 1px solid rgb(167, 243, 208)"],
        .center-col:not(.center-col-view) [style*="border: 1px solid #a7f3d0"],
        .center-col:not(.center-col-view) [style*="border: 1px solid rgb(253, 230, 138)"],
        .center-col:not(.center-col-view) [style*="border: 1px solid #fde68a"],
        .center-col:not(.center-col-view) [style*="border: 1px solid rgb(254, 202, 202)"],
        .center-col:not(.center-col-view) [style*="border: 1px solid #fecaca"] {
          border-color: #2a2d35 !important;
        }
        /* Backgrounds chips clairs sémantiques (good/warn/bad) → dark mais
           gardent l'identité via le texte coloré (vu juste au-dessus). */
        .center-col:not(.center-col-view) [style*="background: rgb(209, 250, 229)"],
        .center-col:not(.center-col-view) [style*="background: #d1fae5"] {
          background: rgba(110, 231, 183, 0.12) !important;
        }
        .center-col:not(.center-col-view) [style*="background: rgb(254, 243, 199)"],
        .center-col:not(.center-col-view) [style*="background: #fef3c7"] {
          background: rgba(251, 191, 36, 0.12) !important;
        }
        .center-col:not(.center-col-view) [style*="background: rgb(254, 226, 226)"],
        .center-col:not(.center-col-view) [style*="background: #fee2e2"] {
          background: rgba(252, 165, 165, 0.12) !important;
        }
        /* Tag chips MetricsBar avec backgrounds très pâles (vert, rouge, etc.) */
        .center-col:not(.center-col-view) [style*="background: rgb(220, 252, 231)"],
        .center-col:not(.center-col-view) [style*="background: #dcfce7"],
        .center-col:not(.center-col-view) [style*="background: rgb(254, 226, 226)"],
        .center-col:not(.center-col-view) [style*="background: #fee2e2"],
        .center-col:not(.center-col-view) [style*="background: rgb(254, 243, 199)"],
        .center-col:not(.center-col-view) [style*="background: #fef3c7"],
        .center-col:not(.center-col-view) [style*="background: rgb(219, 234, 254)"],
        .center-col:not(.center-col-view) [style*="background: #dbeafe"] {
          background: #2f343d !important;
        }
        /* Override scoped pour passer le contenu hérité (LibraryModal,
           PlaybookView) en thème dark sans toucher chaque ligne de styles
           inline. */
        .inline-view-scope select,
        .inline-view-scope input[type="text"],
        .inline-view-scope input[type="number"],
        .inline-view-scope input[type="search"],
        .inline-view-scope textarea {
          background: #262a32 !important;
          color: #e5e5e5 !important;
          border-color: #2a2d35 !important;
        }
        .inline-view-scope input::placeholder,
        .inline-view-scope textarea::placeholder {
          color: #71717a !important;
        }
        .inline-view-scope [style*="rgb(255, 255, 255)"]:not(input):not(select):not(textarea):not(button[style*="background: rgb(216, 90, 48)"]),
        .inline-view-scope [style*="background: rgb(255,255,255)"]:not(input):not(select):not(textarea),
        .inline-view-scope [style*="background: #fff"]:not(input):not(select):not(textarea),
        .inline-view-scope [style*="background:#fff"]:not(input):not(select):not(textarea),
        .inline-view-scope [style*="background: #FFFFFF"]:not(input):not(select):not(textarea),
        .inline-view-scope [style*="background: #ffffff"]:not(input):not(select):not(textarea) {
          background: #262a32 !important;
        }
        .inline-view-scope [style*="background: rgb(250, 250, 249)"],
        .inline-view-scope [style*="background: #fafaf9"],
        .inline-view-scope [style*="background: rgb(241, 245, 249)"],
        .inline-view-scope [style*="background: #f1f5f9"] {
          background: #161a20 !important;
        }
        .inline-view-scope [style*="background: rgb(255, 247, 237)"],
        .inline-view-scope [style*="background: #fff7ed"],
        .inline-view-scope [style*="background: rgb(239, 246, 255)"],
        .inline-view-scope [style*="background: #eff6ff"] {
          background: #262a32 !important;
        }
        .inline-view-scope [style*="color: rgb(120, 113, 108)"],
        .inline-view-scope [style*="color: #78716c"],
        .inline-view-scope [style*="color: rgb(148, 163, 184)"],
        .inline-view-scope [style*="color: #94a3b8"],
        .inline-view-scope [style*="color: rgb(168, 162, 158)"],
        .inline-view-scope [style*="color: #a8a29e"] {
          color: #a1a1aa !important;
        }
        .inline-view-scope [style*="color: rgb(87, 83, 78)"],
        .inline-view-scope [style*="color: #57534e"],
        .inline-view-scope [style*="color: rgb(71, 85, 105)"],
        .inline-view-scope [style*="color: #475569"],
        .inline-view-scope [style*="color: rgb(51, 65, 85)"],
        .inline-view-scope [style*="color: #334155"],
        .inline-view-scope [style*="color: rgb(31, 41, 55)"],
        .inline-view-scope [style*="color: #1f2937"] {
          color: #e5e5e5 !important;
        }
        /* U04 — textes d'accent prévus pour fond clair : éclaircis sur fond
           sombre (contraste ≥ 4,5:1). */
        .inline-view-scope [style*="color: rgb(124, 45, 18)"],
        .inline-view-scope [style*="color: rgb(146, 64, 14)"] {
          color: #fdba74 !important;
        }
        .inline-view-scope [style*="color: rgb(30, 58, 138)"],
        .inline-view-scope [style*="color: rgb(30, 64, 175)"] {
          color: #93c5fd !important;
        }
        .inline-view-scope [style*="color: rgb(91, 33, 182)"],
        .inline-view-scope [style*="color: rgb(124, 58, 237)"] {
          color: #c4b5fd !important;
        }
        .inline-view-scope [style*="color: rgb(153, 27, 27)"] {
          color: #fca5a5 !important;
        }
        .inline-view-scope [style*="border: 1px solid rgb(254, 215, 170)"],
        .inline-view-scope [style*="border: 1px solid #fed7aa"],
        .inline-view-scope [style*="border: 1px solid rgb(191, 219, 254)"],
        .inline-view-scope [style*="border: 1px solid #bfdbfe"],
        .inline-view-scope [style*="border: 1px solid rgb(203, 213, 225)"],
        .inline-view-scope [style*="border: 1px solid #cbd5e1"],
        .inline-view-scope [style*="border: 1px solid rgb(226, 232, 240)"],
        .inline-view-scope [style*="border: 1px solid #e2e8f0"],
        .inline-view-scope [style*="border-right: 1px solid rgb(254, 215, 170)"],
        .inline-view-scope [style*="border-right: 1px solid #fed7aa"],
        .inline-view-scope [style*="border-right: 1px solid rgb(191, 219, 254)"],
        .inline-view-scope [style*="border-right: 1px solid #bfdbfe"],
        .inline-view-scope [style*="border-top: 1px solid rgb(254, 215, 170)"],
        .inline-view-scope [style*="border-top: 1px solid #fed7aa"],
        .inline-view-scope [style*="border-top: 1px solid rgb(191, 219, 254)"],
        .inline-view-scope [style*="border-top: 1px solid #bfdbfe"],
        .inline-view-scope [style*="border-bottom: 1px solid rgb(254, 215, 170)"],
        .inline-view-scope [style*="border-bottom: 1px solid #fed7aa"],
        .inline-view-scope [style*="border-bottom: 1px solid rgb(191, 219, 254)"],
        .inline-view-scope [style*="border-bottom: 1px solid #bfdbfe"] {
          border-color: #2a2d35 !important;
        }
        /* U04 — la fiche imprimable reste une feuille blanche : aperçu
           fidèle à l'impression, textes foncés lisibles. */
        /* Classe répétée : doit l'emporter sur les :not() des règles ci-dessus. */
        .inline-view-scope .playbook-print.playbook-print.playbook-print,
        .inline-view-scope .playbook-print.playbook-print [style*="rgb(255, 255, 255)"] {
          background: #fff !important;
        }
        .inline-view-scope .playbook-print.playbook-print [style*="color: rgb(71, 85, 105)"] {
          color: #475569 !important;
        }
        .side-col {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
        }
        @media (max-width: 1100px) {
          .layout-grid:not(.presenting) {
            grid-template-columns: var(--sidebar-w, 220px) 1fr;
          }
        }
        @media (max-width: 900px) {
          main { height: auto !important; max-height: none !important; overflow: auto !important; }
          /* U04 — même spécificité que la règle 1100 px, sinon la barre
             latérale garde sa colonne et écrase le terrain. Terrain d'abord,
             outils et vues en dessous. */
          .layout-grid,
          .layout-grid:not(.presenting) { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; }
          .layout-grid:not(.presenting) > .center-col { order: -1; }
          .side-col { flex-direction: row; flex-wrap: wrap; }
        }
      `,
        }}
      />
    </main>
  );
}

/** U03 — Annuler / Rétablir visibles, utilisables au doigt (cible ≥ 36 px). */
function HistoryButton({ label, shortcut, disabled, onClick, icon }: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} (${shortcut})`}
      className="bt-touch"
      style={{
        padding: '4px 10px',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        border: '1px solid #64748b', borderRadius: 6,
        background: '#29313e', color: '#f8fafc',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
