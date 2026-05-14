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
  screenContactQualityPassesHysteresis,
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
  contactKind?: 'carrier' | 'off-ball';
  contactKey?: string;
  contactScreener?: AttackerId;
  contactScreenerDef?: DefenderId;
  carrierContact: boolean;
  carrierContactA: boolean;
  carrierContactB: boolean;
  carrierScreen?: DetectedScreen;
  carrierScreenA?: DetectedScreen;
  carrierScreenB?: DetectedScreen;
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
  ctxAExit?: ScreenContext;
  ctxBExit?: ScreenContext;
  currentCtx?: ScreenContext;
  idxA: number;
  idxB: number;
}): DefenderScreenContact {
  const carrierScreenAAny = params.ctxA.screen?.carrierDef === params.defenderId
    ? params.ctxA.screen
    : undefined;
  const carrierScreenBAny = params.ctxB.screen?.carrierDef === params.defenderId
    ? params.ctxB.screen
    : undefined;
  const carrierScreenAExitAny = params.ctxAExit?.screen?.carrierDef === params.defenderId
    ? params.ctxAExit.screen
    : undefined;
  const carrierScreenBExitAny = params.ctxBExit?.screen?.carrierDef === params.defenderId
    ? params.ctxBExit.screen
    : undefined;
  const selectedCarrierScreen = params.isCarrierDef
    ? (carrierScreenBAny ?? carrierScreenAAny)
    : undefined;
  const carrierKey = selectedCarrierScreen
    ? carrierScreenContactKey(selectedCarrierScreen)
    : undefined;
  const carrierScreenA = carrierKey && carrierScreenAAny &&
    carrierScreenContactKey(carrierScreenAAny) === carrierKey
    ? carrierScreenAAny
    : carrierKey && carrierScreenAExitAny &&
      carrierScreenContactKey(carrierScreenAExitAny) === carrierKey
      ? carrierScreenAExitAny
      : undefined;
  const carrierScreenB = carrierKey && carrierScreenBAny &&
    carrierScreenContactKey(carrierScreenBAny) === carrierKey
    ? carrierScreenBAny
    : carrierKey && carrierScreenBExitAny &&
      carrierScreenContactKey(carrierScreenBExitAny) === carrierKey
      ? carrierScreenBExitAny
      : undefined;
  const carrierContactA = !!carrierScreenA;
  const carrierContactB = !!carrierScreenB;
  const carrierContact = params.isCarrierDef && (carrierContactA || carrierContactB);

  const offBallStepsA = [params.state.steps[params.idxA], params.state.steps[params.idxA - 1]];
  const offBallStepsB = [params.state.steps[params.idxB], params.state.steps[params.idxA]];
  const selectedOffBallB = bestOffBallContactForDef(
    params.ctxB.offBallScreens,
    params.defenderId,
    offBallStepsB
  );
  const selectedOffBallA = bestOffBallContactForDef(
    params.ctxA.offBallScreens,
    params.defenderId,
    offBallStepsA,
    selectedOffBallB ? offBallScreenContactKey(selectedOffBallB) : undefined
  ) ?? (!selectedOffBallB
    ? bestOffBallContactForDef(params.ctxA.offBallScreens, params.defenderId, offBallStepsA)
    : undefined);
  const selectedOffBall = selectedOffBallB ?? selectedOffBallA;
  const offBallKey = selectedOffBall ? offBallScreenContactKey(selectedOffBall) : undefined;
  const offBallContactA = offBallKey
    ? bestOffBallContactForDef(params.ctxA.offBallScreens, params.defenderId, offBallStepsA, offBallKey) ??
      bestOffBallContactForDef(params.ctxAExit?.offBallScreens ?? [], params.defenderId, offBallStepsA, offBallKey)
    : undefined;
  const offBallContactB = offBallKey
    ? bestOffBallContactForDef(params.ctxB.offBallScreens, params.defenderId, offBallStepsB, offBallKey) ??
      bestOffBallContactForDef(params.ctxBExit?.offBallScreens ?? [], params.defenderId, offBallStepsB, offBallKey)
    : undefined;
  const offBallContact = offBallContactB ?? offBallContactA;
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
        ? carrierScreenA
        : carrierScreenB ?? carrierScreenA ?? selectedCarrierScreen ?? params.currentCtx?.screen;
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

  const wasActive = carrierContactA || !!offBallContactA;
  if (mode && !screenContactQualityPassesHysteresis(quality, wasActive)) {
    mode = null;
  }

  const carrierScreen = mode === 'leaving'
    ? carrierScreenA
    : carrierScreenB ?? carrierScreenA ?? selectedCarrierScreen;
  const offBallContactForIdentity = mode === 'leaving'
    ? offBallContactA
    : offBallContactB ?? offBallContactA;
  const contactKind = carrierContact
    ? 'carrier'
    : offBallContactForIdentity
      ? 'off-ball'
      : undefined;
  const offBallScreener = offBallContactForIdentity
    ? preferredOffBallScreener(offBallContactForIdentity, mode === 'leaving' ? offBallStepsA : offBallStepsB)
    : undefined;

  return {
    defenderId: params.defenderId,
    mode,
    quality,
    contactKind,
    contactKey: carrierContact ? carrierKey : offBallKey,
    contactScreener: carrierContact ? carrierScreen?.screener : offBallScreener?.screener,
    contactScreenerDef: carrierContact ? carrierScreen?.screenerDef : offBallScreener?.screenerDef,
    carrierContact,
    carrierContactA,
    carrierContactB,
    carrierScreen,
    carrierScreenA,
    carrierScreenB,
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

export function carrierScreenContactKey(screen: DetectedScreen): string {
  return `carrier:${screen.carrierDef}:${screen.carrier}:${screen.screener}`;
}

export function offBallScreenContactKey(screen: DetectedOffBallScreen): string {
  const screeners = offBallScreeners(screen)
    .map((s) => s.screener)
    .sort()
    .join('+');
  return `off:${screen.cutterDef}:${screen.cutter}:${screeners}`;
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

function bestOffBallContactForDef(
  screens: DetectedOffBallScreen[],
  defenderId: DefenderId,
  steps: Array<AppState['steps'][number] | undefined>,
  preferredKey?: string
): DetectedOffBallScreen | undefined {
  const contacts = screens.filter((s) => s.cutterDef === defenderId);
  if (preferredKey) {
    return contacts.find((s) => offBallScreenContactKey(s) === preferredKey);
  }
  if (contacts.length <= 1) return contacts[0];
  return contacts.reduce((best, screen) => {
    const bestScore = offBallScreenQuality(steps, best) + doubleScreenScore(best);
    const score = offBallScreenQuality(steps, screen) + doubleScreenScore(screen);
    return score > bestScore ? screen : best;
  });
}

function preferredOffBallScreener(
  screen: DetectedOffBallScreen,
  steps: Array<AppState['steps'][number] | undefined>
): { screener: AttackerId; screenerDef: DefenderId } {
  if (!screen.secondScreener || !screen.secondScreenerDef) {
    return { screener: screen.screener, screenerDef: screen.screenerDef };
  }
  const primaryQuality = findScreenQuality(steps, screen.screener);
  const secondaryQuality = findScreenQuality(steps, screen.secondScreener);
  return secondaryQuality >= primaryQuality
    ? { screener: screen.secondScreener, screenerDef: screen.secondScreenerDef }
    : { screener: screen.screener, screenerDef: screen.screenerDef };
}

function doubleScreenScore(screen: DetectedOffBallScreen): number {
  if (screen.type === 'elevator') return 12;
  if (screen.type === 'stagger') return 8;
  return 0;
}

function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
