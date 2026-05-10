# État d'avancement du projet

> Vue consolidée de **ce qui est fait**, **ce qui est en cours**, et **ce qui reste à faire**, pour ne rien oublier entre deux sessions de travail.
>
> Mise à jour : **2026-05-10**.
>
> Pour la roadmap exhaustive des actions FIBA, voir [`fiba-actions-roadmap.md`](./fiba-actions-roadmap.md).

---

## 🆕 Travail récent — Étapes 2/3/4 réflexes défensifs (sur `main`)

Refonte significative de la défense de zone pour encoder les **principes basket fondamentaux** qui doivent l'emporter sur la simple ownership géométrique. Documentation détaillée : [logique-defensive.md > Réflexes défensifs avancés](./logique-defensive.md#réflexes-défensifs-avancés-étapes-2-4).

### Étape 2 — Désignation de couvreurs (zone)

- **2.a `designatedCoverer`** : un attaquant en zone-tueuse (high-post / short-corner) **isolé** (aucun coéquipier <80 px) déclenche une désignation explicite du défenseur le plus proche par homePos. Boost ×4 sur sa claim, bias home (40% vers l'attaquant pour high-post). Évite la dilution d'ownership entre 5 défenseurs concurrents.
- **2.b `paintCoverage`** : nouveau slider `ZoneConfig.paintCoverage` (0-100, défaut 50) qui module l'agressivité des boosts ci-dessus.
- **2.c `isHighPost` élargi** : couvre maintenant la "tête de raquette" (verticalFromHoop ∈ [80, 200], au lieu de [130, 200]) — inclut le top-of-paint en plus de la FT line.
- **2.d `baselineDriveCoverer`** : détection couloir baseline non fermé (cf. [`baselineDrive.ts`](../src/lib/logic/baselineDrive.ts)). Désigne le wing low côté ballon. Diagnostics : `baseline-drive-open/soft/late/closed`.
- **2.e `ballPressureCoverer`** : LE défenseur structurellement responsable de presser le porteur. Front-row si ballon haut, back-row si bas. Préfère le défenseur du même côté que le ballon. Boost ×2.5 (à factor=1) + bias home + seuil engagement abaissé.

### Étape 3 — Réflexes basket universels

- **3.a `rimProtectorByThreat` ("pas d'easy basket")** : nouveau module [`threatResolution.ts`](../src/lib/logic/threatResolution.ts) avec `detectFreePathThreats`. Pour chaque attaquant à <220 px du panier sans défenseur sur la trajectoire, désigne le défenseur disponible le plus proche du panier. Slider `rimProtection` (0-100). Couvre les cas où le pivot est dragué ailleurs et personne ne ferme la peinture.
- **3.b Détection cuts hors-ballon** : `detectCuts(off, prevOff, ...)` détecte les coupes vers le panier (Δ dHoop > 25, exclut les screeners). Diagnostic `cut-backdoor`.
- **3.c Step-up préventif** : `detectFreePathThreats` étendu pour détecter les drives en cours (220-280 px avec mouvement vers panier). Permet le step-up AVANT que l'attaquant arrive sur le panier.
- **3.d Diagnostic matchup orphan** : `detectMatchupOrphans` signale les défenseurs en aide loin de leur home dont le matchup naturel n'est plus couvert.

### Étape 4 — Recover et axe central

- **4.a Weakside paint sag** : `ballSideShifted` étendu — les défenseurs côté faible glissent **vers l'axe central** (x=300, ×0.8) ET vers le panier en Y (×0.4). Engagement réduit ×0.5 si le défenseur ET son matchup sont tous deux weakside (reste en aide raquette plutôt que coller son homme à 5 m du ballon). Effet mesuré : D4 passe de 121 px de l'axe central à 98 px.
- **4.b Recover boost** : un défenseur sans rôle d'aide actif reçoit ×1.15 sur sa claim au matchup naturel. Pull-back actif après aide.
- **4.c Couche `applyRimProtectionLayer` en man defense** : nouvelle couche 1.5 du pipeline man-to-man (engine.ts) qui applique le rim protection aux positions calculées par baseTargets. Filet de sécurité pour les edge cases (défenseur perdu via écran, switch).

### Étape 5 — Pass denial

- **`detectOpenPassThreats`** ([threatResolution.ts](../src/lib/logic/threatResolution.ts)) : pour chaque attaquant non-porteur, vérifie si segment carrier→att libre (perpDist >60px). Désigne le défenseur **naturel** (baseMatchups) si disponible, sinon le plus proche de l'intercept (sous 220px).
- Slider `passDenial` (0-100, défaut 50) dans DefensePanel.
- Boost claim ×(1+2×urgency×factor) sur le receveur + bias home (×0.5 × urgency × factor) vers point d'interception.
- Skipé pour les receveurs déjà couverts par d'autres désignations (high-post, rim) — évite les conflits du type "le pivot fait un skip pass perimetric".

### Étape 6 — Décomposition des téléports (A + D)

Bug rapporté : sur certaines actions FIBA (Rip-DHO, back-screens), les générateurs émettent un step avec un saut > 5 m pour un joueur (téléportation), déclenchant le warning `attacker-jump`.

**Solution** : nouveau module [`breakUpTeleports.ts`](../src/lib/logic/breakUpTeleports.ts) appliqué à la sortie de `compileScenario`. Si un joueur bouge de plus de 100 px (~2.7 m) entre deux steps, on insère des steps intermédiaires interpolés linéairement.

- Nouveau champ `Step.isInterpolated: boolean` marque les steps phantômes
- Annotations + label restent sur le step terminal
- `ballCarrier`, `defensiveDirectives`, `assignmentOverrides` propagés sur les intermédiaires (pour préserver les couvertures scriptées pendant le mouvement)
- UI : `OffensePanel` masque les interpolés de la liste utilisateur ; `Timeline` les affiche en gris/petit avec tooltip "(transition)"
- `compileScenario` skip les interpolés lors du matching `manualOverride` (subIndex compté uniquement sur les steps réels)

Effet sur Rip-DHO : 4 steps → 7 steps (3 interpolés), aucun mouvement > 110 px.

### Étape 7 — Branches manuelles de scénario

Pour présenter des **playbooks à choix multiples** ("si drop → pull-up", "si switch → mismatch") :

- Nouveau type `ScenarioBranch` avec `divergeAfterActionId` + `actions` alternatives ([types/index.ts](../src/lib/types/index.ts))
- `compileScenario` reçoit `activeBranch?` : compile main jusqu'à divergence puis branche
- Handlers `useAppState` branch-aware : quand une branche est active, les actions ajoutées/éditées vont dans `branch.actions`
- UI [`ScenarioPanel`](../src/components/ScenarioPanel.tsx) : tabs en haut, bouton "+ variante" sur chaque action, double-clic pour renommer
- UI [`PlaybookView`](../src/components/PlaybookView.tsx) : toggle "variantes" qui ajoute une section par branche dans le PDF

V1 = un seul niveau (pas de sous-branches imbriquées). Pour V2 (split view, branches auto réactives), voir [docs/ideas.md](./ideas.md).

### Tests
- **406 tests verts** au total après les Étapes 2-7 (vs 348 avant, +58 tests).
- Nouveaux fichiers : `threatResolution.test.ts`, `rimProtectionLayer.test.ts`, `baselineDrive.test.ts`.
- Sections enrichies dans `zoneDefense.test.ts` (P3.b high-post isolé, P3.c baseline, P3.d ball-pressure, P3.e rim protection, P3.f weakside paint sag + recover).

### Limites résiduelles connues
- **Recover after help engine-level** : les défenseurs en transit après aide sont limités par `speedConstraint`. Le boost recover (4.b) et le diagnostic (3.d) atténuent mais ne corrigent pas un défenseur qui doit physiquement traverser le terrain.
- **Pas de "rotation cascade" 5-stages** : quand un défenseur sort, ses voisins comblent partiellement (via `ballSideShifted`) mais pas via une vraie chaîne dynamique D2 sort → D5 glisse → D4 fill.

---

## 🆕 Travail récent — branche `simon/flamboyant-hodgkin-3a101f`

Lot de corrections et d'améliorations livrées dans cette branche (cf. [CHANGELOG.md > Unreleased](../CHANGELOG.md)) :

### Vision et orientation
- **Regard auto distance-based** ([vision.ts](../src/lib/logic/vision.ts)) : en stance `sag`/`behind`/défaut sans `gazeLock`, la cible primaire bascule selon la distance (`PROXIMITY_GAZE_RATIO = 0.65`). Si l'homme est nettement plus proche que le ballon il devient primary, sinon le ballon reste primary. Le secondary reste visible si le cône 120° le permet, le clamp ±60° est préservé. Voir [orientation-anti-teleport.md](./orientation-anti-teleport.md#regard-auto-distance-based-proximity_gaze_ratio).

### Trajectoires et lecture
- **Tracé du dribble en wave Q-Bezier lisse** ([dribbleWave.ts](../src/lib/logic/dribbleWave.ts)) : remplace l'ancienne polyligne en dents de scie par une chaîne de courbes quadratiques Bezier avec jonctions C1 sur l'axe. `sampleDribbleWave` partage la géométrie pour que le joueur reste pixel-aligné avec le tracé.
- **Annotations en courbe via Shift+drag freehand** ([polyline.ts](../src/lib/logic/polyline.ts)) : `Annotation.waypoints?: Point[]` permet des trajectoires V-cut, L-cut, démarquage en arc, dribble curviligne. Spline Catmull-Rom (τ=0.5, équivalent Bezier cubique exact en rendu), reparamétrage en longueur d'arc pour vitesse perçue constante, simplification Douglas-Peucker du buffer freehand. Voir [data-model.md > Trajectoire courbe](./data-model.md#trajectoire-courbe-polyline--catmull-rom).
- **Tous les défenseurs suivent leurs attaquants en temps réel** ([engine.ts:followDefendersAtFrame](../src/lib/logic/engine.ts)) : carrier defender + off-ball recalculés à chaque frame depuis la position courante de leur attaquant marqué (`carrierDefenderTarget` / `offBallStanceTarget` / `manTarget`). Skip si placement manuel via `defenseOverrides`. Voir [logique-defensive.md > Suivi temps-réel](./logique-defensive.md#suivi-temps-réel-des-défenseurs-en-lecture-followdefendersatframe).

### Défense
- **`hedge` complet** ([screens.ts](../src/lib/logic/screens.ts)) : avant, seul `screenerDef` (D5) sortait en show. Désormais `carrierDef` (D1) passe **over the top** de l'écran avec un décalage latéral 8–16 px tight sur le porteur — le couple D1/D5 ferme à la fois la pénétration et la rejection.

### UX playback
- **⏸ fige l'instant courant** au lieu de retomber sur la frame statique : `playbackT` propagé dans `scrubT` ([page.tsx](../src/app/page.tsx)).
- **▶ après pause reprend depuis l'instant pause** via la prop `playbackStartT` sur CourtView qui décale `playStart` en arrière. ⏹ reste distinct (reset à 0).

### Tests
- 14 nouveaux tests dans [polyline.test.ts](../src/lib/logic/__tests__/polyline.test.ts) : sample, path, simplify, V-cut.
- 1 test ajouté dans [screens.test.ts](../src/lib/logic/__tests__/screens.test.ts) pour le mouvement de D1 en hedge.
- Tests `dribbleWave.test.ts` mis à jour pour la wave Q-Bezier.
- Suite totale : **302 tests verts**.

---

## ✅ Fait (livré sur `main`)

### Engine & moteur
- **Défense individuelle** complète (man-to-man, help, denial, ICE, lateral steps).
- **Défense de zone** : 2-3, 3-2, 1-3-1, 2-1-2, match-up — paramétrables (pression, rotation, vertical offset, trap coin, extension 3pts).
- **Mode édition zones** : override par défenseur, presets, reset.
- **Pipeline de simulation** Monte Carlo (best action, threats, pass lanes).
- **Coach diagnostics** : couverture propre / fuites / aide en place / corners tenus.
- **Anti-téléport** : interpolation continue des positions inter-steps.

### Mode scénario (Phase 1+2)
- **Tier 1 offensives** : pick-and-roll, pick-and-pop, hand-off (DHO), back-screen, away-screen, flare, pin-down, cross-screen, hammer, drive, cut, pass, screen, shot. Empilables → génération auto de `Step[]`.
- **Sélecteur d'action** en modale popup avec filtre texte (`AddActionModal`).
- **Carte d'action compact/expand** dans `ScenarioPanel`.
- **Réordonnement** monter/descendre, suppression, libellé libre par action.

### Phase 3 — défense scriptable (MVP)
- `ScriptedAction` est une **union discriminée** (`kind: 'offensive' | 'defensive'`).
- **4 actions défensives MVP** : `help-and-recover`, `pre-switch`, `trap`, `tag`.
- Modules : `applyDirective.ts`, `defensiveCompilation.ts`, `defensiveDefaults.ts`, `defensiveActionsCatalog.ts`.
- **Couvertures couplées** (attachées à une action offensive via `parentActionId`) avec defaults inférés du contexte.
- **Actions défensives libres** (`affectedSteps` explicite) avec section dédiée dans `ScenarioPanel`.
- **Toggle global** `defenseScriptedDirectivesEnabled` (default true) dans `DefensePanel`.
- Tests d'intégration : `applyDirective.test.ts`, `defenseScriptedIntegration.test.ts`, `defensiveCompilation.test.ts`, `defensiveDefaults.test.ts`, `defensiveActionsCatalog.test.ts`.

### UI
- Layout 3 colonnes responsive avec `presentMode` (plein écran) — Échap pour quitter.
- **`FloatingActionsMenu`** : bouton `⋯` flottant en haut à droite du terrain → menu avec 5 actions globales (plein écran, playbook PDF, exporter/importer JSON, reset). Reste visible en plein écran.
- **Scroll vertical indépendant** sur les colonnes latérales (overflow-y auto).
- Bibliothèque de systèmes : 7 templates classiques + sauvegarde locale + import/export par dossier.
- Playbook PDF (export multi-pages avec annotations).
- Timeline (lecture, scrub, pause/play, vitesse).
- Métriques en bas : raquette, gap max, écart moy, en retard, aide, passes, meilleure action.

---

## 🚧 En cours (spec ou WIP non mergé)

### Scénario en popup plein écran
- **Spec** : [`docs/superpowers/specs/2026-05-09-scenario-editor-modal-design.md`](./superpowers/specs/2026-05-09-scenario-editor-modal-design.md) ✅
- **Plan d'implémentation** : ❌ pas écrit
- **Implémentation** : ❌ pas commencée
- **Idée** : alléger drastiquement la colonne gauche en réduisant `ScenarioPanel` à un résumé minimal (liste des libellés + bouton ouvrir) et déplacer toute l'édition (formulaires, couvertures, défense libre) dans une modale `ScenarioEditorModal`.

### Multi-format de jeu (2x2 / 3x3 / 4x4 / 5x5)
- **Mergé sur `main`** (commit `cea5111`, depuis l'ancienne branche `wip/player-count`)
- **État** : type `PlayerCount`, module `src/lib/logic/players.ts`, champ `AppState.playerCount`, toggle dans Paramètres, propagation à travers engine + 17 composants. **Type-check ✅, 234 tests ✅**.
- **Travail non terminé** : implémentation fonctionnelle de base mais manque sans doute du polissage UX/edge cases. À éprouver en usage réel et compléter au fil des bugs/manques constatés.

---

## 📋 À faire (planifié, pas démarré)

### Mode scénario — Phase 2 (Tier 2 offensives)
Cf [`fiba-actions-roadmap.md`](./fiba-actions-roadmap.md) section 1. Toutes les variantes d'écrans non couvertes par le Tier 1 :
- **Écrans porteur** : angle/slot, butt, drag, double drag, flat, ghost, hostage/Gortat, inverted, logo/side, Spain/stack, step-up, twist, wedge.
- **Écrans non-porteur** : ATO horns, chicken (Iverson + flare), elevator, floppy, hammer wing, Iverson, rip, screen-the-screener (STS), shuffle, single-double, staggered, UCLA, wide pin-down, zipper.
- **Cuts/pénétration variantes** : back-cut, basket-cut, baseline drive variantes, curl, fade, flex cut, give-and-go, L-cut, V-cut, shallow cut, slip cut, spot up.

### Phase 3 — défense scriptable (au-delà du MVP)
Cf [`fiba-actions-roadmap.md`](./fiba-actions-roadmap.md) section 2. Actions défensives à ajouter :
- **Couvertures PnR** non couvertes : drop coverage, soft hedge, switch (vrai switch défensif, pas pre-switch), ICE/blue, weak, X-out.
- **Actions de pression** : closeout, double-team (différent de trap), stunt, dig, gap.
- **Aide off-ball** : jam-cutter, lock-and-trail, rotation X (rotation triggérée par drive), shell rotation.

### Phase 4 — entrées et sets pré-formattés
Cf [`fiba-actions-roadmap.md`](./fiba-actions-roadmap.md) section 3. Génère 1 step de positionnement initial :
- Box, horns, 4-out 1-in, 5-out, 1-4 high/low, double stack, etc.

### Backlog UI / UX
- Refonte `ScenarioPanel` en popup plein écran (cf "En cours")
- **Popup timeline multi-pistes par joueur** : inspiré FastDraw — une popup affichant une timeline horizontale avec une piste par joueur (5 attaquants + 5 défenseurs), chaque piste montrant les segments de mouvement / passes / écrans avec leur durée précise. Permettrait au coach de voir d'un coup d'œil le découpage temporel de chaque joueur, qui bouge quand, et le synchronisme entre actions. À placer en plus de la timeline globale actuelle.
- Import multi-fichiers JSON (drag & drop)
- Édition inline du libellé d'étape sans cliquer (focus auto à la création)
- Annotations textuelles libres sur le terrain (cf `Annotations.tsx`)
- Mode "présentation projetée" (police plus grosse, contrastes augmentés)
- Raccourcis clavier pour ouvrir le menu flottant (cf [`keyboard-shortcuts.md`](./keyboard-shortcuts.md))

### Backlog tests / qualité
- Vérifier la couverture de `applyDirective` pour `pre-switch` avec swapWith manquant
- Tests E2E (Playwright ?) sur le flow complet : créer scénario → simuler → exporter PDF
- Configurer `eslint` correctement (actuellement `npm run lint` échoue — config manquante)
- Ajouter `.claude/` au `.gitignore` (worktrees Claude pollue le `git status`)

### Documentation
- Mettre à jour `docs/architecture.md` avec le multi-format quand `wip/player-count` sera mergée
- Documenter `applyDirective` en détail (pseudo-code par type d'action)
- Tutoriel "premier scénario" pour onboarder un nouveau coach utilisateur

---

## Conventions de mise à jour

Quand une feature passe de "en cours" à "fait", la **déplacer** dans la section ✅ avec un résumé court.
Quand une nouvelle idée émerge, l'**ajouter** à 📋 avec assez de contexte pour qu'on s'y retrouve dans 6 mois.
Mettre à jour la **date** en tête du doc à chaque modif.
