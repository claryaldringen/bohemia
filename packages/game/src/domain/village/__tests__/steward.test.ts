import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf, type GameDate } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  SURFACE_CODES,
  tileCenterWorld,
} from '../../landscape';
import { foundVillage } from '../actions';
import { NO_CRAFTS } from '../productivity';
import { waitingHouseholds } from '../households';
import { STEWARD } from '../rules-steward';
import { advanceVillage } from '../simulate';
import {
  fieldTarget,
  inStewardWindows,
  laborBudget,
  stewardDay,
  stewardMode,
  workshopValue,
} from '../steward';
import { newSteward } from '../steward-state';
import { planSettlement } from '../steward-plan';
import type { VillageState } from '../types';
import { couple, kin } from './kin-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Den správce (steward.md – Rozhodovací pořadí v den správce, kroky 3 a 4; Kde správce běží).

const YEAR = 365;
const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
/** 1. 9. 503 zaokrouhlený na den správce – okno polí na louce. */
const SEPT =
  Math.ceil(dayIndexOf({ year: 503, month: 9, day: 1 }) / STEWARD.everyDays) * STEWARD.everyDays;

/** Nová ves zakladatelů u sídla krajiny; ves založená v den `day` je dopočítaná do `day − 1`. */
function village(day: number, on = true): VillageState {
  const site = landscape.villageSite;
  const c = tileCenterWorld(landscape, site.x, site.y);
  const s = foundVillage({ seed: 4242, day, dwellingPosition: { x: c.x, z: c.z, rotation: 0 } });
  return { ...s, steward: newSteward(day, on) };
}

/** Ves se stojící zemnicí, hotovým plánem a mladým párem navíc – jedna rodina čeká na dům. */
function waitingVillage(day: number): VillageState {
  let s = withBuiltFirstDwelling(village(day));
  const home = s.dwellings[0]!.id;
  s.people.push(
    ...couple({ id: 900, age: 24, home }, { id: 901, age: 22, home }).map((k) => kin(k, day)),
  );
  for (let k = 0; k < 10 && s.steward?.plan?.stage !== 'done'; k++) {
    s = planSettlement(s, s.lastDay, landscape, obstacles);
  }
  return s;
}

/** Ves bez správce – pro porovnání s vypnutým (správce se ze stavu vyjme). */
function withoutSteward(state: VillageState): string {
  return JSON.stringify({ ...state, steward: undefined });
}

function newConstructions(before: VillageState, after: VillageState): number[] {
  return after.constructions.filter((c) => c.id >= before.nextId).map((c) => c.id);
}

describe('den správce – kdy staví', () => {
  it('jen zapnutý, s krajinou a vrstvou překážek', () => {
    const start = village(SEPT);
    const to = SEPT + 40;
    const on = advanceVillage(start, to, obstacles, landscape);
    expect(on.steward?.built.length).toBeGreaterThan(0);
    // bez krajiny správce spí
    const noLand = advanceVillage(start, to, null, null);
    expect(noLand.steward?.built).toEqual([]);
    expect(noLand.steward?.plan).toBeUndefined();
    // vypnutý správce – stejně jako ves bez správce (zlaté otisky se nemění)
    const off = advanceVillage(village(SEPT, false), to, obstacles, landscape);
    expect(off.steward?.built).toEqual([]);
    const bare = village(SEPT, false);
    delete bare.steward;
    const none = advanceVillage(bare, to, obstacles, landscape);
    expect(withoutSteward(off)).toBe(withoutSteward(none));
  });

  it('jen v den správce – mezi nimi stav nemění', () => {
    const s = waitingVillage(SEPT);
    const copy = structuredClone(s);
    stewardDay(copy, SEPT + 1, landscape, obstacles);
    expect(copy).toEqual(s);
  });
});

describe('den správce – obydlí', () => {
  it('čekající rodina dostane dům do 10 dnů – stavba je správcova', () => {
    const s = waitingVillage(SEPT);
    expect(waitingHouseholds(s, s.lastDay)).toBe(1);
    const after = advanceVillage(s, s.lastDay + 10, obstacles, landscape);
    const houses = after.constructions.filter(
      (c) => c.kind === 'dwelling' && c.dwellingId === null,
    );
    expect(houses).toHaveLength(1);
    expect(after.steward?.built).toContain(houses[0]!.id);
    expect(waitingHouseholds(after, after.lastDay)).toBe(0);
  });

  it('bez čekající rodiny obydlí nestaví (cena předem – osadníci)', () => {
    const s = withBuiltFirstDwelling(village(SEPT));
    let planned = s;
    for (let k = 0; k < 10 && planned.steward?.plan?.stage !== 'done'; k++) {
      planned = planSettlement(planned, planned.lastDay, landscape, obstacles);
    }
    expect(waitingHouseholds(planned, planned.lastDay)).toBe(0);
    const after = structuredClone(planned);
    stewardDay(after, SEPT, landscape, obstacles);
    expect(after.constructions.some((c) => c.kind === 'dwelling')).toBe(false);
  });

  it('slot, kam by hráč dům nepostavil, přeskočí a zahodí', () => {
    const s = waitingVillage(SEPT);
    const plan = s.steward!.plan!;
    const water = landscape.surface.findIndex((v) => v === SURFACE_CODES.water);
    plan.slots.dwelling = [water, ...(plan.slots.dwelling ?? [])];
    const after = structuredClone(s);
    stewardDay(after, SEPT, landscape, obstacles);
    const house = after.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId === null);
    expect(house).toBeDefined();
    expect(after.steward?.plan?.slots.dwelling).not.toContain(water);
    const size = landscape.size;
    const tile =
      Math.floor((house!.position!.z + (size * landscape.cellSizeM) / 2) / landscape.cellSizeM) *
        size +
      Math.floor((house!.position!.x + (size * landscape.cellSizeM) / 2) / landscape.cellSizeM);
    expect(landscape.surface[tile]).not.toBe(SURFACE_CODES.water);
  });
});

describe('den správce – režim a pole', () => {
  it('Nouze, když ves hladoví; jinak podle pojistky', () => {
    const s = waitingVillage(SEPT);
    expect(stewardMode({ ...s, starvationDays: 3 }, SEPT, NO_CRAFTS)).toBe('emergency');
  });

  it('v Nouzi jen pole, které se stihne osít, a obydlí pro čekající rodinu', () => {
    const s = waitingVillage(SEPT);
    s.commonLaborHistory = Array.from({ length: 30 }, () => 4);
    expect(fieldTarget(s, SEPT, NO_CRAFTS).have).toBeLessThan(fieldTarget(s, SEPT, NO_CRAFTS).need);
    // dost zásob a práce – pole i dům
    const normal = structuredClone(s);
    normal.storesKg = 20_000;
    expect(stewardMode(normal, SEPT, NO_CRAFTS)).toBe('growth');
    stewardDay(normal, SEPT, landscape, obstacles);
    const kinds = (v: VillageState): string[] =>
      newConstructions(s, v).map((id) => v.constructions.find((c) => c.id === id)!.kind);
    expect(kinds(normal).sort()).toEqual(['dwelling', 'field']);
    // Nouze a málo práce – pole by se do konce osevu (31. 10.) nestihlo, dům ano
    const hungry = structuredClone(s);
    hungry.starvationDays = 3;
    hungry.commonLaborHistory = Array.from({ length: 30 }, () => 0.05);
    stewardDay(hungry, SEPT, landscape, obstacles);
    expect(kinds(hungry)).toEqual(['dwelling']);
  });

  it('rozpočet práce počítá zbývající práci všech staveb', () => {
    const s = village(SEPT);
    s.commonLaborHistory = [2, 4];
    const remaining = s.constructions.reduce((sum, c) => sum + c.cost - c.done, 0);
    expect(laborBudget(s)).toEqual({
      freePerDay: 3,
      remaining,
      left: 3 * STEWARD.laborHorizonDays - remaining,
    });
  });

  it('okna roku – louka přes Nový rok, les jen v zimě', () => {
    const at = (month: number, day: number): GameDate =>
      dateOfDayIndex(dayIndexOf({ year: 504, month, day }));
    expect(inStewardWindows(at(1, 15), STEWARD.meadowFieldWindows)).toBe(true);
    expect(inStewardWindows(at(4, 15), STEWARD.meadowFieldWindows)).toBe(false);
    expect(inStewardWindows(at(7, 1), STEWARD.meadowFieldWindows)).toBe(true);
    expect(inStewardWindows(at(9, 15), STEWARD.forestFieldWindows)).toBe(false);
    expect(inStewardWindows(at(12, 15), STEWARD.forestFieldWindows)).toBe(true);
  });

  it('dílna jen tam, kde má hodnotu – kovář ne bez uhlíře, řemeslo, které ves má, ne', () => {
    const s = waitingVillage(SEPT);
    expect(workshopValue(s, SEPT, 'smith', NO_CRAFTS)).toBe(0);
    expect(workshopValue(s, SEPT, 'carpenter', NO_CRAFTS)).toBe(0);
  });
});

describe('den správce – dlouhý běh na skutečné krajině', () => {
  // 10 let vcelku a po 37 dnech – výsledek nezávisí na kouscích dopočtu; po kouscích dál do 15 let
  // (kouřový test – lidé rostou, nikdo neumře hlady)
  const start = village(SEPT);
  const TEN = SEPT + 10 * YEAR;
  let chunked = start;
  let hunger = 0;
  let atThree: VillageState | null = null;
  const advanceChunked = (to: number): void => {
    while (chunked.lastDay < to) {
      const prev = chunked.lastDay;
      chunked = advanceVillage(chunked, Math.min(to, prev + 37), obstacles, landscape);
      hunger += chunked.chronicle.filter(
        (e) => e.day > prev && e.kind === 'death' && e.cause === 'hunger',
      ).length;
      if (!atThree && chunked.lastDay >= SEPT + 3 * YEAR) atThree = chunked;
    }
  };

  it('po kouscích stejně jako vcelku (10 let)', { timeout: 120_000 }, () => {
    const whole = advanceVillage(start, TEN, obstacles, landscape);
    advanceChunked(TEN);
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
  });

  it('pole dorostou k cíli a jsou správcova', () => {
    const s = atThree!;
    const target = fieldTarget(s, s.lastDay, NO_CRAFTS);
    expect(target.have).toBeGreaterThan(0.8 * target.need);
    const fields = s.parts.filter((p) => s.steward!.built.includes(p.id));
    expect(fields.length).toBeGreaterThan(0);
  });

  it('15 let – lidé rostou, nikdo neumře hlady', { timeout: 120_000 }, () => {
    advanceChunked(SEPT + 15 * YEAR);
    expect(chunked.people.length).toBeGreaterThan(start.people.length);
    expect(hunger).toBe(0);
    const built = new Set(chunked.steward!.built);
    expect(chunked.dwellings.some((d) => built.has(d.id))).toBe(true);
  });
});
