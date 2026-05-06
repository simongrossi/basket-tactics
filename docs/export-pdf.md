# Export playbook PDF

## Approche technique

Pas de bibliothèque PDF côté client. Le PDF est généré via le **dialogue d'impression du navigateur** (`window.print()`) avec un CSS `@media print` qui isole le contenu playbook.

Avantages :
- Aucune dépendance ajoutée
- Qualité vectorielle (le SVG reste vectoriel dans le PDF)
- L'utilisateur garde le contrôle (taille papier, marges, orientation, recto-verso)
- Toutes plateformes supportent l'impression PDF (Save as PDF / Microsoft Print to PDF)

Inconvénients :
- Pas de pagination programmatique fine
- L'utilisateur doit cocher "Save as PDF" dans le dialogue (vs un download direct)
- Le rendu peut différer entre navigateurs

## Composants impliqués

### `PlaybookView.tsx`

Overlay full-screen affichée par-dessus l'app. Contient :
- Toolbar (titre, options, bouton imprimer, bouton fermer)
- Grille de vignettes — une par étape
- Légende des conventions de tracé en pied de page

```jsx
<style>{`
  @media print {
    body * { visibility: hidden !important; }
    .playbook-print, .playbook-print * { visibility: visible !important; }
    .playbook-print { position: absolute !important; left: 0 !important; top: 0 !important; ... }
    .playbook-no-print { display: none !important; }
    @page { size: A4; margin: 12mm; }
  }
`}</style>
```

Stratégie : tout cacher (`visibility: hidden`), puis re-rendre uniquement `.playbook-print`. La toolbar a la classe `.playbook-no-print` pour disparaître à l'impression.

`@page { size: A4; margin: 12mm }` impose le format papier et les marges.

### `StepThumbnail.tsx`

Composant de rendu **statique non-interactif** d'une étape. Utilisé dans le playbook (et réutilisable ailleurs).

```typescript
<StepThumbnail state={state} stepIdx={i} showDefense={true} />
```

Calcule la défense via `effectiveDefensePositions(state, stepIdx)` et la détection d'écrans, puis rend un SVG du terrain + joueurs + annotations + indicateurs.

Z-order conservé : poseur d'écran rendu au-dessus des défenseurs (cohérence avec `CourtView`).

## Options exposées

Dans la toolbar de `PlaybookView` :

| Option | Effet |
|--------|-------|
| **titre** | Texte du h1 en haut du document |
| **colonnes** | 1 / 2 / 3 vignettes par ligne (grille CSS) |
| **défense** | `showDefense` passé à `StepThumbnail` — masque les défenseurs si décoché |
| **légende** | Affiche/masque le bloc de légende en pied de page |

Le sous-titre du document affiche automatiquement :
- Nombre d'étapes
- Système (homme à homme, ou zone X)
- Si homme à homme : règle d'écran porteur

## Page break

Chaque vignette a `pageBreakInside: avoid` pour éviter qu'une étape soit coupée entre deux pages.

La légende a aussi `pageBreakInside: avoid`.

## Limitations actuelles

- **Pas de pagination programmatique** : si tu mets beaucoup d'étapes en colonnes 1, ça peut faire 5+ pages mais sans contrôle d'en-tête répété.
- **Pas de numérotation des positions sur le terrain** : pour voir l'ordre des actions, il faut comparer mentalement les vignettes — noté dans IDEAS.
- **Pas de page de garde** : titre + sous-titre directement avant les vignettes.
- **Pas de diff visuel** : pas de "ghost" de la position précédente pour montrer le mouvement, juste les positions figées.

## Améliorations futures (IDEAS)

- **Numérotation sur le terrain** : petits ronds 1, 2, 3 sur les positions des joueurs qui bougent
- **Page de garde** : titre + auteur + date + sommaire
- **Diff visuel** : ghost de la position précédente en transparent
- **jsPDF** : pour un vrai contrôle de pagination, en-têtes répétés, table des matières, etc.

## Procédure utilisateur

1. Régler le système et les étapes
2. Cliquer "📄 playbook PDF" dans le header
3. Ajuster titre, colonnes, options
4. Cliquer "🖨 imprimer / PDF"
5. Dans le dialogue navigateur :
   - **Destination** : "Enregistrer au format PDF" / "Save as PDF"
   - **Format** : A4 par défaut
   - **Marges** : "Par défaut" (= 12mm imposé par `@page`)
   - Cliquer "Enregistrer"
6. Le fichier est téléchargé
