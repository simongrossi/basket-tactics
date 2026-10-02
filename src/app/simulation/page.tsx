'use client';

// Phase 1.6 — Page dédiée /simulation pour les contrôles de match IA :
// - ▶ Mode démo 1-click (10 possessions, full court, ×2)
// - Play IA (live) avec sélecteur possessions + speed
// - Monte Carlo (50/200/1000 runs)
// - Génération AI possessions (loadAiSteps)
// - Replay post-match
//
// State partagé avec / via localStorage (useAppState auto-persiste).
// La page démarre toujours en fullCourt + presentMode pour mettre en
// avant le mode match plein écran.

import { useState, useCallback, useEffect } from 'react';
import { AppTopBar } from '@/components/sidebar/AppTopBar';
import { ToolsScopeStyle } from '@/components/sidebar/Sidebar';
import { useTheme } from '@/hooks/useTheme';
import type { SidebarView } from '@/hooks/useSidebarState';
import { useAppState } from '@/hooks/useAppState';
import { useMatchLoop } from '@/hooks/useMatchLoop';
import { SimulationSection } from '@/components/SimulationSection';
import { CourtView } from '@/components/CourtView';
import { LiveMatchOverlay } from '@/components/LiveMatchOverlay';
import { MiniBoxScore } from '@/components/MiniBoxScore';
import type { Step } from '@/lib/types';

export default function SimulationPage() {
  const app = useAppState();
  const theme = useTheme();
  // Retour dans l'éditeur sur la vue choisie (préférence lue par useSidebarState).
  const openEditorView = useCallback((view: SidebarView) => {
    try {
      const key = 'bt:sidebar:v1';
      const saved = JSON.parse(window.localStorage.getItem(key) ?? '{}');
      window.localStorage.setItem(key, JSON.stringify({ ...saved, activeView: view }));
    } catch { /* stockage indisponible : l'éditeur s'ouvre sur sa dernière vue */ }
    window.location.href = '/';
  }, []);
  const [matchSpeed, setMatchSpeed] = useState(1);
  const matchLoop = useMatchLoop({ baseState: app.state, speed: matchSpeed });
  const [presentMode, setPresentMode] = useState(false);

  // Forcer fullCourt à l'arrivée sur la page (mode match)
  useEffect(() => {
    if (!app.state.fullCourt) {
      app.patch({ fullCourt: true });
    }
  }, [app]);

  const handleEnterFullscreenMatch = useCallback(() => {
    if (!app.state.fullCourt) {
      app.patch({ fullCourt: true });
    }
    setPresentMode(true);
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

  const handleStartDemoMode = useCallback(() => {
    handleEnterFullscreenMatch();
    setMatchSpeed(2);
    matchLoop.start({ maxPossessions: 10 });
  }, [handleEnterFullscreenMatch, matchLoop]);

  const handleLoadAiSteps = useCallback((steps: Step[], startStepIndex: number) => {
    app.patch({
      steps: structuredClone(steps),
      activeStep: startStepIndex,
    });
  }, [app]);

  // No-op handlers pour CourtView (page read-only, pas d'édition ici)
  const noop = useCallback(() => {}, []);
  const noopWithArgs = useCallback((..._args: unknown[]) => {}, []);

  return (
    <main
      style={{
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        background: 'var(--bt-bg)',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--bt-text)',
      }}
    >
      <ToolsScopeStyle />
      {!presentMode && <AppTopBar activeView="simulation" onSelectView={openEditorView} theme={theme} onHome={() => openEditorView('court')} />}

      {/* Terrain au centre, contrôles de simulation dans la colonne de droite */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'grid', background: 'var(--bt-canvas)', padding: '10px 12px' }}>
        <div className="bt-force-dark" style={{ position: 'relative', minHeight: 0, display: 'grid', overflow: 'hidden' }}>
          {matchLoop.matchState && (
            <LiveMatchOverlay
              matchState={matchLoop.matchState}
              onStop={matchLoop.stop}
              onExitPresent={handleExitFullscreenMatch}
            />
          )}
          {matchLoop.matchState && (
            <MiniBoxScore matchState={matchLoop.matchState} />
          )}
          <CourtView
            readOnly
            state={app.state}
            onMoveAttacker={noopWithArgs}
            onMoveDefender={noopWithArgs}
            onAddAnnotation={noopWithArgs}
            onAddTextNote={noopWithArgs}
            onUpdateTextNote={noopWithArgs}
            onRemoveTextNote={noopWithArgs}
            onUpdateRule={noopWithArgs}
            onApplyDefenderProfile={noopWithArgs}
            onClearDefenseOverride={noopWithArgs}
            onSetBallCarrier={noopWithArgs}
            onSetForcedScreener={noopWithArgs}
            onClearAnnotationsFor={noopWithArgs}
            onSetAttackerHand={noopWithArgs}
            onSetAttackerProfile={noopWithArgs}
            onSetAttackerSpeedTier={noopWithArgs}
            onSetAttackerOrientation={noopWithArgs}
            onSetZoneOverride={noopWithArgs}
            onClearZoneOverride={noopWithArgs}
            onSetPlayerName={noopWithArgs}
            onSetPlayerNumber={noopWithArgs}
            onDeleteAnnotation={noopWithArgs}
            onSetAnnotationFrom={noopWithArgs}
            onSetAnnotationTo={noopWithArgs}
            onSetAnnotationWaypoint={noopWithArgs}
            onSetTool={noopWithArgs}
            isPlaying={false}
            playbackSpeed={1}
            liveMatchState={matchLoop.matchState}
          />
        </div>

        </div>
        {!presentMode && (
        <aside className="bt-panel bt-panel-right" style={{ width: 340, flexBasis: 340 }} aria-label="Simulation">
          <header className="bt-panel-head">
            <h2>Match simulé</h2>
          </header>
          <div className="bt-panel-body sidebar-tools-scope">
          <SimulationSection
            open
            state={app.state}
            onLoadAiSteps={handleLoadAiSteps}
            matchLoop={matchLoop}
            matchSpeed={matchSpeed}
            onSetMatchSpeed={setMatchSpeed}
            onEnterFullscreenMatch={handleEnterFullscreenMatch}
            onStartDemoMode={handleStartDemoMode}
          />
          </div>
        </aside>
        )}
      </div>
    </main>
  );
}
