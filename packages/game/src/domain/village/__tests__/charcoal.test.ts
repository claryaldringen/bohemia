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
  charcoalFetchKg,
  charcoalStockKg,
  charcoalUsePerDay,
  homeKilnCenter,
  kilnCharcoalKg,
  kilnCrownTrees,
  kilnCycleDays,
  kilnLeadDays,
  kilnRemnantOvergrowth,
  kilnViewBlockers,
  kilnWalkFactor,
  migrateKiln,
  recordCharcoalUse,
  startKiln,
  startsNextKiln,
  takeCharcoal,
  updateKilnRemnants,
} from '../charcoal';
import {
  burnerPlans,
  craftStocks,
  newWorkshop,
  restingCrafters,
  smithsCharcoalPerYear,
  smithsForgeCharcoalKg,
  workCrafts,
  type WorkshopDay,
} from '../crafts';
import { findKilnSite } from '../kiln-site';
import {
  felledTreeStage,
  obstacleChangesAt,
  obstacleStatus,
  plantOnStump,
  saplingGrowth,
} from '../obstacles';
import { checkKilnSite, type PlacementVillage } from '../placement';
import { NO_CRAFTS } from '../productivity';
import {
  BEECH_PLANTING,
  CART_JOBS,
  CHARCOAL_BALANCE,
  CHARCOAL_KILN,
  CRAFT_BASE,
  KILN_SITE,
  MILIR,
} from '../rules';
import { advanceVillage } from '../simulate';
import type { CharcoalKiln, Craft, Person, Position, VillageState } from '../types';
import { isTreeStanding, nearestMatureTrees, reservedTrees } from '../wood';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
/** 1. 10. – okno výsadby (září–listopad), uhlíř může hned sázet. */
const DAY = at(600, 10, 1);
const YEAR = 365.25;
const BURNER = 50;
const SMITH = 51;
/** Uhlíř 40 m na východ – první buky ≈ 20 m od zemnice, milíř uprostřed dávky. */
const NEAR_FOREST = { x: 40, z: 0, rotation: 0 };
/** Uhlíř daleko od lesa – první buk ≈ 260 m od zemnice. */
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
const kilnsOf = (s: VillageState): CharcoalKiln[] => burnerOf(s).kilns ?? [];
const firstKiln = (s: VillageState): CharcoalKiln | undefined => kilnsOf(s)[0];

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

/** Dny práce dílen, dokud první milíř uhlíře není vypálený – vrátí práci uhlíře po dnech. */
function untilBurnt(s: VillageState, layer: ObstacleLayer | null): WorkshopDay[] {
  const out: WorkshopDay[] = [];
  for (let i = 1; i <= 400 && firstKiln(s)?.stage !== 'draw'; i++) {
    out.push(
      ...workCrafts(s, s.lastDay + i, layer, NO_CRAFTS, 1).filter((w) => w.dwellingId === BURNER),
    );
  }
  s.lastDay += out.length;
  return out;
}

/** Vypálený milíř s celou dávkou (15 buků, 1,8 t uhlí) u dávky na východ – bez polohy buků. */
const burntKiln = (id = 90): CharcoalKiln => ({
  id,
  site: { x: 70, z: 0 },
  trees: Array.from({ length: CHARCOAL_KILN.trees }, () => ({ id: null, cost: 2 })),
  stage: 'draw',
  prepared: CHARCOAL_KILN.trees,
  done: 0,
  charcoalKg: CHARCOAL_KILN.trees * 120,
});

/** Změřená spotřeba kovářů `perDay` kg za den za celý rok (crafts.md – Rovnováha). */
function measuredUse(s: VillageState, perDay: number, day: number): void {
  const size = CHARCOAL_BALANCE.bucketDays;
  const buckets = Math.floor(CHARCOAL_BALANCE.windowDays / size);
  s.charcoalUse = {
    from: day - 10,
    currentKg: perDay * 10,
    buckets: Array.from({ length: buckets }, () => perDay * size),
  };
}

describe('milíř u skácených buků (crafts.md – Milíř u skácených buků)', () => {
  it('vybere dávku buků u zemnice a milíř postaví uprostřed nich', () => {
    const s = village();
    burnerDays(s, 1, forest);
    const kiln = firstKiln(s)!;
    expect(kiln.id).toBeDefined();
    expect(kiln.startDay).toBe(DAY + 1);
    expect(kiln.trees).toHaveLength(CHARCOAL_KILN.trees);
    const ids = kiln.trees.map((t) => t.id!);
    for (const id of ids) expect(obstacleSpecies(forest, obstacleIndex(forest, id))).toBe('beech');
    // dávka = buky nejblíž prvnímu buku u zemnice
    const changes = obstacleChangesAt(s, DAY);
    const isBeech = (layer: ObstacleLayer, i: number): boolean =>
      obstacleSpecies(layer, i) === 'beech';
    const [first] = nearestMatureTrees(forest, changes, NEAR_FOREST, 1, new Set(), isBeech);
    const nearest = nearestMatureTrees(
      forest,
      changes,
      first!,
      CHARCOAL_KILN.trees,
      new Set(),
      isBeech,
    ).map((t) => t.id);
    expect(ids).toEqual(nearest);
    // milíř stojí uprostřed skácených buků
    const xs = ids.map((id) => forest.x[obstacleIndex(forest, id)]!);
    const zs = ids.map((id) => forest.z[obstacleIndex(forest, id)]!);
    const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
    expect(kiln.site!.x).toBeCloseTo(mean(xs), 1);
    expect(kiln.site!.z).toBeCloseTo(mean(zs), 1);
    const reserved = reservedTrees(s);
    for (const id of ids) expect(reserved.has(id)).toBe(true);
    // dřevo se k milíři nosí jen pár metrů – kácení a dovoz bez přirážky
    for (const t of kiln.trees) expect(t.cost).toBeCloseTo(2, 9);
  });

  it('jiný uhlíř vyhrazené buky nekácí', () => {
    const s = village();
    addWorkshop(s, 'burner', 52, { x: 40, z: -20, rotation: 0 }, 80);
    burnerDays(s, 1, forest);
    const first = firstKiln(s)!.trees.map((t) => t.id);
    const second = s.dwellings
      .find((d) => d.id === 52)!
      .workshop!.kilns![0]!.trees.map((t) => t.id);
    expect(first.filter((id) => second.includes(id))).toEqual([]);
  });

  it('bez buků čeká na dřevo – duby nekácí', () => {
    const s = village();
    burnerDays(s, 2, oaksOnly);
    expect(burnerOf(s).activity).toBe('no-wood');
    expect(kilnsOf(s)).toEqual([]);
    expect(s.felledTrees ?? []).toEqual([]);
  });

  it('místo milíře – ne na poli, na cestě, u domů ani u jiného milíře, ne ve vodě a na svahu', () => {
    const landscape = makeLandscape({
      size: 128,
      // políčko (40, 64) je voda, políčka x ≥ 80 stoupají po 2 m na metr
      surface: (x, y) => (x === 40 && y === 64 ? 'water' : 'meadow'),
      height: (x) => (x >= 80 ? (x - 80) * 30 : 0),
    });
    const empty: PlacementVillage = { dwellings: [], constructions: [], parts: [] };
    const center = { x: 64, z: 7 };
    expect(checkKilnSite(landscape, empty, center, forest).ok).toBe(true);
    // čtverec pole pod kruhem milíře (políčko 68, 64: x 60–75, z 0–15)
    const field = { ...empty, parts: [{ cell: { x: 68, y: 64 } }] };
    expect(checkKilnSite(landscape, field, center, forest).reason).toBe('Překrývá se s polem.');
    // obydlí do KILN_SITE.homeM
    const home = {
      ...empty,
      dwellings: [
        { type: 'zemnice' as const, position: { x: 64, z: 7 + KILN_SITE.homeM - 1, rotation: 0 } },
      ],
    };
    expect(checkKilnSite(landscape, home, center, forest).reason).toBe('Milíř nesmí stát u domů.');
    // pevná cesta kolem středu
    const road = {
      ...empty,
      walkRoads: [
        {
          points: [
            { x: 50, z: 9 },
            { x: 80, z: 9 },
          ],
          grade: 'trodden' as const,
        },
      ],
    };
    expect(checkKilnSite(landscape, road, center, forest).reason).toBe(
      'Milíř nesmí stát na cestě.',
    );
    // jiný milíř
    const kiln = { ...empty, kilns: [{ x: 75, z: 7 }] };
    expect(checkKilnSite(landscape, kiln, center, forest).reason).toBe('Stojí tu jiný milíř.');
    // voda a svah
    expect(checkKilnSite(landscape, empty, { x: -352, z: 7 }, forest).ok).toBe(false);
    expect(checkKilnSite(landscape, empty, { x: 250, z: 7 }, forest).ok).toBe(false);
  });

  it('střed dávky na poli – milíř stojí na nejbližším volném místě vedle', () => {
    const landscape = makeLandscape({ size: 128 });
    const open = packObstacles([], 128, 15);
    const s = village();
    const center = { x: 67, z: 7 };
    expect(findKilnSite(s, DAY, landscape, open, center)).toEqual(center);
    // pole na políčku pod středem
    s.parts.push({
      id: 500,
      fieldId: 501,
      areaM2: 225,
      distanceM: 50,
      naturalFertility: 50,
      fertilityShare: 1,
      bonusUntilDay: null,
      state: 'fallow',
      sownYears: 0,
      fallowSinceDay: DAY - 400,
      foundingCost: 0,
      foundingDone: 0,
      surface: 'meadow',
      cell: { x: 68, y: 64 },
    });
    const site = findKilnSite(s, DAY, landscape, open, center);
    expect(site).not.toEqual(center);
    expect(checkKilnSite(landscape, null, site, open).ok).toBe(true);
    const radius = MILIR.clearingRadiusM + KILN_SITE.marginM;
    // kruh milíře mimo políčko pole
    const outside =
      site.x + radius <= 60 ||
      site.x - radius >= 75 ||
      site.z + radius <= 0 ||
      site.z - radius >= 15;
    expect(outside).toBe(true);
    expect(Math.hypot(site.x - center.x, site.z - center.z)).toBeLessThanOrEqual(KILN_SITE.searchM);
  });

  it('milířiště je paseka – stromy s korunou nad milířem nebo do 6 m kolem padnou', () => {
    const tree = (id: number, x: number, z: number, scale = 1): ObstaclePlacement => ({
      id,
      kind: 'tree',
      look: 'oak-1',
      x,
      z,
      rotation: 0,
      scale,
    });
    // kupa 3 m + 6 m kolem + koruna 4 m × měřítko
    const layer = packObstacles(
      [tree(1, 12.5, 0), tree(2, 13.5, 0), tree(3, 0, 13.5, 1.25), tree(4, -5, 0)],
      128,
      15,
    );
    const status = obstacleStatus();
    expect(kilnCrownTrees(layer, status, { x: 0, z: 0 }, new Set())).toEqual([4, 1, 3]);
    // buky dávky a vyhrazené stromy zůstanou v dávce / své stavbě
    expect(kilnCrownTrees(layer, status, { x: 0, z: 0 }, new Set([4]))).toEqual([1, 3]);
  });

  it('výhled z výchozí kamery – stromy na jih od milíře ho zakryjí, místo se posune', () => {
    const tree = (id: number, x: number, z: number): ObstaclePlacement => ({
      id,
      kind: 'tree',
      look: 'oak-1',
      x,
      z,
      rotation: 0,
      scale: 1,
    });
    const status = obstacleStatus();
    // stromy 20 m na jih zakryjí, na sever ani stranou ne
    const one = (x: number, z: number): ObstacleLayer => packObstacles([tree(1, x, z)], 128, 15);
    expect(kilnViewBlockers(one(0, -20), status, { x: 0, z: 0 }, new Set())).toBe(1);
    expect(kilnViewBlockers(one(0, 20), status, { x: 0, z: 0 }, new Set())).toBe(0);
    expect(kilnViewBlockers(one(9, -20), status, { x: 0, z: 0 }, new Set())).toBe(0);
    // strom, který padne s pasekou nebo v dávce, nevadí
    expect(kilnViewBlockers(one(0, -10), status, { x: 0, z: 0 }, new Set())).toBe(0);
    expect(kilnViewBlockers(one(0, -20), status, { x: 0, z: 0 }, new Set([1]))).toBe(0);
    // pás lesa na jih od středu dávky – milíř stojí tam, kde ho les nezakryje
    const band: ObstaclePlacement[] = [];
    let id = 1;
    for (let x = -12; x <= 12; x += 4)
      for (let z = -32; z <= -16; z += 4) band.push(tree(id++, x, z));
    const layer = packObstacles(band, 128, 15);
    const landscape = makeLandscape({ size: 128 });
    const s = village();
    const center = { x: 0, z: 40 };
    const south = { x: 0, z: 0 };
    s.dwellings = s.dwellings.filter((d) => d.id === BURNER);
    s.dwellings[0]!.position = { x: 0, z: 80, rotation: 0 };
    expect(kilnViewBlockers(layer, status, south, new Set())).toBeGreaterThan(0);
    const site = findKilnSite(s, DAY, landscape, layer, south);
    expect(kilnViewBlockers(layer, status, site, new Set())).toBe(0);
    expect(Math.hypot(site.x - south.x, site.z - south.z)).toBeLessThanOrEqual(
      KILN_SITE.view.searchM,
    );
    // otevřené místo se nehýbe
    expect(findKilnSite(s, DAY, landscape, layer, center)).toEqual(center);
  });

  it('uhlíř chodí k milíři ze zemnice – přirážka za chůzi na veškerou práci u milíře', () => {
    const s = village(FAR_FROM_FOREST);
    const days = burnerDays(s, 1, forest);
    const kiln = firstKiln(s)!;
    for (const t of kiln.trees) expect(t.cost).toBeCloseTo(2, 9);
    const factor = kilnWalkFactor(kiln, FAR_FROM_FOREST);
    expect(factor).toBeGreaterThan(1.1);
    // práce dne jde na kácení prvního buku – efektivně 1,5 / přirážka
    expect(kiln.done).toBeCloseTo(1.5 / factor, 9);
    expect(days[0]!.felling).toBeCloseTo(1.5, 9);
    // blízko zemnice přirážka není
    const near = village();
    burnerDays(near, 1, forest);
    expect(kilnWalkFactor(firstKiln(near)!, NEAR_FOREST)).toBe(1);
  });

  it('s krajinou měří chůzi ze zemnice k milíři po cestách s půdou', () => {
    const s = village(FAR_FROM_FOREST);
    const after = advanceVillage(s, DAY + 1, forest, makeLandscape({ size: 128 }));
    const kiln = firstKiln(after)!;
    const straight = Math.hypot(kiln.site!.x - FAR_FROM_FOREST.x, kiln.site!.z - FAR_FROM_FOREST.z);
    // na louce bez cest je chůze aspoň vzdušná vzdálenost
    expect(kiln.walkM).toBeGreaterThanOrEqual(straight - 0.01);
    expect(kiln.walkM).toBeLessThan(straight * 1.2);
    expect(kilnWalkFactor(kiln, FAR_FROM_FOREST)).toBeGreaterThan(1.1);
  });

  it('práce u milíře jde do rozdělení práce dne k milíři (id milíře)', () => {
    const s = village(FAR_FROM_FOREST);
    for (let i = 1; i <= 400; i++) {
      const next = advanceVillage(s, DAY + i, forest);
      Object.assign(s, next);
      const shares = s.labor?.shares ?? [];
      const craft = shares.find((x) => x.activity === 'craft' && x.target.kind === 'kiln');
      if (craft) {
        const kiln = firstKiln(s)!;
        expect(craft.target).toMatchObject({
          kind: 'kiln',
          id: BURNER,
          kiln: kiln.id,
          ...kiln.site,
        });
        return;
      }
    }
    throw new Error('Uhlíř u milíře nepracoval.');
  });
});

describe('uhlíř – práce po fázích', () => {
  it('kácení a příprava dřeva, stavba, 8 dní pálení – vypálený milíř drží 1,8 t uhlí', () => {
    // bez kováře – uhlí nikdo neodebírá, práce jde jen do milíře
    const s = village(NEAR_FOREST, false);
    const first = burnerDays(s, 1, forest);
    // milířiště: duby v kruhu milíře uhlíř napřed vyklidí (po kusech jako u staveb)
    const clearing = structuredClone(firstKiln(s)!.clearing!);
    expect(clearing.ids.length).toBeGreaterThan(0);
    for (const id of clearing.ids) {
      expect(obstacleSpecies(forest, obstacleIndex(forest, id))).toBe('oak');
    }
    s.lastDay += 1;
    const days = [...first, ...untilBurnt(s, forest)];
    expect(firstKiln(s)?.stage).toBe('draw');
    expect(firstKiln(s)?.clearing).toBeUndefined();
    const cleared = new Set((s.clearedObstacles ?? []).map((c) => c.id));
    for (const id of clearing.ids) expect(cleared.has(id)).toBe(true);
    expect(s.woodLogs).toBeGreaterThanOrEqual(clearing.logs - 1e-9);
    const sum = (key: 'felling' | 'making' | 'planting'): number =>
      days.reduce((total, d) => total + (d[key] ?? 0), 0);
    const n = CHARCOAL_KILN.trees;
    // vyklizení milířiště, kácení a dovoz 2 čd + příprava 6 čd na buk
    expect(sum('felling')).toBeCloseTo(
      clearing.cost + n * (2 + CHARCOAL_KILN.prepManDaysPerTree),
      6,
    );
    // stavba 2 čd na buk, pálení 8 dní celou prací domácnosti (1,5 čd)
    expect(sum('making')).toBeCloseTo(
      n * CHARCOAL_KILN.buildManDaysPerTree + CHARCOAL_KILN.burnDays * 1.5,
      6,
    );
    // uhlí zůstává ve vypáleném milíři – u kováře nic, zásoba vsi 1,8 t
    expect(kilnCharcoalKg(firstKiln(s))).toBe(n * 120);
    expect(craftStocks(s).charcoalKg).toBe(0);
    expect(charcoalStockKg(s)).toBe(n * 120);
    expect(days.every((d) => d.producedKg === 0)).toBe(true);
    // buky skácené – pařezy, které uhlíř zapsal k obnově
    expect(s.felledTrees).toHaveLength(n);
    // doba cyklu se změřila – od výběru buků po vypálení
    expect(burnerOf(s).kilnCycles).toEqual([days.length]);
  });

  it('pálící milíř zabere celý den – uhlíř ho hlídá ve dne i v noci 8 dní', () => {
    const s = village();
    let burningDays = 0;
    for (let i = 1; i <= 400; i++) {
      const [burner] = workCrafts(s, DAY + i, forest, NO_CRAFTS, 1);
      if (burnerOf(s).activity === 'burning') {
        burningDays++;
        // hlídání vezme celou práci dne – nic se nekácí, nesází ani nevytahá
        expect(burner!.making).toBeCloseTo(1.5, 9);
        expect(burner!.felling).toBe(0);
        expect(burner!.kilns).toHaveLength(1);
      }
      if (firstKiln(s)?.stage === 'draw') break;
    }
    expect(burningDays).toBe(CHARCOAL_KILN.burnDays);
  });
});

describe('rovnováha uhlíř – kovář (crafts.md – Rovnováha uhlíř – kovář)', () => {
  it('spotřeba se měří klouzavě za rok – nová ves začne odhadem', () => {
    const s = village();
    expect(charcoalUsePerDay(undefined, DAY, 3)).toBe(3);
    // 10 dní po 4 kg za den – do prvního období (30 dní) doplní zbytek odhad
    for (let d = DAY; d < DAY + 10; d++) recordCharcoalUse(s, d, 4);
    const start = charcoalUsePerDay(s.charcoalUse, DAY + 10, 2);
    expect(start).toBeCloseTo((10 * 4 + 2 * 20) / 30, 6);
    // půl roku – už jen měření
    for (let d = DAY + 10; d < DAY + 180; d++) recordCharcoalUse(s, d, 4);
    expect(charcoalUsePerDay(s.charcoalUse, DAY + 180, 2)).toBeCloseTo(4, 6);
    // po roce a půl už jen měření (okno 12 období po 30 dnech a rozběhnuté)
    for (let d = DAY + 180; d < DAY + 545; d++) recordCharcoalUse(s, d, 6);
    expect(s.charcoalUse!.buckets.length).toBeLessThanOrEqual(12);
    expect(charcoalUsePerDay(s.charcoalUse, DAY + 545, 100)).toBeCloseTo(6, 6);
  });

  it('doba cyklu milíře – průměr posledních cyklů, bez měření odhad z práce', () => {
    const workshop = newWorkshop('burner');
    // 15 buků × (2 + 6 + 2) čd po 1,5 čd za den + 8 dní pálení
    expect(kilnCycleDays(workshop, NEAR_FOREST, 1.5)).toBeCloseTo(
      (15 * 10) / 1.5 + CHARCOAL_KILN.burnDays,
      6,
    );
    expect(kilnLeadDays(burntKiln(), NEAR_FOREST, 0)).toBe(CHARCOAL_KILN.burnDays);
    workshop.kilnCycles = [80, 100];
    expect(kilnCycleDays(workshop, NEAR_FOREST, 1.5)).toBe(90);
  });

  it('kovář si drží zásobu – pro uhlí jde, když vystačí jen na cestu a rezervu, dávka na 60 dní', () => {
    const reserve = CHARCOAL_BALANCE.reserveDays;
    // 5 kg za den, cesta den: jde při ≤ 80 kg, donese 300 kg
    expect(charcoalFetchKg(1800, 5 * (1 + reserve) + 1, 0, 5, 1)).toBe(0);
    expect(charcoalFetchKg(1800, 5 * (1 + reserve), 0, 5, 1)).toBe(5 * CHARCOAL_BALANCE.fetchDays);
    // nejvýš co v milíři je
    expect(charcoalFetchKg(120, 0, 0, 5, 1)).toBe(120);
    // dnešní kování nestačí – aspoň na dnešek
    expect(charcoalFetchKg(1800, 10, 400, 5, 1)).toBe(400);
    // bez spotřeby a kování nic
    expect(charcoalFetchKg(1800, 0, 0, 0, 1)).toBe(0);
  });

  it('uhlíř začne další milíř, až uhlí stačí jen na dobu cyklu a rezervu – stojí pak dva', () => {
    const s = village(NEAR_FOREST, true, at(601, 1, 10));
    const day = s.lastDay + 1;
    const workshop = burnerOf(s);
    workshop.kilnCycles = [80];
    measuredUse(s, 5, day);
    const need = 5 * (80 + CHARCOAL_BALANCE.reserveDays);
    // zásoba nad potřebou – další milíř ještě ne
    workshop.kilns = [{ ...burntKiln(), charcoalKg: need + 100 }];
    s.crafts = { charcoalKg: 200, toolsKg: 0, potteryKg: 0 };
    expect(burnerPlans(s, day, NO_CRAFTS).get(BURNER)!.start).toBe(false);
    expect(startsNextKiln(workshop, need + 300, 5, 80)).toBe(false);
    // uhlí ve vsi stačí jen na cyklus a rezervu – začne další, i když vypálený milíř ještě stojí
    workshop.kilns = [{ ...burntKiln(), charcoalKg: need - 300 }];
    expect(burnerPlans(s, day, NO_CRAFTS).get(BURNER)!.start).toBe(true);
    expect(restingCrafters(s, day, NO_CRAFTS).has(BURNER)).toBe(false);
    workCrafts(s, day, forest, NO_CRAFTS, 1);
    expect(kilnsOf(s).map((k) => k.stage)).toEqual(['draw', 'wood']);
    // nový milíř stojí jinde než vypálený a má své id
    expect(kilnsOf(s)[1]!.site).not.toEqual(kilnsOf(s)[0]!.site);
    expect(kilnsOf(s)[1]!.id).not.toBe(kilnsOf(s)[0]!.id);
    // třetí nezačne – nejvýš dva najednou, rozdělaný dodělá
    expect(startsNextKiln(workshop, 0, 5, 80)).toBe(false);
    for (let d = day + 1; d < day + 60; d++) workCrafts(s, d, forest, NO_CRAFTS, 1);
    expect(kilnsOf(s).length).toBeLessThanOrEqual(CHARCOAL_BALANCE.maxKilns);
  });

  it('uhlíř odpočívá, když kováři spotřebují málo', () => {
    const s = village(NEAR_FOREST, true, at(601, 1, 10));
    const day = s.lastDay + 1;
    burnerOf(s).kilns = [burntKiln()];
    burnerOf(s).kilnCycles = [90];
    measuredUse(s, 1, day);
    s.crafts = { charcoalKg: 100, toolsKg: 0, potteryKg: 0 };
    expect(burnerPlans(s, day, NO_CRAFTS).get(BURNER)).toEqual({
      draws: [],
      orderKg: 0,
      start: false,
    });
    expect(restingCrafters(s, day, NO_CRAFTS).get(BURNER)).toBe('resting');
  });

  it('vypálený milíř se rozebírá po dávkách – nejstarší napřed, rozebraný zmizí', () => {
    const s = village(NEAR_FOREST, true, at(601, 1, 10));
    const day = s.lastDay + 1;
    measuredUse(s, 5, day);
    burnerOf(s).kilnCycles = [90];
    burnerOf(s).kilns = [
      { ...burntKiln(90), charcoalKg: 50 },
      { ...burntKiln(91), site: { x: 90, z: 30 } },
    ];
    s.crafts = { charcoalKg: 0, toolsKg: 0, potteryKg: 0 };
    const plan = burnerPlans(s, day, NO_CRAFTS).get(BURNER)!;
    // dávka na 60 dní (300 kg): 50 kg ze staršího, zbytek z mladšího – kolik dnes stihne
    const want = Math.max(5 * CHARCOAL_BALANCE.fetchDays, smithsForgeCharcoalKg(s, day, NO_CRAFTS));
    const perKg = (CHARCOAL_KILN.drawManDaysPerTree / 120) * (1 - CART_JOBS.charcoal.carryShare);
    const today = 1.5 / perKg;
    expect(plan.orderKg).toBeCloseTo(want, 6);
    expect(plan.draws[0]).toEqual({ kilnId: 90, kg: 50 });
    expect(plan.draws[1]!.kilnId).toBe(91);
    expect(plan.draws[0]!.kg + plan.draws[1]!.kg).toBeCloseTo(today, 6);
    const [burner] = workCrafts(s, day, forest, NO_CRAFTS, 1);
    expect(burner!.producedKg).toBeCloseTo(today, 6);
    // vytahání a třídění – 2 čd na 120 kg bez odnosu v koších – celý den
    expect(burner!.making).toBeCloseTo(1.5, 6);
    // starší je rozebraný – zůstalo milířiště
    expect(kilnsOf(s).map((k) => k.id)).toEqual([91]);
    expect(s.kilnRemnants).toEqual([{ id: 90, burnerId: BURNER, x: 70, z: 0, day }]);
    // zbytek dávky vytahá další dny
    expect(burnerOf(s).charcoalOrderKg).toBeCloseTo(want - today, 6);
    let total = today;
    for (let d = day + 1; burnerOf(s).charcoalOrderKg !== undefined && d < day + 10; d++) {
      const [next] = workCrafts(s, d, forest, NO_CRAFTS, 1);
      total += next!.producedKg;
    }
    expect(total).toBeCloseTo(want, 6);
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
    expect(kilnCharcoalKg(burnerOf(after).kilns![0])).toBe(CHARCOAL_KILN.trees * 120);
    expect(after.felledTrees!.length).toBe(felled);
    // spotřeba se měří jen ve vsi s uhlířem – bez kováře nula
    expect(after.charcoalUse!.buckets.every((b) => b === 0)).toBe(true);
  });

  it('kovář bez uhlí u sebe nečeká, když mu uhlíř dnes donese z vypáleného milíře', () => {
    const s = village(NEAR_FOREST, true, at(601, 1, 10));
    s.crafts = { charcoalKg: 0, toolsKg: 0, potteryKg: 0 };
    expect(restingCrafters(s, s.lastDay + 1, NO_CRAFTS).get(SMITH)).toBe('no-charcoal');
    burnerOf(s).kilns = [burntKiln()];
    expect(restingCrafters(s, s.lastDay + 1, NO_CRAFTS).has(SMITH)).toBe(false);
    const [burner, smith] = workCrafts(s, s.lastDay + 1, forest, NO_CRAFTS, 1);
    expect(burner!.producedKg).toBeGreaterThan(0);
    expect(smith!.producedKg).toBeGreaterThan(0);
  });

  it('rozdělaný milíř dodělá, i když uhlí přibylo', () => {
    const s = village();
    burnerDays(s, 1, forest);
    expect(firstKiln(s)).toBeTruthy();
    s.crafts = { charcoalKg: 10_000, toolsKg: 0, potteryKg: 0 };
    expect(restingCrafters(s, DAY + 2, NO_CRAFTS).has(BURNER)).toBe(false);
  });

  it('kovář v rovnováze nečeká – uhlíř začne další milíř včas', () => {
    let s = village();
    s.crafts = { charcoalKg: 0, toolsKg: 0, potteryKg: 0 };
    const waiting: number[] = [];
    let twoKilns = 0;
    let firstDraw: number | null = null;
    const end = DAY + 4 * 365;
    for (let d = DAY + 1; d <= end; d++) {
      s = advanceVillage(s, d, forest);
      // ves nástroje hned rozdá a opotřebí – kovář kove dál celý den
      s.crafts!.toolsKg = 0;
      if (s.dwellings.find((x) => x.id === SMITH)!.workshop!.activity === 'no-charcoal') {
        waiting.push(d - DAY);
      }
      if (kilnsOf(s).length === 2) twoKilns++;
      if (firstDraw === null && kilnsOf(s).some((k) => k.stage === 'draw')) firstDraw = d - DAY;
    }
    // kovář čeká jen na úplně první milíř – pak má uhlí vždy
    expect(firstDraw).not.toBeNull();
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting.filter((d) => d > firstDraw!)).toEqual([]);
    // další milíř se chystá, zatímco vypálený se rozebírá
    expect(twoKilns).toBeGreaterThan(0);
    expect(burnerOf(s).kilnCycles!.length).toBe(CHARCOAL_BALANCE.cycles);
  }, 120_000);

  it('prodané uhlí se bere napřed u kováře, pak z vypálených milířů – rozebraný zmizí', () => {
    const s = village();
    burnerOf(s).kilns = [burntKiln()];
    s.crafts = { charcoalKg: 100, toolsKg: 0, potteryKg: 0 };
    expect(takeCharcoal(s, 300, DAY)).toBe(300);
    expect(craftStocks(s).charcoalKg).toBe(0);
    expect(kilnCharcoalKg(firstKiln(s))).toBe(1800 - 200);
    expect(takeCharcoal(s, 5000, DAY)).toBe(1600);
    expect(kilnsOf(s)).toEqual([]);
    expect(charcoalStockKg(s)).toBe(0);
  });
});

describe('milířiště (crafts.md – Milíř u skácených buků)', () => {
  it('po rozebraném milíři zůstane milířiště, které za 10 let zaroste a zmizí', () => {
    const s = village();
    burnerOf(s).kilns = [burntKiln()];
    takeCharcoal(s, 5000, DAY);
    const [remnant] = s.kilnRemnants!;
    expect(remnant).toEqual({ id: 90, burnerId: BURNER, x: 70, z: 0, day: DAY });
    expect(kilnRemnantOvergrowth(remnant!, DAY)).toBe(0);
    expect(kilnRemnantOvergrowth(remnant!, DAY + 5 * 365)).toBeCloseTo(0.5, 6);
    updateKilnRemnants(s, DAY + 9 * 365);
    expect(s.kilnRemnants).toHaveLength(1);
    updateKilnRemnants(s, DAY + CHARCOAL_BALANCE.remnantYears * 365);
    expect(s.kilnRemnants).toBeUndefined();
  });
});

describe('uhlíř – obnova lesa (mladé buky)', () => {
  it('na pařezy skácených buků sází v okně výsadby mladé buky', () => {
    const s = village();
    // napřed paseka (milířiště), pak buky – do konce listopadu
    const days = burnerDays(s, 60, forest);
    const planted = days.flatMap((d) => d.plantedTrees ?? []);
    expect(planted.length).toBeGreaterThan(0);
    const felled = new Map((s.felledTrees ?? []).map((f) => [f.id, f]));
    for (const id of planted) expect(felled.get(id)?.planted).toBeDefined();
    // sazenice je hned mladý stromek
    const changes = obstacleChangesAt(s, DAY + 61);
    for (const id of planted) expect(changes.saplings).toContain(id);
  });

  it('mimo okno výsadby nesází – pařezy počkají na jaro', () => {
    const winter = at(601, 1, 10);
    const s = village(NEAR_FOREST, true, winter);
    const days = burnerDays(s, 45, forest);
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

  it('mýtina roste – další milíře stojí dál a uhlíř chodí dál', () => {
    const s = village();
    const meanDistance: number[] = [];
    for (let batch = 0; batch < 4; batch++) {
      const kiln = startKiln(s, { position: NEAR_FOREST }, DAY, forest)!;
      const distances = kiln.trees.map((t) => {
        const i = obstacleIndex(forest, t.id!);
        return Math.hypot(forest.x[i]! - NEAR_FOREST.x, forest.z[i]! - NEAR_FOREST.z);
      });
      meanDistance.push(distances.reduce((a, b) => a + b, 0) / distances.length);
      // dávku rovnou skácet (pařezy)
      s.felledTrees = [
        ...(s.felledTrees ?? []),
        ...kiln.trees.map((t) => ({ id: t.id!, day: DAY })),
      ];
    }
    for (let i = 1; i < meanDistance.length; i++) {
      expect(meanDistance[i]!).toBeGreaterThan(meanDistance[i - 1]! - 1e-9);
    }
    expect(meanDistance.at(-1)!).toBeGreaterThan(meanDistance[0]! + 5);
  });
});

describe('uhlíř – simulace a převod starších vsí', () => {
  it('výsledek nezávisí na kouscích dopočítání – i přes rozebírání a nový milíř', () => {
    const end = DAY + 3 * 365;
    const whole = advanceVillage(village(), end, forest);
    let chunked = village();
    for (const to of [DAY + 40, DAY + 41, DAY + 200, DAY + 333, DAY + 500, DAY + 800, end]) {
      chunked = advanceVillage(chunked, to, forest);
    }
    expect(chunked).toEqual(whole);
    // uhlí vzniklo, kovář z něj kuje a další milíře stojí u dalších dávek
    expect(whole.crafts!.toolsKg).toBeGreaterThan(0);
    expect((whole.felledTrees ?? []).length).toBeGreaterThan(CHARCOAL_KILN.trees);
    expect((whole.felledTrees ?? []).some((f) => f.planted !== undefined)).toBe(true);
  });

  it('stav po JSON (uložení do databáze) se dopočítá stejně', () => {
    const s = advanceVillage(village(), DAY + 100, forest);
    expect(firstKiln(s)).toBeTruthy();
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

  it('milíř u zemnice ze starší vsi se dodělá a rozebere na svém místě, další stojí u dávky', () => {
    const s = village(NEAR_FOREST, true, at(601, 1, 10));
    const old: CharcoalKiln = {
      site: null,
      trees: Array.from({ length: CHARCOAL_KILN.trees }, () => ({ id: null, cost: 2 })),
      stage: 'build',
      prepared: CHARCOAL_KILN.trees,
      done: 3,
    };
    const workshop = burnerOf(s);
    workshop.kiln = old;
    const after = advanceVillage(s, s.lastDay + 1, forest);
    const migrated = burnerOf(after);
    expect(migrated.kiln).toBeUndefined();
    expect(migrated.kilns).toHaveLength(1);
    const kiln = migrated.kilns![0]!;
    expect(kiln.site).toEqual(homeKilnCenter(NEAR_FOREST));
    expect(kiln.id).toBeDefined();
    expect(kiln.stage).toBe('build');
    // jednou – další den nic nepřevádí
    const again = advanceVillage(after, after.lastDay + 1, forest);
    expect(burnerOf(again).kilns![0]!.id).toBe(kiln.id);
    // lesní milíř zůstane v lese
    const forestKiln = village(FAR_FROM_FOREST, true, at(601, 1, 10));
    burnerOf(forestKiln).kiln = { ...old, site: { x: 70, z: 0 }, walkM: 270 };
    const moved = advanceVillage(forestKiln, forestKiln.lastDay + 1, forest);
    expect(burnerOf(moved).kilns![0]).toMatchObject({ site: { x: 70, z: 0 }, walkM: 270 });
  });

  it('starší milíř, ze kterého se uhlí vytahovalo najednou, je vypálený s celou dávkou', () => {
    const s = village(NEAR_FOREST, false, at(601, 1, 10));
    const old = burntKiln();
    delete old.charcoalKg;
    delete old.id;
    old.done = 17;
    burnerOf(s).kiln = old;
    s.crafts = { charcoalKg: 400, toolsKg: 0, potteryKg: 0 };
    // před převodem se počítá stejně – celá dávka v milíři, uhlí v zásobě je u kováře
    expect(charcoalStockKg(s)).toBe(1800 + 400);
    const after = advanceVillage(s, s.lastDay + 1, forest);
    const kiln = burnerOf(after).kilns![0]!;
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

  it('odhad spotřeby bez měření je roční spotřeba kovářů z opotřebení nástrojů', () => {
    const s = village(NEAR_FOREST, true, at(601, 1, 10));
    const day = s.lastDay + 1;
    const estimate = smithsCharcoalPerYear(s, day, NO_CRAFTS) / 365;
    expect(estimate).toBeGreaterThan(0);
    expect(charcoalUsePerDay(s.charcoalUse, day, estimate)).toBe(estimate);
  });
});
