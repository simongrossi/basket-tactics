'use client';

import type { AppState } from '@/lib/types';
import { Panel, CheckboxLine, COLORS } from './ui';

interface ParametresPanelProps {
  state: AppState;
  onPatch: (p: Partial<AppState>) => void;
}

/**
 * Panneau dédié aux options d'affichage : toggles "Visu & légende" +
 * indicateurs auto + légende informative. Sorti du DefensePanel pour
 * regrouper TOUTES les options visuelles au même endroit, et alléger
 * la hauteur du panneau Défense (qui se concentre sur la simulation).
 */
export function ParametresPanel({ state, onPatch }: ParametresPanelProps) {
  const c = COLORS.defense;
  return (
    <Panel theme="defense" title="⚙ Paramètres">
      <div style={{ fontSize: 10, fontWeight: 600, color: c.accentText, opacity: 0.8, letterSpacing: '0.02em' }}>
        VISU & LÉGENDE
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
        <LegendCheckboxLine
          checked={state.showHelpLines}
          label="aide"
          sample="dashed" color="#534AB7"
          onChange={(v) => onPatch({ showHelpLines: v })}
        />
        <LegendCheckboxLine
          checked={state.showMatchups}
          label="matchups"
          sample="line" color="#888780"
          onChange={(v) => onPatch({ showMatchups: v })}
        />
        <LegendCheckboxLine
          checked={state.showPassLanes}
          label="lignes passe"
          sample="dashed" color="#10b981"
          onChange={(v) => onPatch({ showPassLanes: v })}
        />
        <LegendCheckboxLine
          checked={!!state.showGhosts}
          label="ghost N-1"
          sample="circle-dashed" color="#D85A30"
          onChange={(v) => onPatch({ showGhosts: v })}
        />
        <LegendCheckboxLine
          checked={!!state.showActionOrder}
          label="num. actions"
          sample="num" color="#1e293b"
          onChange={(v) => onPatch({ showActionOrder: v })}
        />
        <LegendCheckboxLine
          checked={!!state.showHeatmap}
          label="heatmap zones"
          sample="gradient" color=""
          onChange={(v) => onPatch({ showHeatmap: v })}
        />
        <CheckboxLine
          checked={state.fullCourt}
          label="terrain complet"
          onChange={(v) => onPatch({ fullCourt: v })}
        />
      </div>
      <button
        onClick={() => onPatch({
          attackingDirection: state.attackingDirection === 'down' ? 'up' : 'down',
        })}
        disabled={!state.fullCourt}
        title={state.fullCourt ? "Bascule le sens d'attaque (panier visé / panier protégé)" : "Active 'terrain complet' pour utiliser cette option"}
        style={{
          fontSize: 11,
          padding: '4px 8px',
          borderRadius: 4,
          border: '1px solid #cbd5e1',
          background: state.fullCourt ? '#fff' : '#f8f8f7',
          color: state.fullCourt ? '#334155' : '#a8a29e',
          cursor: state.fullCourt ? 'pointer' : 'default',
          textAlign: 'left',
        }}
      >
        ↻ sens d'attaque : {state.attackingDirection === 'down' ? 'vers le bas' : 'vers le haut'}
      </button>

      <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${c.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: c.accentText, marginBottom: 4, opacity: 0.8, letterSpacing: '0.02em' }}>
          INDICATEURS AUTO
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px' }}>
          <LegendCheckboxLine
            checked={state.showSwitchMatchups !== false}
            label="matchup switch"
            sample="dashed" color="#BA7517"
            onChange={(v) => onPatch({ showSwitchMatchups: v })}
          />
          <LegendCheckboxLine
            checked={state.showScreenIndicators !== false}
            label="indic. écran"
            sample="circle" color="#534AB7"
            onChange={(v) => onPatch({ showScreenIndicators: v })}
          />
          <LegendCheckboxLine
            checked={state.showStateRings !== false}
            label="anneaux déf."
            sample="ring" color="#FAC775"
            onChange={(v) => onPatch({ showStateRings: v })}
          />
          <LegendCheckboxLine
            checked={state.showLockBadges !== false}
            label="cadenas"
            sample="dot" color="#fbbf24"
            onChange={(v) => onPatch({ showLockBadges: v })}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px', marginTop: 4, opacity: 0.7 }}>
          <LegendRow color="#7c3aed" sample="line-thick" label="zone tracké" />
          <LegendRow color="#f59e0b" sample="dashed" label="passe contestée" />
          <LegendRow color="#dc2626" sample="dashed-thin" label="passe bloquée" />
          <LegendRow color="#16a34a" sample="circle" label="écran non-porteur" />
          <LegendRow color="#E24B4A" sample="ring" label="déf. en retard" />
          <LegendRow color="#F97316" sample="ring" label="closeout actif" />
          <LegendRow color="#0EA5A8" sample="circle" label="strong-side denial" />
          <LegendRow color="#a78bfa" sample="dot" label="poseur forcé" />
        </div>
      </div>
    </Panel>
  );
}

type LegendSample =
  | 'line' | 'line-thick' | 'dashed' | 'dashed-thin'
  | 'circle' | 'circle-dashed' | 'ring' | 'dot' | 'num' | 'gradient';

function Swatch({ color, sample }: { color: string; sample: LegendSample }) {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" style={{ flex: '0 0 22px' }}>
      {sample === 'line' && <line x1="1" y1="6" x2="21" y2="6" stroke={color} strokeWidth="1.4" />}
      {sample === 'line-thick' && <line x1="1" y1="6" x2="21" y2="6" stroke={color} strokeWidth="2.4" />}
      {sample === 'dashed' && (
        <line x1="1" y1="6" x2="21" y2="6" stroke={color} strokeWidth="1.6" strokeDasharray="4 3" />
      )}
      {sample === 'dashed-thin' && (
        <line x1="1" y1="6" x2="21" y2="6" stroke={color} strokeWidth="1.2" strokeDasharray="3 3" />
      )}
      {sample === 'circle' && (
        <circle cx="11" cy="6" r="4" fill="none" stroke={color} strokeWidth="1.6" strokeDasharray="3 2" />
      )}
      {sample === 'circle-dashed' && (
        <circle cx="11" cy="6" r="4" fill="none" stroke={color} strokeWidth="1.4" strokeDasharray="2 2" />
      )}
      {sample === 'ring' && <circle cx="11" cy="6" r="4" fill="none" stroke={color} strokeWidth="2.2" />}
      {sample === 'dot' && <circle cx="11" cy="6" r="3" fill={color} stroke="#92400e" strokeWidth="0.8" />}
      {sample === 'num' && (
        <>
          <circle cx="11" cy="6" r="4.5" fill={color} />
          <text x="11" y="8.6" textAnchor="middle" fontSize="6" fontWeight="700" fill="#fff">1</text>
        </>
      )}
      {sample === 'gradient' && (
        <>
          <defs>
            <linearGradient id="hm-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="hsl(120, 60%, 65%)" stopOpacity="0.7" />
              <stop offset="0.5" stopColor="hsl(60, 60%, 65%)" stopOpacity="0.7" />
              <stop offset="1" stopColor="hsl(0, 60%, 65%)" stopOpacity="0.7" />
            </linearGradient>
          </defs>
          <rect x="1" y="2" width="20" height="8" fill="url(#hm-grad)" rx="1" />
        </>
      )}
    </svg>
  );
}

function LegendRow({ color, sample, label }: { color: string; sample: LegendSample; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#475569', lineHeight: 1.2 }}>
      <Swatch color={color} sample={sample} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

function LegendCheckboxLine({
  checked, label, color, sample, onChange,
}: {
  checked: boolean;
  label: string;
  color: string;
  sample: LegendSample;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12, color: '#1f2937', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <Swatch color={color} sample={sample} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </label>
  );
}
