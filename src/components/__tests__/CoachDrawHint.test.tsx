// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CoachDrawHint } from '../CoachDrawHint';

afterEach(cleanup);

describe('CoachDrawHint', () => {
  it('guide le coach quand le système est vierge', () => {
    const { getByRole } = render(createElement(CoachDrawHint, { visible: true }));
    const hint = getByRole('note');
    expect(hint.textContent).toContain('Glisse depuis un joueur');
    expect(hint.textContent).toContain('+ étape');
    // Ne bloque pas le dessin sous le bandeau.
    expect(hint.style.pointerEvents).toBe('none');
  });

  it("disparaît quand le système n'est plus vierge", () => {
    const { queryByRole } = render(createElement(CoachDrawHint, { visible: false }));
    expect(queryByRole('note')).toBeNull();
  });
});
