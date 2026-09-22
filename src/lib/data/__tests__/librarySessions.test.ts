// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { loadLibrary, type UserLibrary } from '../library';

const STORAGE_KEY = 'basket-tactics-library-v1';

describe('loadLibrary — sessions par défaut', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('expose une visualisation pour le bloc Philadelphia seedé', () => {
    const lib = loadLibrary();
    const philly = lib.sessions?.[0]?.blocks.find((b) => b.id === 'blk-philly');
    expect(philly?.templateId).toBe('drill-philadelphia');
  });

  it('migre une ancienne séance Philadelphia sans templateId', () => {
    const legacy: UserLibrary = {
      version: 1,
      folders: [],
      sessions: [
        {
          id: 'sess-legacy',
          name: 'Legacy',
          createdAt: 0,
          updatedAt: 0,
          blocks: [
            {
              id: 'blk-philly',
              kind: 'free',
              title: 'Philadelphia Drill',
              durationMin: 20,
            },
          ],
        },
      ],
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    const lib = loadLibrary();
    expect(lib.sessions?.[0]?.blocks[0].templateId).toBe('drill-philadelphia');
  });
});
