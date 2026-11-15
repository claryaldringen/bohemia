import { describe, expect, it } from 'vitest';
import { at, found, field, POSITION, START_PARTS, YEAR } from './simulate-fixtures';
import { daylightFactor } from '../daylight';
import { TOTAL_GAME_DAYS } from '../../../calendar';
import { foundField, foundVillage, startNewDwelling, startReplacement } from '../actions';
import { ageYears, foodNeedPerDay, occupants } from '../../people/people';
import { NO_CRAFTS } from '../productivity';
import {
  AGE,
  CHRONICLE_MAX_EVENTS,
  COMMON_LABOR_HISTORY_DAYS,
  COMMON_LABOR_YEAR_DAYS,
  DWELLINGS,
} from '../../rules';
import { packObstacles } from '../../../landscape';
import { villageLaborFactor } from '../../people/happiness';
import { arrangeMarriages } from '../../people/marriage';
import { advanceVillage } from '../simulate';
import { availableSettlers } from '../../people/households';
import { withKinship } from '../../people/kinship';
import { freshWildlife } from '../../wildlife/wildlife';
import type {
  ChronicleEvent,
  Dwelling,
  FarmSeason,
  FieldPart,
  Person,
  VillageState,
} from '../../types';
import { workSeedKg } from '../../fields/seed';
import { sheafWork, villageSheaves } from '../../fields/threshing';
import {
  createPlan,
  seasonCrops,
  seasonPartIds,
  taskRemaining,
  seasonCrop,
  springCrop,
  dropSeasonCrop,
} from '../year-plan';
import {
  withBuiltFirstDwelling,
  withManorElsewhere,
  withoutSmallGame,
} from '../../__tests__/village-fixtures';

type HarvestEvent = Extract<ChronicleEvent, { kind: 'harvest' }>;
const harvests = (s: VillageState): HarvestEvent[] =>
  s.chronicle.filter((e): e is HarvestEvent => e.kind === 'harvest');
const count = (s: VillageState, kind: ChronicleEvent['kind']): number =>
  s.chronicle.filter((e) => e.kind === kind).length;
const adults = (s: VillageState, day: number): number =>
  s.people.filter((p) => ageYears(p.bornDay, day) >= AGE.adult).length;

/** Cesty ke všem číslům, která nejsou konečná (NaN, ±∞). */
function nonFinite(value: unknown, path = 'state'): string[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => nonFinite(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => nonFinite(v, `${path}.${k}`));
  }
  return [];
}

/** Ves s hotovou zemnicí (id 1), bez pole a staveb, se zásobami navíc – pro testy obydlí. */
function withoutFields(day: number, extra: Person[] = []): VillageState {
  const s = withBuiltFirstDwelling(found(day));
  s.parts = [];
  s.fields = [];
  s.constructions = [];
  s.storesKg = 5000;
  s.people.push(...extra);
  return withoutSmallGame(s);
}
const adultOfAge = (id: number, years: number, day: number): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR),
  dwellingId: 1,
});

describe('advanceVillage – dopočítání', () => {
  it('sňatky čekající na zásoby – po kouscích stejně jako jedním voláním (6 let)', () => {
    // po hájení a bez zásob: svatby čekají (kinship.md – Sňatky čekají na zásoby), los a naplnění
    // pojistky jsou ze dne – výsledek nezávisí na kouscích dopočtu
    const start = found(at(600, 3, 15));
    start.foundedDay = start.lastDay - Math.ceil(40 * YEAR);
    start.storesKg = 0;
    const end = at(606, 3, 15);
    const whole = advanceVillage(start, end, null);
    let chunked = start;
    const steps = [1, 45, 400, 3, 365, 777];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(
        chunked,
        Math.min(end, chunked.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(chunked).toEqual(whole);
  });

  it('pod pojistkou svatba opravdu čeká – snoubenci, kteří by se s plnou pojistkou vzali, čekají (A)', () => {
    // kinship.md – Sňatky čekají na zásoby: ves po hájení se zásobami pod pojistkou a dvěma
    // svobodnými dospělými; s plnou pojistkou by se vzali hned (arrangeMarriages bez pojistky na
    // stavu z předchozího dne), v dopočtu svatba aspoň den čeká na zásoby
    let s = found(at(600, 3, 15));
    s.foundedDay = s.lastDay - Math.ceil(40 * YEAR);
    s.storesKg = 300;
    const adult = s.people.find((p) => ageYears(p.bornDay, s.lastDay) >= AGE.adult)!;
    for (const [id, sex] of [
      [901, 'male'],
      [902, 'female'],
    ] as const) {
      const single: Person = { ...adult, id, sex, bornDay: s.lastDay - Math.ceil(20 * YEAR) };
      delete single.spouseId;
      s.people.push(single);
    }
    let waited = 0;
    for (let d = s.lastDay + 1; d <= at(600, 6, 15) && waited === 0; d++) {
      const ready = arrangeMarriages(structuredClone(s), d).filter(
        (e) => e.kind === 'marriage',
      ).length;
      s = advanceVillage(s, d, null);
      const wed = s.chronicle.filter((e) => e.day === d && e.kind === 'marriage').length;
      if (ready > wed && s.people.some((p) => p.id === 901 || p.id === 902)) waited++;
    }
    expect(waited).toBeGreaterThan(0);
  }, 120_000);

  it('(a) po kouscích dá stejný stav jako jedním voláním (10 let)', () => {
    const start = found(at(600, 3, 15));
    const end = at(610, 3, 15);
    const whole = advanceVillage(start, end, null);

    let chunked = advanceVillage(start, start.lastDay + 1, null);
    chunked = advanceVillage(chunked, chunked.lastDay + 30, null);
    const steps = [7, 400, 1, 1000, 13, 365, 2, 777];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(
        chunked,
        Math.min(end, chunked.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(chunked).toEqual(whole);

    let daily = start;
    while (daily.lastDay < end) daily = advanceVillage(daily, daily.lastDay + 1, null);
    expect(daily).toEqual(whole);

    // ves za 10 let opravdu žila – jinak by shoda nic neznamenala (porody na startovním poli bez
    // nových dílů jsou náhoda – od stád realističtěji je méně masa a mléka; diet.md)
    expect(harvests(whole).length).toBeGreaterThanOrEqual(10);
    expect(count(whole, 'slaughter')).toBeGreaterThanOrEqual(5);
    expect(count(whole, 'hunger-began')).toBeGreaterThan(0);
    expect(whole.lastDay).toBe(end);
  }, 120_000);

  it('kronika drží posledních CHRONICLE_MAX_EVENTS událostí – nejnovější, i po kouscích', () => {
    const start = found(at(600, 3, 15));
    const old: ChronicleEvent[] = Array.from({ length: CHRONICLE_MAX_EVENTS + 100 }, (_, i) => ({
      day: i,
      kind: 'birth',
    }));
    start.chronicle = [...old];
    const end = at(602, 3, 15);
    const s = advanceVillage(start, end, null);
    expect(s.chronicle).toHaveLength(CHRONICLE_MAX_EVENTS);
    const fresh = s.chronicle.filter((e) => e.day > start.lastDay);
    expect(fresh.length).toBeGreaterThanOrEqual(2); // aspoň dvě sklizně
    expect(s.chronicle.slice(-fresh.length)).toEqual(fresh);
    expect(s.chronicle.slice(0, -fresh.length)).toEqual(
      old.slice(-(CHRONICLE_MAX_EVENTS - fresh.length)),
    );

    let chunked = start;
    for (const days of [1, 40, 300, 7, 500]) {
      chunked = advanceVillage(chunked, Math.min(end, chunked.lastDay + days), null);
      expect(chunked.chronicle.length).toBeLessThanOrEqual(CHRONICLE_MAX_EVENTS);
    }
    chunked = advanceVillage(chunked, end, null);
    expect(chunked).toEqual(s);
  });

  it('(a) i ves, kde hráč staví, dá po kouscích s JSON mezi nimi stejný stav (10 let)', () => {
    const start = found(at(600, 3, 15));
    // plná domácnost se 4 dospělými – smí hned stavět nové obydlí; zásoby navíc, aby hlad
    // nezabil děti (domácnost by přestala být plná)
    start.people.push(adultOfAge(100, 20, start.foundedDay), adultOfAge(101, 21, start.foundedDay));
    start.storesKg += 3000;
    const actionDay = at(602, 10, 20);
    const end = at(610, 3, 15);
    const act = (s: VillageState): VillageState =>
      foundField(
        startNewDwelling(s, actionDay, 'zemnice', { x: 5, z: 5, rotation: 0 }, 0),
        actionDay,
        { parts: field(40) },
      );
    const whole = advanceVillage(act(advanceVillage(start, actionDay, null)), end, null);

    const viaJson = (s: VillageState): VillageState =>
      JSON.parse(JSON.stringify(s)) as VillageState;
    const steps = [1, 29, 400, 7, 1000, 13, 365, 2, 777];
    let chunked = viaJson(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      const target = chunked.lastDay < actionDay ? actionDay : end;
      chunked = viaJson(
        advanceVillage(chunked, Math.min(target, chunked.lastDay + steps[i % steps.length]!), null),
      );
      if (chunked.lastDay === actionDay) chunked = viaJson(act(chunked));
    }
    expect(chunked).toEqual(whole);

    // ves opravdu stavěla – nové obydlí obsazené a druhé pole založené
    expect(whole.dwellings.length).toBeGreaterThanOrEqual(2);
    expect(count(whole, 'household-founded')).toBeGreaterThanOrEqual(1);
    const fieldsFinished = whole.chronicle.filter(
      (e) => e.kind === 'construction-finished' && e.constructionKind === 'field',
    );
    expect(fieldsFinished.length).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('nemění vstupní stav a do stejného dne vrátí shodnou kopii', () => {
    const start = found(at(600, 3, 15));
    const before = structuredClone(start);
    advanceVillage(start, at(601, 3, 15), null);
    expect(start).toEqual(before);
    const same = advanceVillage(start, start.lastDay, null);
    // jediný rozdíl: ves z doby před zvěří dostala zvěř na stropu (wildlife.md – převod) a příznak
    // převodu stropů výcviku (war.md – Síla)
    expect(same).toEqual({ ...start, wildlife: same.wildlife, armsCapped: true });
    expect(same.wildlife).toBeDefined();
    expect(same).not.toBe(start);
  });

  it('(b) ves založená 1. 10. 600 sklidí a do druhé sklizně nehladoví', () => {
    // Okno do druhé sklizně (Ruling 12): trvalé nasycení s polem, které hráč rozšiřuje
    // (≥ 0,95 po 95 % let), je cíl kalibrace v Task 10 – startovní pole 1,7 ha je po třech
    // osevech vyčerpané a potřeba roste (dospívající → dospělí, porody).
    const s = advanceVillage(found(at(600, 10, 1)), at(602, 8, 31), null);
    // hotové díly přibývají den po dni (fields.md – Osevní postup po dílech): luštěniny a jař 601,
    // pak ozim v červenci a jař v srpnu 602 – ves seje na potřebu po růstu (dospívající dorostou –
    // fields.md, Osev podle růstu vsi)
    const crops = harvests(s)
      .filter((e) => e.kg > 0)
      .map((e) => e.crop ?? 'spring');
    expect(crops).toContain('winter');
    expect(crops.filter((c) => c === 'spring').length).toBe(2);
    // nikdo nehladoví (fields.md – Osivo bez cíle osevu: osivo na všechny díly na řadě, zbytek je
    // jídlo); ves šetří nanejvýš dvakrát na hraně plného přídělu: 1. 9. 601 dva dny a od 1. 10. 601
    // ≈ 3 týdny (příděl 0,97 → 1), dokud hromada osiva ozimu drží zrno – výhled zná ztráty obilí
    // skladováním do žní (fields.md – Přídělový systém, 15. 11. 2026); dřív 1. 9. jen dva dny
    expect(count(s, 'hunger-began')).toBeLessThanOrEqual(2);
    expect(s.starvationDays ?? 0).toBe(0);
    expect(s.hungry).toBe(false);
  });

  it('(c) zásoby nikdy záporné a žádné NaN – kontrola po každém roce', () => {
    let s = found(at(600, 3, 15));
    for (let year = 601; year <= 610; year++) {
      s = advanceVillage(s, at(year, 3, 15), null);
      expect(s.storesKg).toBeGreaterThanOrEqual(0);
      expect(nonFinite(s)).toEqual([]);
    }
  });

  it('(d) za konec světa RangeError, dopočet do posledního dne projde', () => {
    const s = found(at(1495, 5, 1));
    expect(() => advanceVillage(s, TOTAL_GAME_DAYS, null)).toThrow(RangeError);
    const end = advanceVillage(s, TOTAL_GAME_DAYS - 1, null);
    expect(end.lastDay).toBe(TOTAL_GAME_DAYS - 1);
    expect(nonFinite(end)).toEqual([]);
  });

  it('do minulosti RangeError', () => {
    const s = advanceVillage(found(at(600, 3, 15)), at(600, 4, 1), null);
    expect(() => advanceVillage(s, s.lastDay - 1, null)).toThrow(RangeError);
  });

  it('(e) ves založená 20. 6. bez hotových dílů dožije ze zásob a 1. 9. má plán s díly', () => {
    const start = found(at(600, 6, 20));
    expect(start.parts.every((p) => p.state === 'founding')).toBe(true);

    const lastSummerDay = advanceVillage(start, at(600, 8, 31), null);
    expect(lastSummerDay.season).toBeNull(); // díly hotové po dubnu čekají na 1. 9.
    expect(lastSummerDay.parts.some((p) => p.state === 'ready')).toBe(true);
    expect(count(lastSummerDay, 'hunger-began')).toBe(0);
    expect(lastSummerDay.people).toHaveLength(start.people.length);

    const s = advanceVillage(lastSummerDay, at(600, 9, 1), null);
    expect(s.season).not.toBeNull();
    const planned = seasonPartIds(s.season!);
    expect(planned.length).toBeGreaterThan(0);
    const sown = s.parts.filter((p) => p.state === 'sown').map((p) => p.id);
    expect([...planned].sort((a, b) => a - b)).toEqual(sown);
    expect(s.storesKg).toBeGreaterThan(0);
    expect(count(s, 'hunger-began')).toBe(0);
  });

  it('ves bez lidí: žádná výjimka, žádné NaN, nasycení se neřeší', () => {
    const start = found(at(600, 3, 15));
    start.people = [];
    const s = advanceVillage(start, at(602, 3, 15), null);
    expect(nonFinite(s)).toEqual([]);
    expect(s.storesKg).toBeGreaterThanOrEqual(0);
    expect(count(s, 'hunger-began')).toBe(0);
    expect(s.season ? seasonPartIds(s.season) : []).toEqual([]);
  });

  it('(f) ves bez polí 5 let: bez výjimky, nasycení klesne, zůstanou aspoň 2 dospělí', () => {
    const start = found(at(600, 3, 15));
    start.parts = [];
    const end = at(605, 3, 15);
    const s = advanceVillage(start, end, null);
    expect(count(s, 'hunger-began')).toBeGreaterThan(0);
    expect(s.hungry).toBe(true);
    expect(harvests(s).length).toBeGreaterThan(0); // plán bez dílů – kronika zapíše 0 kg
    expect(harvests(s).every((e) => e.kg === 0)).toBe(true);
    expect(adults(s, end)).toBeGreaterThanOrEqual(2);
    expect(s.storesKg).toBeGreaterThanOrEqual(0);
    expect(nonFinite(s)).toEqual([]);
  });
});

/** Plán bez osiva ze zásob (převod – `CropWork.seedKg` chybí). */
/** Plán s osivem zaplaceným předem (celé osivo plánu vzaté) – setí osivo neomezí. */
function prepaidSeed(plan: FarmSeason, parts: FieldPart[]): FarmSeason {
  const byId = new Map(parts.map((p) => [p.id, p]));
  return {
    ...plan,
    crops: plan.crops.map((crop) => ({ ...crop, seedKg: workSeedKg(crop, byId, crop.crop) })),
  };
}

describe('advanceVillage – roční plán a sklizeň', () => {
  it('díl dokončený na podzim hned založí plán a další díly ho rozšíří (Ruling 2)', () => {
    // první díl (2,25 čd) se dělí o společnou práci se stavbou první zemnice – stačí pár dní
    const start = found(at(600, 10, 1));
    const early = advanceVillage(start, at(600, 10, 10), null);
    expect(early.season).not.toBeNull();
    expect(early.season?.startDay).toBeLessThanOrEqual(at(600, 10, 10));
    const later = advanceVillage(early, at(600, 12, 31), null);
    expect(later.season?.startDay).toBe(early.season?.startDay);
    expect(seasonPartIds(later.season!).length).toBeGreaterThan(
      seasonPartIds(early.season!).length,
    );
    // výmlat v listopadu a prosinci patří loňské úrodě – letošní práce nemlátí předem
    for (const { work } of seasonCrops(later.season!)) expect(work.done.thresh).toBe(0);
    for (const id of seasonPartIds(later.season!)) {
      const part = later.parts.find((p) => p.id === id);
      expect(part?.state).toBe('sown');
      expect(part?.foundingDone).toBeGreaterThanOrEqual(part?.foundingCost ?? Infinity);
    }
  });

  it('31. 8. sklizeň do snopů a plán k výmlatu, v září vymlátí do zásob, 1. 10. plán zmizí (Ruling 8; 1. 11. – Žeň jaře i v září)', () => {
    const before = advanceVillage(found(at(600, 3, 15)), at(600, 8, 30), null);
    expect(before.season).not.toBeNull();
    const s = advanceVillage(before, at(600, 8, 31), null);
    const harvest = harvests(s).at(-1);
    expect(harvest?.day).toBe(at(600, 8, 31));
    expect(harvest?.kg).toBeGreaterThan(0);
    expect(s.season).toBeNull();
    expect(seasonCrop(s.threshingSeason, 'spring')?.partIds).toEqual(
      seasonCrop(before.season, 'spring')?.partIds,
    );
    expect(Math.round(seasonCrop(s.threshingSeason, 'spring')?.harvestedKg ?? -1)).toBe(
      harvest?.kg,
    );
    // úroda je ve snopech, zásoby ji nemají (production-chains.md – Humno)
    expect(villageSheaves(s).grainKg).toBeCloseTo(springCrop(s.threshingSeason!).harvestedKg!, 6);
    expect(sheafWork(s, 'spring')).toBeCloseTo(
      taskRemaining(springCrop(s.threshingSeason!), 'thresh'),
      6,
    );
    expect(s.storesKg).toBeLessThan(before.storesKg);

    // v září vymlácená celá sklizeň – do zásob (bez toho, co se za září snědlo, a osiva ozimu,
    // které vzalo setí – fields.md, Úroda, Osivo ze zásob)
    const threshed = advanceVillage(s, at(600, 9, 30), null);
    expect(villageSheaves(threshed)).toEqual({ grainKg: 0, legumesKg: 0 });
    const need = s.people.reduce((sum, p) => sum + foodNeedPerDay(p, s.lastDay), 0);
    const seed = seasonCrops(threshed.season!).reduce((sum, c) => sum + (c.work.seedKg ?? 0), 0);
    // a bez snopů zkažených, než na ně výmlat došel (setí týž den za orbou bere září práci) – 1 %
    expect(threshed.storesKg).toBeGreaterThan(
      s.storesKg + 0.99 * (harvest?.kg ?? 0) - 30 * need - seed,
    );
    expect(threshed.threshingSeason).not.toBeNull();
    // výmlat jaře září–říjen (fields.md – Žeň jaře i v září) – plán zmizí 1. 11.
    expect(advanceVillage(threshed, at(600, 11, 1), null).threshingSeason).toBeNull();
  });

  it('1. 9. díl pod 70 % jde do přílohu, od 70 % se osévá dál, připravené čekají na řadě (fields.md – Přílohová soustava do roku 1100)', () => {
    const day = at(600, 9, 1);
    const start = found(at(600, 6, 1));
    start.constructions = [];
    start.lastDay = day - 1;
    start.storesKg = 5000; // zásoby nad prahem – bez nedostatku, nouzový příloh se neoseje
    start.parts.forEach((p, i) => {
      p.foundingDone = p.foundingCost;
      p.state = i < 70 ? 'sown' : 'ready';
      p.sownYears = i < 60 ? 2 : i < 70 ? 1 : 0;
      // třetí osev z 80 % → 68 % (pod 70 % – příloh); druhý ze 100 % → 88 % (osévá se dál)
      if (i < 60) p.fertilityShare = 0.8;
    });
    const s = advanceVillage(start, day, null);
    const selected = new Set(seasonPartIds(s.season!));
    expect(selected.size).toBeGreaterThan(0);
    s.parts.forEach((p, i) => {
      if (i < 60) {
        expect(p).toMatchObject({ state: 'fallow', fallowSinceDay: day, sownYears: 0 });
        expect(p.fertilityShare).toBeCloseTo(0.68, 9);
      } else if (selected.has(p.id)) expect(p.state).toBe('sown');
      else if (i < 70) expect(p).toMatchObject({ state: 'ready', sownYears: 2 });
      // nepotřebný připravený díl do přílohu nejde – čeká na řadě
      else expect(p).toMatchObject({ state: 'ready', sownYears: 0 });
    });
    expect(s.parts.slice(60, 70).every((p) => Math.abs(p.fertilityShare - 0.88) < 1e-9)).toBe(true);
    expect(s.parts.slice(70).every((p) => p.fertilityShare === 1)).toBe(true);
  });

  /** Všechny díly v přílohu od 1. 9. roku `sinceYear`, ves dopočtená na 1. 9. 620. */
  function returningFallow(sinceYear: number): { s: VillageState; day: number } {
    const day = at(620, 9, 1);
    const start = found(at(600, 6, 1));
    start.constructions = [];
    start.lastDay = day - 1;
    for (const p of start.parts) {
      p.foundingDone = p.foundingCost;
      p.state = 'fallow';
      p.fallowSinceDay = at(sinceYear, 9, 1);
    }
    return { s: advanceVillage(start, day, null), day };
  }

  it('1. 9. příloh 16 let se vrací jako pastvina: drn v plánu, bez bonusu, plete se', () => {
    // spásaný příloh (bez let bez pastvy) nezaroste, vrátit ho stojí drn jako louka
    const { s } = returningFallow(604);
    const crops = seasonCrops(s.season!);
    expect(seasonPartIds(s.season!).length).toBeGreaterThan(0);
    const ha = (work: (typeof crops)[number]['work']): number =>
      work.partIds.reduce((sum, id) => sum + s.parts.find((p) => p.id === id)!.areaM2, 0) / 10_000;
    for (const { crop, work } of crops) {
      if (work.partIds.length === 0) continue;
      expect(work.required.reclaim).toBeGreaterThanOrEqual(100 * ha(work) - 1e-6);
      expect(work.required.reclaim).toBeLessThan(100 * ha(work) * 1.1);
      // ozim se neplete (fields.md – Pletí jednou a rychle)
      if (crop === 'winter') expect(work.required.weed).toBe(0);
      else expect(work.required.weed).toBeGreaterThan(0);
      expect(work.reclaimIds).toEqual(work.partIds);
    }
    for (const id of seasonPartIds(s.season!)) {
      const part = s.parts.find((p) => p.id === id);
      expect(part).toMatchObject({ state: 'sown', fallowSinceDay: null, bonusUntilDay: null });
    }
    expect(s.chronicle.some((e) => e.kind === 'part-became-forest')).toBe(false);
  });

  it('1. 9. vrácený mladý les (25 let bez pastvy): mýcení jako les, za dospělé stromy klády', () => {
    // fields.md – Zarůstání: mladý les se vrací za sazbu lesa, dospělé stromy dají klády
    const day = at(620, 9, 1);
    const start = found(at(600, 6, 1));
    start.constructions = [];
    start.lastDay = day - 1;
    start.woodLogs = 0;
    for (const p of start.parts) {
      p.foundingDone = p.foundingCost;
      p.state = 'fallow';
      p.fallowSinceDay = at(595, 9, 1);
      p.overgrowthYears = 25;
    }
    const s = advanceVillage(start, day, null);
    const crops = seasonCrops(s.season!);
    expect(seasonPartIds(s.season!).length).toBeGreaterThan(0);
    const ha = (work: (typeof crops)[number]['work']): number =>
      work.partIds.reduce((sum, id) => sum + s.parts.find((p) => p.id === id)!.areaM2, 0) / 10_000;
    for (const { work } of crops) {
      if (work.partIds.length === 0) continue;
      expect(work.required.reclaim).toBeGreaterThanOrEqual(250 * ha(work) - 1e-6);
    }
    for (const id of seasonPartIds(s.season!)) {
      expect(s.parts.find((p) => p.id === id)?.overgrowthYears).toBeUndefined();
    }
    // klády až za stromy, které ves při vracení přílohu opravdu skácela – ne při přibrání dílu
    expect(s.woodLogs ?? 0).toBe(0);
    const felled = advanceVillage(s, at(620, 12, 1), null);
    expect(felled.woodLogs ?? 0).toBeGreaterThan(0);
  });

  it('1. 9. příloh 15 let: vrátí se bez bonusu úrodnosti', () => {
    const { s } = returningFallow(605);
    const crops = seasonCrops(s.season!);
    expect(seasonPartIds(s.season!).length).toBeGreaterThan(0);
    expect(crops.reduce((sum, { work }) => sum + work.required.reclaim, 0)).toBeGreaterThan(0);
    for (const id of seasonPartIds(s.season!)) {
      const part = s.parts.find((p) => p.id === id);
      expect(part).toMatchObject({ state: 'sown', fallowSinceDay: null, bonusUntilDay: null });
    }
    for (const { crop, work } of crops) {
      if (work.partIds.length > 0 && crop !== 'winter')
        expect(work.required.weed).toBeGreaterThan(0);
    }
  });

  /** Ves 29. 8. 600 hladová (1 kg zásob – méně než den potřeby) s hotovým plánem prvních `sown` dílů. */
  function hungryBeforeHarvest(sown: number): VillageState {
    const s = found(at(600, 6, 1));
    s.constructions = [];
    s.lastDay = at(600, 8, 29);
    s.storesKg = 1;
    s.hungry = true;
    s.parts.forEach((p, i) => {
      p.foundingDone = p.foundingCost;
      p.state = i < sown ? 'sown' : 'ready';
    });
    const plan = createPlan(s.parts.slice(0, sown), at(600, 3, 1), NO_CRAFTS.tools);
    s.season = {
      ...plan,
      crops: plan.crops.map((c) => ({ ...c, done: { ...c.required } })),
    };
    return withoutSmallGame(s);
  }
  const hungerEvents = (s: VillageState): ChronicleEvent[] =>
    s.chronicle.filter((e) => e.kind === 'hunger-began' || e.kind === 'hunger-ended');

  it('31. 8. se jí ještě z loňských zásob: malá sklizeň hlad nepřeruší (Ruling 13)', () => {
    const s = advanceVillage(hungryBeforeHarvest(10), at(600, 9, 2), null);
    // úroda bez odečtu osiva – osivo vzalo setí (fields.md – Úroda, Osivo ze zásob)
    expect(harvests(s)).toEqual([{ day: at(600, 8, 31), kind: 'harvest', kg: 140 }]);
    expect(hungerEvents(s)).toEqual([]);
    expect(s.hungry).toBe(true);
  });

  it('sklizeň, která vystačí na rok, ukončí hlad až 1. 9. (Ruling 13)', () => {
    const s = advanceVillage(hungryBeforeHarvest(START_PARTS), at(600, 9, 2), null);
    expect(harvests(s)).toEqual([{ day: at(600, 8, 31), kind: 'harvest', kg: 1052 }]);
    expect(hungerEvents(s)).toEqual([{ day: at(600, 9, 1), kind: 'hunger-ended' }]);
    expect(s.hungry).toBe(false);
  });

  it('1. 3. nevymlácené snopy nepropadnou – ves bez humna je dál mlátí nouzově (Ruling 13)', () => {
    // dřív nevymlácená část úrody 1. 3. zmizela ze zásob; snopy teď čekají dál (production-chains.md
    // – Humno) a bez humna se mlátí nouzově (o 10 % zrna méně) z volné práce po ostatních pracích
    const day = at(601, 3, 1);
    const s0 = withoutFields(at(600, 10, 1));
    s0.lastDay = day - 1;
    delete s0.threshingFloors;
    s0.sheaves = { grainKg: 500, legumesKg: 0, work: { spring: 15 } };
    const s = advanceVillage(s0, day, null);
    const threshed = 500 - villageSheaves(s).grainKg;
    expect(threshed).toBeGreaterThan(0);
    // práce výmlatu ubývá se snopy
    expect(sheafWork(s, 'spring')).toBeLessThan(15);
    // vymlácené zrno (−10 %) je v zásobách, nic nepropadlo
    expect(s.storesKg).toBeGreaterThan(s0.storesKg - 60);
  });

  it('pole nedokopané do 30. 4.: zkopaná část se zaseje a sklidí (Ruling 14)', () => {
    // plán ≈ 3 ha bez podzimního kopání – jarní práce startovní vsi stačí na ≈ 1,4 ha
    const s0 = found(at(600, 6, 1), 42, field(133));
    s0.constructions = [];
    s0.lastDay = at(601, 2, 28);
    // zásoby obilí jen do sklizně (s větší zásobou by ves plán podle zásob hned zkrátila – fields.md,
    // Osev podle zásob) a maso, ať nehladoví
    s0.storesKg = 300;
    s0.meatKg = 300;
    for (const p of s0.parts) {
      p.foundingDone = p.foundingCost;
      p.state = 'sown';
    }
    // osivo zaplacené předem: měří se setí za kopáním, ne osivo (fields.md – Úroda, Osivo ze zásob)
    s0.season = prepaidSeed(createPlan(s0.parts, at(600, 9, 1), NO_CRAFTS.tools), s0.parts);

    const spring = advanceVillage(s0, at(601, 4, 30), null);
    const dig = {
      done: seasonCrop(spring.season, 'spring')?.done.dig ?? 0,
      required: seasonCrop(spring.season, 'spring')?.required.dig ?? 0,
    };
    const sow = {
      done: seasonCrop(spring.season, 'spring')?.done.sow ?? 0,
      required: seasonCrop(spring.season, 'spring')?.required.sow ?? 0,
    };
    expect(dig.done).toBeGreaterThan(0);
    expect(dig.done).toBeLessThan(dig.required);
    // seje se, co bylo zkopané v předchozích dnech – nezasetý zůstane jen pruh posledního dne
    const dugShare = dig.done / dig.required;
    const sownShare = sow.done / sow.required;
    expect(sownShare).toBeLessThanOrEqual(dugShare + 1e-9);
    // pruh posledního dne – u plánu zkráceného podle zásob je větší díl plánu
    expect(sownShare).toBeGreaterThan(dugShare - 0.02);

    const s = advanceVillage(spring, at(601, 8, 31), null);
    expect(harvests(s).at(-1)?.kg).toBeGreaterThan(0);
  });

  it('nezasetá půda se neplete ani nesklízí a úroda zaseté části se nesráží (Ruling 17)', () => {
    const s0 = found(at(600, 6, 1), 42, field(133));
    s0.constructions = [];
    s0.lastDay = at(601, 2, 28);
    // zásoby obilí jen do sklizně (s větší zásobou by ves plán podle zásob hned zkrátila – fields.md,
    // Osev podle zásob) a maso, ať nehladoví
    s0.storesKg = 300;
    s0.meatKg = 300;
    for (const p of s0.parts) {
      p.foundingDone = p.foundingCost;
      p.state = 'sown';
    }
    // osivo zaplacené předem: měří se setí za kopáním, ne osivo (fields.md – Úroda, Osivo ze zásob)
    s0.season = prepaidSeed(createPlan(s0.parts, at(600, 9, 1), NO_CRAFTS.tools), s0.parts);
    // bez zvěře (jen vrány berou 2 % úrody, wildlife.md – Škody) – tady se měří setí a plán
    s0.wildlife = freshWildlife({ forestHa: 0, openHa: 0, waterHa: 0, pools: 0 }, 0);
    s0.wildlife.boar = { adults: 0, piglets: 0 };
    s0.wildlife.deer = { stags: 0, hinds: 0, calves: 0 };

    const summerEnd = advanceVillage(s0, at(601, 8, 30), null);
    const plan = summerEnd.season!;
    const sownShare = springCrop(plan).done.sow / springCrop(plan).required.sow;
    expect(sownShare).toBeGreaterThan(0.2);
    // nezasetá část 1. 5. vypadla z práce (fields.md – Osevní postup po dílech, bod 2)
    expect(springCrop(plan).partIds.length).toBeLessThan(s0.parts.length);
    // práce šla jen na zasetou část – a ta je celá opletá i sklizená
    expect(springCrop(plan).done.weed).toBeCloseTo(springCrop(plan).required.weed * sownShare, 6);
    expect(springCrop(plan).done.harvest).toBeCloseTo(
      springCrop(plan).required.harvest * sownShare,
      6,
    );

    const s = advanceVillage(summerEnd, at(601, 8, 31), null);
    // plán mohl ves podle zásob zkrátit – úroda jen z dílů, které v něm zůstaly
    const inPlan = new Set(springCrop(plan).partIds);
    const ha =
      s0.parts.filter((p) => inPlan.has(p.id)).reduce((sum, p) => sum + p.areaM2, 0) / 10_000;
    const fullYield = ha * sownShare * 760 * (0.4 + 0.6 * 0.7);
    // vrány: nejvýš 2 % hrubé úrody (≈ 760 × 0,82 kg/ha), nic víc
    const kg = harvests(s).at(-1)!.kg;
    expect(kg).toBeLessThanOrEqual(Math.round(fullYield));
    expect(kg).toBeGreaterThan(fullYield - 0.02 * ha * sownShare * 760 - 1);
  });
});

describe('advanceVillage – stavby', () => {
  it('společná práce: stavbě, které stačí méně, zbytek dne připadne druhé stavbě', () => {
    const day = at(600, 10, 1);
    const s0 = withoutFields(day);
    s0.constructions.push(
      {
        id: 90,
        kind: 'dwelling',
        startedDay: day - 10,
        cost: 60,
        done: 59.9,
        dwellingType: 'zemnice',
        position: { x: 5, z: 5, rotation: 0 },
        dwellingId: null,
        fieldId: null,
      },
      {
        id: 91,
        kind: 'rebuild',
        startedDay: day - 10,
        cost: 220,
        done: 0,
        dwellingType: 'polozemnice',
        position: null,
        dwellingId: 1,
        fieldId: null,
      },
    );
    const s = advanceVillage(s0, day, null);
    const common = s.commonLaborHistory.at(-1) ?? 0;
    expect(common / 2).toBeGreaterThan(0.1); // stavba obydlí potřebuje méně než svůj díl
    expect(s.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'construction-finished', constructionKind: 'dwelling' }),
    );
    expect(s.constructions.map((c) => c.id)).toEqual([91]);
    expect(s.constructions[0]?.done).toBeCloseTo(common - (60 - 59.9), 9);
  });
});

describe('advanceVillage – založení vsi', () => {
  it('zakladatelé si první zemnici postaví sami – roste den po dni, pak se do ní nastěhují', () => {
    const day = at(600, 10, 1);
    const s0 = foundVillage({ seed: 5, day, dwellingPosition: POSITION });
    const household = s0.people[0]!.dwellingId;
    const zemnice = s0.constructions[0]!;
    let s = s0;
    let last = -1;
    let stalled = 0;
    let finishedDay: number | null = null;
    for (let d = day; d < day + 365 && finishedDay === null; d++) {
      s = advanceVillage(s, d, null);
      const site = s.constructions.find((c) => c.id === zemnice.id);
      if (site) {
        // průběh stavby je vidět – roste, ale ne skokem; jen porážka 1. 11. (osadníci nemají seno
        // – na maso jdou ovce nad chovný pár) zabere den nebo dva všechnu práci
        expect(site.done).toBeGreaterThanOrEqual(last);
        // dny, kdy jsou dospělí na výpravě k sousedům, stavět nemá kdo – stavby staví jen muži
        // (population.md – Práce, Stavby staví muži), zemnice trvá déle a výprava do ní padne
        const away = s.labor?.shares.some((share) => share.activity === 'trade') ?? false;
        if (site.done <= last && !away) stalled++;
        expect(site.done).toBeLessThan(site.cost);
        last = site.done;
        expect(s.dwellings).toEqual([]);
      } else finishedDay = d;
    }
    expect(stalled).toBeLessThanOrEqual(2);
    // ≈ 60 člověkodní ze společné práce startovní domácnosti – desítky dní, ne den
    expect(finishedDay).not.toBeNull();
    expect(finishedDay! - day).toBeGreaterThan(20);
    expect(finishedDay! - day).toBeLessThan(120);
    expect(s.dwellings).toEqual([
      { id: household, type: 'zemnice', builtDay: finishedDay, condition: 1, position: POSITION },
    ]);
    expect(s.people.every((p) => p.dwellingId === household)).toBe(true);
    expect(s.chronicle).toContainEqual({
      day: finishedDay,
      kind: 'construction-finished',
      constructionKind: 'dwelling',
      dwellingId: household,
      fieldId: null,
    });
    expect(count(s, 'household-founded')).toBe(0);
  });

  it('na staveništi nikdo neumře na to, že nemá obydlí, a zakladatelé mají denní minimum', () => {
    const day = at(600, 10, 1);
    const s0 = foundVillage({ seed: 9, day, dwellingPosition: POSITION });
    const s = advanceVillage(s0, day + 30, null);
    expect(s.dwellings).toEqual([]); // zemnice ještě stojí rozestavěná
    expect(s.people.length).toBeGreaterThanOrEqual(4);
    expect(count(s, 'death')).toBe(0);
    expect(count(s, 'household-merged')).toBe(0);
    // společná práce = dva dospělí × štěstí na začátku dne (happiness.md) − denní minimum 0,5;
    // výrostci (13 a 12 let) pasou, zvířata a domácí výroba jdou bokem (population.md – Práce)
    const before = advanceVillage(s0, day + 29, null);
    const factor = villageLaborFactor(before);
    // venku podle délky dne (population.md – Skladba dne podle ročního období); volná práce na
    // stavby je práce muže – denní minimum nesou napřed ženy (population.md – Práce, Stavby staví muži)
    expect(s.commonLaborHistory.at(-1)).toBeCloseTo(factor * daylightFactor(day + 30), 9);
    // práce bokem je v rozdělení dne jen pro postavy – dojení krávy v říjnu, domácí výroba
    const aside = s.labor!.aside!;
    expect(aside.some((share) => share.activity === 'domestic')).toBe(true);
    expect(s.labor!.shares.some((share) => share.activity === 'milking')).toBe(false);
  });

  it('stavbu první zemnice a první pole staví zakladatelé společnou prací rovným dílem', () => {
    const day = at(600, 10, 1);
    const s = advanceVillage(found(day), day, null);
    const [zemnice, plot] = s.constructions;
    expect(zemnice?.kind).toBe('dwelling');
    expect(plot?.kind).toBe('field');
    expect(zemnice!.done).toBeCloseTo(plot!.done, 9);
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním – i přes dostavění', () => {
    const start = foundVillage({ seed: 11, day: at(600, 3, 15), dwellingPosition: POSITION });
    const end = start.foundedDay + 200;
    const whole = advanceVillage(start, end, null);
    expect(whole.dwellings).toHaveLength(1); // zemnice se mezitím dostavěla
    const viaJson = (s: VillageState): VillageState =>
      JSON.parse(JSON.stringify(s)) as VillageState;
    let chunked = viaJson(start);
    for (const days of [1, 3, 17, 1, 40, 2, 90, 200]) {
      chunked = viaJson(advanceVillage(chunked, Math.min(end, chunked.lastDay + days), null));
    }
    expect(chunked).toEqual(whole);
  });
});

describe('advanceVillage – obydlí', () => {
  it('dokončené nové obydlí osídlí rodina – nepříbuzný manželský pár navíc', () => {
    const day = at(600, 10, 1);
    // ves z doby před příbuzenstvím: dva dospělí navíc dostanou při převodu pohlaví a svatbu
    const s0 = withoutFields(day, [adultOfAge(100, 20, day), adultOfAge(101, 21, day)]);
    const building = startNewDwelling(s0, day, 'zemnice', { x: 5, z: 5, rotation: 0 }, 0);
    const s = advanceVillage(building, day + 120, null);
    const finished = s.chronicle.find(
      (e) => e.kind === 'construction-finished' && e.constructionKind === 'dwelling',
    );
    expect(finished).toBeDefined();
    expect(s.dwellings).toHaveLength(2);
    const fresh = s.dwellings[1]!;
    expect(fresh).toMatchObject({ type: 'zemnice', condition: 1, position: { x: 5, z: 5 } });
    expect(finished).toMatchObject({ dwellingId: fresh.id, fieldId: null });
    expect(s.chronicle).toContainEqual({
      day: finished?.day,
      kind: 'household-founded',
      dwellingId: fresh.id,
    });
    expect(
      occupants(s, fresh.id)
        .map((p) => p.id)
        .filter((id) => id === 100 || id === 101),
    ).toEqual([100, 101]);
    expect(s.constructions).toEqual([]);
  });

  it('obydlí postavené do zásoby stojí prázdné, dokud domácnost nezplní – a chátrá rychleji', () => {
    const day = at(600, 10, 1);
    const settled = withBuiltFirstDwelling(found(day));
    // pár, pro který se stavělo, mezitím chybí (např. domácnost přišla o dospělého)
    settled.dwellings.push({
      id: 50,
      type: 'zemnice',
      builtDay: day,
      condition: 1,
      position: { x: 30, z: 0, rotation: 0 },
    });
    const s = advanceVillage(settled, day + Math.ceil(2 * YEAR), null);
    const fresh = s.dwellings.find((d) => d.id !== 1);
    expect(fresh).toBeDefined();
    expect(occupants(s, fresh!.id)).toEqual([]);
    expect(s.people.every((p) => p.dwellingId === 1)).toBe(true);
    // prázdné obydlí se neopravuje a chátrá rychleji (population.md – Prázdné obydlí): prázdná
    // zemnice spadne z plného stavu za ≈ 5 let – za 2 roky o ≈ 2/5, podle stáří skoro nic navíc
    expect(fresh!.condition).toBeGreaterThan(0.59);
    expect(fresh!.condition).toBeLessThan(0.6);
    // obydlené obydlí chátrá beze změny – jen podle stáří a neodvedených oprav, skoro nic
    expect(s.dwellings.find((d) => d.id === 1)!.condition).toBeGreaterThan(0.99);
  });

  it('po osídlení zrychlené chátrání přestane – opravy pokračují od stavu, který zbyl', () => {
    const day = at(600, 10, 1);
    const s0 = withoutFields(day);
    s0.dwellings.push({ id: 50, type: 'zemnice', builtDay: day, condition: 1, position: POSITION });
    const emptyYear = advanceVillage(s0, day + Math.ceil(YEAR), null);
    const left = emptyYear.dwellings.find((d) => d.id === 50)!.condition;
    expect(left).toBeGreaterThan(0.79);
    expect(left).toBeLessThan(0.8);
    // do obydlí se nastěhuje pár
    for (const id of [900, 901]) {
      emptyYear.people.push({ ...adultOfAge(id, 20, emptyYear.lastDay), dwellingId: 50 });
    }
    const s = advanceVillage(emptyYear, emptyYear.lastDay + Math.ceil(YEAR), null);
    const lived = s.dwellings.find((d) => d.id === 50)!.condition;
    expect(lived).toBeLessThanOrEqual(left); // stav se nezvedá
    expect(lived).toBeGreaterThan(left - 0.01); // prázdné by ztratilo dalších ≈ 0,2
  });

  it('prázdné obydlí obsadí rodina, která se může oddělit', () => {
    const day = at(600, 10, 1);
    const s0 = withoutFields(day, [adultOfAge(100, 20, day), adultOfAge(101, 21, day)]);
    s0.dwellings.push({ id: 50, type: 'zemnice', builtDay: day, condition: 1, position: POSITION });
    const s = advanceVillage(s0, day, null);
    expect(occupants(s, 50).map((p) => p.id)).toEqual([100, 101]);
    expect(s.chronicle).toContainEqual({ day, kind: 'household-founded', dwellingId: 50 });
  });

  it('opuštěné obydlí se nepřestavuje: rozestavěná přestavba se opustí (Ruling 19)', () => {
    const day = at(600, 10, 1);
    const s0 = withoutFields(day);
    s0.dwellings.push({ id: 50, type: 'zemnice', builtDay: day, condition: 1, position: POSITION });
    for (const p of s0.people) p.dwellingId = 50; // obydlí 1 zůstalo prázdné
    s0.constructions.push({
      id: 90,
      kind: 'rebuild',
      startedDay: day - 10,
      cost: 220,
      done: 10,
      dwellingType: 'polozemnice',
      position: null,
      dwellingId: 1,
      fieldId: null,
    });
    const s = advanceVillage(s0, day + 30, null);
    expect(s.constructions).toEqual([]);
    expect(count(s, 'construction-finished')).toBe(0);
    expect(s.dwellings.find((d) => d.id === 1)?.type).toBe('zemnice');
    expect(s.commonLaborHistory.at(-1)).toBeGreaterThan(0); // společná práce propadá, nestaví
  });

  // Domácnosti po rodinách (kinship.md – Domácnosti; population.md – Nové obydlí, Martin).
  /** Člověk pro rodinné testy: věk, pohlaví, domácnost a vazby. */
  interface Kin {
    id: number;
    age: number;
    sex: 'male' | 'female';
    home: number;
    spouse?: number;
    mother?: number;
    father?: number;
  }
  /** Ves s hotovou zemnicí 1 (a dalšími obydlími `extra`) a lidmi `people` s vazbami. */
  function kinVillage(day: number, people: Kin[], extra: Dwelling[] = []): VillageState {
    const s = withoutFields(day);
    s.nextId = 1000; // narození dostanou id od 1000 – původní obyvatelé jsou pod ním
    s.people = people.map((k) => ({
      id: k.id,
      bornDay: day - Math.ceil((k.age + 0.5) * YEAR),
      dwellingId: k.home,
      sex: k.sex,
      ...(k.spouse === undefined ? {} : { spouseId: k.spouse }),
      ...(k.mother === undefined ? {} : { motherId: k.mother }),
      ...(k.father === undefined ? {} : { fatherId: k.father }),
    }));
    s.dwellings.push(...extra);
    return s;
  }
  const zemnice = (id: number, day: number, type: Dwelling['type'] = 'zemnice'): Dwelling => ({
    id,
    type,
    builtDay: day,
    condition: 1,
    position: POSITION,
  });
  /** Původní obyvatelé obydlí (bez dětí narozených během běhu). */
  const originalOccupants = (s: VillageState, dwellingId: number): number[] =>
    occupants(s, dwellingId)
      .map((p) => p.id)
      .filter((id) => id < 1000);
  /** Rodiče 50 a 47 v domě 1 (otec 10, matka 11). */
  const parents = (fatherAge = 50, motherAge = 47): Kin[] => [
    { id: 10, age: fatherAge, sex: 'male', home: 1, spouse: 11 },
    { id: 11, age: motherAge, sex: 'female', home: 1, spouse: 10 },
  ];
  const child = (id: number, age: number, sex: Kin['sex'], extra: Partial<Kin> = {}): Kin => ({
    id,
    age,
    sex,
    home: 1,
    mother: 11,
    father: 10,
    ...extra,
  });

  it('nové obydlí osídlí rodina mladšího ženatého syna – nejstarší ženatý syn zůstává (dědic)', () => {
    const day = at(600, 10, 1);
    const s0 = kinVillage(day, [
      ...parents(),
      child(20, 26, 'male', { spouse: 21 }),
      { id: 21, age: 22, sex: 'female', home: 1, spouse: 20 },
      child(30, 23, 'male', { spouse: 31 }),
      { id: 31, age: 20, sex: 'female', home: 1, spouse: 30 },
      { id: 32, age: 1, sex: 'female', home: 1, mother: 31, father: 30 },
    ]);
    expect(availableSettlers(s0, day)).toBe(1);
    const building = startNewDwelling(s0, day, 'zemnice', { x: 5, z: 5, rotation: 0 }, 0);
    expect(availableSettlers(building, day)).toBe(0);
    const s = advanceVillage(building, day + 120, null);
    const fresh = s.dwellings.find((d) => d.id !== 1)!;
    expect(originalOccupants(s, fresh.id)).toEqual([30, 31, 32]);
    expect(originalOccupants(s, 1)).toEqual([10, 11, 20, 21]);
    expect(s.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'household-founded', dwellingId: fresh.id }),
    );
  });

  it('dva ženatí bratři bez rodičů – mladší se s rodinou oddělí do prázdného obydlí, i z neplného domu', () => {
    const day = at(600, 10, 1);
    const brothers: Kin[] = [
      { id: 20, age: 30, sex: 'male', home: 1, spouse: 21, mother: 5, father: 4 },
      { id: 21, age: 27, sex: 'female', home: 1, spouse: 20 },
      { id: 30, age: 26, sex: 'male', home: 1, spouse: 31, mother: 5, father: 4 },
      { id: 31, age: 24, sex: 'female', home: 1, spouse: 30 },
    ];
    // 4 lidé v zemnici pro 6 – dům není plný, mladší bratr se ženou přesto odejde (Martin,
    // 19. 10. 2026)
    const notFull = advanceVillage(kinVillage(day, brothers, [zemnice(50, day)]), day + 5, null);
    expect(originalOccupants(notFull, 50)).toEqual([30, 31]);
    // s dětmi odejde mladší bratr i se svým dítětem
    const s0 = kinVillage(
      day,
      [
        ...brothers,
        { id: 40, age: 4, sex: 'male', home: 1, mother: 21, father: 20 },
        { id: 41, age: 2, sex: 'female', home: 1, mother: 31, father: 30 },
      ],
      [zemnice(50, day)],
    );
    const s = advanceVillage(s0, day, null);
    expect(originalOccupants(s, 50)).toEqual([30, 31, 41]);
  });

  it('založená ves: lidé k osídlení, jakmile se děti zakladatelů vezmou – i z neplného domu', () => {
    const day = at(600, 3, 15);
    let s = advanceVillage(foundVillage({ seed: 5, day, dwellingPosition: POSITION }), day, null);
    expect(availableSettlers(s, day)).toBe(0);
    // za 5 let: zemnice stojí, chlapec a dívka zakladatelů jsou svoji – dva páry ve 4–5 lidech;
    // mladší pár dům nedrží (zůstává nejstarší ženatý muž) a smí odejít (Martin, 19. 10. 2026)
    s = advanceVillage(s, day + Math.ceil(5 * YEAR), null);
    expect(s.people.filter((p) => p.sex === 'male' && p.spouseId !== undefined)).toHaveLength(2);
    expect(s.people.length).toBeLessThan(6);
    expect(availableSettlers(s, s.lastDay)).toBe(1);
  });

  it('svobodný nejstarší syn z přeplněného domu odejde sám, nerozpadne se a vezme si dceru odvedle', () => {
    const day = at(600, 10, 1);
    const s0 = kinVillage(
      day,
      [
        ...parents(46, 40),
        child(20, 18, 'male'),
        child(21, 15, 'female'),
        child(22, 8, 'male'),
        child(23, 5, 'female'),
        child(24, 2, 'male'),
        // sousedé (dům 2): rodiče 45 a 42 a dcera 17
        { id: 40, age: 45, sex: 'male', home: 2, spouse: 41 },
        { id: 41, age: 42, sex: 'female', home: 2, spouse: 40 },
        { id: 42, age: 17, sex: 'female', home: 2, mother: 41, father: 40 },
      ],
      [zemnice(2, day), zemnice(50, day)],
    );
    // přeplněný dům (7 lidí v zemnici) – lidé k osídlení i bez ženatého syna
    expect(availableSettlers(s0, day)).toBe(0); // jeden osadník, na něj čeká prázdné obydlí 50
    const s = advanceVillage(s0, day, null);
    expect(originalOccupants(s, 50)).toEqual([20, 42]);
    expect(s.people.find((p) => p.id === 20)?.spouseId).toBe(42);
    expect(s.chronicle).toContainEqual({
      day,
      kind: 'marriage',
      fromDwellingId: 2,
      toDwellingId: 50,
      groomId: 20,
      brideId: 42,
      groomFromDwellingId: 50,
      brideFromDwellingId: 2,
    });
    // za rok nikdo zpátky – ani sestra (15) neodešla, dcery odcházejí sňatkem
    const later = advanceVillage(s, day + 365, null);
    expect(originalOccupants(later, 1)).toEqual([10, 11, 21, 22, 23, 24]);
    expect(count(later, 'household-merged')).toBe(0);
  });

  it('neplodní rodiče bez ženatého syna: nejstarší syn zůstává (dědic), druhý odejde sám', () => {
    const day = at(600, 10, 1);
    const s0 = kinVillage(
      day,
      [
        ...parents(50, 47),
        child(20, 22, 'male'),
        child(21, 19, 'male'),
        child(22, 12, 'female'),
        child(23, 9, 'male'),
        child(24, 6, 'female'),
      ],
      [zemnice(50, day)],
    );
    const s = advanceVillage(s0, day, null);
    expect(originalOccupants(s, 50)).toEqual([21]);
    expect(originalOccupants(s, 1)).toEqual([10, 11, 20, 22, 23, 24]);
  });

  it('se ženatým dědicem smí z přeplněného domu odejít nejstarší svobodný syn', () => {
    const day = at(600, 10, 1);
    const s0 = kinVillage(
      day,
      [
        ...parents(46, 40),
        child(20, 25, 'male', { spouse: 25 }),
        { id: 25, age: 21, sex: 'female', home: 1, spouse: 20 },
        child(21, 19, 'male'),
        child(22, 9, 'female'),
        child(23, 4, 'male'),
      ],
      [zemnice(50, day)],
    );
    const s = advanceVillage(s0, day, null);
    expect(originalOccupants(s, 50)).toEqual([21]);
  });

  it('dcery samy neodcházejí – přeplněný dům bez synů prázdné obydlí neosídlí', () => {
    const day = at(600, 10, 1);
    const s0 = kinVillage(
      day,
      [
        ...parents(46, 40),
        child(20, 18, 'female'),
        child(21, 16, 'female'),
        child(22, 9, 'female'),
        child(23, 5, 'female'),
        child(24, 2, 'female'),
      ],
      [zemnice(50, day)],
    );
    const s = advanceVillage(s0, day + 5, null);
    expect(occupants(s, 50)).toEqual([]);
  });

  it('osídlení po rodinách a sňatky nezávisí na kouscích dopočtu', () => {
    const day = at(600, 10, 1);
    const start = kinVillage(
      day,
      [
        ...parents(46, 40),
        child(20, 18, 'male'),
        child(21, 15, 'female'),
        child(22, 13, 'male'),
        child(23, 5, 'female'),
        child(24, 2, 'male'),
        { id: 40, age: 45, sex: 'male', home: 2, spouse: 41 },
        { id: 41, age: 42, sex: 'female', home: 2, spouse: 40 },
        { id: 42, age: 17, sex: 'female', home: 2, mother: 41, father: 40 },
        { id: 43, age: 14, sex: 'male', home: 2, mother: 41, father: 40 },
      ],
      [zemnice(2, day), zemnice(50, day), zemnice(51, day)],
    );
    start.storesKg = 60_000;
    const end = day + Math.ceil(8 * YEAR);
    const whole = advanceVillage(start, end, null);
    expect(count(whole, 'marriage')).toBeGreaterThanOrEqual(2);
    expect(count(whole, 'birth')).toBeGreaterThan(0);
    const viaJson = (s: VillageState): VillageState =>
      JSON.parse(JSON.stringify(s)) as VillageState;
    let chunked = viaJson(start);
    for (const days of [1, 3, 17, 1, 40, 2, 90, 200, 400, 1000]) {
      chunked = viaJson(advanceVillage(chunked, Math.min(end, chunked.lastDay + days), null));
    }
    chunked = advanceVillage(chunked, end, null);
    expect(viaJson(chunked)).toEqual(viaJson(whole));
  });

  // Martin, 18. 10. 2026: „ať prázdný dům obsadí i plná domácnost“ – bez příbuzenství z toho
  // vzniklo stěhování tam a zpět (21letý odešel z plné polozemnice sám a sňatek ho vrátil ke
  // 40letému „svobodnému“ dědici – 11× za 10 dní). Sourozenci a rodiče se nevezmou.
  it('plná domácnost neplodných rodičů 53 a 53 se syny 40 a 21 a prázdný dům: nejvýš jedno stěhování za 30 dní', () => {
    const day = at(600, 10, 1);
    const moves = (s: VillageState): number =>
      s.chronicle.filter(
        (e) =>
          e.kind === 'household-founded' || e.kind === 'marriage' || e.kind === 'household-merged',
      ).length;
    for (const second of ['male', 'female'] as const) {
      const s0 = kinVillage(
        day,
        [
          ...parents(53, 53),
          child(20, 40, 'male'),
          child(21, 21, second),
          child(22, 12, 'female'),
          child(23, 9, 'male'),
          child(24, 6, 'female'),
          child(25, 3, 'male'),
        ],
        [zemnice(50, day)],
      );
      s0.dwellings[0]!.type = 'polozemnice'; // 8 lidí na 8 míst – plná, ne přeplněná
      s0.storesKg = 60_000;
      const s = advanceVillage(s0, day + 29, null);
      expect(moves(s)).toBeLessThanOrEqual(1);
      if (second === 'male') {
        // dědic (40) zůstává, odejde druhý syn – a zpátky ho nic nevrátí
        expect(originalOccupants(s, 50)).toEqual([21]);
        expect(moves(s)).toBe(1);
      } else {
        // dcera sama neodchází – prázdný dům počká
        expect(occupants(s, 50)).toEqual([]);
      }
    }
  });

  // Martin, 19. 10. 2026: „Vdova by se měla snažit co nejdříve vdát, ideálně ve vesnici.“ – ve
  // Vlkově se 21letá matka pětiletého syna a 30letá vdova s pěti dětmi nesměly vdát (vdova s dětmi
  // do 14 let se nevdávala). Ves uložená dřív (bez příznaku ovdovění) se vdá podle nových pravidel.
  it('vdova s dětmi se vdá hned, jak dospěje ženich ze vsi – přižení se k ní, dopočet po kouscích stejný', () => {
    const day = at(600, 10, 1);
    const s0 = kinVillage(
      day,
      [
        // dům 1: rodiče 50 a 47 se synem 15 (za rok mu bude 16) a dcerami
        ...parents(),
        child(20, 15.5, 'male'),
        child(21, 12, 'female'),
        child(22, 9, 'female'),
        // dům 2: vdova 30 s pěti dětmi (otec 90 zemřel)
        { id: 30, age: 30, sex: 'female', home: 2 },
        ...[11, 11, 10, 10, 9].map((age, i): Kin => ({
          id: 31 + i,
          age,
          sex: 'male',
          home: 2,
          mother: 30,
          father: 90,
        })),
      ],
      [zemnice(2, day, 'polozemnice')],
    );
    s0.storesKg = 60_000;
    const end = day + Math.ceil(3 * YEAR);
    const whole = advanceVillage(s0, end, null);
    const viaJson = (s: VillageState): VillageState =>
      JSON.parse(JSON.stringify(s)) as VillageState;
    let chunked = viaJson(s0);
    for (const days of [1, 30, 7, 100, 3, 200, 365]) {
      chunked = viaJson(advanceVillage(chunked, Math.min(end, chunked.lastDay + days), null));
    }
    chunked = advanceVillage(chunked, end, null);
    expect(viaJson(chunked)).toEqual(viaJson(whole));
    const wedding = whole.chronicle.find((e) => e.kind === 'marriage');
    // syn dospěje (16) za půl roku a ožení se s vdovou (rozdíl 15 let – u vdovy smí 20); dům
    // drží ona s dětmi, jeho otec doma zůstává – přižení se on
    expect(wedding).toMatchObject({
      kind: 'marriage',
      fromDwellingId: 1,
      toDwellingId: 2,
      groomMoved: true,
      widow: true,
    });
    expect(wedding!.day).toBeLessThan(day + YEAR);
    const widow = whole.people.find((p) => p.id === 30);
    expect(widow?.spouseId).toBe(20);
    expect(originalOccupants(whole, 2)).toEqual([20, 30, 31, 32, 33, 34, 35]);
    // první dítě nejdřív 9 měsíců po svatbě
    const born = whole.people.filter((p) => p.motherId === 30 && p.fatherId === 20);
    for (const b of born) expect(b.bornDay).toBeGreaterThanOrEqual(wedding!.day + 274);
  });

  it('Vlkov (stará ves bez pohlaví): převod udělá páry, 27letý si vezme 19letou a mají děti', () => {
    const day = at(612, 8, 3);
    // stav Martinovy vsi z lokální databáze (3. 8. 612): polozemnice 63, 49, 27, 12, 10, 7
    // a zemnice 43, 19, 2, 2 – lidé bez pohlaví a vazeb
    const s0 = withoutFields(day);
    s0.nextId = 1000;
    s0.storesKg = 60_000;
    s0.dwellings[0]!.type = 'polozemnice';
    s0.dwellings.push(zemnice(2, day));
    s0.people = [
      ...[63, 49, 27, 12, 10, 7].map((age, i) => ({ id: 100 + i, age, home: 1 })),
      ...[43, 19, 2, 2].map((age, i) => ({ id: 200 + i, age, home: 2 })),
    ].map(({ id, age, home }) => ({
      id,
      bornDay: day - Math.ceil((age + 0.5) * YEAR),
      dwellingId: home,
    }));
    const kin = withKinship(s0);
    const sexes = kin.people.map((p) => p.sex);
    expect(sexes).toEqual([
      'male',
      'female',
      'male',
      'female',
      'male',
      'female',
      'male',
      'female',
      'male',
      'female',
    ]);
    // 63 a 49 jsou manželé; 43 a 19 ne – věkový rozdíl přes 15 let
    expect(kin.people.find((p) => p.id === 100)?.spouseId).toBe(101);
    expect(kin.people.find((p) => p.id === 200)?.spouseId).toBeUndefined();
    expect(withKinship(kin)).toBe(kin);
    const s = advanceVillage(s0, day + Math.ceil(6 * YEAR), null);
    const wedding = s.chronicle.find((e) => e.kind === 'marriage');
    // 19letá z zemnice se hned provdá za 27letého do polozemnice (v zemnici zůstane 43letý)
    expect(wedding).toEqual({
      day,
      kind: 'marriage',
      fromDwellingId: 2,
      toDwellingId: 1,
      groomId: 102,
      brideId: 201,
      groomFromDwellingId: 1,
      brideFromDwellingId: 2,
    });
    expect(s.people.find((p) => p.id === 102)?.spouseId).toBe(201);
    const born = s.people.filter((p) => p.motherId === 201 && p.fatherId === 102);
    expect(born.length).toBeGreaterThanOrEqual(1);
  });

  /** Práce na opravách posledního dne (rozdělení práce dne). */
  const repairLabor = (s: VillageState): number =>
    (s.labor?.shares ?? [])
      .filter((share) => share.activity === 'repair')
      .reduce((sum, share) => sum + share.manDays, 0);

  it('opravy obydlí až po stavbách – co stavba spotřebuje, na opravy nezbude (Martin)', () => {
    const day = at(600, 10, 1);
    const s0 = withoutFields(day);
    // stará zemnice potřebuje opravy
    s0.dwellings[0]!.builtDay = day - 17 * 365;
    const quiet = advanceVillage(s0, day + 1, null);
    expect(repairLabor(quiet)).toBeGreaterThan(0);
    // stavba nového domu vezme celou práci mužů (population.md – Práce, Stavby staví muži) – opravy
    // dostanou jen zbytek: ve vsi samých mužů nic, se ženami jejich volnou práci
    const building = startReplacement(s0, day, 1, 'polozemnice', { x: 30, z: 30, rotation: 0 }, 0);
    const asMen = (s: VillageState): VillageState => ({
      ...s,
      people: s.people.map((p) => ({ ...p, sex: 'male' as const })),
    });
    const busy = advanceVillage(asMen(building), day + 1, null);
    expect(repairLabor(busy)).toBe(0);
    expect(busy.labor!.shares.some((share) => share.construction !== undefined)).toBe(true);
    // volná práce (před stavbami) je stejná – stavba ji jen využije
    const quietMen = advanceVillage(asMen(s0), day + 1, null);
    expect(busy.commonLaborHistory.at(-1)).toBeCloseTo(quietMen.commonLaborHistory.at(-1)!, 9);
    const mixed = advanceVillage(building, day + 1, null);
    expect(repairLabor(mixed)).toBeGreaterThan(0);
    expect(repairLabor(mixed)).toBeLessThanOrEqual(repairLabor(quiet) + 1e-9);
  });

  it('obydlený dům nechátrá ani bez práce na opravy, prázdný vedle něj chátrá (Martin)', () => {
    const day = at(600, 10, 1);
    const s0 = withoutFields(day);
    // stará zemnice s vysokou potřebou oprav, v ní jen malé děti – na opravy nikdo nepracuje
    const home = s0.dwellings[0]!;
    home.builtDay = day - 17 * 365;
    home.condition = 0.6;
    s0.people = [3, 4, 2].map((years, i) => ({ ...adultOfAge(200 + i, years, day) }));
    s0.dwellings.push({
      id: 50,
      type: 'zemnice',
      builtDay: day - 17 * 365,
      condition: 1,
      position: POSITION,
    });
    const s = advanceVillage(s0, day + 200, null);
    expect(s.dwellings.find((d) => d.id === home.id)?.condition).toBe(0.6);
    expect(repairLabor(s)).toBe(0);
    expect(s.dwellings.find((d) => d.id === 50)!.condition).toBeLessThan(0.95);
  });

  it('starý obydlený dům stav drží – opravy podle stáří dál berou práci vsi', () => {
    const day = at(600, 10, 1);
    const s0 = withoutFields(day);
    s0.dwellings[0]!.builtDay = day - 17 * 365;
    const s = advanceVillage(s0, day + 120, null);
    expect(s.dwellings[0]!.condition).toBe(1);
    expect(repairLabor(s)).toBeGreaterThan(0);
  });

  it('obydlený dům na nule po dřívějším chátrání se nepřestavuje – rozhoduje stáří', () => {
    const day = at(600, 10, 1);
    const young = withoutFields(day);
    young.dwellings[0]!.condition = 0;
    const kept = advanceVillage(young, day + 30, null);
    expect(count(kept, 'rebuild-decided')).toBe(0);
    expect(kept.dwellings[0]!.condition).toBe(0);
    const old = withoutFields(day);
    old.dwellings[0]!.builtDay = day - (DWELLINGS.zemnice.lifespanYears + 1) * 365;
    expect(count(advanceVillage(old, day, null), 'rebuild-decided')).toBe(1);
  });

  it('prázdné obydlí chátrá a na nule zanikne', () => {
    const day = at(600, 10, 1);
    const s0 = withoutFields(day);
    s0.dwellings.push({
      id: 50,
      type: 'zemnice',
      builtDay: day - 20 * 365,
      condition: 0.0001,
      position: POSITION,
    });
    const s = advanceVillage(s0, day, null);
    expect(s.dwellings.map((d) => d.id)).toEqual([1]);
  });

  it('dožilé obydlí obyvatelé přestaví – na lepší, když na to ves má', () => {
    const day = at(600, 10, 1);
    // dvorec vojvody je jinde – první zemnice je obyčejné obydlí (trade.md)
    const s0 = withManorElsewhere(withBuiltFirstDwelling(found(day)));
    s0.dwellings[0]!.builtDay = day - (DWELLINGS.zemnice.lifespanYears + 1) * 365;
    // za rok společné práce by polozemnici (220 čd) postavila
    s0.commonLaborYearly = 1;
    const decided = advanceVillage(s0, day, null);
    expect(decided.chronicle).toContainEqual({
      day,
      kind: 'rebuild-decided',
      dwellingId: 1,
      type: 'polozemnice',
    });
    const rebuild = decided.constructions.filter((c) => c.kind === 'rebuild');
    expect(rebuild).toHaveLength(1);
    expect(rebuild[0]).toMatchObject({ dwellingId: 1, dwellingType: 'polozemnice', cost: 220 });

    const s = advanceVillage(decided, day + 2 * 365, null);
    const finished = s.chronicle.find(
      (e) => e.kind === 'construction-finished' && e.constructionKind === 'rebuild',
    );
    expect(finished).toMatchObject({ dwellingId: 1, fieldId: null });
    expect(count(s, 'rebuild-decided')).toBe(1);
    expect(s.dwellings[0]).toMatchObject({ type: 'polozemnice' });
    expect(s.dwellings[0]?.builtDay).toBe(finished?.day);
  });
});

describe('přestavba na lepší obydlí – roční průměr práce a dřevo (Martin 18. 10. 2026)', () => {
  /** Dožilá zemnice v zimě: posledních 30 dní ves jen mlátila – společná práce nulová. */
  function winter(): { s0: VillageState; day: number } {
    const day = at(600, 1, 15);
    const s0 = withManorElsewhere(withBuiltFirstDwelling(found(day)));
    s0.dwellings[0]!.builtDay = day - (DWELLINGS.zemnice.lifespanYears + 1) * 365;
    s0.commonLaborHistory = Array.from({ length: COMMON_LABOR_HISTORY_DAYS }, () => 0);
    s0.woodLogs = 40;
    return { s0, day };
  }
  const decidedType = (s: VillageState): string | null =>
    s.constructions.find((c) => c.kind === 'rebuild')?.dwellingType ?? null;

  it('v zimě rozhoduje roční průměr – ves s > 6 čd denně staví polozemnici', () => {
    const { s0, day } = winter();
    s0.commonLaborYearly = 6.2;
    expect(decidedType(advanceVillage(s0, day, null))).toBe('polozemnice');
    // starší ves bez ročního průměru začne průměrem 30 dní – v zimě zemnice
    delete s0.commonLaborYearly;
    expect(decidedType(advanceVillage(s0, day, null))).toBe('zemnice');
  });

  it('bez dřeva na polozemnici (klády ani stromy ke skácení) se přestaví na zemnici', () => {
    const { s0, day } = winter();
    s0.commonLaborYearly = 6.2;
    s0.woodLogs = 5;
    const noTrees = packObstacles([], 16, 15);
    expect(decidedType(advanceVillage(s0, day, noTrees))).toBe('zemnice');
    s0.woodLogs = 18.4;
    expect(decidedType(advanceVillage(s0, day, noTrees))).toBe('polozemnice');
  });

  it('roční průměr se vede den po dni – starší ves začne průměrem 30 dní, na kouscích nezáleží', () => {
    const start = at(600, 3, 15);
    // ves samých mužů – posledních 30 dní je celá společná práce (jinak jen práce mužů na stavby –
    // population.md – Práce, Stavby staví muži), roční průměr ji vede vždy celou
    const founded = found(start);
    const s0: VillageState = {
      ...founded,
      people: founded.people.map((p) => ({ ...p, sex: 'male' as const })),
    };
    s0.commonLaborHistory = [3, 6, 9];
    const one = advanceVillage(s0, s0.lastDay + 1, null);
    const common = one.commonLaborHistory.at(-1)!;
    expect(one.commonLaborYearly).toBeCloseTo(6 + (common - 6) / COMMON_LABOR_YEAR_DAYS, 12);
    const end = start + 500;
    const whole = advanceVillage(s0, end, null);
    let parts = s0;
    for (const step of [1, 90, 91, 365, 500]) parts = advanceVillage(parts, start + step, null);
    expect(parts.commonLaborYearly).toBe(whole.commonLaborYearly);
    expect(parts).toEqual(whole);
  });
});

describe('advanceVillage – ozim a jař (fields.md – Ozim a jař)', () => {
  const settled = (): VillageState => advanceVillage(found(at(600, 3, 15)), at(601, 9, 1), null);

  it('1. 9. ves oseje ozim, kolik podzim stihne, zbytek jaří; díly nesou plodinu', () => {
    const s = settled();
    const winter = seasonCrop(s.season, 'winter');
    expect(winter?.partIds.length).toBeGreaterThan(0);
    for (const id of winter?.partIds ?? []) {
      expect(s.parts.find((p) => p.id === id)?.crop).toBe('winter');
    }
    for (const id of seasonCrop(s.season, 'spring')?.partIds ?? []) {
      expect(s.parts.find((p) => p.id === id)?.crop).toBe('spring');
    }
    // díly mimo osev plodinu nemají
    for (const p of s.parts) if (p.state !== 'sown') expect(p.crop).toBeUndefined();
  });

  it('ozim se do konce října zkope a zaseje, jař se kope na podzim, co zbude', () => {
    // díly, které přibyly aspoň WORK_FRONT_DAYS dní před koncem okna; díl dozakládaný v posledních
    // dnech října přibude na čelo i tak (čelo konec okna nehlídá) a kratší říjnový den ho už
    // nestihne (population.md – Skladba dne podle ročního období)
    const before = advanceVillage(settled(), at(601, 10, 28), null);
    const early = seasonCrop(before.season!, 'winter')!.required;
    const autumn = advanceVillage(before, at(601, 10, 31), null);
    const winter = seasonCrop(autumn.season!, 'winter')!;
    expect(winter.done.dig).toBeGreaterThanOrEqual(early.dig - 1e-6);
    // plán nechá poslední den okna na zasetí pruhu zkopaného den předtím
    expect(winter.done.sow).toBeGreaterThanOrEqual(early.sow - 1e-6);
    const november = advanceVillage(autumn, at(601, 11, 30), null);
    expect(seasonCrop(november.season!, 'winter')!.done.sow).toBe(winter.done.sow); // po okně se už neseje
    if (springCrop(november.season!).required.dig > 0)
      expect(springCrop(november.season!).done.dig).toBeGreaterThan(0);
  });

  it('31. 7. sklizeň ozimu do snopů, 31. 8. jař, výmlat obou po žni do konce října', () => {
    const july = advanceVillage(settled(), at(602, 7, 30), null);
    const harvested = advanceVillage(july, at(602, 7, 31), null);
    const winterHarvest = harvests(harvested).at(-1)!;
    expect(winterHarvest).toMatchObject({ day: at(602, 7, 31), crop: 'winter' });
    expect(winterHarvest.kg).toBeGreaterThan(0);
    expect(Math.round(seasonCrop(harvested.season!, 'winter')!.harvestedKg!)).toBe(
      winterHarvest.kg,
    );
    // ozim jde do snopů s prací výmlatu sklizené části (production-chains.md – Humno)
    expect(villageSheaves(harvested).grainKg).toBeGreaterThan(winterHarvest.kg - 1);
    expect(sheafWork(harvested, 'winter')).toBeCloseTo(
      taskRemaining(seasonCrop(harvested.season!, 'winter')!, 'thresh'),
      6,
    );
    expect(harvested.storesKg).toBeLessThan(july.storesKg);

    const august = advanceVillage(harvested, at(602, 8, 31), null);
    expect(august.season).toBeNull();
    expect(seasonCrop(august.threshingSeason, 'winter')?.harvestedKg).toBe(
      seasonCrop(harvested.season!, 'winter')!.harvestedKg,
    );
    expect(sheafWork(august, 'spring')).toBeGreaterThan(0);
    // výmlat čeká za přípravou půdy pod ozim (fields.md – Pořadí důležitosti polních prací); od
    // přílohové soustavy (10. 11. 2026) jde ozim i na díly v osevu, takže podzimní práce je víc –
    // do konce října je vymláceno všechno (zásoby přitom berou osivo na víc dílů ozimu)
    const october = advanceVillage(august, at(602, 10, 31), null);
    expect(villageSheaves(october)).toEqual({ grainKg: 0, legumesKg: 0 });
    expect(august.storesKg).toBeGreaterThan(harvested.storesKg);
    expect(advanceVillage(october, at(602, 11, 1), null).threshingSeason).toBeNull();
  });

  it('starší ves bez plodin na dílech a bez ozimu v plánu dopočítá dál (díl bez plodiny = jař)', () => {
    const old = advanceVillage(found(at(600, 3, 15)), at(601, 6, 1), null);
    dropSeasonCrop(old.season!, 'winter');
    for (const p of old.parts) delete p.crop;
    const s = advanceVillage(JSON.parse(JSON.stringify(old)) as VillageState, at(601, 9, 2), null);
    expect(harvests(s).at(-1)?.crop).toBeUndefined();
    expect(seasonCrop(s.season, 'winter')?.partIds.length).toBeGreaterThan(0);
    expect(nonFinite(s)).toEqual([]);
  });
});
