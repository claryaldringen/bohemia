import { describe, expect, it } from 'vitest';
import { PEACE_REASONS } from '@bohemia/game';
import { cedeBlockReason, type CedeVillage } from '../peace-cede';

const v = (id: string, settlementId: string, asleep = false): CedeVillage => ({
  id,
  name: id,
  settlementId,
  asleep,
});

describe('cedeBlockReason', () => {
  it('poslední mapa rodu nejde postoupit', () => {
    expect(cedeBlockReason([v('a', 'm1')], new Set(), 'a')).toBe(PEACE_REASONS.lastVillage);
  });

  it('ves na mapě, kde zůstane jiná mapa s živou vsí, jde', () => {
    const villages = [v('a', 'm1'), v('b', 'm2')];
    expect(cedeBlockReason(villages, new Set(), 'a')).toBeNull();
    // obě mapy dohromady by rodu nechaly prázdné ruce
    expect(cedeBlockReason(villages, new Set(['a']), 'b')).toBe(PEACE_REASONS.lastVillage);
    // vybranou vsi jde vždy odebrat
    expect(cedeBlockReason(villages, new Set(['a']), 'a')).toBeNull();
  });

  it('vymřelá ves na jiné mapě se jako zbylá nepočítá; ves na téže mapě ano', () => {
    expect(cedeBlockReason([v('a', 'm1'), v('b', 'm2', true)], new Set(), 'a')).toBe(
      PEACE_REASONS.lastVillage,
    );
    expect(cedeBlockReason([v('a', 'm1'), v('b', 'm1')], new Set(), 'a')).toBe(
      PEACE_REASONS.lastVillage,
    );
  });
});
