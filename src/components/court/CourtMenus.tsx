// Menus contextuels du CourtView :
//
//  - ContextMenu défenseur (rule, profil, override clear)
//  - ContextMenu attaquant (carrier, screener forcé, main, profil, orientation)
//  - ZoneRegionMenu (zone edit mode uniquement, edit d'une région)
//
// Le composant ne gère AUCUN state interne : la frame courante et les
// callbacks de mutation viennent du parent. La fermeture (`onClose`) est
// elle aussi déléguée pour pouvoir remettre `null` dans le state du parent.

import { actionsOfStep } from '@/lib/logic/stepActions';
import type {
  Annotation,
  AppState,
  ActionTimingAnchor,
  AttackerId,
  AttackerSpeedTier,
  DefenderId,
  OffensiveProfile,
  Tool,
  ZoneRegionOverride,
  PlayerId,
} from '@/lib/types';
import type { DefenderProfile } from '@/lib/data/defenderProfiles';
import type { PlaybackFrame } from '@/lib/logic/playback/frameResolver';
import { activeBallCarrier, getActiveDefenderIds } from '@/lib/logic/players';
import { applyZoneOverrides, getZoneLayout, mirrorZoneLayout } from '@/lib/data/zones';
import { ContextMenu } from '../ContextMenu';
import { ZoneRegionMenu } from '../overlays/ZoneEditOverlay';

export type CtxMenuState =
  | { kind: 'defender'; dId: DefenderId; x: number; y: number }
  | { kind: 'attacker'; oId: AttackerId; x: number; y: number };

export type ZoneRegionMenuState = { regionId: string; x: number; y: number };

interface CourtMenusProps {
  state: AppState;
  frame: PlaybackFrame;
  ctxMenu: CtxMenuState | null;
  zoneRegionMenu: ZoneRegionMenuState | null;
  onSetTool: (t: Tool) => void;
  onSetActionTimingAnchor?: (mode: ActionTimingAnchor) => void;
  onCloseCtxMenu: () => void;
  onCloseZoneRegionMenu: () => void;
  // Defender ctx menu
  onUpdateRule: (dId: DefenderId, patch: Partial<AppState['rules'][DefenderId]>) => void;
  onApplyDefenderProfile: (dId: DefenderId, profile: DefenderProfile) => void;
  onClearDefenseOverride: (dId: DefenderId) => void;
  // Attacker ctx menu
  onSetBallCarrier: (oId: AttackerId) => void;
  onSetForcedScreener: (oId: AttackerId | null) => void;
  onClearAnnotationsFor: (oId: AttackerId) => void;
  onSetAttackerHand: (oId: AttackerId, hand: 'right' | 'left') => void;
  onSetAttackerProfile: (oId: AttackerId, profile: OffensiveProfile) => void;
  onSetAttackerSpeedTier: (oId: AttackerId, tier: AttackerSpeedTier | undefined) => void;
  onSetAttackerOrientation: (
    oId: AttackerId,
    patch: { body?: number | undefined; gaze?: number | undefined }
  ) => void;
  onAddAnnotation: (annotation: Annotation) => void;
  // Zone menu
  onSetZoneOverride: (regionId: string, override: Partial<ZoneRegionOverride>) => void;
  onClearZoneOverride: (regionId: string) => void;
  // Roster customisation
  onSetPlayerName: (id: PlayerId, name: string) => void;
  onSetPlayerNumber: (id: PlayerId, num: string) => void;
}

export function CourtMenus(props: CourtMenusProps) {
  const {
    state,
    frame,
    ctxMenu,
    zoneRegionMenu,
    onSetTool,
    onSetActionTimingAnchor,
    onCloseCtxMenu,
    onCloseZoneRegionMenu,
    onUpdateRule,
    onApplyDefenderProfile,
    onClearDefenseOverride,
    onSetBallCarrier,
    onSetForcedScreener,
    onClearAnnotationsFor,
    onSetAttackerHand,
    onSetAttackerProfile,
    onSetAttackerSpeedTier,
    onSetAttackerOrientation,
    onAddAnnotation,
    onSetZoneOverride,
    onClearZoneOverride,
    onSetPlayerName,
    onSetPlayerNumber,
  } = props;

  return (
    <>
      {ctxMenu?.kind === 'defender' && (
        <ContextMenu
          kind="defender"
          dId={ctxMenu.dId}
          x={ctxMenu.x}
          y={ctxMenu.y}
          rule={state.rules[ctxMenu.dId]}
          hasOverride={!!state.steps[state.activeStep]?.defenseOverrides?.[ctxMenu.dId]}
          isCarrierDefender={frame.defPos[ctxMenu.dId]?.isCarrierDefender}
          tool={state.tool}
          onSetTool={onSetTool}
          actionTimingAnchor={state.actionTimingAnchor ?? 'start'}
          onSetActionTimingAnchor={onSetActionTimingAnchor}
          onUpdate={(p) => onUpdateRule(ctxMenu.dId, p)}
          onApplyProfile={(profile) => onApplyDefenderProfile(ctxMenu.dId, profile)}
          onClearOverride={() => onClearDefenseOverride(ctxMenu.dId)}
          onClose={onCloseCtxMenu}
          name={state.playerNames?.[ctxMenu.dId]}
          number={state.playerNumbers?.[ctxMenu.dId]}
          onSetPlayerName={onSetPlayerName}
          onSetPlayerNumber={onSetPlayerNumber}
        />
      )}
      {ctxMenu?.kind === 'attacker' && (() => {
        const oId = ctxMenu.oId;
        const cur = state.steps[state.activeStep];
        return (
          <ContextMenu
            kind="attacker"
            oId={oId}
            x={ctxMenu.x}
            y={ctxMenu.y}
            isCarrier={cur ? activeBallCarrier(cur, state.playerCount) === oId : false}
            isForcedScreener={cur?.forcedScreener === oId}
            hasAnnotations={actionsOfStep(state.steps, state.activeStep).some(({ annotation }) => annotation.fromId === oId)}
            dominantHand={state.attackerHands?.[oId] ?? 'right'}
            offensiveProfile={state.attackerProfiles?.[oId] ?? 'creator'}
            tool={state.tool}
            onSetTool={onSetTool}
            actionTimingAnchor={state.actionTimingAnchor ?? 'start'}
            onSetActionTimingAnchor={onSetActionTimingAnchor}
            onMakeCarrier={() => onSetBallCarrier(oId)}
            onForceScreener={() => onSetForcedScreener(oId)}
            onClearForcedScreener={() => onSetForcedScreener(null)}
            onClearAnnotations={() => onClearAnnotationsFor(oId)}
            onSetDominantHand={(h) => onSetAttackerHand(oId, h)}
            onSetOffensiveProfile={(p) => onSetAttackerProfile(oId, p)}
            attackerSpeedTier={state.attackerSpeedProfiles?.[oId]}
            onSetAttackerSpeedTier={(t) => onSetAttackerSpeedTier(oId, t)}
            bodyOrientation={state.attackerOrientations?.[oId]?.body}
            gazeOrientation={state.attackerOrientations?.[oId]?.gaze}
            onSetBodyOrientation={(v) => onSetAttackerOrientation(oId, { body: v })}
            onSetGazeOrientation={(v) => onSetAttackerOrientation(oId, { gaze: v })}
            state={state}
            onCreateAutoAnnotation={onAddAnnotation}
            onClose={onCloseCtxMenu}
            name={state.playerNames?.[oId]}
            number={state.playerNumbers?.[oId]}
            onSetPlayerName={onSetPlayerName}
            onSetPlayerNumber={onSetPlayerNumber}
          />
        );
      })()}
      {zoneRegionMenu && state.defenseSystem === 'zone' && state.zoneEditMode && (() => {
        const base = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
        const oriented = state.attackingDirection === 'down' ? mirrorZoneLayout(base) : base;
        const activeDefenders = new Set(getActiveDefenderIds(state.playerCount));
        const layout = applyZoneOverrides(oriented, state.zoneOverrides).filter((z) =>
          activeDefenders.has(z.assignedTo)
        );
        const region = layout.find((r) => r.id === zoneRegionMenu.regionId);
        if (!region) return null;
        return (
          <ZoneRegionMenu
            region={region}
            x={zoneRegionMenu.x}
            y={zoneRegionMenu.y}
            onUpdate={(patch) => onSetZoneOverride(zoneRegionMenu.regionId, patch)}
            onReset={() => onClearZoneOverride(zoneRegionMenu.regionId)}
            onClose={onCloseZoneRegionMenu}
          />
        );
      })()}
    </>
  );
}
