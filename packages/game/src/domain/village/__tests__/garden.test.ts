import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import type { Landscape } from '../../landscape';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { withoutFieldFlax } from '../field-legumes';
import { flaxNeedKg, harvestFlax } from '../flax';
import {
  gardenBedAreaM2,
  gardenFertility,
  gardenYield,
  gardensSown,
  harvestGardens,
} from '../garden';
import { moveParts } from '../land-taken';
import { NO_CRAFTS } from '../productivity';
import { GARDEN, LEGUMES } from '../rules';
import { advanceVillage } from '../simulate';
import type { ChronicleEvent, PlotVariant, SeasonCrop, VillageState } from '../types';
import {
  createCropWork,
  cropGrossPerHa,
  nearestFirst,
  putSeasonCrop,
  seasonCrop,
  seasonCrops,
  springCrop,
} from '../year-plan';
import { withThreshingFloor } from './village-fixtures';

// Zahrádka u obydlí (fields.md – Zahrádka u obydlí; Martin 9. 11. 2026): len z polí vyřazený,
// domácnost na pozemku polozemnice pěstuje napřed len na oděv a na zbytku luštěniny; zemnice
// zahrádku nemá.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const NO_WEATHER = { flax: 1, legume: 1 } as const;
const M2_PER_HA = 10_000;

const bigField = (count = 180): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((100 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

const found = (day: number): VillageState =>
  withThreshingFloor(
    foundVillage({
      seed: 7,
      day,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        parts: bigField(),
      },
    }),
  );

/** Ves založená 1. 3. 600, jejíž zemnice je od 15. 7. polozemnice na pozemku (políčko 10, 10). */
function withHomestead(): VillageState {
  const s = structuredClone(advanceVillage(found(at(600, 3, 1)), at(600, 7, 15), null));
  const home = s.dwellings[0]!;
  home.type = 'polozemnice';
  home.plot = { cell: { x: 10, y: 10 }, variant: 'center' };
  return s;
}

/** Krajina jen s úrodností políček (zbytek garden.ts nečte). */
function fertileLandscape(fertility: number): Landscape {
  return { size: 20, fertility: new Uint8Array(400).fill(fertility) } as unknown as Landscape;
}

type GardenEvent = Extract<ChronicleEvent, { kind: 'garden-harvest' }>;
const gardenEvents = (s: VillageState): GardenEvent[] =>
  s.chronicle.filter((e): e is GardenEvent => e.kind === 'garden-harvest');

describe('úroda zahrádky – napřed len na oděv domácnosti, na zbytku luštěniny', () => {
  const flaxPerM2 = (f: number): number => cropGrossPerHa('flax', f) / M2_PER_HA;
  const legumeNetPerM2 = (f: number): number =>
    (cropGrossPerHa('legume', f) - LEGUMES.seedKgPerHa) / M2_PER_HA;

  const BED = 190;

  it('bez potřeby lnu jsou celé záhony luštěniny (čisté – osivo si domácnost nechá)', () => {
    const y = gardenYield(BED, 0, 70, NO_WEATHER);
    expect(y.flaxKg).toBe(0);
    expect(y.legumeKg).toBeCloseTo(BED * legumeNetPerM2(70), 9);
  });

  it('malá potřeba: len přesně na ni, luštěniny na zbytku plochy', () => {
    const y = gardenYield(BED, 3, 70, NO_WEATHER);
    expect(y.flaxKg).toBeCloseTo(3, 9);
    const flaxArea = 3 / flaxPerM2(70);
    expect(y.legumeKg).toBeCloseTo((BED - flaxArea) * legumeNetPerM2(70), 9);
  });

  it('velká domácnost: celé záhony lnem, zbytek lnu chybí a luštěniny nic', () => {
    const y = gardenYield(BED, 100, 70, NO_WEATHER);
    expect(y.flaxKg).toBeCloseTo(BED * flaxPerM2(70), 9);
    expect(y.legumeKg).toBe(0);
    // ≈ 195 m² hnojených záhonů (úrodnost 70) ≈ 8,8 kg lnu – oděv pro ≈ 4 dospělé
    expect(gardenYield(195, 100, 70, NO_WEATHER).flaxKg).toBeCloseTo(8.8, 1);
  });

  it('úrodnější políčko dá víc; počasí kraje ubere úrodu (plocha lnu podle potřeby bez počasí)', () => {
    expect(gardenYield(BED, 0, 90, NO_WEATHER).legumeKg).toBeGreaterThan(
      gardenYield(BED, 0, 70, NO_WEATHER).legumeKg,
    );
    const dry = gardenYield(BED, 3, 70, { flax: 0.5, legume: 0.5 });
    expect(dry.flaxKg).toBeCloseTo(1.5, 9);
    const legumeArea = BED - 3 / flaxPerM2(70);
    const net = Math.max(0, cropGrossPerHa('legume', 70) * 0.5 - LEGUMES.seedKgPerHa) / M2_PER_HA;
    expect(dry.legumeKg).toBeCloseTo(legumeArea * net, 9);
  });

  it('záhony hnojí domácnost: přirozená úrodnost políčka, nejméně 70; bez krajiny 70', () => {
    const plot = { cell: { x: 3, y: 2 }, variant: 'center' as const };
    const land = fertileLandscape(40);
    expect(gardenFertility(plot, land)).toBe(GARDEN.manuredFertility);
    land.fertility[2 * 20 + 3] = 85;
    expect(gardenFertility(plot, land)).toBe(85);
    expect(gardenFertility(plot, null)).toBe(GARDEN.manuredFertility);
    expect(GARDEN.manuredFertility).toBe(70);
  });

  it('plocha záhonů: políčko bez půdorysu domu a cestičky k brance (podle varianty a druhu)', () => {
    const at0 = { x: 0, z: 0, rotation: Math.PI };
    const house = (variant: PlotVariant): number =>
      gardenBedAreaM2({
        type: 'polozemnice',
        position: at0,
        plot: { cell: { x: 0, y: 0 }, variant },
        plainShape: true,
      });
    // polozemnice 5 × 5 m, cestička 1 m: uprostřed 7,5 − 2,5 = 5 m, vpředu 2,7 m, vzadu 8,2 m
    expect(house('center')).toBeCloseTo(225 - 25 - 5, 9);
    expect(house('front-left')).toBeCloseTo(225 - 25 - 2.7, 9);
    expect(house('back-right')).toBeCloseTo(225 - 25 - 8.2, 9);
    // dvorec 6 × 9,6 m vchodem ke dvoru – záhony jen na políčku domu
    const manor = gardenBedAreaM2({
      type: 'dvorec',
      position: at0,
      plot: { cell: { x: 0, y: 0 }, variant: 'center', yard: { x: 0, y: 1 } },
    });
    expect(manor).toBeCloseTo(225 - 57.6 - 2.7, 9);
    expect(gardenBedAreaM2({ type: 'zemnice', position: at0 })).toBe(0);
    // varianta rozměrů domu (±10 % plochy) plochu záhonů mírně mění
    const shaped = gardenBedAreaM2({
      type: 'polozemnice',
      position: { x: 12.3, z: -4.1, rotation: Math.PI },
      plot: { cell: { x: 0, y: 0 }, variant: 'center' },
    });
    expect(Math.abs(shaped - house('center'))).toBeLessThan(5);
  });
});

describe('sklizeň zahrádek 31. 7.', () => {
  it('polozemnice s pozemkem sklidí len a luštěniny; luštěniny do zásoby, souhrn do kroniky', () => {
    const s = advanceVillage(withHomestead(), at(600, 7, 30), null);
    const day = at(600, 7, 31);
    const legumesBefore = s.legumesKg ?? 0;
    const flax = harvestGardens(s, day, fertileLandscape(70))!;
    const need = flaxNeedKg(s, day);
    const expected = gardenYield(gardenBedAreaM2(s.dwellings[0]!), need, 70, NO_WEATHER);
    expect(flax).toBeCloseTo(expected.flaxKg, 9);
    expect(s.legumesKg! - legumesBefore).toBeCloseTo(expected.legumeKg, 9);
    expect(s.dwellings[0]!.garden).toEqual({
      flaxKg: Math.round(expected.flaxKg),
      legumeKg: Math.round(expected.legumeKg),
    });
    expect(gardenEvents(s)).toEqual([
      {
        day,
        kind: 'garden-harvest',
        flaxKg: Math.round(expected.flaxKg),
        legumeKg: Math.round(expected.legumeKg),
      },
    ]);
  });

  it('zemnice pozemek nemá – zahrádku nemá, ves nic nesklidí a do kroniky nic', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 7, 30), null);
    expect(s.dwellings.every((d) => d.plot === undefined)).toBe(true);
    expect(harvestGardens(s, at(600, 7, 31), null)).toBe(0);
    expect(gardenEvents(s)).toEqual([]);
    expect(s.dwellings.some((d) => d.garden !== undefined)).toBe(false);
  });

  it('prázdné obydlí s pozemkem nesklízí (a starý zápis zahrádky zmizí)', () => {
    const s = advanceVillage(withHomestead(), at(600, 7, 30), null);
    const home = s.dwellings[0]!;
    home.garden = { flaxKg: 1, legumeKg: 1 };
    for (const p of s.people) p.dwellingId = home.id + 1000;
    expect(harvestGardens(s, at(600, 7, 31), null)).toBe(0);
    expect(home.garden).toBeUndefined();
  });

  it('ves založená po konci setí (30. 4.) letos zahrádky neosela – oděv nezapíše', () => {
    expect(gardensSown({ foundedDay: at(600, 4, 30) }, at(600, 7, 31))).toBe(true);
    expect(gardensSown({ foundedDay: at(600, 5, 1) }, at(600, 7, 31))).toBe(false);
    expect(gardensSown({ foundedDay: at(600, 5, 1) }, at(601, 7, 31))).toBe(true);
    const late = advanceVillage(found(at(600, 5, 1)), at(600, 8, 1), null);
    expect(late.linen).toBeUndefined();
    expect(late.chronicle.some((e) => e.kind === 'linen-short')).toBe(false);
  });
});

describe('oděv ze lnu zahrádek', () => {
  it('len zahrádek na celou potřebu – oděv celý, bez upozornění', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 7, 31), null);
    const need = flaxNeedKg(s, s.lastDay);
    expect(harvestFlax(s, s.lastDay, false, need)).toBeNull();
    expect(s.linen).toBe(1);
  });

  it('lnu ze zahrádek málo – podíl oděvu a upozornění do kroniky', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 7, 31), null);
    const need = flaxNeedKg(s, s.lastDay);
    const event = harvestFlax(s, s.lastDay, false, need / 4);
    expect(s.linen).toBeCloseTo(0.25, 9);
    expect(event).toEqual({
      day: s.lastDay,
      kind: 'linen-short',
      kg: Math.round(need / 4),
      neededKg: Math.round(need),
    });
  });

  it('ves jen se zemnicemi lnu nemá – podíl 0 a „Chybí len“', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 8, 1), null);
    expect(s.linen).toBe(0);
    expect(s.chronicle.some((e) => e.kind === 'linen-short')).toBe(true);
  });

  it('ves s polozemnicí: 31. 7. len ze zahrádky na oděv, luštěniny do zásoby', () => {
    const s = advanceVillage(withHomestead(), at(600, 8, 1), null);
    const [event] = gardenEvents(s);
    expect(event).toBeDefined();
    expect(event!.flaxKg).toBeGreaterThan(0);
    const need = flaxNeedKg(s, at(600, 7, 31));
    expect(s.linen).toBeCloseTo(
      Math.min(
        1,
        gardenYield(gardenBedAreaM2(s.dwellings[0]!), need, GARDEN.manuredFertility, NO_WEATHER)
          .flaxKg / need,
      ),
      6,
    );
  });
});

describe('len z polí vyřazený (Martin 9. 11. 2026)', () => {
  it('výběr dílů len nepřidělí – 3 roky bez dílu lnu', () => {
    const s = advanceVillage(withHomestead(), at(603, 3, 1), null);
    expect(s.parts.some((p) => p.crop === 'flax')).toBe(false);
    expect(s.chronicle.some((e) => e.kind === 'harvest' && e.crop === 'flax')).toBe(false);
    expect(gardenEvents(s).length).toBe(3);
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním (2 roky)', () => {
    const start = withHomestead();
    const whole = advanceVillage(start, at(602, 8, 1), null);
    let chunked = start;
    for (const day of [at(600, 7, 30), at(600, 7, 31), at(601, 5, 1), at(602, 8, 1)]) {
      chunked = JSON.parse(JSON.stringify(advanceVillage(chunked, day, null))) as VillageState;
    }
    expect(chunked).toEqual(JSON.parse(JSON.stringify(whole)));
    expect(gardenEvents(whole).length).toBe(3);
  });
});

/**
 * Starší ves s lnem v plánu (před 9. 11. 2026): prvních `count` dílů jaře přejde do lnu i s hotovou
 * přípravou půdy; se `sown` je len zasetý.
 */
function withLegacyFlax(s: VillageState, count: number, sown = false): VillageState {
  const next = structuredClone(s);
  const season = next.season!;
  const spring = springCrop(season);
  const day = next.lastDay;
  const plough = spring.plough !== undefined;
  const flax: SeasonCrop = {
    crop: 'flax',
    ...createCropWork([], day, NO_CRAFTS.tools, plough, nearestFirst, 'flax'),
  };
  putSeasonCrop(season, flax);
  const ids = spring.partIds.slice(0, count);
  moveParts(next, season, spring, flax, ids, day, NO_CRAFTS.tools);
  for (const p of next.parts) if (ids.includes(p.id)) p.crop = 'flax';
  if (sown) {
    for (const task of ['reclaim', 'dig', 'sow'] as const) flax.done[task] = flax.required[task];
    if (flax.plough) flax.plough.done = flax.plough.required;
  }
  return next;
}

const doneOf = (s: VillageState, task: 'dig' | 'reclaim'): number =>
  seasonCrops(s.season!).reduce((sum, c) => sum + c.work.done[task], 0);

describe('převod – len na poli starších vsí', () => {
  it('nezasetý díl lnu přejde do jaře i s přípravou půdy; vstup nemění, idempotentní', () => {
    const planned = advanceVillage(found(at(600, 3, 1)), at(601, 11, 30), null);
    const legacy = withLegacyFlax(planned, 3);
    const flax = seasonCrop(legacy.season, 'flax')!;
    expect(flax.partIds).toHaveLength(3);
    const dig = doneOf(legacy, 'dig');
    const copy = structuredClone(legacy);
    const converted = withoutFieldFlax(legacy);
    expect(legacy).toEqual(copy);
    expect(seasonCrop(converted.season, 'flax')).toBeUndefined();
    const spring = seasonCrop(converted.season, 'spring')!;
    expect(flax.partIds.every((id) => spring.partIds.includes(id))).toBe(true);
    const byId = new Map(converted.parts.map((p) => [p.id, p]));
    expect(flax.partIds.every((id) => byId.get(id)?.crop === 'spring')).toBe(true);
    expect(doneOf(converted, 'dig')).toBeCloseTo(dig, 6);
    expect(withoutFieldFlax(converted)).toBe(converted);
    const next = advanceVillage(legacy, at(602, 9, 2), null);
    expect(next.chronicle.some((e) => e.kind === 'harvest' && e.crop === 'flax')).toBe(false);
  });

  it('výběr dílů z paměti se lnem propadne', () => {
    const planned = advanceVillage(found(at(600, 3, 1)), at(601, 3, 10), null);
    const legacy = structuredClone(planned);
    const id = legacy.parts.find((p) => p.state !== 'sown')?.id ?? 0;
    legacy.season!.selection = { window: 'x', waiting: [{ id, crop: 'flax' }] };
    expect(withoutFieldFlax(legacy).season!.selection).toBeUndefined();
  });

  it('zasetý len starší vsi doroste, vytrhá se a přičte se k oděvu', () => {
    const spring = advanceVillage(found(at(600, 3, 1)), at(602, 5, 10), null);
    const legacy = withLegacyFlax(spring, 4, true);
    expect(withoutFieldFlax(legacy)).toBe(legacy);
    const pulled = advanceVillage(legacy, at(602, 9, 2), null);
    const flax = pulled.threshingSeason ? seasonCrop(pulled.threshingSeason, 'flax') : undefined;
    expect(flax?.harvestedKg).toBeGreaterThan(0);
    // ves jen se zemnicí – len je jen z pole
    const need = flaxNeedKg(pulled, at(602, 7, 31));
    expect(pulled.linen).toBeGreaterThan(0);
    expect(pulled.linen).toBeLessThanOrEqual(Math.min(1, flax!.harvestedKg! / need) + 1e-6);
  });
});
