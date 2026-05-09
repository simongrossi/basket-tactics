'use client';

import type { AppState, PlayerCount } from '@/lib/types';
import { PLAYER_COUNT_OPTIONS } from '@/lib/logic/players';
import { Panel, CheckboxLine, COLORS } from './ui';

interface ParametresPanelProps {
  state: AppState;
  onPatch: (p: Partial<AppState>) => void;
  onSetPlayerCount: (count: PlayerCount) => void;
}

/**
 * Panneau dédié aux options d'affichage : toggles "Visu & légende" +
 * indicateurs auto + légende informative. Sorti du DefensePanel pour
 * regrouper TOUTES les options visuelles au même endroit, et alléger
 * la hauteur du panneau Défense (qui se concentre sur la simulation).
 */
export function ParametresPanel({ state, onPatch, onSetPlayerCount }: ParametresPanelProps) {
  const c = COLORS.defense;
  return (
    <Panel theme="defense" title="⚙ Paramètres">
      <div style={{ fontSize: 10, fontWeight: 600, color: c.accentText, opacity: 0.8, letterSpacing: '0.02em' }}>
        FORMAT DE JEU
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 6 }}>
        {PLAYER_COUNT_OPTIONS.map((count) => {
          const active = state.playerCount === count;
          return (
            <button
              key={count}
              type="button"
              onClick={() => onSetPlayerCount(count)}
              style={{
                fontSize: 11,
                padding: '5px 6px',
                borderRadius: 5,
                border: `1px solid ${active ? c.accent : c.border}`,
                background: active ? c.accent : '#fff',
                color: active ? '#fff' : c.accentText,
                cursor: 'pointer',
                fontWeight: active ? 700 : 500,
              }}
            >
              {count}x{count}
            </button>
          );
        })}
      </div>

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
          checked={state.showCoachDiagnostics !== false}
          label="lecture coach"
          sample="line" color="#92400e"
          onChange={(v) => onPatch({ showCoachDiagnostics: v })}
        />
        <LegendCheckboxLine
          checked={!!state.showHeatmap}
          label="heatmap zones"
          sample="gradient" color=""
          onChange={(v) => onPatch({ showHeatmap: v })}
        />
        <LegendCheckboxLine
          checked={!!state.showThreats}
          label="menace attaquants"
          sample="ring-solid" color="#10b981"
          onChange={(v) => onPatch({ showThreats: v })}
        />
        <LegendCheckboxLine
          checked={!!state.showBestAction}
          label="meilleure action"
          sample="ring-solid" color="#fbbf24"
          onChange={(v) => onPatch({ showBestAction: v })}
        />
        <CheckboxLine
          checked={state.fullCourt}
          label="terrain complet"
          onChange={(v) => onPatch({ fullCourt: v })}
        />
        <LegendCheckboxLine
          checked={!!state.showHelpDebug}
          label="debug aide (flèches %)"
          sample="dashed" color="#8b5cf6"
          onChange={(v) => onPatch({ showHelpDebug: v })}
        />
        <LegendCheckboxLine
          checked={!!state.showFieldOfViewAll}
          label="champ vision (tous)"
          sample="circle" color="#94a3b8"
          onChange={(v) => onPatch({ showFieldOfViewAll: v })}
        />
        <LegendCheckboxLine
          checked={!!state.showFieldOfViewAllDefenders}
          label="champ vision (défenseurs)"
          sample="circle" color="#06b6d4"
          onChange={(v) => onPatch({ showFieldOfViewAllDefenders: v })}
        />
        <LegendCheckboxLine
          checked={!!state.showFieldOfViewAllAttackers}
          label="champ vision (attaquants)"
          sample="circle" color="#f97316"
          onChange={(v) => onPatch({ showFieldOfViewAllAttackers: v })}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px', marginTop: 4 }}>
          <LegendCheckboxLine
            checked={state.showZoneTracking !== false}
            label="zone tracké"
            sample="line-thick" color="#7c3aed"
            onChange={(v) => onPatch({ showZoneTracking: v })}
          />
          <LegendCheckboxLine
            checked={state.showContestedPass !== false}
            label="passe contestée"
            sample="dashed" color="#f59e0b"
            onChange={(v) => onPatch({ showContestedPass: v })}
          />
          <LegendCheckboxLine
            checked={state.showBlockedPass !== false}
            label="passe bloquée"
            sample="dashed-thin" color="#dc2626"
            onChange={(v) => onPatch({ showBlockedPass: v })}
          />
          <LegendCheckboxLine
            checked={state.showOffBallScreenIndicator !== false}
            label="écran non-porteur"
            sample="circle" color="#16a34a"
            onChange={(v) => onPatch({ showOffBallScreenIndicator: v })}
          />
          <LegendCheckboxLine
            checked={state.showLateRing !== false}
            label="déf. en retard"
            sample="ring" color="#E24B4A"
            onChange={(v) => onPatch({ showLateRing: v })}
          />
          <LegendCheckboxLine
            checked={state.showCloseoutRing !== false}
            label="closeout actif"
            sample="ring" color="#F97316"
            onChange={(v) => onPatch({ showCloseoutRing: v })}
          />
          <LegendCheckboxLine
            checked={state.showDenyingRing !== false}
            label="strong-side denial"
            sample="circle" color="#0EA5A8"
            onChange={(v) => onPatch({ showDenyingRing: v })}
          />
          <LegendCheckboxLine
            checked={state.showForcedScreenerBadge !== false}
            label="poseur forcé"
            sample="dot" color="#a78bfa"
            onChange={(v) => onPatch({ showForcedScreenerBadge: v })}
          />
        </div>
      </div>
    </Panel>
  );
}

type LegendSample =
  | 'line' | 'line-thick' | 'dashed' | 'dashed-thin'
  | 'circle' | 'circle-dashed' | 'ring' | 'ring-solid' | 'dot' | 'num' | 'gradient';

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
      {sample === 'ring-solid' && (
        <>
          <circle cx="11" cy="6" r="4" fill="none" stroke={color} strokeWidth="2" />
          <rect x="14" y="3" width="7" height="6" rx="1" fill={color} />
        </>
      )}
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
              <stop offset="0" stopColor="hsl(120, 78%, 50%)" stopOpacity="0.85" />
              <stop offset="0.5" stopColor="hsl(60, 78%, 50%)" stopOpacity="0.85" />
              <stop offset="1" stopColor="hsl(0, 78%, 50%)" stopOpacity="0.85" />
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
