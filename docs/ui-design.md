# Design UI

Choix visuels et conventions appliqués dans l'application.

## Layout

### Desktop (≥ 1100px)

Layout 3 colonnes en grid CSS :
### Visu & légende fusionnés

L'ancienne section "Visualisation" et l'ancienne `<details>` "Légende couleurs" sont fusionnées en **une seule section** "Visu & légende" toujours ouverte. Chaque toggle inclut un mini-swatch SVG (22×12px) à côté du label montrant la couleur/forme exacte de l'indicateur sur le terrain : ligne pleine, pointillée, cercle pointillé, ring plein, dot rempli, badge numéroté, gradient horizontal pour la heatmap. En bas, séparé par une bordure pointillée, la rangée "Indicateurs auto" liste en grille 2-col les cues visuels non-toggleables (matchup switch, zones de tracking en zone defense, écrans, closeout, denial, override drag, poseur forcé). Tout est visible d'un coup d'œil — plus besoin de déplier.

### Bibliothèque systèmes (modal)

Bouton compact en haut de l'OffensePanel : `📚 Bibliothèque (N systèmes)` avec background tinté orange et bordure gauche accent. Le clic ouvre une **modal centrée** ([`TemplateLibraryModal.tsx`](../src/components/TemplateLibraryModal.tsx)) :

- Backdrop sombre, modal max 720px de large, max 85vh de haut
- Header tinté orange avec titre + sous-titre + bouton de fermeture
- Grille auto-fill `minmax(280px, 1fr)` de cartes : badge nombre d'étapes + nom + description complète
- Hover : bordure accent, lift léger
- Fermeture : clic hors modal, bouton ×, ou touche `Échap`

Le choix du modal sépare clairement "charger un système clé en main" du reste des contrôles (édition fine), libère de l'espace dans le panel pour les Outils/Étapes/Lecture, et permet d'afficher les descriptions complètes sans contrainte de largeur.

### Layout 3 colonnes × 2 lignes

Pas de header. Toute la hauteur viewport est exploitée. Chaque colonne latérale empile 2 panneaux :

- **Colonne gauche (260px)** : 3 panneaux empilés :
  - `OffensePanel` (orange, fill) — Attaque (Actions, Étapes)
  - `LibraryPanel` (compact) — un seul bouton qui ouvre la modal `TemplateLibraryModal`
  - `ActionsPanel` (compact) — 5 boutons globaux (plein écran, playbook PDF, exporter/importer JSON, reset)
- **Colonne centrale** : terrain + timeline + métriques (`grid-template-rows: minmax(0, 1fr) auto auto`).
- **Colonne droite (300px)** : `DefensePanel` (bleu, fill l'espace restant) au-dessus, `ParametresPanel` (compact, options d'affichage) en-dessous.

Les panneaux "fill" (OffensePanel, DefensePanel) prennent `flex: 1 1 0` ; les panneaux "compact" (ActionsPanel, ParametresPanel) prennent `flex: 0 0 auto` (hauteur de leur contenu). Géré par la prop `fill` du composant `Panel`.

### Largeurs colonnes

- **260px** : panneau attaque (gauche, orange)
- **1fr** : zone centrale (terrain + timeline)
- **320px** : panneau défense (droit, bleu)

La page entière est en `height: 100vh; overflow: hidden` — pas de scroll global. Chaque panneau gère son propre scroll si son contenu déborde.

Le terrain SVG utilise `preserveAspectRatio="xMidYMid meet"` avec `max-width: 100%; max-height: 100%` pour s'adapter à l'espace disponible sans débordement.

### Tablette (900–1100px)

Mêmes 3 colonnes, légèrement réduites : `240px / 1fr / 280px`.

### Mobile (< 900px)

Stack vertical. La contrainte viewport est levée (`height: auto`) — l'utilisateur scrolle. Pas optimisé tactile pour l'instant.

## Codes couleur

### Joueurs

- **Attaquants** : orange `#D85A30` rempli, contour `#4A1B0C`
- **Défenseurs** : bleu `#378ADD` rempli, contour `#042C53`
- **Défenseur du porteur** : contour épaissi jaune `#FAC775`
- **Défenseur en retard** : contour épaissi rouge `#E24B4A`
- **Défenseur impliqué dans un écran** : contour violet `#534AB7`
- **Bras défensifs** : deux arcs SVG au-dessus du cercle (style FIBA)

### Panneaux

- **Panneau attaque** (orange thème) :
  - Background `#fff` avec barre accent orange (`#D85A30`) à gauche du titre
  - Border `#fed7aa`
  - Texte titre `#7c2d12`
- **Panneau défense** (bleu thème) :
  - Background `#fff` avec barre accent bleue (`#378ADD`)
  - Border `#bfdbfe`
  - Texte titre `#1e3a8a`

Les panneaux ont une ombre douce `0 1px 3px + 0 8px 24px` rgba(15, 23, 42, 0.04) pour la profondeur.

### Statuts

- **Étape active** : background `#dbeafe`, texte `#1e40af`
- **Switch détecté** : indicateur orange `#BA7517`
- **Lignes d'aide (help lines)** : violet `#534AB7` pointillé
- **Indicateur d'écran porteur** : cercle violet pointillé `#534AB7`
- **Indicateur d'écran non-porteur** : cercle vert pointillé `#16a34a`
- **Indicateur de lecture (badge)** : `rgba(30, 64, 175, 0.92)` blanc
- **Cadenas position manuelle (défenseur override)** : badge jaune `#fbbf24` + ✋
- **Cadenas forcedScreener (attaquant)** : badge violet `#a78bfa` + 🔒
- **Closeout actif** : double anneau orange `#F97316` autour du défenseur du nouveau porteur (apparition pendant la transition où le ballon change de mains)
- **Over-closeout** : double anneau rouge `#DC2626` + ⚠ — closeout actif ET le porteur en a profité pour driver vers le panier (s'est fait déborder)
- **Strong-side denial actif** : ring cyan pointillé `#0EA5A8` (différencié du ring violet `#534AB7` qui désigne l'aide weak-side classique)
- **Panier visé (mode inversion + fullCourt)** : anneau orange pointillé `#F97316` autour du rim + label `🎯 visé`
- **Panier protégé (mode inversion + fullCourt)** : cercle bleu sobre `#3b82f6` (50% opacité) + label `🛡 protégé`
- **Heatmap pression défensive** : grille de cellules 30×30 colorées en **traffic-light** — vert `hsl(120, 78%, 50%)` (zone libre, peu défendue) → jaune `hsl(60, 78%, 50%)` (contestable) → rouge `hsl(0, 78%, 50%)` (bien défendue). Couleurs HSL vives (saturation 78%, lightness 50%) avec opacité 0.40-0.52 (modulée pour être plus marquée aux extrémités), `filter: blur(8px)` pour fondre. Toutes les cellules sont colorées (pas de seuil) pour que le coach lise instantanément les zones d'opportunité (vert) et les zones impossibles (rouge).
- **Defender en retard (`late`)** : contour épais rouge `#E24B4A`
- **Defender du porteur** : contour jaune `#FAC775`
- **Ballon en main** : cercle orange `#BA7517` r=7 avec contour foncé, offset (+16, -16) au-dessus du porteur
- **Ballon en vol (passe en cours)** : cercle r=8 avec contour blanc épais + ombre projetée elliptique en-dessous (effet de hauteur). Trajectoire parabolique, hauteur proportionnelle à la distance (cap 80px).

## Conventions de tracé d'annotations

Codes basket standard implémentés dans [`Annotations.tsx`](../src/components/Annotations.tsx) :

| Action | Tracé | Couleur |
|--------|-------|---------|
| **Passe** | Ligne droite **pointillée** (`3 5`) avec flèche | Orange `#D85A30` |
| **Dribble** | Ligne en **zig-zag / vague** avec flèche | Orange `#D85A30` |
| **Course** (cut) | Ligne **pleine** droite avec flèche | Gris `#5F5E5A` |
| **Écran** | Ligne pleine + **barre en T** au bout | Gris `#5F5E5A` |

Choix volontaires :
- Orange pour ce qui implique le ballon (passe, dribble)
- Gris pour les déplacements sans ballon (course, écran)
- Le marqueur du screener est en T (convention universelle)

## Symbolique défenseur (bras)

Inspirée du site FIBA Coaching : deux arcs SVG quadratiques au-dessus du cercle du défenseur représentent les bras en posture défensive.

```svg
<path d="M cx-r*0.6 cy-r*0.7 Q cx-r*1.4 cy-r*0.95 cx-r*1.55 cy-r*0.15" />
<path d="M cx+r*0.6 cy-r*0.7 Q cx+r*1.4 cy-r*0.95 cx+r*1.55 cy-r*0.15" />
```

Les bras s'écartent **vers les côtés** (épaule → main extérieure, légèrement vers le bas) pour suggérer une stance défensive prête, sans direction ambiguë.

## Composants partagés (`ui.tsx`)

| Composant | Rôle |
|-----------|------|
| `Panel` | Conteneur thématisé avec barre d'accent + titre + scroll interne |
| `Section` | Sous-section dépliable (`<details>`) avec label en SMALL CAPS |
| `Slider` | Curseur range avec label + valeur affichée |
| `CheckboxLine` | Case à cocher + label, ligne |
| `Button` | Bouton avec variant `solid` ou `outline`, thème injectable |

Tous prennent un prop `theme: 'offense' | 'defense' | 'neutral'` qui sélectionne dans `COLORS`.

## Timeline

Barre horizontale sous le terrain :
- Track gris clair, portion remplie en orange (édition) ou bleu (lecture)
- Marqueurs cliquables pour chaque étape (cercles 14px)
- Playhead 18px draggable
- Durant le drag : interpolation fluide entre étapes (scrubbing)
- Au relâchement : snap à l'étape entière la plus proche
- Texte en dessous : "Étape N / total — label" + porteur

## Indicateur de lecture

Pendant le playback, badge en haut à gauche du terrain :
```
▶ étape 2 / 4 — dribble drive
```

Position absolue, fond bleu translucide, pointer-events disabled (n'intercepte pas les clics).

## Modal playbook (PDF)

Overlay full-screen avec :
- En-tête options (titre, colonnes 1/2/3, défense oui/non, légende oui/non)
- Bouton "🖨 imprimer / PDF" → `window.print()`
- Grille de vignettes d'étapes (chacune dans un `pageBreakInside: avoid`)
- Légende des 4 conventions de tracé en pied de page
- CSS `@media print` qui masque tout sauf `.playbook-print`

L'utilisateur enregistre en PDF via le dialogue d'impression de son navigateur.

## Patterns d'interaction

- **Drag-and-drop** : tous les joueurs sont déplaçables avec l'outil "déplacer". Pointer events natifs avec `setPointerCapture`.
- **Dessin d'annotation** : sélectionner un outil (passe/dribble/course/écran), cliquer sur un attaquant et glisser vers la cible. Annotation ajoutée au `mouseup` si distance > 15px.
- **Clic-droit sur défenseur** : ouvre le `ContextMenu` avec ses 4 réglages (aide %, priorité, vs porteur, hors-ballon). Fallback : si la cible DOM est un attaquant (cas d'un poseur d'écran rendu au-dessus), recherche par position du défenseur le plus proche.
- **Templates** : clic sur une carte de la bibliothèque → confirmation si du travail en cours → remplacement complet des étapes et des positions initiales défense.

## Polices et typographie

- Stack système par défaut (Next.js base)
- Tailles : 11–13 px pour les contrôles, 18 px pour le titre principal
- `letter-spacing: -0.01em` sur les titres pour un rendu plus moderne
- `font-weight: 500–700` selon la hiérarchie

## Hover / focus

Les boutons et cards ont des transitions de 120ms sur `border-color` et `background`. Les cards de la bibliothèque systèmes inversent leur background-color au hover pour le retour visuel.

## Accessibilité

À améliorer :
- Pas encore de raccourcis clavier (planifié dans IDEAS.md)
- Pas de focus visible distinct sur les éléments custom
- Pas de aria-labels sur les SVG interactifs
- Les sliders sont natifs (donc accessibles)
- Le confirm() des templates est natif
