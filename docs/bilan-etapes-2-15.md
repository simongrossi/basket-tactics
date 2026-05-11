# Bilan consolidé — Étapes 2 à 15

> Mise à jour : **2026-05-11** (post-sprint réalisme écrans).
>
> Document de synthèse des grandes étapes de travail menées en continu sur la branche `main`. Pour le détail technique, voir [`CHANGELOG.md`](../CHANGELOG.md) ou [`etat-avancement.md`](./etat-avancement.md).

## Vue d'ensemble

| Bloc | Étapes | Thème | Tests à la fin |
|------|--------|-------|----------------|
| **Défense de zone — réflexes basket** | 2 → 5 | Désignation de couvreurs, rim protection, recover, pass denial | 394 |
| **Édition et lecture du scénario** | 6 → 7 | Décomposition téléports, branches manuelles | ~410 |
| **Timeline et édition continue** | 8 → 10b | Multi-track, phase début/fin, tStart/tEnd, cross-step | 426 |
| **Réalisme physique** | 11 → 12 | Pénalité contact écran, qualité d'écran 0-100 | 433 |
| **Temps absolu** | 13 | Timecode + shot clock 24s | 449 |
| **Playbook imprimable** | 14 | Timings, qualité, synoptique dans le PDF | 460 |
| **Réalisme écrans (refonte)** | 15 | Freeze, route-aware, recover, anti-téléport | **493** |

## Bloc 1 — Défense de zone réaliste (Étapes 2 → 5)

**Problème** : la défense de zone basée sur la simple ownership géométrique (chaque défenseur est attiré par les attaquants dans sa moitié de terrain) produisait du basket-spaghetti — 5 défenseurs collés tous attirés un peu par tout le monde.

**Solution** : pattern *designated coverer*. Avant la boucle de claims, on calcule **un défenseur prioritaire par menace** :

1. `designatedCoverer` — attaquant en zone-tueuse (high-post, short-corner) → défenseur le plus proche par homePos, boost ×4
2. `baselineDriveCoverer` — drive ligne de fond non fermée → wing low côté ballon
3. `ballPressureCoverer` — LE défenseur structurellement responsable de presser
4. `rimProtectorByThreat` — attaquant à <220 px du panier sans défenseur sur la trajectoire → défenseur disponible le plus proche du panier
5. `passDenierByReceiver` — attaquant non-porteur avec ligne de passe libre → défenseur naturel

Chaque détection propage un `unavailable: Set<DefenderId>` pour empêcher un défenseur de cumuler plusieurs missions. Trois nouveaux sliders `ZoneConfig` (paintCoverage, rimProtection, passDenial) modulent l'intensité.

Couche `applyRimProtectionLayer` en man-to-man : filet de sécurité quand un défenseur est perdu via écran ou switch.

## Bloc 2 — Édition et branches (Étapes 6 → 7)

**Étape 6** — Décomposition des téléports : nouvelle utilitaire `breakUpTeleports` qui insère des steps interpolés (`isInterpolated=true`) entre deux étapes consécutives dès qu'un joueur bouge de >100 px. Élimine les warnings `attacker-jump`. Les UI masquent ou réduisent ces steps fantômes.

**Étape 7** — Branches manuelles : nouveau type `ScenarioBranch` avec `divergeAfterActionId` + actions alternatives. `compileScenario` compile le main jusqu'à divergence puis applique la branche. Handlers `useAppState` branch-aware. PDF playbook peut inclure les variantes comme sections séparées.

## Bloc 3 — Multi-track timeline (Étapes 8 → 10b)

**Objectif** : visualiser et éditer **qui fait quoi à quel moment**, façon Adobe Premiere.

- **Étape 8** — Module `playerTracks` qui extrait les segments d'activité par joueur. Composant `MultiTrackTimeline` docké en bas + popup `PlayerTimelineModal`. Curseur vertical synchronisé temps réel.
- **Étape 9** — Champ `Annotation.phase: 'start' | 'end'`. Permet de dire si l'écran/cut est actif **dès le début** de l'étape (mouvement effectué dans la transition précédente) ou **à la fin**. Bouton ◀/▶ pour basculer en place. `upsertMovementAnnotation` synchronise les positions des étapes voisines.
- **Étape 10** — Champs `tStart`/`tEnd` (0..1) pour les bornes temporelles de l'action dans la transition. Poignées de drag sur les bords des segments. `attackerTrajectoryAt` mappe le temps global vers le temps d'action.
- **Étape 10b** — Extension cross-step : `tStart` jusqu'à -1, `tEnd` jusqu'à 2. Un segment peut déborder sur la transition précédente ou suivante. `attackerTrajectoryAt` regarde les annotations sur deux steps consécutifs.

## Bloc 4 — Réalisme physique des écrans (Étapes 11 → 12)

**Étape 11** — Pénalité de contact écran : le défenseur du porteur marqué `onScreen=true` reçoit `×0.55` sur sa vitesse max dans `speedConstraint`. Avant : D1 contournait l'écran trop rapidement. Après : il perd ~0.3-0.6s sur le contact, intuition basket respectée.

**Étape 12** — Qualité d'écran (0-100) : nouveau champ `Annotation.quality` qui module la pénalité Étape 11.

| Qualité | Label | Pénalité | Effet |
|---------|-------|----------|-------|
| 0 | ghost | ×1.00 | Faux écran, défenseur passe sans ralentir |
| 25 | loose | ×0.78 | Léger frottement (~0.2s perdues) |
| 50 | std | ×0.55 | Comportement Étape 11 (défaut) |
| 75 | solid | ×0.32 | Défenseur sensiblement late |
| 100 | lockdown | ×0.18 | D1 quasi-stoppé (~1.2s) |

Courbe linéaire par morceaux. UI : badge cliquable sur chaque segment screen. Le coach choisit le calibre de l'écran selon le profil du poseur (un O5 pivot fait un solid, un O2 léger fait un loose).

## Bloc 5 — Temps absolu (Étape 13)

Le moteur reste step-based, mais l'AFFICHAGE parle désormais le langage du basket réel.

- `secondsPerStep` (défaut 4) et `possessionSeconds` (défaut 24) modifiables dans Paramètres > TIMECODE.
- Module `timecode.ts` avec `formatClock`, `formatShotClock`, etc.
- Timeline : `0:08 / 0:16` + badge ⏱ shot clock (jaune <5s, rouge **VIOL.**).
- MultiTrackTimeline : timings absolus sur chaque header de transition (`0.0s`, `4.0s`…).

## Bloc 6 — Playbook imprimable (Étape 14)

**Problème** : avec actions parallèles + cross-step, deux annotations sur la même étape sont indistingables sur un PDF figé.

**Solution** :
- Sous chaque vignette : bandeau timecode + résumé textuel des annotations parallèles avec leurs timings absolus, qualité d'écran, et tags (★ cross-step, *(début)* pour phase='start').
- Section **Synoptique multi-pistes** cochable (page séparée) : grille joueur × transition avec barres positionnées selon tStart/tEnd. Pour les écrans, code qualité (`gh/lo/st/so/lk`).
- Helper `annotationSummary` extrait dans `pdfRecap.ts` (testable).

## Tests

Évolution du nombre de tests verts à chaque jalon :

```
Avant Étape 2    348 tests
Après Étape 5    394 tests   (+46)
Après Étape 8    ~410 tests  (+16)
Après Étape 10b  426 tests   (+16)
Après Étape 11   426 tests   (visuel uniquement)
Après Étape 12   433 tests   (+7   : screenPenaltyFromQuality)
Après Étape 13   449 tests   (+16  : timecode utilities)
Après Étape 14   460 tests   (+11  : annotationSummary, qualityLabel)
Après Étape 15   493 tests   (+33  : screenContact frame, freeze sigmoïdal,
                                     curve forcedPushSign, route-aware,
                                     recover, off-ball, invariants)
                 ─────────
TOTAL            +145 tests
```

## Bloc 7 — Refonte du réalisme des écrans (Étape 15)

Sprint dédié au comportement défensif sur écran. Les Étapes 11 et 12 avaient introduit la pénalité de vitesse + qualité, mais le coach a constaté plusieurs problèmes :
- D1 "glissait" sur le poseur sans contact visible
- Téléportation autour du poseur lors d'un micro-décalage du porteur
- D1 et O1 visuellement superposés en édition libre
- Vélocité discontinue au défige (D1 saute brutalement)

**Cause centrale** : `followDefendersAtFrame` réécrivait à chaque frame la position de D1 pour le re-coller sur son homme — court-circuitant tout le réalisme calculé en amont.

**Corrections** :
1. **`step0Detection.ts`** : substitue les positions de référence par les cibles homme-à-homme à step 0 → `detectScreen` fonctionne en édition libre.
2. **Cibles modulées par qualité** dans `applyScreenAdjustment` : D1 plaqué au poseur (over/hedge), derrière le porteur (under). Helper `pushOutOfCarrier` pour garantir ≥34px de clearance.
3. **`sideOfCarrier` continu** (projection normalisée) au lieu de `Math.sign` → fin du téléport à la traversée d'axe.
4. **`screenContactT` sigmoïdal** dans frameResolver : freeze lisse sans discontinuité de vélocité. Modes `arriving`/`leaving`/`stuck`.
5. **`screenLockedDefenders: Set<DefenderId>`** passé à `followDefendersAtFrame(skipIds)` → D1 conserve sa position calculée.
6. **`isRecoveringFromCarrierScreen`** dans speedConstraint : la pénalité s'étale sur le step suivant (recover lent).
7. **Routes route-aware** : `curveAroundObstacle(forcedPushSign)`, `contactQualityForRule` (under ×1.18, hedge ×1.05, over ×0.85, ice ×0.65).
8. **Écrans non-porteur** : mode arriving/leaving/stuck étendu au cutterDef.

**Invariants testés** :
- Aucun chevauchement défenseur ↔ porteur/poseur (toutes rules × toutes qualities)
- Continuité de position autour de l'axe poseur→panier (balayage 100px, jump <10px par 1px de drag)
- Trajectoire de D1 ne traverse JAMAIS le rayon du poseur (échantillonnage 0 → 1)
- D1 reste `late` après un lockdown, pas après un ghost (recover)

Doc détaillée dans [`CHANGELOG.md > Étape 15`](../CHANGELOG.md).

## Architecture finale (modules clefs)

```
src/lib/
  types/index.ts                  # Annotation.{phase, tStart, tEnd, quality}
                                  # AppState.{secondsPerStep, possessionSeconds, scenarioBranches}
  logic/
    breakUpTeleports.ts           # Étape 6
    compileScenario.ts            # Étapes 7 (branches)
    playerTracks.ts               # Étape 8 (TrackSegment)
    playbackTrajectory.ts         # Étape 10b (cross-step lookup)
    pdfRecap.ts                   # Étape 14 (annotationSummary)
    timecode.ts                   # Étape 13
    stepMutations.ts              # Étape 9 (phase synchronisation)
    threatResolution.ts           # Étapes 3, 5 (designated coverers)
    baselineDrive.ts              # Étape 2d
    step0Detection.ts             # Étape 15 (substitution pour detectScreen)
    screens.ts                    # Étape 15 (applyScreenAdjustment quality,
                                  #           sideOfCarrier continu, routes)
    geometry.ts                   # Étape 15 (curveAroundObstacle forcedPushSign)
    defense/
      speedConstraint.ts          # Étapes 11, 12, 15 (penalty + recover)
      frameAdjust.ts              # Étape 15 (followDefendersAtFrame skipIds)
    playback/
      frameResolver.ts            # Étape 15 (screenContactT, routes, lock)
src/components/
  Timeline.tsx                    # Étape 13 (horloge + shot clock)
  MultiTrackTimeline.tsx          # Étapes 8/9/10/10b/12 (édition)
  PlaybookView.tsx                # Étape 14 (PDF + synoptique)
  ParametresPanel.tsx             # Étape 13 (réglages timecode)
  CourtView.tsx                   # Étape 15 (staticFrame avec détection step 0)
src/hooks/
  useAppState.ts                  # Handlers : setAnnotationPhase/Timing/Quality
```

## Limites résiduelles connues

- **Recover after help engine-level** : les défenseurs en transit après aide sont limités par `speedConstraint`. Le boost recover et le diagnostic atténuent mais ne corrigent pas un défenseur qui doit physiquement traverser le terrain.
- **Pas de "rotation cascade" 5-stages** : quand un défenseur sort, ses voisins comblent partiellement (via `ballSideShifted`) mais pas via une vraie chaîne dynamique.
- **Pas d'auto-decay sur la qualité d'écran** : un écran reste à sa qualité initiale toute la possession. Pour un comportement type "le pivot tient X secondes puis se dégage", il faudrait un `quality(t)`.
- **Timecode décoratif** : le moteur ne consomme pas `secondsPerStep` — un step prend le même temps qu'avant côté physique, seul l'affichage change. Pour un vrai modèle physique en m/s, il faudrait recalibrer `maxSpeed` en fonction de `secondsPerStep`.
- **Étape 15 — état de contact écran multi-phase explicite** : actuellement encodé via les flags `onScreen` defA/defB + le mode (arriving/leaving/stuck). Un vrai modèle (approche → impact → arrest → contournement → recover) avec durées propres reste à concevoir.
- **Étape 15 — indicateur visuel dédié sur D1** ("contact", "bloqué", "recover") masqué par l'anneau `isCarrierDefender`.
- **Étape 15 — recover off-ball** : `isRecoveringFromCarrierScreen` ne couvre que le carrier defender. Le cutterDef d'un pindown/flare/stagger n'a pas encore de mémoire de retard au step suivant.

## Pour la suite

Pistes envisagées (cf. [`docs/ideas.md`](./ideas.md)) :

- **Auto-shot-clock awareness** : la défense passe en *deny aggressive* sous 8s, *trap* sous 4s.
- **Snap-to-common-values** sur tStart/tEnd (0, 0.25, 0.5, 0.75, 1).
- **Mode présentation** plein écran avec narration step-by-step.
- **Branches auto** déclenchées par état du jeu (drop coverage observée → branche pull-up).
- **Split view** pour comparer deux variantes côte-à-côte.
