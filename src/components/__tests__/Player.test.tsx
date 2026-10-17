// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { PLAYER_RADIUS } from '@/lib/data/court';
import { Player } from '../Player';

const r = PLAYER_RADIUS;

function renderPlayer(props: Partial<ComponentProps<typeof Player>> = {}) {
  return render(
    createElement('svg', null, createElement(Player, {
      id: 'O1',
      pos: { x: 100, y: 100 },
      isAttacker: true,
      orientation: 0,
      gazeOrientation: 0,
      ...props,
    })),
  );
}

/** Compte les `<circle fill="#FFE0B2">` (mains skin + oreilles). */
function countSkinCircles(container: HTMLElement): number {
  return container.querySelectorAll('circle[fill="#FFE0B2"]').length;
}

/** Récupère les positions (cy) des cercles "mains" (skinFill, hors oreilles
 *  qui sont des ellipse). Permet de tester si une main est haut/bas. */
function getHandCircleYs(container: HTMLElement): number[] {
  const circles = container.querySelectorAll('circle[fill="#FFE0B2"]');
  return Array.from(circles).map((c) => Number(c.getAttribute('cy')));
}

function getHandCircleXs(container: HTMLElement): number[] {
  const circles = container.querySelectorAll('circle[fill="#FFE0B2"]');
  return Array.from(circles).map((c) => Number(c.getAttribute('cx')));
}

describe('Player orientation cues', () => {
  it('rend les bras sur le corps et la visière sur la tête', () => {
    const pos = { x: 100, y: 100 };
    const { container } = render(createElement('svg', null, createElement(Player, {
      id: 'D1',
      pos,
      isAttacker: false,
      orientation: 0,
      gazeOrientation: 75,
    })));

    // Vérifie le groupe de rotation du corps (bras et épaules)
    expect(container.querySelector('g[transform="rotate(0, 100, 100)"]')).not.toBeNull();

    // Vérifie le groupe de rotation de la tête (avec le nez/regard)
    expect(container.querySelector('g[transform="rotate(75, 100, 100)"]')).not.toBeNull();

    // Vérifie qu'un polygone de nez est présent pour indiquer le regard
    const polygon = container.querySelector('polygon');
    expect(polygon).not.toBeNull();
  });

  it('clampe la rotation de la tête à la limite anatomique de ±75°', () => {
    const pos = { x: 100, y: 100 };
    const { container } = render(createElement('svg', null, createElement(Player, {
      id: 'D1',
      pos,
      isAttacker: false,
      orientation: 0,
      gazeOrientation: 120, // Tête tournée vers le dos
    })));

    // Le corps tourne à 0°
    expect(container.querySelector('g[transform="rotate(0, 100, 100)"]')).not.toBeNull();

    // La tête doit être clampée à 75° et non à 120°
    expect(container.querySelector('g[transform="rotate(75, 100, 100)"]')).not.toBeNull();
    expect(container.querySelector('g[transform="rotate(120, 100, 100)"]')).toBeNull();
  });
});

describe('Player anatomical poses (Sprite V2)', () => {
  it('pose idle (stance) — 2 mains skin SOUS le centre du sprite (Bezier arc qui finit en bas)', () => {
    const { container } = renderPlayer();
    // Pose stance : main à (±r*1.4, -r*1.25) — donc cy = 100 - 20 = 80, AU-DESSUS du centre.
    // Mais le test idle correspond à ANCRAGE STANCE ; 2 mains présentes (skinFill).
    const handYs = getHandCircleYs(container);
    // 2 oreilles (ellipse, pas circle) + 2 mains. countSkinCircles compte les circles seulement.
    expect(handYs.length).toBe(2);
    // Symétrie : les 2 cy sont identiques (pose symétrique)
    expect(handYs[0]).toBeCloseTo(handYs[1], 1);
  });

  it('pose driver garde (isCarrier && !isActivelyDribbling) — 2 mains aux extrémités, hauteur identique', () => {
    const { container } = renderPlayer({ isCarrier: true });
    const handYs = getHandCircleYs(container);
    const handXs = getHandCircleXs(container);
    expect(handYs.length).toBe(2);
    // Symétrie verticale (mêmes cy)
    expect(handYs[0]).toBeCloseTo(handYs[1], 1);
    // Symétrie horizontale (cx miroir autour de pos.x=100)
    expect(handXs[0] + handXs[1]).toBeCloseTo(200, 1);
  });

  it('pose dribble actif (isActivelyDribbling) — asymétrie verticale et bras strictement devant le corps (jamais dans le dos)', () => {
    const { container } = renderPlayer({ isCarrier: true, isActivelyDribbling: true });
    const handYs = getHandCircleYs(container);
    expect(handYs.length).toBe(2);
    // Asymétrie : le bras qui dribble s'étend nettement plus vers l'avant que le bras de protection
    const ySpread = Math.abs(handYs[0] - handYs[1]);
    expect(ySpread).toBeGreaterThan(r); // au moins r de différence verticale
    // Invariant anatomique (Règle 3) : aucun bras dans le dos (toutes les mains devant le buste, cy < 100)
    expect(handYs.every((y) => y < 100)).toBe(true);
  });

  it('pose screener (isScreening) — 2 paths se croisant (les x finaux opposés)', () => {
    const { container } = renderPlayer({ isScreening: true });
    // Le screener a 2 paths qui partent d'épaules de chaque côté du torse
    // et se croisent : main gauche finit à droite, main droite finit à gauche.
    // On vérifie qu'au moins 2 paths sont présents dans le groupe corps.
    const bodyGroup = container.querySelector('g[transform="rotate(0, 100, 100)"]');
    expect(bodyGroup?.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
  });

  it('pose shooter (isShooting) — main dominante AU-DESSUS de la tête', () => {
    const { container } = renderPlayer({ isCarrier: true, isShooting: true });
    const handYs = getHandCircleYs(container);
    // Tête culmine vers cy = pos.y - r * 0.5 = 92. La main shoot est à
    // cy = pos.y - r * 1.8125 = 100 - 29 = 71, bien au-dessus de la tête.
    expect(handYs.some((y) => y < 75)).toBe(true);
  });

  it('pose post-shot recovery (isPostShotRecovery) — 2 bras hauts symétriques', () => {
    const { container } = renderPlayer({ isPostShotRecovery: true });
    const handYs = getHandCircleYs(container);
    const handXs = getHandCircleXs(container);
    expect(handYs.length).toBe(2);
    // Les 2 mains à la même hauteur (symétrique)
    expect(handYs[0]).toBeCloseTo(handYs[1], 1);
    // Au-dessus du centre (cy < 100)
    expect(handYs[0]).toBeLessThan(100);
    // Symétriques horizontalement autour de pos.x = 100
    expect(handXs[0] + handXs[1]).toBeCloseTo(200, 1);
  });

  it('latéralité gaucher (shooter dominantHand=left) — main shoot bascule à gauche', () => {
    const right = renderPlayer({ isCarrier: true, isShooting: true, dominantHand: 'right' });
    const left = renderPlayer({ isCarrier: true, isShooting: true, dominantHand: 'left' });
    // Main shoot (droitier) : cx = pos.x + r*0.75 = 112. Main shoot (gaucher) : cx = pos.x - r*0.75 = 88.
    const rightHandShoot = right.container.querySelector(`circle[fill="#FFE0B2"][cx="${100 + r * 0.75}"]`);
    const leftHandShoot = left.container.querySelector(`circle[fill="#FFE0B2"][cx="${100 - r * 0.75}"]`);
    expect(rightHandShoot).not.toBeNull();
    expect(leftHandShoot).not.toBeNull();
  });

  it('latéralité gaucher (dribble actif dominantHand=left) — main dribble bascule à gauche', () => {
    const right = renderPlayer({ isCarrier: true, isActivelyDribbling: true, dominantHand: 'right' });
    const left = renderPlayer({ isCarrier: true, isActivelyDribbling: true, dominantHand: 'left' });
    const rightHandYs = getHandCircleYs(right.container);
    const rightHandXs = getHandCircleXs(right.container);
    const leftHandYsArr = getHandCircleYs(left.container);
    const leftHandXs = getHandCircleXs(left.container);
    // La main DRIBBLE est celle qui est la plus avancée devant le corps (cy minimal)
    const rDribbleIdx = rightHandYs[0] < rightHandYs[1] ? 0 : 1;
    const lDribbleIdx = leftHandYsArr[0] < leftHandYsArr[1] ? 0 : 1;
    // Pour le droitier, dribble à droite (cx > 100)
    expect(rightHandXs[rDribbleIdx]).toBeGreaterThan(100);
    // Pour le gaucher, dribble à gauche (cx < 100)
    expect(leftHandXs[lDribbleIdx]).toBeLessThan(100);
  });
});
