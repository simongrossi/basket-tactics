'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { OffensePanel } from '@/components/OffensePanel';
import { DefensePanel } from '@/components/DefensePanel';
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
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          flex: '0 0 auto',
        }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
          🏀 Simulateur tactique basket
        </h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setShowPlaybook(true)} style={btnStyle}>📄 playbook PDF</button>
          <button onClick={handleExport} style={btnStyle}>exporter JSON</button>
          <button onClick={handleImport} style={btnStyle}>importer JSON</button>
          <button onClick={app.resetAll} style={{ ...btnStyle, color: '#b91c1c' }}>reset complet</button>
        </div>
      </header>

      <div className="layout-grid">
        <OffensePanel
          state={app.state}
          onSetActiveStep={app.setActiveStep}
          onAddStep={app.addStep}
          onDuplicateStep={app.duplicateStep}
          onDeleteStep={app.deleteStep}
          onSetStepLabel={app.setStepLabel}
          onSetBallCarrier={app.setBallCarrier}
          onLoadTemplate={app.loadTemplate}
          onPlayToggle={handlePlayToggle}
          onStop={() => {
            setIsPlaying(false);
            setPlaybackT(null);
            app.setActiveStep(0);
          }}
          isPlaying={isPlaying}
          tool={app.state.tool}
          onSetTool={app.setTool}
          playbackSpeed={playbackSpeed}
          onSetPlaybackSpeed={setPlaybackSpeed}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, minHeight: 0 }}>
          <CourtView
            state={app.state}
            onMoveAttacker={app.moveAttacker}
            onMoveDefender={app.moveDefender}
            onAddAnnotation={app.addAnnotation}
            onUpdateRule={app.updateRule}
            onClearDefenseOverride={app.clearDefenseOverride}
            onSetBallCarrier={app.setBallCarrier}
            onSetForcedScreener={app.setForcedScreener}
            onClearAnnotationsFor={app.clearAnnotationsFor}
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
          />
          {metrics && <MetricsBar metrics={metrics} />}
        </div>

        <DefensePanel
          state={app.state}
          onSetScreenRule={app.setScreenRule}
          onResetSwitches={app.resetSwitches}
          onPatch={app.patch}
          onUpdateRule={app.updateRule}
          onSetDefenseSystem={app.setDefenseSystem}
          onUpdateZoneConfig={app.updateZoneConfig}
          onApplyDefensePreset={app.applyDefensePreset}
        />
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

      <style>{`
        .layout-grid {
          display: grid;
          grid-template-columns: 280px 1fr 320px;
          gap: 12px;
          flex: 1;
          min-height: 0;
        }
        @media (max-width: 1100px) {
          .layout-grid { grid-template-columns: 240px 1fr 280px; }
        }
        @media (max-width: 900px) {
          main { height: auto !important; max-height: none !important; overflow: auto !important; }
          .layout-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid #e2e8f0',
  background: '#fff',
  cursor: 'pointer',
  color: '#334155',
  fontWeight: 500,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  transition: 'border-color 120ms, background 120ms',
};
