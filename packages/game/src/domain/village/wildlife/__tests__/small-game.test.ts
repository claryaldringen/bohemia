import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { SMALL_GAME, WILDLIFE_CAPS } from '../../rules/rules-wildlife';
import { advanceVillage } from '../../core/simulate';
import { smallGameCapacity, smallGameDay, yearlyQuota } from '../small-game';
import { foxCount } from '../fox-eggs';
import type { VillageState } from '../../types';
import { withWildlife } from '../wildlife';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Ryby a oka vesničanů (wildlife.md – Drobná zvěř a ryby – vesničané sami).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const SUMMER = at(601, 7, 10);
const WINTER = at(601, 1, 10);

/** Ves se zvěří na stropu (výchozí krajina: voda 2,5 ha, 2 tůně, 120 ha luk). */
function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({
      seed: 7,
      day: at(599, 8, 20),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        parts: [
          {
            areaM2: 5000,
            distanceM: 50,
            naturalFertility: 70,
            surface: 'meadow' as const,
            obstacleCost: 0,
          },
        ],
      },
    }),
  );
  return withWildlife(s, null);
}

/** Ves, která bílkoviny chce (hlad), nebo nechce (loňský úlovek přebíjí potřebu). */
function wanting(s: VillageState, want: boolean): VillageState {
  if (want) s.hungry = true;
  else {
    s.hungry = false;
    s.wildlife!.smallGame = {
      today: null,
      year: { fishKg: 0, hares: 0, meatKg: 0, days: 0 },
      lastWildMeatKg: 1e9,
    };
  }
  return s;
}

describe('ryby a oka vesničanů', () => {
  it('ryby se loví vždy: i sytá ves bez potřeby bílkovin chytí v červnu ryby', () => {
    const s = wanting(village(), false);
    const fish = s.wildlife!.fishKg;
    const r = smallGameDay(s, SUMMER, 5);
    expect(r.manDays).toBeGreaterThan(0);
    expect(s.wildlife!.smallGame!.year.meatKg).toBeGreaterThan(0);
    expect(s.freshMeatKg ?? 0).toBeGreaterThan(0);
    expect(s.wildlife!.fishKg).toBeLessThan(fish);
  });

  it('úlovek ryb = hodiny × 0,4 kg × biomasa ÷ strop, maso 0,6; čerstvé bez práce porážky', () => {
    const s = wanting(village(), true);
    const cap = 2.5 * WILDLIFE_CAPS.fishKgPerHa;
    s.wildlife!.fishKg = cap * 0.8;
    const meat = s.freshMeatKg ?? 0;
    const r = smallGameDay(s, SUMMER, 2);
    expect(r.manDays).toBe(2);
    const kg = 2 * SMALL_GAME.hoursPerManDay * SMALL_GAME.fish.kgPerHour * 0.8;
    expect(s.wildlife!.fishKg).toBeCloseTo(cap * 0.8 - kg, 6);
    expect((s.freshMeatKg ?? 0) - meat).toBeCloseTo(kg * 0.6, 6);
    expect(s.meatKg ?? 0).toBe(0);
    expect(s.livestock?.slaughterWork?.required ?? 0).toBe(0);
    expect(r.shares.every((x) => x.activity === 'fish' && x.target.kind === 'pool')).toBe(true);
  });

  it('nejvýš 3 rybáři na tůň (2 tůně = 6 člověkodní)', () => {
    const s = wanting(village(), true);
    expect(smallGameCapacity(s, SUMMER)).toBe(6);
    const r = smallGameDay(s, SUMMER, 50);
    expect(r.manDays).toBe(6);
    expect(s.wildlife!.smallGame!.today!.pools).toEqual([3, 3]);
  });

  it('pod polovinou stropu se nechytá, výlov končí na polovině', () => {
    const s = wanting(village(), true);
    const cap = 2.5 * WILDLIFE_CAPS.fishKgPerHa;
    s.wildlife!.fishKg = cap * 0.5;
    expect(smallGameCapacity(s, SUMMER)).toBe(0);
    s.wildlife!.fishKg = cap * 0.51;
    smallGameDay(s, SUMMER, 6);
    expect(s.wildlife!.fishKg).toBeCloseTo(cap * 0.5, 6);
  });

  it('roční kvóta ryb: i při plné zásobě nejvýš čtvrtina stropu za rok, pak se nechytá', () => {
    const s = wanting(village(), true);
    const cap = 2.5 * WILDLIFE_CAPS.fishKgPerHa;
    for (let d = at(601, 4, 1); d <= at(601, 11, 30); d++) smallGameDay(s, d, 6);
    const caught = s.wildlife!.smallGame!.year.fishKg;
    expect(caught).toBeCloseTo(cap * SMALL_GAME.fishMaxYieldShare, 6);
    expect(smallGameCapacity(s, at(601, 11, 30))).toBe(0);
  });

  it('kvóta zajíců: zásoba se nesníží pod polovinu a nad roční přírůstek', () => {
    const s = wanting(village(), true);
    const cap = (120 * WILDLIFE_CAPS.haresPer100Ha) / 100;
    for (let d = at(601, 12, 1); d <= at(602, 3, 31); d++) smallGameDay(s, d, 6);
    expect(s.wildlife!.hares).toBeGreaterThanOrEqual(cap / 2 - 1e-9);
  });

  it('víc let: ustálený roční výlov ryb ≤ přírůstek, zásoba nekolísá boom–bust', () => {
    const s = wanting(village(), true);
    const caps = { fishKg: 2.5 * WILDLIFE_CAPS.fishKgPerHa };
    const yearly: number[] = [];
    for (let y = 601; y < 609; y++) {
      for (let d = at(y, 4, 1); d <= at(y, 11, 30); d++) smallGameDay(s, d, 6);
      yearly.push(s.wildlife!.smallGame!.year.fishKg);
      // 1. 5. příštího roku: přírůstek jako ve wildlife.ts a nová kvóta
      const f = s.wildlife!.fishKg;
      s.wildlife!.fishKg = Math.min(caps.fishKg, f + f * (1 - f / caps.fishKg));
      s.wildlife!.smallGame = {
        today: null,
        year: { fishKg: 0, hares: 0, meatKg: 0, days: 0 },
        quota: yearlyQuota(
          s.wildlife!,
          s.wildlife!.fishKg,
          s.wildlife!.hares,
          foxCount(s.wildlife!.land),
        ),
      };
      s.hungry = true;
    }
    for (const kg of yearly) expect(kg).toBeLessThanOrEqual(caps.fishKg * 0.25 + 1e-6);
    const tail = yearly.slice(2);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(caps.fishKg * 0.05);
    expect(tail[0]!).toBeGreaterThan(caps.fishKg * 0.1);
  });

  it('hladovějící ves chytá před stavbami a maso se sní čerstvé ten den', () => {
    const s = wanting(village(), true);
    const next = advanceVillage(s, SUMMER + 1, null);
    expect(next.wildlife?.smallGame?.year.fishKg ?? 0).toBeGreaterThan(0);
    expect(next.freshMeatKg).toBeUndefined();
  });

  it('v zimě oka: 0,05 zajíce za hodinu × zajíci ÷ strop, 2 kg masa', () => {
    const s = wanting(village(), true);
    const cap = (120 * WILDLIFE_CAPS.haresPer100Ha) / 100;
    const r = smallGameDay(s, WINTER, 1);
    expect(r.shares[0]!.activity).toBe('snare');
    const hares = 10 * SMALL_GAME.snares.perHour;
    expect(s.wildlife!.hares).toBeCloseTo(cap - hares, 6);
    expect(s.freshMeatKg).toBeCloseTo(hares * 2, 6);
  });

  it('rok chytání: ≈ 150–200 kg ryb a ≈ 20 kg masa ze zajíců při 0,25 člověkodne denně', () => {
    const s = wanting(village(), true);
    for (let d = at(601, 4, 1); d <= at(601, 11, 30); d++) smallGameDay(s, d, 0.25);
    const fishKg = s.wildlife!.smallGame!.year.fishKg;
    expect(fishKg).toBeGreaterThan(120);
    expect(fishKg).toBeLessThan(250);
    const meat = s.wildlife!.smallGame!.year.meatKg;
    for (let d = at(601, 12, 1); d <= at(602, 3, 31); d++) smallGameDay(s, d, 0.5);
    const hareMeat = s.wildlife!.smallGame!.year.meatKg - meat;
    expect(hareMeat).toBeGreaterThan(10);
    expect(hareMeat).toBeLessThan(30);
  });

  it('po kouscích: týž výsledek po dnech i po větších krocích', () => {
    const a = village();
    a.hungry = true;
    const b = JSON.parse(JSON.stringify(a)) as VillageState;
    let x = a;
    for (let i = 0; i < 40; i++) x = advanceVillage(x, SUMMER + i + 1, null);
    const y = advanceVillage(b, SUMMER + 40, null);
    expect(JSON.stringify(x.wildlife?.smallGame ?? null)).toBe(
      JSON.stringify(y.wildlife?.smallGame ?? null),
    );
  });
});

describe('oka v zimě kdykoli je čas, liška do ok', () => {
  /** Ves s krajinou na 4 lišky (400 ha lesa a luk) – strop zajíců podle luk. */
  function foxVillage(): VillageState {
    const s = wanting(village(), false);
    s.wildlife!.land = { ...s.wildlife!.land, forestHa: 300, openHa: 120 };
    return s;
  }

  it('oka i bez potřeby bílkovin: zajíci ubudou, kožešiny = zajíci + lišky, maso 2 kg na zajíce', () => {
    const s = foxVillage();
    const hares = s.wildlife!.hares;
    const r = smallGameDay(s, WINTER, 3);
    expect(r.manDays).toBeGreaterThan(0);
    const caughtHares = hares - s.wildlife!.hares;
    const caughtFoxes = s.wildlife!.smallGame!.year.foxes ?? 0;
    expect(caughtHares).toBeGreaterThan(0);
    expect(s.wares!.wildFurs).toBeCloseTo(caughtHares + caughtFoxes, 6);
    expect(s.freshMeatKg).toBeCloseTo(caughtHares * 2, 6);
  });

  it('ryby se chytají i bez potřeby bílkovin', () => {
    const s = foxVillage();
    expect(smallGameDay(s, SUMMER, 3).manDays).toBeGreaterThan(0);
  });

  it('liška do ok: na stropu 4 a 1 čd = 0,2 lišky; na polovině stropu nic, zajíci dál', () => {
    const s = foxVillage();
    expect(foxCount(s.wildlife!.land)).toBe(4);
    smallGameDay(s, WINTER, 1);
    expect(s.wildlife!.foxes).toBeCloseTo(4 - 10 * SMALL_GAME.snares.foxPerHour, 6);
    const t = foxVillage();
    t.wildlife!.foxes = 2;
    const hares = t.wildlife!.hares;
    smallGameDay(t, WINTER, 1);
    expect(t.wildlife!.foxes).toBe(2);
    expect(t.wildlife!.hares).toBeLessThan(hares);
  });

  it('stará kvóta bez lišek se dopočte a nic nespadne', () => {
    const s = foxVillage();
    const w = s.wildlife!;
    w.smallGame = {
      today: null,
      year: { fishKg: 0, hares: 0, meatKg: 0, days: 0 },
      quota: { fishKg: 10, hares: 10 },
      lastWildMeatKg: 1e9,
    };
    smallGameDay(s, WINTER, 1);
    expect(w.smallGame.quota!.foxes).toBe(2);
    expect(w.foxes).toBeLessThan(4);
  });

  it('yearlyQuota: lišky nad polovinou stropu', () => {
    const s = foxVillage();
    expect(yearlyQuota(s.wildlife!, 0, 0, 4).foxes).toBe(2);
    expect(yearlyQuota(s.wildlife!, 0, 0, 1).foxes).toBe(0);
  });
});
