# Preset réaliste par défaut (`realismProfile`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire démarrer toute nouvelle session en comportement cinématique réaliste (accélération, momentum, velocity profile, footwork) via un champ `realismProfile` résolu par une fonction pure, avec retour au mode tactique en un clic et migration des scénarios sauvegardés — sans casser un seul des 124 tests qui supposent le comportement legacy.

**Architecture:** Un resolver pur (`resolveRealismFlags`) est l'unique source de vérité : profil `'realistic'` → groupe cinématique calibré (overrides par-flag prioritaires) ; profil `'legacy'`/`undefined` → flags bruts bit-identiques au comportement actuel. Tous les sites de lecture moteur du groupe cinématique sont routés à travers ce resolver. `makeInitialState()` reste legacy (tests verts) ; un wrapper `makeAppInitialState()` et la migration au chargement posent `'realistic'` côté app.

**Tech Stack:** TypeScript, React, Vitest, Next.js. Spec : [docs/superpowers/specs/2026-06-02-realism-profile-default-design.md](../specs/2026-06-02-realism-profile-default-design.md).

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `src/lib/types/index.ts` | Type `RealismProfile` + champ `AppState.realismProfile` | Modify |
| `src/lib/logic/realismProfile.ts` | Resolver pur + constante `PRESET_REALISTIC` | Create |
| `src/lib/logic/__tests__/realismProfile.test.ts` | Tests resolver + garde-fou legacy | Create |
| `src/lib/logic/playback/frameResolver.ts` | Routage des reads cinématiques (resolveFrameAt) | Modify |
| `src/lib/logic/defense/speedConstraint.ts` | Routage footwork (computeEffectiveDefensePositions) | Modify |
| `src/hooks/useCourtFrame.ts` | Routage footwork (modulation live défenseur) | Modify |
| `src/lib/data/initial.ts` | Wrapper `makeAppInitialState()` | Modify |
| `src/hooks/useAppState.ts` | Seed via `makeAppInitialState` | Modify |
| `src/lib/state/persistence.ts` | Migration `realismProfile` à l'ouverture | Modify |
| `src/lib/state/__tests__/persistence.test.ts` | Test migration | Create ou Modify |
| `src/components/ParametresPanel.tsx` | Toggle Réaliste/Tactique + checkboxes sur valeur résolue | Modify |

**Groupe cinématique (in-scope du resolver)** — 4 flags + 2 valeurs numériques :
`attackerAccelerationEnabled` (+ `attackerAcceleration`), `attackerMomentumEnabled` (+ `attackerMomentum`), `attackerVelocityProfileEnabled`, `footworkRulesEnabled` (porte aussi reaction-time + plant-and-cut). Tout le reste est lu brut, inchangé.

---

## Task 1: Type + resolver pur

**Files:**
- Modify: `src/lib/types/index.ts` (près de la déclaration `AppState`, après `realSpeedMode?`)
- Create: `src/lib/logic/realismProfile.ts`
- Test: `src/lib/logic/__tests__/realismProfile.test.ts`

- [ ] **Step 1: Ajouter le type et le champ dans `types/index.ts`**

Juste avant `export interface AppState {` (L930), ajouter :

```ts
/** Profil de réalisme cinématique. `'realistic'` (défaut app) active le
 *  groupe cinématique calibré ; `'legacy'`/undefined = comportement
 *  historique (flags bruts). Résolu par `resolveRealismFlags`. */
export type RealismProfile = 'realistic' | 'legacy';
```

Dans `interface AppState`, juste après `activeStep: number;` (L932), ajouter :

```ts
  realismProfile?: RealismProfile;
```

- [ ] **Step 2: Écrire le test du resolver (échec attendu)**

Créer `src/lib/logic/__tests__/realismProfile.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { resolveRealismFlags, PRESET_REALISTIC } from '../realismProfile';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';

function withProfile(patch: Partial<AppState>): AppState {
  return { ...makeInitialState(), ...patch };
}

describe('resolveRealismFlags', () => {
  it('profil realistic active le groupe cinématique aux valeurs preset', () => {
    const r = resolveRealismFlags(withProfile({ realismProfile: 'realistic' }));
    expect(r.attackerAccelerationEnabled).toBe(true);
    expect(r.attackerAcceleration).toBe(PRESET_REALISTIC.attackerAcceleration);
    expect(r.attackerMomentumEnabled).toBe(true);
    expect(r.attackerMomentum).toBe(PRESET_REALISTIC.attackerMomentum);
    expect(r.attackerVelocityProfileEnabled).toBe(true);
    expect(r.footworkRulesEnabled).toBe(true);
  });

  it('profil realistic : un flag explicitement false est un override qui gagne', () => {
    const r = resolveRealismFlags(
      withProfile({ realismProfile: 'realistic', footworkRulesEnabled: false }),
    );
    expect(r.footworkRulesEnabled).toBe(false);
    expect(r.attackerAccelerationEnabled).toBe(true); // les autres restent preset
  });

  it('profil legacy renvoie les flags bruts', () => {
    const r = resolveRealismFlags(
      withProfile({ realismProfile: 'legacy', attackerAccelerationEnabled: true }),
    );
    expect(r.attackerAccelerationEnabled).toBe(true);
    expect(r.footworkRulesEnabled).toBe(false);
    expect(r.attackerAcceleration).toBe(5.0); // valeur présente dans makeInitialState
  });

  it('profil undefined est bit-identique à legacy', () => {
    const base = withProfile({ attackerMomentumEnabled: true });
    const undef = resolveRealismFlags(base);
    const legacy = resolveRealismFlags({ ...base, realismProfile: 'legacy' });
    expect(undef).toEqual(legacy);
  });

  it('garde-fou : makeInitialState() reste legacy (verrouille les 124 tests)', () => {
    const state = makeInitialState();
    expect(state.realismProfile).toBeUndefined();
    const r = resolveRealismFlags(state);
    expect(r.attackerAccelerationEnabled).toBe(false);
    expect(r.attackerMomentumEnabled).toBe(false);
    expect(r.attackerVelocityProfileEnabled).toBe(false);
    expect(r.footworkRulesEnabled).toBe(false);
  });
});
```

- [ ] **Step 3: Lancer le test (échec attendu)**

Run: `npm test -- realismProfile`
Expected: FAIL — `resolveRealismFlags` / `PRESET_REALISTIC` introuvables.

- [ ] **Step 4: Implémenter le resolver**

Créer `src/lib/logic/realismProfile.ts` :

```ts
// Resolver du profil de réalisme cinématique.
//
// Source de vérité unique : le moteur ne lit JAMAIS les flags cinématiques
// bruts directement (frameResolver, speedConstraint, useCourtFrame passent
// par ici). Pur, déterministe, sans mutation.
//
// Scope = cinématique déterministe uniquement. Les comportements RNG
// (physicsRebounds, activeInterceptions, dribblePhysics), le contact, la
// transition et realSpeedMode ne sont PAS gérés ici (lus bruts ailleurs).

import type { AppState } from '../types';

/** Valeurs du preset réaliste. Calibrées en Task 8. */
export const PRESET_REALISTIC = {
  attackerAccelerationEnabled: true,
  attackerAcceleration: 5.0,
  attackerMomentumEnabled: true,
  attackerMomentum: 0.15,
  attackerVelocityProfileEnabled: true,
  footworkRulesEnabled: true,
} as const;

export interface ResolvedRealismFlags {
  attackerAccelerationEnabled: boolean;
  attackerAcceleration: number | undefined;
  attackerMomentumEnabled: boolean;
  attackerMomentum: number | undefined;
  attackerVelocityProfileEnabled: boolean;
  footworkRulesEnabled: boolean;
}

export function resolveRealismFlags(state: AppState): ResolvedRealismFlags {
  if (state.realismProfile === 'realistic') {
    // `?? preset` : un flag absent prend le preset, un flag explicitement
    // posé (même `false`) l'emporte (override coach).
    return {
      attackerAccelerationEnabled:
        state.attackerAccelerationEnabled ?? PRESET_REALISTIC.attackerAccelerationEnabled,
      attackerAcceleration:
        state.attackerAcceleration ?? PRESET_REALISTIC.attackerAcceleration,
      attackerMomentumEnabled:
        state.attackerMomentumEnabled ?? PRESET_REALISTIC.attackerMomentumEnabled,
      attackerMomentum: state.attackerMomentum ?? PRESET_REALISTIC.attackerMomentum,
      attackerVelocityProfileEnabled:
        state.attackerVelocityProfileEnabled ?? PRESET_REALISTIC.attackerVelocityProfileEnabled,
      footworkRulesEnabled:
        state.footworkRulesEnabled ?? PRESET_REALISTIC.footworkRulesEnabled,
    };
  }
  // legacy / undefined — flags bruts, bit-identiques au comportement actuel.
  return {
    attackerAccelerationEnabled: !!state.attackerAccelerationEnabled,
    attackerAcceleration: state.attackerAcceleration,
    attackerMomentumEnabled: !!state.attackerMomentumEnabled,
    attackerMomentum: state.attackerMomentum,
    attackerVelocityProfileEnabled: !!state.attackerVelocityProfileEnabled,
    footworkRulesEnabled: !!state.footworkRulesEnabled,
  };
}
```

- [ ] **Step 5: Lancer le test (succès attendu)**

Run: `npm test -- realismProfile`
Expected: PASS (5 tests).

- [ ] **Step 6: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types/index.ts src/lib/logic/realismProfile.ts src/lib/logic/__tests__/realismProfile.test.ts
git commit -m "feat(realism): type RealismProfile + resolver pur resolveRealismFlags

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Router `frameResolver.ts` à travers le resolver

> ⚠️ CLAUDE.md Règle 1bis : `frameResolver.ts` touche le pipeline d'écran.
> Lire `docs/SCREEN-ENGINE.md` avant. Le changement ne modifie NI l'ordre
> des couches NI la logique — il remplace `state.<flag>` par `realism.<flag>`.
> Invariant : sur un état legacy, sortie bit-identique.

**Files:**
- Modify: `src/lib/logic/playback/frameResolver.ts` (fonction `resolveFrameAt`, L380)

Sites à router (tous dans `resolveFrameAt`) : L423, L477, L478, L479, L480, L699, L739, L1099.

- [ ] **Step 1: Importer le resolver**

En tête de fichier, ajouter à la liste d'imports :

```ts
import { resolveRealismFlags } from '../realismProfile';
```

- [ ] **Step 2: Calculer le resolved une fois en tête de `resolveFrameAt`**

Juste après la ligne d'ouverture du corps de `resolveFrameAt` (après la signature L380, avant le premier usage), ajouter :

```ts
  const realism = resolveRealismFlags(state);
```

- [ ] **Step 3: Remplacer les 6 reads par les champs résolus**

L423 — remplacer :
```ts
        enabled: !!state.attackerVelocityProfileEnabled || !!state.attackerAccelerationEnabled || !!state.attackerMomentumEnabled,
```
par :
```ts
        enabled: realism.attackerVelocityProfileEnabled || realism.attackerAccelerationEnabled || realism.attackerMomentumEnabled,
```

L477-480 — remplacer :
```ts
        accelerationEnabled: !!state.attackerAccelerationEnabled,
        acceleration: state.attackerAcceleration,
        momentumEnabled: !!state.attackerMomentumEnabled,
        momentum: state.attackerMomentum,
```
par :
```ts
        accelerationEnabled: realism.attackerAccelerationEnabled,
        acceleration: realism.attackerAcceleration,
        momentumEnabled: realism.attackerMomentumEnabled,
        momentum: realism.attackerMomentum,
```

L699 — remplacer `if (state.footworkRulesEnabled) {` par `if (realism.footworkRulesEnabled) {`

L739 — remplacer :
```ts
    const delayFraction = state.footworkRulesEnabled ? (defB[id]?.delayFraction ?? 0) : 0;
```
par :
```ts
    const delayFraction = realism.footworkRulesEnabled ? (defB[id]?.delayFraction ?? 0) : 0;
```

L1099 — remplacer :
```ts
      delayFraction: state.footworkRulesEnabled ? delayFraction : undefined,
```
par :
```ts
      delayFraction: realism.footworkRulesEnabled ? delayFraction : undefined,
```

- [ ] **Step 4: Vérifier qu'aucun read de groupe ne subsiste dans le fichier**

Run: `grep -n "state.attackerAccelerationEnabled\|state.attackerMomentumEnabled\|state.attackerVelocityProfileEnabled\|state.footworkRulesEnabled\|state.attackerAcceleration\b\|state.attackerMomentum\b" src/lib/logic/playback/frameResolver.ts`
Expected: aucune sortie.

- [ ] **Step 5: Lancer la suite de non-régression playback/écran**

Run: `npm test -- frameResolver screens overlap userJson screenLab`
Expected: PASS (état legacy → sortie bit-identique).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/logic/playback/frameResolver.ts
git commit -m "refactor(realism): route frameResolver cinématique via resolveRealismFlags

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Router `speedConstraint.ts`

**Files:**
- Modify: `src/lib/logic/defense/speedConstraint.ts` (fonction `computeEffectiveDefensePositions`, L159)

Sites : L206, L537, L664, L711 (tous `state.footworkRulesEnabled`).

- [ ] **Step 1: Importer le resolver**

En tête de fichier :
```ts
import { resolveRealismFlags } from '../realismProfile';
```

- [ ] **Step 2: Calculer le resolved en tête de `computeEffectiveDefensePositions`**

Juste après la signature `function computeEffectiveDefensePositions(state: AppState, stepIdx: number): ComputedDefense {` (L159), ajouter :
```ts
  const realism = resolveRealismFlags(state);
```

- [ ] **Step 3: Remplacer les 4 reads**

L206 : `if (state.footworkRulesEnabled) {` → `if (realism.footworkRulesEnabled) {`
L537 : `if (state.footworkRulesEnabled) {` → `if (realism.footworkRulesEnabled) {`
L664 : `delayFraction: state.footworkRulesEnabled ? delayFraction : undefined,` → `delayFraction: realism.footworkRulesEnabled ? delayFraction : undefined,`
L711 : `delayFraction: state.footworkRulesEnabled ? delayFraction : undefined,` → `delayFraction: realism.footworkRulesEnabled ? delayFraction : undefined,`

- [ ] **Step 4: Vérifier qu'aucun read ne subsiste**

Run: `grep -n "state.footworkRulesEnabled" src/lib/logic/defense/speedConstraint.ts`
Expected: aucune sortie.

- [ ] **Step 5: Tests de non-régression défense**

Run: `npm test -- speedConstraint screens overlap`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/logic/defense/speedConstraint.ts
git commit -m "refactor(realism): route speedConstraint footwork via resolveRealismFlags

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Router `useCourtFrame.ts`

**Files:**
- Modify: `src/hooks/useCourtFrame.ts` (sites L300, L353 — `cur.footworkRulesEnabled`)

- [ ] **Step 1: Importer le resolver**

En tête de fichier :
```ts
import { resolveRealismFlags } from '@/lib/logic/realismProfile';
```

- [ ] **Step 2: Calculer le resolved depuis `cur`**

Repérer le bloc où `cur` (l'état) est disponible et englobe les L300 et L353 (la boucle de modulation live des défenseurs). Juste avant la première utilisation (L300), ajouter :
```ts
        const realism = resolveRealismFlags(cur);
```
> Note : si L300 et L353 sont dans deux portées différentes, calculer
> `realism` dans chaque portée à partir de `cur`. Vérifier visuellement
> la portée de `cur` à l'édition.

- [ ] **Step 3: Remplacer les 2 reads**

L300 : `if (cur.footworkRulesEnabled && matchedAtt) {` → `if (realism.footworkRulesEnabled && matchedAtt) {`
L353 : `if (cur.footworkRulesEnabled && matchedAtt) {` → `if (realism.footworkRulesEnabled && matchedAtt) {`

- [ ] **Step 4: Vérifier qu'aucun read ne subsiste**

Run: `grep -n "cur.footworkRulesEnabled" src/hooks/useCourtFrame.ts`
Expected: aucune sortie.

- [ ] **Step 5: Typecheck + tests**

Run: `npx tsc --noEmit && npm test -- useCourtFrame`
Expected: 0 erreur ; PASS (ou « no tests » si le hook n'a pas de suite dédiée — dans ce cas s'appuyer sur le typecheck).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCourtFrame.ts
git commit -m "refactor(realism): route useCourtFrame footwork via resolveRealismFlags

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Défaut app réaliste (`makeAppInitialState`)

**Files:**
- Modify: `src/lib/data/initial.ts` (après `makeInitialState`, L133)
- Modify: `src/hooks/useAppState.ts` (L104, seed)

- [ ] **Step 1: Ajouter le wrapper dans `initial.ts`**

Juste après la fin de `makeInitialState()` (après L133), ajouter :

```ts
/** État initial côté APPLICATION : identique à `makeInitialState()` mais
 *  en profil réaliste par défaut. Les tests continuent d'utiliser
 *  `makeInitialState()` (legacy) → suite verte par construction. */
export function makeAppInitialState(): AppState {
  return { ...makeInitialState(), realismProfile: 'realistic' };
}
```

- [ ] **Step 2: Câbler le seed dans `useAppState.ts`**

L38 — étendre l'import :
```ts
import { makeInitialState, makeAppInitialState } from '@/lib/data/initial';
```
L104 — remplacer :
```ts
  } = useHistorizedState(makeInitialState);
```
par :
```ts
  } = useHistorizedState(makeAppInitialState);
```

- [ ] **Step 3: Typecheck + tests useAppState**

Run: `npx tsc --noEmit && npm test -- useAppState`
Expected: 0 erreur ; PASS. Si un test useAppState assert un comportement legacy dépendant des flags cinématiques, il construit son propre état — sinon ajuster en posant `realismProfile: 'legacy'` dans le setup de CE test précis (documenter pourquoi).

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/initial.ts src/hooks/useAppState.ts
git commit -m "feat(realism): app démarre en profil réaliste (makeAppInitialState)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Migration des scénarios sauvegardés à l'ouverture

**Files:**
- Modify: `src/lib/state/persistence.ts` (`loadFromStorage`, après le merge L32-37)
- Test: `src/lib/state/__tests__/persistence.test.ts`

- [ ] **Step 1: Écrire le test de migration (échec attendu)**

Créer/compléter `src/lib/state/__tests__/persistence.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadFromStorage, saveToStorage, STORAGE_KEY } from '../persistence';
import { makeInitialState } from '@/lib/data/initial';

describe('loadFromStorage — migration realismProfile', () => {
  beforeEach(() => window.localStorage.clear());

  it('un état persisté sans realismProfile est migré en realistic', () => {
    const legacy = makeInitialState(); // realismProfile undefined
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const loaded = loadFromStorage();
    expect(loaded?.realismProfile).toBe('realistic');
  });

  it('un état persisté avec legacy explicite est préservé', () => {
    const state = { ...makeInitialState(), realismProfile: 'legacy' as const };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const loaded = loadFromStorage();
    expect(loaded?.realismProfile).toBe('legacy');
  });
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npm test -- persistence`
Expected: FAIL — le premier cas renvoie `undefined` au lieu de `'realistic'`.

- [ ] **Step 3: Ajouter la migration dans `loadFromStorage`**

Dans `src/lib/state/persistence.ts`, dans le bloc `merged` (L32-37), ajouter la migration. Remplacer :
```ts
    const merged = {
      ...defaults,
      ...parsed,
      zoneConfig: { ...defaults.zoneConfig, ...(parsed.zoneConfig || {}) },
      scriptedActions,
    } as AppState;
```
par :
```ts
    const merged = {
      ...defaults,
      ...parsed,
      zoneConfig: { ...defaults.zoneConfig, ...(parsed.zoneConfig || {}) },
      scriptedActions,
      // Migration : un scénario sauvegardé avant l'introduction de
      // realismProfile est homogénéisé en réaliste à l'ouverture.
      realismProfile: parsed.realismProfile ?? 'realistic',
    } as AppState;
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npm test -- persistence`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/state/persistence.ts src/lib/state/__tests__/persistence.test.ts
git commit -m "feat(realism): migration realismProfile=realistic à l'ouverture d'un scénario

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: UI — toggle Réaliste/Tactique + checkboxes sur valeur résolue

**Files:**
- Modify: `src/components/ParametresPanel.tsx` (zone des contrôles physiques, ~L460-575)

- [ ] **Step 1: Importer le resolver**

En tête de fichier :
```ts
import { resolveRealismFlags } from '@/lib/logic/realismProfile';
```

- [ ] **Step 2: Ajouter le sélecteur de profil au-dessus des checkboxes physiques**

Juste avant la première checkbox physique (avant L469), insérer un sélecteur segmenté :

```tsx
<div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
  <span style={{ fontSize: 13, fontWeight: 600 }}>Profil de réalisme</span>
  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <input
      type="radio"
      name="realismProfile"
      checked={state.realismProfile === 'realistic'}
      onChange={() => onPatch({ realismProfile: 'realistic' })}
    />
    Réaliste
  </label>
  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <input
      type="radio"
      name="realismProfile"
      checked={state.realismProfile !== 'realistic'}
      onChange={() => onPatch({ realismProfile: 'legacy' })}
    />
    Tactique
  </label>
</div>
```
> Convention : `realismProfile !== 'realistic'` couvre `'legacy'` ET
> `undefined` → un état non migré affiche « Tactique ».

- [ ] **Step 3: Brancher les checkboxes individuelles sur la valeur résolue**

Pour que les cases reflètent l'état EFFECTIF (cochées en mode réaliste),
calculer le résolu en tête du composant (après la déstructuration des props) :
```tsx
  const realism = resolveRealismFlags(state);
```
Puis remplacer les `checked` des 4 contrôles du groupe (laisser les `onChange` inchangés — ils posent toujours le flag brut = override) :

- L469 (footwork) : `checked={!!state.footworkRulesEnabled}` → `checked={realism.footworkRulesEnabled}`
- L527 (velocity profile) : `checked={!!state.attackerVelocityProfileEnabled}` → `checked={realism.attackerVelocityProfileEnabled}`
- L539 (accélération) : `checked={!!state.attackerAccelerationEnabled}` → `checked={realism.attackerAccelerationEnabled}`
- L567 (momentum) : `checked={!!state.attackerMomentumEnabled}` → `checked={realism.attackerMomentumEnabled}`

> Laisser les conditions d'affichage des sous-sliders (L544 `state.attackerAccelerationEnabled && (...)`, L572 momentum) telles quelles : elles dépendent de l'override explicite, comportement acceptable (le slider apparaît dès qu'on touche au flag).

- [ ] **Step 4: Typecheck + tests composant**

Run: `npx tsc --noEmit && npm test -- ParametresPanel`
Expected: 0 erreur ; PASS (ou « no tests » → s'appuyer sur typecheck + vérif visuelle Task 8).

- [ ] **Step 5: Commit**

```bash
git add src/components/ParametresPanel.tsx
git commit -m "feat(realism): toggle Réaliste/Tactique + checkboxes sur valeur résolue

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Calibration + vérification visuelle

**Files:**
- Modify (si besoin après calibrage) : `src/lib/logic/realismProfile.ts` (`PRESET_REALISTIC`)

- [ ] **Step 1: Lancer le dev server via preview**

Utiliser `preview_start` (jamais `npm run dev` en Bash bloquant). Charger l'app.

- [ ] **Step 2: Comparer réaliste vs tactique sur deux scénarios**

Charger un scénario PnR et un scénario drive. Basculer le toggle Réaliste/Tactique. Via `preview_screenshot`, capturer les deux modes. Vérifier :
- accélération/décélération visibles (départs/arrêts non instantanés) ;
- momentum (légère dérive en sortie de virage) sans overshoot aberrant ;
- footwork (défenseur en retard sur changement de direction) lisible mais pas paralysant.

- [ ] **Step 3: Ajuster `PRESET_REALISTIC` si nécessaire**

Si le rendu est trop mou ou exagéré, ajuster `attackerAcceleration` (3–12 m/s²) et/ou `attackerMomentum` (0.05–0.40) dans `PRESET_REALISTIC`, re-vérifier au preview. Re-lancer `npm test -- realismProfile` (les assertions sur les valeurs preset doivent rester cohérentes — mettre à jour le test si on change une valeur).

- [ ] **Step 4: Vérifier console + réseau propres**

Via `preview_console_logs` : aucune erreur. Capturer une `preview_screenshot` finale réaliste comme preuve.

- [ ] **Step 5: Commit (si calibrage modifié)**

```bash
git add src/lib/logic/realismProfile.ts src/lib/logic/__tests__/realismProfile.test.ts
git commit -m "tune(realism): calibration PRESET_REALISTIC (vérif visuelle preview)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Validation finale + push

- [ ] **Step 1: Suite complète**

Run: `npm test`
Expected: tous verts (≈ 1945 + 7 nouveaux). Aucun golden snapshot cassé (preuve que le routage est bit-identique en legacy et que seul le seed/migration bascule en réaliste).

- [ ] **Step 2: Typecheck global**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 3: Mettre à jour ROADMAP / CHANGELOG**

Ajouter une entrée datée 2026-06-02 dans `CHANGELOG.md` (sous-projet « cinématique fine #1 — preset réaliste par défaut ») et marquer le statut dans `ROADMAP.md`/`IDEAS.md` (l'item « 15 features off par défaut » devient « actives par défaut via realismProfile »).

```bash
git add CHANGELOG.md ROADMAP.md IDEAS.md
git commit -m "docs: preset réaliste par défaut livré (cinématique fine #1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push (CLAUDE.md Règle 2)**

```bash
git push
```

---

## Self-review (rempli par l'auteur du plan)

- **Couverture spec** : type+champ (T1) · resolver+scope+override (T1) · routage des 12 sites moteur (T2-T4) · défaut app (T5) · migration (T6) · UI toggle+checkboxes résolues (T7) · calibration+preview (T8) · garde-fou 124 tests (T1 step 2 + T9). ✅ Toutes les sections de la spec ont une tâche.
- **Placeholders** : aucun « TBD/TODO » ; tout le code est explicite. La seule note d'inspection (`cur` scope en T4) est une vérification, pas un trou. ✅
- **Cohérence types** : `resolveRealismFlags` / `ResolvedRealismFlags` / `PRESET_REALISTIC` / `makeAppInitialState` / `RealismProfile` utilisés de façon identique partout. ✅
