import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstaclesOf } from '../../landscape';
import {
  abandonmentCheck,
  abandonmentDay,
  isAbandoned,
  sacredRuinOvergrowth,
  stockedPenIds,
  structureCondition,
  structureFallDay,
  visitKey,
} from '../abandonment';
import { foundVillage } from '../actions';
import { bury } from '../cemetery';
import { cloneState } from '../clone';
import { computePathNetwork, type PathVillage } from '../paths/network';
import { pathVillageOf } from '../paths/village';
import { ABANDONMENT } from '../rules';
import { sacredHappiness } from '../sacred';
import { advanceVillage } from '../simulate';
import type { Cemetery, Dwelling, Pen, Person, SacredBuilding, VillageState } from '../types';
import { LANDSCAPE, house, part, pathTestTerrain } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

const YEAR = 365.25;
const NOV1 = (year: number): number => dayIndexOf({ year, month: 11, day: 1 });
const Y1 = NOV1(600);
const LAYER = obstaclesOf(LANDSCAPE);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Ves čtyř obydlí kolem počátku jako v testech pevných cest (louka, potok z ∈ (75, 90)). */
function village(day = Y1 - 30): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: day - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const at = (id: number, x: number, z: number): Dwelling => ({
    id,
    type: 'zemnice',
    builtDay: day - 30 * 365,
    condition: 1,
    position: { x, z, rotation: 0 },
  });
  s.dwellings = [at(1, 0, 0), at(2, 18, -4), at(3, -18, -4), at(4, 0, -22)];
  const adult = (id: number, dwellingId: number, years: number): Person => ({
    id,
    bornDay: day - Math.ceil(years * YEAR),
    dwellingId,
  });
  s.people = [1, 2, 3, 4].flatMap((d) => [
    adult(d * 10, d, 30),
    adult(d * 10 + 1, d, 28),
    adult(d * 10 + 2, d, 22),
    adult(d * 10 + 3, d, 20),
  ]);
  s.nextId = 100;
  s.constructions = [];
  s.storesKg = 20_000;
  // stáda bez krav – ohrada bez spřežení tak stojí prázdná (krávy v ní přes zimu nestojí)
  s.livestock = {
    herds: { sheep: 12, goat: 3, pig: 4, cow: 0 },
    young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
  };
  s.lastDay = day;
  return s;
}

const idol = (id: number, x: number, z: number, builtDay: number): SacredBuilding => ({
  id,
  kind: 'idol',
  position: { x, z, rotation: 0 },
  builtDay,
});

const pen = (id: number, extra: Partial<Pen> = {}): Pen => ({
  id,
  cell: { x: 4, y: 4 },
  x: -82.5,
  z: -82.5,
  builtDay: Y1 - 5 * 365,
  team: null,
  training: null,
  ...extra,
});

const cemetery = (id: number, extra: Partial<Cemetery> = {}): Cemetery => ({
  id,
  squares: [{ cell: { x: 14, y: 8 }, x: 67.5, z: -22.5, waterDistanceM: 100 }],
  squareSizeM: 15,
  graves: 3,
  builtDay: Y1 - 10 * 365,
  ...extra,
});

describe('provoz ke stavbám v síti pěšin (PathNetwork.visits)', () => {
  const terrain = pathTestTerrain();
  const base: PathVillage = {
    dwellings: [house(1, 0, 0), house(2, 14, 4), house(3, -13, 5)],
    fields: [],
    labor: { day: 4000, month: 6, people: { children: 4, adults: 8, elders: 2 }, shares: [] },
  };

  it('k modlám chodí každá domácnost jen k nejbližší – vzdálená provoz nemá', () => {
    const v: PathVillage = {
      ...base,
      sacred: {
        oaks: [],
        groves: [],
        buildings: [
          { id: 7, kind: 'idol', position: { x: 20, z: -30, rotation: 0 }, built: true },
          { id: 8, kind: 'idol', position: { x: -60, z: -120, rotation: 0 }, built: true },
        ],
      },
    };
    const { visits } = computePathNetwork({ village: v, terrain });
    expect(visits.get(visitKey('idol', 7))).toBeGreaterThan(0);
    expect(visits.has(visitKey('idol', 8))).toBe(false);
  });

  it('hřbitov a ohrada se zvířaty mají provoz, do ohrady bez zvířat se krmit nechodí', () => {
    const v: PathVillage = {
      ...base,
      cemeteries: [{ id: 20, squares: [part(67.5, -22.5, 'meadow')] }],
      pens: [
        { ...part(-37.5, -52.5, 'meadow'), id: 30, built: true },
        { ...part(52.5, -67.5, 'meadow'), id: 31, built: true, stocked: false },
      ],
    };
    const { visits } = computePathNetwork({ village: v, terrain });
    expect(visits.get(visitKey('cemetery', 20))).toBeGreaterThan(0);
    expect(visits.get(visitKey('pen', 30))).toBeGreaterThan(0);
    expect(visits.has(visitKey('pen', 31))).toBe(false);
    // práce dne na ohradě (rádlo) tam lidi přivede i bez zvířat
    const working = computePathNetwork({
      village: {
        ...v,
        labor: {
          ...base.labor!,
          shares: [{ target: { kind: 'pen', id: 31 }, manDays: 2 }],
        },
      },
      terrain,
    });
    expect(working.visits.get(visitKey('pen', 31))).toBeGreaterThan(0);
  });
});

describe('ohrada se zvířaty (stockedPenIds)', () => {
  it('spřežení, výcvik nebo zimní krávy – rovným dílem do hotových ohrad', () => {
    const s = village();
    s.pens = [pen(1), pen(2, { team: { readyDay: Y1 - 400 } }), pen(3, { builtDay: null })];
    expect([...stockedPenIds(s)]).toEqual([2]);
    s.livestock = {
      herds: { sheep: 0, goat: 0, pig: 0, cow: 1.2 },
      young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    };
    // jedna kráva do první hotové ohrady
    expect([...stockedPenIds(s)].sort()).toEqual([1, 2]);
    // ohrada bez zvířat jde do sítě pěšin se `stocked: false`
    s.livestock.herds.cow = 0;
    const pens = pathVillageOf(s, Y1, LANDSCAPE).pens!;
    expect(pens.map((p) => p.stocked)).toEqual([false, undefined, undefined]);
  });
});

describe('chátrání opuštěné stavby', () => {
  it('stav ubývá rovnoměrně a stavba spadne za dobu z tabulky', () => {
    const wear = { condition: 1, abandonedDay: 1000 };
    for (const structure of ['idol', 'shrine', 'cemetery-fence', 'pen'] as const) {
      const years = ABANDONMENT.fallYears[structure];
      const fall = structureFallDay(wear, structure)!;
      expect((fall - 1000) / YEAR).toBeCloseTo(years, 2);
      expect(structureCondition(wear, structure, 1000 + (years / 2) * YEAR)).toBeCloseTo(0.5, 3);
      expect(structureCondition(wear, structure, fall)).toBe(0);
    }
    expect(ABANDONMENT.fallYears).toEqual({ idol: 20, shrine: 30, 'cemetery-fence': 10, pen: 10 });
    // navštěvovaná stavba stav drží, bez záznamu je celá
    expect(structureCondition({ condition: 0.4 }, 'idol', 99_999)).toBe(0.4);
    expect(structureCondition(undefined, 'idol', 99_999)).toBe(1);
    expect(structureFallDay({ condition: 0.4 }, 'idol')).toBeNull();
  });

  it('roční kontrola: bez provozu začne chátrat, znovu navštívená přestane (stav se nezvedá)', () => {
    const s = village();
    s.sacredBuildings = [idol(7, 20, -30, Y1 - 5 * 365), idol(8, -60, -120, Y1 - 5 * 365)];
    abandonmentCheck(s, Y1, new Map([[visitKey('idol', 7), 0.4]]));
    expect(s.sacredBuildings[0]!.wear).toBeUndefined();
    expect(s.sacredBuildings[1]!.wear).toEqual({ condition: 1, abandonedDay: Y1 });
    // další rok bez provozu chátrá dál od téhož dne
    const next = NOV1(601);
    abandonmentCheck(s, next, new Map());
    expect(s.sacredBuildings[1]!.wear).toEqual({ condition: 1, abandonedDay: Y1 });
    expect(s.sacredBuildings[0]!.wear).toEqual({ condition: 1, abandonedDay: next });
    // k modle 8 se začne chodit – chátrání se zastaví na dnešním stavu
    const later = NOV1(605);
    const before = structureCondition(s.sacredBuildings[1]!.wear, 'idol', later);
    abandonmentCheck(s, later, new Map([[visitKey('idol', 8), 0.3]]));
    const wear = s.sacredBuildings[1]!.wear!;
    expect(isAbandoned(wear)).toBe(false);
    expect(wear.condition).toBeCloseTo(before, 9);
    expect(wear.condition).toBeCloseTo(1 - 5 / 20, 2);
    expect(structureCondition(wear, 'idol', later + 30 * 365)).toBe(wear.condition);
  });

  it('stavba dokončená za poslední rok a ohrada se zvířaty opuštěné nejsou', () => {
    const s = village();
    s.sacredBuildings = [idol(7, 20, -30, Y1 - 100)];
    s.pens = [pen(1, { training: { startDay: Y1 - 50 } }), pen(2)];
    s.cemeteries = [cemetery(20, { builtDay: Y1 - 200 }), cemetery(21)];
    abandonmentCheck(s, Y1, new Map());
    expect(s.sacredBuildings[0]!.wear).toBeUndefined();
    expect(s.pens[0]!.wear).toBeUndefined();
    expect(s.pens[1]!.wear).toEqual({ condition: 1, abandonedDay: Y1 });
    expect(s.cemeteries[0]!.fenceWear).toBeUndefined();
    expect(s.cemeteries[1]!.fenceWear).toEqual({ condition: 1, abandonedDay: Y1 });
  });

  it('modla padne, štěstí dává jen stojící, zbytek po 10 letech zmizí', () => {
    const start = Y1 + 10;
    const s = village(start);
    const fallDay = start + 40;
    s.sacredBuildings = [
      idol(7, 20, -30, Y1 - 5 * 365),
      {
        ...idol(8, -60, -120, Y1 - 5 * 365),
        wear: { condition: 40 / (20 * YEAR), abandonedDay: start },
      },
      { ...idol(9, 60, -120, Y1 - 5 * 365), wear: { condition: 0.5, abandonedDay: start } },
    ];
    expect(structureFallDay(s.sacredBuildings[1]!.wear, 'idol')).toBe(fallDay);
    // dvě modly se počítají (stropy počtu) – stojí tři, po pádu jedné pořád dvě
    expect(sacredHappiness(s, start, null)).toBe(16);
    const after = advanceVillage(s, fallDay + 1, null);
    expect(after.sacredBuildings!.map((b) => b.id)).toEqual([7, 9]);
    expect(after.chronicle).toContainEqual({
      day: fallDay,
      kind: 'structure-fell',
      structure: 'idol',
      id: 8,
    });
    expect(after.sacredRuins).toEqual([
      { id: 8, kind: 'idol', position: { x: -60, z: -120, rotation: 0 }, day: fallDay },
    ]);
    // modla 9 stojí, i když chátrá – štěstí dává dál
    expect(sacredHappiness(after, fallDay + 1, null)).toBe(16);
    after.sacredBuildings = after.sacredBuildings!.filter((b) => b.id === 7);
    expect(sacredHappiness(after, fallDay + 1, null)).toBe(8);
    // zbytek zarůstá a po ABANDONMENT.remnantYears zmizí
    const ruin = after.sacredRuins![0]!;
    expect(sacredRuinOvergrowth(ruin, fallDay + 5 * YEAR)).toBeCloseTo(0.5, 3);
    const gone = fallDay + Math.ceil(ABANDONMENT.remnantYears.idol * YEAR);
    const t = cloneState(after);
    abandonmentDay(t, gone - 1, null);
    expect(t.sacredRuins).toHaveLength(1);
    abandonmentDay(t, gone, null);
    expect(t.sacredRuins).toBeUndefined();
  }, 60_000);

  it('zbytek pod novou stavbou zmizí hned', () => {
    const s = village();
    s.sacredRuins = [{ id: 8, kind: 'shrine', position: { x: 60, z: -60, rotation: 0 }, day: Y1 }];
    abandonmentDay(s, Y1 + 1, LANDSCAPE);
    expect(s.sacredRuins).toHaveLength(1);
    s.dwellings.push({
      id: 50,
      type: 'zemnice',
      builtDay: Y1,
      condition: 1,
      position: { x: 55, z: -55, rotation: 0 },
    });
    abandonmentDay(s, Y1 + 2, LANDSCAPE);
    expect(s.sacredRuins).toBeUndefined();
  });

  it('plot hřbitova se rozpadne, hřbitov zůstane a pohřbívá se do něj dál', () => {
    const s = village();
    s.cemeteries = [cemetery(20, { fenceWear: { condition: 0.001, abandonedDay: Y1 } })];
    const fall = structureFallDay(s.cemeteries[0]!.fenceWear, 'cemetery-fence')!;
    const events = abandonmentDay(s, fall, null);
    expect(events).toEqual([
      { day: fall, kind: 'structure-fell', structure: 'cemetery-fence', id: 20 },
    ]);
    expect(s.cemeteries[0]!.fenceWear).toEqual({ condition: 0 });
    // další dny ani roční kontrola nic nemění (plot už není)
    expect(abandonmentDay(s, fall + 1, null)).toEqual([]);
    abandonmentCheck(s, NOV1(601), new Map([[visitKey('cemetery', 20), 2]]));
    expect(s.cemeteries[0]!.fenceWear).toEqual({ condition: 0 });
    bury(s, fall + 2);
    expect(s.cemeteries[0]!.graves).toBe(4);
  });

  it('ohrada se rozpadne a zmizí; když se do ní vrátí zvířata, chátrat přestane', () => {
    const s = village();
    s.pens = [
      pen(1, { wear: { condition: 0.002, abandonedDay: Y1 } }),
      pen(2, { cell: { x: 5, y: 4 }, x: -67.5, wear: { condition: 0.002, abandonedDay: Y1 } }),
    ];
    s.pens[1]!.training = { startDay: Y1 + 1 };
    expect(abandonmentDay(s, Y1 + 2, null)).toEqual([]);
    const fall = structureFallDay(s.pens[0]!.wear, 'pen')!;
    const events = abandonmentDay(s, fall, null);
    expect(events).toEqual([{ day: fall, kind: 'structure-fell', structure: 'pen', id: 1 }]);
    expect(s.pens.map((p) => p.id)).toEqual([2]);
    expect(isAbandoned(s.pens[0]!.wear)).toBe(false);
    expect(s.pens[0]!.wear!.condition).toBeGreaterThan(0);
  });

  it('staré vsi bez záznamů se nemění; bez krajiny se nic neopouští', () => {
    const s = village(Y1 - 3);
    s.sacredBuildings = [idol(8, -60, -120, Y1 - 5 * 365)];
    const before = json(s);
    expect(abandonmentDay(s, Y1, null)).toEqual([]);
    expect(json(s)).toEqual(before);
    const after = advanceVillage(json(s), Y1 + 2, null);
    expect(after.sacredBuildings![0]!.wear).toBeUndefined();
    expect(after).not.toHaveProperty('sacredRuins');
  }, 60_000);
});

describe('opuštěné stavby v simulaci (s krajinou)', () => {
  it('1. 11. vzdálená modla začne chátrat, nejbližší ne; nezávisí na kouscích dopočtu', () => {
    const start = village(Y1 - 6);
    start.sacredBuildings = [idol(7, 20, -30, Y1 - 5 * 365), idol(8, -60, -120, Y1 - 5 * 365)];
    start.pens = [pen(1)];
    const end = Y1 + 6;
    const whole = advanceVillage(start, end, LAYER, LANDSCAPE);
    expect(whole.sacredBuildings!.find((b) => b.id === 7)!.wear).toBeUndefined();
    expect(whole.sacredBuildings!.find((b) => b.id === 8)!.wear).toEqual({
      condition: 1,
      abandonedDay: Y1,
    });
    // ohrada bez zvířat – krmit se tam nechodí
    expect(whole.pens![0]!.wear).toEqual({ condition: 1, abandonedDay: Y1 });
    const steps = [1, 3, 2, 4];
    let chunked = json(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = json(
        advanceVillage(
          chunked,
          Math.min(end, chunked.lastDay + steps[i % steps.length]!),
          LAYER,
          LANDSCAPE,
        ),
      );
    }
    expect(chunked).toEqual(json(whole));
  }, 60_000);
});

describe('cloneState – chátrání staveb', () => {
  it('záznamy chátrání a zbytky padlých model zkopíruje jako structuredClone', () => {
    const s = village();
    s.sacredBuildings = [
      { ...idol(8, -60, -120, 100), wear: { condition: 0.7, abandonedDay: 900 } },
    ];
    s.cemeteries = [cemetery(20, { fenceWear: { condition: 0 } })];
    s.pens = [pen(1, { wear: { condition: 0.3 } })];
    s.sacredRuins = [{ id: 5, kind: 'shrine', position: { x: 1, z: 2, rotation: 0.5 }, day: 800 }];
    const copy = cloneState(s);
    expect(copy).toEqual(structuredClone(s));
    copy.sacredBuildings![0]!.wear!.condition = 0;
    copy.sacredRuins![0]!.position.x = 99;
    expect(s.sacredBuildings[0]!.wear!.condition).toBe(0.7);
    expect(s.sacredRuins[0]!.position.x).toBe(1);
  });
});
