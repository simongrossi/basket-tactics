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
import Link from 'next/link';
import { useAppState } from '@/hooks/useAppState';
import { useMatchLoop } from '@/hooks/useMatchLoop';
import { SimulationSection } from '@/components/SimulationSection';
import { CourtView } from '@/components/CourtView';
import { LiveMatchOverlay } from '@/components/LiveMatchOverlay';
import { MiniBoxScore } from '@/components/MiniBoxScore';
import type { Step } from '@/lib/types';

export default function SimulationPage() {
  const app = useAppState();
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
      className="bt-force-dark"
      style={{
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        background: '#0f172a',
        padding: '8px 12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        color: '#e5e7eb',
      }}
    >
      {/* Header : lien retour + titre */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '6px 12px',
          background: '#1e293b',
          borderRadius: 6,
          flexShrink: 0,
        }}
      >
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            background: '#334155',
            color: '#cbd5e1',
            borderRadius: 4,
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          ← Éditeur
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', letterSpacing: 0.5 }}>
          🎬 Simulation
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>
          Mode démo · Play IA live · Monte Carlo · Replay
        </div>
      </header>

      {/* Layout principal : terrain à gauche, contrôles à droite */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: 10,
          minHeight: 0,
        }}
      >
        {/* Terrain */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            background: '#1e293b',
            borderRadius: 6,
            overflow: 'auto',
            padding: 8,
          }}
        >
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

        {/* Panneau simulation à droite */}
        <aside
          style={{
            background: '#f8fafc',
            color: '#1e293b',
            borderRadius: 6,
            padding: 12,
            overflowY: 'auto',
          }}
        >
          <SimulationSection
            state={app.state}
            onLoadAiSteps={handleLoadAiSteps}
            matchLoop={matchLoop}
            matchSpeed={matchSpeed}
            onSetMatchSpeed={setMatchSpeed}
            onEnterFullscreenMatch={handleEnterFullscreenMatch}
            onStartDemoMode={handleStartDemoMode}
          />
        </aside>
      </div>
    </main>
  );
}
