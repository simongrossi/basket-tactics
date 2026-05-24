import { describe, expect, it } from 'vitest';
import {
  collectTagCounts,
  createFolder,
  normalizeTag,
  setSystemTags,
  type SavedSystem,
  type UserLibrary,
} from '@/lib/data/library';

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

describe('library — normalizeTag', () => {
  it('trim + lowercase + retire le # initial', () => {
    expect(normalizeTag('  #PNR  ')).toBe('pnr');
    expect(normalizeTag('#OFF-BALL')).toBe('off-ball');
    expect(normalizeTag('Touche')).toBe('touche');
  });

  it('remplace les espaces par des tirets', () => {
    expect(normalizeTag('fin de match')).toBe('fin-de-match');
    expect(normalizeTag('  Spain  PNR  ')).toBe('spain-pnr');
  });

  it('vide après normalisation → empty string', () => {
    expect(normalizeTag('   ')).toBe('');
    expect(normalizeTag('#')).toBe('');
  });
});

function libWithOneSystem(tags?: string[]): { lib: UserLibrary; id: string } {
  const base: UserLibrary = { version: 1, folders: [] };
  const withFolder = createFolder(base, 'F');
  const folder = withFolder.folders[0];
  const sys: SavedSystem = {
    id: 'sys-1',
    name: 'X',
    steps: [] as never,
    defenseInitial: {} as never,
    rules: {} as never,
    defenseSystem: 'man',
    zoneConfig: {} as never,
    screenRule: 'over' as never,
    dropDepth: 'medium',
    offBallScreenRule: 'over' as never,
    defenseDistance: 40,
    defenseMaxSpeed: 110,
    triggers: { drive: true, post: false, paint: false, trap: false },
    createdAt: 1,
    updatedAt: 1,
    ...(tags ? { tags } : {}),
  };
  folder.systems.push(sys);
  return { lib: withFolder, id: sys.id };
}

describe('library — setSystemTags', () => {
  it('définit les tags + normalise + déduplique', () => {
    const { lib, id } = libWithOneSystem();
    const out = setSystemTags(lib, id, ['#PNR', 'pnr', '  off-ball  ', '']);
    expect(out.folders[0].systems[0].tags).toEqual(['pnr', 'off-ball']);
  });

  it('tableau vide → tags absent', () => {
    const { lib, id } = libWithOneSystem(['pnr']);
    const out = setSystemTags(lib, id, []);
    expect(out.folders[0].systems[0].tags).toBeUndefined();
  });

  it("rafraîchit updatedAt", () => {
    const { lib, id } = libWithOneSystem(['pnr']);
    const before = lib.folders[0].systems[0].updatedAt;
    const out = setSystemTags(lib, id, ['horns']);
    expect(out.folders[0].systems[0].updatedAt).toBeGreaterThan(before);
  });

  it("ID inconnu → no-op (mais retourne quand même un new lib avec folders mappés)", () => {
    const { lib } = libWithOneSystem(['pnr']);
    const out = setSystemTags(lib, 'inconnu', ['horns']);
    expect(out.folders[0].systems[0].tags).toEqual(['pnr']);
  });
});
