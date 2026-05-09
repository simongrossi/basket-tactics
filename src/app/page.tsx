'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useLibrary } from '@/hooks/useLibrary';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { OffensePanel } from '@/components/OffensePanel';
import { ScenarioPanel } from '@/components/ScenarioPanel';
import { ScenarioReader } from '@/components/ScenarioReader';
import { DefensePanel } from '@/components/DefensePanel';
import { FloatingActionsMenu } from '@/components/FloatingActionsMenu';
import { ParametresLauncher } from '@/components/ParametresLauncher';
import { LibraryPanel } from '@/components/LibraryPanel';
import { Timeline } from '@/components/Timeline';
import { CourtView } from '@/components/CourtView';
import { PlaybookView } from '@/components/PlaybookView';
import { MetricsBar } from '@/components/MetricsBar';
import { CoachDiagnostics } from '@/components/CoachDiagnostics';
import { effectiveDefensePositions, getDefenseHoop, detectStepScreenAction } from '@/lib/logic/engine';
import { computeMetrics } from '@/lib/logic/metrics';
import { evaluateOffensiveOptions, bestOffensiveAction } from '@/lib/logic/offense';
import { computeCoachDiagnostics } from '@/lib/logic/coachDiagnostics';
import { activeBallCarrier, activeOffense } from '@/lib/logic/players';
import type { AppState } from '@/lib/types';

export default function Page() {
  const app = useAppState();
  const lib = useLibrary();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackT, setPlaybackT] = useState<number | null>(null);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [scrubT, setScrubT] = useState<number | null>(null);
  const [playbackStartT, setPlaybackStartT] = useState(0);
  const [presentMode, setPresentMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            <OffensePanel
              state={app.state}
              onSetActiveStep={app.setActiveStep}
              onAddStep={app.addStep}
              onDuplicateStep={app.duplicateStep}
              onDeleteStep={app.deleteStep}
              onSetStepLabel={app.setStepLabel}
              onSetBallCarrier={app.setBallCarrier}
              onDeleteAnnotation={app.deleteAnnotation}
              tool={app.state.tool}
              onSetTool={app.setTool}
            />
            <ScenarioPanel
              scriptedActions={app.state.scriptedActions ?? []}
              playerCount={app.state.playerCount}
              onAddAction={app.addScriptedAction}
              onUpdateAction={app.updateScriptedAction}
              onDeleteAction={app.deleteScriptedAction}
              onMoveAction={app.moveScriptedAction}
              onClearAll={app.clearScriptedActions}
              onAddDefensiveAction={app.addDefensiveAction}
              onUpdateDefensiveAction={app.updateDefensiveAction}
              onDeleteDefensiveAction={app.deleteDefensiveAction}
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
            <ParametresLauncher state={app.state} onPatch={app.patch} onSetPlayerCount={app.setPlayerCount} />
          </div>
        )}

        <div className="center-col">
          <div style={{ position: 'relative', minHeight: 0, overflow: 'hidden', display: 'grid' }}>
            <CourtView
              state={app.state}
              onMoveAttacker={app.moveAttacker}
              onMoveDefender={app.moveDefender}
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
            />
            <FloatingActionsMenu
              presentMode={presentMode}
              onTogglePresentMode={() => setPresentMode((p) => !p)}
              onOpenPlaybook={() => setShowPlaybook(true)}
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
          {metrics && <MetricsBar metrics={metrics} bestAction={bestAction} screenAction={screenAction} />}
          <CoachDiagnostics diagnostics={coachDiagnostics} />
        </div>

        {!presentMode && (
          <div className="side-col">
            <DefensePanel
              state={app.state}
              onSetScreenRule={app.setScreenRule}
              onResetSwitches={app.resetSwitches}
              onPatch={app.patch}
              onUpdateRule={app.updateRule}
              onSetDefenseSystem={app.setDefenseSystem}
              onUpdateZoneConfig={app.updateZoneConfig}
              onApplyDefensePreset={app.applyDefensePreset}
              onClearAllDefenseOverrides={app.clearAllDefenseOverridesActiveStep}
              scriptedDefenseEnabled={app.state.defenseScriptedDirectivesEnabled}
              onToggleScriptedDefense={app.toggleScriptedDefense}
            />
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
