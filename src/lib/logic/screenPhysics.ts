import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderId,
  DetectedOffBallScreen,
  DetectedScreen,
  OffBallScreenRule,
  Point,
  ScreenContactPhase,
  ScreenRule,
  Step,
} from '../types';

export type ScreenContactMode = 'arriving' | 'leaving' | 'stuck';

export function carrierApexSlownessFromQuality(quality: number): number {
  const q = clampQuality(quality) / 100;
  return 0.30 + q * 0.69;
}

export function screenPenaltyFromQuality(quality: number): number {
  const q = clampQuality(quality);
  if (q <= 50) return 1.0 - (q / 50) * 0.45;
  return 0.55 - ((q - 50) / 50) * 0.37;
}

export function screenContactT(
  localT: number,
  quality: number,
  mode: ScreenContactMode | null
): number {
  if (!mode) return localT;
  const q = clampQuality(quality) / 100;
  const k = 1 + q * 12;
  const center = mode === 'arriving'
    ? 0.5 - q * 0.30
    : mode === 'leaving'
      ? 0.5 + q * 0.30
      : 0.5;
  const sig = (t: number) => 1 / (1 + Math.exp(-k * (t - center)));
  const s0 = sig(0);
  const s1 = sig(1);
  const denom = s1 - s0;
  if (denom < 1e-9) return localT;
  return (sig(localT) - s0) / denom;
}

export function screenContactPhase(
  mode: ScreenContactMode | null,
  localT: number,
  quality: number
): ScreenContactPhase | undefined {
  if (!mode) return undefined;
  const q = clampQuality(quality) / 100;
  if (mode === 'arriving') {
    if (localT < 0.18 + q * 0.08) return 'impact';
    if (localT < 0.82 + q * 0.10) return 'stuck';
    return 'navigate';
  }
  if (mode === 'leaving') {
    if (localT < 0.76 + q * 0.12) return 'stuck';
    if (localT < 0.95) return 'navigate';
    return 'recover';
  }
  if (localT < 0.20) return 'impact';
  if (localT < 0.80) return 'stuck';
  return 'navigate';
}

export function screenContactAdhesion(
  localT: number,
  quality: number,
  mode: ScreenContactMode | null
): number {
  if (!mode) return 0;
  const q = clampQuality(quality) / 100;
  if (q < 0.05) return 0;
  const max = mode === 'leaving' ? 1 : 0.45 + q * 0.55;
  if (mode === 'arriving') {
    const settleStart = 0.30;
    const settleEnd = 0.48 - q * 0.08;
    const releaseStart = 0.78 + q * 0.12;
    return max * smoothstep(settleStart, settleEnd, localT) * (1 - smoothstep(releaseStart, 1, localT));
  }
  if (mode === 'leaving') {
    const holdEnd = 0.76 + q * 0.12;
    return max * (1 - smoothstep(holdEnd, 0.98, localT));
  }
  return max * smoothstep(0, 0.18, localT) * (1 - smoothstep(0.78, 1, localT));
}

export function findScreenQuality(
  steps: Array<Pick<Step, 'annotations'> | undefined>,
  screenerId?: AttackerId,
  fallback: number = 50
): number {
  for (const st of steps) {
    if (!st) continue;
    const exact = screenerId
      ? st.annotations.find((a) => a.type === 'screen' && a.fromId === screenerId)
      : undefined;
    const any = st.annotations.find((a) => a.type === 'screen');
    const screenAnnotation = exact ?? (!screenerId ? any : undefined);
    if (screenAnnotation) return screenAnnotation.quality ?? fallback;
  }
  return fallback;
}

export function effectiveScreenRuleForDef(state: AppState, defenderId: DefenderId): ScreenRule {
  const nav = state.rules[defenderId]?.screenNav;
  return nav && nav !== 'auto' ? nav : state.screenRule;
}

export function contactQualityForRule(
  quality: number,
  rule: ScreenRule,
  mode: ScreenContactMode
): number {
  const multiplierByRule: Record<ScreenRule, number> = {
    switch: 0,
    over: 0.85,
    under: 1.18,
    hedge: 1.05,
    drop: 0.95,
    blitz: 0.9,
    ice: 0.65,
    weak: 1.08,
    'peel-switch': 0.95,
  };
  const modeBonus = mode === 'leaving' ? 1.08 : 1;
  return clampQuality(quality * multiplierByRule[rule] * modeBonus);
}

export function carrierScreenRoutePreference(
  rule: ScreenRule,
  screen: DetectedScreen,
  off: AttackerPositions,
  hoop: Point
): Point | null {
  const screenerPos = off[screen.screener];
  const carrierPos = off[screen.carrier];
  if (!screenerPos || !carrierPos) return null;

  const toHoop = unit({ x: hoop.x - screenerPos.x, y: hoop.y - screenerPos.y });
  const awayFromHoop = { x: -toHoop.x, y: -toHoop.y };
  const perp = { x: -toHoop.y, y: toHoop.x };
  const sToC = unit({ x: carrierPos.x - screenerPos.x, y: carrierPos.y - screenerPos.y });
  const sideOfCarrier = sToC.x * perp.x + sToC.y * perp.y;

  switch (rule) {
    case 'under':
    case 'weak':
      return toHoop;
    case 'ice':
      return { x: perp.x * -sideOfCarrier, y: perp.y * -sideOfCarrier };
    case 'switch':
      return null;
    case 'over':
    case 'hedge':
    case 'drop':
    case 'blitz':
    case 'peel-switch':
    default:
      return awayFromHoop;
  }
}

export function offBallScreenRoutePreference(
  screen: DetectedOffBallScreen,
  rule: OffBallScreenRule,
  ballPos: Point | undefined
): Point | null {
  const cutDir = unit({
    x: screen.cutterPos.x - screen.screenerPos.x,
    y: screen.cutterPos.y - screen.screenerPos.y,
  });
  switch (rule) {
    case 'over':
    case 'chase':
      return cutDir;
    case 'under':
      return { x: -cutDir.x, y: -cutDir.y };
    case 'top-lock':
      return ballPos
        ? unit({ x: ballPos.x - screen.cutterPos.x, y: ballPos.y - screen.cutterPos.y })
        : cutDir;
    case 'switch':
    case 'bump':
    default:
      return null;
  }
}

export function forcedPushSignForRoute(start: Point, end: Point, route: Point): number | undefined {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return undefined;
  const perp = { x: -dy / len, y: dx / len };
  const routeLen = Math.hypot(route.x, route.y);
  if (routeLen < 0.01) return undefined;
  const projection = perp.x * (route.x / routeLen) + perp.y * (route.y / routeLen);
  if (Math.abs(projection) < 0.05) return undefined;
  return projection >= 0 ? 1 : -1;
}

function clampQuality(quality: number): number {
  return Math.max(0, Math.min(100, quality));
}

function smoothstep(edge0: number, edge1: number, t: number): number {
  if (edge1 <= edge0) return t >= edge1 ? 1 : 0;
  const x = Math.max(0, Math.min(1, (t - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function unit(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len < 0.01) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}
