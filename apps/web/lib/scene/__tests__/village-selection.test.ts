import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import {
  allDwellingsTarget,
  dwellingsTarget,
  nextSelection,
  presentTarget,
  selectedDwellingIds,
  selectsAllDwellings,
} from '../village-selection';

// Výběr víc obydlí (migration.md): Ctrl / Shift + klik přidá nebo ubere, Ctrl + A všechna.

const dwelling = (id: number, built = true): SceneVillage['dwellings'][number] => ({
  id,
  type: 'zemnice',
  position: { x: id * 10, z: 0, rotation: 0 },
  built,
  progress: built ? 1 : 0.2,
});
const village: SceneVillage = {
  dwellings: [dwelling(1), dwelling(2), dwelling(3), dwelling(40, false)],
  fields: [],
};

describe('nextSelection', () => {
  it('bez modifikátoru vybere, co je pod kurzorem; prázdná zem výběr zruší', () => {
    expect(nextSelection(null, { kind: 'dwelling', id: 1 }, false)).toEqual({
      kind: 'dwelling',
      id: 1,
    });
    expect(nextSelection({ kind: 'dwellings', ids: [1, 2] }, null, false)).toBeNull();
    expect(nextSelection({ kind: 'dwelling', id: 1 }, { kind: 'field', id: 5 }, false)).toEqual({
      kind: 'field',
      id: 5,
    });
  });

  it('s Ctrl / Shift přidá obydlí k výběru a znovu ho ubere', () => {
    const one = nextSelection(null, { kind: 'dwelling', id: 1 }, true);
    expect(one).toEqual({ kind: 'dwelling', id: 1 });
    const two = nextSelection(one, { kind: 'dwelling', id: 3 }, true);
    expect(two).toEqual({ kind: 'dwellings', ids: [1, 3] });
    const three = nextSelection(two, { kind: 'dwelling', id: 2 }, true);
    expect(three).toEqual({ kind: 'dwellings', ids: [1, 3, 2] });
    expect(nextSelection(three, { kind: 'dwelling', id: 3 }, true)).toEqual({
      kind: 'dwellings',
      ids: [1, 2],
    });
    // ubrání z dvou nechá jedno obydlí, z jednoho nic
    expect(nextSelection(two, { kind: 'dwelling', id: 1 }, true)).toEqual({
      kind: 'dwelling',
      id: 3,
    });
    expect(nextSelection(one, { kind: 'dwelling', id: 1 }, true)).toBeNull();
  });

  it('s modifikátorem prázdná zem výběr nechá, jiný cíl než obydlí vybere sám', () => {
    const two = { kind: 'dwellings', ids: [1, 2] } as const;
    expect(nextSelection(two, null, true)).toBe(two);
    expect(nextSelection(two, { kind: 'cemetery', id: 7 }, true)).toEqual({
      kind: 'cemetery',
      id: 7,
    });
    // k poli se obydlí přidat nedá – vybere se obydlí samo
    expect(nextSelection({ kind: 'field', id: 5 }, { kind: 'dwelling', id: 2 }, true)).toEqual({
      kind: 'dwelling',
      id: 2,
    });
  });
});

describe('allDwellingsTarget a presentTarget', () => {
  it('Ctrl + A vybere všechna hotová obydlí – staveniště ne', () => {
    expect(allDwellingsTarget(village)).toEqual({ kind: 'dwellings', ids: [1, 2, 3] });
    expect(allDwellingsTarget({ dwellings: [dwelling(1)], fields: [] })).toEqual({
      kind: 'dwelling',
      id: 1,
    });
    expect(allDwellingsTarget({ dwellings: [dwelling(9, false)], fields: [] })).toBeNull();
  });

  it('zaniklá obydlí z výběru vypadnou, beze změny zůstane tentýž objekt', () => {
    const target = { kind: 'dwellings', ids: [1, 2] } as const;
    expect(presentTarget(village, target)).toBe(target);
    expect(presentTarget(village, { kind: 'dwellings', ids: [1, 99] })).toEqual({
      kind: 'dwelling',
      id: 1,
    });
    expect(presentTarget(village, { kind: 'dwellings', ids: [98, 99] })).toBeNull();
    expect(presentTarget(village, { kind: 'dwelling', id: 99 })).toBeNull();
    expect(presentTarget(village, null)).toBeNull();
    const field = { kind: 'field', id: 5 } as const;
    expect(presentTarget(village, field)).toBe(field);
  });

  it('id vybraných obydlí a výběr z id', () => {
    expect(selectedDwellingIds({ kind: 'dwelling', id: 4 })).toEqual([4]);
    expect(selectedDwellingIds({ kind: 'dwellings', ids: [4, 5] })).toEqual([4, 5]);
    expect(selectedDwellingIds({ kind: 'field', id: 4 })).toEqual([]);
    expect(selectedDwellingIds(null)).toEqual([]);
    expect(dwellingsTarget([])).toBeNull();
  });
});

describe('selectsAllDwellings', () => {
  const key = (
    code: string,
    mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
  ) => ({
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });

  it('Ctrl + A a Cmd + A, samotné A (posun kamery) ani s Alt / Shift ne', () => {
    expect(selectsAllDwellings(key('KeyA', { ctrlKey: true }))).toBe(true);
    expect(selectsAllDwellings(key('KeyA', { metaKey: true }))).toBe(true);
    expect(selectsAllDwellings(key('KeyA'))).toBe(false);
    expect(selectsAllDwellings(key('KeyA', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(selectsAllDwellings(key('KeyA', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(selectsAllDwellings(key('KeyZ', { ctrlKey: true }))).toBe(false);
  });
});
