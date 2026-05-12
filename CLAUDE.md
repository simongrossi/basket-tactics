# Instructions projet — basket-tactics

Règles inviolables du projet. Toute contribution (humaine ou AI) doit
les respecter sans exception.

## Règle 1 — Aucune superposition de joueurs

**Aucun joueur ne peut chevaucher un autre joueur, peu importe l'équipe
ou le matching.** Coéquipier, adversaire, défenseur sur son homme
matché : toutes les paires doivent maintenir
`PLAYER_MIN_CLEARANCE_PX = 34 px` entre leurs centres.

Détails complets, mécanismes d'enforcement et tests garde-fous :
[docs/PLAYER-CLEARANCE.md](docs/PLAYER-CLEARANCE.md).

Toute fonction qui mute une position de joueur doit :
1. Passer par `moveAttackerInState` / `moveDefenderInState` (push-out auto), OU
2. Appeler explicitement `pushOutOfMany(target, others, PLAYER_MIN_CLEARANCE_PX)` avant le write.
3. Ajouter un test dans `overlapInvariants.test.ts`.

## Règle 2 — Commit + push systématiques après chaque modif testable

Sinon le user ne voit pas la modif sur son `npm run dev` en cours et
perd du temps à recharger. Pas de commits "WIP" qui restent locaux des
heures.

## Règle 3 — Anatomie joueur figée

- Regard jamais derrière la tête (clamp ±90° du corps).
- Bras jamais dans le dos.
- Design des bras (tracé Bezier dans `Player.tsx`) verrouillé sur le
  Design F. Ne pas modifier sans demande explicite.

## Règle 4 — Vocabulaire orientation : cibles métier

Dans les messages user, parler "panier / porteur / défenseur / homme
marqué". Jamais "nord / sud / est / ouest".

## Règle 5 — Modules séparés (pas de fusion arbitraire)

`vision.ts` et `orientation.ts` sont distincts. Seul le math pur
(`angles.ts`) peut être partagé.

---

Pour les conventions de code, structure et patterns réutilisables, voir :
- [docs/GAME-ENGINE.md](docs/GAME-ENGINE.md) — cartographie moteur
- [docs/refactoring-history.md](docs/refactoring-history.md) — patterns
- [ROADMAP.md](ROADMAP.md) — vision produit
- [IDEAS.md](IDEAS.md) — backlog technique
