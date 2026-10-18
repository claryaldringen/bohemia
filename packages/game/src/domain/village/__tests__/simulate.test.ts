import { describe, expect, it } from 'vitest';
import { TOTAL_GAME_DAYS, dayIndexOf } from '../../calendar';
import { foundField, foundVillage, startNewDwelling } from '../actions';
import type { PartInput } from '../actions';
import { daysUntilHarvest, eatDay } from '../food';
import { ageYears, foodNeedPerDay, occupants } from '../people';
import { NO_CRAFTS } from '../productivity';
import {
  AGE,
  CHRONICLE_MAX_EVENTS,
  COMMON_LABOR_HISTORY_DAYS,
  COMMON_LABOR_YEAR_DAYS,
  DWELLINGS,
} from '../rules';
import { packObstacles } from '../../landscape';
import { villageLaborFactor } from '../happiness';
import { advanceVillage } from '../simulate';
import type { ChronicleEvent, Person, VillageState } from '../types';
import { createPlan, planCrops, planPartIds, taskRemaining, threshLossKg } from '../year-plan';
import { withBuiltFirstDwelling } from './village-fixtures';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];
const START_PARTS = 75;

/** Startovní pole ≈ 1,7 ha: díly po 225 m², úrodnost 70, louka 50–100 m od obydlí. */
const field = (count = START_PARTS): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

const found = (day: number, seed = 42, parts = field()): VillageState =>
  foundVillage({ seed, day, dwellingPosition: POSITION, firstField: { outline: OUTLINE, parts } });

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
  return s;
}
const adultOfAge = (id: number, years: number, day: number): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR),
  dwellingId: 1,
});

describe('advanceVillage – dopočítání', () => {
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

    // ves za 10 let opravdu žila – jinak by shoda nic neznamenala
    expect(harvests(whole).length).toBeGreaterThanOrEqual(10);
    expect(count(whole, 'birth')).toBeGreaterThan(0);
    expect(whole.lastDay).toBe(end);
  });

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
  });

  it('nemění vstupní stav a do stejného dne vrátí shodnou kopii', () => {
    const start = found(at(600, 3, 15));
    const before = structuredClone(start);
    advanceVillage(start, at(601, 3, 15), null);
    expect(start).toEqual(before);
    const same = advanceVillage(start, start.lastDay, null);
    expect(same).toEqual(start);
    expect(same).not.toBe(start);
  });

  it('(b) ves založená 1. 10. 600 sklidí a do druhé sklizně nehladoví', () => {
    // Okno do druhé sklizně (Ruling 12): trvalé nasycení s polem, které hráč rozšiřuje
    // (≥ 0,95 po 95 % let), je cíl kalibrace v Task 10 – startovní pole 1,7 ha je po třech
    // osevech vyčerpané a potřeba roste (dospívající → dospělí, porody).
    const s = advanceVillage(found(at(600, 10, 1)), at(602, 8, 31), null);
    // jař 601 (díly hotové po plánu jdou do jaře), pak ozim v červenci a jař v srpnu 602
    expect(
      harvests(s)
        .filter((e) => e.kg > 0)
        .map((e) => e.crop ?? 'spring'),
    ).toEqual(['spring', 'winter', 'spring']);
    expect(count(s, 'hunger-began')).toBe(0);
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
    expect(lastSummerDay.plan).toBeNull(); // díly hotové po dubnu čekají na 1. 9.
    expect(lastSummerDay.parts.some((p) => p.state === 'ready')).toBe(true);
    expect(count(lastSummerDay, 'hunger-began')).toBe(0);
    expect(lastSummerDay.people).toHaveLength(start.people.length);

    const s = advanceVillage(lastSummerDay, at(600, 9, 1), null);
    expect(s.plan).not.toBeNull();
    const planned = planPartIds(s.plan!);
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
    expect(s.plan ? planPartIds(s.plan) : []).toEqual([]);
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

describe('advanceVillage – roční plán a sklizeň', () => {
  it('díl dokončený na podzim hned založí plán a další díly ho rozšíří (Ruling 2)', () => {
    // první díl (2,25 čd) se dělí o společnou práci se stavbou první zemnice – stačí pár dní
    const start = found(at(600, 10, 1));
    const early = advanceVillage(start, at(600, 10, 10), null);
    expect(early.plan).not.toBeNull();
    expect(early.plan?.plannedDay).toBeLessThanOrEqual(at(600, 10, 10));
    const later = advanceVillage(early, at(600, 12, 31), null);
    expect(later.plan?.plannedDay).toBe(early.plan?.plannedDay);
    expect(later.plan?.partIds.length).toBeGreaterThan(early.plan?.partIds.length ?? 0);
    // výmlat v listopadu a prosinci patří loňské úrodě – letošní plán nemlátí předem
    expect(later.plan?.done.thresh).toBe(0);
    for (const id of later.plan?.partIds ?? []) {
      const part = later.parts.find((p) => p.id === id);
      expect(part?.state).toBe('sown');
      expect(part?.foundingDone).toBeGreaterThanOrEqual(part?.foundingCost ?? Infinity);
    }
  });

  it('31. 8. sklizeň do zásob a plán k výmlatu, 1. 3. výmlat skončí (Ruling 8)', () => {
    const before = advanceVillage(found(at(600, 3, 15)), at(600, 8, 30), null);
    expect(before.plan).not.toBeNull();
    const s = advanceVillage(before, at(600, 8, 31), null);
    const harvest = harvests(s).at(-1);
    expect(harvest?.day).toBe(at(600, 8, 31));
    expect(harvest?.kg).toBeGreaterThan(0);
    expect(s.plan).toBeNull();
    expect(s.threshingFromPlan?.partIds).toEqual(before.plan?.partIds);
    expect(Math.round(s.threshingFromPlan?.harvestedKg ?? -1)).toBe(harvest?.kg);
    expect(s.storesKg).toBeGreaterThan(before.storesKg + (harvest?.kg ?? 0) - 5);

    const winterEnd = advanceVillage(s, at(601, 2, 28), null);
    const thresh = winterEnd.threshingFromPlan;
    expect(thresh?.done.thresh).toBeGreaterThan(0);
    expect(taskRemaining(thresh!, 'thresh')).toBeCloseTo(0, 6); // vymlácená celá sklizená část
    expect(advanceVillage(winterEnd, at(601, 3, 1), null).threshingFromPlan).toBeNull();
  });

  it('1. 9. nevybrané osevy a připravené díly jdou do přílohu (Ruling 9, 10)', () => {
    const day = at(600, 9, 1);
    const start = found(at(600, 6, 1));
    start.constructions = [];
    start.lastDay = day - 1;
    start.storesKg = 5000; // zásoby nad prahem – cíl osevu je jen potřeba, nezávisle na rezervě
    start.parts.forEach((p, i) => {
      p.foundingDone = p.foundingCost;
      p.state = i < 70 ? 'sown' : 'ready';
      p.sownYears = i < 70 ? 1 : 0;
    });
    const s = advanceVillage(start, day, null);
    const selected = new Set(planPartIds(s.plan!));
    expect(selected.size).toBeGreaterThan(0);
    expect(selected.size).toBeLessThan(70); // cíl pokryjí už osevy
    for (const p of s.parts) {
      if (selected.has(p.id)) {
        expect(p).toMatchObject({ state: 'sown', sownYears: 2 });
      } else {
        expect(p).toMatchObject({ state: 'fallow', fallowSinceDay: day, sownYears: 0 });
      }
    }
    const ready = s.parts.slice(70);
    expect(ready.every((p) => p.fertilityShare === 1)).toBe(true);
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
    // na přílohu se pase – nezaroste v les, vrátit ho stojí drn jako louka (Martin, 18. 10. 2026)
    const { s } = returningFallow(604);
    const crops = planCrops(s.plan!);
    expect(planPartIds(s.plan!).length).toBeGreaterThan(0);
    const ha = (work: (typeof crops)[number]['work']): number =>
      work.partIds.reduce((sum, id) => sum + s.parts.find((p) => p.id === id)!.areaM2, 0) / 10_000;
    for (const { work } of crops) {
      if (work.partIds.length === 0) continue;
      expect(work.required.reclaim).toBeGreaterThanOrEqual(100 * ha(work) - 1e-6);
      expect(work.required.reclaim).toBeLessThan(100 * ha(work) * 1.1);
      expect(work.required.weed).toBeGreaterThan(0);
      expect(work.reclaimIds).toEqual(work.partIds);
    }
    for (const id of planPartIds(s.plan!)) {
      const part = s.parts.find((p) => p.id === id);
      expect(part).toMatchObject({ state: 'sown', fallowSinceDay: null, bonusUntilDay: null });
    }
    expect(s.chronicle.some((e) => e.kind === 'part-became-forest')).toBe(false);
  });

  it('1. 9. příloh 15 let: vrátí se bez bonusu úrodnosti', () => {
    const { s } = returningFallow(605);
    const crops = planCrops(s.plan!);
    expect(planPartIds(s.plan!).length).toBeGreaterThan(0);
    expect(crops.reduce((sum, { work }) => sum + work.required.reclaim, 0)).toBeGreaterThan(0);
    for (const id of planPartIds(s.plan!)) {
      const part = s.parts.find((p) => p.id === id);
      expect(part).toMatchObject({ state: 'sown', fallowSinceDay: null, bonusUntilDay: null });
    }
    for (const { work } of crops) {
      if (work.partIds.length > 0) expect(work.required.weed).toBeGreaterThan(0);
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
    s.plan = { ...plan, done: { ...plan.required } };
    return s;
  }
  const hungerEvents = (s: VillageState): ChronicleEvent[] =>
    s.chronicle.filter((e) => e.kind === 'hunger-began' || e.kind === 'hunger-ended');

  it('31. 8. se jí ještě z loňských zásob: malá sklizeň hlad nepřeruší (Ruling 13)', () => {
    const s = advanceVillage(hungryBeforeHarvest(10), at(600, 9, 2), null);
    expect(harvests(s)).toEqual([{ day: at(600, 8, 31), kind: 'harvest', kg: 101 }]);
    expect(hungerEvents(s)).toEqual([]);
    expect(s.hungry).toBe(true);
  });

  it('sklizeň, která vystačí na rok, ukončí hlad až 1. 9. (Ruling 13)', () => {
    const s = advanceVillage(hungryBeforeHarvest(START_PARTS), at(600, 9, 2), null);
    expect(harvests(s)).toEqual([{ day: at(600, 8, 31), kind: 'harvest', kg: 756 }]);
    expect(hungerEvents(s)).toEqual([{ day: at(600, 9, 1), kind: 'hunger-ended' }]);
    expect(s.hungry).toBe(false);
  });

  it('1. 3. nevymlácená část úrody zmizí ze zásob – po jídle dne (Ruling 13)', () => {
    const day = at(601, 3, 1);
    const s0 = withoutFields(at(600, 10, 1));
    s0.lastDay = day - 1;
    const threshing = createPlan([], at(600, 9, 1), NO_CRAFTS.tools);
    threshing.required.thresh = 30;
    threshing.done.thresh = 15;
    threshing.harvestedKg = 500;
    s0.threshingFromPlan = threshing;
    const need = s0.people.reduce((sum, p) => sum + foodNeedPerDay(p, day), 0);
    const eaten = eatDay(s0.storesKg, need, daysUntilHarvest(day), NO_CRAFTS.pottery).storesKg;
    expect(threshLossKg(threshing, 500)).toBeCloseTo(250, 9);

    const s = advanceVillage(s0, day, null);
    expect(s.storesKg).toBeCloseTo(eaten - 250, 9);
    expect(s.threshingFromPlan).toBeNull();
  });

  it('pole nedokopané do 30. 4.: zkopaná část se zaseje a sklidí (Ruling 14)', () => {
    // plán ≈ 3 ha bez podzimního kopání – jarní práce startovní vsi stačí na ≈ 1,4 ha
    const s0 = found(at(600, 6, 1), 42, field(133));
    s0.constructions = [];
    s0.lastDay = at(601, 2, 28);
    s0.storesKg = 5000;
    for (const p of s0.parts) {
      p.foundingDone = p.foundingCost;
      p.state = 'sown';
    }
    s0.plan = createPlan(s0.parts, at(600, 9, 1), NO_CRAFTS.tools);

    const spring = advanceVillage(s0, at(601, 4, 30), null);
    const dig = { done: spring.plan?.done.dig ?? 0, required: spring.plan?.required.dig ?? 0 };
    const sow = { done: spring.plan?.done.sow ?? 0, required: spring.plan?.required.sow ?? 0 };
    expect(dig.done).toBeGreaterThan(0);
    expect(dig.done).toBeLessThan(dig.required);
    // seje se, co bylo zkopané v předchozích dnech – nezasetý zůstane jen pruh posledního dne
    const dugShare = dig.done / dig.required;
    const sownShare = sow.done / sow.required;
    expect(sownShare).toBeLessThanOrEqual(dugShare + 1e-9);
    expect(sownShare).toBeGreaterThan(dugShare - 0.01);

    const s = advanceVillage(spring, at(601, 8, 31), null);
    expect(harvests(s).at(-1)?.kg).toBeGreaterThan(0);
  });

  it('nezasetá půda se neplete ani nesklízí a úroda zaseté části se nesráží (Ruling 17)', () => {
    const s0 = found(at(600, 6, 1), 42, field(133));
    s0.constructions = [];
    s0.lastDay = at(601, 2, 28);
    s0.storesKg = 5000;
    for (const p of s0.parts) {
      p.foundingDone = p.foundingCost;
      p.state = 'sown';
    }
    s0.plan = createPlan(s0.parts, at(600, 9, 1), NO_CRAFTS.tools);

    const summerEnd = advanceVillage(s0, at(601, 8, 30), null);
    const plan = summerEnd.plan!;
    const sownShare = plan.done.sow / plan.required.sow;
    expect(sownShare).toBeGreaterThan(0.2);
    expect(sownShare).toBeLessThan(0.8);
    // práce šla jen na zasetou část – a ta je celá opletá i sklizená
    expect(plan.done.weed).toBeCloseTo(plan.required.weed * sownShare, 6);
    expect(plan.done.harvest).toBeCloseTo(plan.required.harvest * sownShare, 6);

    const s = advanceVillage(summerEnd, at(601, 8, 31), null);
    const ha = s0.parts.reduce((sum, p) => sum + p.areaM2, 0) / 10_000;
    const fullYield = ha * sownShare * (760 * (0.4 + 0.6 * 0.7) - 175);
    expect(harvests(s).at(-1)?.kg).toBe(Math.round(fullYield));
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
    let finishedDay: number | null = null;
    for (let d = day; d < day + 365 && finishedDay === null; d++) {
      s = advanceVillage(s, d, null);
      const site = s.constructions.find((c) => c.id === zemnice.id);
      if (site) {
        // průběh stavby je vidět – roste, ale ne skokem
        expect(site.done).toBeGreaterThan(last);
        expect(site.done).toBeLessThan(site.cost);
        last = site.done;
        expect(s.dwellings).toEqual([]);
      } else finishedDay = d;
    }
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
    // společná práce = síla 2,6 × štěstí na začátku dne (happiness.md) − denní minimum 0,5
    // − domácí práce 0,9 (jedna domácnost)
    const factor = villageLaborFactor(advanceVillage(s0, day + 29, null));
    expect(s.commonLaborHistory.at(-1)).toBeCloseTo(2.6 * factor - 0.5 - 0.3 - 4 * 0.15, 9);
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
  it('dokončené nové obydlí: přestěhují se dva nejmladší dospělí', () => {
    const day = at(600, 10, 1);
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

  it('prázdné obydlí obsadí kvalifikovaná domácnost', () => {
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

  /**
   * Obydlí 1 (přeplněné) má jediného člověka 14–44, tři starší a tři děti – nekvalifikuje,
   * starší se do čtyř dospělých nepočítají; obydlí 2 (plné) má čtyři dospělé a dvě děti.
   */
  function firstQualifyingWithoutPair(day: number): VillageState {
    const s = withoutFields(day);
    const person = (id: number, years: number, dwellingId: number): Person => ({
      ...adultOfAge(id, years, day),
      dwellingId,
    });
    s.people = [
      ...[30, 50, 55, 60, 5, 6, 4].map((years, i) => person(10 + i, years, 1)),
      ...[30, 28, 22, 20, 3, 2].map((years, i) => person(20 + i, years, 2)),
    ];
    s.dwellings.push({ id: 2, type: 'zemnice', builtDay: day, condition: 1, position: POSITION });
    return s;
  }
  /** Původní obyvatelé obydlí (bez dětí narozených během běhu). */
  const originalOccupants = (s: VillageState, dwellingId: number, nextId: number): number[] =>
    occupants(s, dwellingId)
      .map((p) => p.id)
      .filter((id) => id < nextId);

  it('prázdné obydlí obsadí pár z domácnosti se čtyřmi dospělými, ne z přeplněnější se staršími', () => {
    const day = at(600, 10, 1);
    const s0 = firstQualifyingWithoutPair(day);
    s0.dwellings.push({ id: 50, type: 'zemnice', builtDay: day, condition: 1, position: POSITION });
    const s = advanceVillage(s0, day, null);
    expect(originalOccupants(s, 50, s0.nextId)).toEqual([22, 23]);
    expect(s.chronicle).toContainEqual({ day, kind: 'household-founded', dwellingId: 50 });
    expect(originalOccupants(s, 1, s0.nextId)).toEqual([10, 11, 12, 13, 14, 15, 16]);
  });

  it('do nového obydlí jde pár z domácnosti se čtyřmi dospělými, ne z přeplněnější se staršími', () => {
    const day = at(600, 10, 1);
    const s0 = firstQualifyingWithoutPair(day);
    const building = startNewDwelling(s0, day, 'zemnice', { x: 5, z: 5, rotation: 0 }, 0);
    const s = advanceVillage(building, day + 120, null);
    const fresh = s.dwellings.find((d) => d.id !== 1 && d.id !== 2);
    expect(fresh).toBeDefined();
    expect(originalOccupants(s, fresh!.id, s0.nextId)).toEqual([22, 23]);
    expect(originalOccupants(s, 1, s0.nextId)).toEqual([10, 11, 12, 13, 14, 15, 16]);
  });

  it('pár neodejde, když by po něm zůstali jen starší a děti – žádné stěhování sem a tam', () => {
    // plná polozemnice: dva starší, dva lidé 14–44 a čtyři děti; vedle prázdné obydlí
    const day = at(600, 10, 1);
    const s0 = withoutFields(day);
    s0.dwellings[0]!.type = 'polozemnice';
    s0.people = [53, 53, 40, 21, 9, 3, 2, 1].map((years, i) => adultOfAge(10 + i, years, day));
    s0.dwellings.push({ id: 50, type: 'zemnice', builtDay: day, condition: 1, position: POSITION });
    const s = advanceVillage(s0, day + 10, null);
    expect(count(s, 'household-founded')).toBe(0);
    expect(count(s, 'household-merged')).toBe(0);
    expect(originalOccupants(s, 1, s0.nextId)).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
  });

  // Dospělé děti z přeplněné domácnosti osídlí úplně prázdné obydlí (population.md – Prázdné
  // obydlí; Martin, detaily návrh Clauda).
  /** Ves s hotovými obydlími `dwellingIds` (zemnice) a lidmi daného věku po obydlích. */
  function crowdedVillage(day: number, households: Record<number, number[]>): VillageState {
    const s = withoutFields(day);
    s.people = Object.entries(households).flatMap(([dwellingId, ages], h) =>
      ages.map((years, i) => ({
        ...adultOfAge(100 * (h + 1) + i, years, day),
        dwellingId: Number(dwellingId),
      })),
    );
    s.nextId = 1000; // narození dostanou id od 1000 – původní obyvatelé jsou pod ním
    for (const id of Object.keys(households).map(Number)) {
      if (s.dwellings.some((d) => d.id === id)) continue;
      s.dwellings.push({ id, type: 'zemnice', builtDay: day, condition: 1, position: POSITION });
    }
    return s;
  }
  const emptyZemnice = (id: number, day: number): VillageState['dwellings'][number] => ({
    id,
    type: 'zemnice',
    builtDay: day,
    condition: 1,
    position: POSITION,
  });

  it('dospělé děti z přeplněné domácnosti (rodiče 46 a 40) osídlí prázdné obydlí', () => {
    const day = at(600, 10, 1);
    // 7 lidí v zemnici, dospělí 14–44 jen 40, 17 a 15 – starým pravidlem by nikdo nešel
    const s0 = crowdedVillage(day, { 1: [46, 40, 17, 15, 8, 5, 2] });
    s0.dwellings.push(emptyZemnice(50, day));
    const s = advanceVillage(s0, day, null);
    expect(originalOccupants(s, 50, s0.nextId)).toEqual([102, 103]);
    expect(originalOccupants(s, 1, s0.nextId)).toEqual([100, 101, 104, 105, 106]);
    expect(s.chronicle).toContainEqual({ day, kind: 'household-founded', dwellingId: 50 });
  });

  it('rodiče 40 a 38 s dospělými dětmi 17 a 15 – odejdou 17 a 15 (čtyři dospělí: staré pravidlo)', () => {
    const day = at(600, 10, 1);
    const s0 = crowdedVillage(day, { 1: [40, 38, 17, 15, 8, 5, 2] });
    s0.dwellings.push(emptyZemnice(50, day));
    const s = advanceVillage(s0, day, null);
    expect(originalOccupants(s, 50, s0.nextId)).toEqual([102, 103]);
  });

  it('jediné dospělé dítě samo nejde – s protějškem z jiné přeplněné domácnosti odejdou spolu', () => {
    const day = at(600, 10, 1);
    const one = { 1: [46, 40, 16, 8, 5, 2, 1] };
    const alone = crowdedVillage(day, one);
    alone.dwellings.push(emptyZemnice(50, day));
    const stays = advanceVillage(alone, day + 5, null);
    expect(occupants(stays, 50)).toEqual([]);
    expect(count(stays, 'household-founded')).toBe(0);

    const s0 = crowdedVillage(day, { ...one, 2: [45, 42, 18, 9, 6, 3, 1] });
    s0.dwellings.push(emptyZemnice(50, day));
    const s = advanceVillage(s0, day, null);
    expect(originalOccupants(s, 50, s0.nextId)).toEqual([102, 202]);
    expect(count(s, 'household-founded')).toBe(1);
  });

  it('neplodní rodiče (50 a 47) se dvěma dospělými dětmi – nikdo neodejde, dědic zůstane', () => {
    const day = at(600, 10, 1);
    // nejstarší dospělé dítě zůstane doma (Martin), mladší by šlo samo – čeká na protějšek
    const elders = crowdedVillage(day, { 1: [50, 47, 20, 18, 8, 5, 2] });
    elders.dwellings.push(emptyZemnice(50, day));
    const s = advanceVillage(elders, day + 5, null);
    expect(count(s, 'household-founded')).toBe(0);
    expect(count(s, 'household-merged')).toBe(0);
    expect(occupants(s, 50)).toEqual([]);
  });

  it('neplodní rodiče (50 a 47) se třemi dospělými dětmi – dva mladší odejdou, nejstarší zůstane', () => {
    const day = at(600, 10, 1);
    const s0 = crowdedVillage(day, { 1: [50, 47, 22, 20, 18, 5, 2] });
    s0.dwellings.push(emptyZemnice(50, day));
    const s = advanceVillage(s0, day, null);
    expect(originalOccupants(s, 50, s0.nextId)).toEqual([103, 104]);
    expect(originalOccupants(s, 1, s0.nextId)).toEqual([100, 101, 102, 105, 106]);
    expect(count(s, 'household-merged')).toBe(0);
  });

  it('plná nepřeplněná domácnost dospělé děti nepošle', () => {
    const day = at(600, 10, 1);
    // plná (6 lidí v zemnici), ale ne přeplněná – bez čtyř dospělých 14–44
    const full = crowdedVillage(day, { 1: [46, 40, 17, 15, 8, 5] });
    full.dwellings.push(emptyZemnice(50, day));
    const s = advanceVillage(full, day, null);
    expect(occupants(s, 50)).toEqual([]);
  });

  it('nové obydlí jde postavit pro dospělé děti a po dokončení ho týž den osídlí', () => {
    const day = at(600, 10, 1);
    const s0 = crowdedVillage(day, { 1: [46, 40, 17, 15, 8, 5, 2] });
    // lidé k osídlení podle nového pravidla – stavba se nezablokuje
    const building = startNewDwelling(s0, day, 'zemnice', { x: 5, z: 5, rotation: 0 }, 0);
    const s = advanceVillage(building, day + 120, null);
    const fresh = s.dwellings.find((d) => d.id !== 1);
    expect(fresh).toBeDefined();
    expect(originalOccupants(s, fresh!.id, s0.nextId)).toEqual([102, 103]);
    const finished = s.chronicle.find(
      (e) => e.kind === 'construction-finished' && e.dwellingId === fresh!.id,
    );
    expect(s.chronicle).toContainEqual({
      day: finished?.day,
      kind: 'household-founded',
      dwellingId: fresh!.id,
    });
  });

  it('osídlení dospělými dětmi nezávisí na kouscích dopočtu', () => {
    const day = at(600, 10, 1);
    // obydlí 1 pošle dospělé děti hned; v obydlí 2 je jediné dospělé dítě, za pár měsíců bude
    // čtrnáctileté druhé a odejdou spolu do druhého prázdného obydlí
    const start = crowdedVillage(day, {
      1: [46, 40, 17, 15, 8, 5, 2],
      2: [45, 42, 18, 13.8, 6, 3, 1],
    });
    start.dwellings.push(emptyZemnice(50, day), emptyZemnice(51, day));
    const end = day + Math.ceil(3 * YEAR);
    const whole = advanceVillage(start, end, null);
    expect(count(whole, 'household-founded')).toBeGreaterThanOrEqual(2);
    expect(originalOccupants(whole, 51, start.nextId)).toEqual([202, 203]);
    const viaJson = (s: VillageState): VillageState =>
      JSON.parse(JSON.stringify(s)) as VillageState;
    let chunked = viaJson(start);
    for (const days of [1, 3, 17, 1, 40, 2, 90, 200, 400]) {
      chunked = viaJson(advanceVillage(chunked, Math.min(end, chunked.lastDay + days), null));
    }
    chunked = advanceVillage(chunked, end, null);
    expect(viaJson(chunked)).toEqual(viaJson(whole));
  });

  // Sňatky mezi domy (population.md; Martin, 18. 10. 2026: „Ano, přidej sňatky mezi domy“).
  /**
   * Vlkov (rok 612): zemnice 1 – pár 42 a 19 s malými dětmi, polozemnice 2 – starší 63 a 49,
   * jediný 27letý a děti. Za tři roky je 42letý starší a 19letý zůstane bez protějšku.
   */
  function vlkov(day: number): VillageState {
    const s = crowdedVillage(day, { 1: [42, 19, 2, 1], 2: [63, 49, 27, 12, 10, 6] });
    s.dwellings.find((d) => d.id === 2)!.type = 'polozemnice';
    s.storesKg = 60_000; // bez polí – zásoby na celý test, ať porody netlumí hlad
    return s;
  }
  type MarriageEvent = Extract<ChronicleEvent, { kind: 'marriage' }>;
  const marriages = (s: VillageState): MarriageEvent[] =>
    s.chronicle.filter((e): e is MarriageEvent => e.kind === 'marriage');

  it('Vlkov: po třech letech se 27letý přistěhuje k 19letému do zemnice a mají děti', () => {
    const day = at(612, 3, 1);
    const s0 = vlkov(day);
    // dokud má 19letý v domě protějšek (42), svatba není
    expect(marriages(advanceVillage(s0, day + Math.floor(2.9 * YEAR), null))).toEqual([]);
    const s = advanceVillage(s0, day + Math.ceil(12 * YEAR), null);
    const [wedding] = marriages(s);
    // z polozemnice odejít smí (zůstane patnáctiletý), ze zemnice by zůstal jen starší s dětmi
    expect(wedding).toMatchObject({ fromDwellingId: 2, toDwellingId: 1 });
    expect(wedding!.day - day).toBeGreaterThan(2.9 * YEAR);
    expect(wedding!.day - day).toBeLessThan(3.1 * YEAR);
    expect(marriages(s)).toHaveLength(1);
    expect(originalOccupants(s, 1, s0.nextId)).toEqual([100, 101, 102, 103, 202]);
    // nový pár (19letý a 27letý) má v zemnici děti
    const born = s.people.filter(
      (p) => p.id >= s0.nextId && p.bornDay > wedding!.day && p.dwellingId === 1,
    );
    expect(born.length).toBeGreaterThanOrEqual(1);
  });

  it('svobodní ve dvou domech, kde by se obě domácnosti rozpadly – nikdo se nestěhuje', () => {
    const day = at(600, 10, 1);
    const s0 = crowdedVillage(day, { 1: [50, 30, 5], 2: [48, 20, 3] });
    const s = advanceVillage(s0, day + 5, null);
    expect(marriages(s)).toEqual([]);
    expect(count(s, 'household-merged')).toBe(0);
    expect(originalOccupants(s, 1, s0.nextId)).toEqual([100, 101, 102]);
  });

  it('sňatky nezávisí na kouscích dopočtu', () => {
    const day = at(612, 3, 1);
    const start = vlkov(day);
    const end = day + Math.ceil(6 * YEAR);
    const whole = advanceVillage(start, end, null);
    expect(marriages(whole)).toHaveLength(1);
    const viaJson = (s: VillageState): VillageState =>
      JSON.parse(JSON.stringify(s)) as VillageState;
    let chunked = viaJson(start);
    for (const days of [1, 3, 17, 1, 40, 2, 90, 200, 400, 1000]) {
      chunked = viaJson(advanceVillage(chunked, Math.min(end, chunked.lastDay + days), null));
    }
    chunked = advanceVillage(chunked, end, null);
    expect(viaJson(chunked)).toEqual(viaJson(whole));
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
    const s0 = withBuiltFirstDwelling(found(day));
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
    const s0 = withBuiltFirstDwelling(found(day));
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
    const s0 = found(start);
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
    const winter = s.plan?.winter;
    expect(winter?.partIds.length).toBeGreaterThan(0);
    for (const id of winter?.partIds ?? []) {
      expect(s.parts.find((p) => p.id === id)?.crop).toBe('winter');
    }
    for (const id of s.plan?.partIds ?? []) {
      expect(s.parts.find((p) => p.id === id)?.crop).toBe('spring');
    }
    // díly mimo osev plodinu nemají
    for (const p of s.parts) if (p.state !== 'sown') expect(p.crop).toBeUndefined();
  });

  it('ozim se do konce října zkope a zaseje, jař se kope na podzim, co zbude', () => {
    const autumn = advanceVillage(settled(), at(601, 10, 31), null);
    const winter = autumn.plan!.winter!;
    expect(winter.done.dig).toBeCloseTo(winter.required.dig, 6);
    // plán nechá poslední den okna na zasetí pruhu zkopaného den předtím
    expect(winter.done.sow).toBeCloseTo(winter.required.sow, 6);
    const november = advanceVillage(autumn, at(601, 11, 30), null);
    expect(november.plan!.winter!.done.sow).toBe(winter.done.sow); // po okně se už neseje
    if (november.plan!.required.dig > 0) expect(november.plan!.done.dig).toBeGreaterThan(0);
  });

  it('31. 7. sklizeň ozimu do zásob, 31. 8. jař, 1. 3. konec výmlatu obou', () => {
    const july = advanceVillage(settled(), at(602, 7, 30), null);
    const harvested = advanceVillage(july, at(602, 7, 31), null);
    const winterHarvest = harvests(harvested).at(-1)!;
    expect(winterHarvest).toMatchObject({ day: at(602, 7, 31), crop: 'winter' });
    expect(winterHarvest.kg).toBeGreaterThan(0);
    expect(Math.round(harvested.plan!.winter!.harvestedKg!)).toBe(winterHarvest.kg);
    expect(harvested.storesKg).toBeGreaterThan(july.storesKg + winterHarvest.kg - 5);

    const august = advanceVillage(harvested, at(602, 8, 31), null);
    expect(august.plan).toBeNull();
    expect(august.threshingFromPlan?.winter?.harvestedKg).toBe(harvested.plan!.winter!.harvestedKg);
    const winterEnd = advanceVillage(august, at(603, 2, 28), null);
    for (const { work } of planCrops(winterEnd.threshingFromPlan!)) {
      expect(taskRemaining(work, 'thresh')).toBeCloseTo(0, 6);
    }
    expect(advanceVillage(winterEnd, at(603, 3, 1), null).threshingFromPlan).toBeNull();
  });

  it('starší ves bez plodin na dílech a bez ozimu v plánu dopočítá dál (díl bez plodiny = jař)', () => {
    const old = advanceVillage(found(at(600, 3, 15)), at(601, 6, 1), null);
    delete old.plan!.winter;
    for (const p of old.parts) delete p.crop;
    const s = advanceVillage(JSON.parse(JSON.stringify(old)) as VillageState, at(601, 9, 2), null);
    expect(harvests(s).at(-1)?.crop).toBeUndefined();
    expect(s.plan?.winter?.partIds.length).toBeGreaterThan(0);
    expect(nonFinite(s)).toEqual([]);
  });
});
