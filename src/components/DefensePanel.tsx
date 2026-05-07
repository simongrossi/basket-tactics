'use client';

import type {
  AppState,
  DefenderId,
  ScreenRule,
  DefenseSystem,
  ZoneConfig,
  DropDepth,
  OffBallScreenRule,
} from '@/lib/types';
import { Panel, Section, Slider, CheckboxLine, Button, COLORS } from './ui';
import { DEFENSE_PRESETS, type DefensePreset } from '@/lib/data/defensePresets';

interface DefensePanelProps {
  state: AppState;
  onSetScreenRule: (r: ScreenRule) => void;
  onResetSwitches: () => void;
  onPatch: (p: Partial<AppState>) => void;
  onUpdateRule: (dId: DefenderId, patch: Partial<AppState['rules'][DefenderId]>) => void;
  onSetDefenseSystem: (s: DefenseSystem) => void;
  onUpdateZoneConfig: (p: Partial<ZoneConfig>) => void;
  onApplyDefensePreset: (preset: DefensePreset) => void;
}

export function DefensePanel(props: DefensePanelProps) {
  const { state } = props;
  const c = COLORS.defense;
  const isMan = state.defenseSystem === 'man';

  return (
    <Panel theme="defense" title="🛡 Défense">
      <Section theme="defense" label="Presets">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {DEFENSE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                if (confirm(`Appliquer "${p.name}" ?\n\n${p.description}`)) {
                  props.onApplyDefensePreset(p);
                }
              }}
              title={p.description}
              style={{
                textAlign: 'left',
                padding: '6px 8px',
                fontSize: 11,
                borderRadius: 6,
                border: `1px solid ${c.border}`,
                background: '#fff',
                cursor: 'pointer',
                transition: 'border-color 120ms, background 120ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = c.accent;
                e.currentTarget.style.background = c.bg;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = c.border;
                e.currentTarget.style.background = '#fff';
              }}
            >
              <div style={{ fontWeight: 600, color: c.accentText, fontSize: 12 }}>{p.name}</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 2, lineHeight: 1.35 }}>
                {p.description}
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section theme="defense" label="Type de défense" open>
        <div style={{ display: 'flex', gap: 8 }}>
          <label
            style={{
              flex: 1,
              padding: '6px 8px',
              borderRadius: 6,
              border: `1px solid ${isMan ? c.accent : c.border}`,
              background: isMan ? c.bgSubtle : '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: isMan ? c.accentText : '#475569',
              fontWeight: isMan ? 600 : 400,
            }}
          >
            <input
              type="radio"
              name="defSystem"
              checked={isMan}
              onChange={() => props.onSetDefenseSystem('man')}
            />
            individuelle
          </label>
          <label
            style={{
              flex: 1,
              padding: '6px 8px',
              borderRadius: 6,
              border: `1px solid ${!isMan ? c.accent : c.border}`,
              background: !isMan ? c.bgSubtle : '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: !isMan ? c.accentText : '#475569',
              fontWeight: !isMan ? 600 : 400,
            }}
          >
            <input
              type="radio"
              name="defSystem"
              checked={!isMan}
              onChange={() => props.onSetDefenseSystem('zone')}
            />
            zone
          </label>
        </div>
      </Section>

      {!isMan && (
        <Section theme="defense" label="Configuration zone" open>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#475569', minWidth: 40 }}>type</span>
            <select
              value={state.zoneConfig.type}
              onChange={(e) => props.onUpdateZoneConfig({ type: e.target.value as ZoneConfig['type'] })}
              style={{ flex: 1, fontSize: 11, padding: '3px 4px' }}
            >
              <option value="zone-2-3">2-3</option>
              <option value="zone-1-3-1">1-3-1</option>
              <option value="zone-3-2">3-2</option>
              <option value="zone-2-1-2">2-1-2</option>
              <option value="zone-matchup">match-up</option>
            </select>
          </div>
          <Slider
            label="pression bal."
            min={0}
            max={100}
            step={5}
            value={state.zoneConfig.ballPressure}
            onChange={(v) => props.onUpdateZoneConfig({ ballPressure: v })}
          />
          <Slider
            label="vit. rotation"
            min={40}
            max={200}
            step={5}
            value={state.zoneConfig.rotationSpeed}
            onChange={(v) => props.onUpdateZoneConfig({ rotationSpeed: v })}
          />
          <Slider
            label="position vert."
            min={-100}
            max={150}
            step={5}
            value={state.zoneConfig.verticalOffset ?? 0}
            onChange={(v) => props.onUpdateZoneConfig({ verticalOffset: v })}
          />
          <CheckboxLine
            checked={state.zoneConfig.trapCorners}
            label="trap en coin"
            onChange={(v) => props.onUpdateZoneConfig({ trapCorners: v })}
          />
          <CheckboxLine
            checked={state.zoneConfig.extendTo3pt}
            label="extension 3pts"
            onChange={(v) => props.onUpdateZoneConfig({ extendTo3pt: v })}
          />
        </Section>
      )}

      {isMan && (
        <>
          <Section theme="defense" label="Paramètres globaux" open>
            <Slider
              label="distance"
              min={20}
              max={80}
              step={2}
              value={state.defenseDistance}
              onChange={(v) => props.onPatch({ defenseDistance: v })}
            />
            <Slider
              label="vit. max"
              min={40}
              max={200}
              step={5}
              value={state.defenseMaxSpeed}
              onChange={(v) => props.onPatch({ defenseMaxSpeed: v })}
            />
            <Slider
              label="closeout ×"
              min={1}
              max={2}
              step={0.1}
              value={state.closeoutBoost ?? 1.4}
              onChange={(v) => props.onPatch({ closeoutBoost: v })}
            />
            <Slider
              label="denial agr."
              min={0}
              max={1}
              step={0.05}
              value={state.denyAggressiveness ?? 0.45}
              onChange={(v) => props.onPatch({ denyAggressiveness: v })}
            />
            <div style={{ fontSize: 11, fontWeight: 500, color: c.accentText, marginTop: 4 }}>Triggers d'aide</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px' }}>
              <CheckboxLine
                checked={state.triggers.drive}
                label="drive"
                onChange={(v) => props.onPatch({ triggers: { ...state.triggers, drive: v } })}
              />
              <CheckboxLine
                checked={state.triggers.post}
                label="post-up"
                onChange={(v) => props.onPatch({ triggers: { ...state.triggers, post: v } })}
              />
              <CheckboxLine
                checked={state.triggers.paint}
                label="raquette"
                onChange={(v) => props.onPatch({ triggers: { ...state.triggers, paint: v } })}
              />
              <CheckboxLine
                checked={!!state.triggers.trap}
                label="trap coin/sideline"
                onChange={(v) => props.onPatch({ triggers: { ...state.triggers, trap: v } })}
              />
            </div>
          </Section>

          <Section theme="defense" label="Écran porteur" open>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#475569', minWidth: 60 }}>consigne</span>
              <select
                value={state.screenRule}
                onChange={(e) => props.onSetScreenRule(e.target.value as ScreenRule)}
                style={{ flex: 1, fontSize: 11, padding: '3px 4px' }}
              >
                <option value="over">over (par-dessus)</option>
                <option value="under">under (en dessous)</option>
                <option value="switch">switch (échange)</option>
                <option value="hedge">hedge (show & recover)</option>
                <option value="drop">drop (recul)</option>
                <option value="blitz">blitz (piège)</option>
              </select>
            </div>
            <Slider
              label="détection"
              min={20}
              max={60}
              step={2}
              value={state.screenRadius}
              onChange={(v) => props.onPatch({ screenRadius: v })}
            />
            {state.screenRule === 'drop' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#475569', minWidth: 60 }}>profondeur</span>
                <select
                  value={state.dropDepth}
                  onChange={(e) => props.onPatch({ dropDepth: e.target.value as DropDepth })}
                  style={{ flex: 1, fontSize: 11, padding: '3px 4px' }}
                >
                  <option value="shallow">shallow (ice)</option>
                  <option value="medium">medium</option>
                  <option value="deep">deep</option>
                </select>
              </div>
            )}
            <Button theme="defense" fullWidth onClick={props.onResetSwitches}>
              annuler les switches actifs
            </Button>
          </Section>

          <Section theme="defense" label="Écran non-porteur" open>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#475569', minWidth: 60 }}>consigne</span>
              <select
                value={state.offBallScreenRule}
                onChange={(e) => props.onPatch({ offBallScreenRule: e.target.value as OffBallScreenRule })}
                style={{ flex: 1, fontSize: 11, padding: '3px 4px' }}
              >
                <option value="over">over (par-dessus)</option>
                <option value="under">under (en dessous)</option>
                <option value="switch">switch (échange)</option>
                <option value="bump">bump (blocage)</option>
              </select>
            </div>
          </Section>

          <Section theme="defense" label="Règles individuelles">
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
              Astuce : clic-droit sur un défenseur pour ouvrir un menu rapide.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '24px 40px 1fr 1fr 1fr 1fr', gap: 3, fontSize: 10, color: '#64748b' }}>
              <span></span>
              <span>aide</span>
              <span>prio.</span>
              <span>vs porteur</span>
              <span>hors-bal.</span>
              <span>écran</span>
            </div>
            {(['D1', 'D2', 'D3', 'D4', 'D5'] as DefenderId[]).map((dId) => {
              const r = state.rules[dId];
              return (
                <div
                  key={dId}
                  style={{ display: 'grid', gridTemplateColumns: '24px 40px 1fr 1fr 1fr 1fr', gap: 3, alignItems: 'center', fontSize: 11 }}
                >
                  <span style={{ fontWeight: 500, color: c.accentText }}>{dId}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={r.helpPct}
                    onChange={(e) =>
                      props.onUpdateRule(dId, { helpPct: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })
                    }
                    style={{ fontSize: 11, height: 22, padding: '0 3px' }}
                  />
                  <select
                    value={r.priority}
                    onChange={(e) => props.onUpdateRule(dId, { priority: e.target.value as any })}
                    style={{ fontSize: 11, height: 22 }}
                  >
                    <option value="paint">raquette</option>
                    <option value="man">homme</option>
                    <option value="passlane">passe</option>
                  </select>
                  <select
                    value={r.vsCarrier}
                    onChange={(e) => props.onUpdateRule(dId, { vsCarrier: e.target.value as any })}
                    style={{ fontSize: 11, height: 22 }}
                  >
                    <option value="coller">coller</option>
                    <option value="bumper">bumper</option>
                    <option value="contester">contester</option>
                    <option value="reculer">reculer</option>
                    <option value="topside">topside</option>
                    <option value="baseline">baseline</option>
                  </select>
                  <select
                    value={r.offBallStance ?? 'sag'}
                    onChange={(e) => props.onUpdateRule(dId, { offBallStance: e.target.value as any })}
                    style={{ fontSize: 11, height: 22 }}
                  >
                    <option value="sag">sag</option>
                    <option value="behind">derrière</option>
                    <option value="stunt">stunt</option>
                    <option value="deny-3q">3/4 deny</option>
                    <option value="fronting">devant</option>
                  </select>
                  <select
                    value={r.screenNav ?? 'auto'}
                    onChange={(e) => props.onUpdateRule(dId, { screenNav: e.target.value as any })}
                    style={{ fontSize: 11, height: 22 }}
                  >
                    <option value="auto">auto</option>
                    <option value="over">over</option>
                    <option value="under">under</option>
                    <option value="switch">switch</option>
                    <option value="hedge">hedge</option>
                    <option value="drop">drop</option>
                    <option value="blitz">blitz</option>
                  </select>
                </div>
              );
            })}
          </Section>
        </>
      )}

      <Section theme="defense" label="Visu & légende" open>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
          <LegendCheckboxLine
            checked={state.showHelpLines}
            label="aide"
            sample="dashed" color="#534AB7"
            onChange={(v) => props.onPatch({ showHelpLines: v })}
          />
          <LegendCheckboxLine
            checked={state.showMatchups}
            label="matchups"
            sample="line" color="#888780"
            onChange={(v) => props.onPatch({ showMatchups: v })}
          />
          <LegendCheckboxLine
            checked={state.showPassLanes}
            label="lignes passe"
            sample="dashed" color="#10b981"
            onChange={(v) => props.onPatch({ showPassLanes: v })}
          />
          <LegendCheckboxLine
            checked={!!state.showGhosts}
            label="ghost N-1"
            sample="circle-dashed" color="#D85A30"
            onChange={(v) => props.onPatch({ showGhosts: v })}
          />
          <LegendCheckboxLine
            checked={!!state.showActionOrder}
            label="num. actions"
            sample="num" color="#1e293b"
            onChange={(v) => props.onPatch({ showActionOrder: v })}
          />
          <LegendCheckboxLine
            checked={!!state.showHeatmap}
            label="heatmap zones"
            sample="gradient" color=""
            onChange={(v) => props.onPatch({ showHeatmap: v })}
          />
          <CheckboxLine
            checked={state.fullCourt}
            label="terrain complet"
            onChange={(v) => props.onPatch({ fullCourt: v })}
          />
        </div>
        <button
          onClick={() => props.onPatch({
            attackingDirection: state.attackingDirection === 'down' ? 'up' : 'down',
          })}
          disabled={!state.fullCourt}
          title={state.fullCourt ? 'Bascule le sens d\'attaque (panier visé / panier protégé)' : 'Active "terrain complet" pour utiliser cette option'}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid #cbd5e1',
            background: state.fullCourt ? '#fff' : '#f8f8f7',
            color: state.fullCourt ? '#334155' : '#a8a29e',
            cursor: state.fullCourt ? 'pointer' : 'default',
            marginTop: 4,
            textAlign: 'left',
          }}
        >
          ↻ sens d'attaque : {state.attackingDirection === 'down' ? 'vers le bas' : 'vers le haut'}
        </button>
        {/* Indicateurs auto. Les visuels groupés en 4 toggles (switch matchup,
            écrans, anneaux d'état, badges cadenas) — chaque toggle pilote
            plusieurs cues du même type. Les autres entrées (zone, passes
            contestée/bloquée) sont informatives (sub-cases d'autres toggles). */}
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${c.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: c.accentText, marginBottom: 4, opacity: 0.8 }}>
            Indicateurs auto
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px' }}>
            <LegendCheckboxLine
              checked={state.showSwitchMatchups !== false}
              label="matchup switch"
              sample="dashed" color="#BA7517"
              onChange={(v) => props.onPatch({ showSwitchMatchups: v })}
            />
            <LegendCheckboxLine
              checked={state.showScreenIndicators !== false}
              label="indicateurs écran"
              sample="circle" color="#534AB7"
              onChange={(v) => props.onPatch({ showScreenIndicators: v })}
            />
            <LegendCheckboxLine
              checked={state.showStateRings !== false}
              label="anneaux défenseur"
              sample="ring" color="#FAC775"
              onChange={(v) => props.onPatch({ showStateRings: v })}
            />
            <LegendCheckboxLine
              checked={state.showLockBadges !== false}
              label="badges cadenas"
              sample="dot" color="#fbbf24"
              onChange={(v) => props.onPatch({ showLockBadges: v })}
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
            <LegendRow color="#a78bfa" sample="dot" label="poseur d'écran forcé" />
          </div>
        </div>
      </Section>
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
              <stop offset="0" stopColor="#facc15" stopOpacity="0.7" />
              <stop offset="1" stopColor="#dc2626" stopOpacity="0.85" />
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
