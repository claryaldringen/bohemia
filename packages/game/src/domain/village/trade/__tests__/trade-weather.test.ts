import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { DISASTER_TRADE, DISASTER_WILDLIFE } from '../../rules/rules-disasters';
import { goodWorth, sellPrice } from '../trade';
import { horsePenPayment } from '../../livestock/horse-pen-payment';
import { craftCoverage } from '../../crafts/crafts';
import { tradeSeason, tradeWeather } from '../trade-weather';
import type { VillageState, YearWeather } from '../../types';
import { wildlifeYearDay, withWildlife } from '../../wildlife/wildlife';
import { WILDLIFE_LAND } from '../../rules/rules-wildlife';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Hodnota zboží a zvěř podle počasí kraje (disasters.md – Co z toho plyne, Obchod a Zvěř): hodnota
// zboží po zlém a krutém roce, zvěř po zlé zimě a suchu, ves bez počasí beze změny.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 12, 1); // rok obchodu 600 (doplněno 1. 11. 600)

type Forced = Partial<Pick<YearWeather, 'summer' | 'winter'>>;

function village(forced: Forced | null, year = 600): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = DAY;
  if (forced) s.disasters = { override: { weather: { [year]: forced } } };
  return s;
}

describe('zboží po zlém roce', () => {
  it('hodnota zboží: normální rok 1, po zlém 0,67, po krutém 0,5', () => {
    expect(tradeWeather(village(null), 600)).toEqual({ goodsValue: 1 });
    expect(tradeWeather(village({ summer: 'dry' }), 600)).toEqual({ goodsValue: 0.67 });
    expect(tradeWeather(village({ summer: 'wet' }), 600)).toEqual(DISASTER_TRADE.bad);
    expect(tradeWeather(village({ summer: 'drought' }), 600)).toEqual({ goodsValue: 0.5 });
    expect(tradeWeather(village({ summer: 'wetHarvest' }), 600)).toEqual(DISASTER_TRADE.cruel);
    // holomráz se zlým létem je krutý rok, holomráz sám ne
    expect(tradeWeather(village({ summer: 'dry', winter: 'blackFrost' }), 600).goodsValue).toBe(
      0.5,
    );
    expect(tradeWeather(village({ winter: 'blackFrost' }), 600).goodsValue).toBe(1);
  });

  it('rok obchodu začíná 1. 11. – zlý rok 600 platí až od 1. 11. 600', () => {
    expect(tradeSeason(DAY)).toBe(600);
    expect(tradeSeason(at(600, 10, 31))).toBe(599);
    expect(tradeSeason(at(600, 11, 1))).toBe(600);
    const cruel = village({ summer: 'drought' });
    expect(goodWorth(cruel, 'cows', at(600, 10, 1))).toBe(1);
    expect(goodWorth(cruel, 'cows', DAY)).toBe(0.5);
  });

  it('ves bez počasí: hodnota zboží beze změny', () => {
    const s = village(null);
    expect(s.weatherSeed).toBeUndefined();
    expect(tradeWeather(s, 600)).toEqual({ goodsValue: 1 });
  });
});

describe('násobek ceny platí pro veškerý obchod', () => {
  it('goodWorth: obilí 1, zboží ×0,67 / ×0,5, ves bez počasí 1', () => {
    expect(goodWorth(village(null), 'cows', DAY)).toBe(1);
    expect(goodWorth(village({ summer: 'dry' }), 'cows', DAY)).toBe(0.67);
    expect(goodWorth(village({ summer: 'drought' }), 'ironBars', DAY)).toBe(0.5);
    expect(goodWorth(village({ summer: 'drought' }), 'grain', DAY)).toBe(1);
  });

  it('platba za ohradu koní hřivnami po krutém roce potřebuje dvakrát víc hřiven', () => {
    const make = (forced: Forced | null): VillageState => {
      const s = village(forced);
      s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 5000 };
      return s;
    };
    const plain = make(null);
    const cruel = make({ summer: 'drought' });
    const a = horsePenPayment(plain, DAY, craftCoverage(plain, DAY))!;
    const b = horsePenPayment(cruel, DAY, craftCoverage(cruel, DAY))!;
    expect(a.ironBarsKg).toBeGreaterThan(0);
    expect(b.ironBarsKg).toBeGreaterThanOrEqual(2 * a.ironBarsKg - 1);
    expect(b.ironBarsKg * sellPrice('ironBars') * 0.5).toBeGreaterThanOrEqual(5600 - 1e-6);
  });
});

describe('zvěř po zlém počasí', () => {
  const MAY = at(600, 5, 1);
  const LAND = WILDLIFE_LAND.defaultLand;

  /** Zvěř hluboko pod stropem, ať je vidět jen úbytek a přírůstek. */
  function wild(forced: Forced | null, prev: Forced | null = null): VillageState {
    const s = village(forced);
    if (prev) {
      const weather: Record<number, Forced> = { 599: prev };
      if (forced) weather[600] = forced;
      s.disasters = { override: { weather } };
    }
    const w = withWildlife(s, null);
    const wl = w.wildlife!;
    wl.land = LAND;
    wl.deer = { stags: 1, hinds: 2, calves: 0 };
    wl.boar = { adults: 2, piglets: 0 };
    return w;
  }
  const after = (s: VillageState): VillageState => {
    wildlifeYearDay(s, MAY, null);
    return s;
  };

  it('holomráz a dlouhá zima: −10 % jelení a −15 % prasat navíc', () => {
    const base = after(wild(null)).wildlife!;
    for (const winter of ['blackFrost', 'long'] as const) {
      const w = after(wild({ winter })).wildlife!;
      expect(w.deer.hinds).toBeCloseTo(
        base.deer.hinds * (1 - DISASTER_WILDLIFE.badWinterDeerLoss),
        6,
      );
      expect(w.deer.stags).toBeCloseTo(
        base.deer.stags * (1 - DISASTER_WILDLIFE.badWinterDeerLoss),
        6,
      );
      expect(w.boar.adults).toBeCloseTo(
        base.boar.adults * (1 - DISASTER_WILDLIFE.badWinterBoarLoss),
        6,
      );
    }
  });

  it('kruté sucho loni: poloviční selata, ostatní beze změny', () => {
    const base = after(wild(null)).wildlife!;
    const dry = after(wild(null, { summer: 'drought' })).wildlife!;
    expect(dry.boar.adults).toBeCloseTo(base.boar.adults, 6);
    expect(dry.boar.piglets).toBeCloseTo(
      base.boar.piglets * DISASTER_WILDLIFE.droughtPigletShare,
      6,
    );
    expect(dry.deer).toEqual(base.deer);
    // obyčejné sucho selata nekrátí
    const plain = after(wild(null, { summer: 'dry' })).wildlife!;
    expect(plain.boar.piglets).toBeCloseTo(base.boar.piglets, 6);
  });
});
