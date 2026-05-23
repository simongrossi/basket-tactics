import { describe, expect, it } from 'vitest';
import {
  createFolder,
  createStandardFolders,
  groupFoldersByType,
  setFolderType,
  type UserLibrary,
} from '@/lib/data/library';

function emptyLibrary(): UserLibrary {
  return { version: 1, folders: [] };
}

describe('library — folders typés', () => {
  it("createFolder accepte un type optionnel ; sans type → champ absent", () => {
    let lib = emptyLibrary();
    lib = createFolder(lib, 'A', 'touche');
    lib = createFolder(lib, 'B');
    expect(lib.folders).toHaveLength(2);
    expect(lib.folders[0].type).toBe('touche');
    expect(lib.folders[1].type).toBeUndefined();
  });

  it('setFolderType change le type sans toucher au nom ni aux systèmes', () => {
    let lib = emptyLibrary();
    lib = createFolder(lib, 'X', 'autre');
    const id = lib.folders[0].id;
    lib = setFolderType(lib, id, 'zone');
    expect(lib.folders[0].type).toBe('zone');
    expect(lib.folders[0].name).toBe('X');
  });

  it('setFolderType avec undefined supprime la clé `type`', () => {
    let lib = emptyLibrary();
    lib = createFolder(lib, 'X', 'indiv');
    const id = lib.folders[0].id;
    lib = setFolderType(lib, id, undefined);
    expect(lib.folders[0].type).toBeUndefined();
  });

  it("createStandardFolders crée les 5 standards quand la bibliothèque n'en a aucun", () => {
    const lib = createStandardFolders(emptyLibrary());
    const types = lib.folders.map((f) => f.type).sort();
    expect(types).toEqual(['indiv', 'press', 'touche', 'transition', 'zone']);
  });

  it("createStandardFolders saute les types déjà présents", () => {
    let lib = emptyLibrary();
    lib = createFolder(lib, 'Mes touches', 'touche');
    lib = createStandardFolders(lib);
    // 'touche' déjà présent → seuls les 4 autres sont créés.
    expect(lib.folders).toHaveLength(5);
    const types = lib.folders.map((f) => f.type).sort();
    expect(types).toEqual(['indiv', 'press', 'touche', 'transition', 'zone']);
  });

  it('groupFoldersByType regroupe + ordre canonique + skip section vide', () => {
    let lib = emptyLibrary();
    lib = createFolder(lib, 'A1', 'zone');
    lib = createFolder(lib, 'A2', 'touche');
    lib = createFolder(lib, 'A3', 'zone');
    lib = createFolder(lib, 'A4'); // sans type → autre
    const groups = groupFoldersByType(lib.folders);
    // Ordre canonique : touche avant zone avant autre. Pas de 'indiv' (vide).
    expect(groups.map((g) => g.type)).toEqual(['touche', 'zone', 'autre']);
    expect(groups[0].folders.map((f) => f.name)).toEqual(['A2']);
    expect(groups[1].folders.map((f) => f.name)).toEqual(['A1', 'A3']);
    expect(groups[2].folders.map((f) => f.name)).toEqual(['A4']);
  });

  it('groupFoldersByType — folders sans type tous groupés dans "autre"', () => {
    let lib = emptyLibrary();
    lib = createFolder(lib, 'Legacy 1');
    lib = createFolder(lib, 'Legacy 2');
    const groups = groupFoldersByType(lib.folders);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('autre');
    expect(groups[0].folders).toHaveLength(2);
  });
});
