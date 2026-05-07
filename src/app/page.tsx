'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { OffensePanel } from '@/components/OffensePanel';
import { DefensePanel } from '@/components/DefensePanel';
import { ActionsPanel } from '@/components/ActionsPanel';
import { ParametresPanel } from '@/components/ParametresPanel';
import { LibraryPanel } from '@/components/LibraryPanel';
import { Timeline } from '@/components/Timeline';
import { CourtView } from '@/components/CourtView';
import { PlaybookView } from '@/components/PlaybookView';
import { MetricsBar } from '@/components/MetricsBar';
import { effectiveDefensePositions, getDefenseHoop } from '@/lib/logic/engine';
import { computeMetrics } from '@/lib/logic/metrics';
import type { AppState } from '@/lib/types';

export default function Page() {
  const app = useAppState();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackT, setPlaybackT] = useState<number | null>(null);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [scrubT, setScrubT] = useState<number | null>(null);
  const [presentMode, setPresentMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const metrics = useMemo(() => {
    const step = app.state.steps[app.state.activeStep];
    if (!step) return null;
    const defPos = effectiveDefensePositions(app.state, app.state.activeStep);
    return computeMetrics(step.off, defPos, step.ballCarrier, getDefenseHoop(app.state));
  }, [app.state]);

  const handlePlayToggle = useCallback(() => {
    setIsPlaying((p) => !p);
    setPlaybackT(null);
  }, []);

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
            <LibraryPanel state={app.state} onLoadTemplate={app.loadTemplate} />
            <ActionsPanel
              presentMode={presentMode}
              onTogglePresentMode={() => setPresentMode((p) => !p)}
              onOpenPlaybook={() => setShowPlaybook(true)}
              onExport={handleExport}
              onImport={handleImport}
              onReset={app.resetAll}
            />
          </div>
        )}

        <div className="center-col">
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
            onSetZoneOverride={app.setZoneOverride}
            onClearZoneOverride={app.clearZoneOverride}
            onDeleteAnnotation={app.deleteAnnotation}
            onSetTool={app.setTool}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            scrubT={scrubT}
            onPlaybackTick={setPlaybackT}
            onPlaybackEnd={() => {
              setIsPlaying(false);
              setPlaybackT(null);
              app.setActiveStep(app.state.steps.length - 1);
            }}
          />
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
              app.setActiveStep(0);
            }}
            playbackSpeed={playbackSpeed}
            onSetPlaybackSpeed={setPlaybackSpeed}
          />
          {metrics && <MetricsBar metrics={metrics} />}
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
            />
            <ParametresPanel state={app.state} onPatch={app.patch} />
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
          overflow: hidden;
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

