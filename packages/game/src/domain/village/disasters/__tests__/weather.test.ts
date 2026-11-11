import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { inDisasterProtection } from '../disasters';
import { FLOOD_WATER, WEATHER } from '../../rules/rules-disasters';
import { advanceVillage } from '../../core/simulate';
import type { SummerWeather, VillageState, WinterWeather, YearWeather } from '../../types';
import {
  isBadSummer,
  isCruelYear,
  revealedWeather,
  weatherDay,
  weatherOf,
  withWeatherSeed,
  yearWeather,
} from '../weather';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Počasí roku kraje (disasters.md – Počasí roku – kraj, Povodeň potoka): četnosti, shlukování,
// stejné počasí pro vsi téže mapy, odhalení, dopočet po kouscích, ochrana nové vsi.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });

/** 100 map × 1000 let = 10⁵ let (dost na četnosti s tolerancí ±1 % i u shlukování). */
function allYears(): YearWeather[] {
  const years: YearWeather[] = [];
  for (let seed = 1; seed <= 100; seed++) {
    for (let year = 500; year < 1500; year++) years.push(yearWeather(seed * 7919, year));
  }
  return years;
}
const YEARS = allYears();

const share = <T>(list: readonly T[], test: (item: T) => boolean): number =>
  list.filter(test).length / list.length;

/** První seed mapy, jehož rok `year` splní `test`. */
function seedWhere(year: number, test: (w: YearWeather) => boolean): number {
  for (let seed = 1; seed < 100_000; seed++) if (test(yearWeather(seed, year))) return seed;
  throw new Error('Žádný seed nevyhovuje.');
}

describe('yearWeather – četnosti z tabulek', () => {
  it('léto a zima mají dlouhodobě četnosti z tabulky ±1 %', () => {
    for (const [summer, chance] of Object.entries(WEATHER.summerChances)) {
      expect(Math.abs(share(YEARS, (w) => w.summer === summer) - chance)).toBeLessThan(0.01);
    }
    for (const [winter, chance] of Object.entries(WEATHER.winterChances)) {
      expect(Math.abs(share(YEARS, (w) => w.winter === winter) - chance)).toBeLessThan(0.01);
    }
  });

  it('po zlém létě jsou zlá léta i zimy příští rok ×1,25 (±0,05)', () => {
    const afterBad: YearWeather[] = [];
    const afterCalm: YearWeather[] = [];
    for (let i = 1; i < YEARS.length; i++) {
      const prev = YEARS[i - 1]!;
      const next = YEARS[i]!;
      if (next.year !== prev.year + 1) continue; // jiná mapa
      (isBadSummer(prev.summer) ? afterBad : afterCalm).push(next);
    }
    const badSummer = (w: YearWeather): boolean => isBadSummer(w.summer);
    const badWinter = (w: YearWeather): boolean => w.winter !== 'normal';
    const summerRatio = share(afterBad, badSummer) / share(afterCalm, badSummer);
    const winterRatio = share(afterBad, badWinter) / share(afterCalm, badWinter);
    expect(Math.abs(summerRatio - WEATHER.clusterFactor)).toBeLessThan(0.05);
    expect(Math.abs(winterRatio - WEATHER.clusterFactor)).toBeLessThan(0.05);
  });

  it('krutý rok – kruté sucho, mokré žně, holomráz se zlým létem', () => {
    expect(isCruelYear({ summer: 'drought', winter: 'normal' })).toBe(true);
    expect(isCruelYear({ summer: 'wetHarvest', winter: 'normal' })).toBe(true);
    expect(isCruelYear({ summer: 'dry', winter: 'blackFrost' })).toBe(true);
    expect(isCruelYear({ summer: 'good', winter: 'blackFrost' })).toBe(false);
    expect(isCruelYear({ summer: 'wet', winter: 'long' })).toBe(false);
  });
});

describe('yearWeather – povodeň kraje', () => {
  const bumped = (w: YearWeather): boolean =>
    w.winter === 'long' || w.summer === 'wet' || w.summer === 'wetHarvest';

  it('bez dlouhé zimy a deštivého léta mají stupně vody četnosti z tabulky ±1 %', () => {
    const plain = YEARS.filter((w) => !bumped(w));
    for (const rule of FLOOD_WATER.levels) {
      const got = share(plain, (w) => (w.flood?.level ?? null) === rule.level);
      expect(Math.abs(got - rule.chance)).toBeLessThan(0.01);
    }
  });

  it('po dlouhé zimě a v deštivém létě je voda o stupeň výš – vždy nějaká', () => {
    const raised = YEARS.filter(bumped);
    expect(raised.every((w) => w.flood !== null)).toBe(true);
    const small = share(raised, (w) => w.flood?.level === 'small');
    expect(Math.abs(small - FLOOD_WATER.levels[0].chance)).toBeLessThan(0.02);
  });

  it('jarní po dlouhé zimě, letní v deštivém létě; den v okně; výška ze stupně', () => {
    for (const w of YEARS) {
      if (!w.flood) continue;
      const wet = w.summer === 'wet' || w.summer === 'wetHarvest';
      if (w.winter === 'long' && !wet) expect(w.flood.season).toBe('spring');
      if (wet && w.winter !== 'long') expect(w.flood.season).toBe('summer');
      const onDay = w.flood.month * 100 + w.flood.day;
      if (w.flood.season === 'spring') expect(onDay >= 301 && onDay <= 320).toBe(true);
      else expect(onDay >= 615 && onDay <= 815).toBe(true);
      const rule = FLOOD_WATER.levels.find((l) => l.level === w.flood?.level);
      expect(w.flood.heightM).toBe(rule?.heightM);
    }
    const seasons = YEARS.filter((w) => w.flood && w.winter === 'normal' && !isBadSummer(w.summer));
    expect(Math.abs(share(seasons, (w) => w.flood?.season === 'spring') - 0.5)).toBeLessThan(0.02);
  });
});

describe('weatherOf – vsi téže mapy a ves bez počasí', () => {
  it('dvě vsi téže mapy (jiný seed vsi) mají 1000 let stejné počasí i povodně', () => {
    const a: Pick<VillageState, 'seed' | 'weatherSeed'> = { seed: 11, weatherSeed: 4242 };
    const b: Pick<VillageState, 'seed' | 'weatherSeed'> = { seed: 12, weatherSeed: 4242 };
    for (let year = 500; year < 1500; year++) {
      expect(weatherOf(b, year)).toEqual(weatherOf(a, year));
    }
  });

  it('jiný seed mapy má jiné počasí', () => {
    let differ = 0;
    for (let year = 500; year < 1500; year++) {
      const a = yearWeather(4242, year);
      const b = yearWeather(4243, year);
      if (a.summer !== b.summer || a.winter !== b.winter) differ++;
    }
    expect(differ).toBeGreaterThan(400);
  });

  it('ves bez seedu počasí má všechny roky normální, bez vody a bez kroniky', () => {
    for (let year = 500; year < 1500; year++) {
      expect(weatherOf({}, year)).toEqual({
        year,
        summer: 'normal',
        winter: 'normal',
        flood: null,
      });
    }
    expect(weatherDay({}, at(600, 5, 1))).toEqual([]);
  });

  it('vynucené počasí (dev, testy) přebije los jen v daném roce', () => {
    const state: Pick<VillageState, 'disasters'> = {
      disasters: { override: { weather: { 600: { summer: 'drought' } } } },
    };
    expect(weatherOf(state, 600).summer).toBe('drought');
    expect(weatherOf(state, 601).summer).toBe('normal');
    expect(weatherDay(state, at(600, 5, 1))).toEqual([
      { day: at(600, 5, 1), kind: 'weather', summer: 'drought' },
    ]);
  });

  it('kopie seedu mapy ve vsi – idempotentně, bez seedu mapy beze změny', () => {
    const state = foundVillage({
      seed: 5,
      day: at(600, 1, 1),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
    });
    const seeded = withWeatherSeed(state, 99);
    expect(seeded.weatherSeed).toBe(99);
    expect(withWeatherSeed(seeded, 99)).toBe(seeded);
    expect(withWeatherSeed(state, null)).toBe(state);
    expect(state.weatherSeed).toBeUndefined();
  });
});

describe('revealedWeather – jen to, co už je vidět', () => {
  const summerSeed = (summer: SummerWeather): number => seedWhere(601, (w) => w.summer === summer);
  const winterSeed = (winter: WinterWeather): number => seedWhere(601, (w) => w.winter === winter);
  const seen = (
    weatherSeed: number,
    month: number,
    day: number,
  ): ReturnType<typeof revealedWeather> => revealedWeather({ weatherSeed }, at(601, month, day));

  it('sucho 30. 4. vidět není, 1. 5. ano', () => {
    const seed = summerSeed('drought');
    expect(seen(seed, 4, 30).summer).toBeUndefined();
    expect(seen(seed, 5, 1).summer).toBe('drought');
  });

  it('mokré žně jsou od 1. 6. deštivé léto, od 15. 7. mokré žně', () => {
    const seed = summerSeed('wetHarvest');
    expect(seen(seed, 5, 31).summer).toBeUndefined();
    expect(seen(seed, 6, 1).summer).toBe('wet');
    expect(seen(seed, 7, 14).summer).toBe('wet');
    expect(seen(seed, 7, 15).summer).toBe('wetHarvest');
  });

  it('dlouhá zima od 1. 3., holomráz od 1. 2., normální zima od 1. 4.', () => {
    expect(seen(winterSeed('long'), 2, 28).winter).toBeUndefined();
    expect(seen(winterSeed('long'), 3, 1).winter).toBe('long');
    expect(seen(winterSeed('blackFrost'), 1, 31).winter).toBeUndefined();
    expect(seen(winterSeed('blackFrost'), 2, 1).winter).toBe('blackFrost');
    expect(seen(winterSeed('normal'), 3, 31).winter).toBeUndefined();
    expect(seen(winterSeed('normal'), 4, 1).winter).toBe('normal');
  });

  it('voda je vidět až v den povodně', () => {
    const seed = seedWhere(601, (w) => w.flood !== null);
    const flood = yearWeather(seed, 601).flood!;
    const day = at(601, flood.month, flood.day);
    expect(revealedWeather({ weatherSeed: seed }, day - 1).flood).toBeUndefined();
    expect(revealedWeather({ weatherSeed: seed }, day).flood).toEqual(flood);
  });
});

describe('den počasí v simulaci – vcelku = po kouscích', () => {
  const START = at(601, 4, 25);
  const END = at(601, 6, 10);
  const weatherSeed = seedWhere(601, (w) => w.summer === 'dry' || w.summer === 'drought');
  const village = (seed: number): VillageState => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed, day: START, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.storesKg = 5_000;
    s.lastDay = START;
    return withWeatherSeed(s, weatherSeed);
  };
  const inChunks = (state: VillageState, step: number): VillageState => {
    let s = state;
    while (s.lastDay < END) s = advanceVillage(s, Math.min(END, s.lastDay + step), null);
    return s;
  };

  it('1. 5. zápis sucha do kroniky; po 1, 7 a 30 dnech stejný stav jako vcelku', () => {
    const whole = advanceVillage(village(5), END, null);
    const summer = yearWeather(weatherSeed, 601).summer;
    expect(whole.chronicle.filter((e) => e.kind === 'weather')).toEqual([
      { day: at(601, 5, 1), kind: 'weather', summer },
    ]);
    const json = JSON.stringify(whole);
    for (const step of [1, 7, 30]) expect(JSON.stringify(inChunks(village(5), step))).toBe(json);
  }, 60_000);

  it('dvě vsi téže mapy zapíší totéž počasí', () => {
    const weatherOfChronicle = (s: VillageState): unknown[] =>
      s.chronicle.filter((e) => e.kind === 'weather');
    expect(weatherOfChronicle(advanceVillage(village(6), END, null))).toEqual(
      weatherOfChronicle(advanceVillage(village(5), END, null)),
    );
  }, 60_000);
});

describe('ochrana nové vsi – 5 let bez místních pohrom', () => {
  it('ve 3. roce chráněná, v 6. ne; hranice pět let', () => {
    const founded = at(600, 6, 1);
    expect(inDisasterProtection(founded, founded)).toBe(true);
    expect(inDisasterProtection(founded, at(603, 6, 1))).toBe(true);
    expect(inDisasterProtection(founded, at(605, 5, 31))).toBe(true);
    expect(inDisasterProtection(founded, at(605, 6, 2))).toBe(false);
    expect(inDisasterProtection(founded, at(606, 6, 1))).toBe(false);
  });
});
