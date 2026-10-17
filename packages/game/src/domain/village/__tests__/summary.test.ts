import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, startNewDwelling, type PartInput } from '../actions';
import { advanceVillage } from '../simulate';
import { partStage, summarizeVillage } from '../summary';
import type { FieldPart, Person, VillageState } from '../types';

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const YEAR = 365.25;
const parts = (count: number): PartInput[] =>
  Array.from({ length: count }, () => ({
    areaM2: 225,
    distanceM: 60,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
const found = (): VillageState =>
  foundVillage({
    seed: 3,
    day: DAY,
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: {
      outline: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      parts: parts(8),
    },
  });

const fallowPart = (sinceDay: number | null, state: FieldPart['state'] = 'fallow'): FieldPart => ({
  id: 1,
  fieldId: 1,
  areaM2: 225,
  distanceM: 50,
  naturalFertility: 60,
  fertilityShare: 0.7,
  bonusUntilDay: null,
  state,
  sownYears: 0,
  fallowSinceDay: sinceDay,
  foundingCost: 1,
  foundingDone: 1,
  surface: 'meadow',
});

describe('partStage', () => {
  it('nepřílohový díl má stadium podle stavu', () => {
    expect(partStage(fallowPart(null, 'founding'), DAY)).toBe('founding');
    expect(partStage(fallowPart(null, 'ready'), DAY)).toBe('ready');
    expect(partStage(fallowPart(null, 'sown'), DAY)).toBe('sown');
  });

  it('příloh zarůstá podle let: mladý příloh, louka, nálet, křoviny, les', () => {
    const since = dayIndexOf({ year: 600, month: 9, day: 1 });
    const after = (years: number): number => dayIndexOf({ year: 600 + years, month: 9, day: 1 });
    expect(partStage(fallowPart(since), since)).toBe('young-fallow');
    expect(partStage(fallowPart(since), after(2))).toBe('young-fallow');
    expect(partStage(fallowPart(since), after(3))).toBe('meadow');
    expect(partStage(fallowPart(since), after(6))).toBe('young-growth');
    expect(partStage(fallowPart(since), after(11))).toBe('shrub');
    expect(partStage(fallowPart(since), after(15))).toBe('shrub');
    expect(partStage(fallowPart(since), after(16))).toBe('forest');
  });
});

describe('summarizeVillage', () => {
  it('čerstvá ves: 2 dospělí a 2 děti v jedné zemnici, zásoby na 18 měsíců', () => {
    const s = advanceVillage(found(), DAY);
    const summary = summarizeVillage(s, DAY);
    expect(summary.people).toEqual({ children: 2, adults: 2, elders: 0 });
    expect(summary.households).toEqual([
      {
        dwellingId: 1,
        type: 'zemnice',
        occupants: 4,
        capacity: 6,
        full: false,
        overcrowded: false,
        condition: expect.closeTo(1, 3),
      },
    ]);
    expect(summary.storesMonths).toBeCloseTo(18, 0);
    expect(summary.satiation).toBe(1);
    expect(summary.canBuildDwelling).toBe(false);
    expect(summary.buildBlocker).toBe('no-full-household');
  });

  it('rozestavěné pole má průběh mezi 0 a 1 a výměru', () => {
    const s = advanceVillage(found(), DAY + 3);
    const [field] = summarizeVillage(s, DAY + 3).constructions;
    expect(field).toMatchObject({ kind: 'field', areaM2: 8 * 225 });
    expect(field!.progress).toBeGreaterThan(0);
    expect(field!.progress).toBeLessThan(1);
  });

  it('společná práce za den je průměr posledních dní', () => {
    const s = found();
    s.commonLaborHistory = [1, 2, 3];
    expect(summarizeVillage(s, DAY).commonLaborPerDay).toBeCloseTo(2);
    s.commonLaborHistory = [];
    expect(summarizeVillage(s, DAY).commonLaborPerDay).toBe(0);
  });

  it('plná domácnost se 4 dospělými může stavět, rozestavěné obydlí to zablokuje', () => {
    const s = found();
    const extra: Person[] = [20, 21].map((age, i) => ({
      id: 100 + i,
      bornDay: DAY - Math.ceil(age * YEAR),
      dwellingId: 1,
    }));
    s.people.push(...extra);
    s.people[2]!.bornDay = DAY - Math.ceil(16 * YEAR);
    s.people[3]!.bornDay = DAY - Math.ceil(15 * YEAR);
    const ready = summarizeVillage(s, DAY);
    expect(ready.households[0]).toMatchObject({ occupants: 6, full: true, overcrowded: false });
    expect(ready.canBuildDwelling).toBe(true);
    expect(ready.buildBlocker).toBeNull();
    const building = startNewDwelling(s, DAY, 'zemnice', { x: 20, z: 0, rotation: 0 }, 0);
    const blocked = summarizeVillage(building, DAY);
    expect(blocked.canBuildDwelling).toBe(false);
    expect(blocked.buildBlocker).toBe('already-building');
    expect(blocked.constructions.find((c) => c.kind === 'dwelling')).toMatchObject({
      dwellingType: 'zemnice',
      progress: 0,
      areaM2: null,
    });
  });

  it('bez zásob ves hladoví – nasycení pod 1', () => {
    const s = found();
    s.storesKg = 50;
    expect(summarizeVillage(s, DAY).satiation).toBeLessThan(1);
  });
});
