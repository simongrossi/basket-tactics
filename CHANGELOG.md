# Changelog

Toutes les évolutions notables du moteur de jeu et de l'UI.

Format inspiré de [keep-a-changelog](https://keepachangelog.com). Le projet n'est pas versionné via tags git ; les "versions" ci-dessous sont des regroupements thématiques pour faciliter le suivi.

## [Unreleased]

### Added — Pilotage défensif en masse depuis le DefensePanel
- Nouvelle section **"Appliquer à tous les défenseurs"** dans le panneau Défense (au-dessus de "Règles individuelles") qui pousse une consigne sur **tous les défenseurs en un clic**. Évite les 5 clics-droits successifs pour aligner toute l'équipe sur un schéma.
- Réglages exposés en masse : `helpPct`, `priority`, `vsCarrier`, `offBallStance`, `screenNav`, `helpMode` (auto/agressif/passif/désactivé), `gazeLock` (auto/mon homme/porteur/les deux), `bodyOrientationMode` (auto/ouvert/face homme/face porteur/ligne passe à plat/ligne passe perp.). Les selects ont une option "—" qui ne déclenche rien (placeholder).
- Bouton **"Réinitialiser les overrides individuels"** : efface `distance`, `maxSpeed`, `closeoutBoost`, `denyAggressiveness`, `screenNav` sur tous les défenseurs → ils retombent sur les valeurs globales (`state.defenseDistance`, etc.).
- Implémentation : nouvelles actions `updateAllRules(patch)` et `resetIndividualOverrides()` dans [`useAppState.ts`](src/hooks/useAppState.ts) (entrée d'historique unique pour le ctrl-z), props `onUpdateAllRules` / `onResetIndividualOverrides` ajoutées à [`DefensePanel.tsx`](src/components/DefensePanel.tsx).

### Added — Toggle pour masquer le bandeau "Lecture coach"
- Nouvelle option `state.showCoachDiagnostics` (default `true`) dans [Paramètres > VISU & LÉGENDE > "lecture coach"](src/components/ParametresPanel.tsx). Quand le bandeau apparaît/disparaît selon le nombre de warnings actifs, le terrain change de taille (effet de clignotement). Le toggle permet de masquer le panneau pour un layout vertical stable. Compteur "(X actifs)" mis à jour dans `ParametresLauncher`.
- Implémentation : champ `showCoachDiagnostics?: boolean` dans `AppState` ([types/index.ts](src/lib/types/index.ts)), conditionnement du rendu dans [page.tsx](src/app/page.tsx).

### Fixed — Pointes de flèches d'annotations visibles
- Le tracé `from → to` des annotations `cut`, `dribble`, `pass` se terminait au centre du joueur cible — la pointe de flèche (`markerEnd`) était masquée par le cercle joueur rendu par-dessus. Désormais le tracé est raccourci de `PLAYER_RADIUS + 4` px (helper `shrinkEnd` / `shrinkPolylineEnd` dans [`Annotations.tsx`](src/components/Annotations.tsx)) pour que la pointe s'affiche **avant** le badge — direction du mouvement claire, surtout sur les scénarios générés (Isolation, etc.) où plusieurs joueurs reçoivent une annotation `cut` simultanée.
- Markers SVG `arrow-orange` / `arrow-gray` agrandis de 6×6 à 8×8 pour une meilleure lisibilité à l'échelle terrain ([`Court.tsx`](src/components/Court.tsx)).
- Cas couverts : ligne droite (cut, pass, dribble sans waypoints), wave dribble Q-Bezier, polyline courbe Catmull-Rom (waypoints). Screen non touché (sa barre en T se positionne sur `to` réel, pas une flèche).

---

## [0.8.0] — 2026-05-10

**Cycle "lecture animée fidèle"** : trajectoires courbes (V-cut, L-cut, freehand via Shift+drag), suivi temps-réel des défenseurs sur les courbes, hedge complet, regard auto distance-based, pause/reprise depuis l'instant t, dribble en wave lisse, lecture ralentie à 2 s/étape.

### Changed — Lecture ralentie à 1× (2 s par étape au lieu de 1,5 s)
- `playbackSpeed = 1×` correspond désormais à **2000 ms par étape** (au lieu de 1500 ms). Le slider 0.3×–2× module sur cette base : de ~6,7 s à 1 s par étape. Permet de bien lire les déplacements en vitesse normale.
- Constante centralisée dans [`physics.ts > PLAYBACK_STEP_DURATION_MS`](src/lib/data/physics.ts), importée dans [`CourtView.tsx`](src/components/CourtView.tsx) (utilisée à 2 endroits : init `playStart` au démarrage du tick, et calcul de `globalT` dans la boucle).
- Implications calibration : les vitesses max par poste (`MAX_SPEED_BY_POSITION_PX`) en px/étape ne changent pas, mais la vitesse perçue en m/s diminue (ex. ailier passe de ~2,0 m/s à ~1,5 m/s à pleine vitesse). Docs [physics.md](docs/physics.md) et [GAME-ENGINE.md](docs/GAME-ENGINE.md) mises à jour.

### Fixed — Pause fige l'instant + reprise depuis la pause
- Cliquer sur ⏸ pendant la lecture **fige l'image à l'instant t courant** au lieu de retomber sur la frame statique de l'étape active (capture possible).
- Cliquer sur ▶ après une pause **reprend depuis l'instant t pause** au lieu de redémarrer du début.
- Implémentation : à la pause, `playbackT` est propagé dans `scrubT` qui pilote `scrubFrame` ([page.tsx](src/app/page.tsx)). Au play, `scrubT` est consommé comme offset via la nouvelle prop `playbackStartT` de CourtView ([CourtView.tsx](src/components/CourtView.tsx)) qui décale `playStart` en arrière de `T × stepDuration` au démarrage du tick. Stop (⏹) reste distinct et revient à l'étape 0.

### Fixed — Tous les défenseurs suivent leurs attaquants en temps réel (carrier + off-ball)
- Pendant la lecture, chaque défenseur en marquage individuel interpolait linéairement entre sa position à l'étape A et sa position à l'étape B → il prenait la **corde** d'un arc pendant que son homme faisait un V-cut, un L-cut, un démarquage en arc ou un dribble en wave. Visuellement il coupait au plus court et lâchait son homme.
- Désormais la position de **chaque défenseur** (carrier ET off-ball) est recalculée à chaque frame (playback + scrub) à partir de la position courante de son attaquant marqué :
  - Carrier defender → `carrierDefenderTarget` (vsCarrier, distance, hoop)
  - Off-ball → `offBallStanceTarget` (stance, ball) ou `manTarget` (sag/behind)
- **Placement manuel respecté** : si l'utilisateur a posé un override de position via drag (`defenseOverrides`) sur l'une des deux étapes du segment, sa position imposée prime — pas de follow, l'interpolation linéaire est conservée.
- Les flags d'état (`helpFactor`, `helpAim`, `closingOut`, `denying`) restent ceux calculés par `effectiveDefensePositions` aux étapes A/B et interpolés. Cette fonction réécrit uniquement la POSITION de marquage de base.
- Implémentation : `followDefendersAtFrame` ([engine.ts](src/lib/logic/engine.ts)), appelée dans [`CourtView.tsx`](src/components/CourtView.tsx) (playFrame + scrubFrame) avant `resolvePlayerCollisions` et `recomputeDefenseFrameOrientations`.

### Added — Annotations en courbe (Shift+drag freehand, V-cut/L-cut)
- Les annotations `cut`, `dribble` et `screen` supportent maintenant un champ optionnel `waypoints?: Point[]` ([types/index.ts](src/lib/types/index.ts)). Avec waypoints, la trajectoire suit une **spline Catmull-Rom** (tension τ=0.5, équivalent Bezier cubique exact en rendu) au lieu d'une ligne droite.
- **UX souris** : maintenir **Shift pendant le drag** d'une annotation enregistre le tracé à main levée. À la fin du drag, le buffer brut est simplifié via Douglas-Peucker (tolérance 6 px) en 3–7 waypoints propres. Drag normal sans Shift = comportement actuel inchangé (ligne droite, dribble en wave standard).
- **Cas couverts** : V-cut, L-cut, démarquage en aller-retour, courbe libre, dribble curviligne. La passe reste rectiligne par convention.
- **Lecture fluide** : `samplePolyline` ([polyline.ts](src/lib/logic/polyline.ts)) reparamètre la spline en longueur d'arc — vitesse perçue ~constante quel que soit la courbure, le joueur ne ralentit pas dans les virages serrés.
- **Rendu** : `polylinePath` produit un path SVG en `M ... C ...` lisse, partagé entre la preview pendant le drag (mise à jour live) et l'annotation finale. La trajectoire affichée est rigoureusement la même que celle parcourue par le joueur en lecture.
- Implémentation : [`polyline.ts`](src/lib/logic/polyline.ts), intégration dans [`playbackTrajectory.ts`](src/lib/logic/playbackTrajectory.ts) et [`Annotations.tsx`](src/components/Annotations.tsx), UX dans [`CourtView.tsx`](src/components/CourtView.tsx) (handlers `onPointerDown` / `onPointerMove` / `onPointerUp`). 14 nouveaux tests unitaires.

### Changed — `hedge` : le défenseur du porteur (D1) bouge maintenant aussi
- Historiquement, en règle d'écran `'hedge'` (valeur par défaut de `state.screenRule`), seul **le défenseur du poseur (D5)** réagissait — il sortait en _show_ vers le porteur. **Le défenseur du porteur (D1) restait à sa position de base**, ce qui donnait l'impression qu'il "ne réagissait pas" à un écran posé en lecture.
- Désormais en `'hedge'`, D1 **passe over the top** de l'écran avec un décalage latéral modéré (8 à 16 px selon la proximité de l'écran), tight sur le porteur. Le couple D1/D5 ferme à la fois la pénétration et la rejection, et D1 peut recover quand D5 rentre.
- Implémentation : nouveau cas `rule === 'hedge' && isCarrierDef` dans [`applyScreenAdjustment`](src/lib/logic/screens.ts) ([screens.ts:215-229](src/lib/logic/screens.ts:215-229)).
- Pour forcer la détection d'écran indépendamment de la géométrie : utiliser **« forcer comme poseur d'écran »** dans le clic-droit attaquant ([ContextMenu.tsx:758](src/components/ContextMenu.tsx:758)) — pose `cur.forcedScreener` qui saute les checks de proximité dans `detectScreen`.

### Changed — Regard auto plus dynamique en off-ball
- En stance `sag` / `behind` / défaut (sans `gazeLock` explicite), la cible primaire du regard bascule désormais selon la **distance** : si l'homme marqué est plus proche du défenseur que le ballon (ratio < 0.65), il devient la menace immédiate à fixer ; sinon le ballon reste primary. Le secondary reste visible si le cône 120° le permet et le clamp anatomique ±60° est préservé. Rend visibles entre étapes les transitions de regard quand l'attaquant marqué se rapproche/s'éloigne. Implémentation : [`vision.ts`](src/lib/logic/vision.ts).

### Fixed — Tracé du dribble en wave lisse (plus de zigzag)
- Le path SVG du dribble était une polyligne `L` chainée à ±5 px de l'axe → effet "dents de scie". Remplacé par une chaîne de courbes quadratiques Bezier (`Q`) avec jonctions C1 sur l'axe : courbe lisse, amplitude visuelle équivalente. [`sampleDribbleWave`](src/lib/logic/dribbleWave.ts) suit la même géométrie pour que la position du joueur reste alignée pixel-près avec le tracé rendu.

### Added — Actions jouées en lecture (annotations pilotent la trajectoire)
- Les annotations `dribble` / `cut` / `screen` dessinées sur une étape **pilotent réellement le mouvement** des joueurs en lecture, plus juste un schéma décoratif. Spec : [docs/superpowers/specs/2026-05-09-actions-jouees-en-lecture-design.md](docs/superpowers/specs/2026-05-09-actions-jouees-en-lecture-design.md), plan d'implémentation : [docs/superpowers/plans/2026-05-09-actions-jouees-en-lecture.md](docs/superpowers/plans/2026-05-09-actions-jouees-en-lecture.md).
- **Drag = annotation implicite** : déplacer un attaquant entre étapes auto-crée l'annotation correspondante (`dribble` si porteur, sinon `cut`). Plus de drag "neutre" qui ne raconte rien.
- **Dribble** : le porteur suit la **wave ondulée** dessinée pendant le segment, plus une ligne droite. Échantillonnage via [`sampleDribbleWave`](src/lib/logic/dribbleWave.ts) qui partage la même géométrie que le tracé SVG (le joueur est exactement sur la ligne rendue à chaque instant `t`).
- **Écran** : le poseur **arrive au point d'écran à mi-segment** (vitesse double sur la première moitié), puis **tient sa position en posture d'écran** avec le **regard pointé vers le défenseur du porteur** — flag `isScreening` propagé via [`attackerTrajectoryAt`](src/lib/logic/playbackTrajectory.ts) puis override de `gazeOrientation` côté [`CourtView.tsx`](src/components/CourtView.tsx).
- **Invariante** : exactement une annotation de mouvement (`cut|dribble|screen`) par attaquant qui bouge entre N et N+1. `pass` reste non-mouvement et peut coexister avec un mouvement.
- **Migration legacy auto-générée** : [`ensureAnnotationsForMovement`](src/lib/logic/migrateAnnotations.ts) scanne les transitions des templates / scripted actions / localStorage et génère les annotations manquantes. Idempotente. Les écrans existants (Spain PNR, Floppy, etc.) sont migrés en `cut` faute de signal explicite — ils suivent la trajectoire mais sans hold posture-écran (à raffiner ensuite côté `compileScenario.ts`).

### Changed — API de mutation centralisée
- Nouveau module [`stepMutations.ts`](src/lib/logic/stepMutations.ts) : seul point de mutation de `Step.off` et `Step.annotations`. Expose 4 helpers purs : `setPlayerPositionAt`, `upsertMovementAnnotation`, `upsertPassAnnotation`, `removeAnnotation`. Maintiennent l'invariante par construction (sync amont/aval, snap-back en suppression, cascade sur les `from` aval).
- [`useAppState.ts`](src/hooks/useAppState.ts) : `moveAttacker`, `addAnnotation`, `clearAnnotationsFor`, `deleteLastAnnotation`, `deleteAnnotation` routent désormais via ces helpers. Plus de mutation directe de `cur.off` / `cur.annotations` dans le hook.

### Changed — Vision humaine refondée
- Factorisation de la logique de vision humaine dans [`vision.ts`](src/lib/logic/vision.ts) : clamp tête ±60°, cône 120°, priorité homme/porteur et midpoint angulaire quand les deux peuvent coexister dans le champ de vision.
- Recalcul du triangle et du champ de vision depuis la position réelle affichée pendant les frames animées (playback + scrub), après interpolation, contournement et collisions, via `recomputeDefenseFrameOrientations`.
- Orientation du corps défensive plus basket : open stance angulaire `ball-you-man` (midpoint angulaire non biaisé par la distance), `deny-3q` (65%) / `stunt` (70%) biaisés côté ballon, `fronting` face à la passe, `behind` priorise l'homme.
- Clamp anatomique passé de ±90° à ±60° pour s'aligner sur le cône FOV (cohérence vision périphérique humaine).
- Menu clic-droit défenseur **corps** (`BodyOrientationMode`) : consignes `auto`, `ouvert homme/ballon`, `face homme`, `face porteur`, `ligne passe à plat`, `ligne passe perpendiculaire`. Le slider absolu `bodyOrientation` reste prioritaire.

### Tests
- 38 nouveaux tests Vitest pour les actions jouées en lecture : `dribbleWave` (10), `stepMutations` (18), `migrateAnnotations` (6), `playbackTrajectory` (7).
- Tests étendus pour la vision humaine : `orientation.test.ts` (+143 lignes), `engine.test.ts` (+25), `invariants.test.ts` (+13).
- Suite totale : **277 tests verts**.

---

## [0.7.0] — 2026-05-09

**Cycle "pictogramme + champ de vision + overrides manuels"** : convention B asymétrique, invariants anatomiques, champ de vision en cône heatmap (3 toggles : tous / défenseurs / attaquants), sliders manuels corps + regard pour défenseurs ET attaquants, design des bras figé (Design F après comparaison de 8 candidats), Paramètres déplacés en pop-up à gauche.

Highlights :
- **Champ de vision** par joueur : cônes heatmap cyan (défenseurs) / orange (attaquants), 120° d'ouverture, jusqu'aux limites du terrain. Heatmap croisée par superposition. 3 toggles globaux + clic-droit individuel par défenseur.
- **Invariants anatomiques inviolables** : regard ∈ ±60° du corps (= demi-ouverture du cône de vision), aucun bras dans le dos, porteur statique → panier (ou direction de dribble si > 30 px).
- **Sliders manuels orientation corps + regard** dans le clic-droit, pour défenseurs ET attaquants.
- **Design des bras figé** (Design F) après comparaison de 8 variantes via `/demo-arms`.
- **UI** : panneau Paramètres déplacé à gauche en pop-up modal (style LibraryPanel).

### Changed — Pictogramme : retour aux bras stylisés FIBA STATIQUES
- [`Player.tsx`](src/components/Player.tsx) : suppression du wrapper `transform="rotate(orientation, ...)"` autour des bras. Les arcs FIBA stylisés restent **toujours au-dessus du joueur**, identiques pour tous, peu importe stance ou orientation tactique.
- La direction du **regard** reste matérialisée par le **triangle pointeur** (`facing`), avec son clamp anatomique `gaze ∈ ±60° du body` qui reste actif (impossible de regarder derrière la tête).
- La logique métier (`bodyOrientation`, `gazeOrientation`, `armBallSide`, `armManSide` calculés en convention B) reste dans le data model pour usage futur (overlay debug, slider manuel, champ de vision).

### Changed — UI : panneau Paramètres déplacé en pop-up à gauche
- Nouveau composant [`ParametresLauncher.tsx`](src/components/ParametresLauncher.tsx) — bouton compact dans la colonne gauche (sous "Actions") qui ouvre une **modal centrée** avec tout le contenu de `ParametresPanel` (VISU & LÉGENDE + INDICATEURS AUTO + bouton sens d'attaque).
- Style cohérent avec [`LibraryPanel.tsx`](src/components/LibraryPanel.tsx) (même look bouton + modal).
- Compteur "(X actifs)" sur le bouton pour donner un retour visuel rapide du nombre d'options activées.
- Modal fermable par Échap, clic extérieur, ou bouton ×.
- Le panneau Paramètres a quitté la colonne droite — celle-ci ne contient plus que le DefensePanel, libérant de la verticale pour la simulation.

### Added — Champ de vision : toggle global "tous joueurs" + heatmap croisée
- Nouveau toggle global **"champ de vision (tous)"** dans le menu Paramètres (VISU & LÉGENDE) : active le cône de vision sur **tous les joueurs** (défenseurs + attaquants) en un clic. Stocké dans `state.showFieldOfViewAll`.
- Combiné par OR logique avec les toggles individuels (clic-droit défenseur) — l'un OU l'autre suffit pour afficher un cône.
- **Heatmap croisée** : quand plusieurs cônes se superposent, l'opacité s'accumule naturellement (cyan plus dense), matérialisant les zones du terrain les mieux couvertes (vues par plusieurs défenseurs simultanément).
- `FieldOfViewOverlay.tsx` étendu pour accepter aussi attaquants (`off` + `attVisuals`) et le toggle global.

### Added — Champ de vision défenseur (cône heatmap)
- Activable individuellement par défenseur via clic-droit → checkbox **"champ de vision"** (`rule.showFieldOfView`).
- Cône cyan semi-transparent (opacité 0.18) avec contour pointillé, centré sur le `gazeOrientation` du défenseur, ouverture 120° (60° de chaque côté du regard, vision humaine focale + périphérique nette), profondeur 200 px (~5,4 m).
- Composant [`FieldOfViewOverlay.tsx`](src/components/FieldOfViewOverlay.tsx) — rendu en arrière-plan des sprites joueur pour ne pas masquer les pictogrammes.
- Indépendant du triangle pointeur (regard) : on peut activer le cône pour visualiser la zone d'attention élargie en plus du regard pointu.

### Added — Convention B : bras asymétriques + invariants anatomiques
- **2 cibles distinctes** par joueur (`armBallSide` / `armManSide`) calculées par rôle dans [`orientation.ts`](src/lib/logic/orientation.ts) :
  - Off-ball sag : un bras vers ballon, un vers homme (open stance).
  - Fronting : 2 bras dans la ligne de passe homme→ballon.
  - Deny-3q / stunt : un bras dans la ligne de passe (intercepter), un sur l'homme.
  - PnR tag/x-out/stunt : un bras vers la zone de menace, un sur l'homme original.
  - On-ball : 2 bras vers le porteur (contestation).
  - Porteur statique : 2 bras vers le panier ; **en dribble (delta prev→cur > 30 px) → 2 bras vers la direction du mouvement**.
  - Cutter : 2 bras vers la destination de coupe.
  - Screener : 2 bras vers le défenseur ciblé (corps perpendiculaire pour bloquer la trajectoire).
  - Idle : 2 bras vers le porteur (demande la passe).
- **Invariants anatomiques inviolables** :
  - Le `gaze` (regard) est CLAMPÉ à ±60° du `body` (corps) — impossible de regarder derrière sa tête.
  - Aucune cible de bras ne tombe en dehors du demi-cercle frontal du corps — impossible d'avoir un bras dans le dos.
  - Ces clamps priment sur tout calcul auto et tout override manuel.
- `ComputedDefender` et `ComputedAttacker` étendus avec `gazeOrientation`, `armBallSide`, `armManSide`.
- `Player.tsx` : nouveau rendu — 2 bras tracés depuis les épaules (perpendiculaires au regard) vers leurs cibles, avec courbure vers l'avant. Fallback sur les arcs FIBA symétriques si les cibles ne sont pas fournies.
- 9 tests neufs (197/197 verts) dont l'invariant anatomique sur les 7 playbooks de la lib (gaze ∈ ±60° du body pour tous les joueurs à toutes les étapes).
- `DefenderRule` étendu avec `bodyOrientation?` (override absolu corps 0–360°) et `gazeLock?` (`opponent` / `ball-carrier` / `both`, clampé ±60° du corps). Le slider legacy `orientation` (delta ±45°) reste supporté.

### Fixed — Pictogramme joueur : convention FIBA respectée
- [`Player.tsx`](src/components/Player.tsx) : bras stylisés **statiques** au-dessus du cercle, identiques pour attaquants et défenseurs. Suppression de la rotation `transform="rotate(orientation, ...)"` ajoutée en 0.6.0 qui faisait tourner les bras avec l'orientation calculée — convention non-FIBA, produisait des bras anatomiquement incohérents (impression de bras "dans le dos" du joueur, ou tous orientés vers le panier).
- Référence : [FIBA Europe Basketball Terminology](https://www.fiba.com/) — les pictogrammes joueur conservent toujours la même posture quelle que soit l'action ; le sens du jeu se lit via les flèches d'action (passes / courses / écrans).
- Le triangle pointeur `facing` reste affiché comme info de debug discrète (où le défenseur regarde selon stance + ballon).
- La logique métier `computeDefenderOrientation` / `computeAttackerOrientation` reste utile pour les calculs internes (lateralOffset, decisions tactiques) mais n'influence plus le rendu visuel des bras.

---

## [0.6.0] — 2026-05-09

**Cycle "fidélité basket"** : orientation calculée, anti-téléportation, rim protection sur drive, vue debug aide, refactor physics centralisé, toggles fine. 73 nouveaux tests (111 → 188), 4 nouveaux modules ([`orientation.ts`](src/lib/logic/orientation.ts), [`physics.ts`](src/lib/data/physics.ts), [`HelpDebugOverlay.tsx`](src/components/HelpDebugOverlay.tsx) + tests d'invariants), 3 nouvelles docs ([`docs/GAME-ENGINE.md`](docs/GAME-ENGINE.md), [`docs/physics.md`](docs/physics.md), [`docs/orientation-anti-teleport.md`](docs/orientation-anti-teleport.md)).

Highlights :
- **Orientation des joueurs** dérivée automatiquement de stance / ballon / homme / écran (avant : statique, manuelle).
- **Plus de téléportations** d'attaquants : interpolation avec contournement d'obstacles + diagnostic warning si saut > 4 m.
- **Rim protection** sur drive (tag and recover du big) : le pivot step-up sur la trajectoire au lieu de rester sur le post adverse.
- **`physics.ts`** : un seul module pour tuner toutes les constantes physiques (vitesses par poste, closeoutBoost, screenRadius, etc.) avec sémantique en mètres réels.
- **Vue debug aide** : flèches défenseur → cible d'aide avec pourcentage et tag de priorité, pour comprendre ce que la logique calcule.
- **8 toggles fine** dans la légende pour masquer chaque sous-visuel indépendamment.

### Added — Toggles légende fine (8 sous-visuels indépendants)
- 8 nouveaux toggles dans INDICATEURS AUTO ([`ParametresPanel.tsx`](src/components/ParametresPanel.tsx)) : `showZoneTracking`, `showContestedPass`, `showBlockedPass`, `showOffBallScreenIndicator`, `showLateRing`, `showCloseoutRing`, `showDenyingRing`, `showForcedScreenerBadge`. Default `true` — UX existante préservée.
- Combinés en ET logique avec leur master quand pertinent (`showLateRing && showStateRings`, `showForcedScreenerBadge && showLockBadges`, `showOffBallScreenIndicator && showScreenIndicators`). Permet de masquer un visuel précis sans tout couper.
- [`PassLanesOverlay.tsx`](src/components/PassLanesOverlay.tsx) accepte `showContested` / `showBlocked` pour filtrer les catégories indépendamment.
- [`Player.tsx`](src/components/Player.tsx) accepte `showLateRing`, `showCloseoutRing`, `showDenyingRing`, `showForcedScreenerBadge`.
- Avant : ces 8 visuels étaient dans une légende **non-toggleable** (juste affichage du code couleur). Maintenant chaque ligne est une checkbox active.

### Changed — Refactor : module `physics.ts` centralisateur
- Toutes les constantes physiques regroupées dans [`src/lib/data/physics.ts`](src/lib/data/physics.ts) : `MIN_PLAYER_CLEARANCE_PX`, `DEFAULT_DEFENSE_MAX_SPEED_PX`, `DEFAULT_DEFENSE_DISTANCE_PX`, `DEFAULT_CLOSEOUT_BOOST`, `DEFAULT_DENY_AGGRESSIVENESS`, `MAX_SPEED_BY_POSITION_PX`, `DEFAULT_SCREEN_RADIUS_PX`, `RIM_PROTECTION_DROP_ZONE_PX`. Helpers `metersToPx` / `pxToMeters`.
- Migration des call-sites :
  - [`engine.ts`](src/lib/logic/engine.ts) : `DEFAULT_CLOSEOUT_SPEED_FACTOR`, `0.45` (denyAggressiveness fallback), `PLAYER_RADIUS * 2 + 2` × 2.
  - [`manDefense.ts`](src/lib/logic/manDefense.ts) : `MIN_TARGET_DIST` inline.
  - [`screens.ts`](src/lib/logic/screens.ts) : `pushOutOfScreener` clearance.
  - [`help.ts`](src/lib/logic/help.ts) : drop zone `75` (rim protection).
  - [`initial.ts`](src/lib/data/initial.ts) : `defaultRules.maxSpeed` × 5, `defenseDistance`, `defenseMaxSpeed`, `screenRadius`, `closeoutBoost`, `denyAggressiveness`.
- Aucun changement de comportement : 188/188 tests verts, valeurs strictement préservées.
- Nouvelle doc [`docs/physics.md`](docs/physics.md) avec sémantique en mètres réels (PX_PER_M=37, vitesses en m/s par poste, distances en m) et guide de tuning.

### Fixed — Rim protection sur drive (étape B)
- [`help.ts`](src/lib/logic/help.ts) branche `priority='paint'` : quand `trigger.drive` est actif, l'aim devient la **drop zone** (point sur la ligne porteur→panier à 75 px du panier) plutôt que de rester collé sur un post adverse à <120 px d'un low-block. Implémente le **tag and recover** classique du pivot.
- Avant : si un attaquant campait en strong high, le pivot le suivait au lieu de fermer la trajectoire de drive — D5 ne step-up pas, le porteur arrivait sous le cercle libre.
- 4 tests TDD ([`help.test.ts`](src/lib/logic/__tests__/help.test.ts)) : helpAim sur la ligne, ≠ pivot adverse, dans la drop zone 50–150 px, et régression sans trigger drive.

### Added — Vue debug d'aide défensive
- Toggle `state.showHelpDebug` dans VISU & LÉGENDE ([`ParametresPanel.tsx`](src/components/ParametresPanel.tsx)).
- Nouveau composant [`HelpDebugOverlay.tsx`](src/components/HelpDebugOverlay.tsx) : pour chaque défenseur dont `helpFactor > 10%`, flèche pointillée du défenseur vers `helpAim` (cible idéale avant blend), avec badge `xx% · PRIORITÉ`. Couleurs distinctes pour priorité paint / man / passlane, denial strong-side, et rotations PnR (tag/x-out/stunt).
- `HelpResult` étendu avec `aim`, `priority`, `kind` ('sag-weakside' / 'denial-strongside' / 'active-help' / 'none').
- `ComputedDefender` étendu avec `helpAim`, `helpPriority`, `helpKind`. Les rotations PnR écrasent ces champs avec leur cible spécifique.

### Added — Orientation calculée des joueurs (P6)
- Module pur [`orientation.ts`](src/lib/logic/orientation.ts) avec `computeDefenderOrientation`, `computeAttackerOrientation`, `lerpAngleDeg`.
- `ComputedDefender` reçoit `orientation: number` + `facing: Point` calculés depuis stance / ballon / homme / pnrRole.
- Nouveau `computeAttackerVisuals(state, stepIdx)` qui détecte les rôles offensifs (carrier / passer / cutter / screener / idle) et produit `Record<AttackerId, { orientation, facing }>`.
- Le poseur d'écran s'oriente perpendiculairement à la ligne vers le défenseur ciblé (épaule de blocage).
- Le delta manuel `state.rules[id].orientation` est conservé comme **override clampé à ±45°** au-dessus du calcul auto.
- Bras FIBA + triangle pointeur étendus aux attaquants ([`Player.tsx`](src/components/Player.tsx)).
- Lerp angulaire dans [`CourtView.tsx`](src/components/CourtView.tsx) (plus court chemin sur le cercle).

### Added — Anti-téléportation des attaquants
- Interpolation des attaquants utilise désormais `pickBlockingCluster` + `curveAroundObstacle` (mêmes primitives que les défenseurs) pour contourner les autres joueurs entre étapes.
- Diagnostic [`coachDiagnostics.ts`](src/lib/logic/coachDiagnostics.ts) `tag: 'attacker-jump'` : warning si un attaquant parcourt > 4 m sur une étape.

### Added — Tests
- [`orientation.test.ts`](src/lib/logic/__tests__/orientation.test.ts) — 12 cas (stance × ballon × homme).
- [`invariants.test.ts`](src/lib/logic/__tests__/invariants.test.ts) — 35 cas rejouant les 7 playbooks de la lib (chevauchements, vitesse défensive bornée, sauts attaquants ≤ 5,5 m, orientations valides).
- [`zoneDefense.test.ts`](src/lib/logic/__tests__/zoneDefense.test.ts), [`zoneSituations.test.ts`](src/lib/logic/__tests__/zoneSituations.test.ts) — couverture du moteur ownership et des situations zone.

### Fixed
- **Top-lock** ([`screens.ts`](src/lib/logic/screens.ts)) : la branche `top-lock` ignorait explicitement le ballon (`void ballPos`) et plaçait le défenseur du shooter dans la direction screener→cutter au lieu de côté ballon. Signature de `applyOffBallScreenAdjustment` étendue avec `ballPos: Point`, calcul du `sideOfBall` par projection sur la perpendiculaire de l'axe d'écran.
- **Paint helper** ([`help.ts`](src/lib/logic/help.ts)) : `priority='paint'` applique maintenant un coefficient de proximité au `helpFactor` (1.0 si dist ≤ 120 px, dégradé jusqu'à 0.4 à ≥ 280 px). Avant : un coin opposé était tiré aussi fort qu'un wing strong-side.
- **Écrans fantômes** ([`screens.ts`](src/lib/logic/screens.ts)) : nouveau filtre `hasScreenIntent` qui rejette les attaquants en train de S'ÉLOIGNER du couple porteur/défenseur (mesure delta de distance entre étape précédente et courante). Bypass quand l'utilisateur a explicitement défini un `forcedScreener`.
- **`isShortCorner`** ([`zoneSituations.ts`](src/lib/logic/zoneSituations.ts)) : la v1 exigeait `dHoop < 130 ET lateral > 130` — mathématiquement impossible (sqrt(lat²+vert²) ≥ lat). La fonction ne matchait jamais → le boost critique `criticalMult = 1.4` n'était jamais appliqué sur un attaquant en short corner. Corrigé : `lateral > 130 ET vertical < 100 ET dHoop < 250`.

### Documentation
- Nouveau [`docs/orientation-anti-teleport.md`](docs/orientation-anti-teleport.md).
- Nouveau [`docs/GAME-ENGINE.md`](docs/GAME-ENGINE.md) — cartographie individuel / collectif / physique.
- Nouveau [`CHANGELOG.md`](CHANGELOG.md).
- Mises à jour [`ROADMAP.md`](ROADMAP.md), [`docs/README.md`](docs/README.md), [`docs/logique-defensive.md`](docs/logique-defensive.md), [`docs/testing.md`](docs/testing.md).

---

## [0.5.0] — 2026-05-08

### Added — P0–P5 enrichissement basket
- **P0** Détection PnR enrichie : `roll`, `pop`, `slip`, `short-roll`, `ghost`, `reject`, `snake`, `re-screen` (`screenAction.ts`).
- **P1** Rotations PnR automatiques : low-man tag du roller, X-out sur l'orphelin, nail stunt depuis le high post (`pnrRotations.ts`).
- **P2** Couvertures PnR explicites : `ice` (force baseline), `weak` (under léger), `peel-switch` (drop puis switch déclenché par `peelSwitchShouldFire`).
- **P3** Comportement zone réaliste : overload détection, `isShortCorner` et `isHighPost` boost le claim, skip pass diagnostiqué (`zoneSituations.ts`).
- **P4** Écrans non-porteur enrichis : top-lock, chase, et reconnaissance d'enchaînements stagger / elevator / hammer / flex (`upgradeOffBallScreens` dans `screens.ts`).
- **P5** Lectures offensives auto : map couverture défense → opportunité offensive en vocabulaire coach (`tacticalReads.ts`).

### Added — Bibliothèque v2
- Dossiers personnels, sauvegarde locale (localStorage), export / import JSON par dossier.
- Modal centrée pour la bibliothèque, intégrée dans le panneau gauche.

---

## [0.4.0] — 2026-05-08

### Added — Refonte zone + physique + profils
- **Moteur ownership zone continu** : claims gaussiens × `naturalBonus` × `carrierBonus`, normalisation en parts par attaquant, primary = part max, blend `homePos` ↔ `trackedPos` proportionnel à l'engagement. Élimine les sauts de priorité aux frontières des polygones (`zoneDefense.ts`).
- **Physique 3 leviers** : longueur d'arc `pathArcLength` (le défenseur "paie" un détour Bezier autour d'un cluster), `proximityFriction` (vitesse réduite quand le trajet frôle un joueur non-matché), `pre-relaxation` (cible repoussée hors d'un attaquant non-matché avant l'application de `maxSpeed`).
- **Profils offensifs** (`OffensiveProfile`) : `creator`, `shooter`, `slasher`, `rim-roller`, `stretch-big`, `non-shooter`. Modulent shotQuality dans `threats.ts`, le coût de quitter dans `help.ts` (`leaveAttackerCostMultiplier`), et le bump closeout (`closeoutProfileBonus`).
- **Diagnostics coach** (`coachDiagnostics.ts`) : closeout long, low-man tag manquant, mismatch après switch, corner abandonné, gap périmètre, helper triggé... vocabulaire métier.
- **Profils défensifs** : 10 rôles applicables par défenseur (stopper, helper, denier, drop-big...) qui pré-règlent la rule via merge superficiel.

---

## [0.3.0] — 2026-05-07

### Added — Simulation tactique
- **Phase A** — score de menace par attaquant (`threats.ts`) : `shotQuality × receivability` avec 5 zones de tir, modulation contestée / ouverte, profils.
- **Phase B** — évaluation des options offensives (`offense.ts`) : tir, drive, passe + tir (un par coéquipier). Flèche "meilleure action" sur le porteur.
- **Phase C** — Monte Carlo de possessions (`simulator.ts`) : PPP, eFG%, distribution des outcomes. Reproductibilité avec RNG seedé (mulberry32).

---

## [0.2.0] — 2026-05-07

### Added
- **Vitesses max individuelles** par défenseur (`rule.maxSpeed`) — réduit la téléportation sur aides longues. Default selon le poste : meneur 145, arrière 130, ailier 110, ailier fort 90, pivot 75.
- **Distance per-défenseur** dans le menu clic-droit (`rule.distance` override `state.defenseDistance`).
- **`helpMode` per-défenseur** : `auto` / `aggressive` / `passive` / `disabled`.
- **`closeoutBoost` et `denyAggressiveness`** override individuels.
- **Mode édition de zones** : drag des sommets de polygone, drag du homePos, comportements par région (`auto` / `agressif` / `passif` / `trap`).
- **Préférence matchup naturel** en zone (`naturalBonus = 1.2` sur D3↔O3 etc).
- **Orientation manuelle du défenseur** en degrés (rotation du corps + 2 bras FIBA), un seul curseur ±90°. → étendu en P6 (cf. Unreleased).
- **Stance off-ball influence position** (`sag` / `deny-3q` / `fronting` / `behind` / `stunt`).
- **Main dominante** par attaquant (`attackerHands`) — informatif pour le coach.

### Changed
- Timeline regroupée sur une ligne unique (play / stop / scrub / vitesse).
- Restructure 4 panneaux : Actions + Attaque (gauche) / Défense + Paramètres (droite).
- Mode plein écran + visualisation 2-col ouverte par défaut.

### Fixed
- Téléportation D3 sur ballon en zone — corrigée par le tracking continu basé homePos.
- Hydration `<style>` Next.js — bornage strict de la colonne centrale par grid.
- Overflow vertical du panneau défense — pack des triggers + visualisation fermée par défaut.

---

## [0.1.0] — 2026-05-06

### Added — Premier jet
- Simulateur tactique basket en Next.js client-only.
- 5 attaquants + 5 défenseurs sur demi-terrain SVG, drag & drop.
- 4 conventions de tracé : passe (pointillés), dribble (zig-zag), course (ligne pleine), écran (T).
- Construction d'un système en étapes (keyframes), scrubber timeline, lecture animée.
- Bibliothèque de 7 systèmes : PNR central, Horns flare, Pindown coin, Spain PNR, UCLA cut, Floppy, Hammer.
- Défense individuelle (homme à homme) avec règles d'écran : over / under / switch / hedge / drop / blitz.
- Défense de zone : 4 layouts (2-3, 1-3-1, 3-2, match-up).
- Métriques temps réel : couverture raquette, gap max, écart moyen, défenseurs en retard, intensité d'aide.
- Lignes de passe colorées (ouverte / contestée / bloquée).
- Indicateurs visuels : cercle violet sur le poseur d'écran, bras FIBA stylisés.
- Export Playbook PDF via `window.print()`.
- Persistance localStorage automatique (debounce 400 ms).
