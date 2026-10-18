import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  obstacleIndex,
  obstacleSpecies,
  packObstacles,
  type ObstacleLayer,
  type ObstaclePlacement,
} from '../../landscape';
import { foundVillage } from '../actions';
import { homeKilnCenter, kilnWalkFactor, startKiln } from '../charcoal';
import { craftStocks, newWorkshop, restingBurners, workCrafts, type WorkshopDay } from '../crafts';
import { felledTreeStage, obstacleChangesAt, plantOnStump, saplingGrowth } from '../obstacles';
import { NO_CRAFTS } from '../productivity';
import { BEECH_PLANTING, CHARCOAL_KILN, CRAFT_BASE } from '../rules';
import { advanceVillage } from '../simulate';
import type { Craft, Person, Position, VillageState } from '../types';
import { isTreeStanding, nearestMatureTrees, reservedTrees } from '../wood';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
/** 1. 10. – okno výsadby (září–listopad), uhlíř může hned sázet. */
const DAY = at(600, 10, 1);
const YEAR = 365.25;
const BURNER = 50;
const SMITH = 51;
/** Uhlíř 40 m na východ – milíř u zemnice (−9, +3 m) ≈ 29 m od okraje lesa. */
const NEAR_FOREST = { x: 40, z: 0, rotation: 0 };
/** Uhlíř daleko od lesa – první buk ≈ 270 m od milíře u dílny, milíř bude v lese. */
const FAR_FROM_FOREST = { x: -200, z: 0, rotation: 0 };

/** Les na východ: stromy po 4 m od x = 60 m do 340 m, buky (sudé id) a duby (liché) střídavě. */
function mixedForest(): ObstacleLayer {
  const trees: ObstaclePlacement[] = [];
  let id = 1;
  for (let x = 60; x <= 340; x += 4) {
    for (let z = -100; z <= 100; z += 4) {
      trees.push({
        id,
        kind: 'tree',
        look: id % 2 === 0 ? 'beech-1' : 'oak-1',
        x,
        z,
        rotation: 0,
        scale: 1,
      });
      id++;
    }
  }
  return packObstacles(trees, 128, 15);
}
const forest = mixedForest();
const oaksOnly = packObstacles(
  [{ id: 1, kind: 'tree', look: 'oak-1', x: 60, z: 0, rotation: 0, scale: 1 }],
  128,
  15,
);

const person = (id: number, years: number, dwellingId: number, day = DAY): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR),
  dwellingId,
});

function addWorkshop(
  s: VillageState,
  craft: Craft,
  id: number,
  position: Position,
  firstPerson: number,
): void {
  s.dwellings.push({
    id,
    type: CRAFT_BASE[craft],
    builtDay: s.lastDay,
    condition: 1,
    position: { ...position },
    workshop: newWorkshop(craft),
  });
  s.people.push(person(firstPerson, 24, id, s.lastDay), person(firstPerson + 1, 22, id, s.lastDay));
}

/** Ves s plnou domácností, uhlířem (id 50) a volitelně kovářem (id 51) – oba po dvou dospělých. */
function village(burnerAt: Position = NEAR_FOREST, smith = true, day = DAY): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [25, 25, 20, 19, 5, 3].map((age, i) => person(2 + i, age, 1, day));
  s.constructions = [];
  s.storesKg = 50_000;
  s.lastDay = day;
  s.nextId = 100;
  addWorkshop(s, 'burner', BURNER, burnerAt, 60);
  if (smith) addWorkshop(s, 'smith', SMITH, { x: 40, z: 40, rotation: 0 }, 70);
  return s;
}

const burnerOf = (s: VillageState): NonNullable<VillageState['dwellings'][number]['workshop']> =>
  s.dwellings.find((d) => d.id === BURNER)!.workshop!;

/** Dny práce dílen (bez zbytku simulace) – vrátí práci uhlíře po dnech. */
function burnerDays(s: VillageState, days: number, layer: ObstacleLayer | null): WorkshopDay[] {
  const out: WorkshopDay[] = [];
  for (let i = 1; i <= days; i++) {
    const day = s.lastDay + i;
    const done = workCrafts(s, day, layer, NO_CRAFTS, 1);
    const burner = done.find((w) => w.dwellingId === BURNER);
    if (burner) out.push(burner);
  }
  return out;
}

/** Den, kdy uhlíř vytahá milíř (index v `days`), nebo −1. */
const finished = (days: readonly WorkshopDay[]): number => days.findIndex((d) => d.producedKg > 0);

describe('uhlíř – buky do milíře (crafts.md – Uhlíř)', () => {
  it('vybere nejbližší dospělé nevyhrazené buky a vyhradí je', () => {
    const s = village();
    burnerDays(s, 1, forest);
    const kiln = burnerOf(s).kiln!;
    expect(kiln.site).toBeNull();
    expect(kiln.trees).toHaveLength(CHARCOAL_KILN.trees);
    const ids = kiln.trees.map((t) => t.id!);
    for (const id of ids) expect(obstacleSpecies(forest, obstacleIndex(forest, id))).toBe('beech');
    // právě ty nejbližší buky k milíři u dílny
    const nearest = nearestMatureTrees(
      forest,
      obstacleChangesAt(s, DAY),
      homeKilnCenter(NEAR_FOREST),
      CHARCOAL_KILN.trees,
      new Set(),
      (layer, i) => obstacleSpecies(layer, i) === 'beech',
    ).map((t) => t.id);
    expect(ids).toEqual(nearest);
    const reserved = reservedTrees(s);
    for (const id of ids) expect(reserved.has(id)).toBe(true);
    // blízké buky – kácení a dovoz bez přirážky
    for (const t of kiln.trees) expect(t.cost).toBeCloseTo(2, 9);
  });

  it('jiný uhlíř vyhrazené buky nekácí', () => {
    const s = village();
    addWorkshop(s, 'burner', 52, { x: 40, z: -20, rotation: 0 }, 80);
    // dva kováři – uhlí je potřeba na dva milíře
    addWorkshop(s, 'smith', 53, { x: 40, z: 70, rotation: 0 }, 90);
    burnerDays(s, 1, forest);
    const first = burnerOf(s).kiln!.trees.map((t) => t.id);
    const second = s.dwellings.find((d) => d.id === 52)!.workshop!.kiln!.trees.map((t) => t.id);
    expect(first.filter((id) => second.includes(id))).toEqual([]);
  });

  it('bez buků čeká na dřevo – duby nekácí', () => {
    const s = village();
    burnerDays(s, 2, oaksOnly);
    expect(burnerOf(s).activity).toBe('no-wood');
    expect(burnerOf(s).kiln ?? null).toBeNull();
    expect(s.felledTrees ?? []).toEqual([]);
  });
});

describe('uhlíř – práce po fázích', () => {
  it('kácení a příprava dřeva, stavba, 8 dní pálení, vytahání – pak 1,8 t uhlí do zásoby', () => {
    const s = village();
    const days: WorkshopDay[] = [];
    for (let i = 1; i <= 400 && finished(days) < 0; i++) {
      days.push(
        ...workCrafts(s, DAY + i, forest, NO_CRAFTS, 1).filter((w) => w.dwellingId === BURNER),
      );
    }
    const end = finished(days);
    expect(end).toBeGreaterThan(0);
    const until = days;
    const sum = (key: 'felling' | 'making' | 'planting'): number =>
      until.reduce((total, d) => total + (d[key] ?? 0), 0);
    const n = CHARCOAL_KILN.trees;
    // kácení a dovoz 2 čd + příprava 6 čd na buk
    expect(sum('felling')).toBeCloseTo(n * (2 + CHARCOAL_KILN.prepManDaysPerTree), 6);
    // stavba a vytahání po 2 čd na buk, pálení 8 dní celou prací domácnosti (0,9 čd)
    const burning = until.filter((d) => d.making > 0 && d.felling === 0);
    expect(sum('making')).toBeCloseTo(
      n * (CHARCOAL_KILN.buildManDaysPerTree + CHARCOAL_KILN.drawManDaysPerTree) +
        CHARCOAL_KILN.burnDays * 0.9,
      6,
    );
    expect(burning.length).toBeGreaterThanOrEqual(CHARCOAL_KILN.burnDays);
    expect(until[end]!.producedKg).toBe(n * 120);
    // buky skácené – pařezy, které uhlíř zapsal k obnově
    expect(s.felledTrees).toHaveLength(n);
  });

  it('pálící milíř zabere celý den – uhlíř ho hlídá ve dne i v noci 8 dní', () => {
    const s = village();
    let burningDays = 0;
    for (let i = 1; i <= 400; i++) {
      const [burner] = workCrafts(s, DAY + i, forest, NO_CRAFTS, 1);
      if (burnerOf(s).activity === 'burning') {
        burningDays++;
        // hlídání vezme celou práci dne – nic se nekácí ani nesází
        expect(burner!.making).toBeCloseTo(0.9, 9);
        expect(burner!.felling).toBe(0);
      }
      if (burnerOf(s).kiln === null && burningDays > 0) break;
    }
    expect(burningDays).toBe(CHARCOAL_KILN.burnDays);
  });

  it('daleko od lesa staví milíř v lese u dávky a za chůzi platí přirážku', () => {
    const s = village(FAR_FROM_FOREST);
    const days = burnerDays(s, 1, forest);
    const kiln = burnerOf(s).kiln!;
    expect(kiln.site).not.toBeNull();
    // milíř stojí u prvního buku, ostatní buky dávky jsou blízko něj
    const first = kiln.trees[0]!.id!;
    const index = obstacleIndex(forest, first);
    expect(kiln.site).toEqual({ x: forest.x[index]!, z: forest.z[index]! });
    for (const t of kiln.trees) expect(t.cost).toBeCloseTo(2, 9);
    const factor = kilnWalkFactor(kiln, FAR_FROM_FOREST);
    expect(factor).toBeGreaterThan(1.1);
    // práce dne jde na kácení prvního buku – efektivně 0,9 / přirážka
    expect(kiln.done).toBeCloseTo(0.9 / factor, 9);
    expect(days[0]!.kilnSite).toEqual(kiln.site);
  });

  it('s krajinou měří chůzi k lesnímu milíři a dovoz dřeva přes výpočet chůze', () => {
    const s = village(FAR_FROM_FOREST);
    const after = advanceVillage(s, DAY + 1, forest, makeLandscape({ size: 128 }));
    const kiln = burnerOf(after).kiln!;
    expect(kiln.site).not.toBeNull();
    const straight = Math.hypot(kiln.site!.x - FAR_FROM_FOREST.x, kiln.site!.z - FAR_FROM_FOREST.z);
    // na louce bez cest je chůze aspoň vzdušná vzdálenost
    expect(kiln.walkM).toBeGreaterThanOrEqual(straight - 1e-6);
    expect(kiln.walkM).toBeLessThan(straight * 1.2);
    expect(kilnWalkFactor(kiln, FAR_FROM_FOREST)).toBeGreaterThan(1.1);
  });

  it('práce u lesního milíře jde do rozdělení práce dne k milíři', () => {
    const s = village(FAR_FROM_FOREST);
    for (let i = 1; i <= 400; i++) {
      const next = advanceVillage(s, DAY + i, forest);
      Object.assign(s, next);
      const shares = s.labor?.shares ?? [];
      const craft = shares.find((x) => x.activity === 'craft' && x.target.kind === 'kiln');
      if (craft) {
        expect(craft.target).toMatchObject({ kind: 'kiln', id: BURNER });
        return;
      }
    }
    throw new Error('Uhlíř u lesního milíře nepracoval.');
  });
});

describe('uhlíř – jen kolik je potřeba (návrh Clauda)', () => {
  it('bez kováře uhlí nepálí a pracuje se vsí', () => {
    const s = village(NEAR_FOREST, false);
    expect(restingBurners(s, DAY + 1, NO_CRAFTS)).toEqual(new Set([BURNER]));
    const after = advanceVillage(s, DAY + 1, forest);
    expect(burnerOf(after).activity).toBe('resting');
    expect(burnerOf(after).kiln ?? null).toBeNull();
    // domácnost uhlíře přidá vsi práci
    const working = village(NEAR_FOREST, false);
    working.people = working.people.filter((p) => p.dwellingId !== BURNER);
    const without = advanceVillage(working, DAY + 1, forest);
    expect(after.commonLaborHistory.at(-1)!).toBeGreaterThan(without.commonLaborHistory.at(-1)!);
  });

  it('se zásobou na rok spotřeby kováře nový milíř nezačne', () => {
    const s = village();
    // kovář: 0,9 čd denně → 0,09 kg nástrojů → 4,5 kg uhlí denně, ročně ≈ 1 643 kg
    s.crafts = { charcoalKg: 1700, toolsKg: 0, potteryKg: 0 };
    expect(restingBurners(s, DAY + 1, NO_CRAFTS).has(BURNER)).toBe(true);
    s.crafts.charcoalKg = 1500;
    expect(restingBurners(s, DAY + 1, NO_CRAFTS).has(BURNER)).toBe(false);
  });

  it('rozdělaný milíř dodělá, i když uhlí přibylo', () => {
    const s = village();
    burnerDays(s, 1, forest);
    expect(burnerOf(s).kiln).toBeTruthy();
    s.crafts = { charcoalKg: 10_000, toolsKg: 0, potteryKg: 0 };
    expect(restingBurners(s, DAY + 2, NO_CRAFTS).has(BURNER)).toBe(false);
  });
});

describe('uhlíř – obnova lesa (mladé buky)', () => {
  it('na pařezy skácených buků sází v okně výsadby mladé buky', () => {
    const s = village();
    const days = burnerDays(s, 30, forest);
    const planted = days.flatMap((d) => d.plantedTrees ?? []);
    expect(planted.length).toBeGreaterThan(0);
    const felled = new Map((s.felledTrees ?? []).map((f) => [f.id, f]));
    for (const id of planted) expect(felled.get(id)?.planted).toBeDefined();
    // sazenice je hned mladý stromek
    const changes = obstacleChangesAt(s, DAY + 31);
    for (const id of planted) expect(changes.saplings).toContain(id);
  });

  it('mimo okno výsadby nesází – pařezy počkají na jaro', () => {
    const winter = at(601, 1, 10);
    const s = village(NEAR_FOREST, true, winter);
    const days = burnerDays(s, 20, forest);
    expect(days.some((d) => (d.planting ?? 0) > 0)).toBe(false);
    expect((burnerOf(s).toPlant ?? []).length).toBeGreaterThan(0);
  });

  it('sazenice za 60 let dospěje – buk jde znovu do milíře', () => {
    const s = village();
    s.felledTrees = [{ id: 2, day: DAY }];
    expect(plantOnStump(s, 2, DAY)).toBe(true);
    expect(plantOnStump(s, 2, DAY)).toBe(false);
    const entry = s.felledTrees[0]!;
    expect(felledTreeStage(entry, DAY + 1)).toBe('sapling');
    expect(saplingGrowth(entry, DAY + Math.round(30 * YEAR))).toBeCloseTo(0.5, 2);
    const mature = DAY + Math.ceil(BEECH_PLANTING.matureYears * YEAR) + 1;
    expect(felledTreeStage(entry, mature - 2)).toBe('sapling');
    expect(felledTreeStage(entry, mature)).toBe('grown');
    expect(isTreeStanding(s, 2, mature)).toBe(true);
    // pařez bez sazenice dorůstá z náletu jako dřív (30 let pařez, 70 let dospělý)
    const natural = { id: 4, day: DAY };
    expect(felledTreeStage(natural, DAY + Math.ceil(29 * YEAR))).toBe('stump');
    expect(felledTreeStage(natural, DAY + Math.ceil(69 * YEAR))).toBe('sapling');
    expect(felledTreeStage(natural, DAY + Math.ceil(70 * YEAR) + 1)).toBe('grown');
  });

  it('mýtina roste – další milíře mají buky dál a uhlíř chodí dál', () => {
    const s = village();
    const meanDistance: number[] = [];
    const home = homeKilnCenter(NEAR_FOREST);
    for (let batch = 0; batch < 4; batch++) {
      const kiln = startKiln(s, { position: NEAR_FOREST }, DAY, forest)!;
      const distances = kiln.trees.map((t) => {
        const i = obstacleIndex(forest, t.id!);
        return Math.hypot(forest.x[i]! - home.x, forest.z[i]! - home.z);
      });
      meanDistance.push(distances.reduce((a, b) => a + b, 0) / distances.length);
      // dávku rovnou skácet (pařezy)
      s.felledTrees = [
        ...(s.felledTrees ?? []),
        ...kiln.trees.map((t) => ({ id: t.id!, day: DAY })),
      ];
    }
    for (let i = 1; i < meanDistance.length; i++) {
      expect(meanDistance[i]!).toBeGreaterThan(meanDistance[i - 1]!);
    }
  });
});

describe('uhlíř – simulace', () => {
  it('výsledek nezávisí na kouscích dopočítání', () => {
    const end = DAY + 2 * 365;
    const whole = advanceVillage(village(), end, forest);
    let chunked = village();
    for (const to of [DAY + 40, DAY + 41, DAY + 200, DAY + 333, DAY + 500, end]) {
      chunked = advanceVillage(chunked, to, forest);
    }
    expect(chunked).toEqual(whole);
    // uhlí vzniklo a kovář z něj kuje
    expect(whole.crafts!.toolsKg).toBeGreaterThan(0);
    expect((whole.felledTrees ?? []).some((f) => f.planted !== undefined)).toBe(true);
  });

  it('stav po JSON (uložení do databáze) se dopočítá stejně', () => {
    const s = advanceVillage(village(), DAY + 100, forest);
    expect(burnerOf(s).kiln).toBeTruthy();
    const stored = JSON.parse(JSON.stringify(s)) as VillageState;
    expect(advanceVillage(stored, DAY + 300, forest)).toEqual(advanceVillage(s, DAY + 300, forest));
  });

  it('starší dílna uhlíře (kácení po stromu, palivo) se převede – dřevo se dopálí', () => {
    const s = village();
    const burner = burnerOf(s);
    burner.felling = { id: 4, cost: 2, done: 1 };
    burner.fuelKg = 50;
    const after = advanceVillage(s, DAY + 1, forest);
    const migrated = burnerOf(after);
    expect(migrated.felling).toBeNull();
    expect(migrated.fuelKg).toBe(0);
    // 50 kg uhlí z paliva – kovář si část hned vzal
    // (nástroje se ten den trochu opotřebí)
    expect(craftStocks(after).charcoalKg + craftStocks(after).toolsKg * 50).toBeCloseTo(50, 1);
  });
});
