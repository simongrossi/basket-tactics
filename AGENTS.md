# Guide IA universel — basket-tactics

Ce document est le point d'entrée unique pour tout agent d'assistance au code (Claude, Codex, Gemini, Cursor, Copilot). Il cartographie l'architecture, les fichiers clés par fonctionnalité et les règles invariables.

---

## 1. Règles inviolables (Garde-fous)

1. **Aucune superposition de joueurs (Règle 1)** : `PLAYER_MIN_CLEARANCE_PX = 34 px` entre centres de deux joueurs quelconques. Toute mutation passe par `moveAttackerInState` / `moveDefenderInState` ou appelle `pushOutOfMany`. Tests : `src/lib/logic/__tests__/overlapInvariants.test.ts`.
2. **Moteur d'écrans (Règle 1bis)** : Lire impérativement `docs/SCREEN-ENGINE.md` avant de toucher à `screens/`, `frameResolver.ts`, `speedConstraint.ts`.
3. **Commit + push systématique (Règle 2)** : Chaque lot de modifications testables doit être commité et pushé sur `main`.
4. **Anatomie figée (Règle 3)** : Regard jamais derrière la tête (clamp ±90°), bras jamais dans le dos.
5. **Vocabulaire orientation (Règle 4)** : Parler "panier / porteur / défenseur / homme marqué" (jamais nord/sud/est/ouest).

---

## 2. Cartographie par domaine & Fichiers clés

### A. Manipulation, Drag & Gestes utilisateur
| Fonctionnalité | Fichier clé | Rôle |
| :--- | :--- | :--- |
| **Drag & Clic terrain** | `src/hooks/useCourtPointerHandlers.ts` | Événements pointeur, drag individuel/groupé, clamping de vitesse physique attaquant. |
| **Poursuite en direct** | `src/hooks/useCourtFrame.ts` | Boucle rAF `defenderPursuit`, vitesse temps réel défenseurs, sprint de récupération. |
| **Enregistrement gestes** | `src/hooks/useManualRecording.ts` | Capture des frames et événements manuels du coach (BTG1). |
| **Codes de situation** | `src/lib/state/situationCode.ts` | Sérialisation / Désérialisation zlib Base64 `BT1:`, `BTA1:`, `BTG1:`. |

### B. Moteur Défensif & Rotations
| Fonctionnalité | Fichier clé | Rôle |
| :--- | :--- | :--- |
| **Orchestration générale** | `src/lib/logic/engine.ts` | `computeDefenseTargets`, `effectiveDefensePositions`, dispatch man/zone/écrans. |
| **Défense individuelle** | `src/lib/logic/defense/manDefense.ts` | Calcul des cibles homme-à-homme, stances, orientation défenseur. |
| **Aide défensive** | `src/lib/logic/defense/help.ts` | Côté aide, split line, drop, contestation de passe (`deny`). |
| **Défense de zone** | `src/lib/logic/zoneDefense.ts`, `defense/matchupZone.ts`, `defense/zone32Rotation.ts`, `defense/zoneSituationRules.ts` | Zones 2-3, 3-2, 1-3-1 (règles coin / poste haut / aile), matchup (un pour un, relais), responsabilités de balle et rotations. |
| **Contraintes de vitesse** | `src/lib/logic/defense/speedConstraint.ts` | Budget de déplacement max (`rule.maxSpeed`), friction, closeout boost. |
| **Couvertures d'écrans / PnR**| `src/lib/logic/screens/` | Détection (`detectScreen`), couvertures (drop, hedge, switch, blitz). |

### C. Moteur Offensif & Playbook
| Fonctionnalité | Fichier clé | Rôle |
| :--- | :--- | :--- |
| **Déplacement attaquants** | `src/lib/logic/playerMove.ts` | `moveAttackerInState`, respect des push-outs anti-overlap. |
| **Trajectoires & Actions** | `src/lib/logic/playbackTrajectory.ts` | Courbes de coupe (cut), dribbles, pose d'écrans. |
| **Timing & Horloge** | `src/lib/logic/timecode.ts` | `getStepDurationSeconds`, shot clock, conversion étapes ↔ secondes. |
| **Tempo selon la distance** | `src/lib/logic/stepTempo.ts` | Durée d'étape auto (plus longue course ÷ 3,5 m/s + 0,6 s, [1,8 ; 4] s), profil réaliste. |
| **Cinématique de lecture** | `src/lib/logic/playback/kinematicLimits.ts` | Budget du sous-pas en m/s, m/s² (appuis, rampe, freinage anticipé), profil départ / arrêt des attaquants. |
| **Placement sans ballon** | `src/lib/logic/autoOffense/positionOffBall.ts` | Spacing automatique hors-porteur. |

### D. Physique & Géométrie
| Fonctionnalité | Fichier clé | Rôle |
| :--- | :--- | :--- |
| **Constantes physiques** | `src/lib/data/physics.ts` | Échelle 37 px/m, vitesses max, boosts, rayons d'action. |
| **Dimensions du terrain** | `src/lib/data/court.ts` | Dimensions FIBA (600 x 560 px demi-terrain, panier à y=75). |
| **Primitives géométriques**| `src/lib/logic/geometry.ts` | Collisions, intersections, `pushOutOfMany`, distances, angles. |

### E. Rendu & Composants UI
| Fonctionnalité | Fichier clé | Rôle |
| :--- | :--- | :--- |
| **Vue du terrain (SVG)** | `src/components/CourtView.tsx` | Conteneur SVG principal, pont handlers ↔ rendu. |
| **Rendu d'un joueur** | `src/components/Player.tsx` | Dessin SVG du joueur, bras Bezier, regard, numéros. |
| **Barre enregistrement** | `src/components/ManualRecordingBar.tsx` | UI pour démarrer, arrêter, rejouer et copier les gestes. |
| **Panneau paramètres** | `src/components/ParametresPanel.tsx` | Sliders de vitesse, règles globales, aides. |

---

## 3. Commandes courantes & Vérification

```powershell
# Lancer tous les tests vitest
npx vitest run

# Lancer un test ciblé
npx vitest run src/hooks/__tests__/useCourtFrame.pursuit.test.tsx
npx vitest run src/lib/logic/__tests__/overlapInvariants.test.ts

# Lancer le serveur de dev
npm run dev
```

---

## 4. Index rapide par mots-clés

- `BTG1` / `BT1` / `BTA1` → `src/lib/state/situationCode.ts`
- `maxSpeed` / `vitesse défenseur` → `src/lib/data/physics.ts` & `src/lib/logic/defense/speedConstraint.ts`
- `drag` / `souris` / `glissement joueur` → `src/hooks/useCourtPointerHandlers.ts`
- `poursuite temps réel` → `src/hooks/useCourtFrame.ts`
- `superposition` / `overlap` → `src/lib/logic/geometry.ts` & `src/lib/logic/playerMove.ts`
- `écran` / `pick and roll` → `src/lib/logic/screens/` & `docs/SCREEN-ENGINE.md`
