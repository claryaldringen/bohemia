import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { cloneState } from '../../core/clone';
import { craftCoverage } from '../../crafts/crafts';
import { ageGroup } from '../../people/people';
import { STEWARD } from '../../rules/rules-steward';
import { advanceVillage } from '../../core/simulate';
import { fieldStoresOutlook } from '../../core/simulate-plan';
import { newSteward } from '../steward-state';
import { needSteps, type NeedContext } from '../steward-needs';
import { TRADE } from '../../rules/rules-trade';
import { finishTrail, startTrail } from '../../trade/trail';
import type { Direction8, VillageState } from '../../types';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Krok 2a dne správce – nouze (steward.md – Lov v nouzi; Martin 8. 11. 2026: „A“): obilí od sousedů
// už nekupuje (markets.md – Pravidla 1), ani když hrozí hlad. Lov správce (hunting.md – Pravidla 8)
// testuje `wildlife/__tests__/npc-hunt.test.ts`.

const DAY = dayIndexOf({ year: 600, month: 12, day: 1 });
const SEED = 11;

/**
 * Směry stezek fixtury – kde ves seedu dřív měla obilnáře (smyšlení sousedé skončili – markets.md,
 * Pravidla 1); fixtury zůstávají stejné jako dřív.
 */
const GRAIN_DIRECTIONS: Record<number, readonly Direction8[]> = {
  11: ['NE', 'S'],
  12: ['SE'],
  13: ['SE', 'NW'],
  14: ['SE', 'NW'],
  15: ['W', 'NW'],
  16: ['E', 'W'],
};

/** Směr stezky fixtury pro seed vsi. */
function grainDirection(seed: number): Direction8 {
  const dir = GRAIN_DIRECTIONS[seed]?.[0];
  if (!dir) throw new Error('žádný obilnář');
  return dir;
}

/** Ves se správcem, hotovou stezkou k obilnáři, bez zásob obilí a s kládami na zaplacení. */
function hungry(direction: Direction8 = grainDirection(SEED)): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: SEED, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = DAY;
  const next = startTrail(s, DAY, direction, LANDSCAPE, null);
  const c = next.constructions.find((x) => x.trail !== undefined)!;
  finishTrail(next, c, DAY);
  next.constructions = next.constructions.filter((x) => x !== c);
  next.storesKg = 0;
  delete next.reservedSeedKg;
  next.woodLogs = 30;
  withAdults(next, 8);
  return next;
}

/** Doplní ves na `n` dospělých (svobodní, 25 let) – dost nosičů na výpravu s kládami. */
function withAdults(state: VillageState, n: number): void {
  const home = state.people[0]!.dwellingId;
  let id = Math.max(...state.people.map((p) => p.id)) + 1;
  while (state.people.filter((p) => ageGroup(p, DAY) === 'adult').length < n) {
    state.people.push({
      id,
      bornDay: DAY - 25 * 365,
      dwellingId: home,
      sex: id % 2 === 0 ? 'male' : 'female',
    });
    id++;
  }
  state.nextId = Math.max(state.nextId, id);
}

function ctxOf(state: VillageState, day = DAY): NeedContext {
  return { day, coverage: craftCoverage(state, day) };
}

function shortOf(state: VillageState, day = DAY): number {
  return fieldStoresOutlook(state, day, craftCoverage(state, day)).shortKg;
}

describe('správce v nouzi nekupuje obilí (markets.md – Pravidla 1)', () => {
  it('hrozí hlad, stezka i hřivny jsou, a přesto žádná výprava za obilím', () => {
    const s = hungry();
    expect(shortOf(s)).toBeGreaterThan(TRADE.porterKg);
    needSteps(s, ctxOf(s));
    expect(s.trade?.expeditions ?? []).toEqual([]);
    expect(s.chronicle.some((e) => e.kind === 'trade-departed')).toBe(false);
  });

  it('deterministicky: stejný stav a den dají stejný výsledek', () => {
    const a = hungry();
    const b = cloneState(a);
    needSteps(a, ctxOf(a));
    needSteps(b, ctxOf(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('krok 2a v dopočtu vsi (determinismus)', () => {
  const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
  const obstacles = obstaclesOf(landscape);
  const START =
    Math.ceil(dayIndexOf({ year: 600, month: 6, day: 10 }) / STEWARD.everyDays) * STEWARD.everyDays;

  /** Ves se správcem na místě krajiny 1, se stezkou k obilnáři, bez obilí a se škodami zvěře. */
  function stewarded(): VillageState {
    const site = landscape.villageSite;
    const c = tileCenterWorld(landscape, site.x, site.y);
    // seed vsi, jejíž obilnář leží směrem, kudy na krajině 1 vede stezka ke kraji mapy
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const founded = foundVillage({
        seed,
        day: START - 1,
        dwellingPosition: { x: c.x, z: c.z, rotation: 0 },
      });
      let s: VillageState = withBuiltFirstDwelling({
        ...founded,
        steward: newSteward(START, true),
      });
      s = advanceVillage(s, START - 1, obstacles, landscape);
      for (const dir of GRAIN_DIRECTIONS[seed] ?? []) {
        try {
          return withNeeds(startTrail(s, START - 1, dir, landscape, obstacles));
        } catch {
          // tudy stezka nevede – další směr
        }
      }
    }
    throw new Error('žádná stezka k obilnáři');
  }

  function withNeeds(trailed: VillageState): VillageState {
    const s = trailed;
    const trail = s.constructions.find((x) => x.trail !== undefined)!;
    finishTrail(s, trail, START - 1);
    s.constructions = s.constructions.filter((x) => x !== trail);
    s.storesKg = 0;
    delete s.reservedSeedKg;
    s.woodLogs = 30;
    withAdults(s, 8);
    s.wildlife!.damage = {
      fromDay: START - 9,
      risk: [],
      parts: {},
      topPartId: null,
      totalKg: 0,
      lastYearKg: 100_000,
    };
    return s;
  }

  it('po kouscích stejně jako vcelku – bez výpravy za obilím', { timeout: 120_000 }, () => {
    const start = stewarded();
    const to = START + 60;
    const whole = advanceVillage(start, to, obstacles, landscape);
    let chunked = start;
    while (chunked.lastDay < to) {
      chunked = advanceVillage(chunked, Math.min(to, chunked.lastDay + 7), obstacles, landscape);
    }
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
    expect(whole.chronicle.some((e) => e.kind === 'trade-departed')).toBe(false);
  });
});
