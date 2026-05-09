# Phase 3 — Couche défensive scriptable (MVP)

> Design validé le 2026-05-09. Étend le mode scénario avec 4 actions défensives couplables aux actions offensives.
>
> **Roadmap source** : [`docs/fiba-actions-roadmap.md`](../../fiba-actions-roadmap.md) §7 Phase 3.

---

## 1. Objectif

Permettre au coach de **scripter la réponse défensive** à une action offensive. Aujourd'hui, la défense est calculée 100 % par le moteur via `DefenderRules` + `ScreenRule` (globaux, statiques). Le mode scénario empile uniquement des actions offensives. Cette phase introduit des **directives temporaires par step** qui surchargent le moteur défensif sur des défenseurs et des steps précis.

### MVP — 4 actions défensives

- `help-and-recover` — un défenseur quitte son homme pour aider, puis closeout.
- `pre-switch` — 2 défenseurs anticipent un futur écran et échangent leurs hommes.
- `trap` — 2 défenseurs forment un V agressif sur le porteur.
- `tag` — un low-man bumpe le roller avant de rentrer.

### Hors-scope (Phase 3.x ultérieure)

- `closeout`, `stunt`, `double-team`, `jam-cutter`, `rotation`, `dig-hard`, `peel-switch` scriptés (l'archi les accommode trivialement).
- Templates pré-faits (ex : "PnR + blitz-to-switch" en 1 clic).
- Drag-and-drop pour reorder les couvertures.
- Animation de phase (engage/release) sur le terrain.

---

## 2. Modèle de données

### 2.1 `ScriptedAction` devient une union discriminée par `kind`

```ts
// src/lib/types/index.ts

export type ScriptedAction = OffensiveScriptedAction | DefensiveScriptedAction;

export interface OffensiveScriptedAction {
  kind: 'offensive';
  id: string;
  type: ScriptedActionType;        // 'pick-and-roll' | ... (inchangé)
  params: ScriptedActionParams;
  label?: string;
}

export type DefensiveActionType =
  | 'help-and-recover'
  | 'pre-switch'
  | 'trap'
  | 'tag';

export interface DefensiveScriptedAction {
  kind: 'defensive';
  id: string;
  type: DefensiveActionType;
  /** Si défini → couplée à une action offensive existante. Sinon → libre. */
  parentActionId?: string;
  /** Steps ciblés. Si parentActionId défini, calculés depuis le parent
   *  (par défaut tous ses steps, surchargeable). Si libre, fournis explicitement. */
  affectedSteps?: number[];
  params: DefensiveActionParams;
  label?: string;
}

export interface DefensiveActionParams {
  /** Défenseur(s) qui exécutent la directive. */
  defenders: DefenderId[];
  /** Attaquant ciblé (porteur trappé, cutter jammé, roller taggé...). */
  target?: AttackerId;
  /** Pour pre-switch uniquement : 2e défenseur qui échange. */
  swapWith?: DefenderId;
  /** Pour help-and-recover : steps de chaque phase. */
  helpStep?: number;
  recoverStep?: number;
}
```

### 2.2 `Step` augmenté

```ts
export interface Step {
  // ... champs existants
  defensiveDirectives?: DefensiveDirective[];
  /** Overrides d'assignation défenseur → attaquant pour ce step.
   *  Posé par compileScenario quand un `pre-switch` swappe deux défenseurs ;
   *  propagé sur tous les steps suivants du parent. L'engine lit ce champ
   *  en plus de `state.rules` pour déterminer qui défend qui. */
  assignmentOverrides?: Record<DefenderId, AttackerId>;
}

/** Forme low-level résolue par compileScenario, consommée par l'engine.
 *  Une DefensiveScriptedAction génère 1+ DefensiveDirective(s) (1 par step ciblé). */
export interface DefensiveDirective {
  type: DefensiveActionType;
  defenders: DefenderId[];
  target?: AttackerId;
  swapWith?: DefenderId;
  /** Phase sur ce step ('engage' = action active, 'release' = retour). */
  phase: 'engage' | 'release';
  /** ID de l'action source (debug + UI traçabilité). */
  sourceActionId: string;
}
```

### 2.3 Distinction high-level vs low-level

- `DefensiveScriptedAction` = forme **user**, manipulée dans le ScenarioPanel.
- `DefensiveDirective` = forme **compilée**, attachée aux `Step`, consommée par l'engine.
- Une action peut générer plusieurs directives (`help-and-recover` = 1 `engage` + 1 `release`).

### 2.4 Migration des scénarios existants

À l'ouverture, tout `ScriptedAction` sans `kind` reçoit `kind: 'offensive'`. Pas de breaking change utilisateur.

---

## 3. Pipeline de compilation

`compileScenario` passe à 2 passes :

```ts
export function compileScenario(actions: ScriptedAction[]): Step[] {
  // Passe 1 — partition + compilation offense (logique actuelle)
  const offensives = actions.filter(isOffensive);
  const defensives = actions.filter(isDefensive);
  const steps = compileOffensive(offensives);

  // Chaque step porte déjà step.generatedBy (cf. types/index.ts ligne 67),
  // ce qui permet de retrouver les steps d'une action offensive par son id.

  // Passe 2 — résolution des directives défensives
  for (const def of defensives) {
    const targetStepIndices = resolveTargetSteps(def, steps);
    const directives = expandToDirectives(def, targetStepIndices);

    for (const { stepIndex, directive } of directives) {
      steps[stepIndex].defensiveDirectives ??= [];
      steps[stepIndex].defensiveDirectives.push(directive);
    }
  }

  return steps;
}
```

### 3.1 `resolveTargetSteps`

- **Couplée** (`parentActionId` défini) : récupère tous les steps avec `step.generatedBy === parentActionId`. Si `affectedSteps` est défini, filtre.
- **Libre** : `affectedSteps` est obligatoire (indices absolus dans la liste compilée).

### 3.2 `expandToDirectives` — règles d'expansion

| Type | Expansion |
|---|---|
| `trap` | 1 directive `engage` par step ciblé. |
| `tag` | 1 directive `engage` par step ciblé (généralement le step de roll). |
| `pre-switch` | 1 directive `engage` sur le step *avant* l'écran. **De plus**, `expandToDirectives` populate `step.assignmentOverrides` sur ce step ET tous les steps suivants du parent (le swap persiste explicitement, pas via état moteur). |
| `help-and-recover` | 1 `engage` sur `helpStep`, 1 `release` sur `recoverStep`. Defaults : `helpStep` = step où apparaît `drive` dans le parent, `recoverStep = helpStep + 1`. |

### 3.3 Validations

- `parentActionId` doit exister dans la liste, sinon l'action est ignorée + warning console (pas d'erreur bloquante).
- `defenders` non vide.
- Pour `pre-switch` : `swapWith` requis et différent de `defenders[0]`.
- Pour `help-and-recover` libre : `helpStep` et `recoverStep` requis et `recoverStep > helpStep`.

---

## 4. Moteur défensif

`engine.ts` applique les directives **après** le calcul standard, en surchargeant additivement les défenseurs ciblés.

```ts
function computeDefenderTargets(step: Step, state: AppState): DefenderTargets {
  // 1. Calcul standard — DefenderRules + ScreenRule + heuristiques (inchangé)
  const targets = computeStandardDefense(step, state);

  // 2. Application des directives (additif, ciblé)
  if (state.defenseScriptedDirectivesEnabled !== false) {
    for (const directive of step.defensiveDirectives ?? []) {
      applyDirective(targets, directive, step, state);
    }
  }

  return targets;
}
```

### 4.1 Sémantique de chaque directive

#### `help-and-recover`

- **engage** (`helpStep`) : position cible de `defenders[0]` = mid-point (defender₀.home, target.position) + offset +30 px vers la raquette. Ignore son homme assigné.
- **release** (`recoverStep`) : position cible = position de son homme assigné. `closeoutBoost` forcé à 1.6.

#### `pre-switch`

- **engage** (step avant l'écran) : `compileScenario` pose `step.assignmentOverrides` = `{ [defenders[0]]: <ancien homme de swapWith>, [swapWith]: <ancien homme de defenders[0]> }` sur ce step et tous les steps suivants du parent.
- L'engine lit `step.assignmentOverrides` (s'il existe) pour déterminer l'homme à défendre, **avant** d'appliquer `DefenderRules`.
- Position cible de chacun : leur nouveau homme.

#### `trap`

- **engage** : pour chaque trappeur, position cible = point sur cercle de rayon ~80 px autour de `target`, à ±60° de la direction (target → panier). `helpMode` = `aggressive`, `vsCarrier` = `coller`. `bodyOrientation` rotation vers `target`.

#### `tag`

- **engage** : position cible de `defenders[0]` = mid-point (defender.assignedTo.position, roller.position) avec offset +40 % du segment vers le roller. Step suivant : retour standard avec `closeoutBoost` ×1.4.

### 4.2 Résolution de conflits

| Conflit | Résolution |
|---|---|
| 2 directives sur même défenseur même step | La dernière insérée gagne (warning console dev). |
| Directive vs `DefenderRule` individuel (override user) | Directive gagne. |
| Directive vs `ScreenRule` global | Directive gagne pour les défenseurs nommés ; les autres suivent `ScreenRule`. |
| Directive sur défenseur en zone | Directive gagne, le défenseur sort temporairement de sa région. |

### 4.3 Toggle global

`state.defenseScriptedDirectivesEnabled: boolean` (default `true`) — permet de désactiver toutes les directives pour comparer "défense scriptée vs défense moteur" (pédagogique). Exposé en UI dans le panneau Défense ou les paramètres.

### 4.4 Limite assumée du MVP

Pas de blending entre directives sur le même défenseur même step. Si besoin futur, ajouter un système de priorités. Pour les 4 actions MVP, ce cas est marginal en pratique.

---

## 5. UX — ScenarioPanel

### 5.1 Refonte de la carte d'action (fix UX existant)

**Problème actuel** : 4 boutons icônes (▲ ▼ ⚙ ✕) alignés horizontalement dans un panneau ~280 px → cibles ~24 px difficiles à cliquer ; `ActionForm` inline en dessous sans démarcation.

**Nouveau** : carte cliquable, expand/collapse au clic. Boutons monter/descendre déplacés dans le panneau déplié.

État compact :

```
┌─────────────────────────────────────────┐
│ #01  Pick-and-roll          [▼]    [✕] │
│ porteur O1 × screener O5                │
└─────────────────────────────────────────┘
```

État déplié :

```
┌─────────────────────────────────────────┐
│ #01  Pick-and-roll          [▲]    [✕] │
│ porteur O1 × screener O5                │
│ ─────────────────────────────────────── │
│  Paramètres                             │
│   • porteur :     [O1 ▾]                │
│   • screener :    [O5 ▾]                │
│   • côté :        [fort ▾]              │
│  ─────────────────────────────          │
│  Position : [▲ monter] [▼ descendre]    │
│  ─────────────────────────────          │
│  🛡️ Couvertures défensives              │
│   (aucune)                              │
│   [+ ajouter une couverture]            │
└─────────────────────────────────────────┘
```

### 5.2 Ajout d'une couverture couplée (flux principal, ~90 % des cas)

Bouton `[+ ajouter une couverture]` ouvre un mini-modal filtré sur les 4 défensives. Sélection → directive créée avec `parentActionId = action.id` et defaults intelligents :

- `defenders` : si parent = PnR, propose `D` correspondant au défenseur du screener pour `tag`, `D` du porteur pour `help-and-recover`, etc.
- `target` : déduit du parent (porteur du PnR pour `trap`, screener pour `tag`).
- `affectedSteps` : default = tous les steps du parent (`undefined`).

Affichage des couvertures attachées, sous-cartes cliquables (expand pour éditer params) :

```
🛡️ Couvertures défensives
  ┌─────────────────────────────────┐
  │ tag       D4 → roll de O5  [✕]  │
  └─────────────────────────────────┘
  ┌─────────────────────────────────┐
  │ trap      D1+D5 → O1       [✕]  │
  └─────────────────────────────────┘
  [+ ajouter une couverture]
```

### 5.3 Action défensive libre (cas avancé)

Dans le sélecteur principal `[+ Ajouter une action]`, on ajoute une catégorie "🛡️ Défense" en bas. Sélection → action créée avec `parentActionId = undefined`. L'utilisateur doit préciser :

- `affectedSteps` : multi-select sur les indices de step disponibles.
- `defenders` : sélecteur(s) D1-D5.
- `target` : sélecteur O1-O5.

Affichage : carte distincte avec liseré gauche bleu, badge `🛡️ libre` :

```
┌─ 🛡️ libre ──────────────────────────┐
│ #03  trap        D2+D4 → O3   [▼ ✕] │
│ steps : 2, 3                         │
└─────────────────────────────────────┘
```

### 5.4 Code couleur

| Élément | Couleur |
|---|---|
| Carte action offensive | bordure/accent orange (existant, `COLORS.offense`) |
| Carte action défensive libre | bordure/accent bleu (`COLORS.defense`) |
| Sous-carte couverture couplée | fond bleu clair, dans la carte parent orange |
| Bouton "+ couverture" | outline bleu |

### 5.5 Réutilisation du code existant

- `ActionForm` actuel reste pour les params offensifs (zéro réécriture).
- Nouveau `DefensiveActionForm` parallèle pour les directives, suit le même pattern.
- Modal `AddActionModal` est étendu avec une catégorie "🛡️ Défense" en bas (et un nouveau modal réduit `AddCoverageModal` pour le cas couplé).

---

## 6. Catalogue & lecture FR

Étendre `src/lib/data/scriptedActionsCatalog.ts` (ou créer `defensiveActionsCatalog.ts`) avec :

```ts
export const DEFENSIVE_ACTIONS_CATALOG: Record<DefensiveActionType, DefensiveActionDefinition> = {
  'help-and-recover': {
    type: 'help-and-recover',
    label: 'Help & recover',
    fibaTerm: 'Help and recover',
    description: 'Un défenseur quitte son homme pour aider sur drive, puis closeout.',
    requiredParams: ['defenders', 'target'],
    optionalParams: ['helpStep', 'recoverStep'],
    reader: (params) => `${params.defenders[0]} aide sur ${params.target} puis recover`,
  },
  // ... idem pour pre-switch, trap, tag
};
```

Le `reader` génère la lecture FR auto-affichée dans la carte (override possible via `action.label`).

---

## 7. Tests

### 7.1 Unit tests — compileScenario (passe 2)

- `resolveTargetSteps` : couplé sans `affectedSteps` → tous les steps du parent ; couplé avec filter → sous-ensemble ; libre → indices absolus ; parent inexistant → liste vide + warning.
- `expandToDirectives` : `help-and-recover` → 2 directives (engage+release) ; `trap` → N directives engage ; defaults helpStep/recoverStep correctement déduits depuis l'action parent.

### 7.2 Unit tests — engine `applyDirective`

Pour chaque type, construire un `Step` minimal avec une directive et vérifier les positions cibles défensives :
- `trap` : D1+D5 forment un V autour du target.
- `tag` : D_LM est entre son homme et le roller, +40 %.
- `help-and-recover` engage : D2 entre helper.home et target.
- `help-and-recover` release : D2 sur son homme + closeoutBoost.
- `pre-switch` : `assignedTo` swappés.

### 7.3 Test d'intégration — scénario complet

Scénario : PnR (O1+O5) avec couverture `trap` (D1+D5 sur O1) sur tous les steps. Compiler → vérifier que chaque step contient la directive. Lancer engine → positions cohérentes au fil des steps.

### 7.4 Test de migration

Charger un scénario v0.7 (sans `kind`) → vérifier que tous les `ScriptedAction` sont migrés en `kind: 'offensive'`.

### 7.5 Test du toggle

`defenseScriptedDirectivesEnabled = false` → engine ignore `step.defensiveDirectives` et applique uniquement la défense standard.

---

## 8. Découpage d'implémentation suggéré

1. **Types & migration** : refactor `ScriptedAction` en union, ajout `DefensiveScriptedAction`/`DefensiveDirective`/`Step.defensiveDirectives`. Migration au load.
2. **Catalogue défensif** : `DEFENSIVE_ACTIONS_CATALOG` + readers FR.
3. **Compilation passe 2** : `resolveTargetSteps` + `expandToDirectives`. Tests unit.
4. **Engine `applyDirective`** : 4 cases (un par type). Tests unit.
5. **UX 1 — refonte carte d'action** : compact/expand cliquable, boutons monter/descendre dans le déplié. Pas encore de défense.
6. **UX 2 — couverture couplée** : zone "🛡️ Couvertures" + `AddCoverageModal` + sous-cartes. Defaults intelligents.
7. **UX 3 — action défensive libre** : extension `AddActionModal` + carte distincte avec `affectedSteps`/`defenders` selector.
8. **Toggle global** + test d'intégration scénario complet.

---

## 9. Risques & ouvertures

- **Conflits multi-directives** : MVP les ignore (last-wins). Si on ajoute `closeout` ou `stunt` plus tard et qu'ils se cumulent fréquemment, prévoir un système de priorités explicite.
- **Persistence du `pre-switch`** : géré explicitement via `step.assignmentOverrides` (cf. §2.2 et §4.1). À surveiller : l'interaction avec d'autres directives qui touchent à l'assignation (aucune dans le MVP, mais `peel-switch` futur).
- **Defaults intelligents de `defenders`/`target`** : nécessitent de connaître la sémantique de l'action parent (qui est porteur, qui est screener...). Réutilise la logique existante de `compileScenario`. Centraliser dans un helper `inferDefensiveDefaults(parentAction, defType)`.
- **Élargissement Phase 3.x** : les types `closeout`, `stunt`, `double-team`, etc. s'ajoutent en pure extension (un case dans `applyDirective` + une entrée catalogue + un reader). Pas de re-architecture.
