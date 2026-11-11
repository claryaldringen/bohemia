import { describe, expect, it } from 'vitest';
import { createRandom, deriveSeed } from '../../../landscape/random';
import { dayIndexOf } from '../../../calendar';
import {
  christianityChance,
  discoveryYear,
  firstDiscoveryYear,
  houseFaithSeed,
  isChristian,
  npcBaptismYear,
  rodBaptized,
  threeFieldAllowed,
  withHolderFaith,
} from '../faith';
import type { Person, VillageState } from '../../types';

/** Kumulativní podíl rodů, které znají křesťanství do roku `year` včetně (christianity.md). */
function knownBy(year: number): number {
  let none = 1;
  for (let y = 500; y <= year; y++) none *= 1 - christianityChance(y);
  return 1 - none;
}

describe('christianityChance', () => {
  it('v roce 500 je nulová', () => {
    expect(christianityChance(500)).toBe(0);
    expect(christianityChance(400)).toBe(0);
  });

  it('kumulativně odpovídá tabulce návrhu', () => {
    expect(knownBy(600)).toBeGreaterThan(0.008);
    expect(knownBy(600)).toBeLessThan(0.012);
    expect(knownBy(800)).toBeGreaterThan(0.48);
    expect(knownBy(800)).toBeLessThan(0.54);
    expect(knownBy(900)).toBeGreaterThanOrEqual(0.985);
  });
});

describe('discoveryYear', () => {
  it('je deterministický', () => {
    expect(discoveryYear(123, 500, 900)).toBe(discoveryYear(123, 500, 900));
  });

  it('je první rok, kdy padne los rok po roku', () => {
    for (const seed of [1, 2, 3, 77, 4242, 99999]) {
      let expected: number | null = null;
      for (let y = 500; y <= 900; y++) {
        if (createRandom(deriveSeed(seed, 'faith:' + y)).next() < christianityChance(y)) {
          expected = y;
          break;
        }
      }
      expect(discoveryYear(seed, 500, 900)).toBe(expected);
    }
  });

  it('přehrání po kouscích dá totéž co vcelku', () => {
    for (const seed of [5, 6, 7, 8, 9]) {
      const whole = discoveryYear(seed, 500, 900);
      const first = discoveryYear(seed, 500, 700);
      const chunked = first ?? discoveryYear(seed, 701, 900);
      expect(chunked).toBe(whole);
    }
  });

  it('vrací null, když los nepadl', () => {
    expect(discoveryYear(1, 500, 500)).toBeNull();
  });
});

describe('víra', () => {
  it('isChristian a rodBaptized', () => {
    expect(isChristian({ faith: 'christian' } as Person)).toBe(true);
    expect(isChristian({} as Person)).toBe(false);
    expect(rodBaptized({} as VillageState)).toBe(false);
    expect(rodBaptized({ faith: {} } as VillageState)).toBe(false);
    expect(rodBaptized({ faith: { rodBaptizedDay: 0 } } as VillageState)).toBe(true);
  });

  it('ves NPC rodu podle jeho křtu, po jeho konci zase podle rodu hráče', () => {
    const nobles = { houseId: 'npc-1', headId: 5 };
    const baptizedNpc = { houseId: 'npc-1', baptizedDay: 9 };
    // rod hráče pokřtěný, NPC rod ne – ves řídí NPC rod
    expect(rodBaptized({ nobles, faith: { rodBaptizedDay: 3 } })).toBe(false);
    expect(rodBaptized({ nobles, faith: { nobles: baptizedNpc } })).toBe(true);
    // křest jiného (dřívějšího) NPC rodu neplatí
    expect(
      rodBaptized({ nobles: { ...nobles, houseId: 'npc-2' }, faith: { nobles: baptizedNpc } }),
    ).toBe(false);
    // NPC rod skončil (`nobles` zmizí) – platí křest rodu hráče
    expect(rodBaptized({ faith: { nobles: baptizedNpc } })).toBe(false);
    expect(rodBaptized({ faith: { rodBaptizedDay: 3, nobles: baptizedNpc } })).toBe(true);
  });

  it('trojpolí vyžaduje rok 1100 a pokřtěný rod', () => {
    expect(threeFieldAllowed(1099, true)).toBe(false);
    expect(threeFieldAllowed(1100, false)).toBe(false);
    expect(threeFieldAllowed(1100, true)).toBe(true);
  });
});

describe('los rodu (christianity.md – Objev, Křest rodu)', () => {
  it('seed rodu je ze seedu světa a id rodu', () => {
    expect(houseFaithSeed(1, 'house-1')).toBe(deriveSeed(1, 'house:house-1'));
    expect(houseFaithSeed(1, 'house-1')).not.toBe(houseFaithSeed(1, 'house-2'));
  });

  it('první los objevu: rok založení jen pro rod žijící 1. 1., jinak příští rok; nejdřív 500', () => {
    expect(firstDiscoveryYear(0)).toBe(500);
    expect(firstDiscoveryYear(-30)).toBe(500);
    expect(firstDiscoveryYear(dayIndexOf({ year: 869, month: 1, day: 1 }))).toBe(869);
    expect(firstDiscoveryYear(dayIndexOf({ year: 869, month: 1, day: 2 }))).toBe(870);
    expect(firstDiscoveryYear(dayIndexOf({ year: 869, month: 12, day: 31 }))).toBe(870);
  });

  it('NPC rod se pokřtí 1–20 let po objevu, pevně ze seedu rodu', () => {
    const years = new Set<number>();
    for (let seed = 1; seed <= 400; seed++) {
      const year = npcBaptismYear(seed, 700);
      expect(year).toBeGreaterThanOrEqual(701);
      expect(year).toBeLessThanOrEqual(720);
      expect(npcBaptismYear(seed, 700)).toBe(year);
      years.add(year);
    }
    expect(years.size).toBe(20);
  });
});

describe('withHolderFaith – ves přejde k jinému držiteli (christianity.md – Vsi rodu)', () => {
  const base = { seed: 1, people: [] } as unknown as VillageState;
  const desecrated = { oaksOrGroves: 1, cemeteries: 1 };

  it('nepokřtěný nový rod – příznak starého rodu zmizí, zničená posvátná místa zůstanou', () => {
    const state = { ...base, faith: { rodBaptizedDay: 100, desecrated } };
    const next = withHolderFaith(state, null);
    expect(next.faith).toEqual({ desecrated });
    expect(rodBaptized(next)).toBe(false);
    expect(state.faith.rodBaptizedDay).toBe(100); // vstup beze změny
  });

  it('pokřtěný nový rod – jeho den křtu, i ve vsi bez víry', () => {
    expect(withHolderFaith({ ...base, faith: { rodBaptizedDay: 100 } }, 250).faith).toEqual({
      rodBaptizedDay: 250,
    });
    const fresh = withHolderFaith(base, 250);
    expect(fresh.faith).toEqual({ rodBaptizedDay: 250 });
    expect(rodBaptized(fresh)).toBe(true);
  });

  it('křest NPC rodu, který ves řídí, zůstává; prázdná víra zmizí celá', () => {
    const nobles = { houseId: 'npc', baptizedDay: 50 };
    expect(
      withHolderFaith({ ...base, faith: { rodBaptizedDay: 100, nobles } }, null).faith,
    ).toEqual({ nobles });
    expect('faith' in withHolderFaith({ ...base, faith: { rodBaptizedDay: 100 } }, null)).toBe(
      false,
    );
  });

  it('beze změny vrací týž stav (opakování nic nezapíše)', () => {
    const baptized = { ...base, faith: { rodBaptizedDay: 100 } };
    expect(withHolderFaith(baptized, 100)).toBe(baptized);
    expect(withHolderFaith(base, null)).toBe(base);
  });
});
