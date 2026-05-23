import { describe, expect, it } from 'vitest';
import { collectTagCounts } from '@/lib/data/library';

describe('library — collectTagCounts (hashtags)', () => {
  it('renvoie [] sur collection vide', () => {
    expect(collectTagCounts([])).toEqual([]);
  });

  it('ignore les items sans tags', () => {
    expect(collectTagCounts([{}, { tags: undefined }, {}])).toEqual([]);
  });

  it('compte chaque tag unique avec son occurrence', () => {
    const out = collectTagCounts([
      { tags: ['pnr', 'porteur'] },
      { tags: ['off-ball', 'pindown'] },
      { tags: ['pnr', 'spain', 'porteur'] },
    ]);
    expect(out).toEqual([
      { tag: 'off-ball', count: 1 },
      { tag: 'pindown', count: 1 },
      { tag: 'porteur', count: 2 },
      { tag: 'pnr', count: 2 },
      { tag: 'spain', count: 1 },
    ].sort((a, b) => a.tag.localeCompare(b.tag)));
  });

  it('trie alphabétiquement', () => {
    const out = collectTagCounts([
      { tags: ['zone', 'blob'] },
      { tags: ['touche', 'slob'] },
    ]);
    expect(out.map((t) => t.tag)).toEqual(['blob', 'slob', 'touche', 'zone']);
  });

  it('mélange templates et SavedSystem (même duck-typing)', () => {
    const templates = [{ tags: ['pnr'] }, { tags: ['lab', 'pnr'] }];
    const user = [{ tags: ['ma-touche'] }];
    expect(collectTagCounts([...templates, ...user])).toEqual([
      { tag: 'lab', count: 1 },
      { tag: 'ma-touche', count: 1 },
      { tag: 'pnr', count: 2 },
    ]);
  });
});
