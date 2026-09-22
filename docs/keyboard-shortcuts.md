# Raccourcis clavier et équivalents tactiles

Implémentation : [`src/hooks/useKeyboardShortcuts.ts`](../src/hooks/useKeyboardShortcuts.ts),
monté une fois dans `app/page.tsx`. **Un seul gestionnaire** (U03, 2026-09-22) :
la fonction pure `resolveShortcut(touche, focus, contexte)` traduit chaque
touche en **une seule action**, selon la vue, le mode et le focus. Aucun autre
composant n'écoute les flèches ni Espace.

## Contexte

| Mode | Quand |
|---|---|
| `edit` | Éditeur, vue Terrain |
| `player` | Mode lecteur (présentation pas-à-pas, déroulé de séance) |
| `present` | Plein écran match |

Aucun raccourci global quand :
- la vue affichée n'est pas le terrain (Bibliothèque, Séances, Paramètres…) ;
- une fenêtre modale est ouverte (`[aria-modal="true"]`) ;
- le focus est dans un champ de saisie (`input` texte/nombre/curseur, `textarea`,
  `select`, `contenteditable`).

Un bouton focus garde `Espace` (il s'active lui-même) ; un onglet, un curseur ou
une liste (`role` slider/tab/listbox…) garde ses flèches.

## Bindings

| Touche | Édition | Lecteur / présentation |
|---|---|---|
| `Espace` (relâchement d'un appui simple) | Lecture / pause | Lecture / pause |
| `Espace` maintenu + glisser | Déplacer la vue du terrain | idem |
| `←` / `→` | Étape précédente / suivante | Étape **réelle** précédente / suivante |
| `PageUp` / `PageDown` | — | Étape réelle (télécommandes de présentation) |
| `Maj+←` / `Maj+→` | Reculer / avancer d'1/10 de transition | — |
| `,` / `.` | Reculer / avancer d'une image (1/60 de transition) | — |
| `M` `P` `D` `R` `E` `T` | Outil déplacer / passe / dribble / course / écran / note | — |
| `Suppr` ou `Backspace` | Supprime la dernière flèche de l'étape | — |
| `Ctrl/⌘+Z` | Annuler | — |
| `Ctrl/⌘+Maj+Z` ou `Ctrl/⌘+Y` | Rétablir | — |
| `Échap` | — | Quitte le plein écran (mode `present`) |

Pendant la lecture, seules `Espace` et `Échap` restent actives.
Naviguer entre étapes **n'entre pas** dans l'historique : Annuler revient à la
dernière vraie modification.

Les infobulles affichent le raccourci (constante `SHORTCUT_LABELS`, touches
d'outils `TOOL_KEYS`).

## Modificateurs souris et équivalents tactiles (U04)

Chaque geste qui demande une touche a un bouton dans la barre tactile du
terrain (`court/CourtTouchBar.tsx`, en haut à gauche, édition uniquement) :

| Clavier / souris | Effet | Bouton tactile |
|---|---|---|
| `Maj` + glisser depuis un attaquant (dribble, course, écran) | Tracé libre avec `waypoints` | **Tracé libre** |
| `Ctrl/⌘` pendant le déplacement d'un joueur | Aimantation aux repères du terrain | **Aimanter** |
| `Maj` + clic sur un défenseur / `Maj` + glisser dans le vide | Sélection multiple / lasso | **Sélection multiple** |
| `Échap` | Vider la sélection / annuler une passe en attente | **Désélectionner** / **Annuler la passe de Ox** |
| `Suppr`, clic droit sur une flèche | Supprimer une flèche | **Supprimer la dernière flèche** (et `×` de la liste d'actions) |
| Clic droit sur un joueur | Menu contextuel du joueur | Appui long (600 ms) |
| `Ctrl/⌘+Z`, `Ctrl/⌘+Y` | Annuler / rétablir | Boutons **Annuler** / **Rétablir** au-dessus du terrain |

## Ajouter un raccourci

1. Ajouter l'action au type `ShortcutAction` et sa règle dans `resolveShortcut`.
2. La traiter dans le `switch` de `onAction` (`app/page.tsx`).
3. Si le geste n'a pas d'équivalent au doigt, ajouter un bouton (barre tactile ou panneau).
4. Tester dans `src/hooks/__tests__/useKeyboardShortcuts.test.tsx` et documenter ici.

## Limites connues

- `Suppr` supprime la **dernière** flèche, pas une flèche sélectionnée.
