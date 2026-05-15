'use client';

import { useState, useMemo } from 'react';
import type { AppState, ScenarioBranch, Step } from '@/lib/types';
import { StepThumbnail } from './StepThumbnail';
import { compileScenario } from '@/lib/logic/compileScenario';
import { getSecondsPerStep, formatClock } from '@/lib/logic/timecode';
import { computePlayerTracks, ACTIVITY_COLORS } from '@/lib/logic/playerTracks';
import { annotationSummary } from '@/lib/logic/pdfRecap';

interface PlaybookViewProps {
  state: AppState;
  title?: string;
  onClose: () => void;
  /**
   * Mode d'affichage. 'modal' (défaut, rétrocompatible) = overlay fixed
   * plein écran ; 'inline' = rendu dans le flux du parent (refonte UI :
   * vue routée depuis la sidebar gauche).
   */
  mode?: 'modal' | 'inline';
}

export function PlaybookView({ state, title, onClose, mode = 'modal' }: PlaybookViewProps) {
  const [columns, setColumns] = useState(2);
  const [showDefense, setShowDefense] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [docTitle, setDocTitle] = useState(title ?? 'Playbook');
  const [includeBranches, setIncludeBranches] = useState(state.pdfIncludeBranches ?? false);
  const [showMultiTrack, setShowMultiTrack] = useState(true);

  // Compile chaque branche pour pouvoir l'afficher comme section séparée.
  // Pour le chemin principal, on filtre les steps interpolés (transitions
  // automatiques qui n'ont pas de sens dans un playbook imprimé).
  const branchSections = useMemo<{ branch: ScenarioBranch; steps: Step[] }[]>(() => {
    if (!includeBranches) return [];
    const branches = state.scenarioBranches ?? [];
    const initial = state.steps[0];
    if (!initial) return [];
    const actions = state.scriptedActions ?? [];
    return branches.map((b) => ({
      branch: b,
      steps: compileScenario({
        initialOff: initial.off,
        initialBallCarrier: initial.ballCarrier,
        actions,
        playerCount: state.playerCount,
        activeBranch: b,
      }).filter((s) => !s.isInterpolated),
    }));
  }, [includeBranches, state.scenarioBranches, state.scriptedActions, state.steps, state.playerCount]);

  const mainSteps = state.steps.filter((s) => !s.isInterpolated);
  const sps = getSecondsPerStep(state);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .playbook-print, .playbook-print * { visibility: visible !important; }
          .playbook-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; padding: 0 !important; background: #fff !important; }
          .playbook-no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
      <div
        style={
          mode === 'inline'
            ? {
                // Refonte UI — rendu inline dans le grid principal (vue routée
                // par sidebar). Pas de position:fixed → reste dans le flux.
                position: 'relative',
                inset: 'auto',
                width: '100%',
                height: '100%',
                background: '#f1f5f9',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 16,
                overflow: 'auto',
                borderRadius: 8,
              }
            : {
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.6)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 24,
                overflow: 'auto',
              }
        }
      >
        <div
          className="playbook-no-print"
          style={{
            width: '100%',
            maxWidth: 900,
            background: '#fff',
            padding: '12px 16px',
            borderRadius: 8,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 16,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          <input
            type="text"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Titre du playbook"
            style={{ fontSize: 14, padding: '4px 8px', flex: '1 1 200px', borderRadius: 4, border: '1px solid #cbd5e1' }}
          />
          <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
            colonnes
            <select value={columns} onChange={(e) => setColumns(parseInt(e.target.value))} style={{ fontSize: 12 }}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={showDefense} onChange={(e) => setShowDefense(e.target.checked)} />
            défense
          </label>
          <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} />
            légende
          </label>
          <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }} title="Synoptique multi-pistes des actions parallèles, à imprimer en fin de playbook">
            <input type="checkbox" checked={showMultiTrack} onChange={(e) => setShowMultiTrack(e.target.checked)} />
            synoptique
          </label>
          {(state.scenarioBranches?.length ?? 0) > 0 && (
            <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }} title="Inclure les variantes du scénario comme sections supplémentaires">
              <input type="checkbox" checked={includeBranches} onChange={(e) => setIncludeBranches(e.target.checked)} />
              variantes
            </label>
          )}
          <button onClick={() => window.print()} style={{ padding: '6px 12px' }}>
            🖨 imprimer / PDF
          </button>
          <button onClick={onClose} style={{ padding: '6px 12px' }}>
            fermer
          </button>
        </div>

        <div
          className="playbook-print"
          style={{
            width: '100%',
            maxWidth: 900,
            background: '#fff',
            padding: 24,
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: '#0f172a' }}>{docTitle}</h1>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 18 }}>
            {mainSteps.length} étape{mainSteps.length > 1 ? 's' : ''} · système{' '}
            {state.defenseSystem === 'zone' ? `zone ${state.zoneConfig.type}` : 'homme à homme'}
            {state.defenseSystem === 'man' && ` · écran porteur : ${state.screenRule}`}
          </div>

          {/* Chemin principal */}
          {branchSections.length > 0 && (
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#0f172a' }}>
              Chemin principal
            </h2>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: 16,
            }}
          >
            {mainSteps.map((step, i) => {
              const realIdx = state.steps.indexOf(step);
              return (
                <div
                  key={i}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: 8,
                    pageBreakInside: 'avoid',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                      Étape {i + 1}
                      {step.label ? ` — ${step.label}` : ''}
                    </span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>porteur : {step.ballCarrier}</span>
                  </div>
                  <StepThumbnail state={state} stepIdx={realIdx} showDefense={showDefense} />
                  <StepAnnotationsRecap step={step} stepIdxReal={i} sps={sps} />
                </div>
              );
            })}
          </div>

          {/* Sections variantes — une par branche, compilée séparément */}
          {branchSections.map(({ branch, steps: bSteps }) => (
            <div key={branch.id} style={{ marginTop: 24, pageBreakBefore: 'always' }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: '#0f172a' }}>
                Variante : {branch.label}
              </h2>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
                Diverge après l'action #{
                  ((state.scriptedActions ?? []).findIndex((a) => a.id === branch.divergeAfterActionId) + 1)
                    .toString().padStart(2, '0')
                } du chemin principal · {bSteps.length} étape{bSteps.length > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 16 }}>
                {bSteps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      padding: 8,
                      pageBreakInside: 'avoid',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                        Étape {i + 1}
                        {step.label ? ` — ${step.label}` : ''}
                      </span>
                      <span style={{ fontSize: 10, color: '#64748b' }}>porteur : {step.ballCarrier}</span>
                    </div>
                    <StepThumbnail
                      state={{ ...state, steps: bSteps }}
                      stepIdx={i}
                      showDefense={showDefense}
                    />
                    <StepAnnotationsRecap step={step} stepIdxReal={i} sps={sps} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {showMultiTrack && mainSteps.length > 1 && (
            <PrintMultiTrack state={state} sps={sps} />
          )}

          {showLegend && (
            <div
              style={{
                marginTop: 18,
                padding: 10,
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 10,
                color: '#475569',
                pageBreakInside: 'avoid',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#0f172a' }}>Légende</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <LegendItem label="passe">
                  <line x1="2" y1="6" x2="20" y2="6" stroke="#D85A30" strokeWidth="1.6" strokeDasharray="2 2.5" />
                  <path d="M19 3 L23 6 L19 9" stroke="#D85A30" strokeWidth="1.6" fill="none" />
                </LegendItem>
                <LegendItem label="dribble">
                  <path d="M2 6 Q4 1 7 6 T13 6 T19 6" stroke="#D85A30" strokeWidth="1.6" fill="none" />
                  <path d="M19 3 L23 6 L19 9" stroke="#D85A30" strokeWidth="1.6" fill="none" />
                </LegendItem>
                <LegendItem label="course">
                  <line x1="2" y1="6" x2="20" y2="6" stroke="#5F5E5A" strokeWidth="1.6" />
                  <path d="M19 3 L23 6 L19 9" stroke="#5F5E5A" strokeWidth="1.6" fill="none" />
                </LegendItem>
                <LegendItem label="écran">
                  <line x1="12" y1="2" x2="12" y2="9" stroke="#5F5E5A" strokeWidth="1.6" />
                  <line x1="6" y1="10" x2="18" y2="10" stroke="#5F5E5A" strokeWidth="2.5" />
                </LegendItem>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Bloc texte sous chaque vignette d'étape (Étape 14) : timecode de la
 * transition + résumé des annotations concurrentes avec leurs timings et la
 * qualité d'écran. Permet de lire un playbook imprimé quand plusieurs actions
 * se chevauchent (le visuel seul ne suffit pas).
 */
function StepAnnotationsRecap({
  step,
  stepIdxReal,
  sps,
}: {
  step: Step;
  stepIdxReal: number;
  sps: number;
}) {
  const movement = step.annotations.filter(
    (a) => a.type === 'cut' || a.type === 'dribble' || a.type === 'screen' || a.type === 'pass'
  );
  if (movement.length === 0) return null;

  const tStart = stepIdxReal * sps;
  const tEnd = (stepIdxReal + 1) * sps;
  return (
    <div style={{ marginTop: 4, fontSize: 9, color: '#475569', lineHeight: 1.35 }}>
      <div style={{ color: '#0f172a', fontWeight: 600 }}>
        {formatClock(tStart)} → {formatClock(tEnd)} ({(tEnd - tStart).toFixed(1)}s)
      </div>
      <ul style={{ margin: '2px 0 0 0', padding: '0 0 0 12px' }}>
        {movement.map((a, i) => (
          <li key={i}>{annotationSummary(a, tStart, sps)}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Synoptique multi-pistes imprimable (Étape 14). Une grille par joueur ×
 * transition. Pour chaque segment, on dessine une barre positionnée selon
 * tStart/tEnd (segments à cheval cumulés visuellement). Imprime sur ~1 page A4.
 */
function PrintMultiTrack({ state, sps }: { state: AppState; sps: number }) {
  const tracks = computePlayerTracks(state);
  const realCount = tracks[0]?.segments.length ?? 0; // = transitions count
  if (realCount === 0) return null;

  return (
    <div
      style={{
        marginTop: 24,
        pageBreakBefore: 'always',
        pageBreakInside: 'avoid',
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: '#0f172a' }}>
        Synoptique multi-pistes
      </h2>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
        Vue chronologique des actions parallèles de chaque joueur. Les bornes
        de chaque barre correspondent aux instants de début/fin (tStart/tEnd).
        Pour les écrans, la qualité (ghost/loose/std/solid/lock) est indiquée
        sur la barre. ★ = action à cheval sur la transition suivante/précédente.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `42px repeat(${realCount}, 1fr)`, gap: 2, fontSize: 9 }}>
        {/* Header */}
        <div></div>
        {Array.from({ length: realCount }, (_, i) => (
          <div key={i} style={{ textAlign: 'center', fontWeight: 600, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
            {(i * sps).toFixed(1)}s
          </div>
        ))}

        {tracks.map((track) => (
          <PrintTrackRow key={track.id} trackId={track.id} segments={track.segments} kind={track.kind} />
        ))}
      </div>
    </div>
  );
}

function PrintTrackRow({
  trackId,
  segments,
  kind,
}: {
  trackId: string;
  segments: ReturnType<typeof computePlayerTracks>[number]['segments'];
  kind: 'attacker' | 'defender';
}) {
  return (
    <>
      <div
        style={{
          background: kind === 'attacker' ? '#fed7aa' : '#bfdbfe',
          color: kind === 'attacker' ? '#9a3412' : '#1e3a8a',
          fontWeight: 700,
          textAlign: 'center',
          padding: '2px 0',
          borderRadius: 3,
        }}
      >
        {trackId}
      </div>
      {segments.map((seg, i) => {
        const color = ACTIVITY_COLORS[seg.activity];
        const tA = typeof seg.tStart === 'number' ? seg.tStart : 0;
        const tB = typeof seg.tEnd === 'number' ? seg.tEnd : 1;
        const isScreen = seg.activity === 'screen';
        const q = seg.quality ?? 50;
        const qLabel = q <= 12 ? 'gh' : q <= 37 ? 'lo' : q <= 62 ? 'st' : q <= 87 ? 'so' : 'lk';
        const isInactive = seg.activity === 'idle' || seg.activity === 'pos';
        return (
          <div
            key={i}
            style={{
              position: 'relative',
              height: 14,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 2,
              overflow: 'visible',
            }}
          >
            {!isInactive && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${Math.max(-50, tA * 100)}%`,
                  width: `${(tB - tA) * 100}%`,
                  background: color.bg,
                  color: color.fg,
                  fontSize: 7,
                  fontWeight: 700,
                  borderRadius: 2,
                  padding: '0 2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: '14px',
                  boxShadow: tA < 0 || tB > 1 ? `0 0 0 1px ${color.fg}` : undefined,
                }}
              >
                {color.label}{isScreen ? ` ${qLabel}` : ''}{(tA < 0 || tB > 1) ? '★' : ''}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function LegendItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <svg width="26" height="12" viewBox="0 0 26 12">
        {children}
      </svg>
      <span>{label}</span>
    </div>
  );
}
