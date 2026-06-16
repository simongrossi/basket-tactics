import { describe, it, expect } from 'vitest';
import type { UserLibrary } from '../library';
import {
  makeSession,
  makeFreeBlock,
  makeSystemBlock,
  sessionTotalMinutes,
  formatMinutes,
  addBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  isOrphanBlock,
  addSession,
  updateSession,
  deleteSession,
  renameSession,
  duplicateSession,
  getSessions,
} from '../practiceSessions';

function emptyLib(): UserLibrary {
  return { version: 1, folders: [{ id: 'f1', name: 'Mes systèmes', systems: [], createdAt: 0 }] };
}

describe('factories', () => {
  it('makeSession : nom, blocs vides, timestamps', () => {
    const s = makeSession('Séance 1');
    expect(s.name).toBe('Séance 1');
    expect(s.blocks).toEqual([]);
    expect(s.id).toMatch(/^sess-/);
  });
  it('makeFreeBlock / makeSystemBlock', () => {
    const f = makeFreeBlock('Échauffement', 12);
    expect(f.kind).toBe('free');
    expect(f.durationMin).toBe(12);
    expect(f.systemId).toBeUndefined();
    const sy = makeSystemBlock('sys-1', 'PnR central', 20);
    expect(sy.kind).toBe('system');
    expect(sy.systemId).toBe('sys-1');
    expect(sy.title).toBe('PnR central');
  });
});

describe('sessionTotalMinutes / formatMinutes', () => {
  it('somme les durées, ignore les négatifs', () => {
    let s = makeSession('x');
    s = addBlock(s, makeFreeBlock('a', 10));
    s = addBlock(s, makeSystemBlock('sys', 'b', 20));
    s = addBlock(s, { ...makeFreeBlock('c', -5) });
    expect(sessionTotalMinutes(s)).toBe(30);
  });
  it('formatMinutes : min / heures', () => {
    expect(formatMinutes(45)).toBe('45min');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(65)).toBe('1h05');
    expect(formatMinutes(125)).toBe('2h05');
  });
});

describe('block ops', () => {
  it('addBlock ajoute en fin', () => {
    let s = makeSession('x');
    s = addBlock(s, makeFreeBlock('a', 5));
    s = addBlock(s, makeFreeBlock('b', 5));
    expect(s.blocks.map((b) => b.title)).toEqual(['a', 'b']);
  });
  it('updateBlock patch un champ par id', () => {
    let s = addBlock(makeSession('x'), makeFreeBlock('a', 5));
    const id = s.blocks[0].id;
    s = updateBlock(s, id, { title: 'a2', durationMin: 8, notes: 'note' });
    expect(s.blocks[0]).toMatchObject({ title: 'a2', durationMin: 8, notes: 'note' });
  });
  it('deleteBlock retire par id', () => {
    let s = addBlock(makeSession('x'), makeFreeBlock('a', 5));
    const id = s.blocks[0].id;
    s = deleteBlock(s, id);
    expect(s.blocks).toHaveLength(0);
  });
  it('moveBlock up/down', () => {
    let s = makeSession('x');
    s = addBlock(s, makeFreeBlock('a', 5));
    s = addBlock(s, makeFreeBlock('b', 5));
    s = addBlock(s, makeFreeBlock('c', 5));
    const bId = s.blocks[1].id;
    expect(moveBlock(s, bId, 'up').blocks.map((b) => b.title)).toEqual(['b', 'a', 'c']);
    expect(moveBlock(s, bId, 'down').blocks.map((b) => b.title)).toEqual(['a', 'c', 'b']);
  });
  it('moveBlock aux bornes : no-op', () => {
    let s = addBlock(makeSession('x'), makeFreeBlock('a', 5));
    const id = s.blocks[0].id;
    expect(moveBlock(s, id, 'up').blocks.map((b) => b.title)).toEqual(['a']);
    expect(moveBlock(s, id, 'down').blocks.map((b) => b.title)).toEqual(['a']);
  });
});

describe('isOrphanBlock', () => {
  it('bloc libre : jamais orphelin', () => {
    expect(isOrphanBlock(makeFreeBlock('a'), emptyLib())).toBe(false);
  });
  it('bloc système absent → orphelin ; présent → non', () => {
    const lib: UserLibrary = {
      version: 1,
      folders: [{ id: 'f1', name: 'F', createdAt: 0, systems: [{ id: 'sys-1' } as never] }],
    };
    expect(isOrphanBlock(makeSystemBlock('sys-1', 'x'), lib)).toBe(false);
    expect(isOrphanBlock(makeSystemBlock('sys-404', 'x'), lib)).toBe(true);
  });
});

describe('session CRUD (UserLibrary)', () => {
  it('add / get / delete', () => {
    let lib = emptyLib();
    const s = makeSession('S1');
    lib = addSession(lib, s);
    expect(getSessions(lib)).toHaveLength(1);
    lib = deleteSession(lib, s.id);
    expect(getSessions(lib)).toHaveLength(0);
  });
  it('updateSession remplace par id et rafraîchit updatedAt', () => {
    let lib = addSession(emptyLib(), makeSession('S1'));
    const s = getSessions(lib)[0];
    const edited = { ...s, name: 'S1 modifiée', blocks: [makeFreeBlock('a', 5)] };
    lib = updateSession(lib, edited);
    expect(getSessions(lib)[0].name).toBe('S1 modifiée');
    expect(getSessions(lib)[0].blocks).toHaveLength(1);
  });
  it('renameSession', () => {
    let lib = addSession(emptyLib(), makeSession('S1'));
    const id = getSessions(lib)[0].id;
    lib = renameSession(lib, id, 'Nouveau');
    expect(getSessions(lib)[0].name).toBe('Nouveau');
  });
  it('duplicateSession : nouvelle id, blocs ré-idés, suffixe copie', () => {
    let lib = emptyLib();
    let s = makeSession('S1');
    s = addBlock(s, makeFreeBlock('a', 5));
    lib = addSession(lib, s);
    lib = duplicateSession(lib, s.id);
    const sessions = getSessions(lib);
    expect(sessions).toHaveLength(2);
    const copy = sessions[1];
    expect(copy.name).toBe('S1 (copie)');
    expect(copy.id).not.toBe(s.id);
    expect(copy.blocks[0].id).not.toBe(s.blocks[0].id);
    expect(copy.blocks[0].title).toBe('a');
  });
  it('getSessions tolère sessions absent (rétrocompat)', () => {
    expect(getSessions({ version: 1, folders: [] })).toEqual([]);
  });
});
