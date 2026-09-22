import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { compressStateToUrl, decompressStateFromUrl, createShareHash, parseSharedHash } from '../urlCompression';

describe('urlCompression', () => {
  it('ouvre le hash réellement généré, avec le paramètre mode lecteur', async () => {
    const state = makeInitialState();
    state.playerCount = 3;
    const hash = await createShareHash(state);
    const parsed = parseSharedHash(hash);
    expect(parsed.playerMode).toBe(true);
    expect((await decompressStateFromUrl(parsed.payload!))?.playerCount).toBe(3);
    expect(parseSharedHash('#mode=player&share=' + parsed.payload)).toEqual(parsed);
    expect(parseSharedHash('#mode=player').payload).toBeNull();
  });
  it('effectue correctement le cycle compression -> décompression', async () => {
    const s0 = makeInitialState();
    s0.playerCount = 3;
    s0.showPlayerNames = false;
    
    // Ajout de quelques données customisées
    s0.playerNames = { O1: 'Parker', D1: 'Duncan' };
    s0.playerNumbers = { O1: '9', D1: '21' };

    const compressed = await compressStateToUrl(s0);
    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(0);

    const s1 = await decompressStateFromUrl(compressed);
    expect(s1).not.toBeNull();
    expect(s1!.playerCount).toBe(3);
    expect(s1!.showPlayerNames).toBe(false);
    expect(s1!.playerNames?.O1).toBe('Parker');
    expect(s1!.playerNames?.D1).toBe('Duncan');
    expect(s1!.playerNumbers?.O1).toBe('9');
    expect(s1!.playerNumbers?.D1).toBe('21');
  });

  it('gère gracieusement les chaînes corrompues en renvoyant null', async () => {
    const s1 = await decompressStateFromUrl('invalid-base64-payload-compression-stream');
    expect(s1).toBeNull();
  });
});
