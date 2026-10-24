import { describe, expect, it } from 'vitest';
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
import { bury } from '../cemetery';
import { buriedWithinYear } from '../paths/roads';
import type { Cemetery } from '../types';
import { cloneState } from '../clone';
import { computePathNetwork, type PathVillage } from '../paths/network';
import { pathVillageOf } from '../paths/village';
import { repairOf } from '../repair';
import { ABANDONMENT } from '../rules';
import { sacredHappiness } from '../sacred';
import { advanceVillage } from '../simulate';
import { LANDSCAPE, house, part, pathTestTerrain } from './paths-fixtures';
import { NOV1, Y1, YEAR, cemetery, idol, json, pen, village } from './abandonment-fixtures';

const LAYER = obstaclesOf(LANDSCAPE);

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

  it('roční kontrola: bez provozu začne chátrat, znovu navštívená přestane a dostane opravu', () => {
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
    // sám od sebe se stav nezvedá – zvedne ho jen práce opravy (abandonment.md – Oprava)
    expect(structureCondition(wear, 'idol', later + 30 * 365)).toBe(wear.condition);
    expect(repairOf(s, { structure: 'idol', id: 8 })?.repair).toEqual({
      structure: 'idol',
      id: 8,
      from: wear.condition,
    });
    expect(repairOf(s, { structure: 'idol', id: 7 })).toBeUndefined();
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
    // další dny nic nemění (plot už není), bez provozu ani roční kontrola
    expect(abandonmentDay(s, fall + 1, null)).toEqual([]);
    abandonmentCheck(s, NOV1(601), new Map());
    expect(s.cemeteries[0]!.fenceWear).toEqual({ condition: 0 });
    expect(s.constructions).toEqual([]);
    bury(s, fall + 2);
    expect(s.cemeteries[0]!.graves).toBe(4);
    // ke hřbitovu se zase chodí – spadlý plot vesničané postaví znovu (abandonment.md – Oprava)
    abandonmentCheck(s, NOV1(602), new Map([[visitKey('cemetery', 20), 2]]));
    expect(s.cemeteries[0]!.fenceWear).toEqual({ condition: 0 });
    expect(repairOf(s, { structure: 'cemetery-fence', id: 20 })?.repair?.from).toBe(0);
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
    // a vesničané ji hned začnou opravovat; spadlá ohrada 1 zmizela i bez opravy
    expect(repairOf(s, { structure: 'pen', id: 2 })).toBeDefined();
    expect(repairOf(s, { structure: 'pen', id: 1 })).toBeUndefined();
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

describe('pohřby drží navštěvovaný jen hřbitov, kam se pohřbívá', () => {
  const mound = (day: number): NonNullable<Cemetery['mounds']>[number] => ({
    cell: { x: 14, y: 8 },
    column: 0,
    row: 0,
    size: 'normal',
    rank: 'adult',
    day,
  });

  it('pohřeb za poslední rok drží jen hřbitov s mohylou, starý hřbitov ne', () => {
    const fresh = cemetery(20, { mounds: [mound(Y1 - 100)] });
    const old = cemetery(21, { mounds: [mound(Y1 - 5 * 365)] });
    expect(buriedWithinYear(fresh, Y1)).toBe(true);
    expect(buriedWithinYear(old, Y1)).toBe(false);
    expect(buriedWithinYear(cemetery(22), Y1)).toBe(false);
  });

  it('pohřeb jde na jeden hřbitov – druhý bez návštěv začne chátrat, jediný otevřený se drží', () => {
    const s = village();
    s.cemeteries = [
      cemetery(20),
      cemetery(21, { squares: [{ cell: { x: 30, y: 8 }, x: 400, z: 300, waterDistanceM: 100 }] }),
    ];
    bury(s, Y1 - 10);
    const buried = s.cemeteries.filter((c) => buriedWithinYear(c, Y1));
    expect(buried).toHaveLength(1);
    const other = s.cemeteries.find((c) => c !== buried[0])!;
    expect(buriedWithinYear(other, Y1)).toBe(false);
  });
});
