# D.4 — Pathfinding défensif V1 (playback) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doter les défenseurs d'un routage anticipé pendant le playback : leur trajectoire d'interpolation contourne les autres joueurs au lieu d'aller en ligne droite + correction a posteriori.

**Architecture:** Un module pur `defensiveRoute.ts` calcule un trajet lisse (routes candidates gauche/droite autour d'un cluster d'obstacles, sélection de la plus courte sans collision, lissage Catmull-Rom). Il est branché dans `frameResolver` derrière un flag opt-in `state.defensiveRouting`, uniquement pour les défenseurs hors contact d'écran / hors rotation PnR / hors override manuel. Les endpoints de step restent intacts ; PAI et `resolvePlayerCollisions` restent les filets en aval.

**Tech Stack:** TypeScript, Vitest. Réutilise `geometry.pickBlockingCluster`, `geometry.pointToSegmentDistance`, `polyline.samplePolyline`.

**Périmètre :** V1 = playback uniquement. V2 (routage des cibles de step dans `speedConstraint`) fera l'objet d'un plan séparé, rédigé après validation de V1 (cf. `docs/superpowers/specs/2026-05-22-d4-pathfinding-design.md`).

---

### Task 1: Module `defensiveRoute.ts` — types + trajet droit

**Files:**
- Create: `src/lib/logic/defensiveRoute.ts`
- Test: `src/lib/logic/__tests__/defensiveRoute.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeDefensiveRoute } from '../defensiveRoute';

describe('defensiveRoute — computeDefensiveRoute', () => {
  it('retourne le trajet droit sans obstacle', () => {
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
    expect(r.waypoints).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(r.length).toBeCloseTo(100);
  });

  it('retourne droit si les obstacles ne bloquent pas le segment', () => {
    const r = computeDefensiveRoute(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [{ center: { x: 50, y: 200 }, radius: 34 }],
    );
    expect(r.waypoints).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run defensiveRoute`
Expected: FAIL — `computeDefensiveRoute` n'existe pas (module introuvable).

- [ ] **Step 3: Write minimal implementation**

```ts
// Routage défensif anticipé (D.4). Module pur : étant donné un point de
// départ, un point d'arrivée et des obstacles, produit un trajet lisse
// qui reste à >= clearance de chaque obstacle. Aucune dépendance React,
// déterministe, ne mute jamais ses entrées.

import type { Point } from '../types';
import { distance, pickBlockingCluster } from './geometry';

/** Obstacle ponctuel : centre + rayon d'exclusion (clearance). */
export interface RouteObstacle {
  center: Point;
  radius: number;
}

/** Trajet calculé : polyligne de waypoints + longueur cumulée. */
export interface DefensiveRoute {
  /** [from, ...detour, to]. 2 points = trajet droit. */
  waypoints: Point[];
  /** Somme des distances euclidiennes entre waypoints. */
  length: number;
}

/** Marge ajoutée au rayon du cluster pour placer le waypoint de détour. */
export const DEFENSIVE_ROUTE_BUFFER_PX = 4;

/** Somme des distances euclidiennes entre waypoints consécutifs. */
function routeLength(waypoints: Point[]): number {
  let len = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    len += distance(waypoints[i], waypoints[i + 1]);
  }
  return len;
}

export function computeDefensiveRoute(
  from: Point,
  to: Point,
  obstacles: RouteObstacle[],
): DefensiveRoute {
  if (distance(from, to) < 1e-3) {
    return { waypoints: [{ ...from }, { ...to }], length: 0 };
  }
  const cluster = pickBlockingCluster(from, to, obstacles);
  if (!cluster) {
    return { waypoints: [{ ...from }, { ...to }], length: distance(from, to) };
  }
  return { waypoints: [{ ...from }, { ...to }], length: distance(from, to) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run defensiveRoute`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic/defensiveRoute.ts src/lib/logic/__tests__/defensiveRoute.test.ts
git commit -m "feat(defensiveRoute): D.4 — module pur, trajet droit sans obstacle"
```

---

### Task 2: Contournement d'un obstacle bloquant

**Files:**
- Modify: `src/lib/logic/defensiveRoute.ts`
- Test: `src/lib/logic/__tests__/defensiveRoute.test.ts`

- [ ] **Step 1: Write the failing test**

Ajouter dans le `describe` existant :

```ts
  it('contourne un obstacle posé sur le segment', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const obs = { center: { x: 50, y: 0 }, radius: 34 };
    const r = computeDefensiveRoute(from, to, [obs]);
    expect(r.waypoints).toHaveLength(3);
    const mid = r.waypoints[1];
    // le waypoint de détour est au moins à `radius` du centre de l'obstacle
    expect(Math.hypot(mid.x - obs.center.x, mid.y - obs.center.y))
      .toBeGreaterThanOrEqual(34);
    // la route détournée est plus longue que le trajet droit
    expect(r.length).toBeGreaterThan(100);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run defensiveRoute`
Expected: FAIL — `r.waypoints` a 2 éléments, attendu 3.

- [ ] **Step 3: Write minimal implementation**

D'abord, compléter l'import de `geometry` en tête du fichier :

```ts
import { distance, pickBlockingCluster, pointToSegmentDistance } from './geometry';
```

Puis ajouter, au-dessus de `computeDefensiveRoute`, la constante de pas et deux
helpers :

```ts
/** Pas d'escalade de l'offset du waypoint quand la route raze l'obstacle. */
export const DEFENSIVE_ROUTE_OFFSET_STEP_PX = 8;

/** Pénétration max d'une route candidate dans les obstacles (0 = dégagée). */
function maxPenetration(waypoints: Point[], obstacles: RouteObstacle[]): number {
  let worst = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    for (const o of obstacles) {
      const d = pointToSegmentDistance(o.center, waypoints[i], waypoints[i + 1]);
      const pen = o.radius - d;
      if (pen > worst) worst = pen;
    }
  }
  return worst;
}

/**
 * Construit la meilleure route d'un côté donné du cluster (`sign` = +1
 * gauche, -1 droite). Escalade l'offset du waypoint depuis
 * `cluster.radius + buffer` : un waypoint trop proche laisse les segments
 * de la polyligne razer l'obstacle. On éloigne le waypoint par pas jusqu'à
 * une route dégagée, ou jusqu'au plafond `cluster.radius * 3 + buffer`.
 */
function buildSideRoute(
  from: Point,
  to: Point,
  cluster: { center: Point; radius: number },
  perp: Point,
  sign: number,
  obstacles: RouteObstacle[],
): { waypoints: Point[]; length: number; penetration: number } {
  const maxOffset = cluster.radius * 3 + DEFENSIVE_ROUTE_BUFFER_PX;
  let best: Point[] | null = null;
  let bestPen = Infinity;
  for (
    let offset = cluster.radius + DEFENSIVE_ROUTE_BUFFER_PX;
    offset <= maxOffset;
    offset += DEFENSIVE_ROUTE_OFFSET_STEP_PX
  ) {
    const wp: Point = {
      x: cluster.center.x + perp.x * sign * offset,
      y: cluster.center.y + perp.y * sign * offset,
    };
    const route: Point[] = [{ ...from }, wp, { ...to }];
    const pen = maxPenetration(route, obstacles);
    if (pen < bestPen) {
      bestPen = pen;
      best = route;
    }
    if (pen <= 0.01) break;
  }
  const waypoints = best as Point[];
  return { waypoints, length: routeLength(waypoints), penetration: bestPen };
}
```

Remplacer le corps de `computeDefensiveRoute` après le `if (!cluster)` par :

```ts
  // Perpendiculaire unitaire au segment from→to.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const perp: Point = { x: -dy / len, y: dx / len };

  // Détour côté gauche (sign +1), avec escalade de l'offset.
  const left = buildSideRoute(from, to, cluster, perp, 1, obstacles);
  return { waypoints: left.waypoints, length: left.length };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run defensiveRoute`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic/defensiveRoute.ts src/lib/logic/__tests__/defensiveRoute.test.ts
git commit -m "feat(defensiveRoute): D.4 — détour à 1 waypoint autour d'un cluster"
```

---

### Task 3: Sélection de la route la plus courte sans collision

**Files:**
- Modify: `src/lib/logic/defensiveRoute.ts`
- Test: `src/lib/logic/__tests__/defensiveRoute.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('choisit le côté de détour le plus court', () => {
    // obstacle légèrement décalé vers +y → le détour le plus court passe
    // du côté -y (opposé au décalage).
    const obs = { center: { x: 50, y: 5 }, radius: 34 };
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, [obs]);
    expect(r.waypoints).toHaveLength(3);
    expect(r.waypoints[1].y).toBeLessThan(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run defensiveRoute`
Expected: FAIL — seul le côté gauche est calculé (`buildSideRoute(..., 1, ...)`), waypoint en `y > 0`.

- [ ] **Step 3: Write minimal implementation**

Remplacer, dans `computeDefensiveRoute`, le bloc « Détour côté gauche » par :

```ts
  // 2 routes candidates : détour à gauche (sign +1) et à droite (sign -1).
  const left = buildSideRoute(from, to, cluster, perp, 1, obstacles);
  const right = buildSideRoute(from, to, cluster, perp, -1, obstacles);

  // Préférer une route dégagée ; parmi les dégagées, la plus courte.
  // Tie-break déterministe : gauche calculée en premier, `<` strict.
  const clean = [left, right].filter((r) => r.penetration <= 0.01);
  let chosen: { waypoints: Point[]; length: number };
  if (clean.length > 0) {
    chosen = clean.reduce((a, b) => (b.length < a.length ? b : a));
  } else {
    // Dégradation gracieuse : aucune route dégagée → moindre pénétration.
    chosen = left.penetration <= right.penetration ? left : right;
  }
  return { waypoints: chosen.waypoints, length: chosen.length };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run defensiveRoute`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic/defensiveRoute.ts src/lib/logic/__tests__/defensiveRoute.test.ts
git commit -m "feat(defensiveRoute): D.4 — sélection de la route la plus courte dégagée"
```

---

### Task 4: Cas dégénérés, déterminisme, dégradation gracieuse

**Files:**
- Test: `src/lib/logic/__tests__/defensiveRoute.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('from == to → route dégénérée de longueur 0', () => {
    const r = computeDefensiveRoute(
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      [{ center: { x: 10, y: 10 }, radius: 34 }],
    );
    expect(r.length).toBe(0);
    expect(r.waypoints).toEqual([{ x: 10, y: 10 }, { x: 10, y: 10 }]);
  });

  it('est déterministe (2 appels successifs = résultat identique)', () => {
    const obs = [
      { center: { x: 50, y: 0 }, radius: 34 },
      { center: { x: 60, y: 10 }, radius: 30 },
    ];
    const a = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, obs);
    const b = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, obs);
    expect(a).toEqual(b);
  });

  it('dégrade gracieusement quand aucune route candidate n\'est dégagée', () => {
    // Obstacles serrés des deux côtés du détour → aucune route à 1 waypoint
    // n'est totalement dégagée. Le module renvoie quand même une route.
    const obs = [
      { center: { x: 50, y: 0 }, radius: 34 },
      { center: { x: 50, y: 80 }, radius: 60 },
      { center: { x: 50, y: -80 }, radius: 60 },
    ];
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, obs);
    expect(r.waypoints).toHaveLength(3);
    expect(Number.isFinite(r.length)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run defensiveRoute`
Expected: PASS (7 tests). Ces cas sont déjà couverts par l'implémentation des tâches 1-3 ; le test verrouille le comportement contre une régression future. Si un cas échoue, corriger `computeDefensiveRoute` avant de continuer.

- [ ] **Step 3: Commit**

```bash
git add src/lib/logic/__tests__/defensiveRoute.test.ts
git commit -m "test(defensiveRoute): D.4 — cas dégénérés, déterminisme, fallback"
```

---

### Task 5: `sampleRoute` — échantillonnage lissé du trajet

**Files:**
- Modify: `src/lib/logic/defensiveRoute.ts`
- Test: `src/lib/logic/__tests__/defensiveRoute.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { computeDefensiveRoute, sampleRoute } from '../defensiveRoute';

describe('defensiveRoute — sampleRoute', () => {
  it('renvoie from à t=0 et to à t=1', () => {
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
    expect(sampleRoute(r, 0)).toEqual({ x: 0, y: 0 });
    expect(sampleRoute(r, 1)).toEqual({ x: 100, y: 0 });
  });

  it('suit le détour à mi-parcours', () => {
    const obs = { center: { x: 50, y: 0 }, radius: 34 };
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, [obs]);
    const mid = sampleRoute(r, 0.5);
    // à mi-parcours la position est écartée de l'axe direct y=0
    expect(Math.abs(mid.y)).toBeGreaterThan(10);
  });
});
```

(L'import en tête du fichier de test doit inclure `sampleRoute`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run defensiveRoute`
Expected: FAIL — `sampleRoute` n'est pas exporté.

- [ ] **Step 3: Write minimal implementation**

D'abord, ajouter l'import de `polyline` en tête du fichier :

```ts
import { samplePolyline } from './polyline';
```

Puis ajouter à la fin de `defensiveRoute.ts` :

```ts
/**
 * Échantillonne la route à `t ∈ [0, 1]`. Délègue à `samplePolyline` :
 * lissage Catmull-Rom + reparamétrage en longueur d'arc (vitesse perçue
 * constante quelle que soit la courbure).
 */
export function sampleRoute(route: DefensiveRoute, t: number): Point {
  return samplePolyline(route.waypoints, t);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run defensiveRoute`
Expected: PASS (9 tests au total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic/defensiveRoute.ts src/lib/logic/__tests__/defensiveRoute.test.ts
git commit -m "feat(defensiveRoute): D.4 — sampleRoute (échantillonnage lissé)"
```

---

### Task 6: Champ d'état `defensiveRouting`

**Files:**
- Modify: `src/lib/types/index.ts` (près de `pathAwareInterpolation?: boolean;`, ~ligne 855)

- [ ] **Step 1: Add the field**

Juste après la ligne `pathAwareInterpolation?: boolean;` et son éventuel commentaire associé, ajouter :

```ts
  /** D.4 — Routage défensif anticipé. Quand true, la trajectoire playback
   *  d'un défenseur (hors contact d'écran / PnR / override) contourne les
   *  autres joueurs au lieu d'aller en ligne droite. Opt-in : default
   *  false = comportement legacy strictement inchangé. */
  defensiveRouting?: boolean;
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: aucune sortie (0 erreur).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "feat(types): D.4 — champ defensiveRouting (opt-in)"
```

---

### Task 7: Câblage dans `frameResolver`

> **Note post-livraison (2026-05-22).** Le point d'injection ci-dessous
> (juste après le `lerpPoint` dans la boucle de lerp) s'est révélé **mort**
> à l'exécution : `followDefendersAtFrame`, qui tourne ensuite, réécrit la
> position de tout défenseur en marquage. Le bloc a donc été déplacé en
> **couche 5.c**, après `followDefendersAtFrame` / `applyDefenderMotionInertia`
> et avant la passe finale de collisions (cf. `docs/d4-pathfinding-plan.md`
> « Injection »). Le closeout a aussi été ajouté à la liste d'exclusion.
> Se référer au code livré dans `frameResolver.ts`, pas au snippet ci-dessous.

**Files:**
- Modify: `src/lib/logic/playback/frameResolver.ts`

Le bloc de calcul de position défenseur démarre par
`let p = lerpPoint(defA[id], defB[id], effT);` (~ligne 675), à l'intérieur
de la boucle `defenderIds.forEach((id) => { … })`. À ce point, `screenLockedDefenders`,
`defenderIds`, `offA`, `offB`, `defA`, `defB`, `attackerIsScreening`, `idxB`,
`state` sont tous en portée.

- [ ] **Step 1: Add the import**

En tête du fichier, ajouter aux imports :

```ts
import { computeDefensiveRoute, sampleRoute, type RouteObstacle } from '../defensiveRoute';
import { MIN_PLAYER_CLEARANCE_PX } from '../../data/physics';
```

(Si `frameResolver` importe déjà une constante de clearance équivalente, réutiliser celle-là au lieu de ré-importer.)

- [ ] **Step 2: Insert the routing block**

Juste APRÈS la ligne `let p = lerpPoint(defA[id], defB[id], effT);`, insérer :

```ts
    // D.4 — Routage défensif anticipé. Pour les défenseurs hors contact
    // d'écran, hors rotation PnR et hors override manuel, on remplace le
    // lerp droit par une route qui contourne les autres joueurs. Les
    // endpoints (defA/defB) sont inchangés — seule la trajectoire entre
    // eux courbe. Obstacles échantillonnés au milieu de segment (t=0.5),
    // ce qui rend la route déterministe et calculable une fois par
    // segment. PAI et resolvePlayerCollisions restent les filets en aval.
    if (
      state.defensiveRouting &&
      !screenLockedDefenders.has(id) &&
      !defB[id].pnrRole &&
      !state.steps[idxB]?.defenseOverrides?.[id]
    ) {
      const routeObstacles: RouteObstacle[] = [];
      defenderIds.forEach((other) => {
        if (other === id) return;
        routeObstacles.push({
          center: lerpPoint(defA[other], defB[other], 0.5),
          radius: MIN_PLAYER_CLEARANCE_PX,
        });
      });
      const matchedAtt = defB[id].matchedTo;
      (Object.keys(offA) as AttackerId[]).forEach((oId) => {
        if (oId === matchedAtt || attackerIsScreening[oId]) return;
        const oa = offA[oId];
        const ob = offB[oId];
        if (!oa || !ob) return;
        routeObstacles.push({
          center: lerpPoint(oa, ob, 0.5),
          radius: MIN_PLAYER_CLEARANCE_PX,
        });
      });
      const route = computeDefensiveRoute(defA[id], defB[id], routeObstacles);
      if (route.waypoints.length > 2) {
        p = sampleRoute(route, effT);
      }
    }
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: aucune sortie (0 erreur). Si `AttackerId` n'est pas déjà importé dans `frameResolver`, l'ajouter à l'import de types existant.

- [ ] **Step 4: Run the existing playback tests**

Run: `npx vitest run frameResolver d5Interpolation playbackPerf`
Expected: PASS — le flag est `undefined` par défaut, donc comportement legacy strictement inchangé.

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic/playback/frameResolver.ts
git commit -m "feat(frameResolver): D.4 — routage anticipé des défenseurs (opt-in)"
```

---

### Task 8: Test d'intégration — invariant clearance + déterminisme

**Files:**
- Create: `src/lib/logic/__tests__/d4DefensiveRouting.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// D.4 — Test d'intégration du routage défensif dans le playback.
// Vérifie que, flag activé, le routage (a) ne casse JAMAIS l'invariant
// de clearance (Règle 1 / PLAYER-CLEARANCE.md), et (b) reste déterministe.
// La validation de l'AMÉLIORATION visuelle (moins de bruit) passe par les
// golden metrics J.6 régénérées flag on, hors de ce test automatique.

import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { resolveFrameAt } from '@/lib/logic/playback/frameResolver';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

/** État à >= 2 steps : on duplique le step 0 pour garantir une transition
 *  jouable, puis on active le routage. */
function routingState(): AppState {
  const s = makeInitialState();
  const steps = s.steps.length >= 2 ? s.steps : [s.steps[0], { ...s.steps[0], annotations: [] }];
  return { ...s, steps, defensiveRouting: true };
}

/** Min de clearance observé sur toute la lecture, échantillon dense. */
function minClearance(state: AppState, framesPerTransition = 40): number {
  let min = Infinity;
  const transitions = state.steps.length - 1;
  for (let trans = 0; trans < transitions; trans++) {
    for (let k = 0; k <= framesPerTransition; k++) {
      const frame = resolveFrameAt(state, trans + k / framesPerTransition);
      if (!frame) continue;
      const pts = [
        ...Object.values(frame.off),
        ...Object.values(frame.defPos).map((d) => ({ x: d.x, y: d.y })),
      ];
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d < min) min = d;
        }
      }
    }
  }
  return min;
}

describe('D.4 — routage défensif (intégration playback)', () => {
  it('préserve l\'invariant de clearance flag activé', () => {
    const state = routingState();
    // tolérance 1 px : resolvePlayerCollisions garantit la clearance dure.
    expect(minClearance(state)).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 1);
  });

  it('est déterministe : 2 résolutions de la même frame sont identiques', () => {
    const state = routingState();
    const a = resolveFrameAt(state, 0.5);
    const b = resolveFrameAt(state, 0.5);
    expect(a?.defPos).toEqual(b?.defPos);
  });

  it('ne lève aucune exception sur toute la lecture flag activé', () => {
    const state = routingState();
    expect(() => minClearance(state)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run d4DefensiveRouting`
Expected: PASS (3 tests). Si un test échoue, corriger le câblage de la Task 7 avant de continuer (ne pas affaiblir l'assertion).

- [ ] **Step 3: Commit**

```bash
git add src/lib/logic/__tests__/d4DefensiveRouting.test.ts
git commit -m "test(d4): D.4 — invariant clearance + déterminisme du routage playback"
```

---

### Task 9: Toggle UI dans `DefensePanel`

**Files:**
- Modify: `src/components/DefensePanel.tsx` (après le bloc `pathAwareInterpolation`, ~ligne 912)

- [ ] **Step 1: Add the checkbox**

Juste après le `)}` qui ferme le bloc `{state.pathAwareInterpolation && ( <Slider … /> )}` (~ligne 912), ajouter :

```tsx
              <CheckboxLine
                checked={!!state.defensiveRouting}
                label="routage défensif anticipé (D.4)"
                onChange={(v) => props.onPatch({ defensiveRouting: v })}
                title="Les défenseurs hors contact d'écran contournent les autres joueurs pendant la lecture, au lieu d'aller en ligne droite + correction a posteriori. Opt-in, à comparer A/B."
              />
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: aucune sortie (0 erreur).

- [ ] **Step 3: Commit**

```bash
git add src/components/DefensePanel.tsx
git commit -m "feat(ui): D.4 — toggle routage défensif dans DefensePanel"
```

---

### Task 10: Validation Règle 1bis + non-régression + ROADMAP

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Run the Règle 1bis guard suite**

Run: `npx vitest run screens overlap userJson screenLab`
Expected: PASS — aucune régression. Obligation CLAUDE.md Règle 1bis pour toute modif touchant `playback/frameResolver.ts`.

- [ ] **Step 2: Run the full suite + golden snapshots**

Run: `npx vitest run`
Expected: PASS sur l'intégralité. Les snapshots golden J.6 (`j6GoldenSnapshots`) doivent rester **inchangés** : le flag `defensiveRouting` est `undefined` par défaut, donc le comportement par défaut est strictement identique. Un snapshot modifié signalerait une fuite du flag — investiguer avant de continuer.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: aucune sortie.

- [ ] **Step 4: Update ROADMAP**

Dans `ROADMAP.md`, remplacer la ligne du chantier D.4 :

```
| D.4 | **Pathfinding A* défensif** : un défenseur va en ligne droite vers sa cible, `resolvePlayerCollisions` corrige a posteriori. A* simplifié sur obstacles dynamiques éviterait le bruit. | 3-4j | 🔴 | Moyen |
```

par :

```
| ~~D.4~~ | ~~**Pathfinding défensif V1 (playback)** : module pur `defensiveRoute.ts` (routes candidates + lissage Catmull-Rom), branché dans `frameResolver` derrière le flag opt-in `state.defensiveRouting`. V2 (cibles de step) = plan séparé.~~ | — | — | — | 🟢 V1 livré 2026-05-22 |
```

- [ ] **Step 5: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): D.4 V1 (pathfinding défensif playback) livré"
```

---

## Notes de fin de plan

- **V1 = opt-in, zéro régression par défaut.** Le flag `defensiveRouting`
  reste `false` par défaut. La bascule du défaut à `true` se fera dans un
  commit ultérieur, après calibration visuelle par le coach (comparaison
  A/B via le toggle).
- **V2 (plan séparé)** : routage des cibles de step dans
  `speedConstraint.ts`. À rédiger après validation de V1 — touche le cœur
  du moteur défensif (Règle 1bis), donc livré seulement une fois V1 prouvé
  stable. Réutilise tel quel le module `defensiveRoute.ts`.
- **Fallback A\* grille** : non implémenté. Reste documenté dans le spec
  comme option si les golden metrics révèlent un cas non couvert par les
  routes candidates.
