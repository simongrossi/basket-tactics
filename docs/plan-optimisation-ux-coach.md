# Plan d'Optimisation UX / UI — Espace, Lisibilité & Parcours Coach Débutant

> **Objectif** : Libérer un maximum d'espace pour le terrain et les outils tactiques, éliminer les allers-retours inutiles entre onglets, et purger le jargon technique pour rendre l'application immédiatement naturelle pour tout coach ou joueur débutant.

---

## Ordre de priorité & Logique d'exécution

L'ordre ci-dessous suit une logique **« Impact maximal × Friction minimale »** :
1. **D'abord libérer l'espace physique** (P1) pour que les outils respirent sans scroller.
2. **Ensuite fluidifier le geste principal du coach** (P2 : dessiner étape après étape sans changer d'onglet).
3. **Puis nettoyer le bruit visuel et le jargon** dans les panneaux (P3 : Étapes, Attaque, Défense).
4. **Enfin réorganiser les barres périphériques** (P4 : Header & Timeline/Stats) et **guider le premier contact** (P5).

---

## Priorité 1 — Libérer l'espace vertical dans la Sidebar (Gain : ~220 px)

### Pourquoi en premier ?
Sur un écran standard (portable 13–15" ou tablette paysage, hauteur 768–900 px), le haut de la barre latérale gauche empile **3 blocs fixes** (`Niveau d'interface` + `Préparer mon entraînement` + `Vues` à 7 lignes) qui consomment plus de 360 px de hauteur. Il ne reste parfois que 250 px pour les outils (`Attaque`, `Défense`, `Étapes`, `Scénario`), obligeant le coach à scroller constamment.

### Actions concrètes :
1. **Compacter le sélecteur `Niveau d'interface`** (`src/components/interface/InterfaceLevel.tsx`) :
   - Remplacer le gros bloc `<select>` + paragraphe descriptif de 3 lignes par un **sélecteur segmenté compact sur 1 ligne** (`Coach` | `Analyse` | `Dev`) avec infobulle au survol, ou le déplacer dans le `Header` / `SidebarFooter`.
2. **Supprimer la redondance entre `Préparer mon entraînement` et `Vues`** (`src/components/sidebar/CoachStartActions.tsx` & `SidebarNav.tsx`) :
   - Actuellement, *Partir d'un modèle* ouvre `Bibliothèque` et *Préparer une séance* ouvre `Séances`, qui sont déjà juste en dessous dans `Vues`.
   - Fusionner en gardant un bouton d'action rapide **`+ Nouveau système`** en haut, suivi d'une **grille compacte 2 colonnes** pour les Vues (ex. `🏀 Terrain`, `📚 Bibliothèque`, `📋 Fiches`, `📅 Séances`, `🔀 Enchaînements`, `⚙️ Paramètres`).
3. **Filtrer les vues avancées selon le niveau d'interface** :
   - En mode **Coach** (défaut débutant), masquer ou regrouper `Enchaînements` (graphe de scénario) et `Match simulé` pour ne garder que l'essentiel : *Terrain, Bibliothèque, Fiches systèmes, Séances, Paramètres*.

---

## Priorité 2 — Le flux « Zéro changement d'onglet » (Créer un système de A à Z)

### Pourquoi en deuxième ?
Aujourd'hui, le parcours d'un coach qui dessine un système est haché :
1. Il est dans l'onglet **Attaque** → il choisit `Passe` ou `Course` et trace sur le terrain.
2. Pour passer à l'étape 2, il doit quitter **Attaque**, cliquer sur l'onglet **Étapes**, scroller en bas, cliquer sur **`+ étape`**.
3. Puis recliquer sur l'onglet **Attaque** pour choisir l'outil suivant.

### Actions concrètes :
1. **Ajouter un bouton `+ Étape suivante` directement dans la `Timeline`** (`src/components/Timeline.tsx`) :
   - À côté des contrôles de lecture et des points d'étapes en bas du terrain, ajouter un bouton **`+ Étape`** (et navigation `◀ Étape N/M ▶`). C'est l'endroit le plus naturel visuellement puisque les étapes s'y affichent.
2. **Ajouter une barre d'étape rapide en bas du panneau `Attaque`** (`src/components/OffenseToolsPanel.tsx`) :
   - Afficher un mini-rappel de l'étape courante avec un bouton **`+ Ajouter l'étape suivante`** directement sous les outils de tracé (`Déplacer`, `Passe`, `Dribble`, `Course`, `Écran`).
   - **Résultat** : Un débutant peut dessiner un système complet en 5 étapes sans **jamais** quitter l'onglet Attaque.

---

## Priorité 3 — Désencombrer le panneau « Étapes » et éliminer le jargon technique

### Pourquoi en troisième ?
Dans `src/components/StepsPanel.tsx`, dès qu'une étape est sélectionnée, l'utilisateur voit apparaître **plus de 12 boutons de cas particuliers** et des termes de développement interne (`TIR (A11)`, `BLOB`, `SLOB bas`, `SLOB haut`, `shot clk`, `quart (s)`, `durée (s)`). Pour un coach débutant, cela donne une impression de complexité intimidante.

### Actions concrètes :
1. **Ranger les situations spéciales dans un accordéon replié par défaut** :
   - Créer une section dépliable **`⚙️ Situations spéciales & Remises en jeu`** (fermée par défaut, ou ouverte automatiquement uniquement si l'étape active utilise déjà une situation spéciale).
   - Y loger : *Remise ligne de fond (BLOB)*, *Remise touche avant (SLOB)*, *Remise touche arrière*, *Lancer franc*, *Entre-deux*, *Possession adverse*.
2. **Conditionner les horloges fines au mode `Analyse`** :
   - Masquer en mode *Coach* les 3 champs numériques par étape (`durée (s)`, `quart (s)`, `shot clk`) ainsi que les options fines de feinte par pourcentage, ou les placer dans un petit tiroir `⏱ Timings de l'étape`.
3. **Purger les codes de spécification interne et traduire clairement** :
   - `TIR (A11)` → **`Fin de possession (Tir)`** (`✅ Tir réussi`, `❌ Tir manqué`, `🛑 Tir contré`).
   - `étape rebond auto (A11)` → **`🏀 Générer le rebond automatique`**.
   - `outlet → transition adverse (A11 V3)` → **`🔄 Relance & contre-attaque adverse`**.

---

## Priorité 4 — Lisibilité des boutons « Attaque » et « Défense »

### Pourquoi en quatrième ?
Les boutons d'outils quotidiens manquent parfois de hiérarchie visuelle ou utilisent des raccourcis cryptiques.

### Actions concrètes :
1. **Panneau `Attaque` (`src/components/OffenseToolsPanel.tsx`)** :
   - **Agrandir les 6 boutons d'outils** (`Déplacer`, `Passe`, `Dribble`, `Course`, `Écran`, `Note`) : majuscule initiale, hauteur accrue (`38–42 px`), icône plus lisible.
   - **Clarifier la case `fin d'action`** : La remplacer par un sélecteur explicite ou la masquer en mode *Coach* (en mode Coach, un tracé part toujours du début de l'étape).
2. **Panneau `Défense` (`src/components/DefensePanel.tsx`)** :
   - **Remplacer `🧠 ⚡ rapide` et `🧠 ▶ réel`** : Lorsqu'un défenseur a été déplacé à la main, afficher un bandeau clair : **`X défenseur(s) placé(s) manuellement`** avec deux boutons compréhensibles : **`↺ Replacer (auto)`** et **`▶ Animer le retour`**.
   - **Traduire le jargon des listes déroulantes** :
     - `Rotation après un tag` → **`Après l'aide intérieure (tag)`**
     - `scram switch` → **`Échange de soutien (scram switch)`**
     - `peel-switch` → **`Changement retardé (peel switch)`**

---

## Priorité 5 — Alléger le Header et la zone sous le terrain (`page.tsx` & `MetricsBar.tsx`)

### Pourquoi en cinquième ?
La barre supérieure et le bas de l'écran mélangent des fonctions d'édition, d'analyse mathématique et de débogage.

### Actions concrètes :
1. **Gagner de la hauteur pour le terrain (masquer `Stats` par défaut en mode Coach)** :
   - Actuellement, `showMetrics` est à `true` par défaut (`raquette`, `écart max`, `écart moy`, `en retard`, `passes`). Cela mange une ligne complète sous la timeline.
   - En mode **Coach**, initialiser `showMetrics = false` (le bouton `📊 Stats` reste disponible à droite de la timeline pour l'afficher en 1 clic).
2. **Réorganiser la barre supérieure (`Header`)** :
   - **Clarifier la sauvegarde** : Regrouper `Enregistrer` et `Enregistrer sous…` proprement.
   - **Promouvoir le mode Présentation / Joueur** : Ajouter un bouton visible **`📺 Présenter`** dans le header (au lieu de le cacher dans le menu `⋯` tout en bas à gauche de la sidebar).
   - **Déplacer `● Enregistrer les gestes`** : Ce bouton sert surtout à capturer des mouvements à la souris (BTG1). Placé juste à côté de `Enregistrer` (le système), il induit les débutants en erreur (« Est-ce que ça enregistre mon système ? »). Le renommer **`🎥 Capturer mouvements`** ou le déplacer dans le menu d'outils / partage.

---

## Tableau récapitulatif pour prise de décision

| Priorité | Lot | Fichiers principaux | Effort | Gain UX / Espace |
| :--- | :--- | :--- | :---: | :--- |
| **P1** | **Espace Sidebar & Navigation** | `Sidebar.tsx`, `SidebarNav.tsx`, `CoachStartActions.tsx`, `InterfaceLevel.tsx` | Moyen | **+220 px verticaux**, fin du doublon de menus |
| **P2** | **Flux « Zéro changement d'onglet »** | `OffenseToolsPanel.tsx`, `Timeline.tsx`, `page.tsx` | Faible | Création d'étapes **2× plus rapide** pour débutants |
| **P3** | **Nettoyage Panneau Étapes & Jargon** | `StepsPanel.tsx` | Faible | **-70% d'encombrement visuel** sur l'étape active |
| **P4** | **Lisibilité boutons Attaque & Défense** | `OffenseToolsPanel.tsx`, `DefensePanel.tsx` | Faible | Compréhension immédiate sans lire les infobulles |
| **P5** | **Header épuré & Terrain agrandi** | `page.tsx`, `MetricsBar.tsx`, `SidebarOverflowMenu.tsx` | Faible | Terrain plus grand, bouton **Présenter** accessible |
