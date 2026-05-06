# Raccourcis clavier

Implémentation : [`src/hooks/useKeyboardShortcuts.ts`](../src/hooks/useKeyboardShortcuts.ts), monté une fois dans `app/page.tsx`.

## Bindings

| Touche | Action |
|--------|--------|
| `Espace` | Play / Pause |
| `←` | Étape précédente |
| `→` | Étape suivante |
| `M` | Outil **move** (déplacer) |
| `P` | Outil **pass** (passe) |
| `D` | Outil **dribble** |
| `R` | Outil **cut** (couRse) |
| `E` | Outil **screen** (Écran) |
| `Suppr` ou `Backspace` | Supprime la dernière annotation de l'étape active |

## Comportement

- **Skip auto** quand le focus est dans un champ texte : `<input>`, `<textarea>`, `<select>`, ou élément `contenteditable`. Permet de taper des labels d'étape sans déclencher les raccourcis.
- **Skip auto** quand `Ctrl`, `Cmd` ou `Alt` est enfoncé — laisse passer les raccourcis natifs (Ctrl+R rafraîchir, Cmd+L barre d'adresse, etc.).
- `preventDefault()` est appelé sur chaque touche gérée pour éviter que `Espace` ne scrolle la page ou que `Backspace` ne déclenche un retour navigateur.

## Ajouter un raccourci

1. Étendre le type `Handlers` dans `useKeyboardShortcuts.ts` avec un nouveau callback.
2. Ajouter le branchement dans le `handler` `keydown`.
3. Câbler le callback depuis `app/page.tsx` (passe l'action venant de `useAppState`).
4. Documenter ici.

## Limites connues

- Pas de support des chords (Ctrl+Z, Ctrl+Y) — undo/redo sera ajouté avec son propre stack et son propre câblage.
- `Suppr` supprime la **dernière** annotation, pas une annotation sélectionnée. Une vraie sélection clic + delete arrivera avec le chantier annotations richer.
