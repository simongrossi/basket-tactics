# Phy.O V3 V2 — Choix de côté du cut — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un cut peut se réorienter automatiquement vers le côté opposé au défenseur matché, via symétrie axiale du path autour de `from→to`, opt-in par annotation.

**Architecture:** Règle déclarative `Annotation.flipSideIfDefenderOn?: 'left' | 'right'` (approche B du RFC). Un helper pur géométrique transforme le path AVANT le sampling dans `playbackTrajectory.ts`. La position du défenseur est résolue par un résolveur dédié `flipDefenderFor` (séparé de V3 V1 pour zéro effet de bord). UI = select tri-état dans StepsPanel.

**Tech Stack:** TypeScript strict, Vitest (TDD). Aucun toucher à `screens/` ni à la défense → pas de Règle 1bis.

---

## Spec de référence

`docs/superpowers/specs/2026-05-23-cut-side-flip-RFC.md` (approche B validée).

## Invariant Phy.O critique

**`ann.from` et `ann.to` ne sont JAMAIS modifiés.** Ils sont sur l'axe de
symétrie, donc invariants par la réflexion — le helper doit les préserver
exactement (pas de drift flottant aux endpoints).

## Fichiers touchés

| Fichier | Action |
|---|---|
| `src/lib/types/index.ts` | `Annotation.flipSideIfDefenderOn?` |
| `src/lib/logic/cutSideFlip.ts` | Helper pur (créer) |
| `src/lib/logic/__tests__/cutSideFlip.test.ts` | Tests helper (créer) |
| `src/lib/logic/playbackTrajectory.ts` | Intégration flip + clé cache |
| `src/lib/logic/playback/frameResolver.ts` | Résolveur `flipDefenderFor` |
| `src/lib/state/transforms/annotationTransforms.ts` | `setAnnotationFlipSide` |
| `src/lib/state/transforms/__tests__/annotationTransforms.test.ts` | Tests transform (créer/étendre) |
| `src/hooks/useAppState.ts` | Callback |
| `src/app/page.tsx` | Câblage prop |
| `src/components/StepsPanel.tsx` | Select tri-état |

---

## Task 1 — Type `Annotation.flipSideIfDefenderOn`

**Files:**
- Modify: `src/lib/types/index.ts` (interface Annotation, après `feintes?`)

- [ ] **Step 1: Ajouter le champ** — après `feintes?: number[];` (vers ligne 119) :

```typescript
  /** Phy.O V3 V2 — Choix de côté du cut. Si défini, à la lecture on évalue si
   *  le défenseur matché est du côté 'left' ou 'right' de la ligne from→to.
   *  S'il est du côté spécifié, le path est miroité par symétrie axiale autour
   *  de from→to (le cut part de l'autre côté). Endpoints préservés. Undefined =
   *  path dessiné inchangé. */
  flipSideIfDefenderOn?: 'left' | 'right';
```

- [ ] **Step 2: Build check** : `npx tsc --noEmit` → 0 erreur.

---

## Task 2 — Helper pur `cutSideFlip` (tests d'abord)

**Files:**
- Create: `src/lib/logic/__tests__/cutSideFlip.test.ts`
- Create: `src/lib/logic/cutSideFlip.ts`

- [ ] **Step 1: Écrire les tests** :

```typescript
import { describe, it, expect } from 'vitest';
import { defenderSide, reflectAcrossAxis, maybeFlipCutPath } from '@/lib/logic/cutSideFlip';
import type { Point } from '@/lib/types';

const from: Point = { x: 0, y: 0 };
const to: Point = { x: 0, y: 100 }; // axe vertical, du bas vers le haut (y croissant)

// Path courbé vers la GAUCHE (x négatif au milieu).
const pathLeft: Point[] = [from, { x: -40, y: 50 }, to];

describe('defenderSide', () => {
  it('défenseur à gauche de l\'axe from→to', () => {
    // Pour un axe (0,0)→(0,100), un point en x<0 est d'un côté constant.
    expect(defenderSide(from, to, { x: -30, y: 50 })).toBe('left');
  });
  it('défenseur à droite de l\'axe', () => {
    expect(defenderSide(from, to, { x: 30, y: 50 })).toBe('right');
  });
  it('défenseur sur l\'axe → on', () => {
    expect(defenderSide(from, to, { x: 0, y: 50 })).toBe('on');
  });
});

describe('reflectAcrossAxis', () => {
  it('réfléchit un point autour de l\'axe from→to', () => {
    const p = reflectAcrossAxis({ x: -40, y: 50 }, from, to);
    expect(p.x).toBeCloseTo(40, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });
  it('un point SUR l\'axe est invariant', () => {
    const p = reflectAcrossAxis({ x: 0, y: 30 }, from, to);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(30, 5);
  });
});

describe('maybeFlipCutPath', () => {
  it('defender du côté trigger (gauche) + flip="left" → path miroité', () => {
    const { path, flipped } = maybeFlipCutPath(pathLeft, from, to, 'left', { x: -30, y: 50 });
    expect(flipped).toBe(true);
    // Le waypoint passe de x=-40 à x=+40.
    expect(path[1].x).toBeCloseTo(40, 5);
  });

  it('defender du côté opposé (droite) + flip="left" → path inchangé', () => {
    const { path, flipped } = maybeFlipCutPath(pathLeft, from, to, 'left', { x: 30, y: 50 });
    expect(flipped).toBe(false);
    expect(path[1].x).toBeCloseTo(-40, 5);
  });

  it('flip undefined → toujours inchangé', () => {
    const { path, flipped } = maybeFlipCutPath(pathLeft, from, to, undefined, { x: -30, y: 50 });
    expect(flipped).toBe(false);
    expect(path).toBe(pathLeft); // même référence
  });

  it('defPos undefined → inchangé (graceful)', () => {
    const { path, flipped } = maybeFlipCutPath(pathLeft, from, to, 'left', undefined);
    expect(flipped).toBe(false);
    expect(path).toBe(pathLeft);
  });

  it('endpoints préservés exactement après flip', () => {
    const { path } = maybeFlipCutPath(pathLeft, from, to, 'left', { x: -30, y: 50 });
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
  });

  it('flip de flip = identité (involution)', () => {
    const once = maybeFlipCutPath(pathLeft, from, to, 'left', { x: -30, y: 50 });
    // Après le 1er flip, le path part à droite. Un défenseur à droite + flip='right'
    // re-miroite vers la gauche → retour au path d'origine.
    const twice = maybeFlipCutPath(once.path, from, to, 'right', { x: 30, y: 50 });
    expect(twice.flipped).toBe(true);
    expect(twice.path[1].x).toBeCloseTo(-40, 5);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/logic/__tests__/cutSideFlip.test.ts`
  - Attendu : FAIL (module inexistant).

- [ ] **Step 3: Implémenter le helper** :

```typescript
// Phy.O V3 V2 — Choix de côté du cut (approche B du RFC).
//
// Si une annotation `cut` a `flipSideIfDefenderOn`, on évalue à la lecture de
// quel côté de l'axe from→to se trouve le défenseur matché. S'il est du côté
// trigger, le path est miroité par symétrie axiale autour de from→to — le cut
// part du côté opposé pour éviter le mur défensif.
//
// Pur. Les endpoints from/to sont sur l'axe → invariants par la réflexion ;
// on les RÉ-INJECTE explicitement pour zéro drift flottant.

import type { Point } from '../types';

/** Côté du point `p` par rapport à l'axe orienté from→to, via le signe du
 *  cross-product (to-from) × (p-from). >0 → 'left', <0 → 'right', 0 → 'on'.
 *  Convention : repère écran y vers le bas, mais la convention left/right est
 *  cohérente tant qu'on l'utilise symétriquement (le flip est une réflexion). */
export function defenderSide(from: Point, to: Point, p: Point): 'left' | 'right' | 'on' {
  const ax = to.x - from.x;
  const ay = to.y - from.y;
  const bx = p.x - from.x;
  const by = p.y - from.y;
  const cross = ax * by - ay * bx;
  if (cross > 1e-9) return 'left';
  if (cross < -1e-9) return 'right';
  return 'on';
}

/** Réfléchit `p` par symétrie axiale autour de la droite (from, to). */
export function reflectAcrossAxis(p: Point, from: Point, to: Point): Point {
  const ax = to.x - from.x;
  const ay = to.y - from.y;
  const len2 = ax * ax + ay * ay;
  if (len2 < 1e-12) return { x: p.x, y: p.y }; // axe dégénéré
  // Projection de (p-from) sur l'axe, puis réflexion : p' = 2·proj - p (autour
  // de la droite passant par `from`).
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  const t = (dx * ax + dy * ay) / len2;
  const projX = from.x + t * ax;
  const projY = from.y + t * ay;
  return { x: 2 * projX - p.x, y: 2 * projY - p.y };
}

/** Évalue la règle de flip et retourne le path (éventuellement miroité) + un
 *  flag `flipped` (à inclure dans la clé de cache du profil de vitesse). */
export function maybeFlipCutPath(
  path: Point[],
  from: Point,
  to: Point,
  flipSide: 'left' | 'right' | undefined,
  defPos: Point | undefined,
): { path: Point[]; flipped: boolean } {
  if (!flipSide || !defPos) return { path, flipped: false };
  if (defenderSide(from, to, defPos) !== flipSide) return { path, flipped: false };
  // Flip : réfléchir chaque point. Ré-injecter from/to exacts aux extrémités.
  const reflected = path.map((p) => reflectAcrossAxis(p, from, to));
  reflected[0] = { ...from };
  reflected[reflected.length - 1] = { ...to };
  return { path: reflected, flipped: true };
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/logic/__tests__/cutSideFlip.test.ts`
  - Attendu : tous PASS (10 assertions sur 9 tests).

---

## Task 3 — Intégration dans `playbackTrajectory.ts`

**Files:**
- Modify: `src/lib/logic/playbackTrajectory.ts`

### 3a — Résolveur dans les options

- [ ] **Step 1: Ajouter `flipDefenderFor` au type des options** — trouver l'interface des options de profil de vitesse (champ `matchedDefenderFor?`, vers ligne 89). Ajouter :

```typescript
  /** Phy.O V3 V2 — Position mid-segment du matched defender pour le flip de
   *  côté du cut. TOUJOURS fourni (indépendant de attackerActiveDemarquage),
   *  contrairement à matchedDefenderFor qui est gaté sur le flag V3 V1. */
  flipDefenderFor?: (playerId: AttackerId) => Point | undefined;
```

### 3b — Flip du path dans le bloc cut

- [ ] **Step 2: Importer le helper** — en tête de fichier :

```typescript
import { maybeFlipCutPath } from './cutSideFlip';
```

- [ ] **Step 3: Flipper le path** — dans le bloc `if (ann.type === 'cut')` → `if (hasWaypoints)`, remplacer la ligne `const path = annotationPolyline(ann);` (vers 263) par :

```typescript
      let path = annotationPolyline(ann);
      let flipApplied = false;
      if (ann.flipSideIfDefenderOn) {
        const flipDefPos = velocityProfileOptions?.flipDefenderFor?.(playerId);
        const flip = maybeFlipCutPath(path, ann.from, ann.to, ann.flipSideIfDefenderOn, flipDefPos);
        path = flip.path;
        flipApplied = flip.flipped;
      }
```

### 3c — Clé de cache

- [ ] **Step 4: Propager `flipApplied` à getOrBuildProfile** — l'appel `getOrBuildProfile(ann, path, tier, obstacles, matchedDefenderPos, postFeinteBoost, ...)` (vers ligne 272) devient (ajouter `flipApplied` en dernier argument) :

```typescript
        s = getOrBuildProfile(
          ann, path, tier, obstacles, matchedDefenderPos, postFeinteBoost,
          velocityProfileOptions.durationSec,
          velocityProfileOptions.accelerationEnabled,
          velocityProfileOptions.acceleration,
          startFromStandstill,
          endAtStandstill,
          flipApplied,
        ).remap(actionT);
```

- [ ] **Step 5: Étendre la signature + clé de `getOrBuildProfile`** — ajouter le paramètre `flipApplied` (vers ligne 105-117) :

```typescript
  startFromStandstill?: boolean,
  endAtStandstill?: boolean,
  flipApplied?: boolean,
): VelocityProfile {
```

et inclure dans la `key` (ligne ~140), ajouter `|${flipApplied ? '1' : '0'}` à la fin :

```typescript
  const key = `${tierKey}|${obstaclesHash}|${feintesHash}|${mdpHash}|${boostKey}|${durationSec ?? 2}|${accelerationEnabled ? '1' : '0'}|${acceleration ?? 5}|${startFromStandstill ? '1' : '0'}|${endAtStandstill ? '1' : '0'}|${flipApplied ? '1' : '0'}`;
```

- [ ] **Step 6: Cas SANS profil de vitesse** — le flip doit aussi s'appliquer quand `velocityProfileOptions?.enabled` est faux (le path flippé est utilisé par `samplePolyline(path, s)` ligne ~281, qui lit `path` — déjà flippé car réassigné au Step 3). Vérifier qu'aucune autre lecture du path dans ce bloc ne reconstruit `annotationPolyline(ann)` : la seule source est la variable `path` désormais `let`. OK par construction.

- [ ] **Step 7: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 8: Suite complète** : `npx vitest run` → 1945+ PASS (rétrocompat : sans `flipSideIfDefenderOn`, comportement identique).

---

## Task 4 — Résolveur `flipDefenderFor` dans frameResolver

**Files:**
- Modify: `src/lib/logic/playback/frameResolver.ts`

- [ ] **Step 1: Fournir le résolveur** — dans la construction de `velocityProfileOptions` (près de `matchedDefenderFor`, ligne ~447), ajouter un résolveur TOUJOURS actif (pas de garde sur `state.attackerActiveDemarquage`) :

```typescript
        // Phy.O V3 V2 — résolveur dédié pour le flip de côté du cut.
        // Toujours fourni (le flip est opt-in par annotation, pas par flag global).
        flipDefenderFor: (attId) => {
          const matchups = getMatchupsAt(state.steps, idxA, state.playerCount);
          const dId = (Object.keys(matchups) as DefenderId[]).find(
            (d) => matchups[d] === attId,
          );
          if (!dId) return undefined;
          const dA = defA[dId];
          const dB = defB[dId];
          if (!dA || !dB) return undefined;
          return { x: (dA.x + dB.x) * 0.5, y: (dA.y + dB.y) * 0.5 };
        },
```

- [ ] **Step 2: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 3: Suite complète** : `npx vitest run` → tous PASS.

---

## Task 5 — Transform `setAnnotationFlipSide` (tests d'abord)

**Files:**
- Modify: `src/lib/state/transforms/annotationTransforms.ts`
- Modify/Create: `src/lib/state/transforms/__tests__/annotationTransforms.test.ts`

- [ ] **Step 1: Écrire les tests** — ajouter (ou créer le fichier avec) :

```typescript
import { describe, it, expect } from 'vitest';
import { setAnnotationFlipSide } from '@/lib/state/transforms/annotationTransforms';
import type { AppState, Annotation } from '@/lib/types';

function stateWithCut(): AppState {
  const cut: Annotation = {
    type: 'cut', fromId: 'O2', toId: null,
    from: { x: 0, y: 0 }, to: { x: 0, y: 100 },
  } as Annotation;
  return {
    steps: [{ off: {}, ballCarrier: 'O1', annotations: [cut] }],
  } as unknown as AppState;
}

describe('setAnnotationFlipSide', () => {
  it('pose le côté de flip', () => {
    const s = setAnnotationFlipSide(stateWithCut(), 0, 0, 'left');
    expect(s.steps[0].annotations[0].flipSideIfDefenderOn).toBe('left');
  });
  it('undefined efface le flip', () => {
    const s1 = setAnnotationFlipSide(stateWithCut(), 0, 0, 'right');
    const s2 = setAnnotationFlipSide(s1, 0, 0, undefined);
    expect(s2.steps[0].annotations[0].flipSideIfDefenderOn).toBeUndefined();
  });
  it('no-op si annotation absente', () => {
    const s = stateWithCut();
    expect(setAnnotationFlipSide(s, 9, 9, 'left')).toBe(s);
  });
});
```

- [ ] **Step 2: Lancer** : `npx vitest run src/lib/state/transforms/__tests__/annotationTransforms.test.ts`
  - Attendu : FAIL sur les nouveaux tests (`setAnnotationFlipSide` inexistant).

- [ ] **Step 3: Implémenter le transform** — dans annotationTransforms.ts, après `setAnnotationQuality` (modèle identique) :

```typescript
/** Phy.O V3 V2 — pose/efface le côté de flip d'un cut. */
export function setAnnotationFlipSide(
  s: AppState,
  stepIdx: number,
  annoIdx: number,
  side: 'left' | 'right' | undefined,
): AppState {
  const step = s.steps[stepIdx];
  if (!step) return s;
  const anno = step.annotations[annoIdx];
  if (!anno) return s;
  const steps = s.steps.map((st, i) =>
    i === stepIdx
      ? {
          ...st,
          annotations: st.annotations.map((a, j) =>
            j === annoIdx ? { ...a, flipSideIfDefenderOn: side } : a
          ),
        }
      : st
  );
  return { ...s, steps };
}
```

- [ ] **Step 4: Lancer** : `npx vitest run src/lib/state/transforms/__tests__/annotationTransforms.test.ts`
  - Attendu : tous PASS.

---

## Task 6 — Câblage useAppState + page.tsx

**Files:**
- Modify: `src/hooks/useAppState.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Callback dans useAppState** — près de `addFeinte` (ligne ~397), ajouter (vérifier le nom du namespace d'import : `annotationTx`) :

```typescript
  const setAnnotationFlipSide = useCallback(
    (stepIdx: number, annIdx: number, side: 'left' | 'right' | undefined) =>
      setStateWithHistory((s) => annotationTx.setAnnotationFlipSide(s, stepIdx, annIdx, side)),
    [setStateWithHistory],
  );
```

- [ ] **Step 2: Exporter** — dans l'objet retourné par le hook (près de `addFeinte,` ligne ~680) :

```typescript
    setAnnotationFlipSide,
```

- [ ] **Step 3: Câbler dans page.tsx** — où `<StepsPanel>` reçoit ses props (près de `onAddFeinte={app.addFeinte}`, ligne ~386) :

```typescript
                    onSetAnnotationFlipSide={app.setAnnotationFlipSide}
```

- [ ] **Step 4: Build check** : `npx tsc --noEmit` → 0 erreur (StepsPanel n'a pas encore la prop → erreur attendue si strict ; on l'ajoute au Task 7. Si tsc échoue ici uniquement sur cette prop, passer au Task 7 puis re-checker).

---

## Task 7 — Select tri-état dans StepsPanel

**Files:**
- Modify: `src/components/StepsPanel.tsx`

- [ ] **Step 1: Ajouter la prop au type** — dans l'interface des props (près de `onAddFeinte`, ligne ~33) :

```typescript
  onSetAnnotationFlipSide: (stepIdx: number, annIdx: number, side: 'left' | 'right' | undefined) => void;
```

- [ ] **Step 2: Ajouter le select** — dans le bloc d'annotation, à côté du checkbox sprint (vers ligne 420, juste avant `{(a.feintes ?? []).map(...)}`), visible seulement pour les cuts :

```tsx
                              {a.type === 'cut' && (
                                <label
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#cbd5e1', marginTop: 3 }}
                                  title="Phy.O V3 V2 — si le défenseur matché est de ce côté de la ligne du cut, le cut part automatiquement du côté opposé (path miroité)."
                                >
                                  flip si déf.
                                  <select
                                    value={a.flipSideIfDefenderOn ?? 'none'}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      props.onSetAnnotationFlipSide(
                                        i, index,
                                        v === 'none' ? undefined : (v as 'left' | 'right'),
                                      );
                                    }}
                                    style={{ fontSize: 10 }}
                                  >
                                    <option value="none">non</option>
                                    <option value="left">à gauche</option>
                                    <option value="right">à droite</option>
                                  </select>
                                </label>
                              )}
```

(Vérifier que `i` = stepIdx et `index` = annIdx sont bien les variables en scope, comme pour `onAddFeinte(i, index, 0.5)` ligne 460.)

- [ ] **Step 3: Build check** : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 4: Suite complète** : `npx vitest run` → tous PASS.

- [ ] **Step 5: Vérif visuelle** : `preview_start`, ouvrir, vérifier zéro erreur console (`preview_console_logs level=error`). Le select n'a d'effet visible qu'avec un cut à waypoints + défenseur du bon côté — vérif fonctionnelle couverte par les tests, ici on confirme juste que l'app charge.

---

## Task 8 — Commit + push

- [ ] **Step 1: Commit**

```bash
git add src/lib/types/index.ts \
        src/lib/logic/cutSideFlip.ts \
        src/lib/logic/__tests__/cutSideFlip.test.ts \
        src/lib/logic/playbackTrajectory.ts \
        src/lib/logic/playback/frameResolver.ts \
        src/lib/state/transforms/annotationTransforms.ts \
        src/lib/state/transforms/__tests__/annotationTransforms.test.ts \
        src/hooks/useAppState.ts \
        src/app/page.tsx \
        src/components/StepsPanel.tsx
git commit -m "feat(offense): Phy.O V3 V2 — choix de côté du cut (flip si défenseur)"
```

- [ ] **Step 2: Push** : `git push`

---

## Task 9 — Sync docs

**Files:**
- Modify: `docs/superpowers/specs/2026-05-23-cut-side-flip-RFC.md`, `CHANGELOG.md`, `ROADMAP.md`, `IDEAS.md`

- [ ] **Step 1: Marquer le RFC livré** — changer l'en-tête `Statut :` du RFC en `**🟢 LIVRÉ 2026-06-02.**`.

- [ ] **Step 2: CHANGELOG** — section `[Unreleased]`, ajouter :

```markdown
### Phy.O V3 V2 — Choix de côté du cut (2026-06-02)

`Annotation.flipSideIfDefenderOn?: 'left'|'right'`. Si le défenseur matché est
du côté spécifié de la ligne du cut, le path est miroité par symétrie axiale
autour de from→to (le cut part du côté opposé). Helper pur `cutSideFlip.ts`,
résolveur dédié `flipDefenderFor` (séparé de V3 V1), select tri-état StepsPanel.
Endpoints préservés. ~9 tests.
```

- [ ] **Step 3: ROADMAP** — dans le tableau Phy.O (ligne `Phy.O V3 V2`), passer le statut de `🟡 ⚪` à `🟢 livré 2026-06-02`.

- [ ] **Step 4: IDEAS** — si le V3 V2 est listé en piste ouverte, le marquer livré.

- [ ] **Step 5: Commit + push**

```bash
git add docs/superpowers/specs/2026-05-23-cut-side-flip-RFC.md CHANGELOG.md ROADMAP.md IDEAS.md
git commit -m "docs: Phy.O V3 V2 livré (choix de côté du cut)"
git push
```

---

## Notes d'exécution

- **Invariant Phy.O** : after chaque test, `path[0] === from` et `path[last] === to`
  exactement (le helper les ré-injecte).
- **Pas de Règle 1bis** : aucun toucher à `screens/`, `defense/*Layer.ts`,
  `baseTargets.ts`. Le `frameResolver` n'est touché que pour AJOUTER un résolveur
  (pas de modif de la math d'interpolation ni du screen freeze).
- **Rétrocompat** : sans `flipSideIfDefenderOn`, `maybeFlipCutPath` retourne le
  path d'origine par référence (`flipped=false`), clé de cache `...|0`. Zéro
  changement de comportement.
- **Reste V3 V3** (sortie tangentielle d'écran) hors scope — chantier distinct.
