import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { advanceVillage } from '../../core/simulate';
import { fieldTasks } from '../../core/simulate-work';
import { createCropWork, seasonCrops } from '../../core/year-plan';
import { taskPosition, taskSpans, type PartSpan } from '../field-progress';
import { readyTillageFirst } from '../tillage-order';
import type { CropWork, FieldPart, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Orba a setí až po vyklučení (fields.md – Postup práce po dílech; D116, návrh Clauda – oprava
// modelu): díl s křovím nebo mladým lesem rádlo ani motyka nezačnou, dokud ho lidé nevyklučí,
// a zaseje se, až je zoraný; rádlo mezitím orá další připravené díly v pořadí.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 9, 1);

/** Díl pole na čtverci (x, y) – vzdálenost od obydlí roste s y (obydlí je pod polem). */
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

/** Odpočatý příloh zarostlý křovinami – vrácení přílohu je klučení rukama. */
const shrubs = (p: FieldPart): FieldPart => ({
  ...p,
  state: 'fallow',
  fallowSinceDay: DAY - 8 * 365,
  overgrowthYears: 8,
});

/** Pole 6 × 3: řada křovin nejblíž obydlí (orá se první), za ní dvě řady připravených dílů. */
function fieldParts(): FieldPart[] {
  const parts: FieldPart[] = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 6; x++) {
      const p = part(1 + y * 6 + x, x, y);
      parts.push(y === 0 ? shrubs(p) : p);
    }
  }
  return parts;
}

/** Ves se zrnem na osivo a se třemi páry spřežení (bez nich kope motyka). */
function village(parts: FieldPart[], teams: boolean): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY - 10, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = DAY - 1;
  s.fields = [{ id: 1 }];
  s.parts = parts;
  s.storesKg = 3_000;
  s.meatKg = 300;
  if (teams) {
    s.pens = [1, 2, 3].map((i) => ({
      id: 900 + i,
      cell: { x: 50 + i, y: 50 },
      x: 50 + 10 * i,
      z: 60,
      builtDay: DAY - 800,
      team: { readyDay: DAY - 10 },
      training: null,
    }));
    s.hay = { kg: 50_000, mowing: null };
  }
  return s;
}

/** Kolik práce úlohy je na dílu hotovo (0–1). */
function share(
  work: CropWork,
  byId: Map<number, FieldPart>,
  task: 'reclaim' | 'plough' | 'dig' | 'sow',
  day: number,
): Map<number, number> {
  const at = taskPosition(work, task);
  const out = new Map<number, number>();
  for (const span of taskSpans(work, byId, task, day)) out.set(span.id, done(span, at));
  return out;
}

function done(span: PartSpan, position: number): number {
  return Math.max(0, Math.min(1, (position - span.start) / Math.max(1e-9, span.end - span.start)));
}

/**
 * Den po dni od 1. 9. do konce října: u každého dílu s klučením kolik je vyklučeno, zoráno
 * (zkopáno) a zaseto; dny, kdy rádlo (motyka) oralo, zatímco některý díl na vyklučení čekal.
 */
function run(teams: boolean): {
  ahead: string[];
  busyWhileClearing: number;
  sownAfter: number;
  clearing: number;
} {
  const till = teams ? 'plough' : 'dig';
  let s = village(fieldParts(), teams);
  const ahead: string[] = [];
  let busyWhileClearing = 0;
  let sownAfter = 0;
  let clearing = 0;
  let tilled = new Map<string, number>();
  for (let day = DAY; day <= at(600, 10, 31); day++) {
    s = advanceVillage(s, day, null);
    const byId = new Map(s.parts.map((p) => [p.id, p]));
    const now = new Map<string, number>();
    for (const { crop, work } of s.season ? seasonCrops(s.season) : []) {
      const doneTill = teams ? (work.plough?.done ?? 0) : work.done.dig;
      now.set(crop, doneTill);
      if (!work.reclaimIds?.length) continue;
      const reclaim = share(work, byId, 'reclaim', day);
      const tillage = share(work, byId, till, day);
      const sow = share(work, byId, 'sow', day);
      let waiting = false;
      for (const [id, r] of reclaim) {
        const t = tillage.get(id) ?? 0;
        const sw = sow.get(id) ?? 0;
        if (r < 1 - 1e-6) waiting = true;
        // zoráno (zkopáno) nebo zaseto dřív, než je díl vyklučený
        if ((t > 1e-6 || sw > 1e-6) && r < 1 - 1e-6) {
          ahead.push(
            `${crop} díl ${id} den ${day - DAY + 1}: klučení ${r}, ${till} ${t}, setí ${sw}`,
          );
        }
        if (sw > 0.99 && t > 0.99 && r > 1 - 1e-6) sownAfter++;
      }
      if (waiting) clearing++;
      if (waiting && doneTill > (tilled.get(crop) ?? 0) + 1e-9) busyWhileClearing++;
    }
    tilled = now;
  }
  return { ahead, busyWhileClearing, sownAfter, clearing };
}

describe('orba a setí až po vyklučení (fields.md – Postup práce po dílech; D116)', () => {
  it('díl v klučení se nezorá ani nezaseje, rádlo mezitím orá další díly, po vyklučení se zorá a zaseje', () => {
    const { ahead, busyWhileClearing, sownAfter, clearing } = run(true);
    // dřív rádlo zoralo křoví v pořadí hned první den a setí šlo za ním
    expect(ahead.slice(0, 3)).toEqual([]);
    expect(clearing).toBeGreaterThan(0);
    expect(busyWhileClearing).toBeGreaterThan(0);
    expect(sownAfter).toBeGreaterThan(0);
  }, 60_000);

  it('totéž motyka – díl v klučení se nezkope ani nezaseje, dokud ho lidé nevyklučí', () => {
    const { ahead, sownAfter } = run(false);
    expect(ahead.slice(0, 3)).toEqual([]);
    expect(sownAfter).toBeGreaterThan(0);
  }, 60_000);

  it('práce dne: rádlo a motyka na nevyklučený díl nejdou; nevyklučené díly jdou za připravené', () => {
    for (const plough of [true, false]) {
      const parts = fieldParts().map((p) => ({
        ...p,
        state: p.state === 'fallow' ? p.state : ('sown' as const),
      }));
      const s = village(parts, plough);
      // pořadí práce: křoví první (jako nejbližší obydlí), za ním připravené díly
      const work = createCropWork(parts, DAY, 0, plough, (ps) => [...ps], 'winter');
      const shrubIds = [1, 2, 3, 4, 5, 6];
      expect([...work.reclaimIds!].sort((a, b) => a - b)).toEqual(shrubIds);
      expect([...work.partIds.slice(0, 6)].sort((a, b) => a - b)).toEqual(shrubIds);
      s.season = {
        startDay: DAY,
        ...(plough ? { ard: true as const } : {}),
        crops: [{ crop: 'winter', ...work }],
      };
      const till = plough ? 'plough' : 'dig';
      const remaining = (): number =>
        fieldTasks(s, DAY, 1_000).find((e) => e.name === till)?.remaining ?? 0;
      // křoví první v pořadí: rádlo (motyka) počká, napřed se nesmí ani kus
      expect(remaining(), till).toBe(0);
      // nevyklučené za připravené – rádlo (motyka) jde na připravené díly
      readyTillageFirst(s, DAY);
      const crop = s.season.crops[0]!;
      expect([...crop.partIds.slice(-6)].sort((a, b) => a - b)).toEqual(shrubIds);
      if (plough) expect(crop.plough!.partIds).toEqual(crop.partIds);
      const required = plough ? crop.plough!.required : crop.required.dig;
      const byId = new Map(s.parts.map((p) => [p.id, p]));
      const spans = taskSpans(crop, byId, till, DAY);
      const readyEnd = spans.find((x) => x.id === 1)!.start;
      expect(remaining(), till).toBeCloseTo(readyEnd * required, 9);
      // po vyklučení všechna zbývající práce
      crop.done.reclaim = crop.required.reclaim;
      expect(remaining(), till).toBeCloseTo(required, 9);
    }
  });
});
