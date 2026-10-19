import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstaclePlacement } from '../../landscape';
import { foundField, foundVillage } from '../actions';
import { cloneState } from '../clone';
import { pastureHa, pigForestHa } from '../livestock';
import { obstacleChangesAt, plantOnStump } from '../obstacles';
import { BEECH_PLANTING } from '../rules';
import { grazedPartIds, overgrowthDay } from '../overgrowth';
import { PASTURE, pastureGrazing, pastureParts } from '../pasture';
import { isHayMeadow, mownPartIds } from '../hay';
import { plantingBlocker } from '../paths/roads';
import { pathTerrainOf, pathWindowFor, withObstacles } from '../paths/terrain';
import { pastureGrazedParts, pathVillageOf, walkLayoutKey } from '../paths/village';
import { hasSod } from '../plough';
import { partWork } from '../year-plan';
import {
  checkDwellingPlacement,
  fieldPartsFromCells,
  orchardPartsFromCells,
  placementVillageOf,
} from '../placement';
import { advanceVillage } from '../simulate';
import { partStage } from '../summary';
import type { FieldPart, HerdSpecies, VillageState, VillageWood } from '../types';
import { availableTrees, isBeech, nearestMatureTrees, woodSupply } from '../wood';
import {
  WOOD_TREE_ID_BASE,
  clearWoodAt,
  woodMatureTrees,
  woodTreeCount,
  woodTreeId,
  woodTreeOf,
  woodTreeSpots,
} from '../woods';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Zarůstání přílohu (fields.md – Zarůstání): pastva po dílech, roční krok 1. 11., les z pole
// vypadne a zůstane lesem vsi se stromy (woods.ts).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const NOV1 = at(620, 11, 1);
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});
/** Krajina 16 × 16 políček po 15 m se středem v počátku (placement-fixtures). */
const GEOMETRY = { size: 16, cellSizeM: 15 };

function village(day = NOV1 - 1): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day: at(600, 9, 2), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  s.livestock!.herds = herds({});
  return s;
}

function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 225,
    distanceM: 100,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'fallow',
    sownYears: 0,
    fallowSinceDay: at(610, 9, 1),
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    cell: { x: id, y: 2 },
    ...over,
  };
}

describe('pastva po dílech přílohu (diet.md – Pastva)', () => {
  const parts = [
    part(1, { areaM2: 10_000, distanceM: 300 }),
    part(2, { areaM2: 5000, distanceM: 100 }),
    part(3, { areaM2: 10_000, distanceM: 50, overgrowthYears: 5 }),
    part(4, { areaM2: 10_000, distanceM: 10, state: 'sown', fallowSinceDay: null }),
    part(5, { areaM2: 10_000, distanceM: 300 }),
  ];
  const withParts = (list: FieldPart[]): VillageState => {
    const s = village();
    s.parts = list;
    return s;
  };

  it('nejbližší příloh ve fázi louky napřed, každý nejvýš svou plochou', () => {
    // křoviny (3) ani osetý díl (4) se nepasou; zbytek potřeby jde na louky krajiny
    const s = withParts(parts);
    expect([...pastureGrazing(s, NOV1, 1.2, 0)]).toEqual([
      [2, 0.5],
      [1, expect.closeTo(0.7, 9)],
    ]);
    expect(pastureGrazing(s, NOV1, 0, 0).size).toBe(0);
    const all = pastureGrazing(s, NOV1, 10, 0);
    expect([...all.keys()]).toEqual([2, 1, 5]);
    expect(all.get(5)).toBe(1);
  });

  it('mladý příloh až po loukách a jen třetinou píce; louka letošní seče jen na otavě', () => {
    const young = part(6, { areaM2: 10_000, distanceM: 5, fallowSinceDay: at(620, 1, 1) });
    const hay = part(7, { areaM2: 10_000, distanceM: 1 });
    const s = withParts([...parts, young, hay]);
    s.hay = { kg: 0, mowing: { partIds: [7], required: 1, done: 0, yieldKg: 1500 } };
    // louky přílohu 2,5 ha a přirozené louky 1 ha napřed – mladý příloh až pak, ač je nejblíž
    const grazing = pastureGrazing(s, NOV1, 3.8, 1);
    expect([...grazing.keys()]).toEqual([2, 1, 5, 6]);
    // 0,3 ha zbylé potřeby = 1 ha mladého přílohu (třetina píce)
    expect(grazing.get(6)).toBeCloseTo(0.3 / PASTURE.youngFallowShare, 9);
    // louka v seči před sečí nic, po seči otava
    expect(pastureGrazing(s, NOV1, 10, 1).has(7)).toBe(false);
    s.hay.mowing!.done = 1;
    expect(pastureGrazing(s, NOV1, 10, 1).get(7)).toBe(1);
    const pasture = pastureParts(s, NOV1);
    expect(pasture.young.map((p) => p.id)).toEqual([6]);
    expect(pasture.mown.map((p) => p.id)).toEqual([7]);
  });

  it('pastva a zarůstání nezávisí na tom, po jakých kouscích se ves dopočítá', () => {
    const s = village(at(618, 3, 1));
    s.livestock!.land = { meadowHa: 0, forestHa: 5 };
    s.livestock!.herds = herds({ sheep: 5, goat: 3 });
    s.parts = [
      ...[1, 2, 3, 4].map((id) => part(id, { areaM2: 10_000, distanceM: 50 * id })),
      part(5, { areaM2: 10_000, distanceM: 20, fallowSinceDay: at(617, 9, 1) }),
    ];
    const end = at(621, 3, 1);
    const whole = advanceVillage(s, end, null);
    let chunked = s;
    for (let d = s.lastDay + 53; d < end; d += 53) chunked = advanceVillage(chunked, d, null);
    chunked = advanceVillage(chunked, end, null);
    expect(chunked.parts).toEqual(whole.parts);
    expect(chunked.livestock).toEqual(whole.livestock);
    expect(chunked.chronicle).toEqual(whole.chronicle);
  });

  it('spasený díl = připadla na něj aspoň polovina jeho plochy', () => {
    const s = withParts(parts);
    s.livestock!.land = { meadowHa: 0, forestHa: 0 };
    expect([...grazedPartIds(s, NOV1, 1.2)].sort()).toEqual([1, 2]);
    expect([...grazedPartIds(s, NOV1, 0.9)]).toEqual([2]);
  });

  it('síť pěšin a scéna: stáda na pastvě po dílech, v zimě krávy a voli v ohradě', () => {
    const s = village();
    s.parts = [part(1, { areaM2: 10_000 }), part(2, { areaM2: 10_000, distanceM: 400 })];
    s.livestock!.herds = herds({ cow: 1, sheep: 5 });
    // 1 kráva + 5 ovcí = 2 ha: oba díly
    expect([...pastureGrazedParts(s, at(620, 7, 1))].sort()).toEqual([1, 2]);
    s.pens = [
      {
        id: 90,
        cell: { x: 0, y: 0 },
        x: 0,
        z: 0,
        builtDay: at(605, 1, 1),
        team: null,
        training: null,
      },
    ];
    // v prosinci kráva v ohradě – ovce spasou jen nejbližší díl
    expect([...pastureGrazedParts(s, at(620, 12, 1))]).toEqual([1]);
  });
});

describe('zarostlý příloh – seno, orba, pěšiny', () => {
  it('křoviny se nesečou a rádlo je bez klučení nezorá; posečené díly letošní seče', () => {
    const meadow = part(1);
    const shrubs = part(2, { overgrowthYears: 6 });
    expect(isHayMeadow(meadow, NOV1)).toBe(true);
    expect(isHayMeadow(shrubs, NOV1)).toBe(false);
    // louka je drn, křoviny se klučí ručně (drn s kořeny zmizí) – pak je rádlo zorá běžně
    expect(hasSod(meadow, NOV1)).toBe(true);
    expect(hasSod(shrubs, NOV1)).toBe(false);
    const work = partWork(shrubs, NOV1, 0, true);
    expect(work.reclaim).toBeGreaterThan(0);
    expect(work.dig).toBe(0);
    const s = village();
    s.parts = [part(1), part(2), part(3)];
    s.hay = { kg: 0, mowing: { partIds: [1, 2, 3], required: 3, done: 1.5, yieldKg: 90 } };
    // seč došla do poloviny – první díl posečený, druhý rozpracovaný, třetí ne
    expect([...mownPartIds(s)].sort()).toEqual([1, 2]);
  });

  it('síť pěšin zná, kde se pase, a les vsi; klíč vzdáleností chůze se změní', () => {
    const landscape = makeLandscape();
    const s = village(at(620, 7, 1));
    s.fields = [{ id: 1 }];
    s.parts = [part(1, { areaM2: 10_000 }), part(2, { areaM2: 10_000, distanceM: 300 })];
    s.livestock!.herds = herds({ cow: 1 });
    const before = walkLayoutKey(s, s.lastDay);
    const v = pathVillageOf(s, s.lastDay, landscape);
    expect(v.fields[0]!.parts.map((p) => p.grazed)).toEqual([true, false]);
    s.woods = [{ cell: { x: 5, y: 5 }, areaM2: 225, surface: 'meadow', day: NOV1 }];
    expect(pathVillageOf(s, s.lastDay, landscape).woods).toEqual([
      { cell: { x: 5, y: 5 }, x: -37.5, z: -37.5, size: 15, surface: 'meadow' },
    ]);
    expect(walkLayoutKey(s, s.lastDay)).not.toBe(before);
  });
});

describe('roční krok zarůstání (1. 11.)', () => {
  it('nespasený a neposečený díl přidá rok, jen když ležel ladem celé období od 1. 4.', () => {
    const s = village();
    s.parts = [
      part(1),
      part(2, { overgrowthYears: 3 }),
      // ladem až od letošního září – rok se mu nepočítá
      part(3, { fallowSinceDay: at(620, 9, 1) }),
      part(4, { state: 'sown', fallowSinceDay: null }),
    ];
    expect(overgrowthDay(s, NOV1 - 1, GEOMETRY)).toEqual([]);
    expect(s.parts[0]!.overgrowthYears).toBeUndefined();
    expect(overgrowthDay(s, NOV1, GEOMETRY)).toEqual([]);
    expect(s.parts.map((p) => p.overgrowthYears)).toEqual([1, 4, undefined, undefined]);
  });

  it('pastva nebo seč ve fázi louky roky vynuluje, od křovin už ne', () => {
    const s = village();
    s.parts = [
      part(1, { overgrowthYears: 4, distanceM: 50 }),
      part(2, { overgrowthYears: 5, distanceM: 60 }),
      part(3, { overgrowthYears: 4, distanceM: 500 }),
      part(4, { overgrowthYears: 2, distanceM: 600 }),
    ];
    // jedna kráva spase 1 ha – díly 1 (louka) a 3; křoviny (2) se nepasou
    s.livestock!.herds = herds({ cow: 1 });
    s.hay = { kg: 0, mowing: { partIds: [4], required: 1, done: 1, yieldKg: 30 } };
    overgrowthDay(s, NOV1, GEOMETRY);
    expect(s.parts.map((p) => p.overgrowthYears)).toEqual([undefined, 6, undefined, undefined]);
    expect(partStage(s.parts[1]!, NOV1)).toBe('shrubs');
  });

  it('díl v lese (30 let) vypadne z pole – les vsi, kronika, prázdné pole zanikne', () => {
    const s = village();
    s.fields = [{ id: 1 }, { id: 2 }];
    s.parts = [
      part(11, { overgrowthYears: 29 }),
      part(12, { overgrowthYears: 29 }),
      part(13, { overgrowthYears: 10 }),
      part(21, { fieldId: 2, overgrowthYears: 29, surface: 'forest' }),
    ];
    s.constructions.push({
      id: 99,
      kind: 'field',
      startedDay: at(610, 1, 1),
      cost: 0,
      done: 0,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: 2,
    });
    const events = overgrowthDay(s, NOV1, GEOMETRY);
    expect(s.parts.map((p) => p.id)).toEqual([13]);
    expect(s.fields.map((f) => f.id)).toEqual([1]);
    expect(s.constructions.some((c) => c.id === 99)).toBe(false);
    expect(events).toEqual([
      { day: NOV1, kind: 'part-became-forest', partId: 11, fieldId: 1, parts: 2, gone: false },
      { day: NOV1, kind: 'part-became-forest', partId: 21, fieldId: 2, parts: 1, gone: true },
    ]);
    // políčko (11, 2) – střed ve světě: −120 + 11,5 × 15, −120 + 2,5 × 15
    expect(s.woods).toEqual([
      { cell: { x: 11, y: 2 }, x: 52.5, z: -82.5, areaM2: 225, surface: 'meadow', day: NOV1 },
      { cell: { x: 12, y: 2 }, x: 67.5, z: -82.5, areaM2: 225, surface: 'meadow', day: NOV1 },
      { cell: { x: 21, y: 2 }, x: 202.5, z: -82.5, areaM2: 225, surface: 'forest', day: NOV1 },
    ]);
  });

  it('simulace: zarůstání nezávisí na tom, po jakých kouscích se ves dopočítá', () => {
    const s = village(at(615, 6, 1));
    // vyčerpané přílohy – ves je neoseje, jen zarůstají
    const tired = { fertilityShare: 0.5 };
    s.parts = [
      part(1, { ...tired, overgrowthYears: 27 }),
      part(2, tired),
      part(3, { ...tired, overgrowthYears: 12 }),
    ];
    s.fields = [{ id: 1 }];
    const end = at(619, 2, 1);
    const whole = advanceVillage(s, end, null);
    let pieces = s;
    for (const day of [at(615, 11, 1), at(616, 3, 5), at(617, 11, 2), end]) {
      pieces = advanceVillage(pieces, day, null);
    }
    expect(pieces.parts).toEqual(whole.parts);
    expect(pieces.woods).toEqual(whole.woods);
    expect(whole.woods?.map((w) => w.cell)).toEqual([{ x: 1, y: 2 }]);
    expect(whole.parts.find((p) => p.id === 3)?.overgrowthYears).toBe(16);
  });
});

describe('nosnost – zarostlý příloh a les vsi', () => {
  it('křoviny a mladý les nejsou pastvinou, les vsi na louce dá les prasatům', () => {
    const s = village();
    s.livestock!.land = { meadowHa: 20, forestHa: 10 };
    s.parts = [
      part(1, { areaM2: 10_000 }),
      part(2, { areaM2: 10_000, overgrowthYears: 6 }),
      part(3, { areaM2: 10_000, overgrowthYears: 16, surface: 'forest' }),
    ];
    s.woods = [
      { cell: { x: 5, y: 5 }, areaM2: 10_000, surface: 'meadow', day: NOV1 },
      { cell: { x: 6, y: 5 }, areaM2: 10_000, surface: 'forest', day: NOV1 },
    ];
    // louka 20 − křoviny na louce 1 ha − les vsi na louce 1 ha (příloh 1 je pastva)
    expect(pastureHa(s, NOV1)).toBeCloseTo(18, 9);
    // les 10 − mladý les na vymýceném lese (díl pole) + les vsi na louce
    expect(pigForestHa(s)).toBeCloseTo(10, 9);
  });
});

describe('les vsi – stromy', () => {
  const wood: VillageWood = {
    cell: { x: 12, y: 3 },
    x: 67.5,
    z: -67.5,
    areaM2: 225,
    surface: 'meadow',
    day: NOV1,
  };

  it('id stromu je stabilní podle políčka, místa stojí v čtverci', () => {
    expect(woodTreeId(wood.cell, 3)).toBeGreaterThanOrEqual(WOOD_TREE_ID_BASE);
    expect(woodTreeOf(woodTreeId(wood.cell, 3))).toEqual({ cell: { x: 12, y: 3 }, k: 3 });
    const spots = woodTreeSpots(wood);
    expect(spots).toHaveLength(woodTreeCount(wood));
    expect(spots).toHaveLength(5);
    for (const spot of spots) {
      expect(Math.abs(spot.x - wood.x!)).toBeLessThan(7.5);
      expect(Math.abs(spot.z - wood.z!)).toBeLessThan(7.5);
    }
    expect(woodTreeSpots({ ...wood, x: undefined, z: undefined })).toEqual([]);
  });

  it('dospělé stromy přibývají se stářím: 30 let jeden, 70 let všech pět', () => {
    expect(woodMatureTrees(wood, NOV1)).toBe(1);
    expect(woodMatureTrees(wood, at(640, 11, 1))).toBe(3);
    expect(woodMatureTrees(wood, at(660, 11, 1))).toBe(5);
  });

  it('stromy lesa jsou překážky nad vrstvou – pokácený pařez, odstraněný zmizí', () => {
    const s = village();
    s.woods = [wood];
    const ids = woodTreeSpots(wood).map((t) => t.id);
    s.felledTrees = [{ id: ids[0]!, day: NOV1 }];
    s.clearedObstacles = [{ id: ids[4]!, day: NOV1 }];
    const added = obstacleChangesAt(s, at(660, 11, 1)).added ?? [];
    expect(added.map((o) => [o.id, o.kind])).toEqual([
      // pokácený před 40 lety – z pařezu dorůstá nálet (mladý stromek)
      [ids[0], 'youngTree'],
      [ids[1], 'tree'],
      [ids[2], 'tree'],
      [ids[3], 'tree'],
    ]);
    expect((obstacleChangesAt(s, at(625, 11, 1)).added ?? [])[0]?.kind).toBe('stump');
  });

  it('pařez stromu lesa vsi se sazenicí od uhlíře dorůstá jako strom krajiny', () => {
    const s = village();
    s.woods = [wood];
    const id = woodTreeSpots(wood)[0]!.id;
    s.felledTrees = [{ id, day: NOV1 }];
    const kindAt = (day: number): string | undefined =>
      (obstacleChangesAt(s, day).added ?? []).find((o) => o.id === id)?.kind;
    expect(kindAt(NOV1 + 10)).toBe('stump');
    expect(plantOnStump(s, id, NOV1 + 10)).toBe(true);
    expect(kindAt(NOV1 + 20)).toBe('youngTree');
    const grown = NOV1 + 10 + Math.ceil(BEECH_PLANTING.matureYears * 365.25) + 1;
    expect(kindAt(grown)).toBe('tree');
  });

  it('dospělé stromy lesa jde kácet na dřevo – nejbližší první, počítají se do zásoby', () => {
    const placements: ObstaclePlacement[] = [
      { id: 7, kind: 'tree', look: 'beech-1', x: -100, z: -100, rotation: 0, scale: 1 },
    ];
    const layer = packObstacles(placements, 16, 15);
    const s = village(at(660, 11, 1));
    s.woods = [wood];
    const changes = obstacleChangesAt(s, s.lastDay);
    const near = nearestMatureTrees(layer, changes, { x: 60, z: -60 }, 3);
    expect(near.map((t) => t.id).every((id) => id >= WOOD_TREE_ID_BASE)).toBe(true);
    expect(near).toHaveLength(3);
    expect(availableTrees(layer, s, s.lastDay)).toBe(6);
    // duby pro modlu a svatyni jen z lesa krajiny
    expect(availableTrees(layer, s, s.lastDay, 'oaks')).toBe(0);
    // uhlíř pálí i les vsi (smíšený les, dřevo vsi) – buk krajiny a pět stromů lesa vsi
    expect(availableTrees(layer, s, s.lastDay, 'beeches')).toBe(6);
    const forBurner = nearestMatureTrees(layer, changes, { x: 60, z: -60 }, 2, new Set(), isBeech);
    expect(forBurner.every((t) => t.id >= WOOD_TREE_ID_BASE)).toBe(true);
    expect(woodSupply(s, layer)).toBe(6);
  });

  it('pole vymýtí les vsi: povrch les, stromy v ceně, za dospělé klády; jiné stavby ne', () => {
    const landscape = makeLandscape();
    const layer = packObstacles([], 16, 15);
    const s = village(at(660, 11, 1));
    s.parts = [];
    s.fields = [];
    s.woods = [{ ...wood, cell: { x: 9, y: 9 }, x: 15 + 7.5, z: 15 + 7.5 }];
    const home = [{ x: 0, z: 0, rotation: 0 }];
    const preview = fieldPartsFromCells(
      landscape,
      placementVillageOf(s, s.lastDay),
      block(8, 9, 2, 3),
      home,
      layer,
    );
    expect(preview.check.ok).toBe(true);
    const onWood = preview.parts.find((p) => p.cell?.x === 9 && p.cell.y === 9)!;
    expect(onWood.surface).toBe('forest');
    expect(onWood.trees).toBe(5);
    expect(onWood.obstacleCost).toBe(0);
    expect(preview.surfaceCounts).toEqual({ meadow: 5, forest: 1 });
    // sad ani obydlí na les vsi nesmí
    const orchard = orchardPartsFromCells(
      landscape,
      placementVillageOf(s, s.lastDay),
      [{ x: 9, y: 9 }],
      home,
      layer,
    );
    expect(orchard.check.ok).toBe(false);
    const dwelling = checkDwellingPlacement(
      landscape,
      placementVillageOf(s, s.lastDay),
      'zemnice',
      { x: 22.5, z: 22.5, rotation: 0 },
      layer,
    );
    expect(dwelling.ok).toBe(false);
    expect(dwelling.reason).toContain('les');

    // založení pole: díl na lese se vymýtí, les zmizí, stromy dají klády
    const founded = foundField(s, s.lastDay, { parts: preview.parts });
    expect(founded.woods).toHaveLength(1);
    const logsBefore = founded.woodLogs ?? 0;
    const done = advanceVillage(founded, s.lastDay + 400, layer);
    expect(done.woods).toBeUndefined();
    expect((done.woodLogs ?? 0) - logsBefore).toBeGreaterThan(4);
    expect(done.parts.find((p) => p.cell?.x === 9 && p.cell.y === 9)?.surface).toBe('forest');
  });

  it('les vsi a cesty se nebijí: strom u cesty ani jabloň do lesa vsi, pěšina obchází jeho stromy', () => {
    const landscape = makeLandscape();
    const s = village(at(660, 11, 1));
    s.parts = [];
    s.fields = [];
    s.woods = [{ ...wood, cell: { x: 2, y: 2 }, x: -82.5, z: -82.5 }];
    const blocked = plantingBlocker(s, landscape);
    expect(blocked(-82.5, -82.5)).toBe(true);
    expect(blocked(-82.5 + 45, -82.5)).toBe(false);
    const window = pathWindowFor(landscape, { minX: -105, minZ: -105, maxX: -60, maxZ: -60 });
    const base = pathTerrainOf(landscape, window);
    const layer = packObstacles([], 16, 15);
    const without = withObstacles(base, layer, { removed: [], stumps: [], saplings: [] });
    const withWood = withObstacles(base, layer, obstacleChangesAt(s, s.lastDay));
    const sum = (t: typeof base): number => t.cost.reduce((a, c) => a + c, 0);
    expect(sum(withWood)).toBeGreaterThan(sum(without));
  });

  it('clearWoodAt odebere les i záznamy o jeho stromech', () => {
    const s = village();
    s.woods = [wood];
    const id = woodTreeId(wood.cell, 0);
    s.felledTrees = [
      { id, day: NOV1 },
      { id: 5, day: NOV1 },
    ];
    s.clearedObstacles = [{ id: id + 1, day: NOV1 }];
    clearWoodAt(s, wood.cell);
    expect(s.woods).toBeUndefined();
    expect(s.felledTrees).toEqual([{ id: 5, day: NOV1 }]);
    expect(s.clearedObstacles).toEqual([]);
  });

  it('kopie stavu zkopíruje les vsi a roky zarůstání jako structuredClone', () => {
    const s = village();
    s.woods = [wood];
    s.parts = [part(1, { overgrowthYears: 7 })];
    const copy = cloneState(s);
    expect(copy).toEqual(structuredClone(s));
    copy.woods![0]!.cell.x = 99;
    expect(s.woods[0]!.cell.x).toBe(12);
  });
});
