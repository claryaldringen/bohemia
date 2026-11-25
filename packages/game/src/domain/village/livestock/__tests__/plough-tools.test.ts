import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { daylightFactor } from '../../core/daylight';
import { advanceVillage } from '../../core/simulate';
import {
  addToCropWork,
  createCropWork,
  partWeight,
  ploughAtTools,
  seasonCrops,
  seasonPloughAtTools,
} from '../../core/year-plan';
import { taskPosition } from '../../fields/field-progress';
import { FURROW } from '../../rules';
import { PLOUGH_HA_PER_DAY, PLOUGH_SOD_FACTOR } from '../plough';
import type { CropWork, FarmSeason, FieldPart, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Orba s nástroji získanými během sezóny (oxen.md – Účinek na práci, Nástroje během sezóny):
// kapacita spřežení i orba plánu při dnešním pokrytí nástroji – páry orají 0,3 ha za den s jakýmikoli
// nástroji, lepší nástroje ubírají práci lidem hned a zoraná plocha se přepočtem nezmění.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 9, 1);
/** Den, od kterého má ves jiné nástroje – uprostřed orby. */
const CHANGE = at(600, 9, 10);
const END = at(600, 9, 28);

function part(id: number, x: number, y: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 225,
    distanceM: 60 + 15 * y,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'ready',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    cell: { x, y },
    ...over,
  };
}

/** Obdélník 32 × `rows` dílů od řádku `y0`; id od `first`. */
function rows(
  first: number,
  y0: number,
  count: number,
  over: Partial<FieldPart> = {},
): FieldPart[] {
  return Array.from({ length: 32 * count }, (_, i) =>
    part(first + i, i % 32, y0 + Math.floor(i / 32), over),
  );
}

/** Zoraná plocha plodiny (ha s příplatkem za vzdálenost, drn `PLOUGH_SOD_FACTOR`× – jako orba). */
function ploughedOf(work: CropWork, byId: ReadonlyMap<number, FieldPart>): number {
  const sod = new Set(work.plough?.sodIds ?? []);
  const weight = (work.plough?.partIds ?? []).reduce((sum, id) => {
    const p = byId.get(id)!;
    return sum + partWeight(p) * (sod.has(id) ? PLOUGH_SOD_FACTOR : 1);
  }, 0);
  return taskPosition(work, 'plough') * weight;
}

function ploughedHa(s: VillageState): number {
  const byId = new Map(s.parts.map((p) => [p.id, p]));
  return seasonCrops(s.season!).reduce((sum, { work }) => {
    return work.plough ? sum + ploughedOf(work, byId) : sum;
  }, 0);
}

/**
 * Ves s polem 32 × `fieldRows` dílů (≈ 0,7 ha na řadu), `pairs` páry volů s rádly a `adults`
 * dospělými; vybavení nástroji `toolsKg`.
 */
function village(pairs: number, adults: number, toolsKg: number, fieldRows = 16): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY - 10, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = DAY - 1;
  s.fields = [{ id: 1 }];
  s.parts = rows(1, 0, fieldRows);
  s.storesKg = 20_000;
  s.meatKg = 300;
  const single = { ...s.people.find((p) => DAY - p.bornDay > 18 * 365)! };
  delete single.spouseId;
  while (s.people.length < adults) s.people.push({ ...single, id: 5000 + s.people.length });
  s.pens = Array.from({ length: pairs }, (_, i) => ({
    id: 900 + i,
    cell: { x: 60 + i, y: 30 },
    x: 50 + 10 * i,
    z: 60,
    builtDay: DAY - 800,
    team: { readyDay: DAY - 10 },
    training: null,
  }));
  s.hay = { kg: 50_000, mowing: null };
  if (toolsKg > 0) s.toolEquipmentKg = toolsKg;
  return s;
}

/** Zoraná plocha po dnech `DAY`–`END`; od `from` má ves nástroje `toolsKg` (bez nich beze změny). */
function ploughing(start: VillageState, toolsKg?: number, from = CHANGE): number[] {
  const ha: number[] = [];
  let s = start;
  for (let day = DAY; day <= END; day++) {
    if (day === from && toolsKg !== undefined) s = { ...s, toolEquipmentKg: toolsKg };
    s = advanceVillage(s, day, null);
    ha.push(ploughedHa(s));
  }
  return ha;
}

/** Přírůstky zorané plochy po dnech. */
const gains = (ha: readonly number[]): number[] => ha.map((v, i) => v - (i > 0 ? ha[i - 1]! : 0));

/** Kolik za den nejvýš zorá `pairs` párů (ha při plné brázdě). */
const pairsHa = (pairs: number, day: number): number =>
  pairs * PLOUGH_HA_PER_DAY * daylightFactor(day) * FURROW.maxGain;

describe('nástroje získané nebo ztracené uprostřed orby', () => {
  it('spřežení (málo párů, dost lidí): ves nezorá méně než stejná ves bez nákupu a orba nepřibude sama', () => {
    const without = ploughing(village(1, 14, 0));
    const bought = ploughing(village(1, 14, 0), 200);
    bought.forEach((ha, i) => expect(ha).toBeGreaterThanOrEqual(without[i]! - 1e-9));
    gains(bought).forEach((gain, i) => {
      expect(gain).toBeGreaterThanOrEqual(-1e-9);
      expect(gain).toBeLessThanOrEqual(pairsHa(1, DAY + i) + 1e-9);
    });
  }, 60_000);

  it('i když už žádný díl nepřibude (celé pole na čele): páry orají dál stejně', () => {
    const buy = DAY + 4;
    const without = ploughing(village(1, 14, 0, 3));
    const bought = ploughing(village(1, 14, 0, 3), 200, buy);
    // nákup přišel uprostřed orby, díly už nepřibývají
    expect(without[buy - DAY - 1]).toBeGreaterThan(1);
    expect(without[buy - DAY]! - without[buy - DAY - 1]!).toBeGreaterThan(0.2);
    bought.forEach((ha, i) => expect(ha).toBeCloseTo(without[i]!, 9));
  }, 60_000);

  it('ztráta nástrojů: páry orají dál stejně, zorané díly zůstanou zorané', () => {
    const kept = ploughing(village(1, 14, 200));
    const lost = ploughing(village(1, 14, 200), 0);
    lost.forEach((ha, i) => expect(ha).toBeGreaterThanOrEqual(kept[i]! - 1e-9));
    gains(lost).forEach((gain, i) => {
      expect(gain).toBeGreaterThanOrEqual(-1e-9);
      expect(gain).toBeLessThanOrEqual(pairsHa(1, DAY + i) + 1e-9);
    });
  }, 60_000);

  it('lidé (dost párů, málo lidí): vesničané nástroje použijí hned – zorají víc', () => {
    const without = ploughing(village(3, 4, 0));
    const bought = ploughing(village(3, 4, 0), 200);
    const since = CHANGE - DAY - 1;
    const grown = (ha: readonly number[]): number => ha[since + 10]! - ha[since]!;
    expect(bought[since]).toBe(without[since]);
    // orba 10 → 6 čd/ha a setí za ní 1 ÷ 0,3 čd/ha: na hektar 13,3 → 9,3 čd
    expect(grown(bought)).toBeGreaterThan(1.35 * grown(without));
  }, 60_000);

  it('výsledek nezávisí na kouscích dopočtu', () => {
    const before = advanceVillage(village(1, 14, 0), CHANGE - 1, null);
    const start: VillageState = { ...before, toolEquipmentKg: 200 };
    const whole = advanceVillage(start, END, null);
    let pieces = start;
    while (pieces.lastDay < END) {
      pieces = advanceVillage(pieces, Math.min(END, pieces.lastDay + 5), null);
    }
    expect(pieces).toEqual(whole);
  }, 60_000);
});

describe('přepočet orby na pokrytí nástroji', () => {
  const meadow: Partial<FieldPart> = { state: 'fallow', fallowSinceDay: at(590, 9, 1) };
  const parts = [...rows(1, 0, 2), ...rows(101, 2, 1, meadow)];
  const plan = (tools: number): CropWork =>
    createCropWork(parts, DAY, tools, true, undefined, 'winter');

  it('potřebná orba jako plán při tom pokrytí, podíl zorané části se nezmění', () => {
    const worn = plan(0);
    worn.plough!.done = 0.4 * worn.plough!.required;
    const before = taskPosition(worn, 'plough');
    for (const tools of [1, 0.25, 0.8, 0]) {
      ploughAtTools(worn.plough!, tools);
      expect(worn.plough!.required).toBeCloseTo(plan(tools).plough!.required, 9);
      expect(worn.plough!.perHa).toBe(plan(tools).plough!.perHa);
      expect(taskPosition(worn, 'plough')).toBeCloseTo(before, 12);
    }
  });

  it('dooraná plodina zůstane dooraná a stejné pokrytí nic nezmění', () => {
    const done = plan(0);
    done.plough!.done = done.plough!.required;
    ploughAtTools(done.plough!, 1);
    expect(done.plough!.done).toBe(done.plough!.required);
    const same = plan(0.4);
    same.plough!.done = 3.7;
    const { required, done: work } = same.plough!;
    ploughAtTools(same.plough!, 0.4);
    expect(same.plough).toMatchObject({ required, done: work });
  });

  it('orba bez sazby se bere, jako by při tom pokrytí byla; sezóna bez plodin se nepřepočítává', () => {
    const old = plan(0);
    delete old.plough!.perHa;
    const { required } = old.plough!;
    ploughAtTools(old.plough!, 1);
    expect(old.plough).toMatchObject({ required, perHa: plan(1).plough!.perHa });
    const spring = createCropWork(rows(201, 5, 1), DAY, 0, false);
    const season: FarmSeason = {
      startDay: DAY,
      ard: true,
      crops: [
        { crop: 'winter', ...plan(0) },
        { crop: 'spring', ...spring },
      ],
    };
    seasonPloughAtTools(season, 1);
    expect(season.crops[0]!.plough!.required).toBeCloseTo(plan(1).plough!.required, 9);
    // plodina, kterou spřežení neoře, orbu nemá
    expect(season.crops[1]!.plough).toBeUndefined();
    expect(season.crops[1]!.required).toEqual(spring.required);
    expect(() => seasonPloughAtTools(null, 1)).not.toThrow();
  });
});

describe('díly přidané při jiném pokrytí nástroji', () => {
  it('zorané díly zůstanou zorané, přidané nezorané – orba se neztratí ani nezdvojí', () => {
    for (const [planTools, addTools] of [
      [0, 1],
      [1, 0],
      [0.3, 0.7],
    ] as const) {
      const meadow: Partial<FieldPart> = { state: 'fallow', fallowSinceDay: at(590, 9, 1) };
      const first = [...rows(1, 0, 2), ...rows(101, 2, 1, meadow)];
      const later = [...rows(201, 3, 1), ...rows(301, 4, 1, meadow)];
      const byId = new Map([...first, ...later].map((p) => [p.id, p]));
      const work = createCropWork(first, DAY, planTools, true, undefined, 'winter');
      work.plough!.done = 0.75 * work.plough!.required;
      const before = ploughedOf(work, byId);
      expect(before).toBeGreaterThan(1);
      addToCropWork(work, later, DAY + 20, addTools, undefined, 'winter');
      expect(ploughedOf(work, byId)).toBeCloseTo(before, 9);
      // celá orba plodiny při pokrytí dne přidání
      const whole = createCropWork(
        [...first, ...later],
        DAY + 20,
        addTools,
        true,
        undefined,
        'winter',
      );
      expect(work.plough!.required).toBeCloseTo(whole.plough!.required, 9);
    }
  });
});
