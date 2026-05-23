# Phy.O V4 V2 — UI feintes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI pour poser/éditer/retirer les feintes sur les annotations `cut`/`dribble` depuis `StepsPanel`, + marker visuel SVG sur le path.

**Architecture:** 3 transforms purs (add/update/remove feinte) câblés via `useAppState`. UI : sous-bloc dans la liste d'annotations supprimables du `StepsPanel` (sliders + `×` + bouton `+`). Marker SVG : cercle jaune-orangé à `samplePolyline(path, tFeinte)` dans `Annotations.tsx`.

**Tech Stack:** TypeScript, React, SVG, Vitest.

**Pré-requis :** Phy.O V4 V1 backend livré (`Annotation.feintes?: number[]`).

---

### Task 1: Transforms `addFeinte` / `updateFeinte` / `removeFeinte` (TDD)

**Files:**
- Modify: `src/lib/state/transforms/annotationTransforms.ts`
- Create: `src/lib/state/transforms/__tests__/feintes.test.ts`

- [ ] **Step 1: Write the failing tests**

Créer `src/lib/state/transforms/__tests__/feintes.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import {
  addAnnotation,
  addFeinte,
  removeFeinte,
  updateFeinte,
} from '../annotationTransforms';

function stateWithCut() {
  const s = makeInitialState();
  return addAnnotation(s, {
    type: 'cut',
    fromId: 'O1',
    from: { x: 0, y: 0 },
    to: { x: 100, y: 0 },
  });
}

describe('feintes transforms', () => {
  it('addFeinte initialise feintes à [t] si absent', () => {
    const s = stateWithCut();
    const out = addFeinte(s, s.activeStep, 0, 0.5);
    expect(out.steps[s.activeStep].annotations[0].feintes).toEqual([0.5]);
    // entrée non mutée
    expect(s.steps[s.activeStep].annotations[0].feintes).toBeUndefined();
  });

  it('addFeinte clampe t à [0, 1]', () => {
    const s = stateWithCut();
    let out = addFeinte(s, s.activeStep, 0, -0.5);
    expect(out.steps[s.activeStep].annotations[0].feintes).toEqual([0]);
    out = addFeinte(s, s.activeStep, 0, 1.5);
    expect(out.steps[s.activeStep].annotations[0].feintes).toEqual([0, 1]);
  });

  it('updateFeinte change la position sans toucher les autres', () => {
    let s = stateWithCut();
    s = addFeinte(s, s.activeStep, 0, 0.3);
    s = addFeinte(s, s.activeStep, 0, 0.7);
    const out = updateFeinte(s, s.activeStep, 0, 0, 0.4);
    expect(out.steps[s.activeStep].annotations[0].feintes).toEqual([0.4, 0.7]);
  });

  it('removeFeinte retire l\'index donné', () => {
    let s = stateWithCut();
    s = addFeinte(s, s.activeStep, 0, 0.2);
    s = addFeinte(s, s.activeStep, 0, 0.5);
    s = addFeinte(s, s.activeStep, 0, 0.8);
    const out = removeFeinte(s, s.activeStep, 0, 1);
    expect(out.steps[s.activeStep].annotations[0].feintes).toEqual([0.2, 0.8]);
  });

  it('annotation index invalide → no-op', () => {
    const s = stateWithCut();
    expect(addFeinte(s, s.activeStep, 99, 0.5)).toBe(s);
    expect(updateFeinte(s, s.activeStep, 99, 0, 0.5)).toBe(s);
    expect(removeFeinte(s, s.activeStep, 99, 0)).toBe(s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run feintes`
Expected: FAIL — `addFeinte` etc. n'existent pas.

- [ ] **Step 3: Implementation**

Dans `src/lib/state/transforms/annotationTransforms.ts`, ajouter à la fin
du fichier (après les transforms existants) :

```ts
/** Phy.O V4 — Helper interne : mute les feintes de l'annotation `annIdx`
 *  du step `stepIdx`. La mutation passe par `mut` qui reçoit le tableau
 *  courant (ou [] si absent) et renvoie le nouveau. Inputs non mutés. */
function setAnnotationFeintes(
  state: AppState,
  stepIdx: number,
  annIdx: number,
  mut: (feintes: number[]) => number[],
): AppState {
  const step = state.steps[stepIdx];
  if (!step) return state;
  const ann = step.annotations[annIdx];
  if (!ann) return state;
  const current = ann.feintes ?? [];
  const next = mut(current);
  const newAnn = { ...ann, feintes: next };
  const newAnns = step.annotations.map((a, i) => (i === annIdx ? newAnn : a));
  const steps = state.steps.map((s, i) =>
    i === stepIdx ? { ...s, annotations: newAnns } : s,
  );
  return { ...state, steps };
}

/** Phy.O V4 — Ajoute une feinte à l'annotation. t clampé à [0, 1]. */
export function addFeinte(
  state: AppState,
  stepIdx: number,
  annIdx: number,
  t: number,
): AppState {
  const tClamped = Math.max(0, Math.min(1, t));
  return setAnnotationFeintes(state, stepIdx, annIdx, (fs) => [...fs, tClamped]);
}

/** Phy.O V4 — Met à jour la position d'une feinte. t clampé à [0, 1]. */
export function updateFeinte(
  state: AppState,
  stepIdx: number,
  annIdx: number,
  feinteIdx: number,
  t: number,
): AppState {
  const tClamped = Math.max(0, Math.min(1, t));
  return setAnnotationFeintes(state, stepIdx, annIdx, (fs) =>
    fs.map((v, i) => (i === feinteIdx ? tClamped : v)),
  );
}

/** Phy.O V4 — Retire la feinte d'index donné. */
export function removeFeinte(
  state: AppState,
  stepIdx: number,
  annIdx: number,
  feinteIdx: number,
): AppState {
  return setAnnotationFeintes(state, stepIdx, annIdx, (fs) =>
    fs.filter((_, i) => i !== feinteIdx),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run feintes`
Expected: PASS (5 tests).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/state/transforms/annotationTransforms.ts src/lib/state/transforms/__tests__/feintes.test.ts
git commit -m "feat(transforms): Phy.O V4 V2 — addFeinte / updateFeinte / removeFeinte"
```

---

### Task 2: Câblage `useAppState`

**Files:**
- Modify: `src/hooks/useAppState.ts`

- [ ] **Step 1: Exposer les setters**

Dans `src/hooks/useAppState.ts`, à côté des autres setters d'annotations,
ajouter :

```ts
  const addFeinte = useCallback(
    (stepIdx: number, annIdx: number, t: number) => {
      setStateWithHistory((s) => annotationTx.addFeinte(s, stepIdx, annIdx, t));
    },
    [setStateWithHistory],
  );
  const updateFeinte = useCallback(
    (stepIdx: number, annIdx: number, feinteIdx: number, t: number) => {
      setStateWithHistory((s) => annotationTx.updateFeinte(s, stepIdx, annIdx, feinteIdx, t));
    },
    [setStateWithHistory],
  );
  const removeFeinte = useCallback(
    (stepIdx: number, annIdx: number, feinteIdx: number) => {
      setStateWithHistory((s) => annotationTx.removeFeinte(s, stepIdx, annIdx, feinteIdx));
    },
    [setStateWithHistory],
  );
```

Ajouter à l'objet retourné par le hook (à côté de `addAnnotation` etc.) :

```ts
    addFeinte,
    updateFeinte,
    removeFeinte,
```

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAppState.ts
git commit -m "feat(useAppState): Phy.O V4 V2 — câblage feintes transforms"
```

---

### Task 3: UI feintes dans `StepsPanel`

**Files:**
- Modify: `src/components/StepsPanel.tsx`

- [ ] **Step 1: Étendre les props**

Dans `src/components/StepsPanel.tsx`, ajouter à l'interface de props
(près de `onDeleteAnnotation`) :

```ts
  onAddFeinte: (stepIdx: number, annIdx: number, t: number) => void;
  onUpdateFeinte: (stepIdx: number, annIdx: number, feinteIdx: number, t: number) => void;
  onRemoveFeinte: (stepIdx: number, annIdx: number, feinteIdx: number) => void;
```

Extraire de `props` aux côtés de `onDeleteAnnotation`.

- [ ] **Step 2: Insérer le sous-bloc feintes dans la liste d'annotations**

Repérer le bloc qui rend chaque ligne d'annotation supprimable (~ligne 333,
le `visibleAnnotations.map(...)`). Dans le `<div key={ai}>` qui contient
les infos + bouton `×`, juste APRÈS la balise fermante `</div>` de cette
ligne, et toujours dans le `.map`, ajouter un sous-bloc conditionnel pour
les annotations `cut` ou `dribble` :

```tsx
                          </div>
                          {(a.type === 'cut' || a.type === 'dribble') && (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 3,
                                marginLeft: 18,
                                marginBottom: 3,
                                fontSize: 10,
                                color: '#9ca3af',
                              }}
                            >
                              {(a.feintes ?? []).map((tF, fi) => (
                                <div
                                  key={fi}
                                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                  <span style={{ minWidth: 40 }}>feinte {fi + 1}</span>
                                  <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={tF}
                                    onChange={(e) =>
                                      props.onUpdateFeinte(realIdx, index, fi, parseFloat(e.target.value))
                                    }
                                    style={{ flex: 1 }}
                                    title={`Position de la feinte : ${(tF * 100).toFixed(0)}% de l'arc`}
                                  />
                                  <span style={{ minWidth: 30, textAlign: 'right' }}>
                                    {(tF * 100).toFixed(0)}%
                                  </span>
                                  <button
                                    onClick={() => props.onRemoveFeinte(realIdx, index, fi)}
                                    title="Supprimer cette feinte"
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#dc2626',
                                      cursor: 'pointer',
                                      fontSize: 11,
                                      padding: '0 2px',
                                      lineHeight: 1,
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => props.onAddFeinte(realIdx, index, 0.5)}
                                title="Ajouter une feinte à la moitié de l'arc"
                                style={{
                                  alignSelf: 'flex-start',
                                  padding: '2px 6px',
                                  fontSize: 10,
                                  background: 'transparent',
                                  border: '1px solid #94a3b8',
                                  borderRadius: 3,
                                  color: '#cbd5e1',
                                  cursor: 'pointer',
                                }}
                              >
                                + feinte
                              </button>
                            </div>
                          )}
```

(`realIdx` est l'index du step réel, déjà disponible dans le scope —
vérifier le nom exact. Si différent, l'adapter.)

- [ ] **Step 3: Vérifier le caller de `<StepsPanel>` dans `Page`**

Dans `src/app/page.tsx`, repérer l'appel à `<StepsPanel>` et passer les
3 nouveaux callbacks (à côté de `onDeleteAnnotation`) :

```tsx
              onAddFeinte={app.addFeinte}
              onUpdateFeinte={app.updateFeinte}
              onRemoveFeinte={app.removeFeinte}
```

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/StepsPanel.tsx src/app/page.tsx
git commit -m "feat(ui): Phy.O V4 V2 — sliders feintes dans StepsPanel"
```

---

### Task 4: Marker visuel dans `Annotations.tsx`

**Files:**
- Modify: `src/components/Annotations.tsx`

- [ ] **Step 1: Importer `samplePolyline`**

En tête de `src/components/Annotations.tsx`, ajouter (ou compléter l'import
existant) :

```ts
import { polylinePath, samplePolyline } from '@/lib/logic/polyline';
```

(`polylinePath` est déjà importé ; ajouter `samplePolyline`.)

- [ ] **Step 2: Rendre les markers dans les branches cut/dribble**

Dans `AnnotationView`, pour les branches `cut` et `dribble` qui rendent un
`<polyline>` ou un `<path>`, ajouter en SVG (à la fin du rendu de chaque
branche, juste avant la fermeture du `<g>` ou du fragment) :

```tsx
        {(annotation.feintes ?? []).map((tF, fi) => {
          const pts = annotationPoints(annotation);
          const pos = samplePolyline(pts, tF);
          return (
            <circle
              key={`feinte-${fi}`}
              cx={pos.x}
              cy={pos.y}
              r={4}
              fill="#fbbf24"
              stroke="#92400e"
              strokeWidth={1}
              opacity={preview ? 0.5 : 0.95}
              pointerEvents="none"
            />
          );
        })}
```

Ajouter ce bloc dans les DEUX branches (`cut` à la ligne ~65-90 et
`dribble` à la ligne ~89-110 — vérifier les bornes exactes).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: full suite verte (~1737 = 1732 V4 V1 baseline + 5 nouveaux
feintes transforms).

Run: `npx vitest run screens overlap userJson screenLab`
Expected: 164 verts.

- [ ] **Step 4: Commit**

```bash
git add src/components/Annotations.tsx
git commit -m "feat(ui): Phy.O V4 V2 — marker visuel des feintes sur le path"
```

---

### Task 5: Validation + ROADMAP

- [ ] **Step 1: Update ROADMAP**

Dans `ROADMAP.md`, section `Phase Phy.O`. Remplacer la ligne V4 V2 par :

```
| ~~Phy.O V4 V2~~ | ~~**UI feintes**~~ : sliders par feinte dans StepsPanel (position 0..100% par tranche de 5%), bouton `+ feinte`, bouton `×` par feinte, marker SVG jaune-orangé sur le path. Transforms purs add/update/remove. | — | — | — | 🟢 V2 livré 2026-05-23 (5 tests) |
```

- [ ] **Step 2: Commit + push**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): Phy.O V4 V2 (UI feintes) livré"
git push
```

---

## Notes

- **Backend déjà câblé** (V4 V1 commit `87803da`) — les transforms posent les
  données, le moteur les consomme déjà via `getOrBuildProfile`.
- **Opt-in inchangé** — sans `attackerVelocityProfileEnabled`, la UI est
  visible mais le profil de vitesse n'est jamais construit donc les feintes
  posées n'ont aucun effet visuel sur la lecture. Acceptable (data only).
