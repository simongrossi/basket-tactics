import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderId,
  DetectedOffBallScreen,
  DetectedScreen,
  Matchups,
  Point,
} from '@/lib/types';
import {
  PLAYER_CLUSTER_BASE_R_PX,
  PLAYER_CLUSTER_LINK_DIST_PX,
} from '@/lib/data/court';
import { detectOffBallScreens, detectScreen } from './screens';
import { makeCluster } from './geometry';
import {
  contactQualityForRule,
  contactQualityForOffBallRule,
  effectiveScreenRuleForDef,
  findScreenQuality,
  type ScreenContactMode,
} from './screenPhysics';

export interface ScreenContext {
  screen: DetectedScreen | null;
  offBallScreens: DetectedOffBallScreen[];
}

export interface ScreenObstacle {
  center: Point;
  radius: number;
  defenderToSkip: DefenderId;
}

export interface DefenderScreenContact {
  defenderId: DefenderId;
  mode: ScreenContactMode | null;
  quality: number;
  carrierContact: boolean;
  carrierContactA: boolean;
  carrierContactB: boolean;
  offBallContact?: DetectedOffBallScreen;
  offBallContactA?: DetectedOffBallScreen;
  offBallContactB?: DetectedOffBallScreen;
}

export function emptyScreenContext(): ScreenContext {
  return { screen: null, offBallScreens: [] };
}

export function detectScreenContext(params: {
  off: AttackerPositions;
  carrier: AttackerId;
  matchups: Matchups;
  defenderPositions: Record<DefenderId, Point>;
  screenRadius: number;
  forcedScreener?: AttackerId;
  prevOff?: AttackerPositions;
}): ScreenContext {
  const screen = detectScreen(
    params.off,
    params.carrier,
    params.matchups,
    params.defenderPositions,
    params.screenRadius,
    params.forcedScreener,
    params.prevOff
  );
  const offBallScreens = detectOffBallScreens(
    params.off,
    params.carrier,
    params.matchups,
    params.defenderPositions,
    params.screenRadius,
    params.prevOff
  );
  return { screen, offBallScreens };
}

export function buildSegmentScreenObstacles(
  ctxA: ScreenContext,
  ctxB: ScreenContext,
  offA: AttackerPositions,
  offB: AttackerPositions,
  defA: Record<DefenderId, Point>,
  defB: Record<DefenderId, Point>
): ScreenObstacle[] {
  const out: ScreenObstacle[] = [];
  const seen = new Set<DefenderId>();
  const add = (screenerId: AttackerId, screenerDef: DefenderId) => {
    if (seen.has(screenerDef)) return;
    const a = offA[screenerId];
    const b = offB[screenerId];
    const da = defA[screenerDef];
    const db = defB[screenerDef];
    if (!a || !b || !da || !db) return;
    seen.add(screenerDef);
    const sPos = midpoint(a, b);
    const sDef = midpoint(da, db);
    const c = makeCluster(sPos, [sDef], PLAYER_CLUSTER_LINK_DIST_PX, PLAYER_CLUSTER_BASE_R_PX);
    out.push({ center: c.center, radius: c.radius, defenderToSkip: screenerDef });
  };

  if (ctxA.screen) add(ctxA.screen.screener, ctxA.screen.screenerDef);
  if (ctxB.screen) add(ctxB.screen.screener, ctxB.screen.screenerDef);
  ctxA.offBallScreens.forEach((s) => {
    offBallScreeners(s).forEach((screenContact) => add(screenContact.screener, screenContact.screenerDef));
  });
  ctxB.offBallScreens.forEach((s) => {
    offBallScreeners(s).forEach((screenContact) => add(screenContact.screener, screenContact.screenerDef));
  });
  return out;
}

export function appendStepScreenObstacles(
  out: ScreenObstacle[],
  ctx: ScreenContext,
  off: AttackerPositions,
  defenderPositions: Record<DefenderId, Point>,
  seen?: Set<DefenderId>
): void {
  const add = (screenerId: AttackerId, screenerDef: DefenderId) => {
    if (seen?.has(screenerDef)) return;
    const sPos = off[screenerId];
    const sDef = defenderPositions[screenerDef];
    if (!sPos || !sDef) return;
    seen?.add(screenerDef);
    const c = makeCluster(sPos, [sDef], PLAYER_CLUSTER_LINK_DIST_PX, PLAYER_CLUSTER_BASE_R_PX);
    out.push({ center: c.center, radius: c.radius, defenderToSkip: screenerDef });
  };

  if (ctx.screen) add(ctx.screen.screener, ctx.screen.screenerDef);
  ctx.offBallScreens.forEach((s) => {
    offBallScreeners(s).forEach((screenContact) => add(screenContact.screener, screenContact.screenerDef));
  });
}

export function screenQualityByDef(
  ctx: ScreenContext,
  steps: Array<AppState['steps'][number] | undefined>
): Partial<Record<DefenderId, number>> {
  const out: Partial<Record<DefenderId, number>> = {};
  if (ctx.screen) {
    out[ctx.screen.carrierDef] = findScreenQuality(steps, ctx.screen.screener);
  }
  ctx.offBallScreens.forEach((s) => {
    out[s.cutterDef] = offBallScreenQuality(steps, s);
  });
  return out;
}

export function defenderScreenContact(params: {
  state: AppState;
  defenderId: DefenderId;
  isCarrierDef: boolean;
  ctxA: ScreenContext;
  ctxB: ScreenContext;
  currentCtx?: ScreenContext;
  idxA: number;
  idxB: number;
}): DefenderScreenContact {
  const carrierContactA = params.ctxA.screen?.carrierDef === params.defenderId;
  const carrierContactB = params.ctxB.screen?.carrierDef === params.defenderId;
  const offBallContactA = params.ctxA.offBallScreens.find((s) => s.cutterDef === params.defenderId);
  const offBallContactB = params.ctxB.offBallScreens.find((s) => s.cutterDef === params.defenderId);
  const offBallContact = offBallContactB ?? offBallContactA;
  const carrierContact = params.isCarrierDef && (carrierContactA || carrierContactB);
  const aOn = carrierContactA || !!offBallContactA;
  const bOn = carrierContactB || !!offBallContactB;

  let mode: ScreenContactMode | null = null;
  if (carrierContact || offBallContact) {
    if (aOn && bOn) mode = 'stuck';
    else if (!aOn && bOn) mode = 'arriving';
    else if (aOn && !bOn) mode = 'leaving';
  }

  let quality = 50;
  if (mode) {
    const lookupSteps = mode === 'leaving'
      ? [params.state.steps[params.idxA]]
      : [params.state.steps[params.idxB], params.state.steps[params.idxA]];
    if (carrierContact) {
      const contactScreen = mode === 'leaving'
        ? params.ctxA.screen
        : params.ctxB.screen ?? params.currentCtx?.screen ?? params.ctxA.screen;
      const screenerId = contactScreen?.carrierDef === params.defenderId
        ? contactScreen.screener
        : undefined;
      quality = findScreenQuality(lookupSteps, screenerId);
      quality = contactQualityForRule(
        quality,
        effectiveScreenRuleForDef(params.state, params.defenderId),
        mode
      );
    } else if (offBallContact) {
      quality = offBallScreenQuality(lookupSteps, offBallContact);
      quality = contactQualityForOffBallRule(
        quality,
        params.state.offBallScreenRule,
        mode,
        offBallContact.type
      );
    }
  }

  return {
    defenderId: params.defenderId,
    mode,
    quality,
    carrierContact,
    carrierContactA,
    carrierContactB,
    offBallContact,
    offBallContactA,
    offBallContactB,
  };
}

export function hasCarrierScreenAnnotation(
  step: AppState['steps'][number] | undefined,
  carrier: AttackerId
): boolean {
  if (!step) return false;
  const ann = step.annotations.find(
    (a) => a.type === 'screen' && a.fromId !== carrier && (a.toId == null || a.toId === carrier)
  );
  if (!ann) return false;
  const quality = ann.quality ?? 50;
  return quality >= 10;
}

export function screenContactScreenerPoint(params: {
  contact: DefenderScreenContact;
  mode: ScreenContactMode;
  offA: AttackerPositions;
  offB: AttackerPositions;
  stepA: AppState['steps'][number];
  stepB: AppState['steps'][number];
  ctxA: ScreenContext;
  ctxB: ScreenContext;
  anchor?: Point;
}): Point | null {
  const contactOff = params.mode === 'leaving' ? params.offA : params.offB;
  const contactScreen = params.mode === 'leaving'
    ? params.ctxA.screen
    : (params.ctxB.screen ?? params.ctxA.screen);
  const offBallContact = params.mode === 'leaving'
    ? params.contact.offBallContactA
    : (params.contact.offBallContactB ?? params.contact.offBallContactA);

  const fromCarrier = contactScreen?.carrierDef === params.contact.defenderId
    ? contactOff[contactScreen.screener] ?? null
    : null;
  if (fromCarrier) return fromCarrier;
  if (offBallContact) {
    return offBallScreenContactPoint(offBallContact, contactOff, params.anchor);
  }
  return annotationScreenerPoint(
    params.mode === 'leaving' ? [params.stepA] : [params.stepB, params.stepA],
    contactOff
  );
}

export function offBallScreenQuality(
  steps: Array<AppState['steps'][number] | undefined>,
  screen: DetectedOffBallScreen
): number {
  const primary = findScreenQuality(steps, screen.screener);
  if (!screen.secondScreener) return primary;
  return Math.max(primary, findScreenQuality(steps, screen.secondScreener));
}

export function offBallScreeners(screen: DetectedOffBallScreen): Array<{
  screener: AttackerId;
  screenerDef: DefenderId;
  screenerPos: Point;
}> {
  const out = [{
    screener: screen.screener,
    screenerDef: screen.screenerDef,
    screenerPos: screen.screenerPos,
  }];
  if (screen.secondScreener && screen.secondScreenerDef && screen.secondScreenerPos) {
    out.push({
      screener: screen.secondScreener,
      screenerDef: screen.secondScreenerDef,
      screenerPos: screen.secondScreenerPos,
    });
  }
  return out;
}

function annotationScreenerPoint(
  steps: Array<AppState['steps'][number] | undefined>,
  off: AttackerPositions
): Point | null {
  for (const st of steps) {
    const ann = st?.annotations.find((a) => a.type === 'screen');
    if (!ann) continue;
    const id = ann.fromId as AttackerId;
    return off[id] ?? ann.to ?? ann.from;
  }
  return null;
}

function offBallScreenContactPoint(
  screen: DetectedOffBallScreen,
  off: AttackerPositions,
  anchor?: Point
): Point {
  const screeners = offBallScreeners(screen).map((s) => ({
    ...s,
    pos: off[s.screener] ?? s.screenerPos,
  }));
  if (screeners.length === 1) return screeners[0].pos;

  if (screen.type === 'elevator') {
    return {
      x: screeners.reduce((sum, s) => sum + s.pos.x, 0) / screeners.length,
      y: screeners.reduce((sum, s) => sum + s.pos.y, 0) / screeners.length,
    };
  }

  if (!anchor) return screeners[0].pos;
  return screeners.reduce((best, s) => {
    const bestDist = distanceSquared(anchor, best.pos);
    const dist = distanceSquared(anchor, s.pos);
    return dist < bestDist ? s : best;
  }).pos;
}

function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
