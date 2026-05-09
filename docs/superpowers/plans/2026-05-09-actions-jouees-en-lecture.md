# Actions jouées en lecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire en sorte que les annotations dessinées (`dribble` / `cut` / `screen` / `pass`) pilotent réellement le mouvement des joueurs en lecture, plutôt que d'être de simples dessins décoratifs.

**Architecture:** Approche B (cf. spec) — `Step.off` reste, on ajoute une invariante "1 annotation de mouvement par joueur qui bouge". Toutes les mutations passent par un module unique `stepMutations.ts`. La lecture utilise un dispatcher qui choisit la trajectoire (linéaire, wavy dribble, screen-with-pin) selon l'annotation. Migration legacy auto-générée pour scénarios existants.

**Tech Stack:** TypeScript strict, React + Next.js, Vitest pour les tests, SVG pour le rendu.

**Spec source:** [docs/superpowers/specs/2026-05-09-actions-jouees-en-lecture-design.md](../specs/2026-05-09-actions-jouees-en-lecture-design.md)

**Codebase conventions à respecter (mémoire utilisateur) :**
- Bras du joueur : tracé Bezier figé (Design F). **Ne pas modifier `Player.tsx` au-delà du paramètre `isScreening` qui ajuste le `gazeOrientation`.**
- Regard jamais derrière la tête (clamp ±90° du corps) — la logique `orientation.ts` existante le garantit, on ne la contourne pas.
- Vocabulaire métier (porteur / panier / défenseur), pas de cardinales dans les commentaires utilisateurs.
- **Commit après chaque task pour que le user voie le résultat sur `npm run dev`.**

---

## Structure des fichiers

**Créer :**
- `src/lib/logic/stepMutations.ts` — API de mutation unique (5 helpers).
- `src/lib/logic/dribbleWave.ts` — utilitaire `sampleDribbleWave(from, to, t)` extrait de `Annotations.tsx`.
- `src/lib/logic/playbackTrajectory.ts` — dispatcher `attackerTrajectoryAt`.
- `src/lib/logic/migrateAnnotations.ts` — `ensureAnnotationsForMovement`.
- `src/lib/logic/__tests__/stepMutations.test.ts`
- `src/lib/logic/__tests__/migrateAnnotations.test.ts`
- `src/lib/logic/__tests__/playbackTrajectory.test.ts`
- `src/lib/logic/__tests__/dribbleWave.test.ts`

**Modifier :**
- `src/components/Annotations.tsx` — `dribblePath` délègue à `sampleDribbleWave`.
- `src/hooks/useAppState.ts` — `moveAttacker`, `addAnnotation`, `clearAnnotationsFor`, `deleteLastAnnotation`, `deleteAnnotation` routent via `stepMutations`. Hydratation localStorage exécute migration.
- `src/lib/logic/compileScenario.ts` — appelle `ensureAnnotationsForMovement` avant retour.
- `src/lib/data/templates.ts` — appel migration au load (ou dans le caller).
- `src/components/CourtView.tsx` — playback tick + scrub utilisent `attackerTrajectoryAt`. `isScreening` propagé au `Player`.
- `src/components/Player.tsx` — accepte prop `isScreening`, override gaze vers défenseur du porteur quand actif.

---

## Phase 1 — Utilitaires purs (TDD, pas de UI)

### Task 1 : Extraire `sampleDribbleWave`

**Files:**
- Create: `src/lib/logic/dribbleWave.ts`
- Create: `src/lib/logic/__tests__/dribbleWave.test.ts`
- Modify: `src/components/Annotations.tsx`

**Contexte :** Aujourd'hui `dribblePath` (lignes 3-22 de `Annotations.tsx`) construit une chaîne SVG `path d="..."`. Pour le playback on a besoin d'**échantillonner un point sur cette wave à un `t ∈ [0, 1]`**. On extrait la formule en utilitaire pur réutilisable.

- [ ] **Step 1.1 : Écrire les tests**

Créer `src/lib/logic/__tests__/dribbleWave.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { sampleDribbleWave, dribbleWavePath } from '../dribbleWave';

describe('sampleDribbleWave', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 0 };

  it('starts at from when t=0', () => {
    expect(sampleDribbleWave(from, to, 0)).toEqual({ x: 0, y: 0 });
  });

  it('ends at to when t=1', () => {
    expect(sampleDribbleWave(from, to, 1)).toEqual({ x: 100, y: 0 });
  });

  it('progresses along the segment axis', () => {
    const p = sampleDribbleWave(from, to, 0.5);
    expect(p.x).toBeCloseTo(50, 0);
  });

  it('introduces a lateral wave (offset perpendiculaire non nul autour de t=0.25)', () => {
    const p = sampleDribbleWave(from, to, 0.25);
    expect(Math.abs(p.y)).toBeGreaterThan(0);
  });

  it('vertical segment : oscillation latérale en x', () => {
    const p = sampleDribbleWave({ x: 0, y: 0 }, { x: 0, y: 100 }, 0.25);
    expect(Math.abs(p.x)).toBeGreaterThan(0);
  });
});

describe('dribbleWavePath', () => {
  it('produces a valid SVG path string starting at from and ending at to', () => {
    const d = dribbleWavePath({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d).toMatch(/^M 0 0/);
    expect(d).toMatch(/L 100 0$/);
  });
});
```

- [ ] **Step 1.2 : Vérifier l'échec**

Run: `npx vitest run src/lib/logic/__tests__/dribbleWave.test.ts`
Expected: FAIL avec "Cannot find module '../dribbleWave'".

- [ ] **Step 1.3 : Implémenter**

Créer `src/lib/logic/dribbleWave.ts` :

```typescript
import type { Point } from '@/lib/types';

const AMPLITUDE = 5;
const WAVELENGTH = 14;

function geometry(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    dx, dy, len,
    nx: -dy / len,
    ny: dx / len,
    segs: Math.max(4, Math.round(len / WAVELENGTH)),
  };
}

/**
 * Échantillonne la position du porteur le long de la wave de dribble
 * à un instant `t ∈ [0, 1]`. Reproduit exactement la géométrie du tracé SVG.
 */
export function sampleDribbleWave(from: Point, to: Point, t: number): Point {
  if (t <= 0) return { x: from.x, y: from.y };
  if (t >= 1) return { x: to.x, y: to.y };
  const { dx, dy, nx, ny, segs } = geometry(from, to);
  const seg = t * segs;
  const i = Math.floor(seg);
  const sign = i % 2 === 0 ? -1 : 1;
  const amp = AMPLITUDE * sign;
  return {
    x: from.x + dx * t + nx * amp,
    y: from.y + dy * t + ny * amp,
  };
}

/**
 * Génère le chemin SVG `d="..."` correspondant à la wave de dribble
 * (équivalent à l'ancien `dribblePath` de Annotations.tsx).
 */
export function dribbleWavePath(from: Point, to: Point): string {
  const { dx, dy, nx, ny, segs } = geometry(from, to);
  let d = `M ${from.x} ${from.y}`;
  for (let i = 1; i < segs; i++) {
    const tt = i / segs;
    const sign = i % 2 === 0 ? 1 : -1;
    const px = from.x + dx * tt + nx * AMPLITUDE * sign;
    const py = from.y + dy * tt + ny * AMPLITUDE * sign;
    d += ` L ${px} ${py}`;
  }
  d += ` L ${to.x} ${to.y}`;
  return d;
}
```

- [ ] **Step 1.4 : Faire passer les tests**

Run: `npx vitest run src/lib/logic/__tests__/dribbleWave.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 1.5 : Refactor `Annotations.tsx` pour déléguer**

Modifier `src/components/Annotations.tsx` :
- Supprimer la fonction locale `dribblePath` (lignes 3-22).
- Importer `dribbleWavePath` : `import { dribbleWavePath } from '@/lib/logic/dribbleWave';`
- Remplacer `d={dribblePath(from, to)}` par `d={dribbleWavePath(from, to)}`.

- [ ] **Step 1.6 : Run full test suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tous les tests passent, pas d'erreur TS.

- [ ] **Step 1.7 : Commit + push**

```bash
git add src/lib/logic/dribbleWave.ts src/lib/logic/__tests__/dribbleWave.test.ts src/components/Annotations.tsx
git commit -m "refactor(annotations): extraire sampleDribbleWave + dribbleWavePath en utilitaire pur"
git push
```

---

### Task 2 : `stepMutations.ts` — `setPlayerPositionAt`

**Files:**
- Create: `src/lib/logic/stepMutations.ts`
- Create: `src/lib/logic/__tests__/stepMutations.test.ts`

**Contexte :** Premier helper de l'API de mutation. Appelé quand un attaquant est dragué à l'étape N. Met à jour `Step[N].off` ET synchronise les annotations de mouvement aval/amont selon l'invariante.

**Règles :**
- À l'étape 0 : pas d'annotation créée (pas d'étape précédente).
- À étape N ≥ 1 : crée/update annotation sur Step[N-1] dont le `to` devient `point`. Type auto : `dribble` si porteur sur Step[N-1], sinon `cut`. Si une annotation `screen` existe déjà pour ce joueur sur Step[N-1], on la conserve (on ne reclassifie pas un écran posé).
- Si Step[N] a déjà une annotation de mouvement de ce joueur (mouvement vers Step[N+1]), recaler son `from` à `point`.

- [ ] **Step 2.1 : Écrire les tests**

Créer `src/lib/logic/__tests__/stepMutations.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import type { Step, AttackerPositions, AttackerId, Point } from '@/lib/types';
import { setPlayerPositionAt } from '../stepMutations';

const ZERO: AttackerPositions = {
  O1: { x: 0, y: 0 },
  O2: { x: 100, y: 0 },
  O3: { x: 200, y: 0 },
  O4: { x: 300, y: 0 },
  O5: { x: 400, y: 0 },
};
function step(off: Partial<AttackerPositions>, ballCarrier: AttackerId = 'O1'): Step {
  return { off: { ...ZERO, ...off } as AttackerPositions, ballCarrier, annotations: [] };
}

describe('setPlayerPositionAt', () => {
  it('étape 0 : déplace mais ne crée pas d\'annotation', () => {
    const steps = [step({}), step({})];
    const out = setPlayerPositionAt(steps, 0, 'O1', { x: 50, y: 50 });
    expect(out[0].off.O1).toEqual({ x: 50, y: 50 });
    expect(out[0].annotations).toHaveLength(0);
    expect(out[1].annotations).toHaveLength(0);
  });

  it('étape 1 (joueur non-porteur) : crée une annotation cut sur étape 0', () => {
    const steps = [step({}), step({})];
    const out = setPlayerPositionAt(steps, 1, 'O2', { x: 150, y: 100 });
    expect(out[1].off.O2).toEqual({ x: 150, y: 100 });
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0]).toMatchObject({
      type: 'cut',
      fromId: 'O2',
      from: { x: 100, y: 0 },
      to: { x: 150, y: 100 },
    });
  });

  it('étape 1 (porteur sur étape 0) : crée une annotation dribble', () => {
    const steps = [step({}, 'O1'), step({})];
    const out = setPlayerPositionAt(steps, 1, 'O1', { x: 50, y: 80 });
    expect(out[0].annotations[0].type).toBe('dribble');
  });

  it('met à jour le `to` d\'une annotation de mouvement existante (pas de doublon)', () => {
    const steps: Step[] = [
      { ...step({}), annotations: [{ type: 'cut', fromId: 'O2', from: { x: 100, y: 0 }, to: { x: 120, y: 50 } }] },
      step({ O2: { x: 120, y: 50 } } as Partial<AttackerPositions>),
    ];
    const out = setPlayerPositionAt(steps, 1, 'O2', { x: 200, y: 200 });
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0].to).toEqual({ x: 200, y: 200 });
    expect(out[1].off.O2).toEqual({ x: 200, y: 200 });
  });

  it('préserve un screen existant (ne reclassifie pas en cut)', () => {
    const steps: Step[] = [
      { ...step({}), annotations: [{ type: 'screen', fromId: 'O5', from: { x: 400, y: 0 }, to: { x: 250, y: 100 } }] },
      step({ O5: { x: 250, y: 100 } } as Partial<AttackerPositions>),
    ];
    const out = setPlayerPositionAt(steps, 1, 'O5', { x: 260, y: 110 });
    expect(out[0].annotations[0].type).toBe('screen');
    expect(out[0].annotations[0].to).toEqual({ x: 260, y: 110 });
  });

  it('recale le `from` d\'une annotation aval (Step[N]) du même joueur', () => {
    const steps: Step[] = [
      step({}),
      {
        ...step({ O2: { x: 100, y: 0 } } as Partial<AttackerPositions>),
        annotations: [{ type: 'cut', fromId: 'O2', from: { x: 100, y: 0 }, to: { x: 200, y: 0 } }],
      },
      step({ O2: { x: 200, y: 0 } } as Partial<AttackerPositions>),
    ];
    const out = setPlayerPositionAt(steps, 1, 'O2', { x: 130, y: 30 });
    expect(out[1].annotations[0].from).toEqual({ x: 130, y: 30 });
    expect(out[1].annotations[0].to).toEqual({ x: 200, y: 0 });
  });
});
```

- [ ] **Step 2.2 : Vérifier l'échec**

Run: `npx vitest run src/lib/logic/__tests__/stepMutations.test.ts`
Expected: FAIL avec "Cannot find module '../stepMutations'".

- [ ] **Step 2.3 : Implémenter**

Créer `src/lib/logic/stepMutations.ts` :

```typescript
import type { Annotation, AnnotationType, AttackerId, Point, Step } from '@/lib/types';

const MOVEMENT_TYPES = new Set<AnnotationType>(['cut', 'dribble', 'screen']);

function isMovement(a: Annotation): boolean {
  return MOVEMENT_TYPES.has(a.type);
}

function findMovementIdx(annotations: Annotation[], playerId: AttackerId): number {
  return annotations.findIndex((a) => isMovement(a) && a.fromId === playerId);
}

/**
 * Déplace `playerId` à `point` dans `Step[stepIdx]` et synchronise les
 * annotations de mouvement amont (Step[stepIdx-1]) et aval (Step[stepIdx]).
 *
 * - Étape 0 : reposition initiale, aucune annotation créée.
 * - Étape ≥ 1 : crée/update annotation sur Step[N-1]. Type auto :
 *   `dribble` si porteur sur Step[N-1], `cut` sinon. Conserve un `screen` existant.
 * - Si Step[N] a une annotation de mouvement du joueur, recale son `from`.
 */
export function setPlayerPositionAt(
  steps: Step[],
  stepIdx: number,
  playerId: AttackerId,
  point: Point,
): Step[] {
  if (stepIdx < 0 || stepIdx >= steps.length) return steps;
  const out = steps.map((s) => ({ ...s, off: { ...s.off }, annotations: [...s.annotations] }));
  out[stepIdx].off[playerId] = point;

  // Amont : annotation sur Step[N-1]
  if (stepIdx >= 1) {
    const prev = out[stepIdx - 1];
    const idx = findMovementIdx(prev.annotations, playerId);
    if (idx >= 0) {
      const existing = prev.annotations[idx];
      prev.annotations[idx] = { ...existing, to: { ...point } };
    } else {
      const isCarrier = prev.ballCarrier === playerId;
      prev.annotations.push({
        type: isCarrier ? 'dribble' : 'cut',
        fromId: playerId,
        from: { ...prev.off[playerId] },
        to: { ...point },
      });
    }
  }

  // Aval : Step[N] annotation a un `from` à recaler
  const cur = out[stepIdx];
  const idxCur = findMovementIdx(cur.annotations, playerId);
  if (idxCur >= 0) {
    cur.annotations[idxCur] = { ...cur.annotations[idxCur], from: { ...point } };
  }

  return out;
}
```

- [ ] **Step 2.4 : Faire passer les tests**

Run: `npx vitest run src/lib/logic/__tests__/stepMutations.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 2.5 : Commit + push**

```bash
git add src/lib/logic/stepMutations.ts src/lib/logic/__tests__/stepMutations.test.ts
git commit -m "feat(stepMutations): setPlayerPositionAt synchronise annotations amont/aval"
git push
```

---

### Task 3 : `upsertMovementAnnotation` + `upsertPassAnnotation`

**Files:**
- Modify: `src/lib/logic/stepMutations.ts`
- Modify: `src/lib/logic/__tests__/stepMutations.test.ts`

**Contexte :** Appelée par les outils explicites (dribble, cut, screen, pass) quand l'utilisateur trace une annotation. Pour un mouvement, remplace toute annotation de mouvement existante du même joueur (contrainte 1/joueur/étape) et synchronise `Step[N+1].off`.

- [ ] **Step 3.1 : Ajouter les tests**

Append to `src/lib/logic/__tests__/stepMutations.test.ts` :

```typescript
import { upsertMovementAnnotation, upsertPassAnnotation } from '../stepMutations';

describe('upsertMovementAnnotation', () => {
  it('ajoute l\'annotation et synchronise Step[N+1].off', () => {
    const steps = [step({}), step({})];
    const out = upsertMovementAnnotation(steps, 0, {
      type: 'dribble', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 },
    });
    expect(out[0].annotations).toHaveLength(1);
    expect(out[1].off.O1).toEqual({ x: 50, y: 50 });
  });

  it('remplace une annotation de mouvement existante du même joueur', () => {
    const steps: Step[] = [
      { ...step({}), annotations: [{ type: 'cut', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 30, y: 30 } }] },
      step({ O1: { x: 30, y: 30 } } as Partial<AttackerPositions>),
    ];
    const out = upsertMovementAnnotation(steps, 0, {
      type: 'dribble', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 80, y: 80 },
    });
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0].type).toBe('dribble');
    expect(out[1].off.O1).toEqual({ x: 80, y: 80 });
  });

  it('coexiste avec une pass du même joueur', () => {
    const steps: Step[] = [
      { ...step({}), annotations: [{ type: 'pass', fromId: 'O1', toId: 'O3', from: { x: 0, y: 0 }, to: { x: 200, y: 0 } }] },
      step({}),
    ];
    const out = upsertMovementAnnotation(steps, 0, {
      type: 'dribble', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 },
    });
    expect(out[0].annotations).toHaveLength(2);
    expect(out[0].annotations.map((a) => a.type).sort()).toEqual(['dribble', 'pass']);
  });

  it('snap le `from` à la position courante du joueur', () => {
    const steps = [step({ O1: { x: 10, y: 20 } } as Partial<AttackerPositions>), step({})];
    const out = upsertMovementAnnotation(steps, 0, {
      type: 'cut', fromId: 'O1', from: { x: 999, y: 999 }, to: { x: 50, y: 50 },
    });
    expect(out[0].annotations[0].from).toEqual({ x: 10, y: 20 });
  });

  it('recale le `from` d\'une annotation de mouvement existante sur Step[N+1]', () => {
    const steps: Step[] = [
      step({}),
      {
        ...step({ O1: { x: 50, y: 50 } } as Partial<AttackerPositions>),
        annotations: [{ type: 'cut', fromId: 'O1', from: { x: 50, y: 50 }, to: { x: 200, y: 0 } }],
      },
      step({ O1: { x: 200, y: 0 } } as Partial<AttackerPositions>),
    ];
    const out = upsertMovementAnnotation(steps, 0, {
      type: 'dribble', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 80, y: 80 },
    });
    expect(out[1].annotations[0].from).toEqual({ x: 80, y: 80 });
  });
});

describe('upsertPassAnnotation', () => {
  it('ajoute la pass sans toucher aux positions', () => {
    const steps = [step({}, 'O1'), step({}, 'O1')];
    const out = upsertPassAnnotation(steps, 0, {
      type: 'pass', fromId: 'O1', toId: 'O3', from: { x: 0, y: 0 }, to: { x: 200, y: 0 },
    });
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0].type).toBe('pass');
    expect(out[1].off.O1).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 3.2 : Vérifier l'échec**

Run: `npx vitest run src/lib/logic/__tests__/stepMutations.test.ts`
Expected: FAIL avec "upsertMovementAnnotation is not exported".

- [ ] **Step 3.3 : Implémenter**

Append to `src/lib/logic/stepMutations.ts` :

```typescript
/**
 * Insère ou remplace une annotation de mouvement (cut/dribble/screen) sur Step[stepIdx].
 * - Une seule annotation de mouvement par joueur par étape (contrainte invariante).
 * - `from` est toujours snappé à la position courante du joueur.
 * - Synchronise Step[stepIdx+1].off[fromId] = anno.to.
 * - Recale le `from` d'une éventuelle annotation de mouvement aval du même joueur.
 */
export function upsertMovementAnnotation(
  steps: Step[],
  stepIdx: number,
  anno: Annotation,
): Step[] {
  if (!isMovement(anno)) return steps;
  if (stepIdx < 0 || stepIdx >= steps.length) return steps;
  const out = steps.map((s) => ({ ...s, off: { ...s.off }, annotations: [...s.annotations] }));
  const cur = out[stepIdx];
  const snappedFrom = { ...cur.off[anno.fromId] };
  const newAnno: Annotation = { ...anno, from: snappedFrom, to: { ...anno.to } };

  const existingIdx = findMovementIdx(cur.annotations, anno.fromId);
  if (existingIdx >= 0) {
    cur.annotations[existingIdx] = newAnno;
  } else {
    cur.annotations.push(newAnno);
  }

  if (stepIdx + 1 < out.length) {
    const next = out[stepIdx + 1];
    next.off[anno.fromId] = { ...newAnno.to };
    const nextIdx = findMovementIdx(next.annotations, anno.fromId);
    if (nextIdx >= 0) {
      next.annotations[nextIdx] = { ...next.annotations[nextIdx], from: { ...newAnno.to } };
    }
  }

  return out;
}

/**
 * Ajoute une annotation `pass`. N'affecte pas les positions.
 */
export function upsertPassAnnotation(
  steps: Step[],
  stepIdx: number,
  anno: Annotation,
): Step[] {
  if (anno.type !== 'pass') return steps;
  if (stepIdx < 0 || stepIdx >= steps.length) return steps;
  const out = steps.map((s) => ({ ...s, off: { ...s.off }, annotations: [...s.annotations] }));
  out[stepIdx].annotations.push({ ...anno });
  return out;
}
```

- [ ] **Step 3.4 : Faire passer les tests**

Run: `npx vitest run src/lib/logic/__tests__/stepMutations.test.ts`
Expected: PASS (12 tests cumulés).

- [ ] **Step 3.5 : Commit + push**

```bash
git add src/lib/logic/stepMutations.ts src/lib/logic/__tests__/stepMutations.test.ts
git commit -m "feat(stepMutations): upsertMovementAnnotation + upsertPassAnnotation"
git push
```

---

### Task 4 : `removeAnnotation` (avec cascade)

**Files:**
- Modify: `src/lib/logic/stepMutations.ts`
- Modify: `src/lib/logic/__tests__/stepMutations.test.ts`

**Contexte :** Suppression d'annotation. Si annotation de mouvement, le joueur "annule son mouvement" : `Step[N+1].off[player]` revient à `Step[N].off[player]`. Si une annotation de mouvement existe sur Step[N+1], son `from` est recalé.

- [ ] **Step 4.1 : Ajouter les tests**

Append to `src/lib/logic/__tests__/stepMutations.test.ts` :

```typescript
import { removeAnnotation } from '../stepMutations';

describe('removeAnnotation', () => {
  it('supprime une pass sans cascade sur les positions', () => {
    const steps: Step[] = [
      { ...step({}), annotations: [{ type: 'pass', fromId: 'O1', toId: 'O3', from: { x: 0, y: 0 }, to: { x: 200, y: 0 } }] },
      step({}),
    ];
    const out = removeAnnotation(steps, 0, 0);
    expect(out[0].annotations).toHaveLength(0);
    expect(out[1].off.O1).toEqual({ x: 0, y: 0 });
  });

  it('supprimer une dribble : Step[N+1].off snap-back à Step[N].off', () => {
    const steps: Step[] = [
      { ...step({}, 'O1'), annotations: [{ type: 'dribble', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 80, y: 80 } }] },
      step({ O1: { x: 80, y: 80 } } as Partial<AttackerPositions>),
    ];
    const out = removeAnnotation(steps, 0, 0);
    expect(out[1].off.O1).toEqual({ x: 0, y: 0 });
  });

  it('cascade : recale le `from` d\'une annotation de mouvement aval du même joueur', () => {
    const steps: Step[] = [
      { ...step({}, 'O1'), annotations: [{ type: 'dribble', fromId: 'O1', from: { x: 0, y: 0 }, to: { x: 80, y: 80 } }] },
      {
        ...step({ O1: { x: 80, y: 80 } } as Partial<AttackerPositions>, 'O1'),
        annotations: [{ type: 'dribble', fromId: 'O1', from: { x: 80, y: 80 }, to: { x: 150, y: 100 } }],
      },
      step({ O1: { x: 150, y: 100 } } as Partial<AttackerPositions>),
    ];
    const out = removeAnnotation(steps, 0, 0);
    expect(out[1].off.O1).toEqual({ x: 0, y: 0 });
    expect(out[1].annotations[0].from).toEqual({ x: 0, y: 0 });
  });

  it('idx invalide : retourne les steps inchangés', () => {
    const steps = [step({}), step({})];
    expect(removeAnnotation(steps, 0, 5)).toBe(steps);
  });
});
```

- [ ] **Step 4.2 : Vérifier l'échec**

Run: `npx vitest run src/lib/logic/__tests__/stepMutations.test.ts`
Expected: FAIL avec "removeAnnotation is not exported".

- [ ] **Step 4.3 : Implémenter**

Append to `src/lib/logic/stepMutations.ts` :

```typescript
/**
 * Supprime l'annotation à `annoIdx` sur Step[stepIdx]. Si c'est une annotation
 * de mouvement, le joueur annule son mouvement : Step[stepIdx+1].off[player] = Step[stepIdx].off[player].
 * Cascade : recale le `from` d'une annotation de mouvement aval du même joueur.
 */
export function removeAnnotation(
  steps: Step[],
  stepIdx: number,
  annoIdx: number,
): Step[] {
  if (stepIdx < 0 || stepIdx >= steps.length) return steps;
  const cur = steps[stepIdx];
  if (annoIdx < 0 || annoIdx >= cur.annotations.length) return steps;
  const removed = cur.annotations[annoIdx];
  const out = steps.map((s) => ({ ...s, off: { ...s.off }, annotations: [...s.annotations] }));
  out[stepIdx].annotations.splice(annoIdx, 1);

  if (isMovement(removed) && stepIdx + 1 < out.length) {
    const playerId = removed.fromId;
    const snapBack = { ...out[stepIdx].off[playerId] };
    out[stepIdx + 1].off[playerId] = snapBack;
    const nextIdx = findMovementIdx(out[stepIdx + 1].annotations, playerId);
    if (nextIdx >= 0) {
      out[stepIdx + 1].annotations[nextIdx] = {
        ...out[stepIdx + 1].annotations[nextIdx],
        from: snapBack,
      };
    }
  }

  return out;
}
```

- [ ] **Step 4.4 : Faire passer les tests**

Run: `npx vitest run src/lib/logic/__tests__/stepMutations.test.ts`
Expected: PASS (16 tests cumulés).

- [ ] **Step 4.5 : Commit + push**

```bash
git add src/lib/logic/stepMutations.ts src/lib/logic/__tests__/stepMutations.test.ts
git commit -m "feat(stepMutations): removeAnnotation avec snap-back et cascade"
git push
```

---

### Task 5 : Migration legacy `ensureAnnotationsForMovement`

**Files:**
- Create: `src/lib/logic/migrateAnnotations.ts`
- Create: `src/lib/logic/__tests__/migrateAnnotations.test.ts`

**Contexte :** Pour rendre les scénarios existants compatibles avec le nouveau modèle. Auto-génère une annotation `cut` (ou `dribble` pour le porteur) pour tout joueur qui bouge entre étapes sans annotation correspondante. Idempotente.

- [ ] **Step 5.1 : Écrire les tests**

Créer `src/lib/logic/__tests__/migrateAnnotations.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import type { Step, AttackerPositions, AttackerId } from '@/lib/types';
import { ensureAnnotationsForMovement } from '../migrateAnnotations';

const ZERO: AttackerPositions = {
  O1: { x: 0, y: 0 }, O2: { x: 100, y: 0 }, O3: { x: 200, y: 0 },
  O4: { x: 300, y: 0 }, O5: { x: 400, y: 0 },
};
function step(off: Partial<AttackerPositions>, ballCarrier: AttackerId = 'O1'): Step {
  return { off: { ...ZERO, ...off } as AttackerPositions, ballCarrier, annotations: [] };
}

describe('ensureAnnotationsForMovement', () => {
  it('génère une annotation cut pour un joueur non-porteur qui bouge', () => {
    const steps = [step({}, 'O1'), step({ O2: { x: 150, y: 100 } } as Partial<AttackerPositions>)];
    const out = ensureAnnotationsForMovement(steps, 5);
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0]).toMatchObject({
      type: 'cut', fromId: 'O2', from: { x: 100, y: 0 }, to: { x: 150, y: 100 },
    });
  });

  it('génère une annotation dribble pour le porteur qui bouge', () => {
    const steps = [step({}, 'O1'), step({ O1: { x: 50, y: 50 } } as Partial<AttackerPositions>, 'O1')];
    const out = ensureAnnotationsForMovement(steps, 5);
    expect(out[0].annotations[0].type).toBe('dribble');
  });

  it('ne touche pas à une annotation de mouvement existante', () => {
    const steps: Step[] = [
      { ...step({}, 'O2'), annotations: [{ type: 'screen', fromId: 'O2', from: { x: 100, y: 0 }, to: { x: 150, y: 100 } }] },
      step({ O2: { x: 150, y: 100 } } as Partial<AttackerPositions>),
    ];
    const out = ensureAnnotationsForMovement(steps, 5);
    expect(out[0].annotations).toHaveLength(1);
    expect(out[0].annotations[0].type).toBe('screen');
  });

  it('idempotente (un second appel ne change rien)', () => {
    const steps = [step({}, 'O1'), step({ O2: { x: 150, y: 100 } } as Partial<AttackerPositions>)];
    const once = ensureAnnotationsForMovement(steps, 5);
    const twice = ensureAnnotationsForMovement(once, 5);
    expect(twice[0].annotations).toEqual(once[0].annotations);
  });

  it('ignore les déplacements < 0.5px (tolérance)', () => {
    const steps = [step({}, 'O1'), step({ O2: { x: 100.2, y: 0.1 } } as Partial<AttackerPositions>)];
    const out = ensureAnnotationsForMovement(steps, 5);
    expect(out[0].annotations).toHaveLength(0);
  });

  it('skip les attaquants inactifs (playerCount=4 → ignore O5)', () => {
    const steps = [step({}, 'O1'), step({ O5: { x: 999, y: 999 } } as Partial<AttackerPositions>)];
    const out = ensureAnnotationsForMovement(steps, 4);
    expect(out[0].annotations).toHaveLength(0);
  });
});
```

- [ ] **Step 5.2 : Vérifier l'échec**

Run: `npx vitest run src/lib/logic/__tests__/migrateAnnotations.test.ts`
Expected: FAIL avec "Cannot find module '../migrateAnnotations'".

- [ ] **Step 5.3 : Implémenter**

Créer `src/lib/logic/migrateAnnotations.ts` :

```typescript
import type { Annotation, AnnotationType, AttackerId, PlayerCount, Step } from '@/lib/types';
import { isActiveAttacker } from './players';

const EPSILON = 0.5;
const MOVEMENT_TYPES = new Set<AnnotationType>(['cut', 'dribble', 'screen']);

const ATTACKER_IDS: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];

/**
 * Auto-génère les annotations de mouvement manquantes pour les scénarios legacy.
 *
 * Pour chaque transition Step[N] → Step[N+1] et chaque attaquant actif :
 * - si la position change (> EPSILON px),
 * - et qu'aucune annotation de mouvement de ce joueur n'existe sur Step[N],
 * - génère `dribble` si porteur sur Step[N], sinon `cut`.
 *
 * Idempotente. Ne touche jamais aux annotations existantes.
 */
export function ensureAnnotationsForMovement(
  steps: Step[],
  playerCount: PlayerCount,
): Step[] {
  if (steps.length < 2) return steps;
  const out = steps.map((s) => ({ ...s, annotations: [...s.annotations] }));

  for (let n = 0; n < out.length - 1; n++) {
    const cur = out[n];
    const next = out[n + 1];
    for (const id of ATTACKER_IDS) {
      if (!isActiveAttacker(id, playerCount)) continue;
      const a = cur.off[id];
      const b = next.off[id];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.hypot(dx, dy) <= EPSILON) continue;
      const hasMovement = cur.annotations.some(
        (an) => MOVEMENT_TYPES.has(an.type) && an.fromId === id,
      );
      if (hasMovement) continue;
      const type: AnnotationType = cur.ballCarrier === id ? 'dribble' : 'cut';
      const anno: Annotation = { type, fromId: id, from: { ...a }, to: { ...b } };
      cur.annotations.push(anno);
    }
  }

  return out;
}
```

- [ ] **Step 5.4 : Faire passer les tests**

Run: `npx vitest run src/lib/logic/__tests__/migrateAnnotations.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5.5 : Commit + push**

```bash
git add src/lib/logic/migrateAnnotations.ts src/lib/logic/__tests__/migrateAnnotations.test.ts
git commit -m "feat(migration): ensureAnnotationsForMovement génère annotations legacy"
git push
```

---

### Task 6 : Dispatcher de trajectoire `attackerTrajectoryAt`

**Files:**
- Create: `src/lib/logic/playbackTrajectory.ts`
- Create: `src/lib/logic/__tests__/playbackTrajectory.test.ts`

**Contexte :** Cœur de la lecture. Pour un joueur à un step donné et un `localT ∈ [0, 1]`, retourne sa position le long du segment vers Step+1. Trois trajectoires + cas idle. **Pas d'évitement d'obstacle ici** — appliqué en couche par-dessus dans `CourtView` pour `cut` uniquement.

- [ ] **Step 6.1 : Écrire les tests**

Créer `src/lib/logic/__tests__/playbackTrajectory.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import type { Step, AttackerPositions, AttackerId } from '@/lib/types';
import { attackerTrajectoryAt } from '../playbackTrajectory';

const ZERO: AttackerPositions = {
  O1: { x: 0, y: 0 }, O2: { x: 100, y: 0 }, O3: { x: 200, y: 0 },
  O4: { x: 300, y: 0 }, O5: { x: 400, y: 0 },
};
function step(off: Partial<AttackerPositions>, anns = []): Step {
  return { off: { ...ZERO, ...off } as AttackerPositions, ballCarrier: 'O1', annotations: anns };
}

describe('attackerTrajectoryAt', () => {
  it('aucune annotation : position constante = Step[N].off[player]', () => {
    const steps = [step({ O1: { x: 10, y: 20 } } as Partial<AttackerPositions>), step({ O1: { x: 10, y: 20 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O1', 0.5);
    expect(r.position).toEqual({ x: 10, y: 20 });
    expect(r.movementType).toBe('idle');
    expect(r.isScreening).toBe(false);
  });

  it('cut : interpolation linéaire au mid-point', () => {
    const ann = { type: 'cut' as const, fromId: 'O2' as AttackerId, from: { x: 100, y: 0 }, to: { x: 200, y: 100 } };
    const steps = [step({}, [ann] as any), step({ O2: { x: 200, y: 100 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O2', 0.5);
    expect(r.position.x).toBeCloseTo(150, 5);
    expect(r.position.y).toBeCloseTo(50, 5);
    expect(r.movementType).toBe('cut');
  });

  it('dribble : position sur la wave (offset latéral non nul à t=0.25)', () => {
    const ann = { type: 'dribble' as const, fromId: 'O1' as AttackerId, from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const steps = [step({}, [ann] as any), step({ O1: { x: 100, y: 0 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O1', 0.25);
    expect(Math.abs(r.position.y)).toBeGreaterThan(0);
    expect(r.movementType).toBe('dribble');
  });

  it('screen : à localT=0.5, position = to ; isScreening=true', () => {
    const ann = { type: 'screen' as const, fromId: 'O5' as AttackerId, from: { x: 400, y: 0 }, to: { x: 250, y: 100 } };
    const steps = [step({}, [ann] as any), step({ O5: { x: 250, y: 100 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O5', 0.5);
    expect(r.position).toEqual({ x: 250, y: 100 });
    expect(r.isScreening).toBe(true);
  });

  it('screen : à localT=0.25 (avant mi-segment), interpole à mi-chemin de A→B', () => {
    const ann = { type: 'screen' as const, fromId: 'O5' as AttackerId, from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const steps = [step({}, [ann] as any), step({ O5: { x: 100, y: 0 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O5', 0.25);
    expect(r.position.x).toBeCloseTo(50, 5);
    expect(r.isScreening).toBe(false);
  });

  it('screen : à localT=0.75, pinned en to ; isScreening=true', () => {
    const ann = { type: 'screen' as const, fromId: 'O5' as AttackerId, from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const steps = [step({}, [ann] as any), step({ O5: { x: 100, y: 0 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O5', 0.75);
    expect(r.position).toEqual({ x: 100, y: 0 });
    expect(r.isScreening).toBe(true);
  });

  it('dernier step (pas de Step[N+1]) : position figée', () => {
    const steps = [step({ O1: { x: 50, y: 50 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O1', 0.5);
    expect(r.position).toEqual({ x: 50, y: 50 });
    expect(r.movementType).toBe('idle');
  });
});
```

- [ ] **Step 6.2 : Vérifier l'échec**

Run: `npx vitest run src/lib/logic/__tests__/playbackTrajectory.test.ts`
Expected: FAIL avec "Cannot find module '../playbackTrajectory'".

- [ ] **Step 6.3 : Implémenter**

Créer `src/lib/logic/playbackTrajectory.ts` :

```typescript
import type { Annotation, AnnotationType, AttackerId, Point, Step } from '@/lib/types';
import { sampleDribbleWave } from './dribbleWave';

export type MovementType = 'cut' | 'dribble' | 'screen' | 'idle';

export interface PlaybackTrajectory {
  position: Point;
  movementType: MovementType;
  isScreening: boolean;
}

const MOVEMENT_TYPES = new Set<AnnotationType>(['cut', 'dribble', 'screen']);

function findMovementAnnotation(step: Step, playerId: AttackerId): Annotation | null {
  return step.annotations.find(
    (a) => MOVEMENT_TYPES.has(a.type) && a.fromId === playerId,
  ) ?? null;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Pour le joueur `playerId` au step `stepIdx`, calcule sa position pendant
 * le segment vers Step[stepIdx+1] à `localT ∈ [0, 1]`.
 *
 * Trajectoires :
 * - aucune annotation de mouvement → idle (position constante).
 * - `cut` → ligne droite from → to.
 * - `dribble` → wave échantillonnée via sampleDribbleWave.
 * - `screen` → vitesse double pour atteindre `to` à t=0.5, puis pinned ; isScreening=true à partir de t=0.5.
 *
 * NB : aucune logique d'évitement d'obstacles ici. CourtView l'applique en
 * couche pour `cut` uniquement.
 */
export function attackerTrajectoryAt(
  steps: Step[],
  stepIdx: number,
  playerId: AttackerId,
  localT: number,
): PlaybackTrajectory {
  const cur = steps[stepIdx];
  const fallback = cur.off[playerId];
  if (stepIdx + 1 >= steps.length) {
    return { position: { ...fallback }, movementType: 'idle', isScreening: false };
  }
  const ann = findMovementAnnotation(cur, playerId);
  if (!ann) {
    return { position: { ...fallback }, movementType: 'idle', isScreening: false };
  }
  const t = Math.max(0, Math.min(1, localT));
  if (ann.type === 'cut') {
    return { position: lerp(ann.from, ann.to, t), movementType: 'cut', isScreening: false };
  }
  if (ann.type === 'dribble') {
    return { position: sampleDribbleWave(ann.from, ann.to, t), movementType: 'dribble', isScreening: false };
  }
  if (ann.type === 'screen') {
    if (t < 0.5) {
      return { position: lerp(ann.from, ann.to, t * 2), movementType: 'screen', isScreening: false };
    }
    return { position: { ...ann.to }, movementType: 'screen', isScreening: true };
  }
  return { position: { ...fallback }, movementType: 'idle', isScreening: false };
}
```

- [ ] **Step 6.4 : Faire passer les tests**

Run: `npx vitest run src/lib/logic/__tests__/playbackTrajectory.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6.5 : Run full test suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tout vert, pas d'erreur TS.

- [ ] **Step 6.6 : Commit + push**

```bash
git add src/lib/logic/playbackTrajectory.ts src/lib/logic/__tests__/playbackTrajectory.test.ts
git commit -m "feat(playback): attackerTrajectoryAt dispatcher cut/dribble/screen"
git push
```

---

## Phase 2 — Wiring UI : mutations

### Task 7 : Router `useAppState` via `stepMutations`

**Files:**
- Modify: `src/hooks/useAppState.ts`

**Contexte :** Réécrire les actions du hook pour qu'elles passent par `stepMutations`. Conserve la sémantique `manualOverride` (si le step provient du scénario, on le marque édité).

- [ ] **Step 7.1 : Lire le contexte actuel**

Read `src/hooks/useAppState.ts:185-310` pour comprendre `moveAttacker`, `addAnnotation`, `clearAnnotationsFor`, `deleteLastAnnotation`, `deleteAnnotation`.

- [ ] **Step 7.2 : Ajouter l'import**

En haut de `src/hooks/useAppState.ts`, ajouter :

```typescript
import {
  setPlayerPositionAt,
  upsertMovementAnnotation,
  upsertPassAnnotation,
  removeAnnotation as removeAnnotationFromSteps,
} from '@/lib/logic/stepMutations';
```

- [ ] **Step 7.3 : Réécrire `moveAttacker`**

Remplacer le bloc `moveAttacker` (lignes 192-203) par :

```typescript
const moveAttacker = useCallback((id: AttackerId, x: number, y: number) => {
  setStateWithHistory((s) => {
    const steps = setPlayerPositionAt(s.steps, s.activeStep, id, { x, y });
    // Préserver la sémantique manualOverride si le step venait du scénario
    if (s.activeStep > 0 && steps[s.activeStep].generatedBy) {
      const next = [...steps];
      next[s.activeStep] = { ...next[s.activeStep], manualOverride: true };
      return { ...s, steps: next };
    }
    return { ...s, steps };
  });
}, []);
```

- [ ] **Step 7.4 : Réécrire `addAnnotation`**

Remplacer le bloc `addAnnotation` (lignes 251-263) par :

```typescript
const addAnnotation = useCallback((annotation: Annotation) => {
  setStateWithHistory((s) => {
    let steps: Step[];
    if (annotation.type === 'pass') {
      steps = upsertPassAnnotation(s.steps, s.activeStep, annotation);
      // Conserver l'effet de bord existant : passe → ballCarrier change
      if (annotation.toId) {
        steps = steps.map((st, i) =>
          i === s.activeStep ? { ...st, ballCarrier: annotation.toId! } : st,
        );
      }
    } else {
      steps = upsertMovementAnnotation(s.steps, s.activeStep, annotation);
    }
    if (s.activeStep > 0 && steps[s.activeStep].generatedBy) {
      const next = [...steps];
      next[s.activeStep] = { ...next[s.activeStep], manualOverride: true };
      return { ...s, steps: next };
    }
    return { ...s, steps };
  });
}, []);
```

- [ ] **Step 7.5 : Réécrire `clearAnnotationsFor`**

Remplacer le bloc `clearAnnotationsFor` (lignes 276-284) par :

```typescript
const clearAnnotationsFor = useCallback((oId: AttackerId) => {
  setStateWithHistory((s) => {
    let steps = s.steps;
    const cur = steps[s.activeStep];
    if (!cur) return s;
    // Supprimer en partant de la fin pour préserver les indices
    const indices = cur.annotations
      .map((a, i) => (a.fromId === oId ? i : -1))
      .filter((i) => i >= 0)
      .reverse();
    for (const idx of indices) {
      steps = removeAnnotationFromSteps(steps, s.activeStep, idx);
    }
    return { ...s, steps };
  });
}, []);
```

- [ ] **Step 7.6 : Réécrire `deleteLastAnnotation` et `deleteAnnotation`**

Remplacer les blocs `deleteLastAnnotation` (lignes 286-294) et `deleteAnnotation` (lignes 296-307) par :

```typescript
const deleteLastAnnotation = useCallback(() => {
  setStateWithHistory((s) => {
    const cur = s.steps[s.activeStep];
    if (!cur || cur.annotations.length === 0) return s;
    const steps = removeAnnotationFromSteps(s.steps, s.activeStep, cur.annotations.length - 1);
    return { ...s, steps };
  });
}, []);

const deleteAnnotation = useCallback((idx: number) => {
  setStateWithHistory((s) => {
    const cur = s.steps[s.activeStep];
    if (!cur || idx < 0 || idx >= cur.annotations.length) return s;
    const steps = removeAnnotationFromSteps(s.steps, s.activeStep, idx);
    return { ...s, steps };
  });
}, []);
```

- [ ] **Step 7.7 : Run typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: pas d'erreur TS, tous les tests passent.

- [ ] **Step 7.8 : Commit + push**

```bash
git add src/hooks/useAppState.ts
git commit -m "refactor(useAppState): router moveAttacker/addAnnotation/delete via stepMutations"
git push
```

---

### Task 8 : Hook migration aux points d'entrée

**Files:**
- Modify: `src/lib/logic/compileScenario.ts`
- Modify: `src/hooks/useAppState.ts`

**Contexte :** Faire tourner `ensureAnnotationsForMovement` à 3 endroits : sortie de `compileScenario`, hydratation localStorage, et chargement de template (LibraryModal). Pour les templates, l'appel se fait dans `useAppState` au moment où le template est appliqué.

- [ ] **Step 8.1 : Patcher `compileScenario`**

Modifier `src/lib/logic/compileScenario.ts`. En haut du fichier, ajouter l'import :

```typescript
import { ensureAnnotationsForMovement } from './migrateAnnotations';
```

À la **toute fin** de la fonction `compileScenario` (juste avant `return result;`), ajouter :

```typescript
// Auto-générer annotations pour les déplacements générés par les actions
// scriptées (cut/dribble selon ball-carrier). Idempotent.
return ensureAnnotationsForMovement(result, /* playerCount */ 5);
```

(Note : compileScenario n'a pas accès direct à `playerCount` — toujours 5 dans ce contexte. Si jamais besoin, ajouter au `CompileInput` ; pour l'instant c'est OK puisque les scripted actions opèrent sur 5 joueurs par défaut.)

- [ ] **Step 8.2 : Localiser le point d'entrée localStorage / templates dans `useAppState`**

Run: `grep -n "loadTemplate\|hydrate\|localStorage\|setSteps" /Users/simongrossi/github/basket-tactics/.claude/worktrees/angry-newton-dca474/src/hooks/useAppState.ts | head -30`

Identifier la fonction qui applique un template (probablement quelque chose comme `applyTemplate` ou `loadFromLibrary`). Si le hook expose une fonction qui injecte un `steps: Step[]` dans le state, c'est elle qu'il faut patcher.

- [ ] **Step 8.3 : Wrapper l'application de template**

À chaque endroit où `useAppState` injecte des steps depuis un template ou depuis localStorage, wrapper par `ensureAnnotationsForMovement(steps, s.playerCount)`. Exemple si une fonction `applyTemplate(template)` existe :

```typescript
const applyTemplate = useCallback((template: Template) => {
  setStateWithHistory((s) => {
    const migrated = ensureAnnotationsForMovement(template.steps, s.playerCount);
    return { ...s, steps: migrated, /* autres champs */ };
  });
}, []);
```

Et pour l'hydratation initiale localStorage (probablement dans un `useEffect` ou directement dans `useState((init) => ...)` au sommet), wrapper de la même façon.

Ajouter l'import en haut du fichier :

```typescript
import { ensureAnnotationsForMovement } from '@/lib/logic/migrateAnnotations';
```

- [ ] **Step 8.4 : Run tests + typecheck + smoke test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tout vert.

Démarrer dev : `npm run dev` puis vérifier dans le navigateur :
- Charger un template legacy (ex. Spain PNR) depuis la bibliothèque.
- Ouvrir le panneau Attaque sur l'étape 1 → l'annotation auto-générée doit apparaître dans la liste.

- [ ] **Step 8.5 : Commit + push**

```bash
git add src/lib/logic/compileScenario.ts src/hooks/useAppState.ts
git commit -m "feat(migration): auto-générer annotations pour scénarios legacy au load"
git push
```

---

## Phase 3 — Lecture (playback)

### Task 9 : Plug `attackerTrajectoryAt` dans la lecture CourtView

**Files:**
- Modify: `src/components/CourtView.tsx`

**Contexte :** Remplacer l'interpolation linéaire des attaquants (`CourtView.tsx:160-194`) par un appel au dispatcher. Garder l'évitement d'obstacles **uniquement pour `cut`** ou idle (pas pour dribble : on suit le tracé tel quel ; pas pour screen : trajectoire courte).

- [ ] **Step 9.1 : Lire l'existant**

Read `src/components/CourtView.tsx:140-310` pour voir précisément le code de lecture (tick + scrub).

- [ ] **Step 9.2 : Ajouter l'import**

En haut de `src/components/CourtView.tsx` :

```typescript
import { attackerTrajectoryAt, type MovementType } from '@/lib/logic/playbackTrajectory';
```

- [ ] **Step 9.3 : Réécrire la boucle d'interpolation des attaquants (tick)**

Dans le `tick` du `setInterval` (autour de la ligne 160), remplacer la boucle `attackerIds.forEach((id) => { ... let p = lerp ... obstacle avoidance ... })` par :

```typescript
const movementTypeById: Record<AttackerId, MovementType> = {} as any;
const isScreeningById: Partial<Record<AttackerId, boolean>> = {};
attackerIds.forEach((id) => {
  const traj = attackerTrajectoryAt(cur.steps, idxA, id, localT);
  movementTypeById[id] = traj.movementType;
  isScreeningById[id] = traj.isScreening;
  let p = traj.position;
  // L'évitement d'obstacles n'est appliqué qu'à `cut` ou idle (pas dribble : on
  // suit le tracé ondulé ; pas screen : trajectoire courte délibérée).
  if (traj.movementType === 'cut' || traj.movementType === 'idle') {
    const obstacles: { center: Point; radius: number; defenderToSkip: DefenderId }[] = [];
    attackerIds.forEach((other) => {
      if (other === id) return;
      obstacles.push({
        center: { x: (offA[other].x + offB[other].x) / 2, y: (offA[other].y + offB[other].y) / 2 },
        radius: radiusObstacle,
        defenderToSkip: 'D1' as DefenderId,
      });
    });
    defenderIds.forEach((dId) => {
      obstacles.push({
        center: { x: (defA[dId].x + defB[dId].x) / 2, y: (defA[dId].y + defB[dId].y) / 2 },
        radius: radiusObstacle,
        defenderToSkip: 'D1' as DefenderId,
      });
    });
    const blocking = pickBlockingCluster(traj.position, traj.position, obstacles);
    // Note: pour cut, on conserve la courbe d'évitement basée sur from/to du segment
    if (blocking) {
      p = curveAroundObstacle(offA[id], offB[id], blocking.center, blocking.radius, localT);
    }
  }
  off[id] = p;
});
```

(Adapter à la structure exacte du tick existant — il y a sans doute des pré-calculs partagés à conserver.)

- [ ] **Step 9.4 : Propager `isScreening` au render `Player`**

Dans le rendu des attaquants au sein de `CourtView.tsx` (chercher `<Player ` pour les attaquants — autour de la ligne 980+), ajouter la prop :

```tsx
<Player
  // ... props existantes
  isScreening={state.isPlaying ? isScreeningById[id] : undefined}
/>
```

(`isScreeningById` doit être propagé au scope du render. Le moyen le plus simple : le stocker dans le `playFrame` state — ajouter `isScreeningById` au type `PlaybackFrame` et le set dans le tick.)

- [ ] **Step 9.5 : Refaire la même intégration dans le scrub (`scrubFrame`)**

Chercher la section `Scrub frame` autour de la ligne 351. Appliquer le même pattern : appeler `attackerTrajectoryAt` au lieu de l'interpolation linéaire, propager `isScreening`.

- [ ] **Step 9.6 : Run typecheck**

Run: `npx tsc --noEmit`
Expected: pas d'erreur TS.

- [ ] **Step 9.7 : Smoke test**

Run: `npm run dev`, charger un template existant (ex. Spain PNR), lancer la lecture :
- Le porteur doit suivre une trajectoire ondulée (dribble).
- Les coupeurs doivent suivre des lignes droites (cut).
- Aucun joueur ne doit faire un saut brusque.

- [ ] **Step 9.8 : Commit + push**

```bash
git add src/components/CourtView.tsx
git commit -m "feat(playback): trajectoire des attaquants pilotée par les annotations"
git push
```

---

### Task 10 : Posture d'écran dans `Player.tsx`

**Files:**
- Modify: `src/components/Player.tsx`
- Modify: `src/components/CourtView.tsx`

**Contexte :** Quand `isScreening === true`, le poseur regarde le défenseur du porteur. Bras inchangés (Design F figé — règle inviolable). Le `gazeOrientation` est l'angle en degrés du regard ; on l'override seulement quand isScreening est true et qu'on a une cible (défenseur du porteur, info disponible via `frame.screen` ou `frame.offBallScreens`).

- [ ] **Step 10.1 : Lire la signature actuelle de `Player`**

Read `src/components/Player.tsx` pour identifier la prop d'orientation actuelle (probablement `gazeOrientation` ou similaire).

- [ ] **Step 10.2 : Ajouter la prop `isScreening`**

Dans `Player.tsx`, ajouter à l'interface des props :

```typescript
/**
 * Si true, le joueur est en posture d'écran posé : son `gazeOrientation`
 * doit pointer vers le défenseur ciblé. Le caller passe l'orientation déjà
 * calculée — ce composant ne fait pas de logique de calcul.
 * Bras inchangés (Design F figé).
 */
isScreening?: boolean;
```

(Note : le calcul de l'angle vers le défenseur du porteur se fait dans `CourtView` qui a accès à `frame.screen.carrierDef`. Le `Player` reçoit déjà un `gazeOrientation` ; le caller le surcharge avant render quand `isScreening`.)

- [ ] **Step 10.3 : Calcul de l'override gaze dans CourtView**

Dans `CourtView.tsx`, au moment de rendre les attaquants, pour chaque attaquant en `isScreening === true`, calculer un `gazeOrientation` ciblé sur la position du défenseur du porteur :

```typescript
import { angleDegBetween } from '@/lib/logic/geometry';
// (vérifier si cette fonction existe ; sinon, calcul inline)

// Dans le render des attaquants :
const screenerGazeOverride = (id: AttackerId): number | undefined => {
  if (!isScreeningById[id]) return undefined;
  if (!frame.screen) return undefined;
  const carrierDef = frame.screen.carrierDef;
  const target = frame.defPos[carrierDef];
  if (!target) return undefined;
  const screenerPos = frame.off[id];
  const dx = target.x - screenerPos.x;
  const dy = target.y - screenerPos.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};
```

Puis lors du render `<Player>` :

```tsx
const override = screenerGazeOverride(id);
<Player
  // ... props existantes
  gazeOrientation={override !== undefined ? override : computedGaze}
  isScreening={isScreeningById[id]}
/>
```

(Le but : si on ne trouve pas de défenseur du porteur — ex. screen off-ball — on laisse le gaze par défaut. La règle "regard jamais derrière le corps" est appliquée par `orientation.ts` côté caller — ne pas court-circuiter.)

- [ ] **Step 10.4 : Run typecheck**

Run: `npx tsc --noEmit`
Expected: pas d'erreur TS.

- [ ] **Step 10.5 : Smoke test**

`npm run dev`. Créer un step avec une annotation `screen` (outil écran). Lancer la lecture :
- Le poseur arrive à mi-segment puis tient sa position.
- Son regard pointe vers le défenseur du porteur (visible via la flèche de regard si activée dans les overlays).
- Bras inchangés (Design F).

- [ ] **Step 10.6 : Commit + push**

```bash
git add src/components/Player.tsx src/components/CourtView.tsx
git commit -m "feat(player): posture d'écran — gaze vers le défenseur du porteur"
git push
```

---

## Phase 4 — Vérification globale

### Task 11 : Test de non-régression complet

**Files:** aucune modification, vérification seulement.

- [ ] **Step 11.1 : Lancer toute la suite Vitest**

Run: `npx vitest run`
Expected: tous les tests verts (84 existants + ~20 nouveaux). Si certains tests existants échouent à cause de la migration auto, investiguer cas par cas. Probable que des tests de `compileScenario` ou de `scriptedGenerators` voient des annotations en plus — adapter les assertions ou marquer la nouvelle annotation comme attendue.

- [ ] **Step 11.2 : Typecheck strict**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 11.3 : Smoke test manuel — scénarios représentatifs**

`npm run dev`, ouvrir le navigateur et vérifier :

1. **Scratch** : créer un scénario from scratch.
   - Étape 1 : tracer un dribble O1 A→B avec l'outil dribble. Lecture : O1 suit la wave et arrive en B.
   - Étape 2 (créée) : tracer un cut O3 X→Y. Lecture : O3 va en ligne droite à Y.
   - Étape 3 : outil écran, tracer O5 P→Q. Lecture : O5 atteint Q à mi-segment, regarde le défenseur du porteur, tient.

2. **Drag pur** : sur une nouvelle étape, drag un attaquant. Vérifier que l'annotation auto apparaît (cut ou dribble selon porteur) dans le panneau Attaque.

3. **Suppression** : supprimer une annotation via le `×` du panneau. Vérifier que le joueur snap-back à sa position de l'étape précédente sur la timeline.

4. **Templates legacy** : charger Spain PNR, Floppy, UCLA. Vérifier que la lecture reproduit fidèlement les déplacements (avec ondulation pour le porteur grâce à la migration).

5. **Undo / redo** : faire un drag, undo. Vérifier que l'annotation auto-créée est aussi annulée.

- [ ] **Step 11.4 : Commit final si fixes**

Si des tests existants ont nécessité des ajustements, commit séparé :

```bash
git add -u
git commit -m "test: ajuster snapshots existants pour annotations migrées"
git push
```

- [ ] **Step 11.5 : Mettre à jour le CHANGELOG**

Append to `CHANGELOG.md` une entrée du jour :

```markdown
## 2026-05-09

### feat: actions jouées en lecture
- Annotations dribble / cut / screen pilotent réellement la trajectoire des joueurs en lecture.
- Drag joueur = annotation implicite (cut ou dribble selon porteur).
- Écran : poseur arrive à mi-segment puis tient sa posture.
- Migration legacy auto-générée pour templates et scripted actions.
- Spec : [docs/superpowers/specs/2026-05-09-actions-jouees-en-lecture-design.md](docs/superpowers/specs/2026-05-09-actions-jouees-en-lecture-design.md)
```

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): actions jouées en lecture"
git push
```

---

## Self-review notes

- Spec coverage vérifiée : invariante (Task 2-4), API mutation (Task 2-4), dispatcher (Task 6), drag UX (Task 7), tools routing (Task 7), suppression (Task 7), migration (Task 5+8), playback (Task 9-10), tests (Tasks 1-6 + 11).
- YAGNI respecté : pas de support courbes (mentionné comme futur), pas de chained actions, pas d'annotation defensive, pas de détection auto de screen à la migration.
- Ordre TDD : utilitaires purs d'abord (1-6), puis wiring UI (7-10), puis vérif globale (11). Chaque task indépendante, tests verts à chaque commit.
- Risques identifiés dans la spec sont matérialisés en tests : cascade de suppression (Task 4), idempotence migration (Task 5), invariants après mutations (Tasks 2-4).
