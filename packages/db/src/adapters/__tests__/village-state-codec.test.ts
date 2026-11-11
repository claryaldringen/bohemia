import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { advanceVillage, dayIndexOf, foundVillage, type VillageState } from '@bohemia/game';
import { LAND, decodeVillageState, encodeVillageState } from '../village-state-codec';

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });

const village = (): VillageState =>
  foundVillage({
    seed: 7,
    day: DAY,
    dwellingPosition: { x: -50.25, z: 12.125, rotation: 0.3 },
    firstField: {
      outline: [
        [0, 0],
        [40, 0],
        [40, 40],
      ],
      parts: Array.from({ length: 12 }, (_, i) => ({
        areaM2: 133.333333,
        distanceM: 40 + i * 3.7,
        naturalFertility: 61,
        surface: 'meadow' as const,
        obstacleCost: 0,
        cell: { x: 60 + i, y: 64 },
      })),
    },
  });

const roundTrip = (state: VillageState): VillageState => {
  const encoded = encodeVillageState(state);
  return decodeVillageState(encoded.day, encoded.land());
};

/** Libovolný objekt jako stav – kodek tvar stavu nezná, jen klíče země. */
const asState = (value: Record<string, unknown>): VillageState => value as unknown as VillageState;

const landJson = (state: VillageState): Record<string, unknown> =>
  JSON.parse(zstdDecompressSync(encodeVillageState(state).land()).toString('utf8')) as Record<
    string,
    unknown
  >;

describe('kodek stavu vsi', () => {
  it('vrátí tentýž JSON včetně pořadí klíčů – i rozdělených `roads`', () => {
    const state = asState({
      zeta: 1,
      parts: [{ id: 2, cell: { x: 1, y: 2 } }],
      alpha: { b: 1, a: 2 },
      roads: { wear: [3], earthworks: [{ x: 1 }], labor: { m: 1 }, roads: [], nextId: 4 },
      clearedObstacles: ['a', 'b'],
      lastDay: 9,
      nil: null,
    });
    const back = roundTrip(state);
    expect(JSON.stringify(back)).toBe(JSON.stringify(state));
    expect(Object.keys(back)).toEqual(Object.keys(state));
    expect(Object.keys(back.roads as object)).toEqual([
      'wear',
      'earthworks',
      'labor',
      'roads',
      'nextId',
    ]);
  });

  it('zem nese jen klíče země a vyjmenované podklíče – i o dvě úrovně níž', () => {
    const state = asState({
      parts: [1],
      felledTrees: [2],
      roads: { wear: [3], earthworks: [4] },
      wildlife: { deer: 1, damage: { risk: [5], parts: { 7: { kg: 1 } } } },
      lastDay: 9,
    });
    expect(landJson(state)).toEqual({
      parts: [1],
      felledTrees: [2],
      roads: { earthworks: [4] },
      wildlife: { damage: { risk: [5] } },
    });
    expect(JSON.stringify(roundTrip(state))).toBe(JSON.stringify(state));
    expect(LAND).not.toHaveProperty('lastDay');
    expect(LAND.roads).not.toHaveProperty('wear');
  });

  it('klíče s undefined vynechá jako JSON.stringify; `roads` jiného tvaru jde do dne celé', () => {
    const state = asState({ a: undefined, parts: undefined, roads: [1, 2], b: 2 });
    const back = roundTrip(state);
    expect(JSON.stringify(back)).toBe(JSON.stringify(state));
    expect(Object.keys(back)).toEqual(['roads', 'b']);
    expect(roundTrip(asState({ roads: null, lastDay: 1 }))).toEqual({ roads: null, lastDay: 1 });
  });

  it('otisk země se nezmění, když se změní jen den, a změní se se zemí', () => {
    const state = village();
    const next = advanceVillage(state, DAY + 3, null);
    const hash = (s: VillageState): string => encodeVillageState(s).landHash;
    expect(hash({ ...state, lastDay: state.lastDay + 1, storesKg: 1 })).toBe(hash(state));
    expect(hash({ ...state, parts: state.parts.slice(1) })).not.toBe(hash(state));
    expect(JSON.stringify(roundTrip(next))).toBe(JSON.stringify(next));
  });

  it('chybějící zem nebo neznámý formát je chyba, ne jiný stav', () => {
    const encoded = encodeVillageState(village());
    expect(() => decodeVillageState(encoded.day, null)).toThrow(/chybí klíč parts/);
    expect(() => decodeVillageState(encoded.land(), encoded.land())).toThrow(/formát/);
  });

  // Stavy všech vsí z vývojové databáze (jen čtení): psql -Atc "select state from village" > soubor;
  // VILLAGE_STATES_FILE=soubor npx vitest run village-state-codec
  const file = process.env.VILLAGE_STATES_FILE;
  it.runIf(file)('round-trip bajt po bajtu na stavech všech vsí ze souboru', () => {
    const lines = readFileSync(file!, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const state = JSON.parse(line) as VillageState;
      expect(JSON.stringify(roundTrip(state))).toBe(JSON.stringify(state));
    }
    expect(lines.length).toBeGreaterThan(0);
  });
});
