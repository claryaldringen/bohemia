import { describe, it, expect } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import {
  APPLE_ROT_DAY,
  CROP_WINDOWS,
  DWELLINGS,
  FIELD_WORK_PER_HA,
  FLAX_WORK_PER_HA,
  LEGUME_WORK_PER_HA,
  HARVEST_DAY,
  HARVEST_THRESH_WINDOWS,
  LATE_HARVEST_DAY,
  LEGUME_WINDOWS,
  ORCHARD_PLANTING_WINDOWS,
  ORCHARD_SEASON,
  ORCHARD_WINDOWS,
  PLANNING_DAY,
  THRESH_END_DAY,
  WINDOWS,
  WINTER_HARVEST_DAY,
  WINTER_WINDOWS,
  WINTER_WORK_PER_HA,
  childDeathsPerYear,
} from '../rules';
import { seasonBounds } from '../orchard';

describe('pravidla obyvatelstva', () => {
  it('zemnice pojme 6 lidí', () => {
    expect(DWELLINGS.zemnice.capacity).toBe(6);
  });

  it('roční úmrtnost dětí odpovídá 40 % do dospělosti', () => {
    // 1 − 0,6^(1/14) ≈ 0,03583
    expect(childDeathsPerYear()).toBeCloseTo(0.03583, 4);
  });
});

describe('data polního roku souhlasí s okny prací', () => {
  const inWindow = (task: keyof typeof WINDOWS, month: number): boolean =>
    WINDOWS[task].some(([from, to]) => month >= from && month <= to);

  it('sklizeň jaře 31. 8. je poslední den prvního měsíce jejího okna, 30. 9. poslední den okna; plán osevu den po 31. 8. (fields.md – Žeň jaře i v září)', () => {
    const harvest = dayIndexOf({ year: 601, ...HARVEST_DAY });
    expect(inWindow('harvest', HARVEST_DAY.month)).toBe(true);
    const next = dateOfDayIndex(harvest + 1);
    expect(next.month).toBe(HARVEST_DAY.month + 1);
    expect({ month: next.month, day: next.day }).toEqual(PLANNING_DAY);
    const late = dayIndexOf({ year: 601, ...LATE_HARVEST_DAY });
    expect(inWindow('harvest', LATE_HARVEST_DAY.month)).toBe(true);
    expect(inWindow('harvest', dateOfDayIndex(late + 1).month)).toBe(false);
    expect(LATE_HARVEST_DAY.month).toBe(HARVEST_DAY.month + 1);
  });

  it('červencová žeň ozimu je poslední den prvního měsíce jeho okna, okno končí sklizní jaře (fields.md – Žně i v srpnu), setí ozimu končí před koncem podzimu jaře', () => {
    const inWinter = (task: keyof typeof WINTER_WINDOWS, month: number): boolean =>
      WINTER_WINDOWS[task].some(([from, to]) => month >= from && month <= to);
    const july = dayIndexOf({ year: 601, ...WINTER_HARVEST_DAY });
    expect(WINTER_WINDOWS.harvest[0]![0]).toBe(WINTER_HARVEST_DAY.month);
    expect(dateOfDayIndex(july + 1).day).toBe(1);
    // srpen je ještě v okně – žne se, co červenec nestihl; okno končí s žní jaře
    expect(inWinter('harvest', dateOfDayIndex(july + 1).month)).toBe(true);
    const harvest = dayIndexOf({ year: 601, ...HARVEST_DAY });
    expect(inWinter('harvest', HARVEST_DAY.month)).toBe(true);
    expect(inWinter('harvest', dateOfDayIndex(harvest + 1).month)).toBe(false);
    expect(WINTER_HARVEST_DAY.month).toBeLessThan(HARVEST_DAY.month);
    expect(CROP_WINDOWS.legume.harvest).toEqual(WINTER_WINDOWS.harvest);
    // len se trhá jen v srpnu (fields.md – Len, Martin 9. 11. 2026 večer)
    expect(CROP_WINDOWS.flax.harvest).toEqual([[HARVEST_DAY.month, HARVEST_DAY.month]]);
    const sowEnd = Math.max(...WINTER_WINDOWS.sow.map(([, to]) => to));
    expect(sowEnd).toBeLessThan(Math.max(...WINDOWS.dig.filter(([f]) => f >= 9).map(([, t]) => t)));
  });

  it('pleje se jednou a rychle – jař, luštěniny a len v květnu, ozim vůbec (fields.md – Pletí jednou a rychle)', () => {
    expect(CROP_WINDOWS.winter.weed).toEqual([]);
    expect(WINTER_WORK_PER_HA.weed).toEqual({ worst: 0, best: 0 });
    for (const crop of ['spring', 'legume', 'flax'] as const) {
      expect(CROP_WINDOWS[crop].weed).toEqual([[5, 5]]);
    }
    // v červnu (1. seč) se už neplete
    for (const crop of ['winter', 'spring', 'legume', 'flax'] as const) {
      expect(CROP_WINDOWS[crop].weed.some(([from, to]) => 6 >= from && 6 <= to)).toBe(false);
    }
  });

  it('sazba pletí: obilí 8 / 5, luštěniny a len 10 / 6 člověkodní na hektar', () => {
    expect(FIELD_WORK_PER_HA.weed).toEqual({ worst: 8, best: 5 });
    expect(LEGUME_WORK_PER_HA.weed).toEqual({ worst: 10, best: 6 });
    expect(FLAX_WORK_PER_HA.weed).toEqual({ worst: 10, best: 6 });
  });

  it('výmlat hned po žni – měsíc po sklizni plodiny (production-chains.md – Výmlat hned po žni)', () => {
    // žňový výmlat = okno žně posunuté o měsíc: červencová žeň ozimu a luštěnin v srpnu, srpnová
    // (i jaře) v září (fields.md – Žně i v srpnu)
    const after = (harvest: readonly (readonly [number, number])[]): [number, number][] =>
      harvest.map(([from, to]) => [from + 1, to + 1]);
    expect(HARVEST_THRESH_WINDOWS.winter).toEqual(after(WINTER_WINDOWS.harvest));
    expect(HARVEST_THRESH_WINDOWS.spring).toEqual(after(WINDOWS.harvest));
    expect(HARVEST_THRESH_WINDOWS.legume).toEqual(after(LEGUME_WINDOWS.harvest));
    expect(HARVEST_THRESH_WINDOWS.winter[0]![0]).toBe(WINTER_HARVEST_DAY.month + 1);
    expect(HARVEST_THRESH_WINDOWS.spring).toEqual([
      [HARVEST_DAY.month + 1, LATE_HARVEST_DAY.month + 1],
    ]);
  });

  it('okno výmlatu začíná žňovým výmlatem a běží do konce února (fields.md – Pořadí důležitosti polních prací a výmlat do zimy)', () => {
    for (const windows of [WINTER_WINDOWS, WINDOWS, LEGUME_WINDOWS]) {
      expect(windows.thresh).toEqual([
        [windows.harvest[0]![0] + 1, 12],
        [1, 2],
      ]);
    }
  });

  it('plán u výmlatu se zahodí den po žňovém výmlatu jaře', () => {
    const before = dateOfDayIndex(dayIndexOf({ year: 601, ...THRESH_END_DAY }) - 1);
    const harvestThresh = (month: number): boolean =>
      HARVEST_THRESH_WINDOWS.spring.some(([from, to]) => month >= from && month <= to);
    expect(harvestThresh(before.month)).toBe(true);
    expect(harvestThresh(THRESH_END_DAY.month)).toBe(false);
    expect(inWindow('thresh', THRESH_END_DAY.month)).toBe(true);
    expect(THRESH_END_DAY.day).toBe(1);
  });
});

describe('data roku sadu souhlasí s okny prací (orchard.md)', () => {
  it('sklizeň jablek začíná po sklizni obilí, péče končí, když jablka shnijí a začíná rok sadu', () => {
    const harvest = seasonBounds(ORCHARD_WINDOWS.harvest);
    expect(harvest).toEqual({ start: PLANNING_DAY, end: { month: 11, day: 1 } });
    const care = seasonBounds(ORCHARD_WINDOWS.care);
    expect(care).toEqual({ start: { month: 12, day: 1 }, end: APPLE_ROT_DAY });
    expect(APPLE_ROT_DAY).toEqual({ month: ORCHARD_SEASON.startMonth, day: 1 });
  });

  it('podzimní výsadba (roste až od jara) začíná podzimním oknem výsadby', () => {
    expect(ORCHARD_PLANTING_WINDOWS.map(([from]) => from)).toContain(
      ORCHARD_SEASON.autumnPlantingFromMonth,
    );
    expect(ORCHARD_PLANTING_WINDOWS.map(([from]) => from)).toContain(ORCHARD_SEASON.startMonth);
  });
});
