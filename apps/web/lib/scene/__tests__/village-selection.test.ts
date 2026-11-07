import type { VillageRoadEnd } from '../../road-end-view';
import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import type { VillageTarget } from '../village-picking';
import {
  describeTarget,
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
  fields: [
    { id: 5, parts: [{ id: 51, cell: { x: 2, y: 0 }, x: 37.5, z: 7.5, size: 15, stage: 'sown' }] },
  ],
  orchards: [
    {
      id: 6,
      squares: [
        {
          cell: { x: 4, y: 4 },
          x: 67.5,
          z: 67.5,
          size: 15,
          planting: 1,
          growth: 1,
          fruit: false,
        },
      ],
    },
  ],
};
const part = { kind: 'field-part', id: 5, cell: { x: 2, y: 0 } } as const;
const square = { kind: 'orchard-square', id: 6, cell: { x: 4, y: 4 } } as const;

describe('výběr všech polí (Martin 24. 10. 2026)', () => {
  const many: SceneVillage = {
    ...village,
    fields: [
      { id: 5, parts: [] },
      { id: 7, parts: [] },
    ],
  };

  it('zaniklá pole z výběru vypadnou, jedno zbylé je pole, žádné nic', () => {
    const all: VillageTarget = { kind: 'fields', ids: [5, 7] };
    expect(presentTarget(many, all)).toBe(all);
    expect(presentTarget(many, { kind: 'fields', ids: [5, 9] })).toEqual({ kind: 'field', id: 5 });
    expect(presentTarget(many, { kind: 'fields', ids: [8, 9] })).toBeNull();
  });

  it('jiný klik výběr všech polí nahradí, s Ctrl na prázdno ho nechá', () => {
    const all: VillageTarget = { kind: 'fields', ids: [5, 7] };
    expect(nextSelection(all, { kind: 'dwelling', id: 1 }, false)).toEqual({
      kind: 'dwelling',
      id: 1,
    });
    expect(nextSelection(all, null, true)).toBe(all);
  });
});

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

  it('s modifikátorem prázdná zem ani cesta či pole vybraná obydlí nezruší', () => {
    const two = { kind: 'dwellings', ids: [1, 2] } as const;
    expect(nextSelection(two, null, true)).toBe(two);
    expect(nextSelection(two, { kind: 'road', id: 7 }, true)).toBe(two);
    expect(nextSelection(two, { kind: 'cemetery', id: 7 }, true)).toBe(two);
    const one = { kind: 'dwelling', id: 1 } as const;
    expect(nextSelection(one, { kind: 'road', id: 7 }, true)).toBe(one);
    // bez vybraných obydlí se cesta vybere sama, bez modifikátoru vždy
    expect(nextSelection(null, { kind: 'road', id: 7 }, true)).toEqual({ kind: 'road', id: 7 });
    expect(nextSelection(two, { kind: 'road', id: 7 }, false)).toEqual({ kind: 'road', id: 7 });
    // k poli se obydlí přidat nedá – vybere se obydlí samo
    expect(nextSelection({ kind: 'field', id: 5 }, { kind: 'dwelling', id: 2 }, true)).toEqual({
      kind: 'dwelling',
      id: 2,
    });
  });
});

describe('klik vybere díl, dvojklik celé pole či sad (fields.md – Co hráč vidí)', () => {
  it('klik na pole vybere díl, dvojklik celé pole; sad stejně po čtvercích', () => {
    expect(nextSelection(null, part, false)).toBe(part);
    expect(nextSelection(part, part, false, true)).toEqual({ kind: 'field', id: 5 });
    expect(nextSelection(null, square, false)).toBe(square);
    expect(nextSelection(square, square, false, true)).toEqual({ kind: 'orchard', id: 6 });
  });

  it('dvojklik na obydlí, hřbitov či prázdnou zem je jako klik', () => {
    expect(nextSelection(null, { kind: 'dwelling', id: 1 }, false, true)).toEqual({
      kind: 'dwelling',
      id: 1,
    });
    expect(nextSelection(null, { kind: 'cemetery', id: 3 }, false, true)).toEqual({
      kind: 'cemetery',
      id: 3,
    });
    expect(nextSelection(part, null, false, true)).toBeNull();
  });

  it('s Ctrl / Shift díl ani celé pole vybraná obydlí nezruší', () => {
    const two = { kind: 'dwellings', ids: [1, 2] } as const;
    expect(nextSelection(two, part, true)).toBe(two);
    expect(nextSelection(two, part, true, true)).toBe(two);
    expect(nextSelection(null, part, true, true)).toEqual({ kind: 'field', id: 5 });
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

  it('díl pole a čtverec sadu, které zanikly (les, stavba), z výběru vypadnou', () => {
    expect(presentTarget(village, part)).toBe(part);
    expect(presentTarget(village, square)).toBe(square);
    expect(presentTarget(village, { ...part, cell: { x: 3, y: 0 } })).toBeNull();
    expect(presentTarget(village, { ...square, id: 7 })).toBeNull();
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

describe('výpis výběru do konzole (Martin 24. 10. 2026)', () => {
  const roads = [
    {
      id: 9,
      points: [
        { x: 0, z: 0 },
        { x: 50, z: 0 },
      ],
      grade: 'trodden' as const,
    },
    {
      id: 2,
      points: [
        { x: 50, z: 0 },
        { x: 100, z: 0 },
      ],
      grade: 'improved' as const,
    },
  ];
  it('cesta – úseky řetězu a úsek pod kurzorem', () => {
    const text = describeTarget({ kind: 'road', id: 2, segment: 9 }, { roads });
    expect(text).toMatch(/^road 2 – úseky /);
    expect(text).toContain('9');
    expect(text).toContain('kliknutý úsek 9');
  });
  it('cesta – oba konce z pohledu na ves (Martin 25. 10. 2026)', () => {
    const end = (log: string): VillageRoadEnd => ({
      kind: 'place',
      name: '',
      icon: null,
      arrow: null,
      target: null,
      log,
    });
    const text = describeTarget({ kind: 'road', id: 2, segment: 2 }, { roads }, [
      { segments: [2], ends: [end('dwelling 12'), end('junction 565')] },
    ]);
    expect(text).toMatch(/ – od dwelling 12 do junction 565$/);
  });
  it('ostatní – typ a id', () => {
    expect(describeTarget({ kind: 'dwelling', id: 5 }, { roads })).toBe('dwelling {"id":5}');
    expect(describeTarget({ kind: 'cart', id: 3 }, { roads })).toBe('cart {"id":3}');
  });
});
