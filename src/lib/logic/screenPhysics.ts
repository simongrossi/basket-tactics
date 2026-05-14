import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderId,
  DetectedOffBallScreen,
  DetectedScreen,
  OffBallScreenRule,
  OffBallScreenType,
  Point,
  ScreenContactPhase,
  ScreenRule,
  Step,
} from '../types';

export type ScreenContactMode = 'arriving' | 'leaving' | 'stuck';
export type ScreenRouteKind = ScreenRule | OffBallScreenRule;
export type ScreenContactState =
  | 'approach'
  | 'impact'
  | 'stuck'
  | 'navigate'
  | 'recover'
  | 'released';

export interface ScreenStateMachineInput {
  mode: ScreenContactMode | null;
  localT: number;
  quality: number;
  hadRecentContact?: boolean;
  engineRecover?: boolean;
  engineImpact?: boolean;
}

export interface ScreenStateMachineResult {
  state: ScreenContactState | undefined;
  visualPhase: ScreenContactPhase | undefined;
  contactActive: boolean;
  released: boolean;
}

export const SCREEN_CONTACT_ENTER_QUALITY = 12;
export const SCREEN_CONTACT_EXIT_QUALITY = 7;
export const SCREEN_CONTACT_EXIT_RADIUS_MULTIPLIER = 1.28;

export function screenContactQualityPassesHysteresis(
  quality: number,
  wasActive: boolean
): boolean {
  return quality >= (wasActive ? SCREEN_CONTACT_EXIT_QUALITY : SCREEN_CONTACT_ENTER_QUALITY);
}

export function screenContactExitRadius(screenRadius: number): number {
  return screenRadius * SCREEN_CONTACT_EXIT_RADIUS_MULTIPLIER;
}

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
  return resolveScreenContactState({ mode, localT, quality }).visualPhase;
}

export function resolveScreenContactState(
  input: ScreenStateMachineInput
): ScreenStateMachineResult {
  const mode = input.mode;
  if (!mode) {
    if (input.engineRecover) {
      return { state: 'recover', visualPhase: 'recover', contactActive: false, released: false };
    }
    if (input.engineImpact) {
      return { state: 'impact', visualPhase: 'impact', contactActive: true, released: false };
    }
    if (input.hadRecentContact) {
      return { state: 'released', visualPhase: 'released', contactActive: false, released: true };
    }
    return { state: undefined, visualPhase: undefined, contactActive: false, released: false };
  }

  const q = clampQuality(input.quality) / 100;
  const state = screenContactStateFromMode(mode, input.localT, q);
  return { state, visualPhase: state, contactActive: true, released: false };
}

function screenContactStateFromMode(
  mode: ScreenContactMode,
  localT: number,
  q: number
): ScreenContactState {
  if (mode === 'arriving') {
    if (localT < 0.10) return 'approach';
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
  const max = 0.45 + q * 0.55; // 0.45 à q=0.05, 1.0 à q=1
  // CONTINUITÉ AUX BOUNDARIES :
  //  - arriving : 0 → max (montée pendant le contact, FINIT à max)
  //  - stuck    : max → max (plaqué tout au long)
  //  - leaving  : max → 0 (descente après l'impact)
  // Cela garantit que l'adhésion à la FIN d'un segment de mode N matche
  // l'adhésion au DÉBUT du segment suivant de mode N+1, évitant les
  // sauts visuels du défenseur quand on franchit un step boundary.
  if (mode === 'arriving') {
    const settleStart = 0.30;
    const settleEnd = 0.48 - q * 0.08;
    return max * smoothstep(settleStart, settleEnd, localT);
  }
  if (mode === 'leaving') {
    const holdEnd = 0.76 + q * 0.12;
    return max * (1 - smoothstep(holdEnd, 0.98, localT));
  }
  // stuck : plaqué tout au long.
  return max;
}

export function screenContactTangentRelease(
  localT: number,
  quality: number,
  mode: ScreenContactMode | null
): number {
  if (mode !== 'leaving') return 0;
  const q = clampQuality(quality) / 100;
  if (q < 0.05) return 0;
  const releaseStart = 0.54 + q * 0.08;
  return smoothstep(releaseStart, 0.98, localT);
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

export function contactQualityForOffBallRule(
  quality: number,
  rule: OffBallScreenRule,
  mode: ScreenContactMode,
  screenType?: OffBallScreenType
): number {
  const multiplierByRule: Record<OffBallScreenRule, number> = {
    switch: 0,
    over: 0.82,
    under: 1.22,
    bump: 0.78,
    'top-lock': 0.95,
    chase: 0.9,
  };
  const doubleBonus = screenType === 'stagger'
    ? 1.12
    : screenType === 'elevator'
      ? 1.2
      : 1;
  const modeBonus = mode === 'leaving' ? 1.08 : 1;
  return clampQuality(quality * multiplierByRule[rule] * doubleBonus * modeBonus);
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
  ballPos: Point | undefined,
  hoop?: Point
): Point | null {
  if (rule === 'switch' || rule === 'bump') return null;

  if (screen.type === 'elevator' && screen.secondScreenerPos) {
    return unit({
      x: screen.secondScreenerPos.x - screen.screenerPos.x,
      y: screen.secondScreenerPos.y - screen.screenerPos.y,
    });
  }

  if (
    hoop &&
    (screen.type === 'backscreen' || screen.type === 'flex' || screen.type === 'hammer')
  ) {
    return unit({ x: hoop.x - screen.screenerPos.x, y: hoop.y - screen.screenerPos.y });
  }

  if (screen.type === 'flare' && ballPos) {
    const toBall = unit({ x: ballPos.x - screen.cutterPos.x, y: ballPos.y - screen.cutterPos.y });
    return rule === 'under'
      ? { x: -toBall.x, y: -toBall.y }
      : toBall;
  }

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
    default:
      return cutDir;
  }
}

export function carrierScreenRouteKind(rule: ScreenRule): ScreenRouteKind {
  return rule;
}

export function offBallScreenRouteKind(rule: OffBallScreenRule): ScreenRouteKind {
  return rule;
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

/**
 * Cible "anticipée" pour un défenseur en recovery (juste sorti d'un écran).
 * Combine 3 logiques de basket-IQ :
 *
 *  A — LOOKAHEAD : projection future de l'attaquant le long de sa vitesse,
 *      à `lookaheadSteps` step(s) en avant. La cible naive (man-target sur
 *      O1 entre-deux) est calculée par rapport à cette position future, pas
 *      sa position courante.
 *
 *  B — BASKET-LINE BIAS : au lieu de viser l'attaquant directement, on biaise
 *      vers la ligne O1→panier (ball-you-man classique). Le défenseur retourne
 *      sur l'axe de protection du panier, pas sur la queue de l'attaquant.
 *
 *  C — INTERCEPTION : résout la quadratique "où D1 et O1 vont se croiser"
 *      étant donné leurs vitesses respectives. Le défenseur coupe la course
 *      au lieu de rattraper. Dégénère gracieusement quand carrier statique
 *      ou défenseur trop lent → fallback sur A.
 *
 * Le résultat est une moyenne pondérée des 3 logiques selon `iq` (0-100).
 * À iq=0 : retourne `currentTarget` (pure réaction, comportement legacy).
 * À iq=100 : pleinement A+B+C.
 *
 * @param currentTarget   cible homme-à-homme de base (man-target sur O1)
 * @param defenderPos     position courante du défenseur
 * @param carrierPos      position courante du porteur
 * @param carrierVel      vélocité du porteur (px/step, depuis prev→cur)
 * @param hoop            position du panier défendu
 * @param defenseDistance écart défensif souhaité au porteur
 * @param defenderSpeed   vitesse max du défenseur en px/step
 * @param iq              intelligence défensive 0-100 (défaut 50)
 */
export function anticipationTarget(
  currentTarget: Point,
  defenderPos: Point,
  carrierPos: Point,
  carrierVel: Point,
  hoop: Point,
  defenseDistance: number,
  defenderSpeed: number,
  iq: number = 50
): Point {
  const q = clampQuality(iq) / 100;
  if (q < 0.05) return currentTarget;

  // --- A : Lookahead ---
  const lookahead = 0.35 + q * 0.45; // 0.35 step à iq=0.05, 0.80 à iq=1
  const futurePos: Point = {
    x: carrierPos.x + carrierVel.x * lookahead,
    y: carrierPos.y + carrierVel.y * lookahead,
  };
  const toBasketFromFuture = unit({ x: hoop.x - futurePos.x, y: hoop.y - futurePos.y });
  const naiveTarget: Point = {
    x: futurePos.x + toBasketFromFuture.x * defenseDistance,
    y: futurePos.y + toBasketFromFuture.y * defenseDistance,
  };

  // --- B : Basket-line bias ---
  const lineDir = unit({ x: hoop.x - carrierPos.x, y: hoop.y - carrierPos.y });
  // Projection du défenseur sur l'axe O1→panier (depuis O1).
  const cToD = { x: defenderPos.x - carrierPos.x, y: defenderPos.y - carrierPos.y };
  const proj = cToD.x * lineDir.x + cToD.y * lineDir.y;
  // Le défenseur retourne sur la ligne à une distance défensive
  // (pas trop loin du porteur, pas dans la raquette).
  // Clamping LISSE : aux bornes, on rejoint la valeur de la borne via une
  // courbe (smoothstep) au lieu d'un coude brutal. Évite que projClamped
  // bascule abruptement quand proj franchit 0.6× ou 2.2× defenseDistance.
  const lo = defenseDistance * 0.6;
  const hi = defenseDistance * 2.2;
  const margin = (hi - lo) * 0.15; // zone de transition autour de chaque borne
  let projClamped: number;
  if (proj < lo) {
    projClamped = lo; // bien en dessous : reste à la borne
  } else if (proj > hi) {
    projClamped = hi;
  } else if (proj < lo + margin) {
    // transition lisse depuis lo
    const t = smoothstep(0, 1, (proj - lo) / margin);
    projClamped = lo + (proj - lo) * t;
  } else if (proj > hi - margin) {
    // transition lisse vers hi
    const t = smoothstep(0, 1, (hi - proj) / margin);
    projClamped = hi - (hi - proj) * t;
  } else {
    projClamped = proj; // milieu : identité
  }
  const basketLineTarget: Point = {
    x: carrierPos.x + lineDir.x * projClamped,
    y: carrierPos.y + lineDir.y * projClamped,
  };

  // --- C : Interception (résolution quadratique pursuit curve) ---
  // Le défenseur vise un point P tel que P = carrierPos + carrierVel * t et
  // |P - defenderPos| = defenderSpeed * t (atteindre P juste à temps).
  // ⇒ |carrierPos + carrierVel*t - defenderPos|² = (defenderSpeed * t)²
  //   Aₜ² + Bt + C = 0, avec A = |Vc|² - Vd², B = 2·(carrier-def)·Vc, C = |carrier-def|².
  let interceptionTarget = naiveTarget;
  const carrierSpeed = Math.hypot(carrierVel.x, carrierVel.y);
  if (carrierSpeed > 0.5 && defenderSpeed > carrierSpeed * 0.4) {
    const rx = carrierPos.x - defenderPos.x;
    const ry = carrierPos.y - defenderPos.y;
    const aCoef = carrierSpeed * carrierSpeed - defenderSpeed * defenderSpeed;
    const bCoef = 2 * (rx * carrierVel.x + ry * carrierVel.y);
    const cCoef = rx * rx + ry * ry;
    if (Math.abs(aCoef) > 1e-6) {
      const disc = bCoef * bCoef - 4 * aCoef * cCoef;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const t1 = (-bCoef - sq) / (2 * aCoef);
        const t2 = (-bCoef + sq) / (2 * aCoef);
        // Prendre la plus petite racine positive raisonnable (< 3 steps).
        let t = -1;
        if (t1 > 0 && t1 < 3) t = t1;
        else if (t2 > 0 && t2 < 3) t = t2;
        if (t > 0) {
          interceptionTarget = {
            x: carrierPos.x + carrierVel.x * t,
            y: carrierPos.y + carrierVel.y * t,
          };
        }
      }
    }
  }

  // --- Mix pondéré ---
  // Le coach voulait A+B+C combinés. Poids : C domine (calcul géométrique
  // optimal), B aligne sur l'axe basket, A complète sur la position future.
  // Le tout pondéré par iq pour permettre une montée progressive.
  const cWeight = q * 0.45; // C contribue jusqu'à 45% à iq=100
  const bWeight = q * 0.30; // B contribue jusqu'à 30%
  const aWeight = q * 0.25; // A contribue jusqu'à 25%
  // Le complément (1 - cWeight - bWeight - aWeight) reste sur currentTarget.
  const baseW = 1 - cWeight - bWeight - aWeight;
  return {
    x: currentTarget.x * baseW + interceptionTarget.x * cWeight
      + basketLineTarget.x * bWeight + naiveTarget.x * aWeight,
    y: currentTarget.y * baseW + interceptionTarget.y * cWeight
      + basketLineTarget.y * bWeight + naiveTarget.y * aWeight,
  };
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
