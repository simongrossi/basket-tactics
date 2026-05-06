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
| `Ctrl/Cmd+Z` | Undo — restaure l'état précédent (pile cap à 50) |
| `Ctrl/Cmd+Shift+Z` ou `Ctrl/Cmd+Y` | Redo — re-applique l'état undone |

## Comportement

- **Skip auto** quand le focus est dans un champ texte : `<input>`, `<textarea>`, `<select>`, ou élément `contenteditable`. Permet de taper des labels d'étape sans déclencher les raccourcis.
- **Skip auto** quand `Ctrl`, `Cmd` ou `Alt` est enfoncé — laisse passer les raccourcis natifs (Ctrl+R rafraîchir, Cmd+L barre d'adresse, etc.). Exception : Undo/Redo (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y`) sont interceptés explicitement avant ce filtre.
- `preventDefault()` est appelé sur chaque touche gérée pour éviter que `Espace` ne scrolle la page ou que `Backspace` ne déclenche un retour navigateur.

## Ajouter un raccourci

1. Étendre le type `Handlers` dans `useKeyboardShortcuts.ts` avec un nouveau callback.
2. Ajouter le branchement dans le `handler` `keydown`.
3. Câbler le callback depuis `app/page.tsx` (passe l'action venant de `useAppState`).
4. Documenter ici.

## Limites connues

- `Suppr` supprime la **dernière** annotation, pas une annotation sélectionnée. Une vraie sélection clic + delete arrivera avec le chantier annotations richer.
- Undo/Redo : pas de coalescing pendant un drag continu (chaque mouvement de pointeur crée une entrée dans la pile). À tunir en v2.
