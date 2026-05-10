// Seuils gameplay partagés (px). Distincts des constantes de terrain
// (court.ts) car ils décrivent des comportements joueur, pas une géométrie.

// Distance minimale parcourue par un joueur entre deux étapes pour qu'il
// soit considéré "en mouvement" : porteur en dribble (orientation suit la
// direction au lieu du panier), attaquant en course (rôle "cutter").
export const DRIBBLE_THRESHOLD_PX = 30;

// Déplacement maximal du porteur entre deux étapes pour qu'il soit considéré
// "posté" (post-up). Au-delà, on bascule en drive/dribble.
export const POST_HOLD_THRESHOLD_PX = 30;
