// Context menu défenseur : règles tactiques du défenseur cliqué.
//
// Organisation UI :
//  - action globale (ToolBar)
//  - placement + profil
//  - défense immédiate
//  - hors-ballon et écrans
//  - orientation et vision
//  - réglages avancés

import { useEffect, useRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Eye,
  Gauge,
  Hand,
  RotateCcw,
  Settings2,
  Shield,
  SlidersHorizontal,
  Target,
  Users,
  X,
} from 'lucide-react';
import type { ActionTimingAnchor, DefenderId, DefenderRule, Tool } from '@/lib/types';
import { DEFENDER_PROFILES, type DefenderProfile } from '@/lib/data/defenderProfiles';
import { useClampedPosition, useDraggablePopup } from './popupHooks';
import { ToolBar } from './ToolBar';
import { Row, OverrideSliderRow, GazeLockButton } from './sharedRows';
import { DARK_PANEL } from '../sidebar/SidebarThemeContext';

const BLUE_ACCENT = '#4ba3ff';
const BLUE_TINT_BG = 'rgba(75, 163, 255, 0.13)';
const BLUE_TINT_BORDER = 'rgba(75, 163, 255, 0.32)';
const AMBER_TINT_BG = 'rgba(245, 158, 11, 0.15)';
const AMBER_TINT_BORDER = 'rgba(252, 211, 77, 0.35)';

type IconComponent = LucideIcon;

function MenuSection({
  title,
  icon: Icon,
  meta,
  metaTone = 'blue',
  first,
  children,
}: {
  title: string;
  icon: IconComponent;
  meta?: string;
  metaTone?: 'blue' | 'amber';
  first?: boolean;
  children: ReactNode;
}) {
  const metaColors = metaTone === 'amber'
    ? { color: '#fdba74', background: AMBER_TINT_BG, border: AMBER_TINT_BORDER }
    : { color: '#bfdbfe', background: BLUE_TINT_BG, border: BLUE_TINT_BORDER };

  return (
    <section
      style={{
        marginTop: first ? 0 : 10,
        paddingTop: first ? 0 : 10,
        borderTop: first ? 'none' : `1px solid ${DARK_PANEL.borderSubtle}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 7,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Icon size={15} strokeWidth={2.4} />
          <span style={{ fontSize: 12, fontWeight: 850, color: DARK_PANEL.text, letterSpacing: 0 }}>
            {title}
          </span>
        </div>
        {meta && (
          <span
            style={{
              flex: '0 0 auto',
              padding: '3px 7px',
              borderRadius: 999,
              border: `1px solid ${metaColors.border}`,
              background: metaColors.background,
              color: metaColors.color,
              fontSize: 11,
              fontWeight: 850,
              lineHeight: 1,
            }}
          >
            {meta}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {children}
      </div>
    </section>
  );
}

function CollapsibleMenuSection({
  title,
  icon: Icon,
  children,
  defaultOpen,
}: {
  title: string;
  icon: IconComponent;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="bt-context-details"
      {...(defaultOpen ? { open: true } : {})}
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: `1px solid ${DARK_PANEL.borderSubtle}`,
      }}
    >
      <summary
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={15} strokeWidth={2.4} />
          <span style={{ fontSize: 12, fontWeight: 850, color: DARK_PANEL.text }}>{title}</span>
        </div>
        <span
          className="bt-context-details-state"
          aria-hidden="true"
          style={{ color: DARK_PANEL.textDim, fontSize: 11, fontWeight: 750 }}
        />
      </summary>
      <div style={{ display: 'grid', gap: 6, paddingTop: 8 }}>
        {children}
      </div>
    </details>
  );
}

function AdvancedSection({ children }: { children: ReactNode }) {
  return (
    <CollapsibleMenuSection title="Avancé" icon={SlidersHorizontal}>
      {children}
    </CollapsibleMenuSection>
  );
}

function ResetIconButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 24,
        height: 24,
        border: `1px solid ${DARK_PANEL.border}`,
        borderRadius: 6,
        background: DARK_PANEL.bgSubtle,
        cursor: 'pointer',
        color: DARK_PANEL.textDim,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      <RotateCcw size={14} strokeWidth={2.2} />
    </button>
  );
}

export interface DefenderMenuProps {
  kind: 'defender';
  dId: DefenderId;
  x: number;
  y: number;
  rule: DefenderRule;
  hasOverride: boolean;
  /** Vrai si ce défenseur marque le porteur de balle. Quand true, l'option
   *  gazeLock="opponent" est masquée car identique à "ball-carrier". */
  isCarrierDefender?: boolean;
  tool: Tool;
  actionTimingAnchor?: ActionTimingAnchor;
  onSetTool: (t: Tool) => void;
  onSetActionTimingAnchor?: (mode: ActionTimingAnchor) => void;
  onUpdate: (patch: Partial<DefenderRule>) => void;
  onApplyProfile: (profile: DefenderProfile) => void;
  onClearOverride: () => void;
  onClose: () => void;
}

export function DefenderMenu({
  dId,
  x,
  y,
  rule,
  hasOverride,
  isCarrierDefender,
  tool,
  actionTimingAnchor,
  onSetTool,
  onSetActionTimingAnchor,
  onUpdate,
  onApplyProfile,
  onClearOverride,
  onClose,
}: DefenderMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const clamped = useClampedPosition(x, y, ref);
  const drag = useDraggablePopup(clamped);

  useEffect(() => {
    if (drag.isDragging) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, drag.isDragging]);

  const placementTone = hasOverride ? 'amber' : 'blue';
  const placementMeta = hasOverride ? 'manuel' : 'auto';

  return (
    <div
      ref={ref}
      className="bt-context-menu"
      style={{
        position: 'absolute',
        left: drag.pos.x,
        top: drag.pos.y,
        width: 420,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'min(760px, calc(100vh - 150px))',
        overflowY: 'auto',
        background: DARK_PANEL.bg,
        border: `1px solid ${DARK_PANEL.border}`,
        color: DARK_PANEL.text,
        borderRadius: 12,
        padding: 12,
        zIndex: 1000,
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.48)',
      }}
    >
      <div
        onPointerDown={drag.onPointerDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
          cursor: drag.isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              background: BLUE_TINT_BG,
              border: `1px solid ${BLUE_TINT_BORDER}`,
              color: '#bfdbfe',
              flex: '0 0 auto',
            }}
          >
            <Shield size={16} strokeWidth={2.5} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{dId}</span>
            <span style={{ fontSize: 11, color: DARK_PANEL.textDim, fontWeight: 700 }}>
              réglages défenseur
            </span>
          </div>
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          aria-label="Fermer le menu"
          style={{
            width: 30,
            height: 30,
            border: `1px solid ${DARK_PANEL.border}`,
            borderRadius: 8,
            background: DARK_PANEL.bgSubtle,
            color: DARK_PANEL.textDim,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <X size={17} strokeWidth={2.4} />
        </button>
      </div>

      <ToolBar
        tool={tool}
        onSetTool={onSetTool}
        actionTimingAnchor={actionTimingAnchor}
        onSetActionTimingAnchor={onSetActionTimingAnchor}
        defenderContext
      />

      <MenuSection title="Placement" icon={Target} meta={placementMeta} metaTone={placementTone} first>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 6,
            padding: 5,
            borderRadius: 9,
            background: hasOverride ? AMBER_TINT_BG : BLUE_TINT_BG,
            border: `1px solid ${hasOverride ? AMBER_TINT_BORDER : BLUE_TINT_BORDER}`,
          }}
        >
          <button
            type="button"
            disabled={!hasOverride}
            onClick={() => {
              if (hasOverride) {
                onClearOverride();
                onClose();
              }
            }}
            style={{
              minHeight: 34,
              borderRadius: 7,
              border: `1px solid ${!hasOverride ? BLUE_ACCENT : DARK_PANEL.border}`,
              background: !hasOverride ? BLUE_ACCENT : DARK_PANEL.bgSubtle,
              color: !hasOverride ? '#07121f' : DARK_PANEL.textMuted,
              cursor: hasOverride ? 'pointer' : 'default',
              fontWeight: 850,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '0 8px',
            }}
          >
            <Settings2 size={15} strokeWidth={2.4} />
            auto
          </button>
          <button
            type="button"
            disabled
            aria-disabled
            style={{
              minHeight: 34,
              borderRadius: 7,
              border: `1px solid ${hasOverride ? '#d97706' : DARK_PANEL.border}`,
              background: hasOverride ? '#f59e0b' : DARK_PANEL.bgSubtle,
              color: hasOverride ? '#1f1300' : DARK_PANEL.textDim,
              cursor: 'default',
              fontWeight: 850,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '0 8px',
            }}
          >
            <Hand size={15} strokeWidth={2.4} />
            manuel
          </button>
        </div>

        <Row
          label="profil"
          title="Applique un profil de rôle (stopper, helper, denier). Seuls les champs définis par le profil sont écrasés ; les overrides individuels sont préservés."
        >
          <select
            value=""
            onChange={(e) => {
              const profile = DEFENDER_PROFILES.find((p) => p.id === e.target.value);
              if (profile) onApplyProfile(profile);
            }}
          >
            <option value="" disabled>choisir un profil</option>
            {DEFENDER_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Row>
      </MenuSection>

      <MenuSection title="Défense" icon={Shield}>
        <Row
          label="aide %"
          title="Intensité de l'aide quand un trigger est actif. 0 = ne quitte jamais son homme. 100 = bouge complètement vers la cible d'aide."
        >
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={rule.helpPct}
            onChange={(e) => onUpdate({ helpPct: parseInt(e.target.value) })}
            style={{ flex: 1, minWidth: 0 }}
          />
          <span style={{ fontSize: 13, minWidth: 44, textAlign: 'right', fontWeight: 850 }}>
            {rule.helpPct}%
          </span>
        </Row>
        <Row
          label="mode aide"
          title="Comportement d'aide individuel. Auto = standard selon le côté ballon. Toujours aider = aide à fond partout. Passif = garde son homme plus longtemps. Désactivé = n'aide jamais."
        >
          <select
            value={rule.helpMode ?? 'auto'}
            onChange={(e) => onUpdate({ helpMode: e.target.value as DefenderRule['helpMode'] })}
          >
            <option value="auto">auto (selon côté ballon)</option>
            <option value="aggressive">toujours aider</option>
            <option value="passive">passif (garde son homme)</option>
            <option value="disabled">désactivé (n'aide jamais)</option>
          </select>
        </Row>
        <Row
          label="priorité"
          title="Cible quand ce défenseur aide. Protéger raquette = vise le bloc bas le plus chargé. Rester sur homme = aide légère. Ligne de passe = se rabat entre son homme et le porteur."
        >
          <select
            value={rule.priority}
            onChange={(e) => onUpdate({ priority: e.target.value as DefenderRule['priority'] })}
          >
            <option value="paint">protéger raquette</option>
            <option value="man">rester sur homme</option>
            <option value="passlane">ligne de passe</option>
          </select>
        </Row>
        <Row
          label="vs porteur"
          title="Comportement quand ce défenseur défend le porteur : pression, bumper, contest, drop ou orientation vers un côté."
        >
          <select
            value={rule.vsCarrier}
            onChange={(e) => onUpdate({ vsCarrier: e.target.value as DefenderRule['vsCarrier'] })}
          >
            <option value="coller">coller (pression)</option>
            <option value="bumper">bumper (entre lui & panier)</option>
            <option value="contester">contester (recul actif)</option>
            <option value="reculer">reculer (drop)</option>
            <option value="topside">topside (force milieu)</option>
            <option value="baseline">baseline (force ligne de fond)</option>
          </select>
        </Row>
      </MenuSection>

      <CollapsibleMenuSection title="Hors ballon" icon={Users}>
        <Row
          label="stance"
          title="Position quand ce défenseur ne défend pas le porteur : aide classique, derrière, stunt, denial ou fronting."
        >
          <select
            value={rule.offBallStance ?? 'sag'}
            onChange={(e) => onUpdate({ offBallStance: e.target.value as DefenderRule['offBallStance'] })}
          >
            <option value="sag">sag (aide raquette)</option>
            <option value="behind">derrière (entre lui & panier)</option>
            <option value="stunt">stunt (fake d'aide)</option>
            <option value="deny-3q">3/4 deny (pied dans la passe)</option>
            <option value="fronting">devant (full denial)</option>
          </select>
        </Row>
        <Row
          label="vs écran"
          title="Réaction individuelle sur écran porteur. Auto utilise la règle globale ; les autres options forcent une couverture précise."
        >
          <select
            value={rule.screenNav ?? 'auto'}
            onChange={(e) => onUpdate({ screenNav: e.target.value as DefenderRule['screenNav'] })}
          >
            <option value="auto">auto (règle globale)</option>
            <option value="over">over (par-dessus)</option>
            <option value="under">under (en dessous)</option>
            <option value="switch">switch (échange)</option>
            <option value="hedge">hedge (show & recover)</option>
            <option value="drop">drop (recul)</option>
            <option value="blitz">blitz (piège)</option>
            <option value="ice">ice / no-middle</option>
            <option value="weak">weak (under léger)</option>
            <option value="peel-switch">peel switch</option>
          </select>
        </Row>
        <OverrideSliderRow
          label="distance"
          min={15}
          max={150}
          step={5}
          value={rule.distance}
          onChange={(v) => onUpdate({ distance: v })}
          onReset={() => onUpdate({ distance: undefined })}
          title="Distance individuelle défenseur ↔ son homme (px). 15 = hard deny (~0.4 m), 40 = standard, 100 = sag, 150 = deep help (~4 m). Clampée à PLAYER_MIN_CLEARANCE_PX côté moteur."
        />
        <OverrideSliderRow
          label="closeout ×"
          min={1}
          max={2}
          step={0.1}
          value={rule.closeoutBoost}
          onChange={(v) => onUpdate({ closeoutBoost: v })}
          onReset={() => onUpdate({ closeoutBoost: undefined })}
          title="Multiplicateur de vitesse quand le ballon arrive sur son homme. 1 = pas de boost, 2 = très agressif."
        />
        <OverrideSliderRow
          label="denial"
          min={0}
          max={1}
          step={0.05}
          value={rule.denyAggressiveness}
          onChange={(v) => onUpdate({ denyAggressiveness: v })}
          onReset={() => onUpdate({ denyAggressiveness: undefined })}
          title="Force du marquage en avant sur la ligne de passe. 0 = ignore, 1 = full denial assumé."
        />
        <OverrideSliderRow
          label="hedge agr."
          min={0}
          max={100}
          step={5}
          value={rule.hedgeAggression}
          onChange={(v) => onUpdate({ hedgeAggression: v })}
          onReset={() => onUpdate({ hedgeAggression: undefined })}
          title="Agressivité du show (hedge) de CE défenseur (0-100). Override le réglage global. Pertinent quand screenRule = hedge. 0 = soft (reste bas), 100 = hard (sort fort sur le porteur)."
        />
        <Row
          label="ancre weak-side"
          title="Force CE défenseur comme ancre weak-side (protection raquette côté faible), au lieu de la désignation auto. Nécessite l'option 'ancre weak-side' activée dans le panneau défense."
        >
          <input
            type="checkbox"
            checked={!!rule.weakSideAnchor}
            onChange={(e) => onUpdate({ weakSideAnchor: e.target.checked || undefined })}
          />
        </Row>
      </CollapsibleMenuSection>

      <CollapsibleMenuSection title="Orientation & vision" icon={Eye}>
        <Row
          label="force côté"
          title="Delta d'orientation du corps en degrés (-90 à +90). Positif = rotation horaire, négatif = anti-horaire. Ajoute aussi un petit décalage latéral."
        >
          <input
            type="range"
            min={-90}
            max={90}
            step={5}
            value={rule.orientation ?? 0}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              onUpdate({ orientation: v === 0 ? undefined : v });
            }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <span
            style={{
              fontSize: 12,
              minWidth: 44,
              textAlign: 'right',
              color: rule.orientation ? BLUE_ACCENT : DARK_PANEL.textDim,
              fontWeight: rule.orientation ? 850 : 700,
            }}
          >
            {rule.orientation ? `${rule.orientation > 0 ? '+' : ''}${rule.orientation}°` : '0°'}
          </span>
          {rule.orientation !== undefined && rule.orientation !== 0 && (
            <ResetIconButton
              onClick={() => onUpdate({ orientation: undefined })}
              label="Remettre la force côté à 0"
            />
          )}
        </Row>
        <Row
          label="corps"
          title="Consigne tactique d'orientation du corps. Auto suit la stance ; les modes ligne de passe orientent le corps par rapport à l'axe porteur-homme."
        >
          <select
            value={rule.bodyOrientationMode ?? 'auto'}
            onChange={(e) => {
              const v = e.target.value as NonNullable<DefenderRule['bodyOrientationMode']>;
              onUpdate({
                bodyOrientationMode: v === 'auto' ? undefined : v,
                bodyOrientation: undefined,
              });
            }}
          >
            <option value="auto">auto (selon stance)</option>
            <option value="open">ouvert homme/ballon</option>
            <option value="open-weighted">ouvert pondéré (distances)</option>
            <option value="face-man">face à mon homme</option>
            <option value="face-ball">face au porteur</option>
            <option value="pass-lane-flat">ligne passe à plat</option>
            <option value="pass-lane-perp">ligne passe perpend.</option>
          </select>
        </Row>
        <Row
          label="champ vision"
          title="Affiche un cône de vision autour de ce défenseur, centré sur son regard."
        >
          <input
            type="checkbox"
            checked={!!rule.showFieldOfView}
            onChange={(e) => onUpdate({ showFieldOfView: e.target.checked || undefined })}
            style={{ marginLeft: 'auto' }}
          />
        </Row>
        <Row
          label="angle corps"
          title="Override absolu de l'orientation du corps en degrés (0-360). Si défini, écrase le calcul auto."
        >
          <input
            type="range"
            min={0}
            max={359}
            step={5}
            value={rule.bodyOrientation ?? 0}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              onUpdate({ bodyOrientation: v });
            }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <span
            style={{
              fontSize: 12,
              minWidth: 44,
              textAlign: 'right',
              color: rule.bodyOrientation !== undefined ? BLUE_ACCENT : DARK_PANEL.textDim,
              fontWeight: rule.bodyOrientation !== undefined ? 850 : 700,
            }}
          >
            {rule.bodyOrientation !== undefined ? `${rule.bodyOrientation}°` : 'auto'}
          </span>
          {rule.bodyOrientation !== undefined && (
            <ResetIconButton
              onClick={() => onUpdate({ bodyOrientation: undefined })}
              label="Revenir au calcul auto du corps"
            />
          )}
        </Row>
        <Row
          label="regard"
          title="Verrouille le regard sur une cible dynamique. Le clamp anatomique ±75° du corps reste prioritaire."
        >
          <div style={{ display: 'flex', flex: 1, gap: 5, flexWrap: 'wrap' }}>
            <GazeLockButton label="auto" active={rule.gazeLock === undefined} onClick={() => onUpdate({ gazeLock: undefined })} />
            {!isCarrierDefender && (
              <GazeLockButton label="mon homme" active={rule.gazeLock === 'opponent'} onClick={() => onUpdate({ gazeLock: 'opponent' })} />
            )}
            <GazeLockButton label="porteur" active={rule.gazeLock === 'ball-carrier'} onClick={() => onUpdate({ gazeLock: 'ball-carrier' })} />
            <GazeLockButton label="les deux" active={rule.gazeLock === 'both'} onClick={() => onUpdate({ gazeLock: 'both' })} />
          </div>
        </Row>
      </CollapsibleMenuSection>

      <AdvancedSection>
        <OverrideSliderRow
          label="vit. max"
          min={40}
          max={200}
          step={5}
          value={rule.maxSpeed}
          onChange={(v) => onUpdate({ maxSpeed: v })}
          onReset={() => onUpdate({ maxSpeed: undefined })}
          title="Vitesse max individuelle de ce défenseur. Petit nombre = lent, grand nombre = atteint sa cible plus souvent à temps."
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 8,
            background: DARK_PANEL.bgSubtle,
            border: `1px solid ${DARK_PANEL.border}`,
            color: DARK_PANEL.textDim,
            fontSize: 12,
            fontWeight: 650,
          }}
        >
          <Gauge size={14} strokeWidth={2.3} />
          Les réglages non définis restent calés sur la règle globale.
        </div>
      </AdvancedSection>
    </div>
  );
}
