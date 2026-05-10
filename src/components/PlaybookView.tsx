'use client';

import { useState, useMemo } from 'react';
import type { AppState, ScenarioBranch, Step } from '@/lib/types';
import { StepThumbnail } from './StepThumbnail';
import { compileScenario } from '@/lib/logic/compileScenario';

interface PlaybookViewProps {
  state: AppState;
  title?: string;
  onClose: () => void;
}

export function PlaybookView({ state, title, onClose }: PlaybookViewProps) {
  const [columns, setColumns] = useState(2);
  const [showDefense, setShowDefense] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [docTitle, setDocTitle] = useState(title ?? 'Playbook');
  const [includeBranches, setIncludeBranches] = useState(state.pdfIncludeBranches ?? false);

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
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 24,
          overflow: 'auto',
        }}
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
                  </div>
                ))}
              </div>
            </div>
          ))}

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
