import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { fieldPartLooks, partsWorked, taskSpans } from '../field-progress';
import { bandLengthM, furrowAxis, furrowEfficiency, ploughLayout } from '../plough-blocks';
import { ploughDayFactor, plannedFurrowEfficiency, travelShare } from '../plough-trip';
import { FURROW, TEAM_TRAVEL } from '../rules';
import { advanceVillage } from '../simulate';
import type { FieldPart, VillageState } from '../types';
import { createCropWork, partsOfFields } from '../year-plan';
import { withBuiltFirstDwelling } from './village-fixtures';

// Co nejdelší brázda (oxen.md; Martin, 19. 10. 2026: „Volské spřežení chce rýt co nejdelší
// brázdu – otáčení zabírá čas a snižuje produktivitu.“ a „… snaží se zorat co největší souvislou
// plochu.“).

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
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    cell: { x, y },
    ...over,
  };
}

/** Obdélník w × h čtverců od (x0, y0); id od `first`. */
function rect(
  first: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  fieldId = 1,
): FieldPart[] {
  const parts: FieldPart[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) parts.push(part(first + y * w + x, x0 + x, y0 + y, { fieldId }));
  return parts;
}

describe('výkon podle délky brázdy', () => {
  it('krátká brázda víc obratů – jeden díl ≈ 0,44, referenční 1, dlouhá nejvýš +15 %', () => {
    const turnM = FURROW.speedMps * FURROW.turnS;
    expect(furrowEfficiency(FURROW.referenceM)).toBeCloseTo(1, 12);
    expect(furrowEfficiency(15)).toBeCloseTo(
      15 / (15 + turnM) / (FURROW.referenceM / (FURROW.referenceM + turnM)),
      12,
    );
    expect(furrowEfficiency(15)).toBeLessThan(0.5);
    expect(furrowEfficiency(45)).toBeGreaterThan(furrowEfficiency(30));
    expect(furrowEfficiency(1000)).toBe(FURROW.maxGain);
  });

  it('cesta k bloku a zpět ubírá den – po cestě 500 m pár procent, nejvýš polovinu', () => {
    expect(travelShare(0)).toBe(1);
    expect(travelShare(500)).toBeCloseTo(1 - 1000 / TEAM_TRAVEL.speedMps / TEAM_TRAVEL.dayS, 12);
    expect(travelShare(500)).toBeGreaterThan(0.9);
    expect(travelShare(1e6)).toBe(1 - TEAM_TRAVEL.maxShare);
  });
});

describe('bloky a pásy orby', () => {
  it('pole se orá podél delší strany – pás přes celou řadu dílů, od strany blíž vsi', () => {
    const parts = rect(1, 0, 0, 6, 2);
    expect(furrowAxis(parts)).toBe('x');
    const { order, bands } = ploughLayout(parts, partsOfFields(parts));
    expect(bands.map((b) => b.partIds)).toEqual([
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12],
    ]);
    expect(bands.every((b) => b.axis === 'x' && b.sweep === 1 && b.block === 0)).toBe(true);
    expect(order.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const byId = new Map(parts.map((p) => [p.id, p]));
    expect(bandLengthM(bands[0]!, byId)).toBeCloseTo(90, 9);
    // vyšší než širší – podél y; ves u pravého sloupce – pásy od něj
    const tall = rect(1, 0, 0, 2, 5).map((p) => ({ ...p, distanceM: 60 + 15 * (1 - p.cell!.x) }));
    const layout = ploughLayout(tall, partsOfFields(tall));
    expect(layout.bands[0]!.axis).toBe('y');
    expect(layout.bands[0]!.sweep).toBe(-1);
    expect(layout.bands[0]!.partIds).toEqual([2, 4, 6, 8, 10]);
  });

  it('bloky od nejbližšího; blok se zorá celý, než spřežení přejde jinam (U – rameno po rameni)', () => {
    // dva bloky jednoho pole: vzdálenější vlevo (x 0–2, y 4–5), bližší vpravo (x 5–7, y 0–1)
    const far = rect(100, 0, 4, 3, 2);
    const near = rect(200, 5, 0, 3, 2);
    const field = [...far, ...near];
    const { bands } = ploughLayout(field, partsOfFields(field));
    expect(bands.map((b) => b.block)).toEqual([0, 0, 1, 1]);
    expect(bands[0]!.partIds[0]).toBe(200);
    // U: dno y = 0 (x 0–4), ramena x 0 a x 4 (y 1–3)
    const u = [
      ...rect(1, 0, 0, 5, 1),
      ...[1, 2, 3].flatMap((y) => [part(10 + y, 0, y), part(20 + y, 4, y)]),
    ];
    const layout = ploughLayout(u, partsOfFields(u));
    expect(layout.bands.map((b) => b.partIds)).toEqual([
      [1, 2, 3, 4, 5],
      [11],
      [12],
      [13],
      [21],
      [22],
      [23],
    ]);
    // osa podle celého pole, ne jen vybraných dílů
    const strip = rect(1, 0, 0, 1, 4);
    const wide = [...strip, ...rect(50, 1, 0, 6, 1)];
    expect(ploughLayout(strip, partsOfFields(wide)).bands[0]!.axis).toBe('x');
  });

  it('díly pásu postupují spolu – stejná rozpracovanost, dnešní práce se dělí podle ploch', () => {
    const parts = rect(1, 0, 0, 4, 2);
    const byId = new Map(parts.map((p) => [p.id, p]));
    const work = createCropWork(parts, DAY, 0, true, undefined, 'spring', partsOfFields(parts));
    work.plough!.done = work.plough!.required * 0.25; // půlka prvního pásu
    const spans = taskSpans(work, byId, 'plough', DAY);
    expect(new Set(spans.slice(0, 4).map((s) => `${s.start}-${s.end}`)).size).toBe(1);
    expect(spans[0]!.share).toBeCloseTo(0.25, 9);
    const worked = partsWorked(work, byId, 'plough', DAY, 0, work.plough!.done);
    expect(worked.map((w) => w.id)).toEqual([1, 2, 3, 4]);
    expect(worked.reduce((sum, w) => sum + w.share, 0)).toBeCloseTo(1, 9);
    for (const w of worked) expect(w.to).toBeCloseTo(0.5, 9);
    // setí jde za orbou po stejných pásech
    expect(taskSpans(work, byId, 'sow', DAY)[3]!.end).toBeCloseTo(0.5, 9);
  });
});

describe('výkon spřežení za den', () => {
  function village(parts: FieldPart[]): VillageState {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: DAY - 10, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.lastDay = DAY - 1;
    s.fields = [{ id: 1 }, { id: 2 }];
    s.parts = parts;
    s.storesKg = 300;
    s.pens = [
      {
        id: 900,
        cell: { x: 30, y: 30 },
        x: 50,
        z: 60,
        builtDay: DAY - 800,
        team: { readyDay: DAY - 10 },
        training: null,
      },
    ];
    s.hay = { kg: 20_000, mowing: null };
    return s;
  }

  it('dlouhé brázdy zorají za den víc než stejná plocha po jednotlivých dílech', () => {
    const long = rect(1, 0, 0, 8, 2);
    const scattered = Array.from({ length: 16 }, (_, i) =>
      part(1 + i, (i % 4) * 2, Math.floor(i / 4) * 2),
    );
    const factor = (parts: FieldPart[]): number => {
      const s = village(parts);
      const byId = new Map(parts.map((p) => [p.id, p]));
      const work = createCropWork(parts, DAY, 0, true, undefined, 'spring', partsOfFields(parts));
      return ploughDayFactor(s, DAY, work, byId, null, null);
    };
    expect(factor(long) / factor(scattered)).toBeCloseTo(
      furrowEfficiency(120) / furrowEfficiency(15),
      9,
    );
    expect(factor(long)).toBeGreaterThan(2 * factor(scattered));
    // ves s dlouhým polem orá: plán orby jde po pásech a zorané díly pásu postupují spolu
    const s = advanceVillage(village(long), DAY + 3, null);
    const plan = s.plan!;
    const crop = plan.winter ?? plan;
    expect(crop.plough!.bands!.length).toBeGreaterThan(0);
    const looks = fieldPartLooks(s, s.lastDay);
    const band = crop.plough!.bands![0]!;
    const works = band.partIds.map((id) => looks.get(id)?.work ?? null);
    expect(new Set(works).size).toBe(1);
  });

  it('cesta se spočítá při začátku bloku a platí, dokud spřežení blok neopustí', () => {
    const parts = [
      ...rect(1, 0, 0, 4, 1),
      ...rect(50, 10, 0, 4, 1).map((p) => ({ ...p, distanceM: 600 })),
    ];
    const s = village(parts);
    const byId = new Map(parts.map((p) => [p.id, p]));
    const work = createCropWork(parts, DAY, 0, true, undefined, 'spring', partsOfFields(parts));
    s.plan = { plannedDay: DAY, ard: true, ...work };
    const first = ploughDayFactor(s, DAY, s.plan, byId, null, null);
    expect(s.plan.plough!.trip).toEqual({ block: 0, costM: 60 });
    expect(first).toBeCloseTo(furrowEfficiency(60) * travelShare(60), 12);
    // druhý blok – daleko od vsi
    s.plan.plough!.done = s.plan.plough!.required * 0.75;
    const second = ploughDayFactor(s, DAY, s.plan, byId, null, null);
    expect(s.plan.plough!.trip).toEqual({ block: 1, costM: 600 });
    expect(second).toBeLessThan(first);
  });

  it('plán osevu počítá s výkonem podle tvaru polí', () => {
    expect(plannedFurrowEfficiency(rect(1, 0, 0, 8, 2))).toBeCloseTo(furrowEfficiency(120), 12);
    const single = [part(1, 0, 0), part(2, 5, 5)];
    expect(plannedFurrowEfficiency(single)).toBeCloseTo(furrowEfficiency(15), 12);
  });
});
