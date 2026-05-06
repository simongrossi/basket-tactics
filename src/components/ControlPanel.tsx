'use client';

import type {
  AppState,
  AttackerId,
  DefenderId,
  ScreenRule,
  DefenseSystem,
  ZoneConfig,
  DropDepth,
  OffBallScreenRule,
} from '@/lib/types';

const ATTACKER_IDS: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];

interface ControlPanelProps {
  state: AppState;
  onSetActiveStep: (idx: number) => void;
  onAddStep: () => void;
  onDuplicateStep: () => void;
  onDeleteStep: () => void;
  onSetScreenRule: (r: ScreenRule) => void;
  onResetSwitches: () => void;
  onResetAll: () => void;
  onPatch: (p: Partial<AppState>) => void;
  onUpdateRule: (dId: DefenderId, patch: Partial<AppState['rules'][DefenderId]>) => void;
  onPlayToggle: () => void;
  onStop: () => void;
  isPlaying: boolean;
  onExport: () => void;
  onImport: () => void;
  onSetDefenseSystem: (s: DefenseSystem) => void;
  onUpdateZoneConfig: (p: Partial<ZoneConfig>) => void;
  onSetStepLabel: (idx: number, label: string) => void;
  onSetBallCarrier: (carrier: AttackerId) => void;
}

export function ControlPanel(props: ControlPanelProps) {
  const { state } = props;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 230 }}>
      <div style={{ fontSize: 13, fontWeight: 500 }}>Étapes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflow: 'auto' }}>
        {state.steps.map((s, i) => {
          const isActive = i === state.activeStep;
          return (
            <div
              key={i}
              onClick={() => !isActive && props.onSetActiveStep(i)}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                cursor: isActive ? 'default' : 'pointer',
                fontSize: 12,
                background: isActive ? '#dbeafe' : 'transparent',
                color: isActive ? '#1e40af' : '#111',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontWeight: 500 }}>#{i + 1}</span>
                {isActive ? (
                  <input
                    type="text"
                    value={s.label ?? ''}
                    placeholder="label de l'étape…"
                    onChange={(e) => props.onSetStepLabel(i, e.target.value)}
                    style={{ flex: 1, fontSize: 11, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: 4 }}
                  />
                ) : (
                  <span style={{ flex: 1, color: '#475569', fontStyle: s.label ? 'normal' : 'italic' }}>
                    {s.label || '(sans label)'}
                  </span>
                )}
                {s.switches && <span style={{ fontSize: 10, color: '#999' }}>switch</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <span style={{ color: '#666' }}>porteur</span>
                {isActive ? (
                  <select
                    value={s.ballCarrier}
                    onChange={(e) => props.onSetBallCarrier(e.target.value as AttackerId)}
                    style={{ fontSize: 11, padding: '1px 2px' }}
                  >
                    {ATTACKER_IDS.map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                ) : (
                  <span>{s.ballCarrier}</span>
                )}
                <span style={{ color: '#666', marginLeft: 6 }}>{s.annotations.length} annot.</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={props.onAddStep}>+ étape</button>
        <button onClick={props.onDuplicateStep}>dup.</button>
        <button onClick={props.onDeleteStep}>suppr.</button>
      </div>

      <details open>
        <summary style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>lecture</summary>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <button onClick={props.onPlayToggle}>{props.isPlaying ? '⏸ pause' : '▶ play'}</button>
          <button onClick={props.onStop}>■ stop</button>
        </div>
      </details>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>système</span>
        <label style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="radio"
            name="defSystem"
            checked={state.defenseSystem === 'man'}
            onChange={() => props.onSetDefenseSystem('man')}
          />
          homme
        </label>
        <label style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="radio"
            name="defSystem"
            checked={state.defenseSystem === 'zone'}
            onChange={() => props.onSetDefenseSystem('zone')}
          />
          zone
        </label>
      </div>

      {state.defenseSystem === 'zone' && (
        <details open>
          <summary style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>configuration zone</summary>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <span style={{ fontSize: 12 }}>type</span>
            <select
              value={state.zoneConfig.type}
              onChange={(e) => props.onUpdateZoneConfig({ type: e.target.value as ZoneConfig['type'] })}
              style={{ flex: 1 }}
            >
              <option value="zone-2-3">2-3</option>
              <option value="zone-1-3-1">1-3-1</option>
              <option value="zone-3-2">3-2</option>
              <option value="zone-matchup">match-up</option>
            </select>
          </div>
          <Slider
            label="pression ballon"
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
        </details>
      )}

      <details open style={{ display: state.defenseSystem === 'man' ? undefined : 'none' }}>
        <summary style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>défense — global</summary>
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
        <div style={{ fontSize: 12, fontWeight: 500, margin: '6px 0 4px' }}>triggers d'aide</div>
        <CheckboxLine
          checked={state.triggers.drive}
          label="aide sur drive"
          onChange={(v) => props.onPatch({ triggers: { ...state.triggers, drive: v } })}
        />
        <CheckboxLine
          checked={state.triggers.post}
          label="aide sur post-up"
          onChange={(v) => props.onPatch({ triggers: { ...state.triggers, post: v } })}
        />
        <CheckboxLine
          checked={state.triggers.paint}
          label="aide si porteur dans raquette"
          onChange={(v) => props.onPatch({ triggers: { ...state.triggers, paint: v } })}
        />
      </details>

      <details open style={{ display: state.defenseSystem === 'man' ? undefined : 'none' }}>
        <summary style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>défense sur écran porteur</summary>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 12 }}>consigne</span>
          <select
            value={state.screenRule}
            onChange={(e) => props.onSetScreenRule(e.target.value as ScreenRule)}
            style={{ flex: 1 }}
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 12 }}>profondeur</span>
            <select
              value={state.dropDepth}
              onChange={(e) => props.onPatch({ dropDepth: e.target.value as DropDepth })}
              style={{ flex: 1 }}
            >
              <option value="shallow">shallow (ice)</option>
              <option value="medium">medium</option>
              <option value="deep">deep</option>
            </select>
          </div>
        )}
        <button onClick={props.onResetSwitches} style={{ width: '100%', marginTop: 4 }}>
          annuler les switches actifs
        </button>
      </details>

      <details style={{ display: state.defenseSystem === 'man' ? undefined : 'none' }}>
        <summary style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>écrans non-porteur</summary>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 12 }}>consigne</span>
          <select
            value={state.offBallScreenRule}
            onChange={(e) => props.onPatch({ offBallScreenRule: e.target.value as OffBallScreenRule })}
            style={{ flex: 1 }}
          >
            <option value="over">over (par-dessus)</option>
            <option value="under">under (en dessous)</option>
            <option value="switch">switch (échange)</option>
            <option value="bump">bump (blocage)</option>
          </select>
        </div>
      </details>

      <details style={{ display: state.defenseSystem === 'man' ? undefined : 'none' }}>
        <summary style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>règles individuelles</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr 1fr', gap: 3, fontSize: 11, color: '#666' }}>
            <span></span>
            <span>aide %</span>
            <span>prio.</span>
            <span>vs porteur</span>
          </div>
          {(['D1', 'D2', 'D3', 'D4', 'D5'] as DefenderId[]).map((dId) => {
            const r = state.rules[dId];
            return (
              <div
                key={dId}
                style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr 1fr', gap: 3, alignItems: 'center', fontSize: 11 }}
              >
                <span>{dId}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={r.helpPct}
                  onChange={(e) =>
                    props.onUpdateRule(dId, { helpPct: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })
                  }
                  style={{ fontSize: 11, height: 24 }}
                />
                <select
                  value={r.priority}
                  onChange={(e) => props.onUpdateRule(dId, { priority: e.target.value as any })}
                  style={{ fontSize: 11, height: 24 }}
                >
                  <option value="paint">raquette</option>
                  <option value="man">homme</option>
                  <option value="passlane">passe</option>
                </select>
                <select
                  value={r.vsCarrier}
                  onChange={(e) => props.onUpdateRule(dId, { vsCarrier: e.target.value as any })}
                  style={{ fontSize: 11, height: 24 }}
                >
                  <option value="coller">coller</option>
                  <option value="bumper">bumper</option>
                  <option value="contester">contester</option>
                  <option value="reculer">reculer</option>
                </select>
              </div>
            );
          })}
        </div>
      </details>

      <details>
        <summary style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>visu</summary>
        <CheckboxLine
          checked={state.showHelpLines}
          label="lignes d'aide"
          onChange={(v) => props.onPatch({ showHelpLines: v })}
        />
        <CheckboxLine
          checked={state.showMatchups}
          label="matchups (traits)"
          onChange={(v) => props.onPatch({ showMatchups: v })}
        />
        <CheckboxLine
          checked={state.fullCourt}
          label="terrain complet"
          onChange={(v) => props.onPatch({ fullCourt: v })}
        />
      </details>

      <div style={{ borderTop: '1px solid #ddd', paddingTop: 8 }}>
        <button onClick={props.onExport} style={{ width: '100%' }}>
          exporter JSON
        </button>
        <button onClick={props.onImport} style={{ width: '100%', marginTop: 4 }}>
          importer JSON
        </button>
        <button onClick={props.onResetAll} style={{ width: '100%', marginTop: 4 }}>
          reset complet
        </button>
      </div>
    </div>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
      <span style={{ fontSize: 12, color: '#666' }}>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseInt(e.target.value))}
        style={{ flex: 1 }}
      />
      <span style={{ fontSize: 12, color: '#666', minWidth: 30 }}>{props.value}</span>
    </div>
  );
}

function CheckboxLine(props: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, marginTop: 4 }}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}
