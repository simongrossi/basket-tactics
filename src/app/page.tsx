'use client';

import { useState, useRef, useCallback } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { OffensePanel } from '@/components/OffensePanel';
import { DefensePanel } from '@/components/DefensePanel';
import { Timeline } from '@/components/Timeline';
import { CourtView } from '@/components/CourtView';
import { PlaybookView } from '@/components/PlaybookView';
import type { AppState } from '@/lib/types';

export default function Page() {
  const app = useAppState();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [scrubT, setScrubT] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
        padding: '12px 16px 24px',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', margin: 0 }}>
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
          onPlayToggle={() => setIsPlaying((p) => !p)}
          onStop={() => {
            setIsPlaying(false);
            app.setActiveStep(0);
          }}
          isPlaying={isPlaying}
          tool={app.state.tool}
          onSetTool={app.setTool}
          playbackSpeed={playbackSpeed}
          onSetPlaybackSpeed={setPlaybackSpeed}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <CourtView
            state={app.state}
            onMoveAttacker={app.moveAttacker}
            onMoveDefender={app.moveDefender}
            onAddAnnotation={app.addAnnotation}
            onUpdateRule={app.updateRule}
            onSetTool={app.setTool}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            scrubT={scrubT}
            onPlaybackEnd={() => {
              setIsPlaying(false);
              app.setActiveStep(app.state.steps.length - 1);
            }}
          />
          <Timeline
            state={app.state}
            onSetActiveStep={app.setActiveStep}
            onScrub={setScrubT}
            isPlaying={isPlaying}
            scrubT={scrubT}
          />
        </div>

        <DefensePanel
          state={app.state}
          onSetScreenRule={app.setScreenRule}
          onResetSwitches={app.resetSwitches}
          onPatch={app.patch}
          onUpdateRule={app.updateRule}
          onSetDefenseSystem={app.setDefenseSystem}
          onUpdateZoneConfig={app.updateZoneConfig}
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
          align-items: start;
        }
        @media (max-width: 1100px) {
          .layout-grid { grid-template-columns: 240px 1fr 280px; }
        }
        @media (max-width: 900px) {
          .layout-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#fff',
  cursor: 'pointer',
  color: '#334155',
};
