'use client';

import { InterfaceGate, useInterfaceLevel } from './interface/InterfaceLevel';
import { PX_PER_M } from '@/lib/data/court';
import { movementBudgetToMps, mpsToMovementBudget } from '@/lib/logic/displayUnits';

import { useState } from 'react';
import type {
  AppState,
  AttackerId,
  DefenderId,
  ScreenRule,
  DefenseSystem,
  ZoneConfig,
  DropDepth,
  OffBallScreenRule,
  RotationMemoryMode,
  Step,
} from '@/lib/types';
import { Panel, AccordionSection, Slider, CheckboxLine, Button, COLORS, InfoTooltip } from './ui';
import { DEFENSE_PRESETS, advancedPlacementPatch, isAdvancedPlacementOn, type DefensePreset } from '@/lib/data/defensePresets';
import type { UserDefensePreset } from '@/lib/data/library';
import { SystemSelector, type SystemChoice } from './defense/SystemSelector';
import { getActiveDefenderIds } from '@/lib/logic/players';
import { resolveRealismFlags } from '@/lib/logic/realismProfile';

const HELP_TRIGGERS_TOOLTIP =
  "Les triggers d'aide sont les conditions qui autorisent l'aide automatique. Quand l'un d'eux est actif, les défenseurs avec aide % > 0 peuvent quitter leur homme selon leur priorité.";

const HELP_TRIGGER_TOOLTIPS = {
  drive:
    "Déclenche l'aide quand le porteur attaque le panier : il avance nettement vers le cercle ou démarre déjà proche de la zone dangereuse.",
  post:
    "Déclenche l'aide quand le porteur joue dos au panier en poste bas. Les aides peuvent venir digger ou doubler selon les réglages avancés.",
  paint:
    "Déclenche l'aide quand le porteur entre dans la raquette ou arrive très près du panier. Sert à fermer layups, runners et floaters.",
  trap:
    "Déclenche une prise à deux automatique en zone de trappe, surtout coin ou sideline. Un deuxième défenseur vient verrouiller l'espace du porteur.",
} as const;

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
  /** Variante animée du "Tout en auto" : capture les positions manuelles et
   *  les fait glisser vers les positions auto sur ~700 ms (pédagogique pour
   *  montrer aux joueurs). Cf. useAppState.clearAllDefenseOverridesActiveStepAnimated. */
  onClearAllDefenseOverridesAnimated: () => void;
  onLoadAiSteps?: (steps: Step[], startStepIndex: number) => void;
  /** B4 — résultat de `useMatchLoop` remonté au niveau page pour que
   *  SimulationSection (HUD) et CourtView (rendu terrain) partagent la
   *  même source. Optionnel pour rétrocompat. */
  matchLoop?: import('@/hooks/useMatchLoop').UseMatchLoopResult;
  /** Vitesse de la game loop (1, 2, 4, 8). Modifiable en cours via
   *  le sélecteur dans LiveMatchPanel. */
  matchSpeed?: number;
  /** Setter de la vitesse. */
  onSetMatchSpeed?: (speed: number) => void;
  /** Active le mode "match plein écran" (fullCourt + presentMode +
   *  browser fullscreen). Propagé à SimulationSection qui rend le bouton. */
  onEnterFullscreenMatch?: () => void;
  /** Phase 1.3 — Lance le Mode démo 1-click (10 possessions, full court, ×2). */
  onStartDemoMode?: () => void;
  scriptedDefenseEnabled?: boolean;
  onToggleScriptedDefense: () => void;
  userDefensePresets?: UserDefensePreset[];
  onSaveDefensePreset?: (name: string) => void;
  onApplyUserDefensePreset?: (preset: UserDefensePreset) => void;
  onDeleteDefensePreset?: (id: string) => void;
}

export function DefensePanel(props: DefensePanelProps) {
  const { state } = props;
  const { analysis } = useInterfaceLevel();
  const c = COLORS.defense;
  // Valeurs réellement appliquées (profil Réaliste + choix explicites).
  const realismFlags = resolveRealismFlags(state);
  const isMan = state.defenseSystem === 'man';
  const defenderIds = getActiveDefenderIds(state.playerCount);
  const scriptedOn = props.scriptedDefenseEnabled !== false;

  const handleSystemChange = (choice: SystemChoice) => {
    if (choice.kind === 'man') {
      props.onSetDefenseSystem('man');
    } else if (choice.kind === 'zone') {
      props.onSetDefenseSystem('zone');
      props.onUpdateZoneConfig({ type: choice.zoneType });
    } else if (choice.kind === 'junk') {
      props.onSetDefenseSystem('junk');
      // F.1 — bascule en junk : si junkConfig pas défini, init avec O1 par défaut.
      if (!state.junkConfig) {
        props.onPatch({ junkConfig: { type: choice.junkType, chaser: 'O1' } });
      } else if (state.junkConfig.type !== choice.junkType) {
        props.onPatch({ junkConfig: { ...state.junkConfig, type: choice.junkType } });
      }
    } else if (choice.kind === 'press') {
      // F.2 — bascule en press : init pressConfig si pas défini.
      props.onSetDefenseSystem('press');
      if (!state.pressConfig) {
        props.onPatch({ pressConfig: { type: choice.pressType } });
      } else if (state.pressConfig.type !== choice.pressType) {
        props.onPatch({ pressConfig: { ...state.pressConfig, type: choice.pressType } });
      }
    }
  };

  return (
    <Panel theme="defense" title="🛡 Défense" fill>
      {/* Bannière "Mode manuel actif" — affichée quand scriptedDirectives est désactivé.
          Le coach voit immédiatement que le moteur ne recalcule plus. */}
      {!scriptedOn && (
        <div
          style={{
            padding: '6px 10px',
            background: 'rgba(251, 191, 36, 0.12)',
            border: '1px solid rgba(251, 191, 36, 0.4)',
            borderRadius: 6,
            fontSize: 11,
            color: '#fbbf24',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 8,
          }}
        >
          <span aria-hidden>⚠</span>
          <span>
            <strong>Mode manuel actif</strong> — le moteur ne recalcule plus
            automatiquement. Réactiver l'auto via la consigne ci-dessous.
          </span>
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        {/* Preset officiel (uniquement en mode individuelle — choix Q4) */}
        {isMan && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: '0 0 48px' }}>Style</span>
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                const preset = DEFENSE_PRESETS.find((p) => p.id === id);
                if (preset && confirm(`Appliquer "${preset.name}" ?\n\n${preset.description}`)) {
                  props.onApplyDefensePreset(preset);
                }
                (e.target as HTMLSelectElement).value = '';
              }}
              style={{ flex: '1 1 0%', minWidth: 0, fontSize: 11, padding: '3px 4px' }}
              aria-label="Style de défense"
              title="Appliquer des consignes cohérentes de pression, d’aide et de défense sur écran"
            >
              <option value="">Choisir un style…</option>
              {DEFENSE_PRESETS.map((p) => (
                <option key={p.id} value={p.id} title={p.description}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {isMan && (
          <CheckboxLine
            checked={isAdvancedPlacementOn(state)}
            label="Placement défensif avancé"
            onChange={(v) => props.onPatch(advancedPlacementPatch(v))}
            title="S'ajoute au style choisi. Côté faible : le défenseur se place sur l'axe du panier, un pied dans la raquette (voit ballon et homme). Quand le porteur attaque le panier, l'aide se resserre avant même le drive. Pendant une passe, le défenseur proche fait un pas dans la ligne. Ballon sur l'aile, le défenseur du joueur en tête conteste le renversement."
          />
        )}
        {/* P4.4 — Mémoire de rotation : que devient le tag une fois l'écran fini. */}
        {isMan && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
            <span
              style={{ fontSize: 10, color: '#cbd5e1', flex: '0 0 48px' }}
              title="Après un tag sur pick-and-roll : qui garde le roller une fois l'écran terminé. Les défenseurs en rotation (tag, X-out, stunt) finissent leur rotation au lieu de repartir d'un coup, et les duels échangés se rendent leurs hommes quand le ballon ressort."
            >
              Après tag
            </span>
            <select
              value={state.rotationMemory ?? 'off'}
              onChange={(e) => {
                const v = e.target.value;
                props.onPatch({ rotationMemory: v === 'off' ? undefined : (v as RotationMemoryMode) });
              }}
              aria-label="Rotation après un tag"
              title="auto : le plus proche du roller le garde (le tagueur reste et le pivot prend son homme, ou le tagueur rend le roller au pivot). Sur une passe à l'homme laissé libre, le défenseur du X-out fait le closeout et un coéquipier prend son homme (auto et « garde le roller »). Retour aux duels d'origine au retour au calme."
              style={{ flex: '1 1 0%', minWidth: 0, fontSize: 11, padding: '3px 4px' }}
            >
              <option value="off">recalcul à chaque étape</option>
              <option value="auto">auto : le plus proche garde le roller</option>
              <option value="stay">le tagueur garde le roller</option>
              <option value="recover">le tagueur revient sur son homme</option>
            </select>
          </div>
        )}
        {/* Réaliste / Idéal — même réglage que Paramètres › Physique, exposé au
            coach : « idéal » pour enseigner la bonne position sans retard,
            « réaliste » pour montrer ce qui se passe vraiment. */}
        <div role="group" aria-label="Déplacements" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 10, color: '#cbd5e1', flex: '0 0 48px' }}>Déplac.</span>
          {([
            ['realistic', 'réalistes', "Accélération, freinage, trafic et poursuite : les défenseurs peuvent être en retard, comme en match."],
            ['legacy', 'idéaux', 'Positions idéales, sans retard physique : pour enseigner où chacun doit être.'],
          ] as const).map(([profile, label, help]) => {
            const active = profile === 'realistic'
              ? state.realismProfile === 'realistic'
              : state.realismProfile !== 'realistic';
            return (
              <button
                key={profile}
                type="button"
                aria-pressed={active}
                title={help}
                onClick={() => props.onPatch({ realismProfile: profile })}
                className="bt-touch"
                style={{
                  flex: '1 1 0%',
                  fontSize: 11,
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: `1px solid ${active ? c.accent : '#475569'}`,
                  background: active ? '#1d4ed8' : 'transparent',
                  color: active ? '#fff' : '#cbd5e1',
                  cursor: 'pointer',
                  fontWeight: active ? 700 : 500,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

      </div>

      {/* ========================================================================
          PINNED 1 — Système de défense (la décision pivot)
          ====================================================================== */}
      <AccordionSection
        id="defense-system"
        theme="defense"
        label="Système de défense"
        icon="🎯"
        variant="pinned"
      >
        {/* Boutons "Tout en auto" — 2 variantes :
            - rapide : instantané, pour le coach qui bosse vite
            - réel : anime le retour des défenseurs à leur position auto sur
              ~700 ms (pédagogique, pour montrer aux joueurs ce que devrait
              être la réaction défensive correcte) */}
        {(() => {
          const cur = state.steps[state.activeStep];
          const activeDefenders = new Set(defenderIds);
          const overrideCount = cur?.defenseOverrides
            ? Object.keys(cur.defenseOverrides).filter((id) => activeDefenders.has(id as DefenderId)).length
            : 0;
          const disabled = overrideCount === 0;
          const countLabel = overrideCount > 0
            ? `(${overrideCount} manuel${overrideCount > 1 ? 's' : ''})`
            : '';
          const baseStyle = {
            fontSize: 11,
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid',
            borderColor: disabled ? '#cbd5e1' : '#4338ca',
            background: disabled ? '#f8fafc' : '#eef2ff',
            color: disabled ? '#94a3b8' : '#3730a3',
            cursor: disabled ? 'default' : 'pointer',
            fontWeight: 600,
            flex: 1,
            minWidth: 0,
          } as const;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={props.onClearAllDefenseOverrides}
                  disabled={disabled}
                  title="Libère tous les défenseurs en placement manuel sur cette étape — instantané."
                  style={baseStyle}
                >
                  🧠 ⚡ rapide
                </button>
                <button
                  type="button"
                  onClick={props.onClearAllDefenseOverridesAnimated}
                  disabled={disabled}
                  title="Libère tous les défenseurs en placement manuel — anime le retour à leur position auto (pour montrer aux joueurs)."
                  style={baseStyle}
                >
                  🧠 ▶ réel
                </button>
              </div>
              {overrideCount > 0 && (
                <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>
                  {countLabel}
                </div>
              )}
            </div>
          );
        })()}
        <SystemSelector
          defenseSystem={state.defenseSystem}
          zoneType={state.zoneConfig.type}
          junkType={state.junkConfig?.type}
          pressType={
            state.pressConfig?.type === 'full-court' || state.pressConfig?.type === '1-2-1-1'
              ? 'full-court'
              : state.pressConfig?.type === 'half-court' || state.pressConfig?.type === '2-2-1'
                ? 'half-court'
                : undefined
          }
          onChange={handleSystemChange}
        />

        {/* F.1 — Sub-config junk : 1 ou 2 sélecteurs de chasseur selon le type. */}
        {state.defenseSystem === 'junk' && (() => {
          const jType = state.junkConfig?.type ?? 'box-and-1';
          const needsTwoChasers = jType === 'triangle-and-2';
          const labels: Record<typeof jType, string> = {
            'box-and-1':       'Box-and-1 (4 zone + 1 chasseur)',
            'triangle-and-2':  'Triangle-and-2 (3 zone + 2 chasseurs)',
            'diamond-and-1':   'Diamond-and-1 (losange + 1 chasseur)',
          };
          const desc: Record<typeof jType, string> = {
            'box-and-1':       '4 défenseurs sur les corners de la raquette, le chasseur colle le shooter en strict.',
            'triangle-and-2':  '3 défenseurs en triangle (1 haut + 2 blocks), 2 chasseurs sur les 2 shooters dangereux.',
            'diamond-and-1':   '4 défenseurs en losange 1-2-1 (NCAA), le chasseur colle le shooter en strict.',
          };
          const renderChaserButtons = (current: AttackerId | undefined, onPick: (oId: AttackerId) => void, disabled?: AttackerId) => (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['O1', 'O2', 'O3', 'O4', 'O5'] as const).map((oId) => {
                const active = current === oId;
                const isDisabled = disabled === oId;
                return (
                  <button
                    key={oId}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => !isDisabled && onPick(oId)}
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: `1.5px solid ${active ? '#c2410c' : isDisabled ? 'rgba(120, 113, 108, 0.35)' : 'rgba(253, 186, 116, 0.4)'}`,
                      background: active ? '#c2410c' : 'rgba(216, 90, 48, 0.05)',
                      color: active ? '#fff' : isDisabled ? '#78716c' : '#fdba74',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      fontWeight: active ? 700 : 500,
                      opacity: isDisabled ? 0.4 : 1,
                    }}
                  >
                    {oId}
                  </button>
                );
              })}
            </div>
          );
          return (
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 6,
                background: 'rgba(216, 90, 48, 0.10)',
                border: '1px solid rgba(253, 186, 116, 0.28)',
              }}
            >
              <div style={{ fontSize: 11, color: '#fdba74', fontWeight: 600, marginBottom: 6 }}>
                {labels[jType]} — chasseur{needsTwoChasers ? ' n°1' : ''}
              </div>
              {renderChaserButtons(
                state.junkConfig?.chaser,
                (oId) => props.onPatch({
                  junkConfig: { type: jType, chaser: oId, chaser2: state.junkConfig?.chaser2 },
                }),
                needsTwoChasers ? state.junkConfig?.chaser2 : undefined,
              )}
              {needsTwoChasers && (
                <>
                  <div style={{ fontSize: 11, color: '#fdba74', fontWeight: 600, marginTop: 8, marginBottom: 6 }}>
                    Chasseur n°2
                  </div>
                  {renderChaserButtons(
                    state.junkConfig?.chaser2,
                    (oId) => props.onPatch({
                      junkConfig: { type: jType, chaser: state.junkConfig?.chaser ?? 'O1', chaser2: oId },
                    }),
                    state.junkConfig?.chaser,
                  )}
                </>
              )}
              <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 6, lineHeight: 1.35 }}>
                {desc[jType]} helpMode désactivé pour le(s) chasseur(s).
              </div>
            </div>
          );
        })()}

        {/* F.2 — Sub-config press : adapté selon V1 (half-court 2-2-1)
            ou V2 (full-court 1-2-1-1 + trap). */}
        {state.defenseSystem === 'press' && (() => {
          const pType = state.pressConfig?.type ?? 'half-court';
          const isFull = pType === 'full-court' || pType === '1-2-1-1';
          return (
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 6,
                background: 'rgba(220, 38, 38, 0.10)',
                border: '1px solid rgba(252, 165, 165, 0.28)',
              }}
            >
              <div style={{ fontSize: 11, color: '#fca5a5', fontWeight: 600, marginBottom: 6 }}>
                {isFull ? 'Full-court press (1-2-1-1)' : 'Half-court press (2-2-1)'}
              </div>
              <div style={{ fontSize: 9.5, color: '#94a3b8', lineHeight: 1.4 }}>
                {isFull ? (
                  <>
                    5 défenseurs en pression tout terrain : 1 chaser sur la
                    remise adverse, 2 wings backcourt, 1 protecteur médiane,
                    1 sweeper sous notre panier.
                    <br />
                    <strong>V2 trap dynamique</strong> : quand le porteur franchit la
                    médiane (côté offense), les 2 défenseurs les plus proches
                    sautent dessus (environ 0,9 m vers le porteur).
                    <br />
                    Retreat progressive si press cassée : reportée V2.5.
                  </>
                ) : (
                  <>
                    5 défenseurs positionnés sur le terrain offensif : 2 sur la
                    ligne médiane, 2 zone de relais, 1 sweeper centre.
                    <br />
                    <strong>V1 statique</strong> : pas de trap dynamique. Pour le trap
                    + full-court, choisir le mode "Full-court" ci-dessus.
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* Sub-config visible uniquement en zone (Q6 fusion) */}
        {!isMan && (
          <div
            style={{
              marginTop: 10,
              padding: 8,
              background: '#262a32',
              border: '1px solid #2a2d35',
              borderRadius: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              ⚙ Réglages zone
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
            <Slider
              label="aide raquette"
              min={0}
              max={100}
              step={5}
              value={state.zoneConfig.paintCoverage ?? 50}
              onChange={(v) => props.onUpdateZoneConfig({ paintCoverage: v })}
            />
            <Slider
              label="protect. panier"
              min={0}
              max={100}
              step={5}
              value={state.zoneConfig.rimProtection ?? 50}
              onChange={(v) => props.onUpdateZoneConfig({ rimProtection: v })}
            />
            <Slider
              label="deny passes"
              min={0}
              max={100}
              step={5}
              value={state.zoneConfig.passDenial ?? 50}
              onChange={(v) => props.onUpdateZoneConfig({ passDenial: v })}
            />
            <CheckboxLine
              checked={state.zoneConfig.trapCorners}
              label="trap en coin"
              onChange={(v) => props.onUpdateZoneConfig({ trapCorners: v })}
            />
            <CheckboxLine
              checked={state.zoneConfig.extendTo3pt}
              label="étend à 3 pts"
              onChange={(v) => props.onUpdateZoneConfig({ extendTo3pt: v })}
            />
            <CheckboxLine
              checked={!!state.zoneEditMode}
              label="✎ mode édition zones"
              onChange={(v) => props.onPatch({ zoneEditMode: v })}
              title="Active l'overlay interactif : drag des homePos (rond coloré) pour repositionner. Drag des sommets blancs pour reshaper le polygone. Clic sur une arête pour ajouter un sommet. Shift+clic pour supprimer."
            />
          </div>
        )}
      </AccordionSection>

      {/* ========================================================================
          PINNED 2 — Consignes équipe
          ====================================================================== */}
      <AccordionSection
        id="defense-team-instructions"
        theme="defense"
        label="Consignes équipe"
        icon="⚡"
        variant="pinned"
      >
        {/* Consigne écran porteur (toujours visible, central pour démos) */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#cbd5e1', flex: '0 0 48px' }}>écran</span>
          <select
            value={state.screenRule}
            onChange={(e) => props.onSetScreenRule(e.target.value as ScreenRule)}
            style={{ flex: '1 1 0%', minWidth: 0, fontSize: 11, padding: '3px 4px' }}
            title="Comment la défense gère un écran porteur (over, under, switch, hedge, drop, blitz, ice, weak, peel-switch)"
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

        {/* Triggers d'aide (4 checkboxes inline + tooltip global) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 500,
            color: c.accentText,
          }}
        >
          <span>Triggers d'aide</span>
          <InfoTooltip title={HELP_TRIGGERS_TOOLTIP} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px' }}>
          <HelpTriggerCheckbox
            checked={state.triggers.drive}
            label="drive"
            onChange={(v) => props.onPatch({ triggers: { ...state.triggers, drive: v } })}
            title={HELP_TRIGGER_TOOLTIPS.drive}
          />
          <HelpTriggerCheckbox
            checked={state.triggers.post}
            label="post-up"
            onChange={(v) => props.onPatch({ triggers: { ...state.triggers, post: v } })}
            title={HELP_TRIGGER_TOOLTIPS.post}
          />
          <HelpTriggerCheckbox
            checked={state.triggers.paint}
            label="raquette"
            onChange={(v) => props.onPatch({ triggers: { ...state.triggers, paint: v } })}
            title={HELP_TRIGGER_TOOLTIPS.paint}
          />
          <HelpTriggerCheckbox
            checked={!!state.triggers.trap}
            label="trap coin/sideline"
            onChange={(v) => props.onPatch({ triggers: { ...state.triggers, trap: v } })}
            title={HELP_TRIGGER_TOOLTIPS.trap}
          />
        </div>

        {/* Mode Auto / Manuel — remplace l'ancienne checkbox header */}
        <div
          style={{
            marginTop: 4,
            padding: '4px 8px',
            background: scriptedOn ? '#dbeafe' : '#fef3c7',
            border: `1px solid ${scriptedOn ? '#93c5fd' : '#fcd34d'}`,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
          title="Auto = le moteur recalcule à chaque step. Manuel = les positions actuelles sont figées (utile pour figer une configuration avant démonstration)."
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: '#93c5fd' }}>Mode :</span>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: scriptedOn ? 700 : 400,
              color: scriptedOn ? '#1e3a8a' : '#475569',
            }}
          >
            <input
              type="radio"
              name="defenseMode"
              checked={scriptedOn}
              onChange={() => {
                if (!scriptedOn) props.onToggleScriptedDefense();
              }}
            />
            🤖 auto
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: !scriptedOn ? 700 : 400,
              color: !scriptedOn ? '#92400e' : '#475569',
            }}
          >
            <input
              type="radio"
              name="defenseMode"
              checked={!scriptedOn}
              onChange={() => {
                if (scriptedOn) props.onToggleScriptedDefense();
              }}
            />
            ✋ manuel
          </label>
        </div>
      </AccordionSection>

      {/* ========================================================================
          NEUTRAL — Réglages globaux (sliders + écrans fins + couvertures avancées)
          ====================================================================== */}
      {isMan && analysis && (
        <AccordionSection
          id="defense-global-settings"
          theme="defense"
          label="Réglages globaux"
          icon="🎚"
          variant="neutral"
          defaultOpen={false}
        >
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
            Paramètres de marquage qui s'appliquent à toute l'équipe par défaut.
          </div>
          <Slider
            label="distance (m)"
            min={15 / PX_PER_M}
            max={150 / PX_PER_M}
            step={0.01}
            value={state.defenseDistance / PX_PER_M}
            onChange={(v) => { if (v !== Number((state.defenseDistance / PX_PER_M).toFixed(2))) props.onPatch({ defenseDistance: Math.max(15, Math.min(150, v * PX_PER_M)) }); }}
            title="Distance de marquage en mètres : environ 1,1 m par défaut, 2,7 m pour laisser davantage d’espace. La séparation physique entre joueurs reste prioritaire."
          />
          <Slider
            label="vit. (m/s)"
            min={movementBudgetToMps(40)}
            max={movementBudgetToMps(200)}
            step={0.01}
            value={movementBudgetToMps(state.defenseMaxSpeed)}
            onChange={(v) => { if (v !== Number(movementBudgetToMps(state.defenseMaxSpeed).toFixed(2))) props.onPatch({ defenseMaxSpeed: Math.max(40, Math.min(200, mpsToMovementBudget(v))) }); }}
            title="Budget de déplacement ramené à une seconde (transition de référence : 4 s). Les multiplicateurs de closeout et de profil peuvent modifier la vitesse effective."
          />
          <Slider
            label="closeout ×"
            min={1}
            max={2}
            step={0.1}
            value={state.closeoutBoost ?? 1.4}
            onChange={(v) => props.onPatch({ closeoutBoost: v })}
            title="Multiplicateur global de vitesse pour le défenseur du nouveau porteur quand le ballon arrive sur lui."
          />
          <Slider
            label="denial agr."
            min={0}
            max={1}
            step={0.05}
            value={state.denyAggressiveness ?? 0.45}
            onChange={(v) => props.onPatch({ denyAggressiveness: v })}
            title="Force globale du marquage en avant côté ballon."
          />
          <InterfaceGate min="development">
          <Slider
            label="CVT amorti px"
            min={4}
            max={30}
            step={1}
            value={state.steeringSlowingRadius ?? 12}
            onChange={(v) => props.onPatch({ steeringSlowingRadius: v })}
            title="Moteur de forces — rayon de décélération arrive. Plus grand = défenseur plus amorti près de sa cible (anti-oscillation) mais plus traînard ; plus petit = suivi nerveux. Défaut 12."
          />
          <Slider
            label="CVT repel écran"
            min={0}
            max={60}
            step={2}
            value={state.steeringScreenRepelWeight ?? 20}
            onChange={(v) => props.onPatch({ steeringScreenRepelWeight: v })}
            title="Moteur de forces — poids du glissement soft autour des poseurs d'écran pour les défenseurs périphériques. 0 désactive. Défaut 20."
          />
          <Slider
            label="CVT profil"
            min={0}
            max={1}
            step={0.1}
            value={state.profileWeightingIntensity ?? 1}
            onChange={(v) => props.onPatch({ profileWeightingIntensity: v })}
            title="Moteur de forces — intensité de la pondération par profil offensif (shooter = close out serré, slasher = sag franc). 1 = effet plein, 0 = marquage uniforme quel que soit le profil. Défaut 1."
          />

          {/* Écran porteur — réglages fins */}
          <details
            style={{
              marginTop: 6,
              borderTop: `1px dashed ${c.border}`,
              paddingTop: 6,
            }}
          >
            <summary
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: c.accentText,
                cursor: 'pointer',
                listStyle: 'none',
              }}
            >
              ▸ Écran porteur — réglages fins
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              <Slider
                label="détection"
                min={20}
                max={60}
                step={2}
                value={state.screenRadius}
                onChange={(v) => props.onPatch({ screenRadius: v })}
                title="Distance max (px) entre poseur et défenseur du porteur pour qu'un écran soit détecté"
              />
              {(state.screenRule === 'drop' || state.screenRule === 'peel-switch') && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 60 }}>profondeur</span>
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
              {state.screenRule === 'hedge' && (
                <Slider
                  label="agressivité hedge"
                  min={0}
                  max={100}
                  step={5}
                  value={state.hedgeAggression ?? 50}
                  onChange={(v) => props.onPatch({ hedgeAggression: v })}
                  title="Distance à laquelle D5 sort sur le porteur dans le hedge (0 = soft show, 100 = hard hedge). Override per-défenseur via clic-droit → Avancé → hedge agr."
                />
              )}
              {state.screenRule === 'hedge' && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }} title="Agressivité hedge effective par défenseur (override per-défenseur > global). Clic-droit défenseur → Avancé pour modifier.">
                  hedge/déf :{' '}
                  {(['D1', 'D2', 'D3', 'D4', 'D5'] as const)
                    .map((d) => `${d}:${state.rules[d]?.hedgeAggression ?? state.hedgeAggression ?? 50}`)
                    .join(' · ')}
                </div>
              )}
              {state.screenRule === 'hedge' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 70 }} title="C.3 — Nombre de steps consécutifs avant recovery forcé">
                    durée hedge
                  </span>
                  <select
                    value={state.hedgeRecoveryDelay ?? 'auto'}
                    onChange={(e) => {
                      const v = e.target.value;
                      props.onPatch({ hedgeRecoveryDelay: v === 'auto' ? undefined : parseInt(v) });
                    }}
                    style={{ flex: 1, fontSize: 11, padding: '3px 4px' }}
                  >
                    <option value="auto">auto (illimité)</option>
                    <option value={1}>1 step (soft show)</option>
                    <option value={2}>2 steps (standard)</option>
                    <option value={3}>3 steps (hard)</option>
                  </select>
                </div>
              )}
              {(state.screenRule === 'switch' || state.screenRule === 'peel-switch') && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 60 }} title="B8 — Filtre les switchs autorisés au niveau team">
                    policy
                  </span>
                  <select
                    value={state.switchPolicy ?? 'all'}
                    onChange={(e) => props.onPatch({ switchPolicy: e.target.value as 'all' | '1-3' | '1-4' | 'none' })}
                    style={{ flex: 1, fontSize: 11, padding: '3px 4px' }}
                  >
                    <option value="all">all (partout)</option>
                    <option value="1-3">1-3 (guards/wings)</option>
                    <option value="1-4">1-4 (sauf pivot)</option>
                    <option value="none">none (annule)</option>
                  </select>
                </div>
              )}
              {(state.screenRule === 'switch' || state.screenRule === 'peel-switch') && (
                <div style={{ padding: 6, background: 'rgba(251, 191, 36, 0.12)', borderRadius: 4, border: '1px solid rgba(251, 191, 36, 0.4)' }}>
                  <CheckboxLine
                    checked={!!state.scramSwitchEnabled}
                    label="scram switch auto"
                    onChange={(v) => props.onPatch({ scramSwitchEnabled: v })}
                    title="B1 — Après un switch qui crée un mismatch, un 3ᵉ défenseur prend l'attaquant exposé"
                  />
                  {state.scramSwitchEnabled && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 60 }}>seuil</span>
                      <select
                        value={state.mismatchThreshold ?? 2}
                        onChange={(e) => props.onPatch({ mismatchThreshold: parseInt(e.target.value) })}
                        style={{ flex: 1, fontSize: 11, padding: '3px 4px' }}
                      >
                        <option value={1}>1 — tout switch</option>
                        <option value={2}>2 — mismatch standard</option>
                        <option value={3}>3 — gros mismatch</option>
                        <option value={4}>4 — extrême</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
              <Button theme="defense" fullWidth onClick={props.onResetSwitches}>
                annuler les switches actifs
              </Button>
            </div>
          </details>

          {/* Écran non-porteur */}
          <details
            style={{
              borderTop: `1px dashed ${c.border}`,
              paddingTop: 6,
            }}
          >
            <summary
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: c.accentText,
                cursor: 'pointer',
                listStyle: 'none',
              }}
            >
              ▸ Écran non-porteur
            </summary>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 60 }}>consigne</span>
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
          </details>

          {/* Couvertures avancées (12 toggles opt-in) */}
          <details
            style={{
              borderTop: `1px dashed ${c.border}`,
              paddingTop: 6,
            }}
          >
            <summary
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: c.accentText,
                cursor: 'pointer',
                listStyle: 'none',
              }}
            >
              ▸ Couvertures avancées (auto sur patterns détectés)
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {/* B6 — Couverture post-up */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 70 }} title="B6 — couverture défensive auto au post-up">
                  post-up
                </span>
                <select
                  value={state.postCoverage ?? 'none'}
                  onChange={(e) => props.onPatch({ postCoverage: e.target.value as 'none' | 'dig' | 'double' })}
                  style={{ flex: 1, fontSize: 11, padding: '3px 4px' }}
                >
                  <option value="none">none (1c1 strict)</option>
                  <option value="dig">dig (30 % + recover)</option>
                  <option value="double">double (50 %)</option>
                </select>
              </div>
              <CheckboxLine
                checked={!!state.autoBumpCutters}
                label="bump auto sur cutters (B10)"
                onChange={(v) => props.onPatch({ autoBumpCutters: v })}
                title="Quand un cut hors-ballon est détecté, un défenseur sur la trajectoire reçoit un offset de 12px vers le cutter"
              />
              <CheckboxLine
                checked={!!state.weakSideAnchorEnabled}
                label="ancre weak-side (#8.2)"
                onChange={(v) => props.onPatch({ weakSideAnchorEnabled: v })}
                title="Désigne un défenseur côté faible (le low man, ou override coach) qui s'enfonce vers la raquette pour protéger le panier/skip. Marqueur ⚓. Clic-droit défenseur pour forcer l'ancre."
              />
              <CheckboxLine
                checked={!!state.helpSideStanceEnabled}
                label="stance split line (P1.1)"
                onChange={(v) => props.onPatch({ helpSideStanceEnabled: v })}
                title="Un défenseur côté faible dont l'homme est à deux passes du ballon se place sur l'axe du panier à hauteur du ballon (un pied dans la raquette), en vision ballon + homme — au lieu du sag proportionnel."
              />
              <CheckboxLine
                checked={!!state.weakSideShrinkEnabled}
                label="shrink sur drive naissant (P1.4)"
                onChange={(v) => props.onPatch({ weakSideShrinkEnabled: v })}
                title="Quand le porteur commence à gagner du terrain vers le panier (sous le seuil du trigger drive), les défenseurs côté faible approfondissent leur aide vers la raquette — pré-rotation avant l'aide active."
              />
              <CheckboxLine
                checked={realismFlags.congestionPenaltyEnabled}
                label="ralenti dans la foule (P3.3)"
                onChange={(v) => props.onPatch({ congestionPenaltyEnabled: v })}
                title="Un défenseur qui doit traverser plusieurs joueurs (raquette encombrée, trafic d'écrans) perd plus de vitesse que s'il en frôle un seul. Jamais figé : au pire ~55 % de sa vitesse."
              />
              <CheckboxLine
                checked={realismFlags.defenderPlaybackAccelerationEnabled}
                label="départ progressif en lecture (P3.1)"
                onChange={(v) => props.onPatch({ defenderPlaybackAccelerationEnabled: v })}
                title="Pendant la lecture animée, un défenseur à l'arrêt accélère progressivement (≈ 4,5 m/s², environ 6 m/s atteints en 1,3 s) au lieu de partir instantanément à pleine vitesse. L'accélération dépend du profil (élite / lent), des appuis (avancer, pas chassés, reculer) et du regard (voit-il son homme partir ?). Hors contact d'écran et placements manuels."
              />
              <CheckboxLine
                checked={realismFlags.defenderLeadPursuitEnabled}
                label="poursuite anticipée (P3.5)"
                onChange={(v) => props.onPatch({ defenderLeadPursuitEnabled: v })}
                title="Avec le départ progressif : un défenseur en retard coupe l'angle vers le point de rencontre avec son homme (surtout quand celui-ci change de direction) au lieu de courir derrière lui."
              />
              <CheckboxLine
                checked={!!state.jumpPassingLanesEnabled}
                label="jump ligne de passe (P2.1)"
                onChange={(v) => props.onPatch({ jumpPassingLanesEnabled: v })}
                title="Pendant le vol d'une passe, un défenseur proche de la ligne passeur→receveur fait un pas dans la ligne (tentative de déflection) puis revient — « move on the pass, not on the catch ». Visible en lecture/scrub uniquement."
              />
              <CheckboxLine
                checked={!!state.denyReversalEnabled}
                label="deny du reversal au nail (P2.2)"
                onChange={(v) => props.onPatch({ denyReversalEnabled: v })}
                title="Quand le ballon est sur une aile, le défenseur du joueur en tête glisse vers le nail (axe panier, hauteur lancers francs) pour contester la passe de renversement. Intensité pilotée par « denial agr. »."
              />
              {state.screenRule === 'blitz' && (
                <CheckboxLine
                  checked={!!state.blitzReleaseEnabled}
                  label="relâche du blitz (#8.1)"
                  onChange={(v) => props.onPatch({ blitzReleaseEnabled: v })}
                  title="Quand le ballon ressort du trap blitz, le screenerDef récupère le roller et les 2 trappeurs décrochent (easing de relâche). Badge ↩ RECOVER."
                />
              )}
              <CheckboxLine
                checked={!!state.unwindRejectedScreens}
                label="unwind sur reject screen (B2)"
                onChange={(v) => props.onPatch({ unwindRejectedScreens: v })}
                title="Quand le porteur refuse l'écran, la défense relâche la couverture sur-anticipée"
              />
              <CheckboxLine
                checked={!!state.snakeKeepCoverage}
                label="maintenir couv. sur snake (B4)"
                onChange={(v) => props.onPatch({ snakeKeepCoverage: v })}
                title="Quand un snake dribble est détecté, la quality effective de l'écran est forcée à 90 minimum"
              />
              <CheckboxLine
                checked={!!state.preRotationEnabled}
                label="pré-rotation sur écran imminent (C.4)"
                onChange={(v) => props.onPatch({ preRotationEnabled: v })}
                title="Le défenseur du porteur anticipe un écran imminent en shiftant son épaule"
              />
              <CheckboxLine
                checked={!!state.tagThenSwitchEnabled}
                label="tag-then-switch sur roller (C.5)"
                onChange={(v) => props.onPatch({ tagThenSwitchEnabled: v })}
                title="Quand le low man tag un roller proche du panier, bascule en switch implicite"
              />
              <CheckboxLine
                checked={!!state.readScreenChainsEnabled}
                label="lire les chaînes d'écrans (C.7)"
                onChange={(v) => props.onPatch({ readScreenChainsEnabled: v })}
                title="Active la réaction défensive aux re-screens / staggers / flares"
              />

              <CheckboxLine
                checked={!!state.pathAwareInterpolation}
                label="évitement entre frames PAI (expérimental)"
                onChange={(v) => props.onPatch({ pathAwareInterpolation: v })}
                title="Path-Aware Interpolation : déviation tangentielle des joueurs qui s'effleurent à <42 px pendant l'interpolation entre 2 steps. Multi-passes, cap total tunable. Préserve poseurs pinnés et défenseurs stuck d'écran (Règle 1bis). À comparer A/B."
              />
              {state.pathAwareInterpolation && (
                <Slider
                  label="PAI déviation px"
                  min={0}
                  max={16}
                  step={1}
                  value={state.paiMaxDeviation ?? 6}
                  onChange={(v) => props.onPatch({ paiMaxDeviation: v })}
                  title="Cap dur de la déviation totale par joueur et par frame. Plus grand = évitement plus marqué entre frames ; 0 neutralise PAI. Défaut 6."
                />
              )}
              <CheckboxLine
                checked={!!state.defensiveRouting}
                label="routage défensif anticipé (D.4)"
                onChange={(v) => props.onPatch({ defensiveRouting: v })}
                title="Les défenseurs hors contact d'écran contournent les autres joueurs pendant la lecture, au lieu d'aller en ligne droite + correction a posteriori. Opt-in, à comparer A/B."
              />
              {/* C.2 V2 — Help-and-recover timing (millisecondes) */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 80 }} title="C.2 V2 — durée d'aide après disparition du trigger (ms). 1200 ms ≈ standard NBA.">
                  durée d'aide
                </span>
                <input
                  type="range"
                  min={0}
                  max={2500}
                  step={100}
                  value={state.helpStickinessMs ?? 0}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    // Active V2 → désactive V1 legacy (évite double mode).
                    props.onPatch({
                      helpStickinessMs: v === 0 ? undefined : v,
                      helpStickiness: undefined,
                    });
                  }}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 56, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {state.helpStickinessMs && state.helpStickinessMs > 0
                    ? `${state.helpStickinessMs} ms`
                    : 'auto'}
                </span>
              </div>
              <div style={{ fontSize: 9, color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>
                C.1 closeout sprint+freinage et C.6 help angle continu sont
                actifs en permanence (sans toggle).
              </div>
              {/* F.4 — Fautes équipe défense pour le quart en cours */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 110 }} title="F.4 — Fautes équipe défense du quart. À 5, l'équipe est en bonus et le 'foul to give' devient interdit.">
                  fautes équipe (F.4)
                </span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={1}
                  value={state.defenseTeamFouls ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(5, parseInt(e.target.value) || 0));
                    props.onPatch({ defenseTeamFouls: v });
                  }}
                  style={{ width: 56, fontSize: 11, padding: '3px 4px' }}
                />
                <span style={{ fontSize: 10, color: '#94a3b8' }}>/ 5</span>
              </div>
              {/* F.5 — Late shot clock defense */}
              <CheckboxLine
                checked={!!state.lateShotClockDefenseEnabled}
                label="late shot clock — no help (F.5)"
                onChange={(v) => props.onPatch({ lateShotClockDefenseEnabled: v })}
                title="Sous 5s du shot clock, la défense désactive l'aide (contest direct sur le porteur). Effet seulement si step.shotClockRemaining est défini."
              />
              {/* G.3 — Modèle d'accélération */}
              <CheckboxLine
                checked={!!state.accelerationModelEnabled}
                label="accélération progressive (G.3)"
                onChange={(v) => props.onPatch({ accelerationModelEnabled: v })}
                title="Au step 1, le défenseur ne peut parcourir que `defenderAcceleration` px max (au lieu d'atteindre top speed instantanément). Modélise la latence d'accélération réelle."
              />
              {state.accelerationModelEnabled && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
                  <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 90 }} title="G.3 — accélération max en px/step². 75 ≈ top speed atteinte en ~2 steps.">
                    accel (px/step²)
                  </span>
                  <input
                    type="range"
                    min={20}
                    max={200}
                    step={5}
                    value={state.defenderAcceleration ?? 75}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      props.onPatch({ defenderAcceleration: v });
                    }}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {state.defenderAcceleration ?? 75}
                  </span>
                </div>
              )}
            </div>
          </details>
          </InterfaceGate>
        </AccordionSection>
      )}

      {/* En mode zone, réglages globaux marquage uniquement (sans écrans/couvertures détaillées) */}
      {!isMan && analysis && (
        <AccordionSection
          id="defense-global-settings-zone"
          theme="defense"
          label="Réglages globaux"
          icon="🎚"
          variant="neutral"
          defaultOpen={false}
        >
          <Slider
            label="vit. (m/s)"
            min={movementBudgetToMps(40)}
            max={movementBudgetToMps(200)}
            step={0.01}
            value={movementBudgetToMps(state.defenseMaxSpeed)}
            onChange={(v) => { if (v !== Number(movementBudgetToMps(state.defenseMaxSpeed).toFixed(2))) props.onPatch({ defenseMaxSpeed: Math.max(40, Math.min(200, mpsToMovementBudget(v))) }); }}
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
        </AccordionSection>
      )}

      {/* ========================================================================
          PINNED 3 — Appliquer à tous (adaptatif individuelle / zone)
          ====================================================================== */}
      <AccordionSection
        id="defense-apply-all"
        theme="defense"
        label={`Appliquer à tous (${defenderIds.length})`}
        icon="🎯"
        variant="pinned"
      >
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>
          Pousse la même consigne sur les {defenderIds.length} défenseurs en un clic.
        </div>

        {isMan ? (
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
                options={[['paint', 'raquette'], ['man', 'homme'], ['passlane', 'passe']]}
              />
            </MassRow>
            <MassRow label="vs porteur">
              <MassSelect
                onPick={(v) => props.onUpdateAllRules({ vsCarrier: v as any })}
                options={[
                  ['coller', 'coller'], ['bumper', 'bumper'], ['contester', 'contester'],
                  ['reculer', 'reculer'], ['topside', 'topside'], ['baseline', 'baseline'],
                  ['main-faible', 'main faible'],
                ]}
              />
            </MassRow>
            <MassRow label="hors-ballon">
              <MassSelect
                onPick={(v) => props.onUpdateAllRules({ offBallStance: v as any })}
                options={[
                  ['sag', 'sag'], ['behind', 'derrière'], ['stunt', 'stunt'],
                  ['deny-3q', '3/4 deny'], ['fronting', 'devant'],
                ]}
              />
            </MassRow>
            <MassRow label="écran">
              <MassSelect
                onPick={(v) => props.onUpdateAllRules({ screenNav: v === 'auto' ? undefined : v as any })}
                options={[
                  ['auto', 'auto (global)'], ['over', 'over'], ['under', 'under'], ['switch', 'switch'],
                  ['hedge', 'hedge'], ['drop', 'drop'], ['blitz', 'blitz'],
                ]}
              />
            </MassRow>
            <MassRow label="aide mode">
              <MassSelect
                onPick={(v) => props.onUpdateAllRules({ helpMode: v as any })}
                options={[
                  ['auto', 'auto'], ['aggressive', 'agressif'], ['passive', 'passif'], ['disabled', 'désactivé'],
                ]}
              />
            </MassRow>
            <MassRow label="regard">
              <MassSelect
                onPick={(v) => props.onUpdateAllRules({ gazeLock: v === 'auto' ? undefined : v as any })}
                options={[
                  ['auto', 'auto'], ['opponent', '🔒 mon homme'],
                  ['ball-carrier', '🔒 le porteur'], ['both', '🔒 les deux'],
                ]}
              />
            </MassRow>
            <MassRow label="corps">
              <MassSelect
                onPick={(v) => props.onUpdateAllRules({ bodyOrientationMode: v === 'auto' ? undefined : v as any })}
                options={[
                  ['auto', 'auto'], ['open', 'ouvert'], ['open-weighted', 'ouvert pondéré'],
                  ['face-man', 'face homme'], ['face-ball', 'face porteur'],
                  ['pass-lane-flat', 'passe à plat'], ['pass-lane-perp', 'passe perpend.'],
                ]}
              />
            </MassRow>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginBottom: 4 }}>
              En zone : les sliders agissent sur la zone globale. Les rotations s'appliquent à tous.
            </div>
            <MassRow label="pression bal.">
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                placeholder={`actuel ${state.zoneConfig.ballPressure}`}
                onBlur={(e) => {
                  const v = parseInt(e.target.value);
                  if (!Number.isNaN(v)) props.onUpdateZoneConfig({ ballPressure: Math.max(0, Math.min(100, v)) });
                  e.target.value = '';
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{ fontSize: 11, height: 22, padding: '0 3px', width: '100%', boxSizing: 'border-box' }}
                title="Saisir 0–100 puis Enter pour appliquer"
              />
            </MassRow>
            <MassRow label="rotation">
              <input
                type="number"
                min={40}
                max={200}
                step={5}
                placeholder={`actuel ${state.zoneConfig.rotationSpeed}`}
                onBlur={(e) => {
                  const v = parseInt(e.target.value);
                  if (!Number.isNaN(v)) props.onUpdateZoneConfig({ rotationSpeed: Math.max(40, Math.min(200, v)) });
                  e.target.value = '';
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{ fontSize: 11, height: 22, padding: '0 3px', width: '100%', boxSizing: 'border-box' }}
              />
            </MassRow>
            <MassRow label="aide raq.">
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                placeholder={`actuel ${state.zoneConfig.paintCoverage ?? 50}`}
                onBlur={(e) => {
                  const v = parseInt(e.target.value);
                  if (!Number.isNaN(v)) props.onUpdateZoneConfig({ paintCoverage: Math.max(0, Math.min(100, v)) });
                  e.target.value = '';
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{ fontSize: 11, height: 22, padding: '0 3px', width: '100%', boxSizing: 'border-box' }}
              />
            </MassRow>
          </div>
        )}

        {/* Boutons reset adaptatifs (toujours visibles, regroupés en bas) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {isMan && (
            <button
              type="button"
              onClick={props.onResetIndividualOverrides}
              style={{
                fontSize: 10,
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid #cbd5e1',
                background: '#262a32',
                color: '#cbd5e1',
                cursor: 'pointer',
                width: '100%',
              }}
              title="Efface les overrides individuels (distance, vit. max, closeout, denial, screenNav). Tous retombent sur les sliders globaux."
            >
              ↻ Réinitialiser overrides individuels
            </button>
          )}
        </div>
      </AccordionSection>

      {/* ========================================================================
          NEUTRAL — Règles individuelles (visible si individuelle)
          ====================================================================== */}
      {isMan && (
        <AccordionSection
          id="defense-individual-rules"
          theme="defense"
          label="Règles individuelles"
          icon="👤"
          variant="neutral"
          defaultOpen={false}
        >
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>
            Astuce : clic-droit sur un défenseur pour ouvrir un menu rapide.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '24px 36px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 3, fontSize: 10, color: '#94a3b8' }}>
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
                  <option value="main-faible">main faible</option>
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
        </AccordionSection>
      )}

      {!isMan && (
        <AccordionSection
          id="defense-zone-info"
          theme="defense"
          label="Règles individuelles"
          icon="👤"
          variant="neutral"
          defaultOpen={false}
        >
          <div style={{ fontSize: 11, color: '#94a3b8', padding: 4, fontStyle: 'italic' }}>
            En zone, les défenseurs n'ont pas de matchup individuel.
            Activer <strong>✎ mode édition zones</strong> dans le Système pour
            ajuster les homePos / régions.
          </div>
        </AccordionSection>
      )}

      {/* ========================================================================
          SECONDARY — Mes presets (sauvegardes utilisateur, B5)
          ====================================================================== */}
      {props.onSaveDefensePreset && (
        <AccordionSection
          id="defense-user-presets"
          theme="defense"
          label="Mes presets"
          icon="💾"
          variant="secondary"
          defaultOpen={false}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#cbd5e1' }}>
              Sauvegardes utilisateur (rules + screens + B/C settings)
            </span>
            <button
              onClick={() => {
                const name = prompt('Nom du preset défensif :', '');
                if (name && name.trim()) {
                  props.onSaveDefensePreset!(name.trim());
                }
              }}
              style={{
                fontSize: 10,
                padding: '3px 8px',
                borderRadius: 4,
                border: '1px solid #16a34a',
                background: '#16a34a',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              title="Sauvegarder l'état défensif actuel comme preset perso"
            >
              💾 sauvegarder
            </button>
          </div>
          {(props.userDefensePresets ?? []).length === 0 ? (
            <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>
              Aucun preset perso. Clique 💾 pour capturer l'état actuel.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {(props.userDefensePresets ?? []).map((preset) => (
                <div
                  key={preset.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 6px',
                    borderRadius: 5,
                    border: '1px solid #bbf7d0',
                    background: 'rgba(110, 231, 183, 0.10)',
                  }}
                >
                  <button
                    onClick={() => {
                      if (confirm(`Appliquer le preset perso "${preset.name}" ?`)) {
                        props.onApplyUserDefensePreset!(preset);
                      }
                    }}
                    title={`Créé le ${new Date(preset.createdAt).toLocaleDateString('fr-FR')}`}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      fontSize: 11,
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: '#6ee7b7',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    👤 {preset.name}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Supprimer "${preset.name}" ?`)) {
                        props.onDeleteDefensePreset!(preset.id);
                      }
                    }}
                    title="Supprimer ce preset"
                    style={{
                      fontSize: 10,
                      padding: '0 4px',
                      border: 'none',
                      background: 'transparent',
                      color: '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
        </AccordionSection>
      )}

      {/* ========================================================================
          SECONDARY — Lien vers page /simulation dédiée
          (la section Simulation a été migrée vers une page séparée pour ne pas
          encombrer l'éditeur. Voir src/app/simulation/page.tsx)
          ====================================================================== */}
      <div style={{ marginTop: 12, padding: '8px 10px' }}>
        <a
          href="/simulation"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            background: 'linear-gradient(180deg, #6366f1, #4338ca)',
            color: '#fff',
            borderRadius: 5,
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.3,
            boxShadow: '0 1px 2px rgba(67, 56, 202, 0.3)',
          }}
          title="Mode démo, Play IA live, Monte Carlo, replay — tout sur une page dédiée"
        >
          🎬 Ouvrir la simulation →
        </a>
      </div>
    </Panel>
  );
}

// =============================================================================
// Sous-composants internes
// =============================================================================

/** Une rangée de la section "Appliquer à tous" : label gauche fixe + control
 *  qui s'étire sur le reste. Layout flex pour rester compact même en colonne
 *  étroite — les selects se compressent via `min-width: 0`. */
function MassRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ fontSize: 10, color: '#94a3b8', flex: '0 0 80px' }}>{label}</span>
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>{children}</div>
    </div>
  );
}

function HelpTriggerCheckbox({
  checked,
  label,
  onChange,
  title,
}: {
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
  title: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
      <label
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          minWidth: 0,
          flex: '1 1 auto',
          fontSize: 12,
          color: '#e5e7eb',
          cursor: 'pointer',
        }}
      >
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label}</span>
      </label>
      <InfoTooltip title={title} />
    </div>
  );
}

/** Select "appliquer à tous" : option `—` neutre, dispatch au choix d'une
 *  vraie valeur, puis se réinitialise (state local) pour permettre de
 *  re-pousser la MÊME valeur consécutivement. Controlled pour fiabilité —
 *  l'approche uncontrolled `defaultValue=""` + `e.target.value=''` était
 *  cassée sous React 19 (concurrent rendering ne synchronisait pas le DOM
 *  avec la réinitialisation après onPick). */
function MassSelect({
  options,
  onPick,
}: {
  options: [value: string, label: string][];
  onPick: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) {
          setValue('');
          return;
        }
        onPick(v);
        setValue('');
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
