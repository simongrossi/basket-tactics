# Plan d'Optimisation UX / UI — Espace, Lisibilité & Parcours Coach Débutant

> **Principe directeur** : **Ne supprimer aucune fonctionnalité**, mais optimiser l'espace, hiérarchiser les menus (tiroirs repliables, niveaux *Coach / Analyse / Dev*) et remplacer le jargon interne par un vocabulaire terrain immédiatement compréhensible.

---

## Journal d'avancement (Fait vs À faire)

### ✅ Vague 1 — Fondations Espace & Parcours principal (FAIT)
- [x] **P1 — Libérer l'espace vertical dans la Sidebar (~220 px gagnés)**
  - Sélecteur de mode compacté sur 1 ligne (`Mode : [🏀 Coach | 📊 Analyse | 🔧 Développement]`) dans `src/components/interface/InterfaceLevel.tsx`.
  - Actions rapides d'accueil compactées sur 1 ligne (`+ Nouveau` | `Modèles`) dans `src/components/sidebar/CoachStartActions.tsx`.
  - Navigation `Vues` passée en grille 2 colonnes compacte (`Terrain`, `Biblio`, `Fiches`, `Séances`, `Réglages`) et masquage des vues expertes (`Graphe`, `Match IA`) en mode *Coach* dans `src/components/sidebar/SidebarNav.tsx`.
- [x] **P2 — Flux « Zéro changement d'onglet » (Créer un système de A à Z)**
  - Ajout d'une barre d'étape directe (`◀ Étape X/Y ▶` + `+ Étape suiv.`) dans `src/components/OffenseToolsPanel.tsx`.
  - Ajout d'un bouton `+ Étape` directement dans la `Timeline` (`src/components/Timeline.tsx`).
- [x] **P3 — Désencombrer le panneau « Étapes » et éliminer le jargon**
  - Regroupement des 12 boutons de remises en jeu et cas particuliers dans un tiroir repliable `⚙️ Situations spéciales & Remises` (fermé par défaut sauf si actif) dans `src/components/StepsPanel.tsx`.
  - Conditionnement des horloges fines par étape (`durée`, `quart`, `24s rest.`) au mode `📊 Analyse`.
  - Suppression des codes internes (`A11`, `A11 V3`).
- [x] **P4 — Lisibilité des boutons « Attaque » et « Défense » (Haut de panneau)**
  - Boutons d'outils offensifs agrandis (`38 px`) et capitalisés (`Déplacer`, `Passe`, `Dribble`, `Course`, `Écran`, `Note`), option `Ancrer à la fin de l'action` réservée au mode `📊 Analyse`.
  - Remplacement de `🧠 ⚡ rapide` et `🧠 ▶ réel` par `↺ Replacer en auto` et `▶ Animer le retour` dans `src/components/DefensePanel.tsx`.
  - Traduction des couvertures d'écrans en français clair avec terme anglais entre parenthèses.
- [x] **P5 — Alléger le Header et agrandir le terrain**
  - Barre `Stats` (`MetricsBar`) masquée par défaut à l'ouverture (activable en 1 clic via le bouton `Stats` de la timeline) dans `src/app/page.tsx`.
  - Ajout du bouton `📺 Présenter` directement dans le Header.
  - Renommage de `● Enregistrer les gestes` en `● Capturer mouv.` pour éviter toute confusion avec `💾 Enregistrer`.

---

### ✅ Vague 2 — Terrain, Menus contextuels & Panneaux secondaires (FAIT)
- [x] **P6 — Barre d'outils flottante directement sur le terrain**
  - Intégration d'une pilule d'outils rapides (`Déplacer`, `Passe`, `Dribble`, `Course`, `Écran`, `Note`, `Combiner`) dans `src/components/court/CourtTouchBar.tsx`, accessible même quand la barre latérale est sur l'onglet `Défense`, `Étapes` ou repliée.
- [x] **P7 — Alléger le bas de l'onglet « Défense » (`DefensePanel.tsx`)**
  - Section `Appliquer à tous (5)` passée en accordéon replié par défaut (`defaultOpen={false}`) au lieu d'être épinglée ouverte.
  - Traduction complète des termes bruts (`sag` → *Flotter en aide (sag)*, `stunt` → *Feinte d'aide (stunt)*, `deny-3q` → *Contester 3/4 (deny)*, `topside` → *Forcer milieu (topside)*).
  - Refonte de `Règles par joueur` en cartes sur 2 lignes lisibles au lieu de 6 colonnes écrasées dans 220 px.
  - Suppression du jargon `Sauvegardes utilisateur (rules + screens + B/C settings)` → `Mes profils défensifs`.
  - Lien `🎬 Ouvrir le laboratoire de simulation →` conditionné au mode `📊 Analyse`.
- [x] **P8 — Épurer les menus clic-droit sur les joueurs (`AttackerMenu.tsx`, `DefenderMenu.tsx`, `ToolBar.tsx`)**
  - Dans `AttackerMenu.tsx` : regroupement de `Athlétisme`, `Orient. corps` et `Orient. regard` dans un tiroir repliable `⚙ Posture & athlétisme` (ouvert automatiquement si un réglage est actif), traduction des profils offensifs et libellés d'action clairs (`🏀 Donner le ballon`, `🧱 Forcer comme poseur d'écran`).
  - Dans `ToolBar.tsx` : outils capitalisés et case `Ancrer à la fin de l'action` réservée au mode `📊 Analyse`.
  - Dans `DefenderMenu.tsx` : traduction et harmonisation de tous les intitulés et listes déroulantes en français clair.
- [x] **P9 — Polir « Scénario » (`ScenarioPanel.tsx`) et « Paramètres » (`ParametresPanel.tsx`)**
  - Dans `ScenarioPanel.tsx` : affichage du vrai nom français des actions FIBA dans les listes déroulantes de continuité (au lieu de l'identifiant technique brut) et conditionnement de `🎲 Lecture probabiliste` au mode `📊 Analyse`.
  - Dans `ParametresPanel.tsx` : suppression du doublon `<InterfaceLevelSelector />` en haut de page.

---

### ✅ Vague 3 — Onboarding visuel, Miniatures Bibliothèque & Header compact (FAIT)
- [x] **P10 — Guide visuel au premier lancement (`CoachDrawHint.tsx`)**
  - Refonte en 3 cartes numérotées côte à côte (`① Choisir l'outil` → `② Tracer sur le terrain` → `③ Enchaîner`) qui disparaissent automatiquement dès le premier tracé.
- [x] **P11 — Aperçu visuel (miniatures terrain) dans la Bibliothèque (`LibraryModal.tsx`)**
  - Ajout d'un composant `CourtPreviewThumbnail` qui dessine en SVG la raquette, l'arc à 3 points, le placement initial des 5 joueurs et les premières flèches sur chaque carte de modèle et de système sauvegardé.
- [x] **P12 — Regroupement des actions secondaires dans le Header (`page.tsx`)**
  - Mise en avant des 3 actions clés (`📺 Présenter`, `💾 Sauvegarder / Enregistrer`, `Partager`) et regroupement de `📁 Enregistrer sous…`, `● Capturer mouvements (direct)`, `🎬 Exporter (Vidéo, GIF, PDF)…` et `📋 Coller un code de situation…` dans un menu déroulant propre **`Plus ▾`**.

---

## Tableau récapitulatif global

| Priorité | Lot | Fichiers principaux | Statut | Gain UX / Espace |
| :--- | :--- | :--- | :---: | :--- |
| **P1** | **Espace Sidebar & Navigation** | `Sidebar.tsx`, `SidebarNav.tsx`, `CoachStartActions.tsx`, `InterfaceLevel.tsx` | ✅ Fait | **+220 px verticaux**, fin du doublon de menus |
| **P2** | **Flux « Zéro changement d'onglet »** | `OffenseToolsPanel.tsx`, `Timeline.tsx`, `page.tsx` | ✅ Fait | Création d'étapes **2× plus rapide** |
| **P3** | **Nettoyage Panneau Étapes & Jargon** | `StepsPanel.tsx` | ✅ Fait | **-70% d'encombrement visuel** sur l'étape active |
| **P4** | **Lisibilité boutons Attaque & Défense** | `OffenseToolsPanel.tsx`, `DefensePanel.tsx` | ✅ Fait | Compréhension immédiate sans jargon |
| **P5** | **Header épuré & Terrain agrandi** | `page.tsx`, `MetricsBar.tsx`, `SidebarOverflowMenu.tsx` | ✅ Fait | Terrain plus grand, bouton **Présenter** accessible |
| **P6** | **Barre d'outils flottante sur le terrain** | `CourtTouchBar.tsx`, `CourtView.tsx` | ✅ Fait | Changement d'outil en 1 clic depuis n'importe quel onglet |
| **P7** | **Refonte bas du panneau Défense** | `DefensePanel.tsx` | ✅ Fait | Fin des 6 colonnes écrasées et du bloc épinglé géant |
| **P8** | **Menus clic-droit joueurs progressifs** | `AttackerMenu.tsx`, `DefenderMenu.tsx`, `ToolBar.tsx` | ✅ Fait | Clic-droit plus court, réglages fins en tiroir |
| **P9** | **Polissage Scénario & Paramètres** | `ScenarioPanel.tsx`, `ParametresPanel.tsx` | ✅ Fait | Noms d'actions traduits, fin du doublon de mode |
| **P10** | **Onboarding 3 étapes premier contact** | `CoachDrawHint.tsx` | ✅ Fait | Prise en main immédiate en 3 cartes visuelles |
| **P11** | **Miniatures visuelles dans Bibliothèque** | `LibraryModal.tsx` | ✅ Fait | Repérage visuel instantané des systèmes |
| **P12** | **Menu compact `Plus ▾` dans le Header** | `page.tsx` | ✅ Fait | Header sur 1 seule ligne même sur petit écran |
