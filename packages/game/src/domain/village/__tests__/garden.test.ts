import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import type { Landscape } from '../../landscape';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import {
  gardenBedAreaM2,
  gardenFertility,
  gardenLegumeKg,
  gardensSown,
  harvestGardens,
  withoutGardenFlax,
} from '../garden';
import { GARDEN, LEGUMES } from '../rules';
import { advanceVillage } from '../simulate';
import type { ChronicleEvent, Dwelling, PlotVariant, VillageState } from '../types';
import { cropGrossPerHa } from '../year-plan';
import { withThreshingFloor } from './village-fixtures';

// Zahrádka u obydlí (fields.md – Zahrádka u obydlí; Martin 9. 11. 2026): domácnost na pozemku
// polozemnice pěstuje luštěniny; len je od večera 9. 11. 2026 zpět na poli („Tak změna. … takže se
// bude pěstovat na polích“ – flax.test.ts) – zahrádka dává jen luštěniny z celých záhonů; zemnice
// zahrádku nemá.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const NO_WEATHER = 1;
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

describe('úroda zahrádky – luštěniny z celých záhonů', () => {
  const legumeNetPerM2 = (f: number): number =>
    (cropGrossPerHa('legume', f) - LEGUMES.seedKgPerHa) / M2_PER_HA;

  const BED = 190;

  it('celé záhony luštěniny (čisté – osivo si domácnost nechá)', () => {
    expect(gardenLegumeKg(BED, 70, NO_WEATHER)).toBeCloseTo(BED * legumeNetPerM2(70), 9);
    // ≈ 195 m² hnojených záhonů (úrodnost 70) ≈ 6,8 kg čistých luštěnin
    expect(gardenLegumeKg(195, 70, NO_WEATHER)).toBeCloseTo(6.8, 1);
  });

  it('úrodnější políčko dá víc; počasí kraje ubere úrodu', () => {
    expect(gardenLegumeKg(BED, 90, NO_WEATHER)).toBeGreaterThan(
      gardenLegumeKg(BED, 70, NO_WEATHER),
    );
    const net = Math.max(0, cropGrossPerHa('legume', 70) * 0.5 - LEGUMES.seedKgPerHa) / M2_PER_HA;
    expect(gardenLegumeKg(BED, 70, 0.5)).toBeCloseTo(BED * net, 9);
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
  it('polozemnice s pozemkem sklidí jen luštěniny – do zásoby, souhrn do kroniky; len ne', () => {
    const s = advanceVillage(withHomestead(), at(600, 7, 30), null);
    const day = at(600, 7, 31);
    const legumesBefore = s.legumesKg ?? 0;
    const linenBefore = s.linen;
    harvestGardens(s, day, fertileLandscape(70));
    const expected = gardenLegumeKg(gardenBedAreaM2(s.dwellings[0]!), 70, NO_WEATHER);
    expect(s.legumesKg! - legumesBefore).toBeCloseTo(expected, 9);
    expect(s.dwellings[0]!.garden).toEqual({ legumeKg: Math.round(expected) });
    expect(gardenEvents(s)).toEqual([
      { day, kind: 'garden-harvest', legumeKg: Math.round(expected) },
    ]);
    expect(s.linen).toBe(linenBefore);
  });

  it('zemnice pozemek nemá – zahrádku nemá, ves nic nesklidí a do kroniky nic', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 7, 30), null);
    expect(s.dwellings.every((d) => d.plot === undefined)).toBe(true);
    const legumes = s.legumesKg;
    harvestGardens(s, at(600, 7, 31), null);
    expect(s.legumesKg).toBe(legumes);
    expect(gardenEvents(s)).toEqual([]);
    expect(s.dwellings.some((d) => d.garden !== undefined)).toBe(false);
  });

  it('prázdné obydlí s pozemkem nesklízí (a starý zápis zahrádky zmizí)', () => {
    const s = advanceVillage(withHomestead(), at(600, 7, 30), null);
    const home = s.dwellings[0]!;
    home.garden = { legumeKg: 1 };
    for (const p of s.people) p.dwellingId = home.id + 1000;
    harvestGardens(s, at(600, 7, 31), null);
    expect(home.garden).toBeUndefined();
    expect(gardenEvents(s)).toEqual([]);
  });

  it('ves založená po konci setí (30. 4.) letos zahrádky neosela', () => {
    expect(gardensSown({ foundedDay: at(600, 4, 30) }, at(600, 7, 31))).toBe(true);
    expect(gardensSown({ foundedDay: at(600, 5, 1) }, at(600, 7, 31))).toBe(false);
    expect(gardensSown({ foundedDay: at(600, 5, 1) }, at(601, 7, 31))).toBe(true);
  });

  it('ves s polozemnicí: 31. 7. luštěniny do zásoby, oděv ze zahrádky ne (len je na poli)', () => {
    const s = advanceVillage(withHomestead(), at(600, 8, 1), null);
    const [event] = gardenEvents(s);
    expect(event).toBeDefined();
    expect(event!.legumeKg).toBeGreaterThan(0);
    expect(event!.flaxKg).toBeUndefined();
    // ves založená během roku (plán bez potřeby lnu) oděv nezapíše
    expect(s.linen).toBeUndefined();
    expect(s.chronicle.some((e) => e.kind === 'linen-short')).toBe(false);
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním (2 roky)', () => {
    const start = withHomestead();
    const whole = advanceVillage(start, at(602, 9, 2), null);
    let chunked = start;
    for (const day of [
      at(600, 7, 30),
      at(600, 7, 31),
      at(601, 5, 1),
      at(602, 8, 31),
      at(602, 9, 2),
    ]) {
      chunked = JSON.parse(JSON.stringify(advanceVillage(chunked, day, null))) as VillageState;
    }
    expect(chunked).toEqual(JSON.parse(JSON.stringify(whole)));
    expect(gardenEvents(whole).length).toBe(3);
  });
});

describe('převod – zahrádka z doby lnu na zahrádkách', () => {
  it('zápis zahrádky ztratí len, luštěniny zůstanou; vstup nemění, idempotentní', () => {
    const s = advanceVillage(withHomestead(), at(600, 8, 1), null);
    const legacy = structuredClone(s);
    (legacy.dwellings[0] as Dwelling & { garden: { flaxKg?: number } }).garden = {
      flaxKg: 7,
      legumeKg: 3,
    };
    const copy = structuredClone(legacy);
    const converted = withoutGardenFlax(legacy);
    expect(legacy).toEqual(copy);
    expect(converted.dwellings[0]!.garden).toEqual({ legumeKg: 3 });
    expect(withoutGardenFlax(converted)).toBe(converted);
    expect(withoutGardenFlax(s)).toBe(s);
    // převod při načtení – dál se simuluje bez lnu na zahrádce
    const next = advanceVillage(legacy, at(600, 8, 2), null);
    expect(next.dwellings[0]!.garden).toEqual({ legumeKg: 3 });
  });

  it('plán z doby zahrádek (bez potřeby lnu) len nevybírá a oděv nezapíše – podíl zůstává', () => {
    // 1. 9. 600: díly po ozimu ves ještě nemá – len zatím nikde
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 9, 1), null);
    expect(s.season!.crops.some((c) => c.crop === 'flax')).toBe(false);
    const legacy = structuredClone(s);
    delete legacy.season!.flaxNeedKg;
    legacy.linen = 0.6;
    const after = advanceVillage(legacy, at(601, 9, 2), null);
    expect(after.chronicle.some((e) => e.kind === 'harvest' && e.crop === 'flax')).toBe(false);
    expect(after.chronicle.some((e) => e.kind === 'linen-short' && e.day > legacy.lastDay)).toBe(
      false,
    );
    expect(after.linen).toBe(0.6);
    // od 1. 9. plán s potřebou – len zase na poli
    expect(after.season!.flaxNeedKg).toBeGreaterThan(0);
  });
});
