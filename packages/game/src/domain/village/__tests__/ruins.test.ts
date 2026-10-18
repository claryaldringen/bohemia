import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles } from '../../landscape';
import { foundVillage } from '../actions';
import { withPlots } from '../plots';
import { RUIN_YEARS } from '../rules';
import { recordRuins, ruinOvergrowth, updateRuins, withoutBuiltOverRuins } from '../ruins';
import { advanceVillage } from '../simulate';
import type { DwellingRuin, FieldPart, Position, VillageState } from '../types';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Zbytky jam po zaniklých obydlích (population.md – Chátrání a přestavba, Po zániku). Ruční
// krajina 16 × 16 políček po 15 m se středem v počátku: políčko (8, 8) = svět 0–15 m.

const DAY = dayIndexOf({ year: 600, month: 10, day: 1 });
const YEAR = 365.25;
const HOME: Position = { x: -100, z: -20, rotation: 0 };
const AWAY: Position = { x: 40, z: 40, rotation: 0.3 };
const EMPTY = packObstacles([], 16, 15);
const landscape = makeLandscape();

/** Ves s postavenou první zemnicí a zásobami (domácnost v ní bydlí). */
function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 3, day: DAY, dwellingPosition: HOME, obstacles: EMPTY }),
  );
  s.storesKg = 5000;
  return s;
}

/** Ves s prázdnou starou zemnicí těsně před zánikem (id 50) daleko od domácnosti. */
function withDyingDwelling(): VillageState {
  const s = village();
  s.dwellings.push({
    id: 50,
    type: 'zemnice',
    builtDay: DAY - 20 * 365,
    condition: 0.0001,
    position: AWAY,
  });
  return s;
}

/** Díl pole na políčku `cell` (zakládá se). */
const part = (id: number, cell: { x: number; y: number }): FieldPart => ({
  id,
  fieldId: 400,
  areaM2: 225,
  distanceM: 50,
  naturalFertility: 50,
  fertilityShare: 1,
  bonusUntilDay: null,
  state: 'founding',
  sownYears: 0,
  fallowSinceDay: null,
  foundingCost: 10,
  foundingDone: 0,
  surface: 'meadow',
  cell,
});

const ruin = (overrides: Partial<DwellingRuin> = {}): DwellingRuin => ({
  id: 50,
  type: 'zemnice',
  position: AWAY,
  day: DAY,
  ...overrides,
});

describe('zbytek jámy po zaniklém obydlí', () => {
  it('prázdné obydlí na nule zanikne a na jeho místě zůstane zbytek jámy', () => {
    const start = withDyingDwelling();
    const s = advanceVillage(start, DAY + 1, null);
    expect(s.dwellings.map((d) => d.id)).toEqual([1]);
    // zanikne první dopočítaný den
    const day = start.lastDay + 1;
    expect(s.ruins).toEqual([{ id: 50, type: 'zemnice', position: AWAY, day }]);
  });

  it('zbytek nese pozemek a řemeslo zaniklého obydlí (jen vzhled)', () => {
    const s = village();
    recordRuins(
      s,
      [
        {
          id: 7,
          type: 'polozemnice',
          builtDay: DAY,
          condition: 0,
          position: AWAY,
          plot: { cell: { x: 10, y: 10 }, variant: 'center' },
          workshop: { craft: 'potter', activity: 'empty' } as never,
        },
      ],
      DAY + 3,
    );
    expect(s.ruins).toEqual([
      {
        id: 7,
        type: 'polozemnice',
        position: AWAY,
        plot: { cell: { x: 10, y: 10 }, variant: 'center' },
        craft: 'potter',
        day: DAY + 3,
      },
    ]);
  });

  it('nezávisí na kouscích dopočtu', () => {
    const start = withDyingDwelling();
    const whole = advanceVillage(start, DAY + 40, null);
    let parts = start;
    for (const step of [1, 2, 17, 40]) parts = advanceVillage(parts, DAY + step, null);
    expect(parts).toEqual(whole);
    expect(whole.ruins).toHaveLength(1);
  });

  it(`zarůstá ${RUIN_YEARS} let, pak zmizí; ves bez zbytků jam se nemění`, () => {
    expect(ruinOvergrowth(ruin(), DAY)).toBe(0);
    expect(ruinOvergrowth(ruin(), DAY + (RUIN_YEARS * YEAR) / 2)).toBeCloseTo(0.5, 6);
    expect(ruinOvergrowth(ruin(), DAY + 100 * YEAR)).toBe(1);
    const s = village();
    s.ruins = [ruin(), ruin({ id: 51, day: DAY + 400 })];
    updateRuins(s, DAY + Math.floor(RUIN_YEARS * YEAR), null);
    expect(s.ruins.map((r) => r.id)).toEqual([50, 51]);
    updateRuins(s, DAY + Math.ceil(RUIN_YEARS * YEAR), null);
    expect(s.ruins.map((r) => r.id)).toEqual([51]);
    updateRuins(s, DAY + 400 + Math.ceil(RUIN_YEARS * YEAR), null);
    expect(s).not.toHaveProperty('ruins');
    const plain = village();
    updateRuins(plain, DAY + 1, landscape);
    expect(plain).toEqual(village());
  });

  it('stavba přes zbytek jámy ho odstraní – obydlí i rozestavěné, bez krajiny podle půdorysu', () => {
    const built = village();
    built.ruins = [ruin({ position: HOME })];
    updateRuins(built, DAY + 1, null);
    expect(built).not.toHaveProperty('ruins');
    const site = village();
    site.ruins = [ruin(), ruin({ id: 60, position: { x: 80, z: 80, rotation: 0 } })];
    site.constructions.push({
      id: 99,
      kind: 'dwelling',
      startedDay: DAY,
      cost: 60,
      done: 0,
      dwellingType: 'polozemnice',
      position: { x: AWAY.x + 2, z: AWAY.z - 1, rotation: 0 },
      dwellingId: null,
      fieldId: null,
    });
    updateRuins(site, DAY + 1, null);
    expect(site.ruins!.map((r) => r.id)).toEqual([60]);
  });

  it('po akci hráče: pole, hřbitov nebo sad přes zbytek jámy ho odstraní, jinak týž stav', () => {
    const s = village();
    // políčko (10, 10) = svět 30–45 m; zbytek jámy uprostřed
    s.ruins = [ruin({ position: { x: 37.5, z: 37.5, rotation: 0 } })];
    expect(withoutBuiltOverRuins(s, landscape)).toBe(s);
    const field = structuredClone(s);
    field.parts.push(part(500, { x: 10, y: 10 }));
    const cleared = withoutBuiltOverRuins(field, landscape);
    expect(cleared).not.toBe(field);
    expect(cleared).not.toHaveProperty('ruins');
    expect(field.ruins).toHaveLength(1); // vstup se nemění
    const orchard = structuredClone(s);
    orchard.orchards = [
      {
        id: 600,
        squares: [
          {
            cell: { x: 10, y: 10 },
            areaM2: 225,
            distanceM: 50,
            plantingCost: 18,
            plantingDone: 0,
            plantedDay: null,
          },
        ],
      } as never,
    ];
    expect(withoutBuiltOverRuins(orchard, landscape)).not.toHaveProperty('ruins');
    const neighbour = structuredClone(s);
    neighbour.parts.push(part(501, { x: 11, y: 10 }));
    expect(withoutBuiltOverRuins(neighbour, landscape)).toBe(neighbour);
  });

  it('polozemnice přestavěná na novém pozemku nechá na starém místě zbytek jámy', () => {
    const s = village();
    const home = s.dwellings[0]!;
    home.type = 'polozemnice';
    home.position = { x: 7.5, z: 7.5, rotation: 0 };
    home.condition = 0; // na nule – hned se přestaví
    s.dwellings.push({
      id: s.nextId++,
      type: 'zemnice',
      builtDay: DAY - 400,
      condition: 1,
      position: { x: 12.5, z: 12.5, rotation: 0 },
    });
    let later = withPlots(s, landscape, EMPTY);
    later = advanceVillage(later, later.lastDay + 1, EMPTY, landscape);
    for (let i = 0; i < 40 && later.constructions.some((c) => c.kind === 'rebuild'); i++) {
      later = advanceVillage(later, later.lastDay + 30, EMPTY, landscape);
    }
    const moved = later.dwellings.find((d) => d.id === home.id)!;
    expect(moved.plot).toBeDefined();
    expect(later.ruins).toEqual([
      expect.objectContaining({ id: home.id, type: 'polozemnice', position: home.position }),
    ]);
  });
});
