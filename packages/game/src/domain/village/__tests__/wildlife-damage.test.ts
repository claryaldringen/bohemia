import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { FIELD_DAMAGE } from '../rules-wildlife';
import { advanceVillage } from '../simulate';
import type { CropWork, VillageState } from '../types';
import {
  dailyThreatShare,
  damageWindowStart,
  edgeWeight,
  wildlifeDamageDay,
  wildlifeSeasonEnd,
} from '../wildlife-damage';
import { forestEdgeDistances } from '../wildlife-land';
import { withWildlife } from '../wildlife';
import { expectedWinterKg, seasonCrops, seasonCrop } from '../year-plan';
import { makeLandscape } from './placement-fixtures';
import { flaxIntoSpring, withBuiltFirstDwelling } from './village-fixtures';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const JUNE = at(600, 6, 1);

/**
 * Ves 1. 6. 600 s hospodářským rokem: dva díly ozimu a tři díly jaře (nad potřebu), vše oseté;
 * plocha dílů `areaM2` (zvěř se testuje přímo, ne přes práci vsi).
 */
function juneVillage(areaM2 = 5000): VillageState {
  const parts = Array.from({ length: 12 }, (_, i) => ({
    areaM2: 5000,
    distanceM: 50 + i * 10,
    naturalFertility: 70,
    surface: 'meadow' as const,
    obstacleCost: 0,
  }));
  let s = withBuiltFirstDwelling(
    foundVillage({
      seed: 42,
      day: at(599, 8, 20),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        parts,
      },
    }),
  );
  s.constructions = [];
  s.storesKg = 20_000;
  s.parts.forEach((p) => {
    p.foundingDone = p.foundingCost;
    p.state = 'sown';
    p.crop = 'spring';
  });
  // len na poli (fields.md – Len) – testy počítají s obilím na všech osetých dílech
  s = flaxIntoSpring(advanceVillage(s, JUNE - 1, null));
  // setí je 1. 6. hotové
  cerealsOf(s).forEach((w) => (w.done.sow = w.required.sow));
  s.parts.forEach((p) => {
    if (p.state === 'sown') p.areaM2 = areaM2;
  });
  return withWildlife(s, null);
}

function stock(s: VillageState, boarAdults: number, deer: number): void {
  const w = s.wildlife!;
  w.boar = { adults: boarAdults, piglets: 0 };
  w.deer = { stags: deer, hinds: 0, calves: 0 };
}

function cerealsOf(s: VillageState): CropWork[] {
  return seasonCrops(s.season!)
    .filter(({ crop }) => crop === 'winter' || crop === 'spring')
    .map(({ work }) => work);
}

describe('váha podle vzdálenosti od lesa', () => {
  it('1 do 50 m, 0,5 ve 150 m, 0 od 250 m', () => {
    expect(edgeWeight(0)).toBe(1);
    expect(edgeWeight(50)).toBe(1);
    expect(edgeWeight(150)).toBeCloseTo(0.5, 9);
    expect(edgeWeight(250)).toBe(0);
    expect(edgeWeight(900)).toBe(0);
  });

  it('vzdálenost od okraje lesa z krajiny (chamfer 3–4 po políčkách)', () => {
    const s = juneVillage();
    const landscape = makeLandscape({
      size: 128,
      surface: (x) => (x < 40 ? 'forest' : 'meadow'),
    });
    const sown = s.parts.filter((p) => p.state === 'sown');
    sown.forEach((p, i) => {
      p.cell = { x: 50 + i, y: 64 };
    });
    const d = forestEdgeDistances(landscape, s);
    // středy políček x = 50 a 54: 11 a 15 políček od posledního lesního (x = 39), minus půl políčka
    expect(d.get(sown[0]!.id)).toBeCloseTo(11 * 15 - 7.5, 6);
    expect(d.get(sown[4]!.id)).toBeCloseTo(15 * 15 - 7.5, 6);
  });
});

describe('okno škod 1. 6.', () => {
  it('ohrožené jsou jen osetý ozim a jař, díl v lese 0 m, jiný bez krajiny 120 m', () => {
    const s = juneVillage();
    const sown = s.parts.filter((p) => p.state === 'sown');
    sown[0]!.surface = 'forest';
    damageWindowStart(s, JUNE, null);
    const risk = s.wildlife!.damage!.risk;
    expect(risk).toHaveLength(sown.length);
    expect(risk.find((r) => r.partId === sown[0]!.id)).toMatchObject({ edgeM: 0, weightHa: 0.5 });
    const other = risk.find((r) => r.partId === sown[1]!.id)!;
    expect(other.edgeM).toBe(FIELD_DAMAGE.defaultEdgeM);
    expect(other.weightHa).toBeCloseTo(0.5 * edgeWeight(120), 9);
  });

  it('jiný den než 1. 6. nic neudělá; loňský součet jde do lastYearKg', () => {
    const s = juneVillage();
    damageWindowStart(s, JUNE + 1, null);
    expect(s.wildlife!.damage).toBeUndefined();
    damageWindowStart(s, JUNE, null);
    s.wildlife!.damage!.totalKg = 321;
    damageWindowStart(s, JUNE, null);
    expect(s.wildlife!.damage!.lastYearKg).toBe(321);
    expect(s.wildlife!.damage!.totalKg).toBe(0);
  });

  it('díl 300 m od lesa má váhu 0, ale zůstává v seznamu kvůli vranám', () => {
    const s = juneVillage();
    s.parts.filter((p) => p.state === 'sown').forEach((p) => (p.surface = 'forest'));
    const landscape = makeLandscape({ size: 128, surface: (x) => (x < 20 ? 'forest' : 'meadow') });
    s.parts.filter((p) => p.state === 'sown').forEach((p) => (p.cell = { x: 40, y: 64 }));
    damageWindowStart(s, JUNE, landscape);
    const risk = s.wildlife!.damage!.risk;
    expect(risk.every((r) => r.weightHa === 0 && r.edgeM > 250)).toBe(true);
  });
});

describe('škoda dne', () => {
  /** Ves s plochou dílů `areaM2`, zvěří (jen prasata) a všemi díly 0 m od lesa. */
  function forestVillage(areaM2: number, boar: number, deer = 0): VillageState {
    const s = juneVillage(areaM2);
    s.parts.filter((p) => p.state === 'sown').forEach((p) => (p.surface = 'forest'));
    stock(s, boar, deer);
    damageWindowStart(s, JUNE, null);
    return s;
  }
  const crowsOnly = (s: VillageState, id: number): number =>
    s.wildlife!.damage!.parts[String(id)]?.share ?? 0;

  it('kg zvěře se rozdělí podle plochy × váhy a přepočte na podíl hrubé úrody', () => {
    const s = forestVillage(40_000, 8); // 5 dílů × 4 ha = 20 ha → plný násobek
    wildlifeDamageDay(s, JUNE);
    const d = s.wildlife!.damage!;
    const crowKg = (id: number): number => d.parts[String(id)]!.kg;
    const total = Object.keys(d.parts).reduce((sum, id) => sum + crowKg(Number(id)), 0);
    // 8 kg zvěře + vrány (2 % ÷ 61 / 92 dnů z hrubé úrody)
    const crows = d.totalKg - 8;
    expect(total).toBeCloseTo(d.totalKg, 9);
    expect(crows).toBeGreaterThan(0);
    expect(crows).toBeLessThan(0.02 * 20 * 3000 * 0.02);
    // díly stejné plochy a váhy dostanou stejný podíl zvěře → stejné kg v rámci plodiny
    const kgs = Object.values(d.parts).map((p) => p.kg);
    expect(Math.max(...kgs) - Math.min(...kgs)).toBeLessThan(1);
  });

  it('malá ves: škoda se násobí plochou polí u lesa ÷ 10 ha', () => {
    const big = forestVillage(40_000, 8); // 20 ha
    const small = forestVillage(10_000, 8); // 5 ha → ½
    const tiny = forestVillage(2_000, 8); // 1 ha → 1/10
    // bez noční hlídky (ta má vlastní test v field-guard.test.ts)
    for (const s of [big, small, tiny]) {
      delete s.wildlife!.watch;
      wildlifeDamageDay(s, JUNE);
    }
    // vrány se s plochou škálují stejně → odečti jejich podíl počítaný bez zvěře
    const noGame = (areaM2: number): number => {
      const s = forestVillage(areaM2, 0);
      delete s.wildlife!.watch;
      wildlifeDamageDay(s, JUNE);
      return s.wildlife!.damage!.totalKg;
    };
    const game = (s: VillageState, areaM2: number): number =>
      s.wildlife!.damage!.totalKg - noGame(areaM2);
    expect(game(big, 40_000)).toBeCloseTo(8, 6);
    expect(game(small, 10_000)).toBeCloseTo(4, 6);
    expect(game(tiny, 2_000)).toBeCloseTo(0.8, 6);
  });

  it('po sklizni ozimu se denní škoda jaře na ha nezvýší (násobek malé vsi z nesklizených dílů)', () => {
    const s = forestVillage(10_000, 8); // 5 dílů × 1 ha
    const [winter, spring] = [seasonCrop(s.season, 'winter')!, seasonCrop(s.season, 'spring')!];
    const id = spring.partIds[0]!;
    const before = dailyThreatShare(s, JUNE).get(id)!;
    winter.done.harvest = winter.required.harvest;
    const after = dailyThreatShare(s, JUNE).get(id)!;
    expect(after).toBeCloseTo(before, 12);
    expect(dailyThreatShare(s, JUNE).has(winter.partIds[0]!)).toBe(false);
  });

  it('dailyThreatShare nic nepíše a wildlifeDamageDay z ní skládá stav', () => {
    const s = forestVillage(10_000, 8);
    const copy = structuredClone(s);
    const threat = dailyThreatShare(s, JUNE);
    expect(s).toEqual(copy);
    expect(threat.size).toBe(5);
    wildlifeDamageDay(s, JUNE);
    for (const [id, share] of threat) {
      expect(s.wildlife!.damage!.parts[String(id)]!.share).toBeCloseTo(share, 12);
    }
    expect(dailyThreatShare(s, at(600, 9, 1)).size).toBe(0);
  });

  it('díl přijde nejvýš o polovinu úrody, zbytek propadne', () => {
    const s = forestVillage(40_000, 1e9);
    wildlifeDamageDay(s, JUNE);
    const shares = Object.values(s.wildlife!.damage!.parts).map((p) => p.share);
    expect(shares).toHaveLength(5);
    shares.forEach((x) => expect(x).toBeCloseTo(FIELD_DAMAGE.maxShare, 12));
    wildlifeDamageDay(s, JUNE + 1);
    Object.values(s.wildlife!.damage!.parts).forEach((p) =>
      expect(p.share).toBeCloseTo(FIELD_DAMAGE.maxShare, 12),
    );
  });

  it('vrány berou 2 % za okno plodiny: ozim za 61, jař za 92 dnů', () => {
    const s = forestVillage(40_000, 0);
    for (let day = JUNE; day < JUNE + 61; day++) wildlifeDamageDay(s, day);
    const winter = seasonCrop(s.season, 'winter')!.partIds[0]!;
    expect(crowsOnly(s, winter)).toBeCloseTo(0.02 * (61 / 61), 9);
    const spring = seasonCrop(s.season, 'spring')!.partIds[0]!;
    expect(crowsOnly(s, spring)).toBeCloseTo(0.02 * (61 / 92), 9);
  });

  it('sklizený díl už neztrácí, nesklizený ano', () => {
    const s = forestVillage(40_000, 8);
    const [winter, spring] = [seasonCrop(s.season, 'winter')!, seasonCrop(s.season, 'spring')!];
    winter.done.harvest = winter.required.harvest; // celý ozim je sklizený
    wildlifeDamageDay(s, JUNE);
    const parts = s.wildlife!.damage!.parts;
    winter.partIds.forEach((id) => expect(parts[String(id)]).toBeUndefined());
    spring.partIds.forEach((id) => expect(parts[String(id)]!.kg).toBeGreaterThan(0));
  });

  it('mimo okno (září) a po sklizni plodiny nic', () => {
    const s = forestVillage(40_000, 8);
    wildlifeDamageDay(s, at(600, 9, 1));
    expect(s.wildlife!.damage!.totalKg).toBe(0);
    cerealsOf(s).forEach((w) => (w.harvestedKg = 0));
    wildlifeDamageDay(s, JUNE);
    expect(s.wildlife!.damage!.totalKg).toBe(0);
  });

  it('úroda při sklizni = bez škody × (1 − podíl); výhled jídla s dosavadní škodou', () => {
    const s = forestVillage(40_000, 8);
    const winter = seasonCrop(s.season, 'winter')!;
    const day = at(600, 7, 1);
    const without = expectedWinterKg(winter, s.parts, day);
    const losses = Object.fromEntries(winter.partIds.map((id) => [String(id), { share: 0.25 }]));
    const lost = expectedWinterKg(winter, s.parts, day, losses);
    const zero = expectedWinterKg(winter, s.parts, day, {});
    expect(zero).toBe(without);
    expect(lost).toBeLessThan(without * 0.8);
    expect(lost).toBeGreaterThan(without * 0.6);
    const all = Object.fromEntries(winter.partIds.map((id) => [String(id), { share: 1 }]));
    expect(expectedWinterKg(winter, s.parts, day, all)).toBe(0);
  });
});

describe('typická ves bez obrany', () => {
  /** Žně postupují rovnoměrně a trvají 12 dní: ozim od 1. 7., jař od 1. 8. */
  function harvestProgress(s: VillageState, day: number): void {
    const date = dateOfDayIndex(day);
    const set = (crop: 'winter' | 'spring', month: number): void => {
      const work = seasonCrop(s.season, crop)!;
      const frac =
        date.month < month ? 0 : date.month > month ? 1 : Math.min(1, (date.day - 1) / 12);
      work.done.harvest = work.required.harvest * frac;
      if (frac >= 1) work.harvestedKg = 0;
    };
    set('winter', 7);
    set('spring', 8);
  }

  /** Celé okno 1. 6. – 31. 8. s danou zvěří; vrací škodu v kg a stav. */
  function season(boar: [number, number], deer: [number, number, number]): VillageState {
    const s = juneVillage(40_000);
    s.parts.filter((p) => p.state === 'sown').forEach((p) => (p.surface = 'forest'));
    s.wildlife!.boar = { adults: boar[0], piglets: boar[1] };
    s.wildlife!.deer = { stags: deer[0], hinds: deer[1], calves: deer[2] };
    damageWindowStart(s, JUNE, null);
    for (let day = JUNE; day <= at(600, 8, 31); day++) {
      harvestProgress(s, day);
      wildlifeDamageDay(s, day);
    }
    return s;
  }

  it('8 prasat a 10 kusů jelení zvěře u lesa přijdou za okno o ≈ 650 kg (±10 %)', () => {
    const game = season([4, 4], [2, 5, 3]).wildlife!.damage!.totalKg;
    const crows = season([0, 0], [0, 0, 0]).wildlife!.damage!.totalKg;
    expect(game - crows).toBeGreaterThan(650 * 0.9);
    expect(game - crows).toBeLessThan(650 * 1.1);
  });
});

describe('konec sezóny', () => {
  it('kronika jen při škodě > 0 a ztráty se zahodí', () => {
    const s = juneVillage();
    wildlifeSeasonEnd(s, at(600, 8, 31));
    expect(s.chronicle.some((c) => c.kind === 'wildlife-damage')).toBe(false);
    stock(s, 8, 0);
    damageWindowStart(s, JUNE, null);
    wildlifeDamageDay(s, JUNE);
    const kg = Math.round(s.wildlife!.damage!.totalKg);
    wildlifeSeasonEnd(s, at(600, 8, 31));
    expect(s.chronicle.at(-1)).toEqual({ day: at(600, 8, 31), kind: 'wildlife-damage', kg });
    expect(s.wildlife!.damage!.parts).toEqual({});
    expect(s.wildlife!.damage!.risk).toEqual([]);
  });
});

describe('po kouscích', () => {
  it('1. 6. – 31. 8. po 1, 7 a 30 dnech dá týž stav', () => {
    const start = at(600, 5, 28);
    const base = juneVillage();
    base.lastDay = start;
    stock(base, 6, 4);
    const to = at(600, 9, 2);
    const whole = advanceVillage(base, to, null);
    expect(whole.chronicle.some((c) => c.kind === 'wildlife-damage')).toBe(true);
    for (const step of [1, 7, 30]) {
      let chunked = base;
      for (let cursor = start; cursor < to;) {
        cursor = Math.min(to, cursor + step);
        chunked = advanceVillage(chunked, cursor, null);
      }
      expect(chunked).toEqual(whole);
    }
  }, 120_000);
});
