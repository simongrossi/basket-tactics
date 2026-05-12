# Refactoring history

Historique des grosses refontes structurelles. Objectif commun : **réduire le
risque de chaque nouvelle feature basket** en isolant les responsabilités.
Aucune de ces refontes ne change le comportement runtime — toutes ont été
livrées avec les 541 tests verts.

## Pourquoi ?

Plus un fichier grossit, plus :
- on hésite à y toucher (peur de casser autre chose à côté) ;
- on perd du temps à scroller pour trouver la fonction à modifier ;
- les `git diff` deviennent illisibles, les revues moins efficaces ;
- les conflits de merge se multiplient ;
- les LLM (Cursor / Claude Code) saturent leur contexte sur un seul fichier.

Quand un fichier dépasse ~700 lignes ET contient plusieurs domaines distincts,
on le découpe en sous-modules cohérents. Trois patterns sont utilisés selon
la nature du fichier :

1. **Barrel + dossier** pour la logique métier pure (`screens/`,
   `scriptedGenerators/`).
2. **Transformations pures + hook mince** pour le state React (`useAppState`).
3. **Hooks + sous-composants** pour les gros composants React (`CourtView`,
   `ContextMenu`).

Voir [architecture.md § Modularité & refactoring](./architecture.md#modularité--refactoring) pour la définition de ces patterns.

---

## 1. `scriptedGenerators.ts` → `scriptedGenerators/` (1502 → 92 LOC)

**Pattern** : barrel + dossier.

**Problème** : un seul fichier portait les 57 générateurs d'actions FIBA
(pick-and-roll, basket cut, horns set, etc.). Ajouter une action obligeait à
naviguer 1500 lignes, et tous les helpers géométriques étaient mêlés au code
métier de chaque générateur.

**Découpe** :

| Sous-fichier | Contenu | Lignes |
|---|---|---:|
| `helpers.ts` | géométrie commune (`clamp`, `lerp`, `towards`…) + types `Generator` | ~120 |
| `tier1.ts` | 19 générateurs de base (PnR, cuts, screens, drive, shoot, iso) | ~590 |
| `tier2.ts` | 30 variantes (cuts spécialisés, off-ball, PnR variants, combos) | ~650 |
| `tier3.ts` | 9 sets d'entrée de jeu (horns, floppy, pistol, ucla, diamond…) | ~130 |
| `scriptedGenerators.ts` (index) | mapping action FIBA → générateur (câblage seul) | 92 |

**Pour ajouter une action** :
1. Écrire `genFooBar` dans le bon tier.
2. Ajouter `'foo-bar': t<N>.genFooBar` dans le mapping.

Plus aucune lecture du code des autres générateurs.

---

## 2. `useAppState.ts` → wrapper + `lib/state/transforms/` (967 → 510 LOC)

**Pattern** : transformations pures + hook mince.

**Problème** : 55+ callbacks `useCallback` entremêlés sur 967 lignes — drag,
undo/redo, step CRUD, annotations, rules, profils, zones, scénario, branches,
actions défensives, etc. Tout testable seulement via le hook React (lourd à
mocker), et toute mutation du modèle de données risquait de péter une logique
voisine.

**Découpe** :

Le hook ne fait plus que **persistance + history + câblage**. La logique des
transitions d'état vit dans 8 modules de fonctions pures
`(state, ...args) => state`, regroupées en namespaces dans le barrel :

| Module | Domaine | Fonctions clés |
|---|---|---|
| `stepTransforms.ts` | steps | `addStep`, `duplicateStep`, `deleteStep`, `setActiveStep`, `setStepLabel`, `setBallCarrier` |
| `annotationTransforms.ts` | annotations | `addAnnotation`, `deleteAnnotation`, `setAnnotationTiming`, `setAnnotationQuality`, `setAnnotationPhase`, `setForcedScreener`, `clearAnnotationsFor` |
| `defenseTransforms.ts` | défense | `updateRule`, `updateAllRules`, `applyDefenderProfile`, `setScreenRule`, `resetSwitches`, `applyDefensePreset`, `setDefenseSystem`, `clearDefenseOverride`, `clearAllDefenseOverridesActiveStep` |
| `attackerTransforms.ts` | attaquants | `setAttackerHand`, `setAttackerOrientation`, `setAttackerProfile` |
| `zoneTransforms.ts` | zones | `setZoneOverride`, `clearZoneOverride`, `setZoneEditMode`, `updateZoneConfig` |
| `scenarioTransforms.ts` | scénario scripté | actions CRUD + branches (branch-aware via `mutateActionsScope`) |
| `defensiveScriptedTransforms.ts` | défense scriptée | `addDefensiveAction`, `updateDefensiveAction`, `deleteDefensiveAction`, `toggleScriptedDefense` |
| `coreTransforms.ts` | transversal | `setTool`, `loadTemplate`, `importState`, `patch`, `setPlayerCount`, `resetAll` |
| `shared.ts` | helpers internes | `markStepAsManual`, `recompileScenarioSteps`, `mutateActionsScope` |

Le hook ré-expose chaque transform via un wrapper d'une ligne :

```typescript
const setBallCarrier = useCallback((carrier: AttackerId) => {
  setStateWithHistory((s) => stepTx.setBallCarrier(s, carrier));
}, [setStateWithHistory]);
```

**Bénéfices** :
- Chaque transform est **testable sans React** : `stepTx.addStep(state)`.
- Le hook devient lisible (sections de 5 lignes par domaine, plus 50).
- API publique inchangée : `page.tsx`, `CourtView`, etc. consomment les
  mêmes noms.

---

## 3. `CourtView.tsx` → wrapper + 2 hooks + 2 sous-composants (902 → 446 LOC)

**Pattern** : hooks + sous-composants.

**Problème** : un composant React mélangeait 5 préoccupations :
- calcul de la frame courante (statique / scrub / playback) ;
- gestion du drag des joueurs avec rAF-coalescing ;
- tracé d'annotations (rectiligne ou freehand) ;
- rendu des sprites + ballon avec override de regard pour les poseurs ;
- gestion des context menus (defender / attacker / zone region).

Une feature basket (par ex. modifier l'orientation des poseurs) obligeait à
scroller le composant complet.

**Découpe** :

| Module | Rôle | Lignes |
|---|---|---:|
| `hooks/useCourtFrame.ts` | `staticFrame` / `scrubFrame` / `playFrame` + threats | ~160 |
| `hooks/useCourtPointerHandlers.ts` | drag joueurs (rAF) + tracé d'annotations (freehand) | ~300 |
| `components/court/CourtPlayersLayer.tsx` | sprites attaquants + défenseurs + screener gaze override | ~135 |
| `components/court/CourtMenus.tsx` | context menus def/att + ZoneRegionMenu | ~150 |
| `components/CourtView.tsx` | viewBox + overlays + clic-droit + composition | 446 |

Le composant principal ne fait plus que **câblage** : `<svg>` + overlays
(matchups, FOV, threats, helplines, passlanes, indicateurs d'écran, ball,
badge "lecture") + délégation aux hooks/sous-composants.

---

## 4. `ContextMenu.tsx` → dispatch + 5 modules (897 → 22 LOC)

**Pattern** : hooks + sous-composants.

**Problème** : 17 rows de réglages défenseur + 8 sections attaquant +
2 hooks de positionnement + helpers de layout — tout dans un seul fichier.

**Découpe** :

| Module | Contenu |
|---|---|
| `contextMenu/popupHooks.ts` | `useClampedPosition` (no overflow parent) + `useDraggablePopup` (drag handle) |
| `contextMenu/ToolBar.tsx` | barre move / pass / dribble / cut / screen (avec greying en mode défenseur) |
| `contextMenu/sharedRows.tsx` | `Row` (label + content + tooltip) + `OverrideSliderRow` (global ↔ override avec bouton ↻) + `GazeLockButton` |
| `contextMenu/DefenderMenu.tsx` | 17 rows tactiques + 4 sliders override (distance, closeout×, denial, vit. max) |
| `contextMenu/AttackerMenu.tsx` | carrier / screener forcé / profil / orientation corps + regard / main |
| `ContextMenu.tsx` | **dispatch seul** (22 lignes) — `kind === 'attacker' ? <AttackerMenu/> : <DefenderMenu/>` |

Ajouter une row à un menu = éditer le bon fichier dédié, sans scroller les
900 lignes du monolithe.

---

## 5. `screens.ts` → `screens/` (822 → barrel + 5 modules)

**Pattern** : barrel + dossier.

**Problème** : c'est **l'épicentre des bugs récurrents** sur les écrans
(téléportation, clignotement, position erronée après contact). Une seule
fonction `applyScreenAdjustment` faisait 260 lignes avec un gros switch par
rule défensive, et toute la logique off-ball partageait le même fichier que
la logique porteur.

**Découpe** :

| Sous-fichier | Contenu |
|---|---|
| `helpers.ts` | `hasScreenIntent` (filtre d'intention par vélocité), `smoothstep` (easing continu), `pushOutOfScreener` (clearance min), `pushOutOfCarrier` (avec direction préférée), `pushOutOfScreeners` (multi-poseurs) |
| `detectCarrierScreen.ts` | `detectScreen` — détection écran porteur (PnR / drag / ghost) avec override `forcedScreener` et filtre d'intention |
| `carrierScreenAdjust.ts` | `applyScreenAdjustment` (over/under/hedge×2/drop×2/ice×2/blitz/weak/peel-switch) + `peelSwitchShouldFire` + `applySwitch` |
| `detectOffBallScreens.ts` | `detectOffBallScreens` (pindown / backscreen / flare) + `upgradeOffBallScreens` (stagger / elevator / flex / hammer) |
| `offBallScreenAdjust.ts` | `applyOffBallScreenAdjustment` (over / under / bump / top-lock / chase) + `applySwitchOffBall` |
| `index.ts` | barrel — re-exporte l'API publique |

**Convention `quality`** (commune carrier + off-ball) :
- `q = quality / 100 ∈ [0, 1]`
- `0` → ghost (effet quasi nul, écran "raté")
- `1` → lockdown (D1 plaqué au poseur, écran "parfait")
- `0.5` → standard

**Pour ajouter une rule défensive** : éditer le `*Adjust.ts` du bon module,
ajouter le bloc `if (rule === '…') { … }`. Plus de risque de toucher l'autre
domaine.

**Pour ajouter un nouveau TYPE d'écran** (non-porteur) : étendre
`OffBallScreenType` dans les types et `upgradeOffBallScreens` dans
`detectOffBallScreens.ts`.

---

## Méthode reproductible

Quand on identifie un nouveau gros fichier candidat :

1. **Lister les responsabilités** (`grep -nE "^(export |function|const)" <file>`).
2. **Trouver les axes de découpe** (par domaine métier, par type de
   contribution, par étape de pipeline).
3. **Identifier les helpers privés vs API publique** (souvent les helpers
   peuvent vivre dans un module commun, l'API publique va dans un barrel).
4. **Créer la nouvelle structure**, déplacer les fonctions.
5. **Adapter UNIQUEMENT le barrel** : si l'API publique est inchangée, les
   callers (imports `@/lib/…/<name>`) marchent encore via la résolution
   `<name>/index.ts`.
6. **`npx tsc --noEmit && npx vitest run`** : tout doit rester vert.
7. **Mettre à jour `docs/architecture.md`** (arborescence) et ce fichier
   (entrée dans la table).

Cible : passer sous les 500 lignes pour le fichier principal, sous les 300
pour chaque sous-module.
