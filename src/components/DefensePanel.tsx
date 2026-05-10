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
import { SimulationSection } from './SimulationSection';
import { getActiveDefenderIds } from '@/lib/logic/players';

interface DefensePanelProps {
  state: AppState;
  onSetScreenRule: (r: ScreenRule) => void;
  onResetSwitches: () => void;
  onPatch: (p: Partial<AppState>) => void;
  onUpdateRule: (dId: DefenderId, patch: Partial<AppState['rules'][DefenderId]>) => void;
  onUpdateAllRules: (patch: Partial<AppState['rules'][DefenderId]>) => void;
  onResetIndividualOverrides: () => void;
  onSetDefenseSystem: (s: DefenseSystem) => void;
  onUpdateZoneConfig: (p: Partial<ZoneConfig>) => void;
  onApplyDefensePreset: (preset: DefensePreset) => void;
  onClearAllDefenseOverrides: () => void;
  scriptedDefenseEnabled?: boolean;
  onToggleScriptedDefense: () => void;
}

export function DefensePanel(props: DefensePanelProps) {
  const { state } = props;
  const c = COLORS.defense;
  const isMan = state.defenseSystem === 'man';
  const defenderIds = getActiveDefenderIds(state.playerCount);

  return (
    <Panel theme="defense" title="🛡 Défense" fill>
      <div style={{
        marginTop: 8, padding: 8,
        border: '1px solid #dbeafe', borderRadius: 6, background: '#eff6ff',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <input
          type="checkbox"
          id="scripted-defense-toggle"
          checked={props.scriptedDefenseEnabled !== false}
          onChange={props.onToggleScriptedDefense}
        />
        <label htmlFor="scripted-defense-toggle" style={{ fontSize: 11, color: '#1e3a8a' }}>
          Appliquer les directives défensives scriptées
        </label>
      </div>
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
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #cbd5e1' }}>
            <CheckboxLine
              checked={!!state.zoneEditMode}
              label="✎ mode édition zones"
              onChange={(v) => props.onPatch({ zoneEditMode: v })}
              title="Active l'overlay interactif : régions colorées, drag des homePos (rond coloré) pour repositionner les ancrages. Drag des sommets blancs pour reshaper le polygone librement. Clic sur une arête pour ajouter un sommet. Shift+clic sur un sommet pour le supprimer. Clic sur le label pour ouvrir le menu (mode + rayon)."
            />
            {(() => {
              const cur = state.steps[state.activeStep];
              const activeDefenders = new Set(defenderIds);
              const overrideCount = cur?.defenseOverrides
                ? Object.keys(cur.defenseOverrides).filter((id) => activeDefenders.has(id as DefenderId)).length
                : 0;
              return (
                <button
                  onClick={props.onClearAllDefenseOverrides}
                  disabled={overrideCount === 0}
                  title="Libère tous les défenseurs en placement manuel (✋) sur cette étape — repassent en auto/zone. Le drag d'un défenseur en mode édition ne crée plus de manuel, mais ce bouton sert à nettoyer un état hérité."
                  style={{
                    marginTop: 6,
                    width: '100%',
                    fontSize: 11,
                    padding: '5px 8px',
                    borderRadius: 4,
                    border: '1px solid #cbd5e1',
                    background: overrideCount === 0 ? '#f8fafc' : '#fff',
                    color: overrideCount === 0 ? '#94a3b8' : '#1e3a8a',
                    cursor: overrideCount === 0 ? 'default' : 'pointer',
                    fontWeight: 500,
                  }}
                >
                  ↻ tout en auto {overrideCount > 0 ? `(${overrideCount})` : ''}
                </button>
              );
            })()}
          </div>
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
              title="Distance par défaut entre chaque défenseur et son attaquant marqué (en pixels). Petite distance = défense collante, grande distance = laisse de l'espace pour aider. Override-able par défenseur via le clic-droit."
            />
            <Slider
              label="vit. max"
              min={40}
              max={200}
              step={5}
              value={state.defenseMaxSpeed}
              onChange={(v) => props.onPatch({ defenseMaxSpeed: v })}
              title="Distance maximale qu'un défenseur peut parcourir entre deux étapes (en pixels). Au-delà, le défenseur est marqué 'en retard' (contour rouge). Modélise la réalité physique : un défenseur ne peut pas se téléporter."
            />
            <Slider
              label="closeout ×"
              min={1}
              max={2}
              step={0.1}
              value={state.closeoutBoost ?? 1.4}
              onChange={(v) => props.onPatch({ closeoutBoost: v })}
              title="Multiplicateur global de vitesse pour le défenseur du nouveau porteur quand le ballon arrive sur lui (passe entrante). 1 = pas de boost, 2 = très agressif. Modélise l'urgence du closeout."
            />
            <Slider
              label="denial agr."
              min={0}
              max={1}
              step={0.05}
              value={state.denyAggressiveness ?? 0.45}
              onChange={(v) => props.onPatch({ denyAggressiveness: v })}
              title="Force globale du marquage en avant côté ballon (strong-side denial automatique). 0 = ignore, 0.45 = par défaut, 1 = full denial assumé partout. Override-able par défenseur."
            />
            <div
              style={{ fontSize: 11, fontWeight: 500, color: c.accentText, marginTop: 4 }}
              title="Conditions qui déclenchent l'aide automatique de la défense. Quand un trigger est actif, les défenseurs avec aide% > 0 quittent leur homme pour combler le danger. Sans trigger, ils restent en marquage classique (un peu de sag baseline weak-side)."
            >
              Triggers d'aide
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px' }}>
              <CheckboxLine
                checked={state.triggers.drive}
                label="drive"
                onChange={(v) => props.onPatch({ triggers: { ...state.triggers, drive: v } })}
                title="Déclenche l'aide quand le porteur attaque le panier (s'en rapproche de >25px entre 2 étapes, ou se trouve à <250px sur l'étape 0)."
              />
              <CheckboxLine
                checked={state.triggers.post}
                label="post-up"
                onChange={(v) => props.onPatch({ triggers: { ...state.triggers, post: v } })}
                title="Déclenche l'aide quand le porteur joue en poste bas (lateral 80-160px du panier, profondeur 45-145px, à l'arrêt)."
              />
              <CheckboxLine
                checked={state.triggers.paint}
                label="raquette"
                onChange={(v) => props.onPatch({ triggers: { ...state.triggers, paint: v } })}
                title="Déclenche l'aide quand le porteur entre dans la raquette ou est à <80px du panier (couvre les drives, runners, floaters près du panier)."
              />
              <CheckboxLine
                checked={!!state.triggers.trap}
                label="trap coin/sideline"
                onChange={(v) => props.onPatch({ triggers: { ...state.triggers, trap: v } })}
                title="Active la prise à deux automatique quand le porteur entre dans une zone de trappe : coin fond gauche/droit ou sideline mi-terrain. Le défenseur le plus proche vient verrouiller le côté opposé."
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
                <option value="ice">ice / no-middle (force baseline)</option>
                <option value="weak">weak (under léger, recover shooter)</option>
                <option value="peel-switch">peel switch (drop puis switch)</option>
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
            {(state.screenRule === 'drop' || state.screenRule === 'peel-switch') && (
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
                <option value="top-lock">top-lock (force côté ballon)</option>
                <option value="chase">chase / trail (suit le shooter)</option>
              </select>
            </div>
          </Section>

          <Section theme="defense" label={`Appliquer à tous (${defenderIds.length})`}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
              Pousse la même consigne sur les {defenderIds.length} défenseurs en un clic.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <MassRow label="aide %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  placeholder="—"
                  onBlur={(e) => {
                    const v = parseInt(e.target.value);
                    if (!Number.isNaN(v)) props.onUpdateAllRules({ helpPct: Math.max(0, Math.min(100, v)) });
                    e.target.value = '';
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  style={{ fontSize: 11, height: 22, padding: '0 3px', width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                  title="Saisir 0–100 puis Enter pour appliquer"
                />
              </MassRow>
              <MassRow label="priorité">
                <MassSelect
                  onPick={(v) => props.onUpdateAllRules({ priority: v as any })}
                  options={[['paint','raquette'],['man','homme'],['passlane','passe']]}
                />
              </MassRow>
              <MassRow label="vs porteur">
                <MassSelect
                  onPick={(v) => props.onUpdateAllRules({ vsCarrier: v as any })}
                  options={[
                    ['coller','coller'],['bumper','bumper'],['contester','contester'],
                    ['reculer','reculer'],['topside','topside'],['baseline','baseline'],
                  ]}
                />
              </MassRow>
              <MassRow label="hors-ballon">
                <MassSelect
                  onPick={(v) => props.onUpdateAllRules({ offBallStance: v as any })}
                  options={[
                    ['sag','sag'],['behind','derrière'],['stunt','stunt'],
                    ['deny-3q','3/4 deny'],['fronting','devant'],
                  ]}
                />
              </MassRow>
              <MassRow label="écran">
                <MassSelect
                  onPick={(v) => props.onUpdateAllRules({ screenNav: v === 'auto' ? undefined : v as any })}
                  options={[
                    ['auto','auto (global)'],['over','over'],['under','under'],['switch','switch'],
                    ['hedge','hedge'],['drop','drop'],['blitz','blitz'],
                  ]}
                />
              </MassRow>
              <MassRow label="aide mode">
                <MassSelect
                  onPick={(v) => props.onUpdateAllRules({ helpMode: v as any })}
                  options={[
                    ['auto','auto'],['aggressive','agressif'],['passive','passif'],['disabled','désactivé'],
                  ]}
                />
              </MassRow>
              <MassRow label="regard">
                <MassSelect
                  onPick={(v) => props.onUpdateAllRules({ gazeLock: v === 'auto' ? undefined : v as any })}
                  options={[
                    ['auto','auto'],['opponent','🔒 mon homme'],
                    ['ball-carrier','🔒 le porteur'],['both','🔒 les deux'],
                  ]}
                />
              </MassRow>
              <MassRow label="corps">
                <MassSelect
                  onPick={(v) => props.onUpdateAllRules({ bodyOrientationMode: v === 'auto' ? undefined : v as any })}
                  options={[
                    ['auto','auto'],['open','ouvert'],['face-man','face homme'],
                    ['face-ball','face porteur'],['pass-lane-flat','passe à plat'],
                    ['pass-lane-perp','passe perpend.'],
                  ]}
                />
              </MassRow>
            </div>
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={props.onResetIndividualOverrides}
                style={{
                  fontSize: 10,
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  cursor: 'pointer',
                  width: '100%',
                }}
                title="Efface les overrides individuels (distance, vit. max, closeout, denial, screenNav). Tous retombent sur les sliders globaux ci-dessus."
              >
                Réinitialiser les overrides individuels
              </button>
            </div>
          </Section>

          <Section theme="defense" label="Règles individuelles">
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
              Astuce : clic-droit sur un défenseur pour ouvrir un menu rapide.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '24px 36px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 3, fontSize: 10, color: '#64748b' }}>
              <span></span>
              <span>aide</span>
              <span>prio.</span>
              <span>vs porteur</span>
              <span>hors-bal.</span>
              <span>écran</span>
            </div>
            {defenderIds.map((dId) => {
              const r = state.rules[dId];
              return (
                <div
                  key={dId}
                  style={{ display: 'grid', gridTemplateColumns: '24px 36px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 3, alignItems: 'center', fontSize: 11 }}
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
                    style={{ fontSize: 11, height: 22, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                  >
                    <option value="paint">raquette</option>
                    <option value="man">homme</option>
                    <option value="passlane">passe</option>
                  </select>
                  <select
                    value={r.vsCarrier}
                    onChange={(e) => props.onUpdateRule(dId, { vsCarrier: e.target.value as any })}
                    style={{ fontSize: 11, height: 22, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
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
                    style={{ fontSize: 11, height: 22, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
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
                    style={{ fontSize: 11, height: 22, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
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

      <SimulationSection state={state} />

    </Panel>
  );
}

/** Une rangée de la section "Appliquer à tous" : label gauche fixe + control
 *  qui s'étire sur le reste. Layout flex pour rester compact même en colonne
 *  étroite — les selects se compressent via `min-width: 0`. */
function MassRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ fontSize: 10, color: '#64748b', flex: '0 0 80px' }}>{label}</span>
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** Select "appliquer à tous" : option `—` neutre, dispatch au choix d'une
 *  vraie valeur, puis se réinitialise pour permettre de re-pousser. */
function MassSelect({
  options,
  onPick,
}: {
  options: [value: string, label: string][];
  onPick: (value: string) => void;
}) {
  return (
    <select
      defaultValue=""
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        onPick(v);
        e.target.value = '';
      }}
      style={{ fontSize: 11, height: 22, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
    >
      <option value="">—</option>
      {options.map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}
