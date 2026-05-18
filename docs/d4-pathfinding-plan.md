# D.4 — Pathfinding défensif : plan d'implémentation V1 et audit risque

> Document de cadrage pour D.4. Pas de code écrit ici, juste la liste de
> ce qui va être fait, ce qui est sûr, et ce qui est risqué.
> Référence ROADMAP : Phase D, ligne ⚪ D.4.

---

## TL;DR

D.4 V1 = **un seul helper pur** (`defensiveRoute`) + **un seul point
d'injection** (frameResolver, après `applyDefenderMotionInertia` et
**avant** la passe de collision finale). Pas de modification du moteur
tactique (`effectiveDefensePositions` reste intact). **Activation
conditionnelle** stricte qui exclut tous les cas où il y a déjà une
logique tactique (écran, override, screen-lock, déjà en contact).

**Coût** : 2-3j helper + 1-2j validation golden metrics = **~3-4j V1**.

**Risque global** : 🟡 moyen, **abaissable à 🟢 vert** en respectant
les 5 garde-fous listés plus bas.

---

## ✅ Ce qui sera fait (V1)

### 1. Helper pur `defensiveRoute`

Fichier : `src/lib/logic/defense/defensiveRoute.ts` (nouveau)

Signature pure :

```ts
interface RouteObstacle {
  center: Point;
  radius: number;
  /** Tag pour pouvoir exclure (ex: 'matched' pour l'homme du défenseur). */
  kind: 'attacker' | 'defender' | 'matched-attacker';
}

interface DefensiveRouteOptions {
  /** Préférence latérale tactique. Si fournie, prioritise la route de ce
   *  côté (utile pour respecter une side constraint). undefined = libre. */
  preferredSide?: 'left' | 'right';
  /** Nombre maximum de courbes Bezier à composer. Cap à 2 pour V1
   *  (1 contournement par cluster, pas une vraie séquence). */
  maxBends?: number;
}

interface DefensiveRouteResult {
  /** Polyligne échantillonnée (3-5 points), ou null si la route directe
   *  est déjà OK / aucune route candidate n'évite les obstacles. */
  waypoints: Point[] | null;
  /** Indique quel candidat a gagné (debug). */
  chosen: 'direct' | 'curve-left' | 'curve-right';
  /** Longueur effective de la route choisie (utile pour adapter la
   *  contrainte de vitesse en aval). */
  length: number;
}

function defensiveRoute(
  from: Point,
  to: Point,
  obstacles: RouteObstacle[],
  options?: DefensiveRouteOptions,
): DefensiveRouteResult
```

**Logique interne** :
1. Filtre les obstacles qui chevauchent vraiment le segment `from → to`
   (utilise `pickBlockingCluster` qui existe déjà).
2. Si zéro obstacle bloquant → renvoie `{ waypoints: null, chosen: 'direct' }`.
3. Sinon, génère 2 candidats via `curveAroundObstacle` :
   - Courbe par la gauche (offset perpendiculaire négatif)
   - Courbe par la droite (offset perpendiculaire positif)
4. Évalue chaque candidat : longueur + collisions résiduelles (autres
   obstacles non encore résolus).
5. Choisit le plus court SANS collision. Si les deux échouent → fallback
   `direct` + flag de log.
6. Si `preferredSide` est fourni et la route de ce côté est valide,
   priorise (même si légèrement plus longue) — respecte les side constraints
   tactiques.

**Tests** (8-10) :
- Aucun obstacle → `direct`
- 1 obstacle centré → choisit le contournement le plus court
- 2 obstacles côté-à-côté → contourne le cluster
- `preferredSide: 'left'` force le contournement gauche même si droit plus court
- Obstacle `kind: 'matched-attacker'` est ignoré (le défenseur DOIT atteindre son homme)
- Longueur renvoyée cohérente avec `pathAroundScreensLength`
- Robustesse : `from === to`, distance nulle, obstacles vides
- Performance : <0.5 ms par appel sur 5 obstacles

### 2. Injection dans `frameResolver`

Un **seul** point d'injection, dans `resolveFrameAt`, après le calcul
`defPos` issu de `effectiveDefensePositions` et après
`applyDefenderMotionInertia`. **Avant** la passe finale
`resolvePlayerCollisions`.

```ts
// Pseudo-code de l'injection
if (state.defensiveRouteEnabled && stepIdx > 0 && options.prevFrame) {
  defenderIds.forEach((dId) => {
    if (screenLockedDefenders.has(dId)) return;          // garde-fou A
    if (cur.defenseOverrides?.[dId]) return;             // garde-fou B
    if (defPos[dId].onScreen) return;                    // garde-fou C
    if (defPos[dId].pnrRole) return;                     // garde-fou D
    if (motionResult?.applied) return; // déjà adouci    // garde-fou E

    const prev = options.prevFrame.defPos[dId];
    const to = defPos[dId];
    const obstacles = buildRouteObstacles(off, defPos, dId, defPos[dId].matchedTo);

    const route = defensiveRoute({ x: prev.x, y: prev.y }, { x: to.x, y: to.y }, obstacles);

    if (route.waypoints && route.waypoints.length > 0) {
      // Interpoler le défenseur le long de la polyligne pour la position
      // INTERPOLÉE à localT (la cible de step reste celle de defPos).
      // Le rate-limiter et resolvePlayerCollisions tournent ensuite.
      const sampled = samplePolyline(route.waypoints, localT);
      defPos[dId].x = sampled.x;
      defPos[dId].y = sampled.y;
    }
  });
}
```

**Note importante** : ce changement n'affecte **que la position
INTERPOLÉE pendant le playback**. Le `defPos` final transmis à
`resolvePlayerCollisions` est ensuite reclampé. Les snapshots aux step
exacts (t = 0 et t = 1) restent **identiques** à l'état legacy.

### 3. Setting opt-in

Type `AppState.defensiveRouteEnabled?: boolean` (default `false` =
comportement legacy strict). Toggle dans `ParametresPanel` → section
debug, ou dans `DefensePanel` → section avancée.

### 4. Tests d'intégration ciblés

En plus des 8-10 tests unitaires sur le helper :
- 3 tests d'intégration (frameResolver avec/sans flag, position
  intermédiaire diffère mais step exact identique)
- 1 test sur le golden metrics (snapshot avant/après sur 3-4 scénarios)

### 5. Documentation

Ajouter une section dans `docs/SCREEN-ENGINE.md` qui précise :
- `defensiveRoute` est appelé **après** le moteur d'écran
- Les écrans ont la **priorité absolue** (screen-lock skipé)
- Pas de récursion sur step précédent (le calcul est par-frame)

---

## 🟢 Ce qui est SANS RISQUE (garde-fous garantis)

### A. Le moteur d'écran n'est PAS touché

- `defensiveRoute` est appelé **après** `resolveFrameAt` calcule `defPos`
  via `effectiveDefensePositions`.
- Tous les défenseurs dans `screenLockedDefenders` (= en contact d'écran)
  sont **skippés en bloc**.
- `defenseOverrides` (positions manuelles utilisateur) **skippés**.
- Aucune modification de `src/lib/logic/screens/`, `defense/baseTargets.ts`,
  `defense/pnrLayer.ts`, `playbackTrajectory.ts`.

### B. Les snapshots de step restent identiques

- `defensiveRoute` n'affecte que les **positions interpolées** (`localT ∈ (0, 1)`).
- À `localT = 0` (step source) et `localT = 1` (step destination), le
  défenseur est aux positions calculées par `effectiveDefensePositions`.
- Tous les tests qui samplent à des index entiers (`stepIdx = 0, 1, 2…`)
  restent verts.

### C. Le rate-limiter et resolvePlayerCollisions tournent en aval

- Si `defensiveRoute` produit une route qui chevauche un joueur, la
  passe `resolvePlayerCollisions` finale la corrige.
- Pas de saut > `MAX_JUMP_PX` possible : le rate-limiter clampe.
- Invariant `PLAYER_MIN_CLEARANCE_PX = 34` préservé.

### D. Opt-in strict

- `defensiveRouteEnabled` default `false` → **aucun comportement par
  défaut ne change**.
- Tous les tests existants tournent en mode "flag off" → légifèrent
  le comportement legacy.

### E. Helper pur, testable hors moteur

- `defensiveRoute` n'a aucun side effect, ne lit pas l'AppState.
- Tests unitaires rapides (<5 ms le fichier complet).

---

## 🔴 Ce qui est RISQUÉ (à surveiller)

### R1 — Cohabitation avec `applyDefenderMotionInertia` (D.2 V2)

**Risque** : D.2 V2 modifie déjà la position interpolée pour amortir
les changements de direction. Si `defensiveRoute` modifie ENCORE après,
on peut avoir un blend incohérent (l'inertie a tiré dans un sens, la
route force dans l'autre).

**Mitigation** :
- Le garde-fou **E** ci-dessus skip `defensiveRoute` si `motionResult?.applied`
  est true. Mais c'est binaire et peut désactiver trop largement.
- Alternative : appliquer `defensiveRoute` **AVANT** `applyDefenderMotionInertia`,
  pour que l'inertie soit calculée sur la route courbée. Ça demande de
  réorganiser l'ordre dans `resolveFrameAt`.

**Validation** : tests `motionInertia` doivent rester verts. Ajouter un
test "route + inertie" qui vérifie la cohérence des deux.

### R2 — Tests `screen*` régressifs

**Risque** : `defensiveRoute` ignore les écrans (garde-fou A), mais peut
sélectionner une route qui interfère visuellement avec un défenseur en
plein écran (le défenseur du porteur courbe autour d'un attaquant
non-poseur juste à côté du poseur).

**Mitigation** :
- Avant chaque commit moteur, lancer **les 13 tests screen** listés dans
  CLAUDE.md (`screens*` + `overlap*` + `userJson*` + `screenLab*`).
- Ajouter un scénario screen test dédié : "pendant un PnR central,
  defensiveRoute ne dévie pas le carrierDef de sa trajectoire over/under
  tactique".

### R3 — Performance (resolveFrameAt dans le hot path)

**Risque** : `resolveFrameAt` est appelé **60×/seconde pendant le playback**.
Ajouter un calcul de route + sampling de polyligne × 5 défenseurs = coût
non négligeable.

**Mitigation** :
- Helper optimisé (<0.5 ms par appel cf. test perf).
- Memoization : la route est calculée 1× par couple (stepIdx-1, stepIdx)
  et mise en cache via `motionMemory` ou similaire. Recalculée seulement
  quand `from`/`to` changent (= entre 2 frames sur la même transition,
  ils ne changent PAS).
- Profilage avant merge via `options.profile` existant.

### R4 — Conflit avec routes screen tactiques (over/under/hedge)

**Risque** : Sur un PnR, le carrierDef a une route tactique (over =
passer dessus de l'écran, under = dessous). Si `defensiveRoute` voit
le poseur comme un obstacle, il peut imposer un détour qui contredit
le over/under choisi.

**Mitigation** :
- Garde-fou D : skip si `defPos[dId].pnrRole` est défini (le défenseur
  est en rôle PnR explicite).
- Garde-fou C : skip si `defPos[dId].onScreen` est true (= contact d'écran
  actif).
- Plus large : utiliser le `chosen` de `decisions[dId].routeKind` (déjà
  calculé par le moteur écran) comme `preferredSide` du helper.

### R5 — Interaction avec C.2 V2 (helpStickyLayer) et F.5 (lateShotClockLayer)

**Risque** : les couches sticky help et late shot clock placent les
défenseurs sur des positions tactiques précises. Si `defensiveRoute`
les courbe pendant l'interpolation, on peut perdre la lisibilité
"D2 reste 1.2s en aide" → l'animation peut zigzaguer.

**Mitigation** :
- Garde-fou supplémentaire : skip si `defPos[dId].helpTriggered === true`
  (le défenseur est en aide active, on respecte sa position).
- Si la couche sticky a déjà adouci la position (cf. blendFactor C.2),
  pas la peine de re-courber.

### R6 — Test golden metrics potentiellement bruyants

**Risque** : Les golden snapshots actuels (J.6 V1, livré) ont été
calibrés sur le comportement legacy. `defensiveRoute` va modifier
légèrement les positions intermédiaires sur certains templates, et le
diff sera "non" même si le comportement est meilleur.

**Mitigation** :
- Les golden metrics ne sont **pas exécutés par défaut** dans la suite
  (ils sont opt-in). Lancer manuellement avant/après et auditer.
- Si diff trop large, regenerer les snapshots en passant explicitement
  par "with-defensiveRoute" pour valider la nouvelle base.

---

## 🛡 Checklist obligatoire avant chaque commit moteur

Conformément à la **Règle 1bis** de [CLAUDE.md](../CLAUDE.md), si on
touche à `frameResolver.ts` ou crée des modules sous `defense/` :

1. [ ] Relire `docs/SCREEN-ENGINE.md` avant édition
2. [ ] `npx vitest run "screens*"` → tous verts
3. [ ] `npx vitest run "overlap*"` → tous verts
4. [ ] `npx vitest run "userJson*"` → tous verts
5. [ ] `npx vitest run "screenLab*"` → tous verts
6. [ ] `npx vitest run` → suite complète verte
7. [ ] `npx tsc --noEmit` → type-check propre
8. [ ] Inspection manuelle dans Screen Lab (drag, dribble, screen
      visible)
9. [ ] Diff golden metrics : auditer chaque changement

---

## 🎯 Plan de découpe en commits

Pour limiter le blast radius si quelque chose casse :

| # | Scope | Tests à passer | Risque |
|---|---|---|---|
| 1 | Helper pur `defensiveRoute` + tests unitaires | nouveaux tests | 🟢 |
| 2 | Setting `defensiveRouteEnabled` (type only, pas branché) | tsc | 🟢 |
| 3 | Injection conditionnelle dans `resolveFrameAt` (default off) | suite complète | 🟡 |
| 4 | UI toggle dans ParametresPanel | tsc | 🟢 |
| 5 | Documentation SCREEN-ENGINE | aucun | 🟢 |
| 6 | Tests intégration + golden metrics (si besoin regenerate) | suite + golden | 🟡 |

**Si commit #3 casse un test screen, on peut le revert sans toucher au
helper (commit #1) qui reste utile pour des refacto futurs.**

---

## ⏱ Estimation finale

- Commit #1 : 4-6h (helper + tests)
- Commit #2-4 : 2-3h (intégration légère)
- Commit #5 : 30 min (doc)
- Commit #6 : 4-6h (validation + golden si besoin)
- Buffer surveillance regressions : 4-6h

**Total : 2-3 jours** (estimation ROADMAP "3-4j" était large pour
inclure A* grille V2 — non prévu en V1).

---

## ❓ Question avant de lancer

Le V1 décrit ici est **conservateur** : il ne touche que la position
visuelle pendant le playback, pas la tactique. Si tu veux un effet plus
fort (par exemple : la cible du moteur tactique elle-même est routée
autour des obstacles), c'est V2 et le risque grimpe à 🔴.

Pour V1, le bénéfice attendu est :
- Moins de micro-collisions visibles à mi-step
- Trajectoires défensives plus "lisses" quand un défenseur traverse
  un cluster d'attaquants
- Pas de gain tactique (positions de step inchangées)

Si OK pour ces bénéfices modérés, on peut lancer V1 sereinement.
