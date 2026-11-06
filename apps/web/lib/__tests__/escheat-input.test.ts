import { describe, expect, it } from 'vitest';
import type { EscheatView } from '@bohemia/game';
import { assignVillage, initialAssignment, partsOf } from '@/components/game/hud/EscheatDialog';
import { parseConsentEscheatInput, parseProposeEscheatInput } from '../escheat-input';

// Odúmrť ve webu (úloha 4.10): tvar vstupu akcí a skládání dílů v dialogu.

const view: EscheatView = {
  id: 'e-1',
  version: 0,
  ownHouseId: 'L1',
  deadName: 'Bořek',
  lords: [
    { houseId: 'L1', name: 'Vlastislav' },
    { houseId: 'L2', name: 'Kresomysl' },
  ],
  villages: [
    { id: 'a', name: 'Lhota', mapId: 'm1' },
    { id: 'b', name: 'Újezd', mapId: 'm1' },
    { id: 'c', name: 'Dvorce', mapId: 'm2' },
  ],
  vassals: [{ houseId: 'V', name: 'Mstiš' }],
  recipients: [
    { houseId: 'L1', name: 'Vlastislav', gift: false },
    { houseId: 'L2', name: 'Kresomysl', gift: false },
    { houseId: 'G', name: 'Hostivít', gift: true },
  ],
  plan: null,
  consents: [],
};

describe('EscheatDialog – díly', () => {
  it('výchozí vše vlastnímu rodu, ves přepne celou mapu, díly po příjemcích', () => {
    const start = initialAssignment(view);
    expect(partsOf(view, start)).toEqual([
      { toHouseId: 'L1', villageIds: ['a', 'b', 'c'], vassalIds: ['V'] },
    ]);
    const moved = assignVillage(view, { ...start, V: 'G' }, 'b', 'L2');
    expect(partsOf(view, moved)).toEqual([
      { toHouseId: 'L1', villageIds: ['c'], vassalIds: [] },
      { toHouseId: 'L2', villageIds: ['a', 'b'], vassalIds: [] },
      { toHouseId: 'G', villageIds: [], vassalIds: ['V'] },
    ]);
  });

  it('návrh jiného pána se předvyplní', () => {
    const planned = {
      ...view,
      plan: [{ toHouseId: 'L2', villageIds: ['c'], vassalIds: ['V'] }],
    };
    expect(initialAssignment(planned)).toMatchObject({ a: 'L1', c: 'L2', V: 'L2' });
  });
});

describe('vstup akcí odúmrti', () => {
  it('přijme jen správný tvar', () => {
    const parts = [{ toHouseId: 'L1', villageIds: ['a'], vassalIds: [] }];
    expect(parseProposeEscheatInput({ escheatId: 'e-1', parts })).toEqual({
      escheatId: 'e-1',
      parts,
    });
    expect(parseProposeEscheatInput({ escheatId: 'e-1', parts: [] })).toBeNull();
    expect(parseProposeEscheatInput({ escheatId: 'e-1', parts: [{ toHouseId: 'L1' }] })).toBeNull();
    expect(parseConsentEscheatInput({ escheatId: 'e-1', version: 2 })).toEqual({
      escheatId: 'e-1',
      version: 2,
    });
    expect(parseConsentEscheatInput({ escheatId: 'e-1', version: -1 })).toBeNull();
  });
});
