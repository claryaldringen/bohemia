import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { cloneState } from '../clone';
import { ROAD_TREE_ID_BASE } from '../road-trees';
import { advanceVillage } from '../simulate';
import type { VillageRoads, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

describe('cloneState', () => {
  it('zkopíruje vnořené objekty a pole jako structuredClone', () => {
    const state = {
      day: 3,
      hungry: false,
      plan: null,
      missing: undefined,
      parts: [{ id: 1, cell: { x: 2, y: 3 }, obstacles: [4, 5], crop: 'winter' }],
      ratio: -0,
      nan: Number.NaN,
    };
    const copy = cloneState(state);
    expect(copy).toEqual(structuredClone(state));
    expect(Object.keys(copy)).toEqual(Object.keys(state));
    expect(Object.is(copy.ratio, -0)).toBe(true);
    // buňka dílu se sdílí (záznam se nemění na místě – test „buňky dílů… sdílí“ níž)
    copy.parts[0]!.crop = 'spring';
    copy.parts[0]!.obstacles.push(6);
    expect(state.parts[0]!.crop).toBe('winter');
    expect(state.parts[0]!.obstacles).toEqual([4, 5]);
  });

  it('ostatní typy (Map, Date) kopíruje přes structuredClone', () => {
    const state = { byId: new Map([[1, { a: 1 }]]), when: new Date(0) };
    const copy = cloneState(state);
    expect(copy.byId).not.toBe(state.byId);
    expect(copy.byId.get(1)).toEqual({ a: 1 });
    expect(copy.when).toBeInstanceOf(Date);
    expect(copy.when.getTime()).toBe(0);
  });

  it('pevné cesty, stromy u nich a roční součty práce (roads.md) kopíruje celé, body cest sdílí', () => {
    const roads: VillageRoads = {
      nextId: 9,
      roads: [
        {
          id: 1,
          points: [
            { x: 0.5, z: 1.25 },
            { x: 40, z: -3 },
          ],
          bornDay: 1200,
          grade: 'trodden',
          traffic: [4.1, 3.9],
          spots: [{ id: 2, x: 10, z: 3 }],
        },
      ],
      trees: [
        {
          id: ROAD_TREE_ID_BASE + 3,
          spot: 2,
          x: 10,
          z: 3,
          species: 'oak',
          rootedDay: 1500,
          diesDay: 90000,
        },
      ],
      labor: {
        from: 1600,
        days: 12,
        shares: [
          { target: { kind: 'field', id: 4 }, manDays: 7.5 },
          { target: { kind: 'trees', ids: [11, 12] }, manDays: 1 },
        ],
      },
    };
    const state = { lastDay: 1611, roads } as Pick<VillageState, 'lastDay' | 'roads'>;
    const before = structuredClone(state);
    const copy = cloneState(state);
    expect(copy).toEqual(before);
    // body cest kopie sdílí (záznamy se nemění na místě), seznam bodů je nový
    expect(copy.roads!.roads[0]!.points[0]).toBe(state.roads!.roads[0]!.points[0]);
    expect(() => {
      copy.roads!.roads[0]!.points[0]!.x = 99;
    }).toThrow(TypeError);
    // jinak se nic nesdílí – další kousek dopočtu nesmí měnit uložený stav
    copy.roads!.roads[0]!.points[0] = { x: 99, z: 0 };
    copy.roads!.roads[0]!.traffic.push(1);
    copy.roads!.roads[0]!.spots.pop();
    copy.roads!.trees[0]!.diesDay = 1;
    copy.roads!.labor.shares[0]!.manDays += 1;
    const ids = copy.roads!.labor.shares[1]!.target;
    if (ids.kind === 'trees') ids.ids.push(13);
    expect(state).toEqual(before);
    expect(copy).not.toEqual(before);
  });
});

describe('cloneState – stav vsi se zbytkem jámy', () => {
  it('záznamy překážek, pokácených stromů a kroniky sdílí – seznamy jsou nové, záznamy zmražené', () => {
    const state = {
      lastDay: 10,
      clearedObstacles: [{ id: 1, day: 3 }],
      felledTrees: [{ id: 2, day: 4 }],
      chronicle: [{ day: 5, kind: 'village-founded' }],
    } as Pick<VillageState, 'lastDay' | 'clearedObstacles' | 'felledTrees' | 'chronicle'>;
    const copy = cloneState(state);
    expect(copy).toEqual(state);
    expect(copy.felledTrees).not.toBe(state.felledTrees);
    expect(copy.felledTrees![0]).toBe(state.felledTrees![0]);
    expect(copy.clearedObstacles![0]).toBe(state.clearedObstacles![0]);
    expect(copy.chronicle[0]).toBe(state.chronicle[0]);
    // pojistka v testech (test-setup.ts): zápis do sdíleného záznamu spadne
    expect(() => {
      copy.felledTrees![0]!.planted = 9;
    }).toThrow(TypeError);
    copy.felledTrees!.push({ id: 3, day: 9 });
    expect(state.felledTrees).toHaveLength(1);
  });

  it('buňky dílů a body profilů zemních prací sdílí – díly, zemní práce a seznam bodů jsou nové', () => {
    const state = {
      parts: [{ id: 1, cell: { x: 3, y: 4 }, state: 'sown' }],
      roads: {
        roads: [],
        earthworks: [
          {
            id: 7,
            pieces: [{ toM: 5, manDays: 1 }],
            profile: [{ x: 1, y: 2, z: 3 }],
            startedDay: 4,
          },
        ],
      },
    } as unknown as Pick<VillageState, 'parts' | 'roads'>;
    const copy = cloneState(state);
    expect(copy).toEqual(state);
    expect(copy.parts[0]).not.toBe(state.parts[0]);
    expect(copy.parts[0]!.cell).toBe(state.parts[0]!.cell);
    const [earthwork] = copy.roads!.earthworks!;
    expect(earthwork).not.toBe(state.roads!.earthworks![0]);
    expect(earthwork!.pieces).not.toBe(state.roads!.earthworks![0]!.pieces);
    expect(earthwork!.profile).not.toBe(state.roads!.earthworks![0]!.profile);
    expect(earthwork!.profile[0]).toBe(state.roads!.earthworks![0]!.profile[0]);
    // pojistka v testech (test-setup.ts): zápis do sdílené buňky ani bodu nejde
    expect(() => {
      (copy.parts[0]!.cell as { x: number }).x = 9;
    }).toThrow(TypeError);
    expect(() => {
      (earthwork!.profile[0] as { y: number }).y = 9;
    }).toThrow(TypeError);
  });

  it('zbytky jam po zaniklých obydlích (pozemek, řemeslo) zkopíruje jako structuredClone', () => {
    const day = dayIndexOf({ year: 600, month: 10, day: 1 });
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 3, day, dwellingPosition: { x: -100, z: -20, rotation: 0 } }),
    );
    s.storesKg = 5000;
    s.dwellings.push({
      id: 50,
      type: 'polozemnice',
      builtDay: day - 30 * 365,
      condition: 0.0001,
      position: { x: 40, z: 40, rotation: 0.3 },
      plot: { cell: { x: 10, y: 10 }, variant: 'center' },
    });
    const state = advanceVillage(s, day + 3, null);
    expect(state.ruins).toHaveLength(1);
    expect(state.ruins![0]!.plot).toBeDefined();
    state.ruins!.push({ ...state.ruins![0]!, id: 51, craft: 'potter' });
    const copy = cloneState(state);
    expect(copy).toEqual(structuredClone(state));
    copy.ruins![0]!.position.x = 99;
    copy.ruins![0]!.plot!.cell.x = 99;
    expect(state.ruins![0]!.position.x).toBe(40);
    expect(state.ruins![0]!.plot!.cell.x).toBe(10);
  });
});

describe('cloneState – příbuzenství (kinship.md)', () => {
  it('pohlaví, rodiče, manžele, původ, předky a dcery vdané pryč zkopíruje jako structuredClone', () => {
    const day = dayIndexOf({ year: 600, month: 10, day: 1 });
    const s = foundVillage({ seed: 3, day, dwellingPosition: { x: -100, z: -20, rotation: 0 } });
    s.people.push({
      id: 40,
      bornDay: day - 6000,
      dwellingId: 1,
      sex: 'female',
      origin: 'SE',
      motherId: 70,
      fatherId: 71,
    });
    s.ancestors = [{ id: 70, motherId: 80 }];
    s.emigrants = [
      { id: 72, sex: 'female', bornDay: day - 7000, direction: 'W', motherId: 70, fatherId: 71 },
    ];
    expect(s.people[0]!.spouseId).toBe(s.people[1]!.id);
    const copy = cloneState(s);
    expect(copy).toEqual(structuredClone(s));
    copy.people.at(-1)!.origin = 'N';
    copy.ancestors![0]!.motherId = 1;
    copy.emigrants![0]!.direction = 'E';
    expect(s.people.at(-1)!.origin).toBe('SE');
    expect(s.ancestors[0]!.motherId).toBe(80);
    expect(s.emigrants[0]!.direction).toBe('W');
  });
});

describe('cloneState – dvorec, stezky a obchod (trade.md)', () => {
  it('kopíruje celé jako structuredClone a kopie je nezávislá', () => {
    const state = {
      manorId: 1,
      trails: [
        {
          id: 40,
          direction: 'SE' as const,
          pieces: [{ roadId: 3, grade: 'improved' as const, manDays: 12.5 }],
          lengthM: 640.2,
          startedDay: 100,
          builtDay: null,
        },
      ],
      trade: {
        neighbours: [
          {
            direction: 'SE' as const,
            season: 600,
            supply: { ironBars: 8 },
            demand: { grain: 900 },
          },
        ],
        expeditions: [
          {
            id: 1,
            direction: 'SE' as const,
            trailId: 40,
            startedDay: 120,
            give: { grain: 100 },
            get: { ironBars: 1 },
            porters: 4,
            days: 5,
            cost: 20,
            done: 3.5,
          },
        ],
        nextId: 2,
      },
    } as Pick<VillageState, 'manorId' | 'trails' | 'trade'>;
    const copy = cloneState(state);
    expect(copy).toEqual(structuredClone(state));
    copy.trails![0]!.pieces[0]!.manDays = 0;
    copy.trade!.expeditions[0]!.give.grain = 1;
    expect(state.trails![0]!.pieces[0]!.manDays).toBe(12.5);
    expect(state.trade!.expeditions[0]!.give.grain).toBe(100);
  });
});
