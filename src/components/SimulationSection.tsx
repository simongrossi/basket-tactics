'use client';

import { useState } from 'react';
import type { AppState, Step } from '@/lib/types';
import { Section, COLORS } from './ui';
import { effectiveDefensePositions, getDefenseHoop } from '@/lib/logic/engine';
import { simulatePossessions, type SimulationResult } from '@/lib/logic/simulator';
import { activeBallCarrier, activeOffense } from '@/lib/logic/players';
import { shotClockBand } from '@/lib/logic/timecode';
import {
  generateAiMatchSeries,
  type AiMatchSeries,
  type AiPossessionOutcome,
} from '@/lib/logic/match/aiPossession';
import { useMatchLoop, type UseMatchLoopResult } from '@/hooks/useMatchLoop';
import {
  compareCalibration,
  type CalibrationReport,
} from '@/lib/logic/match/calibration';
import {
  autoTuneCreativity,
  type AutoTuningResult,
} from '@/lib/logic/match/autoTuning';
import { MatchReplay } from './MatchReplay';

interface SimulationSectionProps {
  state: AppState;
  onLoadAiSteps?: (steps: Step[], startStepIndex: number) => void;
  /** B4 — partagé via page.tsx pour synchroniser CourtView et HUD live.
   *  Si absent, le composant instancie son propre hook (rétrocompat tests). */
  matchLoop?: UseMatchLoopResult;
  /** P3 B6 — vitesse de la game loop, modifiable en cours. */
  matchSpeed?: number;
  onSetMatchSpeed?: (speed: number) => void;
  /** Match plein écran : déclenche fullCourt + presentMode + browser
   *  fullscreen sur le terrain. Optionnel. */
  onEnterFullscreenMatch?: () => void;
  /** Phase 1.3 — Mode démo : lance 10 possessions en full court ×2
   *  speed en un clic. Cumule fullCourt + matchSpeed=2 + start(maxPossessions=10). */
  onStartDemoMode?: () => void;
}

const PRESET_RUNS = [50, 200, 1000];

const OUTCOME_LABELS: Record<keyof SimulationResult['outcomes'], string> = {
  'shot-made': 'tirs réussis',
  'shot-missed': 'tirs manqués',
  'turnover-pass': 'pertes (passe)',
  'turnover-drive': 'pertes (drive)',
  'forced-shot-made': 'tirs forcés réussis',
  'forced-shot-missed': 'tirs forcés manqués',
};

const AI_OUTCOME_LABELS: Record<AiPossessionOutcome, string> = {
  'shot-made': 'tir marqué',
  'shot-missed': 'tir raté',
  'turnover-pass': 'perte passe',
  'turnover-drive': 'perte drive',
  'turnover-clock': 'violation chrono',
  'forced-shot-made': 'tir forcé marqué',
  'forced-shot-missed': 'tir forcé raté',
  empty: 'sans action',
};

/**
 * Phase C : panneau Simulation Monte Carlo. Lance N possessions
 * stochastiques depuis l'état courant et affiche les stats agrégées
 * (PPP, eFG%, distribution des outcomes).
 *
 * La défense est figée pendant la simulation — limite assumée du MVP.
 * Les softmax(EV/τ=0.3) gouvernent les décisions offensives.
 */
export function SimulationSection({ state, onLoadAiSteps, matchLoop, matchSpeed, onSetMatchSpeed, onEnterFullscreenMatch, onStartDemoMode }: SimulationSectionProps) {
  const c = COLORS.defense;
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [aiSeries, setAiSeries] = useState<AiMatchSeries | null>(null);
  const [running, setRunning] = useState(false);
  const [runningAi, setRunningAi] = useState(false);

  const runSimulation = (runs: number) => {
    setRunning(true);
    // setTimeout pour libérer le thread UI le temps que le bouton "loading"
    // s'affiche. Pour 1000 runs c'est typiquement 50-200ms.
    setTimeout(() => {
      const step = state.steps[state.activeStep];
      if (!step) {
        setRunning(false);
        return;
      }
      const defPos = effectiveDefensePositions(state, state.activeStep);
      const r = simulatePossessions(
        activeOffense(step.off, state.playerCount),
        defPos,
        activeBallCarrier(step, state.playerCount),
        runs,
        getDefenseHoop(state)
      );
      setResult(r);
      setRunning(false);
    }, 0);
  };

  const runAiMode = () => {
    setRunningAi(true);
    setTimeout(() => {
      const series = generateAiMatchSeries(state, {
        possessions: 3,
        seed: Date.now(),
        creativity: 0.42,
      });
      setAiSeries(series);
      setRunningAi(false);
    }, 0);
  };

  return (
    <Section theme="defense" label="Simulation & IA">
      <div style={{ fontSize: 11, fontWeight: 700, color: c.accentText, marginBottom: 4 }}>
        Mode IA possession
      </div>
      <div style={{ fontSize: 10, color: '#475569', marginBottom: 6, lineHeight: 1.4 }}>
        Génère plusieurs possessions depuis l'état courant, puis charge une possession dans la timeline.
      </div>
      <button
        type="button"
        onClick={runAiMode}
        disabled={runningAi}
        style={{
          width: '100%',
          fontSize: 11,
          padding: '6px 0',
          borderRadius: 4,
          border: `1px solid ${c.border}`,
          background: runningAi ? '#f1f5f9' : '#eef2ff',
          color: runningAi ? '#94a3b8' : '#3730a3',
          cursor: runningAi ? 'wait' : 'pointer',
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        ▶ générer 3 possessions IA
      </button>
      {runningAi && (
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>
          IA en lecture…
        </div>
      )}
      {aiSeries && !runningAi && (
        <AiSeriesStats
          series={aiSeries}
          onLoadAiSteps={onLoadAiSteps}
        />
      )}

      <div style={{ height: 1, background: '#e2e8f0', margin: '10px 0 8px' }} />
      <LiveMatchPanel
        state={state}
        matchLoop={matchLoop}
        matchSpeed={matchSpeed}
        onSetMatchSpeed={onSetMatchSpeed}
        onEnterFullscreenMatch={onEnterFullscreenMatch}
        onStartDemoMode={onStartDemoMode}
      />

      <div style={{ height: 1, background: '#e2e8f0', margin: '10px 0 8px' }} />
      <CalibrationPanel state={state} />

      <div style={{ height: 1, background: '#e2e8f0', margin: '10px 0 8px' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: c.accentText, marginBottom: 4 }}>
        Monte Carlo
      </div>
      <div style={{ fontSize: 10, color: '#475569', marginBottom: 6, lineHeight: 1.4 }}>
        Lance N possessions stochastiques sur l'état courant. La défense est figée pendant la sim.
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {PRESET_RUNS.map((n) => (
          <button
            key={n}
            onClick={() => runSimulation(n)}
            disabled={running}
            style={{
              flex: 1,
              fontSize: 11,
              padding: '5px 0',
              borderRadius: 4,
              border: `1px solid ${c.border}`,
              background: running ? '#f1f5f9' : '#fff',
              color: running ? '#94a3b8' : c.accentText,
              cursor: running ? 'wait' : 'pointer',
              fontWeight: 500,
            }}
          >
            ▶ {n} runs
          </button>
        ))}
      </div>
      {result && !running && <SimulationStats result={result} />}
      {running && (
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
          Simulation en cours…
        </div>
      )}
    </Section>
  );
}

function AiSeriesStats({
  series,
  onLoadAiSteps,
}: {
  series: AiMatchSeries;
  onLoadAiSteps?: (steps: Step[], startStepIndex: number) => void;
}) {
  const pppColor = series.summary.ppp >= 1.1 ? '#dc2626' : series.summary.ppp >= 0.85 ? '#d97706' : '#16a34a';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Stat label="PPP IA" value={series.summary.ppp.toFixed(2)} color={pppColor} />
        <Stat label="pts" value={String(series.summary.totalPoints)} color="#475569" />
        <Stat label="pertes" value={String(series.summary.turnovers)} color="#dc2626" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {series.plans.map((plan) => (
          <div
            key={`${plan.possession}-${plan.seed}`}
            style={{
              padding: '6px',
              border: '1px solid #e2e8f0',
              borderRadius: 5,
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
                  P{plan.possession} · {AI_OUTCOME_LABELS[plan.outcome]} · {plan.points} pt
                </div>
                <div style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {plan.events.map((e) => e.label).join(' · ') || 'Aucune décision'}
                </div>
              </div>
              {onLoadAiSteps && (
                <button
                  type="button"
                  onClick={() => onLoadAiSteps(plan.steps, plan.generatedStartIndex)}
                  title="Charge cette possession dans la timeline pour la lire sur le terrain."
                  style={{
                    fontSize: 10,
                    padding: '4px 6px',
                    borderRadius: 4,
                    border: '1px solid #c7d2fe',
                    background: '#fff',
                    color: '#3730a3',
                    cursor: 'pointer',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  charger
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimulationStats({ result }: { result: SimulationResult }) {
  const pppColor = result.ppp >= 1.1 ? '#dc2626' : result.ppp >= 0.85 ? '#d97706' : '#16a34a';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Ligne PPP + eFG en grande typographie */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Stat label="PPP" value={result.ppp.toFixed(2)} color={pppColor} />
        <Stat
          label="eFG%"
          value={`${Math.round(result.efgPct * 100)}%`}
          color={result.efgPct >= 0.55 ? '#dc2626' : result.efgPct >= 0.45 ? '#d97706' : '#16a34a'}
        />
        <Stat
          label="score"
          value={`${Math.round(result.scoreRate * 100)}%`}
          color="#475569"
        />
      </div>
      {/* Distribution des outcomes */}
      <div style={{ fontSize: 10, color: '#475569' }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Distribution ({result.runs} possessions)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {(Object.keys(OUTCOME_LABELS) as Array<keyof SimulationResult['outcomes']>).map((k) => {
            const count = result.outcomes[k];
            if (count === 0) return null;
            const pct = (count / result.runs) * 100;
            const isMade = k.includes('made');
            const isTO = k.includes('turnover');
            const color = isMade ? '#16a34a' : isTO ? '#dc2626' : '#94a3b8';
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 4, height: 10, background: color, borderRadius: 1 }} />
                <span style={{ flex: 1 }}>{OUTCOME_LABELS[k]}</span>
                <span style={{ fontWeight: 600 }}>{count}</span>
                <span style={{ width: 38, textAlign: 'right', color: '#94a3b8' }}>
                  {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Phase I B1 — Panneau "▶ Play IA (live)". MVP minimal :
 *  - bouton démarrage
 *  - countdown shot clock
 *  - score live + outcome final quand la possession se termine
 *  - pause / reprise / stop
 *
 *  Le terrain affiché côté CourtView N'EST PAS encore synchronisé avec le
 *  matchState live (livré en B4 = UI complète). En attendant, ce panneau
 *  permet déjà de valider que le tick produit des outcomes cohérents. */
function LiveMatchPanel({
  state,
  matchLoop,
  matchSpeed,
  onSetMatchSpeed,
  onEnterFullscreenMatch,
  onStartDemoMode,
}: {
  state: AppState;
  matchLoop?: UseMatchLoopResult;
  matchSpeed?: number;
  onSetMatchSpeed?: (speed: number) => void;
  onEnterFullscreenMatch?: () => void;
  onStartDemoMode?: () => void;
}) {
  // Fallback : si pas de matchLoop fourni en prop (cas tests / usage local),
  // on instancie un hook local. Le code de page.tsx fournit toujours le prop
  // pour partager l'état avec CourtView.
  const fallbackLoop = useMatchLoop({ baseState: state });
  const { matchState, isRunning, start, pause, resume, stop } = matchLoop ?? fallbackLoop;
  // B3b — sélecteur du nombre de possessions (1, 3, 5, ∞). Lu seulement
  // au start (modifier la valeur en cours de jeu n'affecte pas la session
  // courante — il faut stop + start).
  const [maxPossessions, setMaxPossessions] = useState<number | null>(1);
  // P3.4 B7 — toggle de l'overlay replay post-match.
  const [showReplay, setShowReplay] = useState(false);

  const shotClockSec = matchState ? Math.max(0, matchState.shotClockMs / 1000) : 24;
  // B.2 — seuils unifiés via shotClockBand (timecode.ts).
  const shotClockColor = (() => {
    const band = shotClockBand(shotClockSec);
    return band === 'danger' ? '#dc2626' : band === 'warning' ? '#d97706' : '#16a34a';
  })();

  const outcomeLabel = matchState?.outcome ? AI_OUTCOME_LABELS[matchState.outcome] : null;
  // B3b — distinguer "possession terminée" et "session terminée".
  // En multi-possessions, on continue automatiquement après chaque possession.
  // isFinished = session entière terminée (maxPossessions atteint).
  const isSessionDone =
    matchState != null &&
    matchState.outcome != null &&
    matchState.maxPossessions != null &&
    matchState.possessionsPlayed >= matchState.maxPossessions;
  const isFinished = isSessionDone;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', marginBottom: 4 }}>
        Play IA (live)
      </div>
      <div style={{ fontSize: 10, color: '#475569', marginBottom: 6, lineHeight: 1.4 }}>
        Lance une possession simulée tick par tick (5 Hz). MVP B1 — le terrain n'est pas encore
        synchronisé (B4) ; on observe le shot clock + outcome.
      </div>

      {/* Phase 1.3 — Bouton Mode démo 1-click : 10 possessions, full court, ×2 speed */}
      {!matchState && onStartDemoMode && (
        <button
          type="button"
          onClick={onStartDemoMode}
          style={{
            width: '100%',
            padding: '6px 8px',
            marginBottom: 8,
            border: '1px solid #4338ca',
            borderRadius: 4,
            background: 'linear-gradient(180deg, #6366f1, #4338ca)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(67, 56, 202, 0.3)',
          }}
          title="10 possessions enchaînées, terrain complet, vitesse ×2"
        >
          ▶ Mode démo (regarder un match)
        </button>
      )}

      {/* B3b — sélecteur de longueur de session, visible quand pas en cours */}
      {!matchState && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#64748b', flex: '0 0 60px' }}>POSSESSIONS</span>
          {[1, 3, 5, null].map((n) => (
            <button
              key={n ?? 'inf'}
              type="button"
              onClick={() => setMaxPossessions(n)}
              style={{
                flex: 1,
                fontSize: 10,
                padding: '3px 4px',
                borderRadius: 3,
                border: '1px solid',
                borderColor: maxPossessions === n ? '#4338ca' : '#cbd5e1',
                background: maxPossessions === n ? '#eef2ff' : '#fff',
                color: maxPossessions === n ? '#3730a3' : '#64748b',
                cursor: 'pointer',
                fontWeight: maxPossessions === n ? 700 : 500,
              }}
            >
              {n ?? '∞'}
            </button>
          ))}
        </div>
      )}

      {/* P3 B6 — sélecteur de vitesse, modifiable même en cours */}
      {onSetMatchSpeed && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#64748b', flex: '0 0 60px' }}>VITESSE</span>
          {[1, 2, 4, 8].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSetMatchSpeed(s)}
              style={{
                flex: 1,
                fontSize: 10,
                padding: '3px 4px',
                borderRadius: 3,
                border: '1px solid',
                borderColor: (matchSpeed ?? 1) === s ? '#16a34a' : '#cbd5e1',
                background: (matchSpeed ?? 1) === s ? '#dcfce7' : '#fff',
                color: (matchSpeed ?? 1) === s ? '#166534' : '#64748b',
                cursor: 'pointer',
                fontWeight: (matchSpeed ?? 1) === s ? 700 : 500,
              }}
            >
              ×{s}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {!matchState && (
          <button
            type="button"
            onClick={() => start({ maxPossessions })}
            style={liveButtonStyle('start')}
          >
            ▶ démarrer
          </button>
        )}
        {matchState && isRunning && !isFinished && (
          <button type="button" onClick={pause} style={liveButtonStyle('pause')}>
            ⏸ pause
          </button>
        )}
        {matchState && !isRunning && !isFinished && (
          <button type="button" onClick={resume} style={liveButtonStyle('start')}>
            ▶ reprendre
          </button>
        )}
        {matchState && (
          <button type="button" onClick={stop} style={liveButtonStyle('stop')}>
            ⏹ stop
          </button>
        )}
        {matchState && onEnterFullscreenMatch && (
          <button
            type="button"
            onClick={onEnterFullscreenMatch}
            title="Match plein écran : active terrain complet + présentation + fullscreen navigateur"
            style={{
              flex: '0 0 auto',
              fontSize: 11,
              padding: '5px 8px',
              borderRadius: 4,
              border: '1px solid #4338ca',
              background: '#eef2ff',
              color: '#3730a3',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            🔳 plein écran
          </button>
        )}
      </div>

      {matchState && (
        <>
          {/* E.1 V1 — tableau score home / away avec indicateur d'attaque */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '6px 8px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 5,
              fontSize: 11,
              color: '#1e293b',
              marginBottom: 4,
            }}
          >
            <div
              style={{
                flex: 1,
                padding: 4,
                borderRadius: 4,
                background: matchState.attackingTeam === 'home' ? '#dbeafe' : 'transparent',
                border: matchState.attackingTeam === 'home' ? '1px solid #3b82f6' : '1px solid transparent',
              }}
            >
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>
                {matchState.attackingTeam === 'home' ? '▶ HOME' : 'HOME'}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1e3a8a', lineHeight: 1.1 }}>
                {matchState.homeScore}
                {matchState.score > 0 && matchState.attackingTeam === 'home' && !isFinished && (
                  <span style={{ fontSize: 10, color: '#16a34a', marginLeft: 3 }}>+{matchState.score}</span>
                )}
              </div>
            </div>
            <div
              style={{
                flex: 1,
                padding: 4,
                borderRadius: 4,
                background: matchState.attackingTeam === 'away' ? '#fee2e2' : 'transparent',
                border: matchState.attackingTeam === 'away' ? '1px solid #dc2626' : '1px solid transparent',
              }}
            >
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>
                {matchState.attackingTeam === 'away' ? '▶ AWAY' : 'AWAY'}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#991b1b', lineHeight: 1.1 }}>
                {matchState.awayScore}
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '6px 8px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 5,
              fontSize: 11,
              color: '#1e293b',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>
                {matchState.inboundTimerMs !== null ? '⏱ remise 5s' : 'shot clock'}
              </div>
              {matchState.inboundTimerMs !== null ? (
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: matchState.inboundTimerMs <= 2000 ? '#dc2626' : '#d97706',
                    lineHeight: 1.1,
                  }}
                >
                  {(matchState.inboundTimerMs / 1000).toFixed(1)}
                  <span style={{ fontSize: 10, color: '#94a3b8' }}> s</span>
                </div>
              ) : (
                <div style={{ fontSize: 18, fontWeight: 700, color: shotClockColor, lineHeight: 1.1 }}>
                  {shotClockSec.toFixed(1)}
                  <span style={{ fontSize: 10, color: '#94a3b8' }}> s</span>
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>possession</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#7c2d12', lineHeight: 1.1 }}>
                {matchState.possession}
                {matchState.maxPossessions !== null && (
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>/{matchState.maxPossessions}</span>
                )}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>
                {matchState.attackingTeam === 'home' ? 'porteur' : 'phase'}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#7c2d12', lineHeight: 1.1 }}>
                {matchState.attackingTeam === 'home' ? matchState.carrier : '🛡 def'}
              </div>
            </div>
          </div>
          {/* B2 — indicateur d'activité off-ball */}
          {(() => {
            const active = Object.entries(matchState.offBallIntents).filter(
              ([, intent]) => intent && intent.kind !== 'idle'
            );
            if (active.length === 0) return null;
            return (
              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {active.map(([id, intent]) => (
                  <span
                    key={id}
                    style={{
                      fontSize: 9,
                      padding: '2px 5px',
                      borderRadius: 3,
                      background:
                        intent!.kind === 'cut'
                          ? '#fee2e2'
                          : intent!.kind === 'relocate'
                            ? '#fef3c7'
                            : '#e0f2fe',
                      color:
                        intent!.kind === 'cut'
                          ? '#991b1b'
                          : intent!.kind === 'relocate'
                            ? '#92400e'
                            : '#075985',
                      fontWeight: 600,
                    }}
                  >
                    {id} {intent!.kind}
                  </span>
                ))}
              </div>
            );
          })()}
        </>
      )}

      {/* B4 — live event feed : 5 derniers événements de la possession en cours */}
      {matchState && matchState.eventLog.length > 0 && (
        <div
          style={{
            marginTop: 6,
            padding: '5px 8px',
            background: '#fafafa',
            border: '1px solid #e2e8f0',
            borderRadius: 5,
            fontSize: 10,
            color: '#475569',
            maxHeight: 100,
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
            événements ({matchState.eventLog.length})
          </div>
          {[...matchState.eventLog]
            .slice(-5)
            .reverse()
            .map((event, i) => (
              <div
                key={`${event.clock}-${i}`}
                style={{
                  display: 'flex',
                  gap: 6,
                  padding: '2px 0',
                  borderBottom: i < 4 ? '1px solid #f1f5f9' : 'none',
                }}
              >
                <span style={{ flex: '0 0 32px', color: '#94a3b8', fontFamily: 'monospace' }}>
                  {event.clock.toFixed(1)}s
                </span>
                <span style={{ flex: 1 }}>{event.label}</span>
              </div>
            ))}
        </div>
      )}

      {isFinished && outcomeLabel && (
        <div
          style={{
            marginTop: 6,
            padding: '5px 8px',
            background: '#eef2ff',
            border: '1px solid #c7d2fe',
            borderRadius: 5,
            fontSize: 11,
            color: '#3730a3',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
          {outcomeLabel} · {matchState!.tickCount} ticks · {(matchState!.possessionTimeMs / 1000).toFixed(1)}s
        </div>
      )}

      {/* P3.4 B7 — bouton replay quand session terminée + eventLog non vide */}
      {isFinished && matchState && matchState.eventLog.length > 0 && (
        <button
          type="button"
          onClick={() => setShowReplay(true)}
          style={{
            width: '100%',
            marginTop: 4,
            fontSize: 11,
            padding: '5px 8px',
            borderRadius: 4,
            border: '1px solid #4338ca',
            background: '#eef2ff',
            color: '#3730a3',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          📼 voir replay détaillé ({matchState.eventLog.length} events)
        </button>
      )}
      {showReplay && (
        <MatchReplay matchState={matchState} onClose={() => setShowReplay(false)} />
      )}

      {/* B3a — affiche le label enrichi du tir final (zone + contestation) */}
      {isFinished && matchState && (() => {
        const shotEvent = [...matchState.eventLog]
          .reverse()
          .find((e) => e.type === 'shot' || e.type === 'forced-shot');
        if (!shotEvent) return null;
        return (
          <div
            style={{
              marginTop: 4,
              padding: '4px 8px',
              fontSize: 10,
              color: '#475569',
              fontStyle: 'italic',
              textAlign: 'center',
            }}
          >
            {shotEvent.label}
          </div>
        );
      })()}
    </div>
  );
}

/** Phase I B5 — panneau de calibration live vs Monte-Carlo. Bouton qui
 *  lance N possessions headless via la game loop + N runs Monte-Carlo
 *  et compare les PPP. Affiche un verdict + suggestions. */
function CalibrationPanel({ state }: { state: AppState }) {
  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [runCount, setRunCount] = useState(50);
  const [tuning, setTuning] = useState<AutoTuningResult | null>(null);
  const [autoTuning, setAutoTuning] = useState(false);

  const onCalibrate = () => {
    setRunning(true);
    setReport(null);
    // Wrapper async pour laisser l'UI re-render sur "running".
    // setTimeout 0 = next macrotask.
    setTimeout(() => {
      try {
        const r = compareCalibration(state, runCount, { seed: Date.now() });
        setReport(r);
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', marginBottom: 4 }}>
        Calibration live vs Monte-Carlo
      </div>
      <div style={{ fontSize: 10, color: '#475569', marginBottom: 6, lineHeight: 1.4 }}>
        Compare la PPP de la game loop live à celle du simulator Monte-Carlo sur le
        même état. Cible : Δ ≤ 0.15.
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: '#64748b', flex: '0 0 50px' }}>RUNS</span>
        {[20, 50, 100].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRunCount(n)}
            disabled={running}
            style={{
              flex: 1,
              fontSize: 10,
              padding: '3px 4px',
              borderRadius: 3,
              border: '1px solid',
              borderColor: runCount === n ? '#4338ca' : '#cbd5e1',
              background: runCount === n ? '#eef2ff' : '#fff',
              color: runCount === n ? '#3730a3' : '#64748b',
              cursor: running ? 'wait' : 'pointer',
              fontWeight: runCount === n ? 700 : 500,
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          type="button"
          onClick={onCalibrate}
          disabled={running || autoTuning}
          style={{
            flex: 2,
            fontSize: 11,
            padding: '5px 8px',
            borderRadius: 4,
            border: '1px solid #4338ca',
            background: running ? '#f1f5f9' : '#eef2ff',
            color: running ? '#94a3b8' : '#3730a3',
            cursor: running ? 'wait' : 'pointer',
            fontWeight: 600,
          }}
        >
          🔍 {running ? '…' : `mesurer (${runCount} ×2)`}
        </button>
        <button
          type="button"
          onClick={() => {
            setAutoTuning(true);
            setTuning(null);
            setReport(null);
            setTimeout(() => {
              try {
                const result = autoTuneCreativity(state, {
                  runsPerStep: Math.min(50, runCount),
                  seed: Date.now(),
                });
                setTuning(result);
              } finally {
                setAutoTuning(false);
              }
            }, 0);
          }}
          disabled={running || autoTuning}
          title="Lance une dichotomie sur creativity (8 itérations max) jusqu'à |Δ PPP| ≤ 0.15"
          style={{
            flex: 1,
            fontSize: 11,
            padding: '5px 8px',
            borderRadius: 4,
            border: '1px solid #16a34a',
            background: autoTuning ? '#f1f5f9' : '#dcfce7',
            color: autoTuning ? '#94a3b8' : '#166534',
            cursor: autoTuning ? 'wait' : 'pointer',
            fontWeight: 600,
          }}
        >
          🎯 {autoTuning ? 'tuning…' : 'auto-tune'}
        </button>
      </div>

      {tuning && (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              padding: '6px 8px',
              borderRadius: 5,
              background: tuning.converged ? '#dcfce7' : '#fef3c7',
              border: `1px solid ${tuning.converged ? '#86efac' : '#fcd34d'}`,
              fontSize: 11,
              color: tuning.converged ? '#166534' : '#92400e',
              fontWeight: 600,
            }}
          >
            {tuning.converged ? '🎯 Auto-tune converge' : '⚠ Auto-tune ne converge pas'}
            <span style={{ fontWeight: 400, marginLeft: 4 }}>
              ({tuning.iterations} itérations)
            </span>
          </div>
          <div
            style={{
              marginTop: 6,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 4,
              fontSize: 10,
            }}
          >
            <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 9, color: '#64748b' }}>BEST CREATIVITY</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a' }}>
                {tuning.bestCreativity.toFixed(2)}
              </div>
            </div>
            <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 9, color: '#64748b' }}>Δ PPP RESTANT</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: Math.abs(tuning.bestDelta) <= 0.15 ? '#16a34a' : '#dc2626' }}>
                {tuning.bestDelta >= 0 ? '+' : ''}
                {tuning.bestDelta.toFixed(2)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 4, fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>
            Historique : {tuning.history.map((h) => `${h.creativity.toFixed(2)}→Δ${h.deltaPpp >= 0 ? '+' : ''}${h.deltaPpp.toFixed(2)}`).join(' · ')}
          </div>
        </div>
      )}

      {report && (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              padding: '6px 8px',
              borderRadius: 5,
              background: report.withinTolerance ? '#dcfce7' : '#fee2e2',
              border: `1px solid ${report.withinTolerance ? '#86efac' : '#fca5a5'}`,
              fontSize: 11,
              color: report.withinTolerance ? '#166534' : '#991b1b',
              fontWeight: 600,
            }}
          >
            {report.withinTolerance ? '✓ calibration OK' : '⚠ calibration hors tolérance'}
            <span style={{ fontWeight: 400, marginLeft: 4 }}>
              (Δ PPP = {report.delta.ppp >= 0 ? '+' : ''}
              {report.delta.ppp.toFixed(2)})
            </span>
          </div>

          <div
            style={{
              marginTop: 6,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 4,
              fontSize: 10,
            }}
          >
            <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 9, color: '#64748b' }}>LIVE PPP</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a' }}>
                {report.liveStats.ppp.toFixed(2)}
              </div>
            </div>
            <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 9, color: '#64748b' }}>SIM PPP</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a' }}>
                {report.simulatorStats.ppp.toFixed(2)}
              </div>
            </div>
            <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 9, color: '#64748b' }}>Δ eFG%</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a' }}>
                {(report.delta.efgPct * 100).toFixed(1)}
              </div>
            </div>
          </div>

          {report.suggestions.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#475569' }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Suggestions :</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {report.suggestions.map((s, i) => (
                  <li key={i} style={{ lineHeight: 1.3, marginBottom: 2 }}>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div
            style={{
              marginTop: 6,
              fontSize: 9,
              color: '#94a3b8',
              fontStyle: 'italic',
            }}
          >
            Stats live : {report.liveStats.liveOnlyStats.avgPossessionDurationS.toFixed(1)}s /poss,{' '}
            {report.liveStats.liveOnlyStats.cutsTriggeredPerPossession.toFixed(2)} cuts /poss,{' '}
            {report.liveStats.liveOnlyStats.offensiveReboundsObserved} reb. off observés
          </div>
        </div>
      )}
    </div>
  );
}

function liveButtonStyle(kind: 'start' | 'pause' | 'stop') {
  const palette = {
    start: { bg: '#eef2ff', border: '#4338ca', color: '#3730a3' },
    pause: { bg: '#fef3c7', border: '#d97706', color: '#92400e' },
    stop: { bg: '#fee2e2', border: '#dc2626', color: '#991b1b' },
  }[kind];
  return {
    flex: 1,
    fontSize: 11,
    padding: '5px 8px',
    borderRadius: 4,
    border: `1px solid ${palette.border}`,
    background: palette.bg,
    color: palette.color,
    cursor: 'pointer' as const,
    fontWeight: 600,
  };
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '6px 4px',
        borderRadius: 5,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
      }}
    >
      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1.1, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
