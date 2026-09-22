import type { AppState } from '@/lib/types';
import { importState } from './transforms/coreTransforms';

export function parseSharedHash(hash: string): { payload: string | null; playerMode: boolean } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return { payload: params.get('share'), playerMode: params.get('mode') === 'player' };
}

export async function createShareHash(state: AppState): Promise<string> {
  return '#' + new URLSearchParams({ share: await compressStateToUrl(state), mode: 'player' }).toString();
}

/**
 * Compresse un objet AppState en chaîne de caractères Base64url compressée avec l'algorithme Deflate.
 */
export async function compressStateToUrl(state: AppState): Promise<string> {
  const json = JSON.stringify({ ...state, librarySystemId: undefined });
  const stream = new Blob([json]).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream('deflate'));
  const response = new Response(compressedStream);
  const buffer = await response.arrayBuffer();
  
  const uint8 = new Uint8Array(buffer);
  let binary = '';
  const len = uint8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  const base64 = btoa(binary);
  // Conversion en URL-safe Base64 sans padding
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Décompresse une chaîne de caractères Base64url compressée vers un AppState.
 * Retourne null si le décodage ou la décompression échoue.
 */
export async function decompressStateFromUrl(payload: string): Promise<AppState | null> {
  try {
    // Restauration des caractères Base64 standards
    let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    const decompressedStream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    const response = new Response(decompressedStream);
    const text = await response.text();
    
    const parsed = JSON.parse(text) as AppState;
    // Utilisation d'importState pour normaliser, merger sur les valeurs par défaut
    // et garantir la compatibilité ascendante si le state sauvegardé est ancien
    return importState({ ...parsed, librarySystemId: undefined });
  } catch (err) {
    console.error('[urlCompression] Echec de décompression de l\'état URL :', err);
    return null;
  }
}
