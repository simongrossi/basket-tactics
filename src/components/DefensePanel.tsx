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

interface DefensePanelProps {
  state: AppState;
  onSetScreenRule: (r: ScreenRule) => void;
  onResetSwitches: () => void;
  onPatch: (p: Partial<AppState>) => void;
  onUpdateRule: (dId: DefenderId, patch: Partial<AppState['rules'][DefenderId]>) => void;
  onSetDefenseSystem: (s: DefenseSystem) => void;
  onUpdateZoneConfig: (p: Partial<ZoneConfig>) => void;
}

export function DefensePanel(props: DefensePanelProps) {
  const { state } = props;
  const c = COLORS.defense;
  const isMan = state.defenseSystem === 'man';

  return (
    <Panel theme="defense" title="🛡 Défense">
      <Section theme="defense" label="Système" open>
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
            homme
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
            <div style={{ fontSize: 11, fontWeight: 500, color: c.accentText, marginTop: 4 }}>Triggers d'aide</div>
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

          <Section theme="defense" label="Écran non-porteur">
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

      <Section theme="defense" label="Visualisation">
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
          checked={state.showPassLanes}
          label="lignes de passe"
          onChange={(v) => props.onPatch({ showPassLanes: v })}
        />
        <CheckboxLine
          checked={state.fullCourt}
          label="terrain complet"
          onChange={(v) => props.onPatch({ fullCourt: v })}
        />
      </Section>
    </Panel>
  );
}
