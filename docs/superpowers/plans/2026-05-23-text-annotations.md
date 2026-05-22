# A.3 — Annotations texte libres — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au coach de déposer des notes texte libres sur le terrain (« trap si le 5 monte », « force baseline ») via un nouvel outil `note`, avec édition et suppression au clic.

**Architecture:** Nouvelle entité `TextNote` séparée d'`Annotation` (aucune traversée des moteurs trajectoire/défense/playback). Stockage `step.textNotes`. Création/édition par popup HTML ancré au clic (pattern menus contextuels). Trois transforms purs câblés dans `useAppState` → undo/redo et persistance gratuits.

**Tech Stack:** TypeScript, React, SVG, Vitest. Réutilise les patterns existants : `setStateWithHistory`, transforms purs, `OffenseToolsPanel`, `useCourtPointerHandlers`.

---

### Task 1: Types + transforms purs

**Files:**
- Modify: `src/lib/types/index.ts`
- Create: `src/lib/state/transforms/textNoteTransforms.ts`
- Create: `src/lib/state/transforms/__tests__/textNoteTransforms.test.ts`

- [ ] **Step 1: Étendre les types**

Dans `src/lib/types/index.ts`, juste avant `export interface Step` (~ligne 114), ajouter :

```ts
/** A.3 — Note texte libre déposée sur le terrain. Purement visuelle :
 *  ne traverse aucun moteur (trajectoire, défense, playback). */
export interface TextNote {
  /** Ancrage sur le terrain (coordonnées court). */
  pos: Point;
  /** Contenu de la note. */
  text: string;
}
```

Dans le corps de `export interface Step` (n'importe où parmi les champs optionnels), ajouter :

```ts
  /** A.3 — Notes texte libres déposées sur le terrain. Optionnel :
   *  absent = aucune note (rétrocompat). */
  textNotes?: TextNote[];
```

Remplacer la définition `Tool` (ligne 776) :

```ts
export type Tool = 'move' | 'pass' | 'dribble' | 'cut' | 'screen' | 'text';
```

Run `npx tsc --noEmit` — doit rester clean.

- [ ] **Step 2: Write the failing test**

Créer `src/lib/state/transforms/__tests__/textNoteTransforms.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import {
  addTextNote,
  updateTextNote,
  removeTextNote,
} from '../textNoteTransforms';

describe('textNoteTransforms', () => {
  it('addTextNote — initialise textNotes si absent et ajoute la note', () => {
    const s = makeInitialState();
    expect(s.steps[0].textNotes).toBeUndefined();
    const out = addTextNote(s, 0, { pos: { x: 100, y: 200 }, text: 'trap si le 5 monte' });
    expect(out.steps[0].textNotes).toEqual([
      { pos: { x: 100, y: 200 }, text: 'trap si le 5 monte' },
    ]);
    // entrée non mutée
    expect(s.steps[0].textNotes).toBeUndefined();
  });

  it('addTextNote — ajoute à la suite des notes existantes', () => {
    const s1 = addTextNote(makeInitialState(), 0, { pos: { x: 10, y: 10 }, text: 'A' });
    const s2 = addTextNote(s1, 0, { pos: { x: 20, y: 20 }, text: 'B' });
    expect(s2.steps[0].textNotes).toEqual([
      { pos: { x: 10, y: 10 }, text: 'A' },
      { pos: { x: 20, y: 20 }, text: 'B' },
    ]);
  });

  it("updateTextNote — change le texte sans toucher la position", () => {
    const s = addTextNote(makeInitialState(), 0, { pos: { x: 50, y: 60 }, text: 'old' });
    const out = updateTextNote(s, 0, 0, 'new');
    expect(out.steps[0].textNotes![0]).toEqual({ pos: { x: 50, y: 60 }, text: 'new' });
  });

  it("removeTextNote — retire l'index donné", () => {
    let s = addTextNote(makeInitialState(), 0, { pos: { x: 1, y: 1 }, text: 'A' });
    s = addTextNote(s, 0, { pos: { x: 2, y: 2 }, text: 'B' });
    s = addTextNote(s, 0, { pos: { x: 3, y: 3 }, text: 'C' });
    const out = removeTextNote(s, 0, 1);
    expect(out.steps[0].textNotes).toEqual([
      { pos: { x: 1, y: 1 }, text: 'A' },
      { pos: { x: 3, y: 3 }, text: 'C' },
    ]);
  });

  it('stepIdx invalide → no-op (renvoie l\'état tel quel)', () => {
    const s = makeInitialState();
    expect(addTextNote(s, 99, { pos: { x: 0, y: 0 }, text: 'X' })).toBe(s);
    expect(updateTextNote(s, 99, 0, 'X')).toBe(s);
    expect(removeTextNote(s, 99, 0)).toBe(s);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run textNoteTransforms`
Expected: FAIL — `textNoteTransforms` module introuvable.

- [ ] **Step 4: Write the implementation**

Créer `src/lib/state/transforms/textNoteTransforms.ts` :

```ts
// A.3 — Transforms pour les notes texte libres déposées sur le terrain.
// Toutes les fonctions sont pures (AppState → AppState).

import type { AppState, TextNote } from '@/lib/types';

function setStepTextNotes(
  state: AppState,
  stepIdx: number,
  mut: (notes: TextNote[]) => TextNote[],
): AppState {
  const step = state.steps[stepIdx];
  if (!step) return state;
  const current = step.textNotes ?? [];
  const next = mut(current);
  const steps = state.steps.map((s, i) =>
    i === stepIdx ? { ...s, textNotes: next } : s,
  );
  return { ...state, steps };
}

/** Ajoute une note à l'étape `stepIdx`. Initialise `textNotes` si absent. */
export function addTextNote(state: AppState, stepIdx: number, note: TextNote): AppState {
  return setStepTextNotes(state, stepIdx, (notes) => [...notes, note]);
}

/** Met à jour le texte de la note d'index `noteIdx`. Position inchangée. */
export function updateTextNote(
  state: AppState,
  stepIdx: number,
  noteIdx: number,
  text: string,
): AppState {
  return setStepTextNotes(state, stepIdx, (notes) =>
    notes.map((n, i) => (i === noteIdx ? { ...n, text } : n)),
  );
}

/** Retire la note d'index `noteIdx` à l'étape `stepIdx`. */
export function removeTextNote(
  state: AppState,
  stepIdx: number,
  noteIdx: number,
): AppState {
  return setStepTextNotes(state, stepIdx, (notes) =>
    notes.filter((_, i) => i !== noteIdx),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run textNoteTransforms`
Expected: PASS (5 tests).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/index.ts src/lib/state/transforms/textNoteTransforms.ts src/lib/state/transforms/__tests__/textNoteTransforms.test.ts
git commit -m "feat(types): A.3 — TextNote + transforms purs (add/update/remove)"
```

---

### Task 2: useAppState wiring + outil `text` + raccourci clavier

**Files:**
- Modify: `src/hooks/useAppState.ts`
- Modify: `src/components/OffenseToolsPanel.tsx`
- Modify: `src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: Câbler les transforms dans `useAppState`**

Dans `src/hooks/useAppState.ts`, dans la section des imports en tête du fichier, ajouter :

```ts
import * as textNoteTx from '@/lib/state/transforms/textNoteTransforms';
import type { TextNote } from '@/lib/types';
```

(Si `TextNote` doit s'ajouter à un import existant `from '@/lib/types'`, le fusionner avec.)

Juste après la définition de `addAnnotation` (~ligne 353), ajouter :

```ts
  const addTextNote = useCallback((stepIdx: number, note: TextNote) => {
    setStateWithHistory((s) => textNoteTx.addTextNote(s, stepIdx, note));
  }, [setStateWithHistory]);

  const updateTextNote = useCallback(
    (stepIdx: number, noteIdx: number, text: string) => {
      setStateWithHistory((s) => textNoteTx.updateTextNote(s, stepIdx, noteIdx, text));
    },
    [setStateWithHistory],
  );

  const removeTextNote = useCallback((stepIdx: number, noteIdx: number) => {
    setStateWithHistory((s) => textNoteTx.removeTextNote(s, stepIdx, noteIdx));
  }, [setStateWithHistory]);
```

Dans l'objet retourné par le hook (chercher la ligne `addAnnotation,` près de la fin, ~ligne 650), ajouter à la suite :

```ts
    addAnnotation,
    addTextNote,
    updateTextNote,
    removeTextNote,
```

Run `npx tsc --noEmit` — doit rester clean.

- [ ] **Step 2: Ajouter l'outil `text` dans `OffenseToolsPanel`**

Dans `src/components/OffenseToolsPanel.tsx`, étendre le tableau `TOOLS` (~ligne 14) :

```ts
const TOOLS: { value: Tool; label: string }[] = [
  { value: 'move', label: 'déplacer' },
  { value: 'pass', label: 'passe' },
  { value: 'dribble', label: 'dribble' },
  { value: 'cut', label: 'course' },
  { value: 'screen', label: 'écran' },
  { value: 'text', label: 'note' },
];
```

Dans la fonction `ToolIcon`, juste avant la dernière `case` (`'screen'`, ~ligne 51), ajouter le bloc `'text'`. Le détail visuel exact n'est pas critique — une lettre `T` dans un cadre suffit. À insérer dans le `switch (tool)` :

```tsx
    case 'text':
      return (
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
          <rect x={1} y={2} width={14} height={12} rx={2}
                fill="none" stroke={color} strokeWidth={1.5}/>
          <text x={8} y={11} textAnchor="middle"
                fontSize={9} fontWeight={700} fill={color}>T</text>
        </svg>
      );
```

Run `npx tsc --noEmit` — doit rester clean.

- [ ] **Step 3: Ajouter le raccourci `T`**

Dans `src/hooks/useKeyboardShortcuts.ts`, étendre `TOOL_KEYS` (~ligne 14) :

```ts
const TOOL_KEYS: Record<string, Tool> = {
  m: 'move',
  p: 'pass',
  d: 'dribble',
  r: 'cut',
  e: 'screen',
  t: 'text',
};
```

Run `npx tsc --noEmit` — clean.

- [ ] **Step 4: Run the regression suites**

Run: `npx vitest run`
Expected: PASS sur l'intégralité (aucun test ne devrait changer ; on n'a fait qu'ajouter des sorties optionnelles et un nouveau membre du type `Tool`).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAppState.ts src/components/OffenseToolsPanel.tsx src/hooks/useKeyboardShortcuts.ts
git commit -m "feat(ui): A.3 — outil 'note' + raccourci T + câblage useAppState"
```

---

### Task 3: Géométrie partagée + rendu SVG

**Files:**
- Create: `src/components/court/textNoteGeometry.ts`
- Create: `src/components/court/TextNotesLayer.tsx`

- [ ] **Step 1: Helper de géométrie partagé**

Créer `src/components/court/textNoteGeometry.ts` :

```ts
// A.3 — Géométrie partagée entre TextNotesLayer (rendu SVG) et le pointer
// handler (hit-test pour le clic d'édition). Une seule source de vérité
// pour le bounding rect d'une note.

import type { TextNote } from '@/lib/types';

export const TEXT_NOTE_HEIGHT_PX = 22;
export const TEXT_NOTE_PADDING_PX = 6;
export const TEXT_NOTE_MIN_WIDTH_PX = 40;
const CHAR_WIDTH_PX = 7;

/** Largeur du bounding rect d'une note, approximée à partir de la longueur
 *  du texte (mesure SVG exacte = trop coûteuse pour V1). */
export function textNoteWidth(text: string): number {
  return Math.max(
    TEXT_NOTE_MIN_WIDTH_PX,
    text.length * CHAR_WIDTH_PX + TEXT_NOTE_PADDING_PX * 2,
  );
}

/** Renvoie l'index de la note la plus haute dans la pile (last-added) dont
 *  le bounding rect contient `point`, ou null. Itère en ordre inverse pour
 *  privilégier la note rendue par-dessus en cas de chevauchement. */
export function hitTestTextNote(
  point: { x: number; y: number },
  notes: TextNote[],
): number | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    const w = textNoteWidth(n.text);
    const h = TEXT_NOTE_HEIGHT_PX;
    if (
      point.x >= n.pos.x - w / 2 &&
      point.x <= n.pos.x + w / 2 &&
      point.y >= n.pos.y - h / 2 &&
      point.y <= n.pos.y + h / 2
    ) {
      return i;
    }
  }
  return null;
}
```

- [ ] **Step 2: Couche SVG de rendu**

Créer `src/components/court/TextNotesLayer.tsx` :

```tsx
import type { TextNote } from '@/lib/types';
import {
  TEXT_NOTE_HEIGHT_PX,
  textNoteWidth,
} from './textNoteGeometry';

interface Props {
  notes: TextNote[];
}

/** Rendu SVG des notes texte. `pointerEvents="none"` : les clics traversent
 *  vers le pointer handler du SVG, qui gère le hit-test lui-même via
 *  `hitTestTextNote` (une seule source de vérité). */
export function TextNotesLayer({ notes }: Props) {
  return (
    <g pointerEvents="none">
      {notes.map((note, idx) => {
        const w = textNoteWidth(note.text);
        const h = TEXT_NOTE_HEIGHT_PX;
        return (
          <g
            key={idx}
            transform={`translate(${note.pos.x - w / 2}, ${note.pos.y - h / 2})`}
          >
            <rect
              x={0}
              y={0}
              width={w}
              height={h}
              rx={4}
              ry={4}
              fill="rgba(255,255,255,0.88)"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={1}
            />
            <text
              x={w / 2}
              y={h / 2 + 4}
              textAnchor="middle"
              fontSize={12}
              fill="#111"
            >
              {note.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: aucune sortie. Les fichiers sont autonomes (encore sans consommateurs ; le câblage CourtView arrive à la tâche 4).

- [ ] **Step 4: Commit**

```bash
git add src/components/court/textNoteGeometry.ts src/components/court/TextNotesLayer.tsx
git commit -m "feat(court): A.3 — géométrie partagée + TextNotesLayer (rendu)"
```

---

### Task 4: Popup HTML + pointer handler + intégration CourtView

**Files:**
- Create: `src/components/court/TextNotePopup.tsx`
- Modify: `src/hooks/useCourtPointerHandlers.ts`
- Modify: `src/components/CourtView.tsx`

- [ ] **Step 1: Composant popup HTML**

Créer `src/components/court/TextNotePopup.tsx` :

```tsx
import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Position viewport (clientX/clientY) où ancrer le popup. */
  screen: { x: number; y: number };
  /** Texte initial (vide pour création). */
  initialText: string;
  /** Vrai en mode édition d'une note existante : affiche le bouton `×`. */
  isEditing: boolean;
  /** Soumission. Le caller décide : texte non vide → addTextNote /
   *  updateTextNote ; texte vide → équivalent suppression (gérée par
   *  onCancel pour la création, onDelete pour l'édition). */
  onSubmit: (text: string) => void;
  /** Suppression explicite (bouton `×` ou texte vide en édition). */
  onDelete: () => void;
  /** Annulation (Échap, ou clic extérieur avec texte vide en création). */
  onCancel: () => void;
}

export function TextNotePopup({
  screen,
  initialText,
  isEditing,
  onSubmit,
  onDelete,
  onCancel,
}: Props) {
  const [text, setText] = useState(initialText);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Focus automatique à l'ouverture.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Fermeture au clic extérieur. Le listener est posé après le pointerdown
  // d'ouverture (effet exécuté après render) — aucun conflit.
  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        const trimmed = text.trim();
        if (isEditing) {
          // Édition : vide = supprime ; sinon submit.
          if (trimmed) onSubmit(trimmed);
          else onDelete();
        } else {
          // Création : vide = annule ; sinon submit.
          if (trimmed) onSubmit(trimmed);
          else onCancel();
        }
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [isEditing, onCancel, onDelete, onSubmit, text]);

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        left: screen.x,
        top: screen.y,
        zIndex: 1000,
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.2)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        borderRadius: 6,
        padding: 6,
        display: 'flex',
        gap: 4,
        alignItems: 'center',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="note…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const trimmed = text.trim();
            if (isEditing && !trimmed) onDelete();
            else if (trimmed) onSubmit(trimmed);
            else onCancel();
          } else if (e.key === 'Escape') {
            onCancel();
          }
        }}
        style={{
          minWidth: 180,
          padding: '4px 6px',
          fontSize: 13,
          border: '1px solid #ccc',
          borderRadius: 4,
        }}
      />
      {isEditing && (
        <button
          type="button"
          onClick={onDelete}
          title="Supprimer la note"
          style={{
            padding: '2px 8px',
            cursor: 'pointer',
            color: '#b00',
            background: 'transparent',
            border: 'none',
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Branche outil `text` dans le pointer handler**

Dans `src/hooks/useCourtPointerHandlers.ts`, étendre l'interface `UseCourtPointerHandlersOptions` avec deux nouveaux champs :

```ts
  /** A.3 — Notes texte de l'étape courante (pour hit-test au clic). */
  textNotes?: import('@/lib/types').TextNote[];
  /** A.3 — Appelé quand l'utilisateur clique sur le terrain avec l'outil
   *  `text` actif. `noteIdx === null` → création ; sinon édition de la
   *  note d'index donné. */
  onTextToolClick?: (payload: {
    courtPos: { x: number; y: number };
    screenPos: { x: number; y: number };
    noteIdx: number | null;
  }) => void;
```

Dans le corps de `useCourtPointerHandlers`, ajouter l'extraction des deux options à côté des autres :

```ts
    textNotes,
    onTextToolClick,
```

Ajouter l'import en tête du fichier :

```ts
import { hitTestTextNote } from '@/components/court/textNoteGeometry';
```

Dans `onPointerDown`, **tout au début** (juste après la garde initiale `if (isPlaying) return;` ou équivalent — sinon en première position après les `const` initiaux), insérer la branche :

```ts
    // A.3 — Outil 'note' : tout clic ouvre le popup (création si zone vide,
    // édition si on tape sur une note existante). Court-circuite les autres
    // chemins (drag joueur, tracé d'annotation).
    if (state.tool === 'text' && onTextToolClick) {
      const courtPos = svgPoint(e);
      const noteIdx = textNotes ? hitTestTextNote(courtPos, textNotes) : null;
      onTextToolClick({
        courtPos,
        screenPos: { x: e.clientX, y: e.clientY },
        noteIdx,
      });
      return;
    }
```

Adapter la liste de dépendances du `useCallback` de `onPointerDown` pour inclure `state.tool`, `textNotes`, `onTextToolClick`, `svgPoint` (si pas déjà présents).

Run `npx tsc --noEmit` — clean.

- [ ] **Step 3: Câbler dans CourtView**

Dans `src/components/CourtView.tsx` :

3a. **Imports** — ajouter en tête du fichier :

```ts
import { TextNotesLayer } from '@/components/court/TextNotesLayer';
import { TextNotePopup } from '@/components/court/TextNotePopup';
import type { TextNote, Point } from '@/lib/types';
```

(Fusionner avec les imports existants si déjà présents pour `Point`.)

3b. **Nouvelles props** — étendre l'interface des props de `CourtView` (chercher l'`interface` ou `type` de props ; le fichier en a une dédiée) avec :

```ts
  onAddTextNote: (stepIdx: number, note: TextNote) => void;
  onUpdateTextNote: (stepIdx: number, noteIdx: number, text: string) => void;
  onRemoveTextNote: (stepIdx: number, noteIdx: number) => void;
```

Les extraire dans le `function CourtView(props: Props)` aux côtés des autres callbacks.

3c. **État local du popup** — à l'intérieur du composant, près des autres `useState` :

```tsx
  // A.3 — État du popup d'édition de note. null = fermé.
  const [textPopup, setTextPopup] = useState<{
    mode: 'create' | 'edit';
    courtPos: Point;
    screenPos: { x: number; y: number };
    noteIdx: number | null;
    initialText: string;
  } | null>(null);

  // Fermer le popup quand l'utilisateur change d'outil.
  useEffect(() => {
    if (state.tool !== 'text') setTextPopup(null);
  }, [state.tool]);
```

(Si `useEffect` / `useState` ne sont pas déjà importés depuis `react`, les ajouter.)

3d. **Notes courantes** — déterminer les notes à afficher (étape active hors lecture, étape courante en lecture). En s'inspirant de la logique d'affichage existante des annotations (`state.steps[state.activeStep]`), juste avant le `return` :

```tsx
  const currentTextNotes: TextNote[] =
    state.steps[state.activeStep]?.textNotes ?? [];
```

3e. **Passer les options au pointer handler** — repérer l'appel à `useCourtPointerHandlers({...})` et ajouter aux options :

```ts
    textNotes: currentTextNotes,
    onTextToolClick: ({ courtPos, screenPos, noteIdx }) => {
      if (noteIdx === null) {
        setTextPopup({
          mode: 'create',
          courtPos,
          screenPos,
          noteIdx: null,
          initialText: '',
        });
      } else {
        const note = currentTextNotes[noteIdx];
        setTextPopup({
          mode: 'edit',
          courtPos: note.pos,
          screenPos,
          noteIdx,
          initialText: note.text,
        });
      }
    },
```

3f. **Rendre la couche** — dans le JSX, à la fin des enfants du `<svg>` (après les joueurs, pour que les notes apparaissent par-dessus), ajouter :

```tsx
        <TextNotesLayer notes={currentTextNotes} />
```

3g. **Rendre le popup** — en dehors du `<svg>`, dans le wrapper retourné par `CourtView` (le terrain est typiquement dans un `<div>` parent), conditionnellement :

```tsx
        {textPopup && (
          <TextNotePopup
            screen={textPopup.screenPos}
            initialText={textPopup.initialText}
            isEditing={textPopup.mode === 'edit'}
            onSubmit={(text) => {
              if (textPopup.mode === 'create') {
                props.onAddTextNote(state.activeStep, { pos: textPopup.courtPos, text });
              } else if (textPopup.noteIdx !== null) {
                props.onUpdateTextNote(state.activeStep, textPopup.noteIdx, text);
              }
              setTextPopup(null);
            }}
            onDelete={() => {
              if (textPopup.mode === 'edit' && textPopup.noteIdx !== null) {
                props.onRemoveTextNote(state.activeStep, textPopup.noteIdx);
              }
              setTextPopup(null);
            }}
            onCancel={() => setTextPopup(null)}
          />
        )}
```

3h. **Page de plus haut niveau** — dans `src/app/page.tsx` (qui consomme `useAppState` et passe les callbacks à `CourtView`), chercher l'endroit où `app.addAnnotation` est passé à `<CourtView ...>` et ajouter à la suite :

```tsx
              onAddTextNote={app.addTextNote}
              onUpdateTextNote={app.updateTextNote}
              onRemoveTextNote={app.removeTextNote}
```

Si la simulation page (`src/app/simulation/page.tsx`) utilise aussi `CourtView` avec un appel direct, ajouter les mêmes props là également.

- [ ] **Step 4: Verify typecheck and full suite**

Run: `npx tsc --noEmit`
Expected: aucune sortie.

Run: `npx vitest run`
Expected: PASS sur l'intégralité — aucune logique existante n'a changé (les notes sont une couche additive). En cas d'échec, investiguer avant de continuer.

- [ ] **Step 5: Smoke test manuel (avant commit)**

`npm run dev`, puis dans le navigateur :
1. Cliquer sur l'outil « note » ou taper `T`.
2. Cliquer sur une zone vide du terrain — un popup s'ouvre avec un champ texte focalisé.
3. Saisir « trap si le 5 monte » + `Entrée` → une note apparaît à l'endroit cliqué.
4. Recliquer sur la note (outil note actif) → le popup se rouvre pré-rempli.
5. Modifier le texte + `Entrée` → le texte de la note change.
6. Recliquer sur la note → cliquer le bouton `×` → la note disparaît.
7. `Ctrl/Cmd+Z` → la note réapparaît (undo).

Si une de ces étapes ne fonctionne pas, NE PAS commiter — diagnostiquer.

- [ ] **Step 6: Commit**

```bash
git add src/components/court/TextNotePopup.tsx src/hooks/useCourtPointerHandlers.ts src/components/CourtView.tsx src/app/page.tsx
# Ajouter src/app/simulation/page.tsx si modifié.
git commit -m "feat(court): A.3 — popup, pointer handler, intégration CourtView"
```

---

### Task 5: Validation finale + ROADMAP

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Run the full suite**

Run: `npx vitest run`
Expected: PASS sur l'intégralité, avec ~5 nouveaux tests (transforms) en plus du baseline.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: aucune sortie.

- [ ] **Step 3: Update ROADMAP**

Dans `ROADMAP.md`, repérer la ligne du chantier A.3 (commence par `| ~~A.3~~` après la livraison de la session 2026-05-22 ; sinon `| A.3 | Annotations texte libres`). La remplacer par :

```
| ~~A.3~~ | ~~**Annotations texte libres**~~ : nouvelle entité `TextNote` (séparée d'`Annotation`), outil `note` + raccourci `T`, popup HTML d'édition au clic, suppression au `×`. Stocké dans `step.textNotes`, undo/persistance gratuits. | — | — | 🟢 livré 2026-05-23 |
```

Mettre à jour également, plus haut dans le fichier, la table de synthèse `UX / Produit — N chantiers restants` : retirer la ligne `8 | Annotations texte libres` (ou la barrer comme A.2 et B.2 ont été).

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): A.3 — annotations texte libres livré"
```

---

## Notes de fin de plan

- **Aucune traversée de moteur.** Les notes vivent dans `step.textNotes` et ne
  sont lues que par `TextNotesLayer`. Aucun moteur (trajectoire, défense,
  playback, PDF) ne les consomme — zéro risque de régression sur le pipeline.
- **Géométrie centralisée.** `textNoteGeometry.ts` est la source de vérité du
  bounding rect d'une note ; `TextNotesLayer` (rendu) et `useCourtPointerHandlers`
  (hit-test) le consomment tous les deux. Pas de divergence visuel ↔ click.
- **Hors périmètre V1.** Pas d'export PDF (`StepThumbnail`/`pdfRecap`) des
  notes, pas de drag pour repositionner, pas de style riche. Follow-ups
  éventuels si demande.
