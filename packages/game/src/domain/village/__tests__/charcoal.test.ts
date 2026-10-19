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
import {
  charcoalStockKg,
  homeKilnCenter,
  charcoalDrawKg,
  kilnCharcoalKg,
  kilnLeadDays,
  kilnWalkFactor,
  migrateKiln,
  startKiln,
  takeCharcoal,
} from '../charcoal';
import {
  craftStocks,
  newWorkshop,
  restingCrafters,
  smithsCharcoalPerYear,
  smithsForgeCharcoalKg,
  workCrafts,
  type WorkshopDay,
} from '../crafts';
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

/** Dny práce dílen, dokud milíř uhlíře není vypálený – vrátí práci uhlíře po dnech. */
function untilBurnt(s: VillageState, layer: ObstacleLayer | null): WorkshopDay[] {
  const out: WorkshopDay[] = [];
  for (let i = 1; i <= 400 && burnerOf(s).kiln?.stage !== 'draw'; i++) {
    out.push(
      ...workCrafts(s, s.lastDay + i, layer, NO_CRAFTS, 1).filter((w) => w.dwellingId === BURNER),
    );
  }
  s.lastDay += out.length;
  return out;
}

/** Vypálený milíř s celou dávkou (15 buků, 1,8 t uhlí) u dílny – bez polohy buků. */
const burntKiln = (): NonNullable<ReturnType<typeof burnerOf>['kiln']> => ({
  site: null,
  trees: Array.from({ length: CHARCOAL_KILN.trees }, () => ({ id: null, cost: 2 })),
  stage: 'draw',
  prepared: CHARCOAL_KILN.trees,
  done: 0,
  charcoalKg: CHARCOAL_KILN.trees * 120,
});

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
  it('kácení a příprava dřeva, stavba, 8 dní pálení – vypálený milíř drží 1,8 t uhlí', () => {
    // bez kováře – uhlí nikdo neodebírá, práce jde jen do milíře
    const s = village(NEAR_FOREST, false);
    const days = untilBurnt(s, forest);
    expect(burnerOf(s).kiln?.stage).toBe('draw');
    const sum = (key: 'felling' | 'making' | 'planting'): number =>
      days.reduce((total, d) => total + (d[key] ?? 0), 0);
    const n = CHARCOAL_KILN.trees;
    // kácení a dovoz 2 čd + příprava 6 čd na buk
    expect(sum('felling')).toBeCloseTo(n * (2 + CHARCOAL_KILN.prepManDaysPerTree), 6);
    // stavba 2 čd na buk, pálení 8 dní celou prací domácnosti (1,5 čd)
    expect(sum('making')).toBeCloseTo(
      n * CHARCOAL_KILN.buildManDaysPerTree + CHARCOAL_KILN.burnDays * 1.5,
      6,
    );
    // uhlí zůstává ve vypáleném milíři – u kováře nic, zásoba vsi 1,8 t
    expect(kilnCharcoalKg(burnerOf(s).kiln)).toBe(n * 120);
    expect(craftStocks(s).charcoalKg).toBe(0);
    expect(charcoalStockKg(s)).toBe(n * 120);
    expect(days.every((d) => d.producedKg === 0)).toBe(true);
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
        expect(burner!.making).toBeCloseTo(1.5, 9);
        expect(burner!.felling).toBe(0);
      }
      if (burnerOf(s).kiln?.stage === 'draw') break;
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
    // práce dne jde na kácení prvního buku – efektivně 1,5 / přirážka
    expect(kiln.done).toBeCloseTo(1.5 / factor, 9);
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

describe('uhlíř – milíř stojí vždy (crafts.md – Milíř stojí vždy)', () => {
  it('vypálený milíř se rozebírá, jak kovář uhlí spotřebuje – rozebraný zmizí, staví se nový', () => {
    const s = village();
    burnerOf(s).kiln = burntKiln();
    s.crafts = { charcoalKg: 0, toolsKg: 0, potteryKg: 0 };
    const forge = smithsForgeCharcoalKg(s, DAY + 1, NO_CRAFTS);
    const total = charcoalStockKg(s);
    let drawn = 0;
    let drawLabor = 0;
    let drawDays = 0;
    let previous = kilnCharcoalKg(burnerOf(s).kiln);
    let forged = 0;
    let day = DAY;
    for (; day < DAY + 2000 && burnerOf(s).kiln?.stage === 'draw';) {
      day++;
      const done = workCrafts(s, day, forest, NO_CRAFTS, 1);
      const burner = done.find((w) => w.dwellingId === BURNER);
      forged += done.find((w) => w.dwellingId === SMITH)?.producedKg ?? 0;
      // ves nástroje hned rozdá a opotřebí – kovář kove dál
      s.crafts!.toolsKg = 0;
      const inKiln = kilnCharcoalKg(burnerOf(s).kiln);
      if (burner && burner.producedKg > 0) {
        drawDays++;
        drawn += burner.producedKg;
        drawLabor += burner.making;
        // nejvýš uhlí na 30 dní kování
        expect(burner.producedKg).toBeLessThanOrEqual(forge * CHARCOAL_KILN.drawBatchDays + 1e-6);
        expect(burnerOf(s).activity).toBe('drawing');
      } else if (burnerOf(s).kiln?.stage === 'draw') {
        // milíř stojí a čeká – uhlí v něm neubývá
        expect(inKiln).toBe(previous);
      }
      previous = inKiln;
      // uhlí se neztrácí: v milíři + u kováře + spálené v nástrojích
      expect(charcoalStockKg(s) + forged * 50).toBeCloseTo(total, 6);
    }
    expect(burnerOf(s).kiln ?? null).toBeNull();
    expect(drawn).toBeCloseTo(total, 6);
    // nosí jednou za čas, ne každý den
    expect(drawDays).toBeLessThan((day - DAY) / 5);
    // vytahání jako dřív – 2 čd na 120 kg uhlí
    expect(drawLabor).toBeCloseTo((total / 120) * CHARCOAL_KILN.drawManDaysPerTree, 6);
    // milíř stojí vždy – rozebraný zmizí a od dalšího dne uhlíř staví nový
    workCrafts(s, day + 1, forest, NO_CRAFTS, 1);
    expect(burnerOf(s).kiln?.stage).toBe('wood');
  });

  it('zbytek, který stačí jen na přípravu dalšího milíře, vytahá celý a začne nový', () => {
    const s = village(NEAR_FOREST, true, at(601, 1, 10));
    const day = s.lastDay + 1;
    const kiln = burntKiln();
    burnerOf(s).kiln = kiln;
    // u kováře uhlí na dnešek dost – plný milíř stojí a čeká
    s.crafts = { charcoalKg: smithsForgeCharcoalKg(s, day, NO_CRAFTS), toolsKg: 0, potteryKg: 0 };
    expect(restingCrafters(s, day, NO_CRAFTS).get(BURNER)).toBe('resting');
    // kolik uhlí kovář spálí, než uhlíř připraví a vypálí nový milíř
    const perDay = smithsCharcoalPerYear(s, day, NO_CRAFTS) / 365;
    const lead = kilnLeadDays(kiln, NEAR_FOREST, 1.5);
    // 15 buků × (2 + 6 + 2) čd po 1,5 čd za den + 8 dní pálení
    expect(lead).toBeCloseTo((15 * 10) / 1.5 + CHARCOAL_KILN.burnDays, 6);
    expect(kilnLeadDays(kiln, NEAR_FOREST, 0)).toBe(0);
    expect(charcoalDrawKg(kiln, 1, 0.5, 0)).toBe(0);
    expect(charcoalDrawKg(kiln, 1, 0.5, 1801)).toBe(1800);
    // v milíři zbývá méně – uhlíř vytahá zbytek, ač u kováře na dnešek stačí
    kiln.charcoalKg = Math.max(1, perDay * lead - s.crafts.charcoalKg - 1);
    expect(restingCrafters(s, day, NO_CRAFTS).has(BURNER)).toBe(false);
    // vytahá ho den po dni, kolik stihne (kovář dál kove z uhlí u sebe)
    const total = charcoalStockKg(s);
    let d = day;
    for (; d < day + 60 && burnerOf(s).kiln; d++) {
      workCrafts(s, d, forest, NO_CRAFTS, 1);
      if (burnerOf(s).kiln) expect(burnerOf(s).activity).toBe('drawing');
    }
    expect(burnerOf(s).kiln ?? null).toBeNull();
    expect(craftStocks(s).charcoalKg + craftStocks(s).toolsKg * 50).toBeCloseTo(total, 6);
    // od dalšího dne staví nový
    workCrafts(s, d, forest, NO_CRAFTS, 1);
    expect(burnerOf(s).kiln?.stage).toBe('wood');
  });

  it('bez kováře vypálený milíř stojí a čeká – další uhlíř nestaví a pracuje se vsí', () => {
    const s = village(NEAR_FOREST, false);
    // milíř stojí vždy – první postaví i bez kováře
    expect(restingCrafters(s, DAY + 1, NO_CRAFTS).has(BURNER)).toBe(false);
    untilBurnt(s, forest);
    const felled = s.felledTrees!.length;
    // mimo okno výsadby, bez pařezů k sázení – jen čeká
    const winter = at(601, 1, 10);
    s.lastDay = winter - 1;
    delete burnerOf(s).toPlant;
    expect(restingCrafters(s, winter, NO_CRAFTS)).toEqual(new Map([[BURNER, 'resting']]));
    const after = advanceVillage(s, winter + 30, forest);
    expect(burnerOf(after).activity).toBe('resting');
    expect(kilnCharcoalKg(burnerOf(after).kiln)).toBe(CHARCOAL_KILN.trees * 120);
    expect(after.felledTrees!.length).toBe(felled);
    // domácnost uhlíře přidá vsi práci
    const working = structuredClone(s);
    working.people = working.people.filter((p) => p.dwellingId !== BURNER);
    const without = advanceVillage(working, winter, forest);
    const withBurner = advanceVillage(s, winter, forest);
    expect(withBurner.commonLaborHistory.at(-1)!).toBeGreaterThan(
      without.commonLaborHistory.at(-1)!,
    );
  });

  it('uhlí u kováře stačí na dnešní kování – uhlíř nenosí a pracuje se vsí', () => {
    const s = village(NEAR_FOREST, true, at(601, 1, 10));
    burnerOf(s).kiln = burntKiln();
    const day = s.lastDay + 1;
    s.crafts = { charcoalKg: 0, toolsKg: 0, potteryKg: 0 };
    expect(restingCrafters(s, day, NO_CRAFTS).has(BURNER)).toBe(false);
    s.crafts.charcoalKg = smithsForgeCharcoalKg(s, day, NO_CRAFTS);
    const resting = restingCrafters(s, day, NO_CRAFTS);
    expect(resting.get(BURNER)).toBe('resting');
    // kovář má uhlí – kove
    expect(resting.has(SMITH)).toBe(false);
  });

  it('kovář bez uhlí u sebe nečeká, když mu uhlíř dnes donese z vypáleného milíře', () => {
    const s = village(NEAR_FOREST, true, at(601, 1, 10));
    s.crafts = { charcoalKg: 0, toolsKg: 0, potteryKg: 0 };
    expect(restingCrafters(s, s.lastDay + 1, NO_CRAFTS).get(SMITH)).toBe('no-charcoal');
    burnerOf(s).kiln = burntKiln();
    expect(restingCrafters(s, s.lastDay + 1, NO_CRAFTS).has(SMITH)).toBe(false);
    const [burner, smith] = workCrafts(s, s.lastDay + 1, forest, NO_CRAFTS, 1);
    expect(burner!.producedKg).toBeGreaterThan(0);
    expect(smith!.producedKg).toBeGreaterThan(0);
  });

  it('rozdělaný milíř dodělá, i když uhlí přibylo', () => {
    const s = village();
    burnerDays(s, 1, forest);
    expect(burnerOf(s).kiln).toBeTruthy();
    s.crafts = { charcoalKg: 10_000, toolsKg: 0, potteryKg: 0 };
    expect(restingCrafters(s, DAY + 2, NO_CRAFTS).has(BURNER)).toBe(false);
  });

  it('prodané uhlí se bere napřed u kováře, pak z vypáleného milíře – rozebraný zmizí', () => {
    const s = village();
    burnerOf(s).kiln = burntKiln();
    s.crafts = { charcoalKg: 100, toolsKg: 0, potteryKg: 0 };
    expect(takeCharcoal(s, 300)).toBe(300);
    expect(craftStocks(s).charcoalKg).toBe(0);
    expect(kilnCharcoalKg(burnerOf(s).kiln)).toBe(1800 - 200);
    expect(takeCharcoal(s, 5000)).toBe(1600);
    expect(burnerOf(s).kiln).toBeNull();
    expect(charcoalStockKg(s)).toBe(0);
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
  it('výsledek nezávisí na kouscích dopočítání – i přes rozebírání a nový milíř', () => {
    const end = DAY + 3 * 365;
    const whole = advanceVillage(village(), end, forest);
    let chunked = village();
    for (const to of [DAY + 40, DAY + 41, DAY + 200, DAY + 333, DAY + 500, DAY + 800, end]) {
      chunked = advanceVillage(chunked, to, forest);
    }
    expect(chunked).toEqual(whole);
    // uhlí vzniklo, kovář z něj kuje a první milíř je rozebraný – stojí další
    expect(whole.crafts!.toolsKg).toBeGreaterThan(0);
    expect((whole.felledTrees ?? []).length).toBeGreaterThan(CHARCOAL_KILN.trees);
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

  it('starší milíř, ze kterého se uhlí vytahovalo najednou, je vypálený s celou dávkou', () => {
    const s = village(NEAR_FOREST, false, at(601, 1, 10));
    const old = burntKiln();
    delete old.charcoalKg;
    old.done = 17;
    burnerOf(s).kiln = old;
    s.crafts = { charcoalKg: 400, toolsKg: 0, potteryKg: 0 };
    // před převodem se počítá stejně – celá dávka v milíři, uhlí v zásobě je u kováře
    expect(charcoalStockKg(s)).toBe(1800 + 400);
    const after = advanceVillage(s, s.lastDay + 1, forest);
    const kiln = burnerOf(after).kiln!;
    expect(kiln).toMatchObject({ stage: 'draw', done: 0, charcoalKg: 1800 });
    expect(craftStocks(after).charcoalKg).toBe(400);
    // jednou – další převod nic nezmění
    const again = structuredClone(kiln);
    migrateKiln(again);
    expect(again).toEqual(kiln);
    // dopočítání po kouscích i po JSON stejně
    const end = s.lastDay + 120;
    let chunked = s;
    for (const to of [s.lastDay + 1, s.lastDay + 50, end]) {
      chunked = JSON.parse(JSON.stringify(advanceVillage(chunked, to, forest))) as VillageState;
    }
    expect(chunked).toEqual(advanceVillage(s, end, forest));
  });
});
