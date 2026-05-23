# Phy.O V3 — Démarquage actif — RFC d'architecture

Date : 2026-05-23
Statut : **RFC (analyse seule, pas d'implémentation V1)**. Document
d'architecture pour la session de design dédiée.

## Pourquoi un RFC et pas un spec normal

Toutes les autres briques Phy.O (V1 courbure, V2 friction, V4 feintes) sont
des **modulations de vitesse** le long d'un path **dessiné par le coach**.
Le moteur respecte strictement le path utilisateur — il ne fait que le
parcourir plus ou moins vite.

**V3 démarquage actif** demande un changement de modèle qualitativement
différent : le moteur **modifie** la trajectoire pendant la lecture en
fonction de ce que fait la défense. C'est un saut architectural :

- **Data model** — qui possède le path final affiché ? L'utilisateur ?
  Le moteur ? Les deux (path "dessiné" + override "réactif") ?
- **Couplage** — V1/V2/V4 sont **stateless** (profil pré-calculable une
  fois par annotation, mémoïsable). V3 dépend du contexte runtime (positions
  défenseurs interpolées à chaque frame) → couplage fort avec `frameResolver`,
  pas mémoïsable simplement.
- **Concept basket** — qu'est-ce qu'un "démarquage actif" exactement ?
  C'est multiple : (a) lire une stance defender et choisir le côté du cut,
  (b) attendre/accélérer le timing du cut selon le défenseur, (c) modifier
  l'amplitude d'un V-cut selon que le défenseur a mordu ou pas, (d) sortir
  d'un écran du côté que la défense laisse ouvert. Pas un seul mécanisme.

Le projet mérite une session dédiée pour décider du périmètre, du modèle
de données, et du protocole d'interaction avec le `frameResolver`. Ce RFC
capture l'analyse pour amorcer cette session.

## Trois approches possibles

### Approche A — Modulation locale du profil de vitesse

L'attaquant garde son path dessiné. Le profil de vitesse intègre un nouveau
facteur "lecture défensive" :

`v(s) = (feinte × friction × lectureDéf) / (1 + α κ(s))`

où `lectureDéf(s) ∈ [floor, 1.5]` peut accélérer (le défenseur a mordu
sur la feinte → on accélère pour le dépasser) ou ralentir (le défenseur
est sur la ligne → on attend).

**Avantages.**
- Reste dans le cadre Phy.O existant (modulation de vitesse).
- Pas de modification du data model (annotation reste owner du path).
- Cacheable avec invalidation sur hash défenseurs (comme V2 obstacles).
- Implémentation incrémentale (~1-2j).

**Limites.**
- Ne change PAS la forme du path. Si le coach a dessiné un cut sharp à
  gauche mais que la défense est gauche, le joueur va quand même à gauche
  (juste plus ou moins vite). Donc pas de "vraie" réaction tactique.
- Couvre (b) et partiellement (c), pas (a) ni (d).

**Verdict.** Bon premier jet. Maximum de valeur pour un effort raisonnable.
Couvre les cas où le path est déjà dans la bonne direction et le démarquage
est temporel (waiting, accélération). C'est la **recommandation V3 V1**.

### Approche B — Override de path par règles déclaratives

Sur chaque annotation, ajouter un champ `reactiveBehavior?: ReactiveRule[]` où
`ReactiveRule` est une règle déclarative : "si défenseur sur le côté gauche
de la ligne porteur→panier, alors symétriser le path autour de cette ligne",
ou "si défenseur over-screen, choisir la branche under". Le moteur applique
les règles pendant la lecture, produisant un path effectif différent du path
dessiné.

**Avantages.**
- Couvre (a) et (d) — vraie réaction de forme, pas juste de timing.
- Déclaratif → lisible / explainable.
- L'overhead par frame reste borné (évalue N règles vs M défenseurs).

**Limites.**
- Très lourd : il faut concevoir un mini-DSL des règles, un éditeur UI, des
  conditions/actions, du débugging.
- Path effectif != path dessiné → la cohérence visuelle souffre (le coach
  voit ce qu'il a dessiné dans l'éditeur, mais la lecture montre autre chose).
- Le coach peut perdre le contrôle. Trop magique.
- Effort 3-5j minimum.

**Verdict.** Trop d'inconnues UX. Pas en V3 V1.

### Approche C — Réutiliser le système Play IA existant

Le projet a déjà un `offBallMover` (`src/lib/logic/match/decisions/offBallMover.ts`)
qui gère le démarquage actif côté ATTACK pour le mode IA (Play IA / matchLoop).
Il fait des décisions cut / drift / relocate / stay basées sur la défense.

V3 V1 = **réutiliser cette logique** dans le mode édition aussi : pendant
la lecture d'un système, si flag `attackerActiveDemarquage` activé, faire
tourner une version simplifiée du `offBallMover` qui *suggère* des micro-ajustements
de path à appliquer en surimpression du path dessiné.

**Avantages.**
- Code déjà existant, déjà testé.
- Cohérence : le démarquage en mode édition se comporte comme en mode IA.

**Limites.**
- `offBallMover` est conçu pour générer un mouvement complet depuis zéro,
  pas pour modifier un mouvement existant. Adaptation non-triviale.
- Conflit conceptuel : pendant l'édition, le coach attend que le joueur
  suive ce qu'il a dessiné. Une réaction "automatique" peut surprendre.
- Effort 2-3j (adaptation + intégration).

**Verdict.** Bonne piste à mi-long terme. Pas en V3 V1 (risque
architectural).

## Recommandation V3 V1

**Approche A** (modulation locale du profil de vitesse), réduite au minimum
viable :

1. **Un seul mécanisme V1** : le facteur `lectureDéf(s)` est calculé pour le
   défenseur **matché** de l'attaquant, et ne fait que **ralentir** (jamais
   accélérer). Si le matched defender est près de la ligne `from→to` de
   l'attaquant, on ralentit le joueur autour du point de plus grande
   proximité (le coach laisse plus de temps au défenseur de réagir / mordre).
2. **Math** : exactement le pattern V2 friction, mais filtré au seul
   matched defender (`state.matchups[attackerId]`).
3. **Cache** : extension de `obstaclesHash` pour distinguer "all obstacles"
   vs "matched only" — ou nouveau facteur séparé dans la clé.
4. **Flag** : `state.attackerActiveDemarquage` (opt-in, distinct de
   `attackerVelocityProfileEnabled` pour permettre l'A/B).

**Tests** : 3-4 unitaires sur le `lectureDéf` (path libre vs path avec
matched defender dessus).

**Effort estimé** : ~3-4h (mirror très direct de V2 friction).

**Plan succincte** (à expansionner dans un vrai plan d'impl) :

| # | Tâche | Effort |
|---|---|---|
| 1 | Constants + flag `attackerActiveDemarquage` | 30 min |
| 2 | Helper `computeDefenseReadingFactors(samples, matchedDefenderPos)` dans `velocityProfile.ts` + 4 tests TDD | 1.5h |
| 3 | Câblage `getOrBuildProfile` (clé + arg) + `frameResolver` (résoudre le matched defender position mid-segment) | 1h |
| 4 | Validation + ROADMAP | 30 min |

## V3 V2/V3/Vn — extensions futures

| Version | Mécanisme | Approche | Effort |
|---|---|---|---|
| V3 V2 | Choix du côté du cut basé sur la stance defender (gauche/droite) | B (règles déclaratives) sur la simple règle `flipPathIfDefenderOnSide` | 1j |
| V3 V3 | Sortie tangentielle d'écran adaptée au choix du screenRule défensif | B avec règle dédiée écran | 1j |
| V3 V4 | Cut amplifié si le défenseur a mordu une feinte (lecture défensive proactive) | A + état runtime | 1j |
| V3 V5 | Intégration partielle de `offBallMover` pour suggestions de path | C | 2-3j |

## Pourquoi ne pas implémenter V3 V1 dans cette session

- La session a déjà livré 7 chantiers (B.2, A.2, D.4 V1+V2, A.3, E.2,
  Phy.O V1, Phy.O V2+UI, Phy.O V4). Le contexte est lourd.
- V3 introduit un mécanisme nouveau (lecture défensive) qui mérite un
  premier batch dédié et reposé pour itérer les choix de modèle.
- L'analyse de ce RFC est la livraison la plus utile de cette session
  pour V3 — elle débloque la session suivante.

## Recommandation au user

Reprendre V3 V1 (approche A, scope minimal ci-dessus) en session dédiée.
Ce RFC est le point de départ. Première décision à valider en session
dédiée : "matched defender seul (V1)" vs "tous les défenseurs proches"
(plus puissant mais conflit potentiel avec V2 friction).

## Fichiers (RFC seul)

- **Créer** : `docs/superpowers/specs/2026-05-23-active-getting-open-RFC.md`
  (ce document).
