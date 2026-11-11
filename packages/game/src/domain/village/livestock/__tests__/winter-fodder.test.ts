import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import {
  HAY,
  HAY_WINTER_DAYS,
  SNOW_FEED_DAYS,
  addStraw,
  expectedStrawKg,
  feedHay,
  hayLeftAvailable,
  hayWinterDaysLeft,
  herdsOnSnow,
  rotHay,
  spoilOldHay,
  strawComingKg,
  winterHayAvailable,
  winterHayKg,
} from '../hay';
import { oxenRenewalCows } from '../husbandry';
import { LIVESTOCK, hayShortSlaughter, slaughter, winterTargets } from '../livestock';
import { hayWorkPerHa } from '../../core/productivity';
import { FIELD_WORK_PER_HA, OXEN, STRAW } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import { snowDaysAhead, snowDaysOfYear, snowLies } from '../../disasters/snow';
import type { HerdSpecies, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Zima bez sena – pastva, sláma a chovné jádro (diet.md, oxen.md – Martin 10. 11. 2026): seč srpem,
// seno celou zimu jen voli a koně, krávy, ovce a kozy jen ve sněhu – napřed sláma z výmlatu.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  return s;
}

describe('seč srpem (Martin 10. 11. 2026)', () => {
  it('seč stojí 2× zprůměrovanou žeň obilí – 46 / 40 čd/ha (s nástroji od kováře)', () => {
    expect(hayWorkPerHa(0)).toBe(46);
    expect(hayWorkPerHa(1)).toBe(40);
    expect(hayWorkPerHa(0)).toBe(2 * FIELD_WORK_PER_HA.harvest.worst);
    expect(hayWorkPerHa(1)).toBe(2 * FIELD_WORK_PER_HA.harvest.best);
  });
});

describe('sníh a krmení stád', () => {
  it('běžná zima má sníh ≈ od začátku prosince do začátku března; dlouhá déle, holomráz méně', () => {
    expect(SNOW_FEED_DAYS).toBe(snowDaysOfYear('normal'));
    expect(SNOW_FEED_DAYS).toBeGreaterThan(80);
    expect(SNOW_FEED_DAYS).toBeLessThan(105);
    // celý sníh běžné zimy leží v zimním krmení (1. 11. – 31. 3., nepřestupný rok)
    expect(snowDaysAhead(at(601, 11, 1), HAY_WINTER_DAYS)).toBe(SNOW_FEED_DAYS);
    // týž sníh jako scéna (`snowLies`) – i přes přestupný rok a v dlouhé zimě
    for (const winter of ['normal', 'long'] as const) {
      const from = at(600, 11, 1);
      let count = 0;
      for (let d = 0; d < 182; d++) if (snowLies(from + d, winter)) count++;
      expect(snowDaysAhead(from, 182, winter)).toBe(count);
    }
    expect(snowDaysOfYear('long')).toBeGreaterThan(SNOW_FEED_DAYS);
    expect(snowDaysOfYear('blackFrost')).toBeLessThan(SNOW_FEED_DAYS);
    const s = village(at(600, 9, 2));
    expect(herdsOnSnow(s, at(600, 11, 5))).toBe(false);
    expect(herdsOnSnow(s, at(601, 1, 15))).toBe(true);
    expect(herdsOnSnow(s, at(601, 3, 25))).toBe(false);
  });

  it('seno na zimu: voli a koně celou zimu, krávy, ovce a kozy jen na dny se sněhem bez slámy', () => {
    const herd = herds({ cow: 2, sheep: 10, pig: 5 });
    const daily = 2 * HAY.dailyKg.cow + 10 * HAY.dailyKg.sheep;
    expect(winterHayKg(herd, 2, 3)).toBeCloseTo(
      daily * SNOW_FEED_DAYS + (2 * HAY.dailyKg.ox + 3) * HAY_WINTER_DAYS,
      9,
    );
    // sláma (v kg sena) ubere jen ze stáda, ne z volů a koní
    expect(winterHayKg(herd, 2, 3, 100)).toBeCloseTo(winterHayKg(herd, 2, 3) - 100, 9);
    expect(winterHayKg(herd, 2, 0, 1e9)).toBeCloseTo(2 * HAY.dailyKg.ox * HAY_WINTER_DAYS, 9);
  });

  it('bez sněhu žerou seno jen voli a koně; ve sněhu stádo napřed slámu (2 kg za kg sena), pak seno', () => {
    const s = village(at(600, 9, 2));
    s.hay = { kg: 1_000, mowing: null, straw: { kg: 30, yearKg: 30 } };
    const herd = herds({ cow: 2, sheep: 10 });
    // bez sněhu: vůl 6 kg, koně 4 kg – stádo se pase
    feedHay(s, 1, herd, 4, false);
    expect(s.hay.kg).toBeCloseTo(1_000 - 10, 9);
    expect(s.hay.straw!.kg).toBe(30);
    expect(s.hay.winter).toMatchObject({ herdNeedKg: 0, herdEatenKg: 0 });
    // ve sněhu: stádo chce 20 kg sena – 30 kg slámy nahradí 15 kg, zbytek 5 kg ze sena
    feedHay(s, 1, herd, 4, true);
    expect(s.hay.straw!.kg).toBe(0);
    expect(s.hay.kg).toBeCloseTo(1_000 - 10 - 10 - 5, 9);
    expect(s.hay.winter).toMatchObject({ herdNeedKg: 20, herdEatenKg: 20 });
    // slámy dost – seno zůstane volům a koním
    s.hay.straw!.kg = 100;
    feedHay(s, 0, herd, 0, true);
    expect(s.hay.straw!.kg).toBe(60);
    expect(s.hay.kg).toBeCloseTo(975, 9);
  });
});

describe('sláma z výmlatu', () => {
  it('0,75 kg slámy na kg zrna, ztrácí jako seno; 25. 5. zbytek na podestýlku, výmlat se zapamatuje', () => {
    const s = village(at(600, 9, 2));
    delete s.hay;
    addStraw(s, 1_000);
    expect(s.hay!.straw).toEqual({ kg: 750, yearKg: 750 });
    expect(s.hay!.kg).toBe(0);
    s.sheaves = { grainKg: 400, legumesKg: 100 };
    expect(strawComingKg(s)).toBeCloseTo(750 + 400 * STRAW.perGrainKg, 9);
    rotHay(s);
    expect(s.hay!.straw!.kg).toBeLessThan(750);
    expect(s.hay!.straw!.kg).toBeCloseTo(750 * winterHayAvailable(1) ** (1 / 76), 6);
    // plán seče počítá jen se slámou z loňského výmlatu
    expect(expectedStrawKg(s)).toBe(0);
    spoilOldHay(s);
    expect(s.hay!.straw).toEqual({ kg: 0, yearKg: 0, lastYearKg: 750 });
    expect(expectedStrawKg(s)).toBe(750);
  });

  it('starší ves bez slámy: krmí se senem, výmlat slámu založí (bez převodu)', () => {
    const s = village(at(600, 9, 2));
    s.hay = { kg: 500, mowing: null };
    feedHay(s, 0, herds({ cow: 2 }), 0, true);
    expect(s.hay.kg).toBe(490);
    expect(s.hay.straw).toBeUndefined();
    expect(expectedStrawKg(s)).toBe(0);
    expect(strawComingKg({ hay: s.hay })).toBe(0);
    spoilOldHay(s);
    expect(s.hay.straw).toBeUndefined();
  });

  it('simulace: výmlat obilí v létě a na podzim naplní stoh slámy', () => {
    const day = at(601, 7, 1);
    let s = village(day - 1);
    s.lastDay = day - 1;
    s.sheaves = { grainKg: 2_000, legumesKg: 0, work: { winter: 80 } };
    s = advanceVillage(s, at(601, 10, 1), null);
    const threshed = 2_000 - (s.sheaves?.grainKg ?? 0);
    expect(threshed).toBeGreaterThan(0);
    expect(s.hay?.straw?.yearKg ?? 0).toBeGreaterThan(0);
    expect(s.hay!.straw!.yearKg).toBeLessThanOrEqual(threshed * STRAW.perGrainKg + 1e-6);
  });
});

describe('chovné jádro – porážka podle zimního krmení', () => {
  it('1. 11. si ves nechá tolik krav, kolik seno a sláma uživí na dny se sněhem', () => {
    const day = at(600, 11, 1);
    const run = (hayKg: number, strawKg: number): number => {
      const s = village(day);
      s.livestock!.land = { meadowHa: 1_000, forestHa: 1_000 };
      s.livestock!.herds = herds({ cow: 20 });
      s.meatKg = 10_000;
      slaughter(s, day, { oxen: 0, hayKg, strawKg, minCows: 2 });
      return s.livestock!.herds.cow - (s.livestock!.culling?.cow ?? 0);
    };
    const perCow = HAY.dailyKg.cow * SNOW_FEED_DAYS;
    // seno na 6 krav po ztrátách ve stohu
    const hay6 = (6 * perCow) / winterHayAvailable(1);
    expect(run(hay6, 0)).toBeCloseTo(6, 6);
    // sláma na další 3 krávy (2 kg za kg sena)
    expect(run(hay6, (3 * perCow * STRAW.perHayKg) / winterHayAvailable(1))).toBeCloseTo(9, 6);
  });

  it('v zimě ves porazí kusy, na které seno a sláma do konce sněhu nevystačí – voli mají seno první', () => {
    const day = at(601, 2, 1);
    const days = hayWinterDaysLeft(day);
    const snow = snowDaysAhead(day, days);
    expect(snow).toBeGreaterThan(0);
    expect(snow).toBeLessThan(days);
    const s = village(day);
    s.livestock!.herds = herds({ sheep: 0, goat: 0, pig: 0, cow: 6 });
    // voli 2 × 6 kg na celou zimu + krávy 4,5 kusu na sněhové dny
    const hayKg =
      (2 * HAY.dailyKg.ox * days + 4.5 * HAY.dailyKg.cow * snow) / hayLeftAvailable(1, days);
    s.hay = { kg: hayKg, mowing: null };
    expect(hayShortSlaughter(s, day, 2)).toMatchObject({ animals: { cow: 1 } });
    expect(s.livestock!.herds.cow).toBe(5);
    // se slámou na půl krávy navíc už ne
    const t = village(day);
    t.livestock!.herds = herds({ cow: 5 });
    t.hay = {
      kg: hayKg,
      mowing: null,
      straw: {
        kg: (0.6 * HAY.dailyKg.cow * snow * STRAW.perHayKg) / hayLeftAvailable(1, snow),
        yearKg: 0,
      },
    };
    expect(hayShortSlaughter(t, day, 2)).toBeNull();
  });
});

describe('přednost zimního krmení (Martin 10. 11. 2026: „Ano, ovce na vlnu před kravami, ale je potřeba nechat dostatek krav k obnově volů“)', () => {
  it('krávy k obnově volů z doby služby vola a býčků mezi telaty; bez volů žádné', () => {
    const s = village(at(600, 9, 2));
    expect(oxenRenewalCows(s)).toBe(0);
    s.looseOxen = Array.from({ length: 6 }, () => ({ trainedDay: at(598, 4, 1) }));
    const perOx = 1 / OXEN.serviceYears / (LIVESTOCK.growth.cow * OXEN.bullCalfShare);
    expect(oxenRenewalCows(s)).toBeCloseTo(6 * perOx, 9);
    // týž výsledek jako krávy na obměnu volů (diet.md – Krávy na obměnu volů)
    expect(perOx).toBeCloseTo(OXEN.cowsPerOx, 9);
    // aspoň chovný pár
    s.looseOxen = s.looseOxen.slice(0, 1);
    expect(oxenRenewalCows(s)).toBe(LIVESTOCK.breedingMin);
  });

  it('nosnost přes zimu: voli → krávy k obnově volů → ovce na vlnu → ostatní krávy, ovce a kozy', () => {
    const day = at(600, 11, 1);
    const s = village(day);
    s.livestock!.land = { meadowHa: 1_000, forestHa: 1_000 };
    s.livestock!.herds = herds({ cow: 20, sheep: 40, goat: 5 });
    const perCow = HAY.dailyKg.cow * SNOW_FEED_DAYS;
    const perSheep = HAY.dailyKg.sheep * SNOW_FEED_DAYS;
    // seno pro 2 voly celou zimu, 7 krav a 10 ovcí na dny se sněhem
    const hayKg =
      (2 * HAY.dailyKg.ox * HAY_WINTER_DAYS + 7 * perCow + 10 * perSheep) / winterHayAvailable(1);
    const ordered = winterTargets(s, day, { oxen: 2, hayKg, oxenCows: 4, minSheep: 10 });
    expect(ordered.cow).toBeCloseTo(7, 6);
    expect(ordered.sheep).toBeCloseTo(10, 6);
    expect(ordered.goat).toBe(LIVESTOCK.breedingMin);
    // bez přednosti by krávy snědly i seno ovcí na vlnu
    const plain = winterTargets(s, day, { oxen: 2, hayKg });
    expect(plain.cow).toBeCloseTo(7 + (10 * perSheep) / perCow, 6);
    expect(plain.sheep).toBe(LIVESTOCK.breedingMin);
    // ovcí na vlnu víc, než seno uživí – krávy k obnově volů zůstanou
    const wool = winterTargets(s, day, { oxen: 2, hayKg, oxenCows: 4, minSheep: 40 });
    expect(wool.cow).toBeCloseTo(4, 6);
    expect(wool.sheep).toBeCloseTo((3 * perCow + 10 * perSheep) / perSheep, 6);
  });

  it('v zimě porážka podle krmení nechá napřed krávy k obnově volů a ovce na vlnu', () => {
    const day = at(601, 2, 1);
    const days = hayWinterDaysLeft(day);
    const snow = snowDaysAhead(day, days);
    const run = (first?: { cow: number; sheep: number }): unknown => {
      const s = village(day);
      s.livestock!.herds = herds({ cow: 8, sheep: 12, goat: 3 });
      // seno pro 2 voly do konce zimy a 26 kg denně na dny se sněhem (≈ 4 krávy a 6 ovcí)
      s.hay = {
        kg: (2 * HAY.dailyKg.ox * days + 26 * snow) / hayLeftAvailable(1, days),
        mowing: null,
      };
      const event = hayShortSlaughter(s, day, 2, 0, first);
      return event?.kind === 'hay-slaughter' ? event.animals : null;
    };
    expect(run({ cow: 3, sheep: 6 })).toEqual({ cow: 4, sheep: 6, goat: 1 });
    // bez přednosti krávy napřed – ovcím jen chovný pár
    expect(run()).toEqual({ cow: 2, sheep: 10, goat: 1 });
  });
});
