# D.4 — Pathfinding défensif V2 (cibles de step) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre le routage défensif au calcul des cibles de step : un défenseur `late` paie le détour autour des obstacles non-écran et sa position de step suit la route, au lieu d'un scaling rectiligne corrigé a posteriori.

**Architecture:** Réutilise tel quel le module pur `defensiveRoute.ts` (livré en V1). Modifie la seule fonction `computeEffectiveDefensePositions` dans `speedConstraint.ts` : pour les défenseurs éligibles (hors écran / PnR / closeout / override), calcule `defensiveRoute(from, to, obstaclesNonÉcran)`, allonge `pathLen` de la longueur de route (le défenseur paie le détour → devient `late` plus tôt), et place le défenseur `late` en échantillonnant la route. Reste derrière le flag opt-in `state.defensiveRouting` déjà existant.

**Tech Stack:** TypeScript, Vitest. Réutilise `computeDefensiveRoute` / `sampleRoute` / `RouteObstacle` / `DefensiveRoute` de `src/lib/logic/defensiveRoute.ts`.

**Pré-requis :** D.4 V1 livré (module `defensiveRoute.ts` + câblage `frameResolver`). Le flag `state.defensiveRouting` existe déjà. V2 le réutilise — pas de nouveau flag.

---

### Contexte — la fonction modifiée

`computeEffectiveDefensePositions` (dans `src/lib/logic/defense/speedConstraint.ts`) calcule, pour chaque défenseur, sa position effective de step. Par défenseur `dId` :

- `from = prevPositions[dId]` (position au step précédent), `to` = cible relaxée.
- `const candidates = screenerObstacles.filter((o) => dId !== o.defenderToSkip);`
- `const pathLen = pathAroundScreensLength(from, to, candidates);` — **Lever A** : longueur d'arc autour des **clusters d'écran**. Sert au clamp de vitesse.
- `nonMatchedAttackerPositions: Point[]` — déjà construit plus haut dans la fonction (attaquants ≠ `matched`).
- Décision `late` : `if (stepIdx === 0 || pathLen <= effectiveMaxSpeed || isScreenedThisStep)` → position = `to` (`late: false`) ; sinon → `late: true`, position = `from + (to - from) * r` avec `r = effectiveMaxSpeed / pathLen`.
- `isCloseoutTransition` est une variable booléenne de portée fonction (calculée en tête).
- En fin de fonction, `resolvePlayerCollisions(out, offAtStep, MIN_PLAYER_CLEARANCE_PX)` est le filet dur — il reste en aval de V2.
- `MIN_PLAYER_CLEARANCE_PX` est déjà importé dans le fichier (depuis `../../data/physics`).

V2 et le **Lever A** sont complémentaires : Lever A route les **écrans**, V2 route les **obstacles non-écran**. Ils s'appliquent à des défenseurs différents (l'éligibilité V2 exclut les défenseurs en contact d'écran).

---

### Task 1: Routage V2 dans `computeEffectiveDefensePositions`

**Files:**
- Modify: `src/lib/logic/defense/speedConstraint.ts`
- Test: `src/lib/logic/__tests__/d4DefensiveRoutingV2.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Créer `src/lib/logic/__tests__/d4DefensiveRoutingV2.test.ts` :

```ts
// D.4 V2 — Routage des cibles de step dans `computeEffectiveDefensePositions`.
// Vérifie que, flag activé, un défenseur éligible dont le trajet direct
// croise un obstacle non-écran (a) voit sa cible de step déviée vs flag
// désactivé, et (b) ne casse jamais l'invariant de clearance (Règle 1).

import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import { getActiveDefenderIds } from '@/lib/logic/players';

/**
 * Construit un état 2 steps en défense individuelle où un défenseur
 * éligible doit, au step 1, traverser une zone occupée par un autre
 * joueur — ce qui force le routage V2 quand le flag est actif.
 *
 * L'IMPLÉMENTEUR construit la géométrie : partir de `makeInitialState()`,
 * ajouter/ajuster un step 1 où un attaquant non-marqué (ou un défenseur)
 * se trouve sur le segment droit `from→to` d'un défenseur qui n'est ni
 * sur écran, ni en PnR, ni en closeout. Itérer les coordonnées jusqu'à
 * obtenir une divergence flag-on vs flag-off.
 */
function v2RoutingState(): AppState {
  const base = makeInitialState();
  // L'implémenteur complète ce builder (voir Step 3 ci-dessous).
  return base;
}

describe('D.4 V2 — routage des cibles de step', () => {
  it('flag activé → au moins une cible de défenseur dévie vs flag désactivé', () => {
    const state = v2RoutingState();
    const off = effectiveDefensePositions({ ...state, defensiveRouting: false }, 1);
    const on = effectiveDefensePositions({ ...state, defensiveRouting: true }, 1);
    const ids = getActiveDefenderIds(state.playerCount);
    const maxDelta = Math.max(
      ...ids.map((id) => Math.hypot(on[id].x - off[id].x, on[id].y - off[id].y)),
    );
    expect(maxDelta).toBeGreaterThan(2);
  });

  it('flag activé → invariant de clearance préservé entre tous les joueurs', () => {
    const state = { ...v2RoutingState(), defensiveRouting: true };
    const def = effectiveDefensePositions(state, 1);
    const ids = getActiveDefenderIds(state.playerCount);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = def[ids[i]];
        const b = def[ids[j]];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        expect(d).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 1);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run d4DefensiveRoutingV2`
Expected: FAIL — `v2RoutingState()` est un stub, la divergence est 0 (le routage V2 n'existe pas encore et le builder n'est pas fini).

- [ ] **Step 3: Construct the test scenario AND implement the routing**

**3a — Finir le builder `v2RoutingState()`.** Construire un état 2 steps, défense `man`, où au step 1 un défenseur éligible (ni `onScreen`, ni `pnrRole`, ni closeout, ni override) a un trajet `from→to` qui croise un autre joueur à moins de `PLAYER_MIN_CLEARANCE_PX`. S'inspirer de `src/lib/logic/__tests__/d4DefensiveRouting.test.ts` (le builder V1 plante un joueur sur le segment d'un défenseur). Itérer : lancer le test, ajuster les coordonnées, jusqu'à ce que `maxDelta > 2`.

**3b — Implémenter le routage V2 dans `speedConstraint.ts`.**

Ajouter aux imports en tête du fichier :

```ts
import {
  computeDefensiveRoute,
  sampleRoute,
  type RouteObstacle,
  type DefensiveRoute,
} from '../defensiveRoute';
```

Dans `computeEffectiveDefensePositions`, repérer la ligne :

```ts
    const pathLen = pathAroundScreensLength(from, to, candidates);
```

La remplacer par le bloc suivant (la déclaration `const` devient `let` car `pathLen` peut être allongé par le détour) :

```ts
    let pathLen = pathAroundScreensLength(from, to, candidates);

    // D.4 V2 — Routage des cibles de step. Pour un défenseur éligible (défense
    // individuelle, hors contact d'écran, hors rotation PnR, hors closeout,
    // hors override — l'override est déjà traité en amont par un return), on
    // calcule un trajet qui contourne les obstacles NON-écran. La longueur de
    // route allonge `pathLen` (le défenseur paie le détour → devient `late`
    // plus tôt). S'il finit `late`, sa position de step suit la route (cf.
    // plus bas). Complémentaire du Lever A : Lever A route les écrans, V2 les
    // obstacles non-écran. Le filet dur `resolvePlayerCollisions` reste en aval.
    let routeForLate: DefensiveRoute | null = null;
    if (
      state.defensiveRouting &&
      state.defenseSystem === 'man' &&
      stepIdx > 0 &&
      !targets[dId].onScreen &&
      targets[dId].screenPhase !== 'impact' &&
      !targets[dId].pnrRole &&
      !(isCloseoutTransition && targets[dId].isCarrierDefender)
    ) {
      const routeObstacles: RouteObstacle[] = [];
      defenderIds.forEach((other) => {
        if (other !== dId) {
          routeObstacles.push({
            center: prevPositions[other],
            radius: MIN_PLAYER_CLEARANCE_PX,
          });
        }
      });
      nonMatchedAttackerPositions.forEach((pos) => {
        // Exclure les attaquants situés DANS un cluster d'écran (poseurs) :
        // les écrans sont gérés par le Lever A, V2 ne les route pas.
        const inScreenCluster = screenerObstacles.some(
          (o) => Math.hypot(o.center.x - pos.x, o.center.y - pos.y) < o.radius,
        );
        if (!inScreenCluster) {
          routeObstacles.push({ center: pos, radius: MIN_PLAYER_CLEARANCE_PX });
        }
      });
      const route = computeDefensiveRoute(from, to, routeObstacles);
      if (route.waypoints.length > 2) {
        routeForLate = route;
        // `pathLen` = le plus long des deux détours (écran vs non-écran).
        pathLen = Math.max(pathLen, route.length);
      }
    }
```

Puis repérer la branche `else` (le défenseur `late`). Elle commence par :

```ts
    } else {
      const r = effectiveMaxSpeed / pathLen;
      out[dId] = {
```

Juste APRÈS la ligne `const r = effectiveMaxSpeed / pathLen;`, insérer le calcul de position (une seule fois) :

```ts
      // D.4 V2 — si une route de contournement existe, la position `late`
      // suit la route échantillonnée à la fraction d'arc `r` ; sinon
      // scaling rectiligne legacy.
      const latePos = routeForLate
        ? sampleRoute(routeForLate, r)
        : { x: from.x + (to.x - from.x) * r, y: from.y + (to.y - from.y) * r };
```

Puis, dans le `out[dId] = { … }` de cette branche `else`, remplacer les deux lignes de position :

```ts
        x: from.x + (to.x - from.x) * r,
        y: from.y + (to.y - from.y) * r,
```

par :

```ts
        x: latePos.x,
        y: latePos.y,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run d4DefensiveRoutingV2`
Expected: PASS (2 tests).

Puis vérifier que le test n'est pas tautologique : forcer temporairement `defensiveRouting: false` dans le 1ᵉʳ test (`on`) → il doit ÉCHOUER (`maxDelta` ≈ 0). Rétablir.

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: aucune sortie (0 erreur).

- [ ] **Step 6: Commit**

```bash
git add src/lib/logic/defense/speedConstraint.ts src/lib/logic/__tests__/d4DefensiveRoutingV2.test.ts
git commit -m "feat(speedConstraint): D.4 V2 — routage des cibles de step (opt-in)"
```

---

### Task 2: Validation Règle 1bis + non-régression + ROADMAP

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Run the Règle 1bis guard suite**

Run: `npx vitest run screens overlap userJson screenLab`
Expected: PASS — zéro régression. Obligation CLAUDE.md Règle 1bis : `speedConstraint.ts` fait partie du pipeline défensif.

- [ ] **Step 2: Run the full suite**

Run: `npx vitest run`
Expected: PASS sur l'intégralité. Le flag `defensiveRouting` est `undefined` par défaut → comportement par défaut strictement inchangé, y compris les snapshots golden J.6. Un snapshot modifié signalerait une fuite du flag — investiguer avant de continuer.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: aucune sortie.

- [ ] **Step 4: Update ROADMAP**

Dans `ROADMAP.md`, repérer la ligne du chantier D.4 (elle commence par `| ~~D.4~~ | ~~**Pathfinding défensif V1 (playback)**~~`). Remplacer son texte par :

```
| ~~D.4~~ | ~~**Pathfinding défensif V1 + V2**~~ : module pur `defensiveRoute.ts` (routes candidates + escalade d'offset + lissage Catmull-Rom). V1 — câblé dans `frameResolver` (couche 5.c) route la trajectoire playback. V2 — câblé dans `speedConstraint` route les cibles de step (le défenseur `late` paie le détour non-écran et suit la route). Opt-in via `state.defensiveRouting`. | — | — | 🟢 V1+V2 livrés 2026-05-22 |
```

- [ ] **Step 5: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): D.4 V2 (pathfinding cibles de step) livré"
```

---

## Notes de fin de plan

- **V2 partage le flag `state.defensiveRouting` de V1.** L'activer route À LA FOIS
  la trajectoire playback (V1) et les cibles de step (V2). C'est voulu : le
  pathfinding défensif est une seule feature, l'A/B se fait feature-on vs
  feature-off.
- **Filet dur conservé.** La position routée passe par `resolvePlayerCollisions`
  en fin de `computeEffectiveDefensePositions` (Règle 1 / `PLAYER-CLEARANCE.md`).
- **Complémentarité Lever A.** V2 n'altère pas `pathAroundScreensLength` : il en
  prend le `max` avec la longueur de route. Un défenseur en contact d'écran est
  exclu du routage V2 par l'éligibilité — le Lever A reste seul maître des écrans.
- **Per-segment recompute.** Comme en V1, la route est recalculée à chaque appel
  de `computeEffectiveDefensePositions` ; la fonction est déjà mémoïsée par pas
  via `effectiveDefenseCache`, donc le surcoût est borné.
