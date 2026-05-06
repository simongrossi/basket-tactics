'use client';

import { useState, useRef, useCallback } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { ControlPanel } from '@/components/ControlPanel';
import { CourtView } from '@/components/CourtView';
import { PlaybookView } from '@/components/PlaybookView';
import type { Tool, AppState } from '@/lib/types';

const TOOLS: { value: Tool; label: string }[] = [
  { value: 'move', label: 'déplacer' },
  { value: 'pass', label: 'passe' },
  { value: 'dribble', label: 'dribble' },
  { value: 'cut', label: 'course' },
  { value: 'screen', label: 'écran' },
];

function ToolIcon({ tool }: { tool: Tool }) {
  const stroke = 'currentColor';
  switch (tool) {
    case 'move':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2 v12 M2 8 h12 M5 5 L2 8 L5 11 M11 5 L14 8 L11 11 M5 5 L8 2 L11 5 M5 11 L8 14 L11 11" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'pass':
      return (
        <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
          <line x1="1" y1="6" x2="15" y2="6" stroke={stroke} strokeWidth="1.6" strokeDasharray="2 2.5" strokeLinecap="round" />
          <path d="M14 2 L18 6 L14 10" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'dribble':
      return (
        <svg width="22" height="12" viewBox="0 0 22 12" fill="none">
          <path d="M1 6 Q3.5 1 6 6 T11 6 T16 6" stroke={stroke} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M16 2 L20 6 L16 10" stroke={stroke} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'cut':
      return (
        <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
          <line x1="1" y1="6" x2="15" y2="6" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M14 2 L18 6 L14 10" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'screen':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line x1="8" y1="2" x2="8" y2="11" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
          <line x1="3" y1="12" x2="13" y2="12" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
  }
}

export default function Page() {
  const app = useAppState();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showPlaybook, setShowPlaybook] = useState(false);
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
        } catch (err) {
          alert('JSON invalide');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [app]
  );

  return (
    <main style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 16 }}>
        Simulateur tactique basket
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 12 }}>
        <ControlPanel
          state={app.state}
          onSetActiveStep={app.setActiveStep}
          onAddStep={app.addStep}
          onDuplicateStep={app.duplicateStep}
          onDeleteStep={app.deleteStep}
          onSetScreenRule={app.setScreenRule}
          onResetSwitches={app.resetSwitches}
          onResetAll={app.resetAll}
          onPatch={app.patch}
          onUpdateRule={app.updateRule}
          onPlayToggle={() => setIsPlaying((p) => !p)}
          onStop={() => {
            setIsPlaying(false);
            app.setActiveStep(0);
          }}
          isPlaying={isPlaying}
          onExport={handleExport}
          onImport={handleImport}
          onSetDefenseSystem={app.setDefenseSystem}
          onUpdateZoneConfig={app.updateZoneConfig}
          onSetStepLabel={app.setStepLabel}
          onSetBallCarrier={app.setBallCarrier}
          onLoadTemplate={app.loadTemplate}
          onOpenPlaybook={() => setShowPlaybook(true)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#666' }}>outil :</span>
            {TOOLS.map((t) => (
              <button
                key={t.value}
                onClick={() => app.setTool(t.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  background: app.state.tool === t.value ? '#dbeafe' : 'transparent',
                  color: app.state.tool === t.value ? '#1e40af' : '#111',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <ToolIcon tool={t.value} />
                {t.label}
              </button>
            ))}
            <span style={{ fontSize: 12, color: '#666', marginLeft: 12 }}>vitesse</span>
            <input
              type="range"
              min={0.3}
              max={2}
              step={0.1}
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              style={{ width: 100 }}
            />
            <span style={{ fontSize: 12 }}>{playbackSpeed.toFixed(1)}×</span>
          </div>
          <CourtView
            state={app.state}
            onMoveAttacker={app.moveAttacker}
            onMoveDefender={app.moveDefender}
            onAddAnnotation={app.addAnnotation}
            onUpdateRule={app.updateRule}
            onSetTool={app.setTool}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            onPlaybackEnd={() => {
              setIsPlaying(false);
              app.setActiveStep(app.state.steps.length - 1);
            }}
          />
        </div>
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
    </main>
  );
}
