// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { PLAYER_RADIUS } from '@/lib/data/court';
import { Player } from '../Player';

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
