// Séances d'entraînement (coaching #3) — planification d'une séance comme un
// agenda de blocs chronométrés. Un bloc est soit un SYSTÈME de la bibliothèque
// (PnR, anti-zone…), soit un bloc LIBRE (échauffement, physique, scrimmage)
// avec titre + notes. Chaque bloc porte une durée en minutes.
//
// Persistées dans la même `UserLibrary` que les systèmes (champ `sessions`),
// pour mutualiser le storage localStorage. Toutes les fonctions sont PURES
// (retournent une nouvelle copie), comme le reste de library.ts.

import type { UserLibrary } from './library';

export type SessionBlockKind = 'system' | 'free';

export interface SessionBlock {
  id: string;
  kind: SessionBlockKind;
  /** Titre affiché. Pour un bloc système, recopié du nom du système au moment
   *  de l'ajout (sert de fallback si le système est supprimé → bloc orphelin). */
  title: string;
  /** Durée du bloc en minutes (≥ 0). */
  durationMin: number;
  notes?: string;
  /** Pour `kind: 'system'` : id du `SavedSystem` référencé. Absent pour les
   *  blocs libres. Peut devenir orphelin si le système est supprimé. */
  systemId?: string;
}

export interface PracticeSession {
  id: string;
  name: string;
  /** Date de séance optionnelle, format ISO `yyyy-mm-dd`. */
  date?: string;
  notes?: string;
  blocks: SessionBlock[];
  createdAt: number;
  updatedAt: number;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// Factories
// ============================================================

export function makeSession(name: string): PracticeSession {
  const now = Date.now();
  return { id: uid('sess'), name, blocks: [], createdAt: now, updatedAt: now };
}

export function makeFreeBlock(title: string, durationMin = 10): SessionBlock {
  return { id: uid('blk'), kind: 'free', title, durationMin };
}

export function makeSystemBlock(
  systemId: string,
  title: string,
  durationMin = 15,
): SessionBlock {
  return { id: uid('blk'), kind: 'system', title, durationMin, systemId };
}

// ============================================================
// Helpers purs sur une PracticeSession
// ============================================================

/** Durée totale de la séance en minutes (somme des blocs, négatifs ignorés). */
export function sessionTotalMinutes(session: PracticeSession): number {
  return session.blocks.reduce((acc, b) => acc + Math.max(0, b.durationMin || 0), 0);
}

/** Formatte une durée en minutes en `1h05` / `45min`. */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h${String(rest).padStart(2, '0')}`;
}

export function addBlock(session: PracticeSession, block: SessionBlock): PracticeSession {
  return { ...session, blocks: [...session.blocks, block], updatedAt: Date.now() };
}

export function updateBlock(
  session: PracticeSession,
  blockId: string,
  patch: Partial<Omit<SessionBlock, 'id' | 'kind'>>,
): PracticeSession {
  return {
    ...session,
    blocks: session.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    updatedAt: Date.now(),
  };
}

export function deleteBlock(session: PracticeSession, blockId: string): PracticeSession {
  return {
    ...session,
    blocks: session.blocks.filter((b) => b.id !== blockId),
    updatedAt: Date.now(),
  };
}

export function moveBlock(
  session: PracticeSession,
  blockId: string,
  dir: 'up' | 'down',
): PracticeSession {
  const arr = [...session.blocks];
  const idx = arr.findIndex((b) => b.id === blockId);
  if (idx < 0) return session;
  const target = dir === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= arr.length) return session;
  [arr[idx], arr[target]] = [arr[target], arr[idx]];
  return { ...session, blocks: arr, updatedAt: Date.now() };
}

/** Vrai si le bloc système référence un système absent de la bibliothèque
 *  (orphelin) — l'UI affiche un avertissement et désactive « Ouvrir ». */
export function isOrphanBlock(block: SessionBlock, lib: UserLibrary): boolean {
  if (block.kind !== 'system' || !block.systemId) return false;
  return !lib.folders.some((f) => f.systems.some((s) => s.id === block.systemId));
}

// ============================================================
// CRUD au niveau UserLibrary (champ `sessions`)
// ============================================================

export function getSessions(lib: UserLibrary): PracticeSession[] {
  return lib.sessions ?? [];
}

export function addSession(lib: UserLibrary, session: PracticeSession): UserLibrary {
  return { ...lib, sessions: [...(lib.sessions ?? []), session] };
}

export function updateSession(
  lib: UserLibrary,
  session: PracticeSession,
): UserLibrary {
  return {
    ...lib,
    sessions: (lib.sessions ?? []).map((s) =>
      s.id === session.id ? { ...session, updatedAt: Date.now() } : s,
    ),
  };
}

export function deleteSession(lib: UserLibrary, sessionId: string): UserLibrary {
  return { ...lib, sessions: (lib.sessions ?? []).filter((s) => s.id !== sessionId) };
}

export function renameSession(
  lib: UserLibrary,
  sessionId: string,
  newName: string,
): UserLibrary {
  return {
    ...lib,
    sessions: (lib.sessions ?? []).map((s) =>
      s.id === sessionId ? { ...s, name: newName, updatedAt: Date.now() } : s,
    ),
  };
}

export function duplicateSession(lib: UserLibrary, sessionId: string): UserLibrary {
  const src = (lib.sessions ?? []).find((s) => s.id === sessionId);
  if (!src) return lib;
  const now = Date.now();
  const copy: PracticeSession = {
    ...src,
    id: uid('sess'),
    name: `${src.name} (copie)`,
    blocks: src.blocks.map((b) => ({ ...b, id: uid('blk') })),
    createdAt: now,
    updatedAt: now,
  };
  return { ...lib, sessions: [...(lib.sessions ?? []), copy] };
}
