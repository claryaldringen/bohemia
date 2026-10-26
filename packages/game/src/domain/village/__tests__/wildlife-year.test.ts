import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { WILDLIFE_LAND } from '../rules-wildlife';
import { advanceVillage } from '../simulate';
import type { VillageState } from '../types';
import {
  bearBackDay,
  crowFlocks,
  freshWildlife,
  wildlifeCaps,
  wildlifeYearDay,
  withWildlife,
} from '../wildlife';
import { withBuiltFirstDwelling } from './village-fixtures';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const LAND = WILDLIFE_LAND.defaultLand;

function village(day = at(600, 4, 20)): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  return s;
}

function withStock(state: VillageState): VillageState {
  return withWildlife(state, null);
}

describe('stropy zvěře', () => {
  it('typická ves (les 190 ha, 30 prasat vsi)', () => {
    const caps = wildlifeCaps(LAND, 30);
    expect(caps.deer).toBeCloseTo(9.5, 9);
    expect(caps.boar).toBeCloseTo(8, 9);
    expect(caps.hares).toBeCloseTo(18, 9);
    expect(caps.foxes).toBe(3);
    expect(caps.wolves).toBeCloseTo(4.5, 9);
    expect(caps.bear).toBe(true);
    expect(caps.fishKg).toBeCloseTo(750, 9);
  });

  it('málo lesa: bez vlků a medvěda, lišky nejvýš 4', () => {
    const small = wildlifeCaps({ forestHa: 90, openHa: 50, waterHa: 0, pools: 0 }, 0);
    expect(small.wolves).toBe(0);
    expect(small.bear).toBe(false);
    expect(wildlifeCaps({ forestHa: 900, openHa: 900, waterHa: 0, pools: 0 }, 0).foxes).toBe(4);
    expect(wildlifeCaps({ forestHa: 250, openHa: 0, waterHa: 0, pools: 0 }, 0).wolves).toBe(5);
  });

  it('vrány: 1 hejno + 1 na 10 ha, nejvýš 5', () => {
    expect([crowFlocks(0), crowFlocks(25), crowFlocks(500)]).toEqual([1, 3, 5]);
  });

  it('nová zvěř je na stropu v poměru 2 : 5 : 3', () => {
    const w = freshWildlife(LAND, 30);
    expect(w.deer.stags + w.deer.hinds + w.deer.calves).toBeCloseTo(9.5, 9);
    expect(w.deer.hinds / w.deer.stags).toBeCloseTo(2.5, 9);
    expect(w.boar.adults).toBeCloseTo(4, 9);
    expect(w.bear.present).toBe(true);
  });
});

describe('převod', () => {
  it('ves bez wildlife dostane výchozí zvěř, převod je idempotentní', () => {
    const s = village();
    expect(s.wildlife).toBeUndefined();
    const once = withWildlife(s, null);
    expect(once.wildlife?.land).toEqual(LAND);
    expect(withWildlife(once, null)).toBe(once);
    expect(once.wildlifeFailed).toBeUndefined();
  });
});

describe('roční přepočet 1. 5.', () => {
  const day = at(601, 5, 1);
  function year(state: VillageState, d = day): VillageState {
    const next = structuredClone(state);
    wildlifeYearDay(next, d, null);
    return next;
  }

  it('jiný den než 1. 5. nic nemění', () => {
    const s = withStock(village());
    expect(year(s, at(601, 5, 2))).toEqual(s);
  });

  it('jelení zvěř: nad stropem odejdou kolouši a laně, jeleni zůstanou', () => {
    const s = withStock(village());
    const r = year(s).wildlife!;
    const before = s.wildlife!.deer;
    expect(r.deer.stags + r.deer.hinds + r.deer.calves).toBeCloseTo(9.5, 6);
    // jeleni: dospělí kolouši (půl) minus 14,5 % ztrát
    expect(r.deer.stags).toBeCloseTo((before.stags + before.calves / 2) * 0.855, 6);
  });

  it('prasata bez lovu zůstávají na stropu', () => {
    let s = withStock(village());
    s.wildlife!.boar = { adults: 1, piglets: 0 };
    for (let i = 0; i < 6; i++) s = year(s);
    const cap = wildlifeCaps(s.wildlife!.land, s.livestock?.herds.pig ?? 0).boar;
    expect(s.wildlife!.boar.adults + s.wildlife!.boar.piglets).toBeCloseTo(cap, 6);
  });

  it('zajíci ×2 nejvýš strop, vlci doplní polovinu chybějícího, ryby nejvýš čtvrtinu stropu', () => {
    const s = withStock(village());
    s.wildlife!.hares = 5;
    s.wildlife!.wolves = 0;
    s.wildlife!.fishKg = 750 / 2;
    const a = year(s).wildlife!;
    expect(a.hares).toBe(10);
    expect(a.wolves).toBeCloseTo(2.25, 9);
    expect(a.fishKg - 375).toBeCloseTo(187.5, 9);
    const b = year(year(s), at(602, 5, 1)).wildlife!;
    expect(b.wolves).toBeCloseTo(2.25 + (4.5 - 2.25) / 2, 9);
    expect(b.hares).toBe(18);
  });

  it('medvěd se vrátí po třech letech a kronika to zapíše', () => {
    const s = withStock(village());
    const kill = at(600, 11, 5);
    s.wildlife!.bear = { present: false, backDay: bearBackDay(kill) };
    const early = year(s, at(602, 5, 1));
    expect(early.wildlife!.bear.present).toBe(false);
    const back = year(s, at(604, 5, 1));
    expect(back.wildlife!.bear).toEqual({ present: true, backDay: null });
    expect(back.chronicle.at(-1)?.kind).toBe('bear-returned');
  });
});

describe('po kouscích', () => {
  it('1, 7, 30 a 365 dní přes 1. 5. dají týž stav', () => {
    const start = at(600, 4, 25);
    const s = withStock(village(start));
    for (const days of [1, 7, 30, 365]) {
      const to = start + days;
      const whole = advanceVillage(s, to, null);
      let chunked = s;
      let cursor = start;
      while (cursor < to) {
        cursor = Math.min(to, cursor + 3);
        chunked = advanceVillage(chunked, cursor, null);
      }
      expect(chunked.wildlife).toEqual(whole.wildlife);
      expect(chunked).toEqual(whole);
    }
  }, 120_000);

  it('ves bez wildlife ji po dopočtu dostane a 1. 5. přepočte', () => {
    const start = at(600, 4, 25);
    const advanced = advanceVillage(village(start), start + 10, null);
    expect(advanced.wildlife).toBeDefined();
  });
});
