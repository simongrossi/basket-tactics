'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useLibrary } from '@/hooks/useLibrary';
import { SHORTCUT_LABELS, scrubTarget, useKeyboardShortcuts, type ShortcutMode } from '@/hooks/useKeyboardShortcuts';
import { useMatchLoop } from '@/hooks/useMatchLoop';
import { useSidebarState } from '@/hooks/useSidebarState';
import { Sidebar, Logo, type ToolGroup } from '@/components/sidebar/Sidebar';
import { SIDEBAR } from '@/components/sidebar/tokens';
import { Swords, Shield, ListOrdered, GitBranch, Undo2, Redo2, Share2, Sun, Moon, Layers, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import type { StickyModifiers } from '@/hooks/useCourtPointerHandlers';
import { OffenseToolsPanel } from '@/components/OffenseToolsPanel';
import { StepsPanel, isPristineInitialStepList } from '@/components/StepsPanel';
import { ScenarioPanel } from '@/components/ScenarioPanel';
import { ScenarioReader } from '@/components/ScenarioReader';
import { DefensePanel } from '@/components/DefensePanel';
import { CoachStartActions } from '@/components/sidebar/CoachStartActions';
import { CoachDrawHint } from '@/components/CoachDrawHint';
import { formatStepCounter, stepCounterAt } from '@/lib/logic/stepNumbering';
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
import { SituationCodeModal } from '@/components/SituationCodeModal';
import { CourtShareModal } from '@/components/CourtShareModal';
import { ManualRecordingBar } from '@/components/ManualRecordingBar';
import { useManualRecording } from '@/hooks/useManualRecording';
import type { SituationSnapshot } from '@/lib/state/situationCode';
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
  const [showMetrics, setShowMetrics] = useState(false);
  const [scrubT, setScrubT] = useState<number | null>(null);
  const [playbackStartT, setPlaybackStartT] = useState(0);
  const [playbackRunId, setPlaybackRunId] = useState(0);
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
  const [showShareModal, setShowShareModal] = useState(false);
  const [showComposerModal, setShowComposerModal] = useState(false);
  const [situationDialog, setSituationDialog] = useState<{ mode: 'copy' | 'animation' | 'gestures' | 'import'; snapshot: SituationSnapshot } | null>(null);
  const [stickyModifiers, setStickyModifiers] = useState<StickyModifiers>({});
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('bt_theme_mode');
      if (saved === 'light' || saved === 'dark') {
        setThemeMode(saved);
        document.documentElement.setAttribute('data-theme', saved);
      } else {
        setThemeMode('light');
        document.documentElement.setAttribute('data-theme', 'light');
      }
    } catch {
      setThemeMode('light');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  const toggleThemeMode = useCallback(() => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('bt_theme_mode', next);
        document.documentElement.setAttribute('data-theme', next);
      } catch {}
      return next;
    });
  }, []);

  const manual = useManualRecording();
  const [preparingRecording, setPreparingRecording] = useState(false);
  const recordingGestures = manual.status === 'recording';
  const replayingGestures = manual.status === 'replaying' || manual.status === 'paused';
  const manualBusy = preparingRecording || recordingGestures || replayingGestures;

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
  const handleCourtFrame = useCallback((displayed: DisplayedCourtFrame) => {
    setDisplayedCourt(displayed);
    manual.capture(displayed.frame);
  }, [manual.capture]);
  const startGestureRecording = useCallback(() => {
    matchLoop.stop();
    setIsPlaying(false);
    setIsPlayerMode(false);
    setPlaybackT(null);
    setScrubT(null);
    setExportT(null);
    manual.closeReplay();
    sidebar.setActiveView('court');
    app.setTool('move');
    setPreparingRecording(true);
  }, [matchLoop.stop, manual.closeReplay, sidebar.setActiveView, app.setTool]);
  useEffect(() => {
    // Wait for the editable step to render, so a former timeline/live frame
    // cannot become the recording's starting position.
    if (!preparingRecording || isPlaying || scrubT !== null || matchLoop.matchState
      || app.state.tool !== 'move' || displayedCourt?.state !== app.state || displayedCourt.dynamic) return;
    manual.start(app.state, displayedCourt.frame);
    setPreparingRecording(false);
  }, [preparingRecording, isPlaying, scrubT, matchLoop.matchState, app.state, displayedCourt, manual.start]);
  const copyGestureRecording = useCallback(() => {
    if (manual.snapshot) setSituationDialog({ mode: 'gestures', snapshot: manual.snapshot });
  }, [manual.snapshot]);
  const replayGestureRecording = useCallback(() => {
    matchLoop.stop();
    setIsPlaying(false);
    setPlaybackT(null);
    setScrubT(null);
    setExportT(null);
    manual.replay();
  }, [matchLoop.stop, manual.replay]);
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
    courtVisible: sidebar.activeView === 'court' && !manualBusy,
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

  const openSituationDialog = useCallback((mode: 'copy' | 'animation' | 'import') => {
    const frame = displayedCourt?.state === app.state ? displayedCourt.frame : undefined;
    const time = matchLoop.matchState ? null : scrubT ?? playbackT;
    setSituationDialog({ mode, snapshot: structuredClone({
      state: app.state,
      view: { time, source: matchLoop.matchState ? 'live' : time === null ? 'editor' : 'timeline', frame },
      ...(mode === 'animation' ? { animation: { startT: time ?? app.state.activeStep, speed: playbackSpeed } } : {}),
    }) });
  }, [app.state, displayedCourt, matchLoop.matchState, playbackT, scrubT, playbackSpeed]);

  const handleImportSituation = useCallback((snapshot: SituationSnapshot, saveOption?: { folderId: string; name: string }) => {
    if (snapshot.recording) {
      matchLoop.stop();
      setIsPlaying(false);
      setPlaybackT(null);
      setExportT(null);
      setScrubT(null);
      setIsPlayerMode(false);
      sidebar.setActiveView('court');
      manual.load(snapshot.state, snapshot.recording);
      return true;
    }
    if (!app.importState(snapshot.state)) return false;
    if (saveOption?.name?.trim()) {
      const targetFolderId = saveOption.folderId || lib.library.folders[0]?.id;
      if (targetFolderId) {
        const id = lib.saveSystem(snapshot.state, targetFolderId, saveOption.name.trim());
        app.patch({ librarySystemId: id });
      }
    }
    manual.closeReplay();
    matchLoop.stop();
    setIsPlaying(!!snapshot.animation);
    setPlaybackT(null);
    setExportT(null);
    setPlaybackStartT(snapshot.animation?.startT ?? snapshot.view?.time ?? snapshot.state.activeStep);
    setScrubT(snapshot.animation ? null : snapshot.view?.time ?? null);
    if (snapshot.animation) setPlaybackSpeed(snapshot.animation.speed);
    // Une nouvelle lecture remplace aussi une animation déjà en cours.
    setPlaybackRunId(id => id + 1);
    setIsPlayerMode(false);
    sidebar.setActiveView('court');
    return true;
  }, [app, lib, matchLoop, sidebar, manual.load, manual.closeReplay]);

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
        background: 'var(--bt-bg)',
        padding: '8px 12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        color: 'var(--bt-text)',
        transition: 'background-color 0.2s ease, color 0.2s ease',
      }}
    >
      {!presentMode && !isPlayerMode && !manualBusy && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 12,
            minHeight: 36,
            flexWrap: 'nowrap',
          }}
        >
          {/* Pôle Gauche : Logo/Marque + Undo/Redo + Titre + Statut */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 auto' }}>
            <button
              type="button"
              onClick={() => {
                setIsPlayerMode(false);
                setPresentMode(false);
                sidebar.setActiveView('court');
              }}
              title="Revenir au terrain principal (Accueil)"
              aria-label="Revenir au terrain principal"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
                padding: '4px 10px 4px 4px',
                marginRight: 2,
                border: 'none',
                borderRight: '1px solid var(--bt-border)',
                borderRadius: '6px 0 0 6px',
                background: 'transparent',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'opacity 0.15s ease',
              }}
            >
              <Logo />
              <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: -0.2, color: 'var(--bt-text)' }}>
                basket-tactics
              </span>
            </button>
            {sidebar.activeView === 'court' && (
              <div role="group" aria-label="Historique des modifications" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <HistoryButton label="Annuler" shortcut={SHORTCUT_LABELS.undo} disabled={!app.canUndo || isPlaying} onClick={app.undo} icon={<Undo2 size={15} aria-hidden />} />
                <HistoryButton label="Rétablir" shortcut={SHORTCUT_LABELS.redo} disabled={!app.canRedo || isPlaying} onClick={app.redo} icon={<Redo2 size={15} aria-hidden />} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <strong style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentSavedSystem?.name ?? 'Brouillon'}
              </strong>
              <span
                role="status"
                title={
                  app.saveStatus === 'error' || lib.saveStatus === 'error'
                    ? 'Sauvegarde impossible — exportez votre travail'
                    : app.saveStatus === 'pending' || lib.saveStatus === 'pending'
                      ? 'Sauvegarde en cours…' : 'Brouillon conservé localement'
                }
                style={{
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  color: app.saveStatus === 'error' || lib.saveStatus === 'error'
                    ? '#fca5a5'
                    : app.saveStatus === 'pending' || lib.saveStatus === 'pending'
                      ? '#fdba74'
                      : 'var(--bt-text-dim)',
                }}
              >
                {app.saveStatus === 'pending' || lib.saveStatus === 'pending' ? '• synchro…' : '• sauvegardé'}
              </span>
            </div>
            {app.hasRecovery && (
              <button
                className="bt-touch"
                style={{
                  height: 28,
                  padding: '0 8px',
                  border: '1px solid var(--bt-btn-border)',
                  borderRadius: 6,
                  background: 'var(--bt-btn-bg)',
                  color: 'var(--bt-btn-text)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: 11,
                  flexShrink: 0,
                }}
                onClick={app.restoreDraft}
              >
                Restaurer brouillon
              </button>
            )}
          </div>

          {/* Pôle Centre : Diagnostics coach inline */}
          {app.state.showCoachDiagnostics !== false && !isPlayerMode && !manualBusy && (
            <div style={{ flexShrink: 0 }}>
              <CoachDiagnosticsOverlay diagnostics={coachDiagnostics} inline />
            </div>
          )}

          {/* Pôle Droite : Actions système, Présentation, Partage et Menu Outils */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="bt-touch"
              style={{
                height: 28,
                padding: '0 9px',
                border: '1px solid var(--bt-btn-border)',
                borderRadius: 6,
                background: 'var(--bt-btn-bg)',
                color: 'var(--bt-btn-text)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
              }}
              onClick={() => {
                sidebar.setActiveView('court');
                setIsPlayerMode(true);
              }}
              title="Passer en mode Présentation / Joueur (terrain grand format avec télécommande pas-à-pas)"
            >
              <span>📺</span>
              <span>Présenter</span>
            </button>

            {currentSavedSystem ? (
              <button
                className="bt-touch"
                style={{
                  height: 28,
                  padding: '0 10px',
                  border: '1px solid var(--bt-btn-border)',
                  borderRadius: 6,
                  background: 'var(--bt-btn-bg)',
                  color: 'var(--bt-btn-text)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                }}
                onClick={() => lib.updateSystem(currentSavedSystem.id, app.state)}
                title={`Enregistrer les modifications dans ${currentSavedSystem.name}`}
              >
                💾 Enregistrer
              </button>
            ) : (
              <button
                className="bt-touch"
                style={{
                  height: 28,
                  padding: '0 10px',
                  border: '1px solid var(--bt-btn-border)',
                  borderRadius: 6,
                  background: 'var(--bt-btn-bg)',
                  color: 'var(--bt-btn-text)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                }}
                onClick={() => sidebar.setActiveView('library')}
                title="Enregistrer ce système dans la bibliothèque"
              >
                💾 Sauvegarder…
              </button>
            )}

            <button
              className="bt-touch"
              style={{
                height: 28,
                padding: '0 10px',
                border: '1px solid rgba(59, 130, 246, 0.45)',
                borderRadius: 6,
                background: 'linear-gradient(180deg, #1d4ed8 0%, #1e40af 100%)',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 600,
                fontSize: 11,
              }}
              onClick={() => setShowShareModal(true)}
              title="Partager le système (lien direct, code ou prompt IA)"
            >
              <Share2 size={13} />
              <span>Partager</span>
            </button>

            <details className="bt-context-details" style={{ position: 'relative' }}>
              <summary
                className="bt-touch"
                title="Plus d'actions (Capturer mouvements, Exporter vidéo/PDF, Enregistrer sous…)"
                style={{
                  height: 28,
                  padding: '0 8px',
                  border: '1px solid var(--bt-btn-border)',
                  borderRadius: 6,
                  background: 'var(--bt-btn-bg)',
                  color: 'var(--bt-btn-text)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  userSelect: 'none',
                }}
              >
                <span>Plus ▾</span>
              </summary>
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  minWidth: 215,
                  padding: 6,
                  borderRadius: 8,
                  background: 'var(--bt-surface)',
                  border: '1px solid var(--bt-border)',
                  boxShadow: '0 10px 28px rgba(0, 0, 0, 0.28)',
                  zIndex: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                {currentSavedSystem && (
                  <button
                    type="button"
                    onClick={(e) => {
                      (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
                      sidebar.setActiveView('library');
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      borderRadius: 5,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--bt-text)',
                      fontSize: 11.5,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    📁 Enregistrer sous…
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
                    startGestureRecording();
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderRadius: 5,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--bt-text)',
                    fontSize: 11.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title="Capturer en direct les déplacements à la souris et la réaction défensive (jusqu'à 60 s)"
                >
                  <span style={{ color: '#ef4444', fontSize: 10 }}>●</span>
                  <span>Capturer mouvements (direct)</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
                    setShowExportModal(true);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderRadius: 5,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--bt-text)',
                    fontSize: 11.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  🎬 Exporter (Vidéo, GIF, PDF)…
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
                    openSituationDialog('import');
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderRadius: 5,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--bt-text)',
                    fontSize: 11.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  📋 Coller un code de situation…
                </button>
              </div>
            </details>

            <button
              type="button"
              className="bt-touch"
              onClick={toggleThemeMode}
              title={themeMode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              aria-label={themeMode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              style={{
                width: 28,
                height: 28,
                padding: 0,
                borderRadius: 6,
                border: '1px solid var(--bt-border)',
                background: 'var(--bt-surface)',
                color: 'var(--bt-text)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {themeMode === 'dark' ? (
                <Moon size={15} color="#a78bfa" />
              ) : (
                <Sun size={15} color="#ea580c" />
              )}
            </button>
          </div>
        </header>
      )}
      <div
        className={presentMode || isPlayerMode || manualBusy ? 'layout-grid presenting' : 'layout-grid'}
        style={{
          // Refonte UI — largeur de la sidebar pilotée par useSidebarState.
          // Le mode présentation force une seule colonne (cf. .presenting).
          ['--sidebar-w' as string]: `${
            sidebar.collapsed ? SIDEBAR.widthCollapsed : SIDEBAR.widthExpanded
          }px`,
        }}
      >
        {!presentMode && !isPlayerMode && !manualBusy && (
          <Sidebar
            dark={themeMode === 'dark'}
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
                onCopySituation={() => openSituationDialog('copy')}
                onCopyAnimation={() => openSituationDialog('animation')}
                onPasteSituation={() => openSituationDialog('import')}
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
                    onApplyStartingFormation={app.applyStartingFormation}
                    onOpenComposer={() => setShowComposerModal(true)}
                    modifiers={stickyModifiers}
                    onChangeModifiers={setStickyModifiers}
                    stepIndicator={formatStepCounter(stepCounterAt(app.state.steps, app.state.activeStep))}
                    canPrevStep={app.state.activeStep > 0}
                    canNextStep={app.state.activeStep < app.state.steps.length - 1}
                    onPrevStep={() => {
                      setScrubT(null);
                      app.setActiveStep(Math.max(0, app.state.activeStep - 1));
                    }}
                    onNextStep={() => {
                      setScrubT(null);
                      app.setActiveStep(Math.min(app.state.steps.length - 1, app.state.activeStep + 1));
                    }}
                    onAddStep={app.addStep}
                    onSetStartingPosition={app.setStartingPositionFromCurrentStep}
                    currentAttackerPositions={app.state.steps[app.state.activeStep]?.off}
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
                defaultOpen: true,
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
                    onSetStartingPosition={app.setStartingPositionFromCurrentStep}
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
            <SidebarThemeProvider dark={themeMode === 'dark'}>
              <PlaybookView
                state={app.state}
                mode="inline"
                onClose={() => sidebar.setActiveView('court')}
              />
            </SidebarThemeProvider>
          )}
          {sidebar.activeView === 'library' && (
            <SidebarThemeProvider dark={themeMode === 'dark'}>
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
            <SidebarThemeProvider dark={themeMode === 'dark'}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  overflow: 'auto',
                  padding: '24px 28px',
                  background: 'var(--bt-bg)',
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
            <SidebarThemeProvider dark={themeMode === 'dark'}>
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
            <SidebarThemeProvider dark={themeMode === 'dark'}>
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
          {sessionRun && runSession && !manualBusy && (
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
          {!isPlayerMode && !presentMode && <ManualRecordingBar recorder={manual} preparing={preparingRecording} onStart={startGestureRecording} onCopy={copyGestureRecording} onReplay={replayGestureRecording} />}
          <div style={{ position: 'relative', flex: '1 1 0%', minHeight: 0, overflow: 'hidden', display: 'grid' }}>
            {runBlock && runBlockVisual?.kind === 'none' && !manualBusy && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'grid' }}>
                <SessionBlockCard title={runBlock.title} notes={runBlock.notes} durationMin={runBlock.durationMin} />
              </div>
            )}
            {isPlayerMode && (
              <div className="player-header">
                <button
                  type="button"
                  className="player-brand"
                  onClick={() => {
                    setIsPlayerMode(false);
                    setPresentMode(false);
                    sidebar.setActiveView('court');
                  }}
                  title="Revenir au terrain principal (Accueil)"
                  style={{ cursor: 'pointer' }}
                >
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
                </button>
                <div className="player-step-info">
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {formatStepCounter(stepCounterAt(app.state.steps, app.state.activeStep))}
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
            <CoachDrawHint
              visible={!manualBusy && !presentMode && !isPlayerMode && !isPlaying && !matchLoop.matchState
                && isPristineInitialStepList(app.state)}
            />
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
              onFrameChange={handleCourtFrame}
              state={replayingGestures && manual.snapshot ? manual.snapshot.state : app.state}
              recordedFrame={manual.replayFrame}
              readOnly={replayingGestures || preparingRecording}
              gesturesOnly={recordingGestures}
              diagnostics={isPlayerMode || manualBusy ? [] : coachDiagnostics}
              onMoveAttacker={app.moveAttacker}
              onMoveDefender={app.moveDefender}
              onBeginPlayerDrag={() => { app.beginPlayerDrag(); manual.recordEvent({ type: 'begin' }); }}
              onMoveAttackerDuringDrag={(id, x, y) => { manual.recordEvent({ type: 'move', id, x, y }); app.moveAttackerDuringDrag(id, x, y); }}
              onMoveDefenderDuringDrag={(id, x, y) => { manual.recordEvent({ type: 'move', id, x, y }); app.moveDefenderDuringDrag(id, x, y); }}
              onCommitPlayerDrag={() => { app.commitPlayerDrag(); manual.recordEvent({ type: 'end' }); }}
              onBeginDefenderPursuit={app.beginDefenderPursuit}
              onEndDefenderPursuit={app.endDefenderPursuit}
              registerPendingGestureFlush={app.registerPendingGestureFlush}
              onDefenderPursuitSettled={app.finishDefenderPursuit}
              onAddAnnotation={handleAddAnnotation}
              onAddTextNote={app.addTextNote}
              onUpdateTextNote={app.updateTextNote}
              onRemoveTextNote={app.removeTextNote}
              onUpdateRule={app.updateRule}
              onClearDefenseOverride={app.clearDefenseOverride}
              onApplyDefenderProfile={app.applyDefenderProfile}
              onSetDefenderSpeedProfile={app.setDefenderSpeedProfile}
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
              playbackT={playbackT}
              playbackSpeed={playbackSpeed}
              scrubT={scrubT}
              playbackStartT={playbackStartT}
              playbackRunId={playbackRunId}
              onPlaybackTick={setPlaybackT}
              onPlaybackEnd={() => {
                setIsPlaying(false);
                setPlaybackT(null);
                setPlaybackStartT(0);
                setScrubT(app.state.steps.length - 1);
                app.setActiveStep(app.state.steps.length - 1);
              }}
              defenseReleaseTransition={replayingGestures ? null : app.defenseReleaseTransition}
              defenderPursuit={replayingGestures ? null : app.defenderPursuit}
              liveMatchState={matchLoop.matchState}
              exportT={exportT}
              externalSvgRef={courtSvgRef}
              isPlayerMode={isPlayerMode}
              composerOpen={showComposerModal}
              onCloseComposer={() => setShowComposerModal(false)}
              modifiers={stickyModifiers}
              onModifiersChange={setStickyModifiers}
              dark={themeMode === 'dark'}
              onAddStep={app.addStep}
              onSetStartingPosition={app.setStartingPositionFromCurrentStep}
              onSetActiveStep={(idx) => {
                setScrubT(null);
                app.setActiveStep(idx);
              }}
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
          {(app.state.scriptedActions?.length ?? 0) > 0 && !isPlayerMode && !manualBusy && (
            <ScenarioReader
              scriptedActions={app.state.scriptedActions ?? []}
              activeStep={app.state.activeStep}
              stepToActionId={app.state.steps.map((_, i, all) => all[i + 1]?.generatedBy)}
            />
          )}
          {!isPlayerMode && !manualBusy && (
            <Timeline
              state={app.state}
              onSetActiveStep={app.setActiveStep}
              onAddStep={app.addStep}
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
              extraActions={
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => setShowMultiTrack((v) => !v)}
                    title={showMultiTrack ? 'Masquer les pistes joueurs (Multi-track)' : 'Afficher les pistes joueurs (Multi-track)'}
                    className="bt-touch"
                    style={{
                      padding: '3px 8px',
                      fontSize: 11,
                      border: `1px solid ${showMultiTrack ? 'rgba(234, 88, 12, 0.4)' : 'var(--bt-border)'}`,
                      borderRadius: 6,
                      background: showMultiTrack ? 'rgba(234, 88, 12, 0.12)' : 'var(--bt-surface)',
                      color: showMultiTrack ? 'var(--bt-orange)' : 'var(--bt-text-muted)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontWeight: 600,
                    }}
                  >
                    <Layers size={13} />
                    <span>Pistes</span>
                  </button>
                  {metrics && (
                    <button
                      onClick={() => setShowMetrics((v) => !v)}
                      title={showMetrics ? 'Masquer les métriques' : 'Afficher les métriques tactiques'}
                      className="bt-touch"
                      style={{
                        padding: '3px 8px',
                        fontSize: 11,
                        border: `1px solid ${showMetrics ? 'rgba(59, 130, 246, 0.4)' : 'var(--bt-border)'}`,
                        borderRadius: 6,
                        background: showMetrics ? 'rgba(59, 130, 246, 0.12)' : 'var(--bt-surface)',
                        color: showMetrics ? 'var(--bt-accent)' : 'var(--bt-text-muted)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontWeight: 600,
                      }}
                    >
                      <Activity size={13} />
                      <span>Stats</span>
                    </button>
                  )}
                </div>
              }
            />
          )}
          {showMultiTrack && !isPlayerMode && !manualBusy && (
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
          {metrics && showMetrics && !isPlayerMode && !manualBusy && (
            <MetricsBar playerCount={app.state.playerCount} metrics={metrics} bestAction={bestAction} screenAction={screenAction} />
          )}
          {!isPlayerMode && !manualBusy && (
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
      {showShareModal && (
        <CourtShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          state={app.state}
          situationView={{
            source: matchLoop.matchState ? 'live' : (scrubT != null || playbackT != null ? 'timeline' : 'editor'),
            time: scrubT ?? playbackT ?? null,
            frame: displayedCourt?.state === app.state ? displayedCourt.frame : undefined,
          }}
        />
      )}
      {situationDialog && (
        <SituationCodeModal
          mode={situationDialog.mode}
          snapshot={situationDialog.snapshot}
          libraryFolders={lib.library.folders.map(f => ({ id: f.id, name: f.name }))}
          onImport={handleImportSituation}
          onClose={() => setSituationDialog(null)}
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
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        .center-col.center-col-view {
          /* Vues routées (Playbook, Bibliothèque, Paramètres) : une seule
             rangée plein hauteur, pas de timeline ni metrics. */
          display: grid;
          grid-template-rows: 1fr;
          background: var(--bt-bg);
          border-radius: 8px;
          color: var(--bt-text);
        }
        /* Overrides dark pour la Timeline + Metrics + ScenarioReader +
           CoachDiagnostics sous le court (vue Terrain). Ne s'appliquent qu'en mode sombre. */
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: rgb(255, 255, 255)"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: rgb(255,255,255)"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #fff"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background:#fff"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #FFFFFF"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #ffffff"]:not(input):not(select):not(textarea) {
          background: #2f343d !important;
        }
        /* Inputs/selects/textarea aussi dans le court view (Timeline a un
           range slider qui apparaît avec scrollbar/track natifs blancs). */
        html:not([data-theme="light"]) .center-col:not(.center-col-view) select,
        html:not([data-theme="light"]) .center-col:not(.center-col-view) input[type="text"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) input[type="number"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) input[type="search"] {
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
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: rgb(241, 245, 249)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #f1f5f9"] {
          background: #262a32 !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: rgb(203, 213, 225)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #cbd5e1"] {
          background: #3a3f48 !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="border: 1px solid rgb(226, 232, 240)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="border: 1px solid #e2e8f0"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="border: 1px solid rgb(203, 213, 225)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="border: 1px solid #cbd5e1"] {
          border-color: #2a2d35 !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(71, 85, 105)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #475569"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(51, 65, 85)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #334155"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(100, 116, 139)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #64748b"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(87, 83, 78)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #57534e"] {
          color: #e5e7eb !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(6, 95, 70)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #065f46"] {
          color: #6ee7b7 !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(153, 27, 27)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #991b1b"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(127, 29, 29)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #7f1d1d"] {
          color: #fca5a5 !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(146, 64, 14)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #92400e"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(180, 83, 9)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #b45309"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(124, 45, 18)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #7c2d12"] {
          color: #fbbf24 !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(30, 58, 138)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #1e3a8a"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: rgb(30, 64, 175)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="color: #1e40af"] {
          color: #93c5fd !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="border: 1px solid rgb(167, 243, 208)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="border: 1px solid #a7f3d0"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="border: 1px solid rgb(253, 230, 138)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="border: 1px solid #fde68a"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="border: 1px solid rgb(254, 202, 202)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="border: 1px solid #fecaca"] {
          border-color: #2a2d35 !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: rgb(209, 250, 229)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #d1fae5"] {
          background: rgba(110, 231, 183, 0.12) !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: rgb(254, 243, 199)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #fef3c7"] {
          background: rgba(251, 191, 36, 0.12) !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: rgb(254, 226, 226)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #fee2e2"] {
          background: rgba(252, 165, 165, 0.12) !important;
        }
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: rgb(220, 252, 231)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #dcfce7"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: rgb(254, 226, 226)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #fee2e2"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: rgb(254, 243, 199)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #fef3c7"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: rgb(219, 234, 254)"],
        html:not([data-theme="light"]) .center-col:not(.center-col-view) [style*="background: #dbeafe"] {
          background: #2f343d !important;
        }
        /* Override scoped pour passer le contenu hérité (LibraryModal,
           PlaybookView) en thème dark quand le mode dark est actif. */
        html:not([data-theme="light"]) .inline-view-scope select,
        html:not([data-theme="light"]) .inline-view-scope input[type="text"],
        html:not([data-theme="light"]) .inline-view-scope input[type="number"],
        html:not([data-theme="light"]) .inline-view-scope input[type="search"],
        html:not([data-theme="light"]) .inline-view-scope textarea {
          background: #262a32 !important;
          color: #e5e5e5 !important;
          border-color: #2a2d35 !important;
        }
        html:not([data-theme="light"]) .inline-view-scope input::placeholder,
        html:not([data-theme="light"]) .inline-view-scope textarea::placeholder {
          color: #71717a !important;
        }
        html:not([data-theme="light"]) .inline-view-scope [style*="rgb(255, 255, 255)"]:not(input):not(select):not(textarea):not(button[style*="background: rgb(216, 90, 48)"]),
        html:not([data-theme="light"]) .inline-view-scope [style*="background: rgb(255,255,255)"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .inline-view-scope [style*="background: #fff"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .inline-view-scope [style*="background:#fff"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .inline-view-scope [style*="background: #FFFFFF"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .inline-view-scope [style*="background: #ffffff"]:not(input):not(select):not(textarea) {
          background: #262a32 !important;
        }
        html:not([data-theme="light"]) .inline-view-scope [style*="background: rgb(250, 250, 249)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="background: #fafaf9"],
        html:not([data-theme="light"]) .inline-view-scope [style*="background: rgb(241, 245, 249)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="background: #f1f5f9"] {
          background: #161a20 !important;
        }
        html:not([data-theme="light"]) .inline-view-scope [style*="background: rgb(255, 247, 237)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="background: #fff7ed"],
        html:not([data-theme="light"]) .inline-view-scope [style*="background: rgb(239, 246, 255)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="background: #eff6ff"] {
          background: #262a32 !important;
        }
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(120, 113, 108)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: #78716c"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(148, 163, 184)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: #94a3b8"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(168, 162, 158)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: #a8a29e"] {
          color: #a1a1aa !important;
        }
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(87, 83, 78)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: #57534e"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(71, 85, 105)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: #475569"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(51, 65, 85)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: #334155"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(31, 41, 55)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: #1f2937"] {
          color: #e5e5e5 !important;
        }
        /* U04 — textes d'accent prévus pour fond clair : éclaircis sur fond
           sombre (contraste ≥ 4,5:1). */
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(124, 45, 18)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(146, 64, 14)"] {
          color: #fdba74 !important;
        }
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(30, 58, 138)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(30, 64, 175)"] {
          color: #93c5fd !important;
        }
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(91, 33, 182)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(124, 58, 237)"] {
          color: #c4b5fd !important;
        }
        html:not([data-theme="light"]) .inline-view-scope [style*="color: rgb(153, 27, 27)"] {
          color: #fca5a5 !important;
        }
        html:not([data-theme="light"]) .inline-view-scope [style*="border: 1px solid rgb(254, 215, 170)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border: 1px solid #fed7aa"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border: 1px solid rgb(191, 219, 254)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border: 1px solid #bfdbfe"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border: 1px solid rgb(203, 213, 225)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border: 1px solid #cbd5e1"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border: 1px solid rgb(226, 232, 240)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border: 1px solid #e2e8f0"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-right: 1px solid rgb(254, 215, 170)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-right: 1px solid #fed7aa"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-right: 1px solid rgb(191, 219, 254)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-right: 1px solid #bfdbfe"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-top: 1px solid rgb(254, 215, 170)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-top: 1px solid #fed7aa"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-top: 1px solid rgb(191, 219, 254)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-top: 1px solid #bfdbfe"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-bottom: 1px solid rgb(254, 215, 170)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-bottom: 1px solid #fed7aa"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-bottom: 1px solid rgb(191, 219, 254)"],
        html:not([data-theme="light"]) .inline-view-scope [style*="border-bottom: 1px solid #bfdbfe"] {
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
        height: 28,
        padding: '0 10px',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        border: '1px solid var(--bt-btn-border)', borderRadius: 6,
        background: 'var(--bt-btn-bg)', color: 'var(--bt-btn-text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontSize: 12,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
