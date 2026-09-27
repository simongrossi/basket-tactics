# Audit chiffré du réalisme des déplacements — 27/09/2026

Outil : [`scripts/audit-realism.ts`](../scripts/audit-realism.ts)
(`npx tsx scripts/audit-realism.ts [--seconds s] [--json fichier] [id…]`).

40 systèmes de la bibliothèque, profil **réaliste** (défaut de l'app), 60
sous-pas par étape, temps réel via `fullStepToSeconds`. Mesures par joueur qui
bouge : vitesse de pointe, accélération, freinage, virages brusques ; pour les
défenseurs, mode de déplacement par rapport au corps (face / pas chassé /
reculons) et écart à leur homme en fin d'étape.

## Ordres de grandeur retenus (joueurs entraînés, tolérants)

| Mesure | Seuil |
|---|---|
| Vitesse de pointe (sprint) | 8 m/s |
| Pas chassé défensif | 4,5 m/s |
| Course à reculons | 5 m/s |
| Accélération | 7 m/s² |
| Freinage | 9 m/s² |
| Virage brusque | > 70° en ≤ 0,25 s au-delà de 5 m/s |
| Défenseur « perdu » en fin d'étape | > 3 m de son homme |

Ces seuils sont des ordres de grandeur, à ajuster (constante `SEUILS`).

## Résultats

### Durée d'étape des systèmes (défaut app : 4 s)

| | médiane | p90 | max |
|---|---|---|---|
| Vitesse pointe attaquants | 1,2 m/s | 2,4 m/s | 3,5 m/s |
| Vitesse pointe défenseurs | 2,5 m/s | 3,6 m/s | **3,6 m/s** |
| Accélération défenseurs | 6,6 m/s² | **18,2 m/s²** | 18,2 m/s² |
| Freinage défenseurs | 8,8 m/s² | **15,1 m/s²** | 17,5 m/s² |
| Écart moyen à l'homme | 1,1 m | 3,0 m | 5,1 m |

Défenseurs : 44 % de la distance de face, 32 % en pas chassé, 25 % à
reculons. 113 joueurs sur 400 hors seuils (85 accélérations, 83 freinages,
27 fins d'étape à plus de 3 m de leur homme).

### Même bibliothèque avec des étapes de 2 s

| | médiane | p90 | max |
|---|---|---|---|
| Vitesse pointe attaquants | 2,2 m/s | 4,7 m/s | 6,8 m/s |
| Vitesse pointe défenseurs | 4,3 m/s | 7,3 m/s | **7,3 m/s** |
| Accélération défenseurs | 24,3 m/s² | **72,6 m/s²** | 73,0 m/s² |
| Pas chassé max | 2,3 m/s | **7,3 m/s** | 7,3 m/s |

205 joueurs sur 400 hors seuils (dont 41 pas chassés et 34 reculons trop
rapides, 8 virages brusques).

## Constats

1. **La cinématique image par image n'est pas en unités physiques.** Les
   budgets par étape sont calibrés en temps réel depuis F08, mais le limiteur
   anti-saut du `frameResolver` (`MAX_DEFENDER_JUMP_PX = 9` et
   `MAX_ATTACKER_JUMP_PX = 9` par sous-pas) et la rampe d'accélération
   restent exprimés **par sous-pas**. Conséquences :
   - la vitesse maximale d'un défenseur vaut exactement 9 px × 60 sous-pas /
     durée d'étape : **3,65 m/s à 4 s** (jamais de sprint, même en closeout
     ou en repli), **7,3 m/s à 2 s** (pas chassé à 7,3 m/s, impossible) ;
   - les accélérations passent de ~18 m/s² (4 s) à ~73 m/s² (2 s) : elles
     grandissent avec le carré du tempo au lieu de rester physiques.
2. **Démarrages et arrêts quasi instantanés aux changements d'étape.**
   Exemple PNR central, D5 : 0 → 3,65 m/s entre 7,8 s et 8,0 s, oscillation
   2,6 ↔ 3,65 m/s, puis 3,65 → 0,6 m/s en 0,2 s. La rampe P3.1 ne lisse pas
   ces départs.
3. **Tempo par défaut trop lent pour les attaquants.** À 4 s par étape, les
   courses dessinées (3 à 8 m) se jouent à la marche : sur PNR central, le
   drive d'O1 se fait à 0,72 m/s. La doc moteur (SCREEN-ENGINE) raisonne en
   2 s par transition ; l'app utilise 4 s par défaut.
4. **Modes de déplacement défensifs plausibles** en proportion (face 44 %,
   pas chassé 32 %, reculons 25 %), mais **sans plafond propre** : le pas
   chassé et la course à reculons vont aussi vite que la course de face.
5. **Défenseurs perdus** : 27 fins d'étape à plus de 3 m de l'homme, surtout
   sur les systèmes anti-zone (appariements de zone, attendu) et quelques
   écrans (pindown, stagger, floppy).

## Corrections proposées (par priorité)

1. **Cinématique en unités réelles (cœur du problème)** — dans le
   `frameResolver`, exprimer le limiteur et la rampe en m/s et m/s² avec le
   `dt` réel du sous-pas : vitesse max par mode (face ≈ 7 m/s, pas chassé
   ≈ 4 m/s, reculons ≈ 4,5 m/s ; sprint de repli/closeout autorisé), accélération
   ≈ 6 m/s², freinage ≈ 9 m/s². Le garde-fou anti-saut reste, mais dérivé de
   ces vitesses. Zone Règle 1bis : garde-fous écran / overlap / userJson /
   screenLab obligatoires, golden metrics.
2. **Départs et arrêts progressifs aux changements d'étape** — vérifier
   pourquoi la rampe P3.1 ne s'applique pas à ces départs et la brancher.
3. **Tempo par défaut** (décision produit) — passer le défaut à 2 s par
   étape, ou calculer une durée par étape à partir de la distance à courir
   (vitesse d'action ≈ 4 m/s pour un drive ou une coupe). Impacte tous les
   systèmes et le chronomètre des 24 s.
4. **Plafonds par mode défensif** — pas chassé et reculons plus lents que la
   course de face ; au-delà, le défenseur se retourne et court (« turn and
   run »).
5. **Défenseurs perdus** — revue ciblée des cas écran (pindown, stagger,
   floppy) une fois 1 et 2 faits.
