import type { AppState, Step, DefenderPositions, ZoneConfig, ScreenRule, OffBallScreenRule, DefenderRules, AttackerHands, AttackerProfiles, DefenseSystem, DropDepth } from '../types';

/**
 * Bibliothèque utilisateur — gestion locale de systèmes sauvegardés
 * dans des dossiers personnels (U13, U15, attaque zone, fin de match…).
 *
 * Persistée dans localStorage à la clé LIBRARY_STORAGE_KEY. Indépendante
 * du AppState courant (basket-tactics-state-v1) — un système chargé
 * est copié dans AppState au moment du clic, mais la bibliothèque
 * survit indépendamment.
 */

const LIBRARY_STORAGE_KEY = 'basket-tactics-library-v1';

/** Snapshot complet d'un système : tactique + défense + profils. */
export interface SavedSystem {
  id: string;
  name: string;
  description?: string;
  /** Champs tactiques sauvegardés depuis AppState. */
  steps: Step[];
  defenseInitial: DefenderPositions;
  rules: DefenderRules;
  attackerHands?: AttackerHands;
  attackerProfiles?: AttackerProfiles;
  defenseSystem: DefenseSystem;
  zoneConfig: ZoneConfig;
  screenRule: ScreenRule;
  dropDepth: DropDepth;
  offBallScreenRule: OffBallScreenRule;
  defenseDistance: number;
  defenseMaxSpeed: number;
  triggers: AppState['triggers'];
  closeoutBoost?: number;
  denyAggressiveness?: number;
  /** Timestamps Unix ms. */
  createdAt: number;
  updatedAt: number;
}

/** Catégorie d'un dossier — sert au regroupement visuel dans la bibliothèque.
 *  Optionnel : un dossier sans type est rendu dans la section "autre". */
export type FolderType =
  | 'touche'
  | 'indiv'
  | 'zone'
  | 'press'
  | 'transition'
  | 'fin-de-match'
  | 'autre';

/** Ordre d'affichage des sections par type. */
export const FOLDER_TYPE_ORDER: FolderType[] = [
  'touche',
  'indiv',
  'zone',
  'press',
  'transition',
  'fin-de-match',
  'autre',
];

/** Libellés FR pour les sections + le select de création. */
export const FOLDER_TYPE_LABELS: Record<FolderType, string> = {
  touche: '📥 Touches',
  indiv: '🛡 Système indiv',
  zone: '🛡 Système zone',
  press: '🛡 Press',
  transition: '🏃 Transition',
  'fin-de-match': '⏱ Fin de match',
  autre: '📁 Autre',
};

/** Dossier personnel contenant des systèmes. */
export interface SavedFolder {
  id: string;
  name: string;
  systems: SavedSystem[];
  createdAt: number;
  /** Catégorie pour le regroupement (optionnel : legacy → 'autre'). */
  type?: FolderType;
}

/**
 * Preset défensif utilisateur — capture les réglages de défense **seuls**
 * (pas les attaquants ni les steps), applicable à n'importe quel système.
 *
 * Format inspiré de `DefensePreset` (presets fournis dans `defensePresets.ts`)
 * mais avec metadata utilisateur (id, name, createdAt). Persisté dans la même
 * `UserLibrary` que les SavedSystem pour mutualiser le storage.
 */
export interface UserDefensePreset {
  id: string;
  name: string;
  description?: string;
  /** Timestamp Unix ms de création. */
  createdAt: number;
  // ----- Champs défensifs (subset de l'AppState) -----
  defenseSystem: DefenseSystem;
  screenRule: ScreenRule;
  dropDepth: DropDepth;
  offBallScreenRule: OffBallScreenRule;
  defenseDistance: number;
  defenseMaxSpeed: number;
  triggers: AppState['triggers'];
  rules: DefenderRules;
  closeoutBoost?: number;
  denyAggressiveness?: number;
  // ----- B1-B10 additions -----
  scramSwitchEnabled?: boolean;
  mismatchThreshold?: number;
  hedgeAggression?: number;
  switchPolicy?: 'all' | '1-3' | '1-4' | 'none';
  autoBumpCutters?: boolean;
  postCoverage?: 'none' | 'dig' | 'double';
}

export interface UserLibrary {
  folders: SavedFolder[];
  /** Presets défensifs utilisateur. Optionnel pour rétrocompat avec les
   *  bibliothèques sauvegardées avant la v1.1 (sera initialisé à `[]` au
   *  premier chargement). */
  defensePresets?: UserDefensePreset[];
  /** Version du schéma — sert pour migrations futures. */
  version: 1;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Charge la bibliothèque depuis localStorage. Retourne une bibliothèque
 *  vide (avec un dossier "Mes systèmes" par défaut) si absente. */
export function loadLibrary(): UserLibrary {
  if (typeof window === 'undefined') return defaultLibrary();
  try {
    const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return defaultLibrary();
    const parsed = JSON.parse(raw) as UserLibrary;
    if (!parsed.folders || !Array.isArray(parsed.folders)) return defaultLibrary();
    return parsed;
  } catch {
    return defaultLibrary();
  }
}

export function saveLibrary(lib: UserLibrary): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(lib));
  } catch {
    /* quota exceeded — ignore silently */
  }
}

function defaultLibrary(): UserLibrary {
  return {
    version: 1,
    folders: [
      {
        id: uid('folder'),
        name: 'Mes systèmes',
        systems: [],
        createdAt: Date.now(),
      },
    ],
  };
}

/** Capture l'état tactique courant en SavedSystem. UI state non sauvé. */
export function snapshotFromAppState(
  state: AppState,
  name: string,
  description?: string
): SavedSystem {
  const now = Date.now();
  return {
    id: uid('sys'),
    name,
    description,
    steps: structuredClone(state.steps),
    defenseInitial: structuredClone(state.defenseInitial),
    rules: structuredClone(state.rules),
    attackerHands: state.attackerHands ? structuredClone(state.attackerHands) : undefined,
    attackerProfiles: state.attackerProfiles ? structuredClone(state.attackerProfiles) : undefined,
    defenseSystem: state.defenseSystem,
    zoneConfig: structuredClone(state.zoneConfig),
    screenRule: state.screenRule,
    dropDepth: state.dropDepth,
    offBallScreenRule: state.offBallScreenRule,
    defenseDistance: state.defenseDistance,
    defenseMaxSpeed: state.defenseMaxSpeed,
    triggers: { ...state.triggers },
    closeoutBoost: state.closeoutBoost,
    denyAggressiveness: state.denyAggressiveness,
    createdAt: now,
    updatedAt: now,
  };
}

/** Applique un système sauvegardé sur un AppState (preserve activeStep + UI). */
export function applySavedSystem(state: AppState, sys: SavedSystem): AppState {
  return {
    ...state,
    steps: structuredClone(sys.steps),
    activeStep: 0,
    defenseInitial: structuredClone(sys.defenseInitial),
    rules: structuredClone(sys.rules),
    attackerHands: sys.attackerHands ? structuredClone(sys.attackerHands) : state.attackerHands,
    attackerProfiles: sys.attackerProfiles ? structuredClone(sys.attackerProfiles) : state.attackerProfiles,
    defenseSystem: sys.defenseSystem,
    zoneConfig: structuredClone(sys.zoneConfig),
    screenRule: sys.screenRule,
    dropDepth: sys.dropDepth,
    offBallScreenRule: sys.offBallScreenRule,
    defenseDistance: sys.defenseDistance,
    defenseMaxSpeed: sys.defenseMaxSpeed,
    triggers: { ...sys.triggers },
    closeoutBoost: sys.closeoutBoost ?? state.closeoutBoost,
    denyAggressiveness: sys.denyAggressiveness ?? state.denyAggressiveness,
  };
}

// ============================================================
// CRUD pures (modifient une UserLibrary, retournent une nouvelle copie)
// ============================================================

export function addSystemToFolder(
  lib: UserLibrary,
  folderId: string,
  sys: SavedSystem
): UserLibrary {
  return {
    ...lib,
    folders: lib.folders.map((f) =>
      f.id === folderId ? { ...f, systems: [...f.systems, sys] } : f
    ),
  };
}

export function deleteSystem(lib: UserLibrary, systemId: string): UserLibrary {
  return {
    ...lib,
    folders: lib.folders.map((f) => ({
      ...f,
      systems: f.systems.filter((s) => s.id !== systemId),
    })),
  };
}

export function renameSystem(
  lib: UserLibrary,
  systemId: string,
  newName: string
): UserLibrary {
  return {
    ...lib,
    folders: lib.folders.map((f) => ({
      ...f,
      systems: f.systems.map((s) =>
        s.id === systemId ? { ...s, name: newName, updatedAt: Date.now() } : s
      ),
    })),
  };
}

export function moveSystem(
  lib: UserLibrary,
  systemId: string,
  targetFolderId: string
): UserLibrary {
  let movedSystem: SavedSystem | null = null;
  const folders = lib.folders.map((f) => {
    const idx = f.systems.findIndex((s) => s.id === systemId);
    if (idx >= 0) {
      movedSystem = f.systems[idx];
      return { ...f, systems: f.systems.filter((s) => s.id !== systemId) };
    }
    return f;
  });
  if (!movedSystem) return lib;
  const sys: SavedSystem = movedSystem;
  return {
    ...lib,
    folders: folders.map((f) =>
      f.id === targetFolderId ? { ...f, systems: [...f.systems, sys] } : f
    ),
  };
}

export function createFolder(
  lib: UserLibrary,
  name: string,
  type?: FolderType,
): UserLibrary {
  return {
    ...lib,
    folders: [
      ...lib.folders,
      {
        id: uid('folder'),
        name,
        systems: [],
        createdAt: Date.now(),
        ...(type ? { type } : {}),
      },
    ],
  };
}

/** Reclasse un dossier existant (change son type sans toucher au reste). */
export function setFolderType(
  lib: UserLibrary,
  folderId: string,
  type: FolderType | undefined,
): UserLibrary {
  return {
    ...lib,
    folders: lib.folders.map((f) => {
      if (f.id !== folderId) return f;
      if (type === undefined) {
        const { type: _t, ...rest } = f;
        return rest;
      }
      return { ...f, type };
    }),
  };
}

/** Crée les 5 dossiers standards (touche/indiv/zone/press/transition) en
 *  un clic, en sautant ceux dont le type est déjà présent. Sert au
 *  bootstrap d'une bibliothèque vide. */
export function createStandardFolders(lib: UserLibrary): UserLibrary {
  const existingTypes = new Set(
    lib.folders.map((f) => f.type).filter((t): t is FolderType => !!t),
  );
  const toCreate: FolderType[] = [
    'touche',
    'indiv',
    'zone',
    'press',
    'transition',
  ];
  const now = Date.now();
  const newFolders: SavedFolder[] = toCreate
    .filter((t) => !existingTypes.has(t))
    .map((t) => ({
      id: uid('folder'),
      name: FOLDER_TYPE_LABELS[t].replace(/^[^\s]+\s/, ''), // sans l'emoji
      systems: [],
      createdAt: now,
      type: t,
    }));
  return { ...lib, folders: [...lib.folders, ...newFolders] };
}

/** Regroupe les dossiers par type pour l'affichage. Renvoie les sections
 *  dans l'ordre canonique (`FOLDER_TYPE_ORDER`). Une section vide n'est
 *  pas incluse dans le retour. Folders sans `type` → section "autre". */
export function groupFoldersByType(
  folders: SavedFolder[],
): Array<{ type: FolderType; label: string; folders: SavedFolder[] }> {
  const buckets = new Map<FolderType, SavedFolder[]>();
  for (const f of folders) {
    const t: FolderType = f.type ?? 'autre';
    const arr = buckets.get(t) ?? [];
    arr.push(f);
    buckets.set(t, arr);
  }
  const out: Array<{ type: FolderType; label: string; folders: SavedFolder[] }> = [];
  for (const t of FOLDER_TYPE_ORDER) {
    const arr = buckets.get(t);
    if (arr && arr.length > 0) {
      out.push({ type: t, label: FOLDER_TYPE_LABELS[t], folders: arr });
    }
  }
  return out;
}

export function renameFolder(
  lib: UserLibrary,
  folderId: string,
  newName: string
): UserLibrary {
  return {
    ...lib,
    folders: lib.folders.map((f) => (f.id === folderId ? { ...f, name: newName } : f)),
  };
}

export function deleteFolder(lib: UserLibrary, folderId: string): UserLibrary {
  // Refuse de supprimer le dernier dossier — toujours en garder au moins 1.
  if (lib.folders.length <= 1) return lib;
  return { ...lib, folders: lib.folders.filter((f) => f.id !== folderId) };
}

// ============================================================
// Import / Export d'un dossier au format JSON
// ============================================================

/** Sérialise un dossier (avec ses systèmes) en JSON pour partage. */
export function exportFolderJSON(folder: SavedFolder): string {
  return JSON.stringify({ folder, exportedAt: Date.now(), version: 1 }, null, 2);
}

/** Parse un JSON exporté et l'ajoute comme nouveau dossier. Tolère les
 *  IDs dupliqués en re-générant les ids du dossier et de ses systèmes. */
export function importFolderJSON(lib: UserLibrary, json: string): UserLibrary {
  const data = JSON.parse(json) as { folder?: SavedFolder };
  if (!data.folder || !data.folder.systems) {
    throw new Error('JSON invalide : champ folder manquant');
  }
  const imported: SavedFolder = {
    id: uid('folder'),
    name: data.folder.name + ' (importé)',
    createdAt: Date.now(),
    systems: data.folder.systems.map((s) => ({
      ...s,
      id: uid('sys'),
      createdAt: s.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    })),
  };
  return { ...lib, folders: [...lib.folders, imported] };
}

// ============================================================
// Defense presets utilisateur (CRUD + snapshot/apply)
// ============================================================

/** Capture les réglages défensifs courants en `UserDefensePreset`. */
export function snapshotDefensePreset(
  state: AppState,
  name: string,
  description?: string
): UserDefensePreset {
  return {
    id: uid('preset'),
    name,
    description,
    createdAt: Date.now(),
    defenseSystem: state.defenseSystem,
    screenRule: state.screenRule,
    dropDepth: state.dropDepth,
    offBallScreenRule: state.offBallScreenRule,
    defenseDistance: state.defenseDistance,
    defenseMaxSpeed: state.defenseMaxSpeed,
    triggers: { ...state.triggers },
    rules: structuredClone(state.rules),
    closeoutBoost: state.closeoutBoost,
    denyAggressiveness: state.denyAggressiveness,
    scramSwitchEnabled: state.scramSwitchEnabled,
    mismatchThreshold: state.mismatchThreshold,
    hedgeAggression: state.hedgeAggression,
    switchPolicy: state.switchPolicy,
    autoBumpCutters: state.autoBumpCutters,
    postCoverage: state.postCoverage,
  };
}

/** Applique un `UserDefensePreset` sur un `AppState`. Conserve les steps,
 *  attaquants et UI inchangés. */
export function applyUserDefensePreset(
  state: AppState,
  preset: UserDefensePreset
): AppState {
  return {
    ...state,
    defenseSystem: preset.defenseSystem,
    screenRule: preset.screenRule,
    dropDepth: preset.dropDepth,
    offBallScreenRule: preset.offBallScreenRule,
    defenseDistance: preset.defenseDistance,
    defenseMaxSpeed: preset.defenseMaxSpeed,
    triggers: { ...preset.triggers },
    rules: structuredClone(preset.rules),
    closeoutBoost: preset.closeoutBoost ?? state.closeoutBoost,
    denyAggressiveness: preset.denyAggressiveness ?? state.denyAggressiveness,
    scramSwitchEnabled: preset.scramSwitchEnabled,
    mismatchThreshold: preset.mismatchThreshold,
    hedgeAggression: preset.hedgeAggression,
    switchPolicy: preset.switchPolicy,
    autoBumpCutters: preset.autoBumpCutters,
    postCoverage: preset.postCoverage,
  };
}

export function addDefensePreset(
  lib: UserLibrary,
  preset: UserDefensePreset
): UserLibrary {
  return {
    ...lib,
    defensePresets: [...(lib.defensePresets ?? []), preset],
  };
}

export function deleteDefensePreset(lib: UserLibrary, id: string): UserLibrary {
  return {
    ...lib,
    defensePresets: (lib.defensePresets ?? []).filter((p) => p.id !== id),
  };
}

export function renameDefensePreset(
  lib: UserLibrary,
  id: string,
  newName: string
): UserLibrary {
  return {
    ...lib,
    defensePresets: (lib.defensePresets ?? []).map((p) =>
      p.id === id ? { ...p, name: newName } : p
    ),
  };
}

export const __libraryStorageKey = LIBRARY_STORAGE_KEY;
