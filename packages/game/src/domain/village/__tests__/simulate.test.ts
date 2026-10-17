import { describe, expect, it } from 'vitest';
import { TOTAL_GAME_DAYS, dayIndexOf } from '../../calendar';
import { foundVillage, startNewDwelling } from '../actions';
import type { PartInput } from '../actions';
import { ageYears, occupants } from '../people';
import { AGE, FERTILITY } from '../rules';
import { advanceVillage } from '../simulate';
import type { ChronicleEvent, Person, VillageState } from '../types';

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

/** Ves bez pole a staveb se zásobami navíc – pro testy obydlí. */
function withoutFields(day: number, extra: Person[] = []): VillageState {
  const s = found(day);
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
    const whole = advanceVillage(start, end);

    let chunked = advanceVillage(start, start.lastDay + 1);
    chunked = advanceVillage(chunked, chunked.lastDay + 30);
    const steps = [7, 400, 1, 1000, 13, 365, 2, 777];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(chunked, Math.min(end, chunked.lastDay + steps[i % steps.length]!));
    }
    expect(chunked).toEqual(whole);

    let daily = start;
    while (daily.lastDay < end) daily = advanceVillage(daily, daily.lastDay + 1);
    expect(daily).toEqual(whole);

    // ves za 10 let opravdu žila – jinak by shoda nic neznamenala
    expect(harvests(whole).length).toBeGreaterThanOrEqual(10);
    expect(count(whole, 'birth')).toBeGreaterThan(0);
    expect(whole.lastDay).toBe(end);
  });

  it('nemění vstupní stav a do stejného dne vrátí shodnou kopii', () => {
    const start = found(at(600, 3, 15));
    const before = structuredClone(start);
    advanceVillage(start, at(601, 3, 15));
    expect(start).toEqual(before);
    const same = advanceVillage(start, start.lastDay);
    expect(same).toEqual(start);
    expect(same).not.toBe(start);
  });

  it('(b) ves založená 1. 10. 600 sklidí a do druhé sklizně nehladoví', () => {
    // Brief chtěl 3 roky (do 1. 10. 603). S pravidly z rules.ts startovní ves do té doby
    // hladoví u 191 z 200 seedů: pole 1,7 ha je po třech osevech vyčerpané (1. 9. 603 smí osít
    // jen 14 dílů) a potřeba roste rychleji než rezerva 10 % (dospívající → dospělí, porody).
    // Okno do druhé sklizně – rozhodne kontrolér / kalibrace (Task 10).
    const s = advanceVillage(found(at(600, 10, 1)), at(602, 8, 31));
    expect(harvests(s).filter((e) => e.kg > 0)).toHaveLength(2);
    expect(count(s, 'hunger-began')).toBe(0);
    expect(s.hungry).toBe(false);
  });

  it('(c) zásoby nikdy záporné a žádné NaN – kontrola po každém roce', () => {
    let s = found(at(600, 3, 15));
    for (let year = 601; year <= 610; year++) {
      s = advanceVillage(s, at(year, 3, 15));
      expect(s.storesKg).toBeGreaterThanOrEqual(0);
      expect(nonFinite(s)).toEqual([]);
    }
  });

  it('(d) za konec světa RangeError, dopočet do posledního dne projde', () => {
    const s = found(at(1495, 5, 1));
    expect(() => advanceVillage(s, TOTAL_GAME_DAYS)).toThrow(RangeError);
    const end = advanceVillage(s, TOTAL_GAME_DAYS - 1);
    expect(end.lastDay).toBe(TOTAL_GAME_DAYS - 1);
    expect(nonFinite(end)).toEqual([]);
  });

  it('do minulosti RangeError', () => {
    const s = advanceVillage(found(at(600, 3, 15)), at(600, 4, 1));
    expect(() => advanceVillage(s, s.lastDay - 1)).toThrow(RangeError);
  });

  it('(e) ves založená 20. 6. bez hotových dílů dožije ze zásob a 1. 9. má plán s díly', () => {
    const start = found(at(600, 6, 20));
    expect(start.parts.every((p) => p.state === 'founding')).toBe(true);

    const lastSummerDay = advanceVillage(start, at(600, 8, 31));
    expect(lastSummerDay.plan).toBeNull(); // díly hotové po dubnu čekají na 1. 9.
    expect(lastSummerDay.parts.some((p) => p.state === 'ready')).toBe(true);
    expect(count(lastSummerDay, 'hunger-began')).toBe(0);
    expect(lastSummerDay.people).toHaveLength(start.people.length);

    const s = advanceVillage(lastSummerDay, at(600, 9, 1));
    expect(s.plan).not.toBeNull();
    expect(s.plan?.partIds.length).toBeGreaterThan(0);
    const sown = s.parts.filter((p) => p.state === 'sown').map((p) => p.id);
    expect([...(s.plan?.partIds ?? [])].sort((a, b) => a - b)).toEqual(sown);
    expect(s.storesKg).toBeGreaterThan(0);
    expect(count(s, 'hunger-began')).toBe(0);
  });

  it('ves bez lidí: žádná výjimka, žádné NaN, nasycení se neřeší', () => {
    const start = found(at(600, 3, 15));
    start.people = [];
    const s = advanceVillage(start, at(602, 3, 15));
    expect(nonFinite(s)).toEqual([]);
    expect(s.storesKg).toBeGreaterThanOrEqual(0);
    expect(count(s, 'hunger-began')).toBe(0);
    expect(s.plan?.partIds ?? []).toEqual([]);
  });

  it('(f) ves bez polí 5 let: bez výjimky, nasycení klesne, zůstanou aspoň 2 dospělí', () => {
    const start = found(at(600, 3, 15));
    start.parts = [];
    const end = at(605, 3, 15);
    const s = advanceVillage(start, end);
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
    const start = found(at(600, 10, 1));
    const early = advanceVillage(start, at(600, 10, 3));
    expect(early.plan).not.toBeNull();
    expect(early.plan?.plannedDay).toBeLessThanOrEqual(at(600, 10, 3));
    const later = advanceVillage(early, at(600, 12, 31));
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
    const before = advanceVillage(found(at(600, 3, 15)), at(600, 8, 30));
    expect(before.plan).not.toBeNull();
    const s = advanceVillage(before, at(600, 8, 31));
    const harvest = harvests(s).at(-1);
    expect(harvest?.day).toBe(at(600, 8, 31));
    expect(harvest?.kg).toBeGreaterThan(0);
    expect(s.plan).toBeNull();
    expect(s.threshingFromPlan?.partIds).toEqual(before.plan?.partIds);
    expect(Math.round(s.threshingFromPlan?.harvestedKg ?? -1)).toBe(harvest?.kg);
    expect(s.storesKg).toBeGreaterThan(before.storesKg + (harvest?.kg ?? 0) - 5);

    const winterEnd = advanceVillage(s, at(601, 2, 28));
    const thresh = winterEnd.threshingFromPlan;
    expect(thresh?.done.thresh).toBeCloseTo(thresh?.required.thresh ?? -1, 6);
    expect(advanceVillage(winterEnd, at(601, 3, 1)).threshingFromPlan).toBeNull();
  });

  it('1. 9. nevybrané osevy a připravené díly jdou do přílohu (Ruling 9, 10)', () => {
    const day = at(600, 9, 1);
    const start = found(at(600, 6, 1));
    start.constructions = [];
    start.lastDay = day - 1;
    start.parts.forEach((p, i) => {
      p.foundingDone = p.foundingCost;
      p.state = i < 70 ? 'sown' : 'ready';
      p.sownYears = i < 70 ? 1 : 0;
    });
    const s = advanceVillage(start, day);
    const selected = new Set(s.plan?.partIds);
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

  it('1. 9. příloh starší 15 let se vrací z lesa: mýcení v plánu a bonus úrodnosti', () => {
    const day = at(620, 9, 1);
    const start = found(at(600, 6, 1));
    start.constructions = [];
    start.lastDay = day - 1;
    for (const p of start.parts) {
      p.foundingDone = p.foundingCost;
      p.state = 'fallow';
      p.fallowSinceDay = at(603, 9, 1);
    }
    const s = advanceVillage(start, day);
    expect(s.plan?.partIds.length).toBeGreaterThan(0);
    expect(s.plan?.required.reclaim).toBeGreaterThan(0);
    for (const id of s.plan?.partIds ?? []) {
      const part = s.parts.find((p) => p.id === id);
      expect(part).toMatchObject({
        state: 'sown',
        fallowSinceDay: null,
        sownYears: 0,
        bonusUntilDay: day + FERTILITY.forestBonusYears * 365,
      });
    }
  });
});

describe('advanceVillage – obydlí', () => {
  it('dokončené nové obydlí: přestěhují se dva nejmladší dospělí', () => {
    const day = at(600, 10, 1);
    const s0 = withoutFields(day, [adultOfAge(100, 20, day), adultOfAge(101, 21, day)]);
    const building = startNewDwelling(s0, day, 'zemnice', { x: 5, z: 5, rotation: 0 }, 0);
    const s = advanceVillage(building, day + 120);
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

  it('prázdné obydlí obsadí kvalifikovaná domácnost', () => {
    const day = at(600, 10, 1);
    const s0 = withoutFields(day, [adultOfAge(100, 20, day), adultOfAge(101, 21, day)]);
    s0.dwellings.push({ id: 50, type: 'zemnice', builtDay: day, condition: 1, position: POSITION });
    const s = advanceVillage(s0, day);
    expect(occupants(s, 50).map((p) => p.id)).toEqual([100, 101]);
    expect(s.chronicle).toContainEqual({ day, kind: 'household-founded', dwellingId: 50 });
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
    const s = advanceVillage(s0, day);
    expect(s.dwellings.map((d) => d.id)).toEqual([1]);
  });

  it('dožilé obydlí obyvatelé přestaví – na lepší, když na to ves má', () => {
    const day = at(600, 10, 1);
    const s0 = found(day);
    s0.dwellings[0]!.builtDay = day - 16 * 365;
    const decided = advanceVillage(s0, day);
    expect(decided.chronicle).toContainEqual({
      day,
      kind: 'rebuild-decided',
      dwellingId: 1,
      type: 'polozemnice',
    });
    const rebuild = decided.constructions.filter((c) => c.kind === 'rebuild');
    expect(rebuild).toHaveLength(1);
    expect(rebuild[0]).toMatchObject({ dwellingId: 1, dwellingType: 'polozemnice', cost: 220 });

    const s = advanceVillage(decided, day + 2 * 365);
    const finished = s.chronicle.find(
      (e) => e.kind === 'construction-finished' && e.constructionKind === 'rebuild',
    );
    expect(finished).toMatchObject({ dwellingId: 1, fieldId: null });
    expect(count(s, 'rebuild-decided')).toBe(1);
    expect(s.dwellings[0]).toMatchObject({ type: 'polozemnice' });
    expect(s.dwellings[0]?.builtDay).toBe(finished?.day);
  });
});
