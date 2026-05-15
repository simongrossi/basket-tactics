'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useLibrary } from '@/hooks/useLibrary';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMatchLoop } from '@/hooks/useMatchLoop';
import { OffenseToolsPanel } from '@/components/OffenseToolsPanel';
import { StepsPanel } from '@/components/StepsPanel';
import { ScenarioPanel } from '@/components/ScenarioPanel';
import { ScenarioReader } from '@/components/ScenarioReader';
import { DefensePanel } from '@/components/DefensePanel';
import { FloatingActionsMenu } from '@/components/FloatingActionsMenu';
import { ParametresLauncher } from '@/components/ParametresLauncher';
import { LibraryPanel } from '@/components/LibraryPanel';
import { Timeline } from '@/components/Timeline';
import { CourtView } from '@/components/CourtView';
import { LiveMatchOverlay } from '@/components/LiveMatchOverlay';
import { PlaybookView } from '@/components/PlaybookView';
import { PlayerTimelineModal } from '@/components/PlayerTimelineModal';
import { MultiTrackTimeline } from '@/components/MultiTrackTimeline';
import { MetricsBar } from '@/components/MetricsBar';
import { MetricsChart } from '@/components/MetricsChart';
import { CoachDiagnosticsOverlay } from '@/components/CoachDiagnosticsOverlay';
import { effectiveDefensePositions, getDefenseHoop, detectStepScreenAction } from '@/lib/logic/engine';
import { computeMetrics } from '@/lib/logic/metrics';
import { evaluateOffensiveOptions, bestOffensiveAction } from '@/lib/logic/offense';
import { computeCoachDiagnostics } from '@/lib/logic/coachDiagnostics';
import { activeBallCarrier, activeOffense } from '@/lib/logic/players';
import type { AppState, Step } from '@/lib/types';

export default function Page() {
  const app = useAppState();
  const lib = useLibrary();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackT, setPlaybackT] = useState<number | null>(null);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [showPlayerTimeline, setShowPlayerTimeline] = useState(false);
  const [showMultiTrack, setShowMultiTrack] = useState(false);
  const [scrubT, setScrubT] = useState<number | null>(null);
  const [playbackStartT, setPlaybackStartT] = useState(0);
  const [presentMode, setPresentMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // B4 — Game loop "▶ Play IA (live)" : hook unique remonté au niveau page
  // pour partager le matchState live entre CourtView (rendu terrain) et
  // SimulationSection (HUD événements + contrôles).
  const matchLoop = useMatchLoop({ baseState: app.state });

  // E.1 V1 + A.2 — mode "match plein écran" : active fullCourt +
  // presentMode + browser fullscreen en une seule action.
  const handleEnterFullscreenMatch = useCallback(() => {
    if (!app.state.fullCourt) {
      app.patch({ fullCourt: true });
    }
    setPresentMode(true);
    // Best-effort native fullscreen (peut échouer si l'utilisateur n'a
    // pas interagi avec un geste utilisateur ou si bloqué par le navigateur).
    if (typeof document !== 'undefined' && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, [app]);
  const handleExitFullscreenMatch = useCallback(() => {
    setPresentMode(false);
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const metrics = useMemo(() => {
    const step = app.state.steps[app.state.activeStep];
    if (!step) return null;
    const defPos = effectiveDefensePositions(app.state, app.state.activeStep);
    return computeMetrics(
      activeOffense(step.off, app.state.playerCount),
      defPos,
      activeBallCarrier(step, app.state.playerCount),
      getDefenseHoop(app.state)
    );
  }, [app.state]);

  const bestAction = useMemo(() => {
    const step = app.state.steps[app.state.activeStep];
    if (!step) return null;
    const defPos = effectiveDefensePositions(app.state, app.state.activeStep);
    const actions = evaluateOffensiveOptions(
      activeOffense(step.off, app.state.playerCount),
      defPos,
      activeBallCarrier(step, app.state.playerCount),
      getDefenseHoop(app.state),
      app.state.attackerProfiles
    );
    return bestOffensiveAction(actions);
  }, [app.state]);

  const coachDiagnostics = useMemo(
    () => computeCoachDiagnostics(app.state, app.state.activeStep),
    [app.state]
  );

  const screenAction = useMemo(() => {
    const detected = detectStepScreenAction(app.state, app.state.activeStep);
    return detected?.action ?? null;
  }, [app.state]);

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
      setPlaybackStartT(scrubT ?? 0);
      setScrubT(null);
      setPlaybackT(null);
      setIsPlaying(true);
    }
  }, [isPlaying, playbackT, scrubT]);

  // Échap quitte le mode présentation
  useEffect(() => {
    if (!presentMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentMode(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [presentMode]);

  useKeyboardShortcuts({
    onPlayPause: handlePlayToggle,
    onPrevStep: () => app.setActiveStep(app.state.activeStep - 1),
    onNextStep: () => app.setActiveStep(app.state.activeStep + 1),
    onSetTool: app.setTool,
    onDeleteLastAnnotation: app.deleteLastAnnotation,
    onUndo: app.undo,
    onRedo: app.redo,
  });

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(app.state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'systeme_basket.json';
    a.click();
    URL.revokeObjectURL(url);
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
          app.importState(data);
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
        background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
        padding: '8px 12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div className={presentMode ? 'layout-grid presenting' : 'layout-grid'}>
        {!presentMode && (
          <div className="side-col">
            {/* LIVRAISON 1 — colonne gauche tactique : Attaque (outils) + Défense.
                La liste des étapes + scénario + bibliothèque + paramètres sont
                maintenant à droite. */}
            <OffenseToolsPanel
              tool={app.state.tool}
              onSetTool={app.setTool}
            />
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
              onLoadAiSteps={handleLoadAiSteps}
              onEnterFullscreenMatch={handleEnterFullscreenMatch}
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
          </div>
        )}

        <div className="center-col">
          <div style={{ position: 'relative', minHeight: 0, overflow: 'hidden', display: 'grid' }}>
            {app.state.showCoachDiagnostics !== false && (
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
            <CourtView
              state={app.state}
              diagnostics={coachDiagnostics}
              onMoveAttacker={app.moveAttacker}
              onMoveDefender={app.moveDefender}
              onBeginPlayerDrag={app.beginPlayerDrag}
              onMoveAttackerDuringDrag={app.moveAttackerDuringDrag}
              onMoveDefenderDuringDrag={app.moveDefenderDuringDrag}
              onCommitPlayerDrag={app.commitPlayerDrag}
              onAddAnnotation={app.addAnnotation}
              onUpdateRule={app.updateRule}
              onClearDefenseOverride={app.clearDefenseOverride}
              onApplyDefenderProfile={app.applyDefenderProfile}
              onSetBallCarrier={app.setBallCarrier}
              onSetForcedScreener={app.setForcedScreener}
              onClearAnnotationsFor={app.clearAnnotationsFor}
              onSetAttackerHand={app.setAttackerHand}
              onSetAttackerProfile={app.setAttackerProfile}
              onSetAttackerOrientation={app.setAttackerOrientation}
              onSetZoneOverride={app.setZoneOverride}
              onClearZoneOverride={app.clearZoneOverride}
              onDeleteAnnotation={app.deleteAnnotation}
              onSetAnnotationFrom={app.setAnnotationFrom}
              onSetAnnotationTo={app.setAnnotationTo}
              onSetAnnotationWaypoint={app.setAnnotationWaypoint}
              onSetTool={app.setTool}
              isPlaying={isPlaying}
              playbackSpeed={playbackSpeed}
              scrubT={scrubT}
              playbackStartT={playbackStartT}
              onPlaybackTick={setPlaybackT}
              onPlaybackEnd={() => {
                setIsPlaying(false);
                setPlaybackT(null);
                setPlaybackStartT(0);
                app.setActiveStep(app.state.steps.length - 1);
              }}
              defenseReleaseTransition={app.defenseReleaseTransition}
              liveMatchState={matchLoop.matchState}
            />
            <FloatingActionsMenu
              presentMode={presentMode}
              onTogglePresentMode={() => setPresentMode((p) => !p)}
              onOpenPlaybook={() => setShowPlaybook(true)}
              onOpenPlayerTimeline={() => setShowPlayerTimeline(true)}
              onExport={handleExport}
              onImport={handleImport}
              onReset={app.resetAll}
            />
          </div>
          {(app.state.scriptedActions?.length ?? 0) > 0 && (
            <ScenarioReader
              scriptedActions={app.state.scriptedActions ?? []}
              activeStep={app.state.activeStep}
              stepToActionId={app.state.steps.map((s) => s.generatedBy)}
            />
          )}
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
            <button
              onClick={() => setShowMultiTrack((v) => !v)}
              title={showMultiTrack ? 'Masquer les pistes joueurs' : 'Afficher les pistes joueurs (multi-track)'}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                background: showMultiTrack ? '#fed7aa' : '#fff',
                color: showMultiTrack ? '#9a3412' : '#475569',
                cursor: 'pointer',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {showMultiTrack ? '▼' : '▲'} pistes
            </button>
          </div>
          {showMultiTrack && (
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
              onSetQuality={app.setAnnotationQuality}
            />
          )}
          {metrics && <MetricsBar metrics={metrics} bestAction={bestAction} screenAction={screenAction} />}
          <MetricsChart
            state={app.state}
            activeStep={app.state.activeStep}
            onSetActiveStep={app.setActiveStep}
          />
        </div>

        {!presentMode && (
          <div className="side-col">
            {/* LIVRAISON 1 — colonne droite workspace : étapes + scénario +
                bibliothèque + paramètres. Manipulation du matériau de jeu. */}
            <StepsPanel
              state={app.state}
              onSetActiveStep={app.setActiveStep}
              onAddStep={app.addStep}
              onDuplicateStep={app.duplicateStep}
              onDeleteStep={app.deleteStep}
              onSetStepLabel={app.setStepLabel}
              onSetBallCarrier={app.setBallCarrier}
              onDeleteAnnotation={app.deleteAnnotation}
              onConvertToFreeThrow={app.convertStepToFreeThrow}
              onConvertToInbound={app.convertStepToInbound}
              onSetInboundDefenseMode={app.setInboundDefenseMode}
            />
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
              onUpdateBranch={app.updateScenarioBranch}
              onDeleteBranch={app.deleteScenarioBranch}
              onSetActiveBranch={app.setActiveBranch}
            />
            <LibraryPanel
              state={app.state}
              library={lib.library}
              onLoadTemplate={app.loadTemplate}
              onLoadSavedSystem={(sys) => app.importState(lib.loadSystem(app.state, sys))}
              onSaveSystem={(folderId, name, description) =>
                lib.saveSystem(app.state, folderId, name, description)
              }
              onRenameSystem={lib.renameSystem}
              onDeleteSystem={lib.deleteSystem}
              onMoveSystem={lib.moveSystem}
              onCreateFolder={lib.createFolder}
              onRenameFolder={lib.renameFolder}
              onDeleteFolder={lib.deleteFolder}
              onExportFolder={lib.exportFolder}
              onImportFolder={lib.importFolder}
            />
            <ParametresLauncher state={app.state} onPatch={app.patch} onSetPlayerCount={app.setPlayerCount} onAutoPositionOffBall={app.autoPositionOffBall} />
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      {showPlaybook && (
        <PlaybookView state={app.state} onClose={() => setShowPlaybook(false)} />
      )}
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

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .layout-grid {
          display: grid;
          grid-template-columns: 260px 1fr 300px;
          grid-template-rows: minmax(0, 1fr);
          gap: 10px;
          flex: 1;
          min-height: 0;
        }
        .layout-grid.presenting {
          grid-template-columns: 1fr;
        }
        .center-col {
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto auto;
          gap: 6px;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
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
          .layout-grid:not(.presenting) { grid-template-columns: 220px 1fr 260px; }
        }
        @media (max-width: 900px) {
          main { height: auto !important; max-height: none !important; overflow: auto !important; }
          .layout-grid { grid-template-columns: 1fr; grid-template-rows: auto; }
          .side-col { flex-direction: row; flex-wrap: wrap; }
        }
      `,
        }}
      />
    </main>
  );
}
