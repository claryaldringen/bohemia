import { describe, expect, it } from 'vitest';
import {
  VILLAGE_NAMES,
  VILLAGE_NAME_MAX_LENGTH,
  checkVillageName,
  normalizeVillageName,
  suggestVillageName,
} from '../names';

describe('staročeská jména vsí', () => {
  it('seznam má 30 různých jmen', () => {
    expect(VILLAGE_NAMES).toHaveLength(30);
    expect(new Set(VILLAGE_NAMES).size).toBe(30);
  });

  it('návrh je ze seznamu, pro stejný seed stejný a pro různé seedy pestrý', () => {
    expect(VILLAGE_NAMES).toContain(suggestVillageName(7));
    expect(suggestVillageName(7)).toBe(suggestVillageName(7));
    const names = new Set(Array.from({ length: 100 }, (_, seed) => suggestVillageName(seed)));
    expect(names.size).toBeGreaterThan(15);
  });

  it('jméno se ořízne a vnitřní mezery sloučí', () => {
    expect(normalizeVillageName('  Horní   Lhota ')).toBe('Horní Lhota');
  });

  it('prázdné nebo příliš dlouhé jméno neprojde', () => {
    expect(checkVillageName('   ').ok).toBe(false);
    expect(checkVillageName('x'.repeat(VILLAGE_NAME_MAX_LENGTH + 1)).ok).toBe(false);
    expect(checkVillageName(' Libice ')).toEqual({ ok: true, reason: null });
  });
});
