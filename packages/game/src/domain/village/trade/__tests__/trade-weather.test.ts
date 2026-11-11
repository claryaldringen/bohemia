import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { neighbourOf, neighbourStock } from '../neighbours';
import { DISASTER_TRADE, DISASTER_WILDLIFE } from '../../rules/rules-disasters';
import { goodWorth, sellPrice, tradeQuote } from '../trade';
import { horsePenPayment } from '../../livestock/horse-pen-payment';
import { craftCoverage } from '../../crafts/crafts';
import { productPrice } from '../../crafts/craft-buying';
import { tradeWeather } from '../trade-weather';
import type { Direction8, VillageState, YearWeather } from '../../types';
import { wildlifeYearDay, withWildlife } from '../../wildlife/wildlife';
import { WILDLIFE_LAND } from '../../rules/rules-wildlife';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Sousedé a zvěř podle počasí kraje (disasters.md – Co z toho plyne, Obchod a Zvěř): zásoba obilí
// a hodnota zboží po zlém a krutém roce, zvěř po zlé zimě a suchu, ves bez počasí beze změny.

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

const DIRECTIONS: Direction8[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** Směr souseda, který nabízí obilí (pastevci a lesní ves ho nabízejí, obilnáři ne – ti shánějí). */
function grainSeller(seed: number): Direction8 {
  return DIRECTIONS.find((d) => neighbourOf(seed, d).supply.grain !== undefined)!;
}

describe('sousedé po zlém roce', () => {
  it('násobky: normální 1 a 1, zlý ½ a 0,67, krutý ¼ a 0,5', () => {
    expect(tradeWeather(village(null), 600)).toEqual({ grainStock: 1, goodsValue: 1 });
    expect(tradeWeather(village({ summer: 'dry' }), 600)).toEqual(DISASTER_TRADE.bad);
    expect(tradeWeather(village({ summer: 'wet' }), 600)).toEqual(DISASTER_TRADE.bad);
    expect(tradeWeather(village({ summer: 'drought' }), 600)).toEqual(DISASTER_TRADE.cruel);
    expect(tradeWeather(village({ summer: 'wetHarvest' }), 600)).toEqual(DISASTER_TRADE.cruel);
    // holomráz se zlým létem je krutý rok, holomráz sám ne
    expect(tradeWeather(village({ summer: 'dry', winter: 'blackFrost' }), 600).goodsValue).toBe(
      0.5,
    );
    expect(tradeWeather(village({ winter: 'blackFrost' }), 600).goodsValue).toBe(1);
  });

  it('zásoba obilí souseda 1. 11.: plná, poloviční, čtvrtinová', () => {
    const seed = 11;
    const dir = grainSeller(seed);
    const full = neighbourOf(seed, dir).supply.grain!;
    const stock = (forced: Forced | null): number =>
      neighbourStock(village(forced), dir, DAY).supply.grain!;
    expect(stock(null)).toBe(full);
    expect(stock({ summer: 'normal' })).toBe(full);
    expect(stock({ summer: 'dry' })).toBe(Math.floor(full * 0.5));
    expect(stock({ summer: 'drought' })).toBe(Math.floor(full * 0.25));
  });

  it('jiné zboží se nekrátí a rok obchodu je rok doplnění', () => {
    const seed = 11;
    for (const dir of DIRECTIONS) {
      const base = neighbourOf(seed, dir).supply;
      const bad = neighbourStock(village({ summer: 'drought' }), dir, DAY).supply;
      for (const g of Object.keys(base) as (keyof typeof base)[]) {
        if (g !== 'grain') expect(bad[g]).toBe(base[g]);
      }
    }
    // před 1. 11. 600 platí zásoba roku 599 (zlý rok 600 se ještě neprojevil)
    const dir = grainSeller(seed);
    const before = neighbourStock(village({ summer: 'drought' }), dir, at(600, 10, 1));
    expect(before.supply.grain).toBe(neighbourOf(seed, dir).supply.grain);
  });

  it('cena: po krutém roce za sháněné zboží kg obilí ×0,5, za obilí beze změny', () => {
    const seed = 11;
    const plain = village(null);
    const cruel = village({ summer: 'drought' });
    const n = neighbourOf(seed, 'S');
    // výměna bez stezky je blokovaná, ocenění (credit) se ale počítá vždy
    const demanded = n.demands.find((g) => g !== 'grain');
    const offer = (
      g: string,
    ): { direction: Direction8; give: Record<string, number>; get: object } => ({
      direction: 'S',
      give: { [g]: 4 },
      get: {},
    });
    if (demanded) {
      const a = tradeQuote(plain, offer(demanded) as never, DAY).credit;
      const b = tradeQuote(cruel, offer(demanded) as never, DAY).credit;
      expect(a).toBeGreaterThan(0);
      expect(b).toBeCloseTo(a * 0.5, 2);
    }
    const grain = tradeQuote(plain, offer('grain') as never, DAY).credit;
    expect(tradeQuote(cruel, offer('grain') as never, DAY).credit).toBe(grain);
  });

  it('ves bez počasí: zásoba i ceny beze změny', () => {
    const s = village(null);
    expect(s.weatherSeed).toBeUndefined();
    const dir = grainSeller(11);
    expect(neighbourStock(s, dir, DAY).supply.grain).toBe(neighbourOf(11, dir).supply.grain);
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

  it('nákup výrobku u řemeslníka souseda je po krutém roce za polovinu obilí', () => {
    expect(productPrice('potteryKg', village(null), DAY)).toBeCloseTo(3 * 0.96, 9);
    expect(productPrice('potteryKg', village({ summer: 'drought' }), DAY)).toBeCloseTo(
      3 * 0.96 * 0.5,
      9,
    );
    expect(productPrice('toolsKg', village({ summer: 'dry' }), DAY)).toBeCloseTo(
      60 * 0.96 * 0.67,
      9,
    );
    // bez stavu a dne (panel, staré volání) beze změny
    expect(productPrice('potteryKg')).toBeCloseTo(3 * 0.96, 9);
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
