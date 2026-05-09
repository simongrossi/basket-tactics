# Roadmap d'automatisation des actions FIBA

> Inventaire **exhaustif** des termes du PDF FIBA classés par catégorie d'automatisation. Permet de piloter les prochaines phases du mode scénario (`ScriptedAction`).
>
> Voir [`docs/fiba-terminology.md`](./fiba-terminology.md) pour les définitions complètes.
>
> **Légende des statuts** :
> - ✅ **v1.0 — Tier 1** : implémenté, dispo dans le panneau Scénario.
> - 🔜 **Tier 2** : action jouable, à coder (générateur + entrée catalogue, pas de changement archi).
> - 🟦 **Tier 3 — entrées** : alignement / set play (génère 1 step de positionnement initial).
> - 🛡️ **Défensif** : phase défensive scriptable (cf. section dédiée — extension archi). Peut être combiné avec ✅ si l'action est implémentée en Phase 3 MVP.
> - 📐 **Géométrique pur** : zone du terrain / formation / posture — pas une action mais un référentiel.
> - 📊 **Stat / arbitrage** : non-jouable (faute, violation, statistique, règle).
> - 🎬 **Composé** : combinaison d'actions Tier 1 — pas besoin de générateur dédié, on l'écrit comme une séquence.
> - 🎯 **Finition** : geste de tir, paramètre de l'action `shoot` (ne nécessite pas de générateur).

---

## Sommaire

1. [Actions offensives jouables (✅ + 🔜)](#1-actions-offensives-jouables)
2. [Phases défensives à scripter (🛡️)](#2-phases-défensives-à-scripter)
3. [Entrées et sets pré-formattés (🟦)](#3-entrées-et-sets-pré-formattés)
4. [Finitions / gestes de tir (🎯)](#4-finitions--gestes-de-tir)
5. [Géométrie / formations / postures (📐)](#5-géométrie--formations--postures)
6. [Stats / arbitrage (📊 — hors-scope)](#6-stats--arbitrage-hors-scope)
7. [Plan d'implémentation suggéré](#7-plan-dimplémentation-suggéré)

---

## 1. Actions offensives jouables

### 1.1 Écrans sur porteur (on-ball screens)

| Statut | Action FIBA | Notes d'implémentation |
|---|---|---|
| ✅ | **Pick-and-roll** | Tier 1 — 3 steps. |
| ✅ | **Pick-and-pop** | Tier 1 — 3 steps, screener pop 3pts. |
| ✅ | **Hand-off (DHO)** | Tier 1 — 2 steps, dribble + remise. |
| 🔜 | **Angle / Slot ball screen** | Variante PnR avec porteur côté slot (45°) — réutilise PnR + paramètre angle. |
| 🔜 | **Butt screen** | PnR avec dos screener vers porteur (proche top of key). |
| 🔜 | **Drag screen** | PnR en transition, porteur dribble vers axe. |
| 🔜 | **Double drag** | 2 screens drag décalés. Compose 2× drag screen. |
| 🔜 | **Flat ball screen** | PnR avec écran parallèle ligne de fond. |
| 🔜 | **Ghost screen** | PnR fictif : screener simule puis coupe. Décodable comme PnR + slip. |
| 🔜 | **Hostage / Gortat ball screen** | PnR vs drop : screener pose 2e écran sur son défenseur. |
| 🔜 | **Inverted ball screen** | PnR posé par arrière pour grand. Réutilise PnR avec inversion des rôles. |
| 🔜 | **Logo / Side ball screen** | Variantes de PnR par position du porteur (logo / aile). |
| 🔜 | **Spain / Stack ball screen** | PnR + back-screen sur le rolling defender. Composition pick-and-roll → back-screen. |
| 🔜 | **Step-up screen** | PnR vs ICE (porteur va baseline). |
| 🔜 | **High / Top ball screen** | PnR avec porteur top of key. |
| 🔜 | **Touch ball screen** | PnR avec contact léger + roll (variante de pick-and-roll). |
| 🔜 | **Wedge ball screen** | Meneur pose un faux écran sur grand puis monte poser le PnR. |
| 🔜 | **Single tag action** | PnR avec un seul attaquant côté ballon. |
| 🔜 | **Double tag action** | PnR avec 2 joueurs côté roll. |
| 🔜 | **Twist action** | 2 PnR successifs en directions opposées. Composition. |
| 🔜 | **Flipping the screen** | Le screener change l'angle au dernier moment. Param `lateAngleFlip`. |
| 🔜 | **Deep roll** | Variante PnR avec roller qui plonge profond. Param `rollDepth=deep`. |
| 🔜 | **Short roll** | Variante PnR avec roller qui s'arrête au coude. Param `rollDepth=short`. |
| 🔜 | **Reject** | Le porteur attaque le côté opposé de l'écran. Param `useScreen=false`. |
| 🔜 | **Splitting the screen** | Porteur s'engage entre screener et hedger. Param `splitOnHedge=true`. |
| 🔜 | **Slip** | Screener coupe avant contact. Param `slip=true` sur PnR. |
| 🔜 | **Snake / Re-screen** | Variantes de PnR avec ré-engagement. |
| 🔜 | **Hostage dribble / Freeze dribble** | États de dribble du porteur après écran. Posture, pas action séparée. |

### 1.2 Écrans non-porteur (off-ball screens)

| Statut | Action FIBA | Notes d'implémentation |
|---|---|---|
| ✅ | **Pin-down (down screen)** | Tier 1 — 2 steps. |
| ✅ | **Flare screen** | Tier 1 — 2 steps. |
| ✅ | **Back screen / Rip screen / Blindside** | Tier 1 — 2 steps. |
| ✅ | **Cross screen** | Tier 1 — 2 steps. |
| ✅ | **Screen the screener (StS)** | Tier 1 — 3 steps. |
| 🔜 | **Blade screen** | Cut camouflé en écran (sans contact). Variante de brush. |
| 🔜 | **Brush screen / Brush cut** | Cut qui crée un écran "naturel" sans contact établi. |
| 🔜 | **Containing / Hostage off-ball screen** | Écran défensif pour contenir un défenseur côté faible. |
| 🔜 | **Double / Parallel screen** | 2 screeners côte à côte. Composition de 2 pin-down simultanés. |
| 🔜 | **Elevator / Gate screen** | 2 screeners qui se referment derrière le cutter. Action à 3 joueurs. |
| 🔜 | **Hammer screen** | Écran côté faible pendant drive baseline. À synchroniser avec un drive. |
| 🔜 | **RAM screen** | Pré-écran sur le futur screener avant le PnR. Composition off-ball + on-ball. |
| 🔜 | **Ricky screen** | Back-screen + down-screen pour le même cutter. Composition. |
| 🔜 | **Shot screen** | Écran côté faible pour libérer un tireur. Variante de flare ou pin-down. |
| 🔜 | **Staggered screen** | 2 écrans non adjacents pour le même cutter. |
| 🔜 | **Twirl screen** | Cutter enroule 1er screener, 1er screener utilise 2e écran. |
| 🔜 | **UCLA / Up screen** | Écran montant du poste bas vers le top. |
| 🔜 | **Veer screen** | On-ball screen + off-ball pin-down enchaînés. |
| 🔜 | **Wide screen** | Cross-screen haut, loin du panier. |
| 🔜 | **Wiper screen** | Flare puis pin-down (ou inverse) avec mêmes joueurs. |
| 🔜 | **Screen away** | Passer dans une direction, écran posé dans l'autre. |
| 🔜 | **Screen your own** | Joueur pose un écran sur son propre défenseur (anti-switch). |
| 🔜 | **Sealing the defender** | Pivot inverse du screener pour scellé son défenseur. Posture, pas action. |

### 1.3 Coupes (cuts)

| Statut | Action FIBA | Notes |
|---|---|---|
| ✅ | **Basket cut** | Tier 1. |
| ✅ | **Backdoor cut / Back cut** | Tier 1. |
| ✅ | **Flare cut / Fade cut** | Tier 1. |
| ✅ | **Curl cut** | Tier 1. |
| ✅ | **Shuffle cut** | Tier 1. |
| 🔜 | **Banana cut** | Coupe en arc, paramètre de courbure de basket-cut. |
| 🔜 | **Flash cut** | Bas du poste → haut du poste / nail. Cut court. |
| 🔜 | **Flex cut** | Coin côté faible → bas côté fort via écran. Composition cut + cross-screen. |
| 🔜 | **I-cut** | Inverse de backdoor : périphérie → panier → ressort. |
| 🔜 | **Iverson cut** | Coupe horizontale entre 2 écrans haut poste. À 3 joueurs. |
| 🔜 | **Popout cut** | Cut autour d'un écran direct vers le ballon. |
| 🔜 | **Shallow cut** | Top of key → coin côté fort. |
| 🔜 | **UCLA cut** | Top of key → bas du poste via écran haut poste. |
| 🔜 | **V-cut / L-cut** | Aile↔poste pour se démarquer. Cut court avec changement de direction. |
| 🔜 | **Rim runner** | Pivot qui sprinte panier→panier en transition. Cut transition. |

### 1.4 Actions de porteur (dribble / handle)

| Statut | Action FIBA | Notes |
|---|---|---|
| ✅ | **Drive** | Tier 1 — 1 step, paramètre direction. |
| ✅ | **Pass** | Tier 1. |
| ✅ | **Kick-out** | Tier 1 (alias pass après drive). |
| ✅ | **Isolation** | Tier 1 — les autres s'écartent. |
| 🔜 | **Coast to coast** | Drive backcourt → frontcourt en mode fullCourt. |
| 🔜 | **Barkley move** | Périphérie → poste bas en dribble. |
| 🔜 | **Crossover / Behind-the-back / Between-the-legs / Spin / Inside-out** | Gestes de dribble — paramètres de `drive`. |
| 🔜 | **Hesitation / Stop-and-go dribble** | Variante de drive avec arrêt-relance. |
| 🔜 | **Stop and pop** | Drive court → tir. Composition drive → shoot. |
| 🔜 | **Jab step / Jab-and-cross** | Feinte avant drive. Préface de drive. |
| 🔜 | **Rip through** | Pré-action après catch. Posture pas mouvement. |
| 🔜 | **Triple threat position** | Posture, pas action. |
| 🔜 | **Pivot / Drop step** | Posture, pas action. |
| 🔜 | **Post-up** | Joueur dos panier reçoit la balle. À ajouter — 1 step de positionnement. |
| 🔜 | **Post moves** | Up&under, drop step → mouvements de finition (cf. section 4). |

### 1.5 Combinaisons / sets multi-joueurs

| Statut | Action FIBA | Notes |
|---|---|---|
| ✅ | **Give-and-go** | Tier 1. |
| ✅ | **Screen the screener (StS)** | Tier 1. |
| 🔜 | **Alley-oop action** | Passe haute → cutter saut+dunk. Composition pass → cut + finish=alley-oop. |
| 🔜 | **Blind pig action** | Pivot reçoit, 3e joueur coupe backdoor. Action à 3 joueurs. |
| 🔜 | **Rip DHO** | Back-screen + DHO en chaîne. Composition. |
| 🔜 | **Zoom action** | Pin-down + DHO. Composition. |
| 🔜 | **Slide action** | Cut dunker spot opposé + roll. Action à 2 joueurs. |
| 🔜 | **Split action (Straight / Reverse)** | Passe poste bas + écran. Composition. |
| 🔜 | **Shake action** | Joueur du coin remonte vers PnR ballon. |
| 🔜 | **Weak side action** | Cuts/écrans côté faible pendant post-up côté fort. |
| 🔜 | **High-Low action** | Pivot bas reçoit du haut poste. Composition pass. |
| 🔜 | **Diamond offense** | Action depuis formation en losange. Set play. |
| 🔜 | **Floppy action** | Action de set : meneur top, arrière baseline, écrans des grands. Set play. |
| 🔜 | **Pinch post** | Grand au coude côté faible + handoff/cut. Action à 2-3 joueurs. |
| 🔜 | **Pistol offense** | Set d'entrée à 5 joueurs avec PnR/DHO entre arrières. |
| 🔜 | **Quick hitter** | Action rapide création de tir ouvert. Catégorie générique. |
| 🔜 | **Set play** | Séquence définie. Catégorie générique (toute composition). |
| 🔜 | **Special plays** | Action ad-hoc. Hors-scope automatisation. |
| 🔜 | **Continuity offense** | Séquence répétitive. Compose plusieurs actions en boucle. |
| 🔜 | **Two-for-one** | 2 actions rapides en fin de quart-temps. Hors-scope géométrique, c'est du tempo. |
| 🔜 | **Drift** | Replacement vers ligne de fond pendant drive. À déclencher auto pendant `drive`. |
| 🔜 | **Lift** | Replacement vers le top pendant drive. Idem drift inverse. |
| 🔜 | **Replacement** | Remplacement d'espace après cut. Auto pendant cut. |
| 🔜 | **Ball reversal** | Renversement ballon. Composition de 2-3 passes. |
| 🔜 | **Flip** | Passe + retour immédiat. Composition pass → pass. |
| 🔜 | **Boomerang pass** | Voir Flip. |
| 🔜 | **Extra pass** | Passe supplémentaire après rotation. Composition pass → pass. |
| 🔜 | **Dishing** | Passe à un joueur démarqué après pénétration. Alias de kick-out. |
| 🔜 | **Clear-out play** | Vider une zone pour 1c1. Auto-déduit de `isolation` (déjà fait). |

---

## 2. Phases défensives à scripter

> **Extension archi** : aujourd'hui, la défense est calculée par le moteur (`/lib/logic/engine.ts`) à partir des règles `DefenderRules`. Pour scripter ces phases, on étendrait `ScriptedAction` avec une variante `DefensiveAction` (ou un champ `defensive: true`) qui pose des **directives temporaires** par step (ex : "D2 et D3 trappent le porteur ce step", "D1 closeout O3 ce step"). Le moteur consommerait ces directives en complément des règles globales.

### 2.1 Couvertures sur écran porteur (déjà partiellement supporté via `ScreenRule`)

| Statut | Phase FIBA | Notes |
|---|---|---|
| 🛡️ | **Over** | Déjà dans `ScreenRule`. À exposer comme action scriptable. |
| 🛡️ | **Under** | Déjà dans `ScreenRule`. |
| 🛡️ | **Switch** | Déjà dans `ScreenRule`. |
| 🛡️ | **Hedge** | Déjà dans `ScreenRule`. |
| 🛡️ | **Drop (shallow / medium / deep)** | Déjà dans `ScreenRule` + `DropDepth`. |
| 🛡️ | **Blitz** | Déjà dans `ScreenRule`. |
| 🛡️ | **Flat hedge** | Variante de hedge. À ajouter. |
| 🛡️ | **At the level / Up to touch** | Variante de hedge agressive. À ajouter. |
| 🛡️ | **Ice / Fan / Push down** | Force le porteur baseline. Déjà dans `ScreenRule` (ice). |
| 🛡️ | **Weak (defense)** | Force la main faible. À ajouter. |
| 🛡️ | **Peel switch** | Aide passe sur porteur, défenseur initial peel. Déjà partiellement dans le moteur. |
| ✅ | **Pre-switch** | Échange anticipé avant l'écran. Phase 3 MVP : action scriptable (`assignmentOverrides`). |
| 🛡️ | **Triple switch** | Double échange pour éviter mismatch. À ajouter. |
| 🛡️ | **Steer switching** | Forcer le switch en poussant l'écran. À ajouter. |
| 🛡️ | **Blitz to switch** | Trap puis switch. Composition. |
| ✅ | **Tag** | Bump du roller par low-man. Phase 3 MVP : directive scriptable + déjà dans rotations PnR (`pnrRole='tag'`). |

### 2.2 Couvertures hors-écran

| Statut | Phase FIBA | Notes |
|---|---|---|
| ✅ | **Help and recover** | Base de la défense d'aide. Phase 3 MVP : directive scriptable (engage/release par step). |
| 🛡️ | **Closing out (full / smart)** | Sprint sur tir potentiel après passe. Déjà dans le moteur (closeout). |
| 🛡️ | **Sag / Sagging man-to-man** | Défenseur descend dans la raquette. À paramétrer. |
| 🛡️ | **Pack line defense** | Tous restent dans la pack line sauf défenseur du ballon. À ajouter comme préset. |
| 🛡️ | **Pressure man-to-man** | Pression maximale. Préset. |
| 🛡️ | **Double down** | 2e défenseur descend sur post bas. À ajouter. |
| 🛡️ | **Double-teaming** | 2 défenseurs sur même attaquant. Action ponctuelle scriptable. |
| ✅ | **Trap** | Trap en V. Phase 3 MVP : directive scriptable par step + déjà dans triggers (`trap`). |
| 🛡️ | **Stunt** | Faux help puis recovery. À ajouter comme directive temporaire. |
| 🛡️ | **Dig hard / Yo-yo** | Aide agressive vs poste bas. À ajouter. |
| 🛡️ | **Spy defense** | Pivot défensif au centre raquette. Préset. |
| 🛡️ | **Funnel the ball** | Force vers centre. Préset. |
| 🛡️ | **Shrink the floor** | Resserrer côté ballon. Préset. |
| 🛡️ | **Shift to the ball** | Glissement défensif vers ballon. Mouvement de zone. |
| 🛡️ | **Jam the cutter / Bump the cutter** | Bloquer un cutter. Action ponctuelle. |
| 🛡️ | **Jump to the ball** | Réajustement après passe. Auto. |
| 🛡️ | **Deflection** | Toucher passe sans intercepter. Stat / événement. |
| 🛡️ | **Deny / Denial defense** | Refuser réception passe. Déjà dans `denyAggressiveness`. |
| 🛡️ | **Front** | Devant attaquant. Posture. |
| 🛡️ | **Body check / Hand-check / Mirror the ball** | Postures défensives individuelles. |
| 🛡️ | **Defensive slide / Advance step / Retreat step / Swing step** | Pas de défense — geste, pas action scriptable. |
| 🛡️ | **Defensive rotation** | 3+ défenseurs qui tournent. Phase scriptable composée. |
| 🛡️ | **Help-side stance / Pistol stance / Open stance / Ready stance / Defensive stance / Denial stance** | Postures. |
| 🛡️ | **Defensive transition** | Repli défensif après TO. À scripter en mode fullCourt. |
| 🛡️ | **Box out / Block out** | Mise en position rebond. Phase de rebond. |

### 2.3 Défenses d'équipe (presets, déjà partiellement supportés)

| Statut | Phase FIBA | Notes |
|---|---|---|
| 🛡️ | **Man-to-man defense** | Default `defenseSystem='man'`. ✅ supporté. |
| 🛡️ | **Zone defense (2-3, 1-3-1, 2-1-2, 3-2, 1-1-3)** | ✅ supporté via `zoneConfig.type`. |
| 🛡️ | **Matchup zone** | À ajouter (zone hybride). |
| 🛡️ | **Combination / Junk defense** | À ajouter. |
| 🛡️ | **Box-and-one** | À ajouter (4 zone + 1 individuel). |
| 🛡️ | **Triangle-and-two** | À ajouter (3 zone + 2 individuel). |
| 🛡️ | **Diamond-and-one** | À ajouter (4 diamant + 1 individuel). |
| 🛡️ | **Full-court press / Pressing** | À ajouter (mode fullCourt). |
| 🛡️ | **Zone press defense (1-3-1, 1-2-2, 1-2-1-1, 2-2-1)** | À ajouter (presets fullCourt). |
| 🛡️ | **Diamond Press** | Variante zone press 1-2-1-1. |
| 🛡️ | **Next defense** | Run-and-jump après PnR/drive. À scripter. |
| 🛡️ | **Shell drills** | Exercices d'entraînement, pas un système de match. Hors-scope. |

---

## 3. Entrées et sets pré-formattés

> **Format** : un step de positionnement initial (les 5 attaquants placés selon l'alignement) + 1-3 steps d'action standard. À implémenter comme `ScriptedAction` de type `entry` qui réécrit `step[0].off`.

| Statut | Entrée FIBA | Description |
|---|---|---|
| 🟦 | **UCLA Cut** | UCLA cut comme entrée du set. |
| 🟦 | **Iverson Cut** | Iverson cut entry. |
| 🟦 | **Zipper Cut** | Zipper entry — alignement vertical + cut vers slot. |
| 🟦 | **Power, Diamond** | Set Power/Diamond. |
| 🟦 | **Wing Exchange** | Échange des ailes en entrée. |
| 🟦 | **Horns** | Alignement Horns (2 grands aux coudes, 1 axe, 2 corners). |
| 🟦 | **Floppy** | Alignement Floppy (meneur top, arrière baseline, 2 grands écraneurs). |
| 🟦 | **Box set** | Alignement en carré pour BOB. |
| 🟦 | **Double low stack** | 2 attaquants empilés sur un bloc. |
| 🟦 | **Pinch post** | Grand côté faible au coude. |
| 🟦 | **Pistol** | Set d'entrée Pistol (PG aile/slot, 2nd guard corner, big top). |
| 🟦 | **Diamond offense** | Alignement losange. |
| 🟦 | **Baseline out-of-bounds (BOB)** | Remise en jeu ligne de fond. À implémenter avec un point de remise (passeur hors-terrain). |
| 🟦 | **Sideline play** | Remise en jeu ligne de touche. Idem. |
| 🟦 | **Press break** | Offensive vs pressing tout-terrain. Set fullCourt. |
| 🟦 | **One-Guard offense** | Attaque vs zone 2-en-tête. Set. |
| 🟦 | **Two-guard offense** | Attaque vs zone 1-en-tête. Set. |
| 🟦 | **Man-to-man offense** | Attaque vs man. Catégorie générique. |
| 🟦 | **Zone offense** | Attaque vs zone. Catégorie générique. |
| 🟦 | **Delay offense** | Attaque pour étirer la possession. Mode tempo. |
| 🟦 | **Run and gun** | Système rapide. Mode tempo. |
| 🟦 | **ATO** | After Time Out — set spécifique. Catégorie générique. |
| 🟦 | **Fast break / Primary break / Secondary break** | Contre-attaques. Mode fullCourt. |
| 🟦 | **Filling the lanes** | Couloirs en transition. Sous-routine de fast break. |
| 🟦 | **Outlet** | Passe initiale de fast break. Sous-routine. |
| 🟦 | **Trailer** | Pivot/4 qui suit la 1ère vague. Sous-routine. |

---

## 4. Finitions / gestes de tir

> **Format** : paramètre `finishStyle` de l'action `shoot`. Pas de générateur dédié — affecte uniquement le rendu / l'animation finale.

| Statut | Geste | Notes |
|---|---|---|
| 🎯 | **Layup** | Default. |
| 🎯 | **Dunk** | Param `finishStyle='dunk'`. |
| 🎯 | **Driving layup** | Après drive. |
| 🎯 | **Reverse layup** | Layup côté opposé. |
| 🎯 | **Power move / Power layup** | Layup à 2 appuis avec contact. |
| 🎯 | **Floater / Runner / Teardrop** | Tir court flottant. |
| 🎯 | **Eurostep shot / Ginobili eurostep** | Pas latéral. |
| 🎯 | **Indiana / Rondo move** | Feinte + spin. |
| 🎯 | **Spin move shot** | Pivot inverse. |
| 🎯 | **Up & under move** | Feinte tir + lay-up. |
| 🎯 | **Hook shot / Baby hook / Jump hook** | Tir en crochet. |
| 🎯 | **Jump shot** | Saut. Param `1,2-steps` ou `parallel-stop`. |
| 🎯 | **Catch & shoot** | Réception + tir immédiat. |
| 🎯 | **Pull up shot / Step back / Side step shot** | Tir après dribble. |
| 🎯 | **Spot up shot** | Tir en attente. |
| 🎯 | **Fadeaway / Turnaround jumper** | Tir en arrière. |
| 🎯 | **Nowitzki shot** | Post-up + fadeaway. |
| 🎯 | **Bank shot** | Avec planche. |
| 🎯 | **Three-point shot** | À 3pts. |
| 🎯 | **Two-point shot** | À 2pts. |
| 🎯 | **Push shot / Stop and pop** | Tir court 2 pieds. |
| 🎯 | **Putback dunk / tip-in** | Sur rebond offensif. |
| 🎯 | **Free throw shot / Foul shot** | Lancer franc. Cas spécial. |
| 🎯 | **Alley-oop shot** | Cf. action `alley-oop`. |
| 🎯 | **Buzzer beater** | Contexte temporel, pas geste. |
| 🎯 | **Field goal** | Catégorie (2pt ou 3pt). |
| 🎯 | **Shot fake / Pump fake / Pass fake / Ball fake** | Feintes — paramètres de pré-tir. |
| 🎯 | **Shooter's roll** | Aléa (résultat), pas geste. |

### Passes (paramètre `passStyle` sur `pass` / `kick-out`)

| Statut | Passe | Notes |
|---|---|---|
| 🎯 | **Chest pass** | Default. |
| 🎯 | **Bounce pass** | Rebondie. |
| 🎯 | **Overhead pass** | Au-dessus tête. |
| 🎯 | **Skip pass** | Côté à côté. |
| 🎯 | **Outlet pass** | Démarrage contre-attaque. |
| 🎯 | **Pocket pass** | Espace étroit. |
| 🎯 | **Hook / Curl pass** | En crochet. |
| 🎯 | **Push pass** | Une main. |
| 🎯 | **Scoop pass** | Sous la main. |
| 🎯 | **Behind-the-back pass** | Derrière dos. |
| 🎯 | **Baseball pass** | Comme baseball. |
| 🎯 | **Off-the dribble pass** | Pendant dribble. |
| 🎯 | **Boomerang pass** | Aller-retour. Composition. |
| 🎯 | **Blind pig pass** | Dans le dos pour backdoor. |
| 🎯 | **Flip pass** | Remise courte. |

---

## 5. Géométrie / formations / postures

> **Hors-scope action** : ce sont des références spatiales ou des postures, pas des actions. Documentés pour cohérence.

### 5.1 Zones du terrain

Backcourt, Frontcourt, Lane / Paint, High post, Low post, Elbow, Block, Wing, Slot, Nail, Short corner / Dunker spot, Top of the key, Center circle, Three-point line / arc, Two-point area, Free throw line, Free throw line extended, Sideline, Baseline / End line, Half-court line / Midcourt line, Split line, Pack line, Restricted area, Strong side / Ball side, Help side / Weak side, Hoop / Hoop, Foul line.

### 5.2 Postures / gestes individuels (non-action)

Defensive stance, Denial stance, Help-side / Pistol stance, Open stance, Ready stance, Triple threat position, Square up / Face up, Pivot, Pivot foot, Drop step (post), Sealing the defender, Chin the ball, Mirror the ball, Hand-check, Body check, Front, Hostage dribble (état), Freeze dribble (état), Jab step (état), Rip through (geste), Jump stop, Hang time.

### 5.3 Joueurs / rôles

Point guard (1), Shooting guard (2), Forward (small forward 3), Power forward (4), Center (5), Guard, Inbounder, Screener, Trailer, Safety, Outlet, Sixth man, Substitute, Three-and-D player, Two way player, Shagger.

---

## 6. Stats / arbitrage (hors-scope)

Ces termes ne sont pas automatisables comme actions de jeu — ils relèvent du chrono, des stats, ou de l'arbitrage.

**Fautes** : Foul, Personal foul, Player-control foul, Charge / Charging foul, Blocking foul, Loose-ball foul, Moving screen, Non-shooting foul, Shooting foul, Two-shot foul, Technical foul, Flagrant foul, Unsportsmanlike foul / Intentional foul, Foul trouble.

**Violations** : Traveling, Shot clock violation, Palming, Goaltending, Held ball action, Jump ball, Tip-off.

**Stats** : Assist, Blocked shots / Block / Rejection, Double-double, Triple-double, Plus-minus, Steal, Turnover, Field goal, Possession, Points per possession, Defensive rebound, Offensive rebound, Rebound / Board, Hang time, Buzzer beater, Shot clock, Overtime.

---

## 7. Plan d'implémentation suggéré

### Phase 1 — Tier 2 offensif (estim. ~3-5j)

Cibler les 20-25 actions **🔜** les plus utilisées en coaching FIBA :

1. **Variantes de PnR** : drag screen, double drag, step-up, ghost, slip, reject, deep roll, short roll → réutilisent `pickAndRoll` avec paramètres.
2. **Compositions courantes** : Spain action, RAM, zoom action, split action, ball reversal → orchestrent des Tier 1.
3. **Coupes manquantes** : flash, flex, I-cut, V-cut, UCLA cut, Iverson cut.
4. **Off-ball** : staggered, elevator, hammer, screen-away, double screen.
5. **Drive variants** : coast-to-coast, jab-and-cross, stop-and-pop.

### Phase 2 — Entrées (Tier 3, estim. ~2-3j)

Implémenter le concept "set play / entry" : `ScriptedAction` de type `entry` qui réécrit `step[0].off` en un alignement nommé.

Cibler : Horns, Floppy, Pistol, Box set, UCLA, Iverson, Pinch post.

### Phase 3 — Couche défensive scriptable ✅ MVP implémenté

`ScriptedAction` est une union discriminée `OffensiveScriptedAction | DefensiveScriptedAction`. Les 4 actions défensives MVP sont disponibles dans le panneau Scénario :

```ts
type DefensiveActionType =
  | 'help-and-recover'  // D_X aide sur step N, recover sur step N+1
  | 'pre-switch'        // D_X et D_Y échangent avant l'écran (assignmentOverrides)
  | 'trap'              // D_X et D_Y forment un V sur O_Z (directive par step)
  | 'tag';              // low-man bumpe le roller (pnrRole='tag')
```

**Modules implémentés** :
- `src/lib/logic/applyDirective.ts` — application des directives défensives par step
- `src/lib/logic/defensiveCompilation.ts` — compilation des actions défensives en directives
- `src/lib/logic/defensiveDefaults.ts` — valeurs par défaut des actions défensives
- `src/lib/logic/defensiveActionsCatalog.ts` — catalogue des 4 actions MVP

**UX Scénario** :
- Couvertures défensives **couplées** : attachées à une action offensive via `parentActionId`
- Actions défensives **libres** : avec `affectedSteps` explicite
- Toggle global `defenseScriptedDirectivesEnabled` (default `true`)

**Tests** : `applyDirective.test.ts`, `defenseScriptedIntegration.test.ts`, `defensiveCompilation.test.ts`, `defensiveDefaults.test.ts`, `defensiveActionsCatalog.test.ts`

**Reste à faire (Phase 3 suite)** : toutes les autres actions défensives listées en section 2 — closeout, stunt, jam-cutter, rotation, double-team, et les couvertures d'écran (over/under/switch/hedge/drop/blitz/ice) exposées comme directives scriptables par step.

### Phase 4 — LLM (estim. ~5-10j, dépendant du choix d'API)

Parser de texte libre `prompt → ScriptedAction[]`, en s'appuyant sur le vocabulaire complet de [`fiba-terminology.md`](./fiba-terminology.md) injecté dans le prompt système. Chaque action FIBA reconnue est mappée sur son `ScriptedActionType` via le catalogue.

---

## Statistiques

- **Total termes PDF** : ~250
- **Actions offensives jouables** : ~145
  - ✅ Tier 1 implémentées : **18** (12.4%)
  - 🔜 Tier 2 à coder : ~85
  - 🟦 Entrées Tier 3 : ~25
  - 🎯 Finitions/passes (param) : ~40
- **Phases défensives scriptables** : ~50 (~30 couvertures + ~20 individuelles/équipe) — **4 MVP ✅** (help-and-recover, pre-switch, trap, tag)
- **Géométrie / postures / rôles / stats** : ~55 (hors-scope automatisation)
