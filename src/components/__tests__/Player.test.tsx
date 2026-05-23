// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { PLAYER_RADIUS } from '@/lib/data/court';
import { Player } from '../Player';

describe('Player orientation cues', () => {
  it('rend les bras sur le corps et la flèche sur le regard', () => {
    const pos = { x: 100, y: 100 };
    const { container } = render(createElement('svg', null, createElement(Player, {
      id: 'D1',
      pos,
      isAttacker: false,
      orientation: 0,
      gazeOrientation: 75,
    })));

    expect(container.querySelector('g[transform="rotate(0, 100, 100)"]')).not.toBeNull();

    const polygon = container.querySelector('polygon');
    expect(polygon).not.toBeNull();
    const [tip] = polygon!.getAttribute('points')!.split(' ');
    const [tipX, tipY] = tip.split(',').map(Number);
    const rad = (75 * Math.PI) / 180;
    expect(tipX).toBeCloseTo(pos.x + Math.sin(rad) * (PLAYER_RADIUS + 6), 3);
    expect(tipY).toBeCloseTo(pos.y - Math.cos(rad) * (PLAYER_RADIUS + 6), 3);
  });
});
