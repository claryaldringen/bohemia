import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  obstacleIndex,
  obstacleSpecies,
  packObstacles,
  type Landscape,
  type ObstacleLayer,
  type ObstaclePlacement,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { advanceVillage } from '../../core/simulate';
import { decayEmptyDwellings } from '../../core/simulate-build';
import { obstacleChangesAt } from '../../core/obstacles';
import { NO_CRAFTS } from '../../core/productivity';
import { nearestMatureTrees } from '../../forest/wood';
import {
  checkDwellingPlacement,
  checkKilnSite,
  placementVillageOf,
  type PlacementVillage,
} from '../../placement/placement';
import { BURNER_CAMP, CHARCOAL_KILN, CRAFT_BASE } from '../../rules';
import type {
  BurnerCamp,
  CharcoalKiln,
  Craft,
  Dwelling,
  DwellingType,
  Person,
  Position,
  VillageState,
} from '../../types';
import { makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import {
  abandonCamp,
  campRemnantOvergrowth,
  campUsable,
  moveCamp,
  updateCampRemnants,
} from '../burner-camp';
import { IDLE_BURNER, kilnWalkFactor, workBurner, type BurnerPlan } from '../charcoal';
import { newWorkshop, workCrafts } from '../crafts';
import { findCampSite, findKilnSite } from '../kiln-site';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
/** 1. 10. – okno výsadby, jako v charcoal.test.ts. */
const DAY = at(600, 10, 1);
const YEAR = 365.25;
const BURNER = 50;
/** Uhlíř 40 m na západ od lesa (první buky ≈ 20 m od dílny). */
const NEAR_FOREST = { x: 40, z: 0, rotation: 0 };
/** Uhlíř daleko od lesa – milíř ≈ 270 m od dílny (přirážka za chůzi). */
const FAR_FROM_FOREST = { x: -200, z: 0, rotation: 0 };
const landscape: Landscape = makeLandscape({ size: 128 });

const tree = (
  id: number,
  x: number,
  z: number,
  look: ObstaclePlacement['look'] = 'beech-1',
): ObstaclePlacement => ({
  id,
  kind: 'tree',
  look,
  x,
  z,
  rotation: 0,
  scale: 1,
});

/** Les na východ: stromy po 4 m od x = 60 m do 340 m, buky (sudé id) a duby (liché) střídavě. */
function mixedForest(): ObstacleLayer {
  const trees: ObstaclePlacement[] = [];
  let id = 1;
  for (let x = 60; x <= 340; x += 4) {
    for (let z = -100; z <= 100; z += 4) {
      trees.push(tree(id, x, z, id % 2 === 0 ? 'beech-1' : 'oak-1'));
      id++;
    }
  }
  return packObstacles(trees, 128, 15);
}
const forest = mixedForest();

/** Hustý bukový les po 2 m kolem celé vsi – nikde do 30 m od milíře není místo bez stromů. */
function denseForest(): ObstacleLayer {
  const trees: ObstaclePlacement[] = [];
  let id = 1;
  for (let x = -100; x <= 180; x += 2) {
    for (let z = -120; z <= 120; z += 2) trees.push(tree(id++, x, z));
  }
  return packObstacles(trees, 128, 15);
}

/** Čtyři buky u sebe (x 80–84) – na celou dávku nestačí, zemnice se tak nikdy nevyužije znovu. */
const fewBeeches = packObstacles(
  [tree(1, 80, 0), tree(2, 84, 0), tree(3, 80, 4), tree(4, 84, 4)],
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
  type: DwellingType = CRAFT_BASE[craft],
): void {
  s.dwellings.push({
    id,
    type,
    builtDay: s.lastDay,
    condition: 1,
    position: { ...position },
    workshop: newWorkshop(craft),
  });
  s.people.push(person(firstPerson, 24, id, s.lastDay), person(firstPerson + 1, 22, id, s.lastDay));
}

/** Ves s plnou domácností, uhlířem (id 50) a kovářem (id 51) – jako v charcoal.test.ts. */
function village(
  burnerAt: Position = NEAR_FOREST,
  burnerType: DwellingType = 'vypleteny',
): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [25, 25, 20, 19, 5, 3].map((age, i) => person(2 + i, age, 1));
  s.constructions = [];
  s.storesKg = 50_000;
  s.lastDay = DAY;
  s.nextId = 100;
  addWorkshop(s, 'burner', BURNER, burnerAt, 60, burnerType);
  addWorkshop(s, 'smith', 51, { x: 40, z: 40, rotation: 0 }, 70);
  return s;
}

const burnerOf = (s: VillageState): Dwelling => s.dwellings.find((d) => d.id === BURNER)!;
const workshopOf = (s: VillageState): NonNullable<Dwelling['workshop']> => burnerOf(s).workshop!;
const kilnsOf = (s: VillageState): CharcoalKiln[] => workshopOf(s).kilns ?? [];

/** Dny práce dílen s krajinou (místo milíře i zemnice) – mutuje `s`. */
function craftDays(s: VillageState, days: number, layer: ObstacleLayer | null): void {
  for (let i = 1; i <= days; i++) {
    workCrafts(s, s.lastDay + i, layer, NO_CRAFTS, 1, undefined, layer ? landscape : null);
  }
  s.lastDay += days;
}

/** Den uhlíře přímo (`workBurner`) s místem milíře i zemnice jako v `workCrafts`. */
function burnerDay(
  s: VillageState,
  day: number,
  layer: ObstacleLayer | null,
  labor: number,
  plan: BurnerPlan = IDLE_BURNER,
): ReturnType<typeof workBurner> {
  const stocks = (s.crafts ??= { charcoalKg: 0, potteryKg: 0 });
  return workBurner(s, burnerOf(s), stocks, labor, day, layer, plan, {
    ...(layer
      ? {
          site: (center, batch) => findKilnSite(s, day, landscape, layer, center, batch),
          camp: (site) => findCampSite(s, day, landscape, layer, site),
        }
      : {}),
  });
}

/** Bod světa v souřadnicích zemnice (x napříč, z k vchodu) – nezávisle na det-math. */
function toCampLocal(camp: BurnerCamp, x: number, z: number): { lx: number; lz: number } {
  const dx = x - camp.x;
  const dz = z - camp.z;
  const c = Math.cos(camp.rotation);
  const s = Math.sin(camp.rotation);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

/** Stojí strom vrstvy na půdorysu zemnice s pruhem BURNER_CAMP.treeMarginM? */
function treesOnCamp(layer: ObstacleLayer, camp: BurnerCamp): number[] {
  const halfWidth = BURNER_CAMP.footprintM.width / 2 + BURNER_CAMP.treeMarginM;
  const halfDepth = BURNER_CAMP.footprintM.depth / 2 + BURNER_CAMP.treeMarginM;
  const out: number[] = [];
  for (let i = 0; i < layer.id.length; i++) {
    const { lx, lz } = toCampLocal(camp, layer.x[i]!, layer.z[i]!);
    if (Math.abs(lx) <= halfWidth && Math.abs(lz) <= halfDepth) out.push(layer.id[i]!);
  }
  return out;
}

const NEW_KILN: BurnerPlan = { draws: [], orderKg: 0, start: true };

describe('zemnice u milíře – místo (workshops.md – Uhlíř – zemnice u milíře)', () => {
  it('první milíř založí zemnici 8–30 m od milíře na místě bez stromů, vchodem k milíři', () => {
    const s = village();
    craftDays(s, 1, forest);
    const [kiln] = kilnsOf(s);
    const camp = workshopOf(s).camp!;
    expect(kiln?.site).toBeTruthy();
    expect(camp).toMatchObject({ done: expect.any(Number) as number });
    expect(camp.id).toBeGreaterThan(kiln!.id!);
    expect(camp.builtDay).toBeUndefined();
    const distance = Math.hypot(camp.x - kiln!.site!.x, camp.z - kiln!.site!.z);
    expect(distance).toBeGreaterThanOrEqual(BURNER_CAMP.minFromKilnM - 0.01);
    expect(distance).toBeLessThanOrEqual(BURNER_CAMP.maxFromKilnM + 0.01);
    // na půdorysu s pruhem 0,5 m nestojí strom – ani buk z dávky, který teprve padne
    expect(treesOnCamp(forest, camp)).toEqual([]);
    const batch = kiln!.trees.map((t) => t.id!);
    expect(batch.length).toBe(CHARCOAL_KILN.trees);
    // vchod (osa +z modelu) míří k milíři
    const facing = { x: Math.sin(camp.rotation), z: Math.cos(camp.rotation) };
    const toKiln = {
      x: (kiln!.site!.x - camp.x) / distance,
      z: (kiln!.site!.z - camp.z) / distance,
    };
    expect(facing.x * toKiln.x + facing.z * toKiln.z).toBeGreaterThan(0.999);
    // brání stavbám – ves pro kontrolu umístění ji zná
    expect(placementVillageOf(s, s.lastDay).camps).toEqual([
      { x: camp.x, z: camp.z, rotation: camp.rotation },
    ]);
  });

  it('místo se hledá deterministicky – stejný stav, stejné místo', () => {
    const a = village();
    const b = village();
    craftDays(a, 1, forest);
    craftDays(b, 1, forest);
    expect(workshopOf(a).camp).toEqual(workshopOf(b).camp);
  });
});

describe('zemnice u milíře – stromy', () => {
  /** Rozdělaný milíř s vyklízením milířiště (`logs` klád) a dávkou mimo okolí zemnice. */
  const kilnWith = (logs: number): CharcoalKiln => ({
    id: 300,
    startDay: DAY,
    site: { x: 50, z: 0 },
    trees: [
      { id: 26, cost: 2 },
      { id: 28, cost: 2 },
    ],
    stage: 'wood',
    prepared: 0,
    done: 0,
    clearing: { ids: [1, 2], cost: 20, logs },
  });
  const spot = { x: 50, z: 20, rotation: Math.PI };

  it('milířiště s 5 kládami – na zemnici jdou 3, na hromadu vsi zbudou 2', () => {
    const s = village();
    const kiln = kilnWith(5);
    moveCamp(s, burnerOf(s), kiln, DAY, forest, () => spot);
    expect(kiln.clearing).toEqual({ ids: [1, 2], cost: 20, logs: 2 });
    expect(workshopOf(s).camp).toEqual({ id: 100, ...spot, done: 0 });
    expect(s.nextId).toBe(101);
  });

  it('s 1 kládou – 2 chybějící stromy skácí navíc nejblíž zemnici, klády nedají', () => {
    const s = village();
    const kiln = kilnWith(1);
    moveCamp(s, burnerOf(s), kiln, DAY, forest, () => spot);
    // nejbližší dospělé stromy k (50, 20): (60, 20) id 31, pak (60, 16) id 30 a (60, 24) id 32
    // stejně daleko – menší id
    expect(kiln.clearing).toEqual({ ids: [1, 2, 31, 30], cost: 20 + 2 * 3, logs: 0 });
  });

  it('bez vyklízení – všechny 3 stromy navíc, vyhrazené a z dávky ne', () => {
    const s = village();
    const kiln = { ...kilnWith(0), trees: [{ id: 31, cost: 2 }] };
    delete kiln.clearing;
    moveCamp(s, burnerOf(s), kiln, DAY, forest, () => spot);
    const expected = nearestMatureTrees(
      forest,
      obstacleChangesAt(s, DAY),
      spot,
      BURNER_CAMP.trees,
      new Set([31]),
    ).map((t) => t.id);
    expect(expected).not.toContain(31);
    expect(kiln.clearing).toEqual({ ids: expected, cost: 3 * 3, logs: 0 });
  });
});

describe('zemnice u milíře – práce', () => {
  /** Milíř ve fázi stavby 270 m od dílny (přirážka za chůzi) a rozestavěná zemnice. */
  function building(kilnDone: number): VillageState {
    const s = village(FAR_FROM_FOREST);
    workshopOf(s).kilns = [
      {
        id: 90,
        startDay: DAY - 60,
        site: { x: 70, z: 0 },
        trees: Array.from({ length: CHARCOAL_KILN.trees }, () => ({ id: null, cost: 2 })),
        stage: 'build',
        prepared: CHARCOAL_KILN.trees,
        done: kilnDone,
      },
    ];
    workshopOf(s).camp = { id: 91, x: 60, z: 20, rotation: 0, done: 0 };
    return s;
  }

  it('ve fázi stavby jde prvních 10 čd (× přirážka za chůzi) do zemnice, pak teprve kupa', () => {
    const s = building(0);
    const kiln = kilnsOf(s)[0]!;
    const factor = kilnWalkFactor(kiln, FAR_FROM_FOREST);
    expect(factor).toBeGreaterThan(1.1);
    const labor = 4;
    let day = DAY;
    let campDone = 0;
    for (;;) {
      day++;
      const out = burnerDay(s, day, null, labor);
      const camp = workshopOf(s).camp!;
      expect(out.making).toBeCloseTo(labor, 9);
      expect(out.activity).toBe('building');
      if (camp.builtDay === undefined) {
        campDone += labor / factor;
        expect(camp.done).toBeCloseTo(campDone, 9);
        expect(kiln.done).toBe(0);
        continue;
      }
      // den dokončení – zbytek práce dne jde do kupy
      expect(camp.builtDay).toBe(day);
      expect(camp.done).toBeCloseTo(BURNER_CAMP.buildManDays, 9);
      const rest = labor - (BURNER_CAMP.buildManDays - campDone) * factor;
      expect(kiln.done).toBeCloseTo(rest / factor, 9);
      break;
    }
    expect(day - DAY).toBe(Math.ceil((BURNER_CAMP.buildManDays * factor) / labor));
  });

  it('pálení nezačne, dokud zemnice není hotová', () => {
    const total = CHARCOAL_KILN.buildManDaysPerTree * CHARCOAL_KILN.trees;
    const s = building(total - 0.5);
    const kiln = kilnsOf(s)[0]!;
    burnerDay(s, DAY + 1, null, 4);
    expect(kiln.stage).toBe('build');
    expect(kiln.done).toBe(total - 0.5);
    let day = DAY + 1;
    while (kiln.stage === 'build' && day < DAY + 20) burnerDay(s, ++day, null, 4);
    expect(kiln.stage).toBe('burn');
    expect(workshopOf(s).camp!.builtDay).toBeLessThanOrEqual(day);
  });
});

describe('zemnice u milíře – opakované využití', () => {
  it('další milíř s dost buky do 150 m od zemnice dostane tutéž zemnici – dávka od ní', () => {
    const s = village();
    const camp: BurnerCamp = { id: 95, x: 50, z: 60, rotation: 0, done: 10, builtDay: DAY - 30 };
    workshopOf(s).camp = camp;
    const changes = obstacleChangesAt(s, DAY + 1);
    const isBeech = (layer: ObstacleLayer, i: number): boolean =>
      obstacleSpecies(layer, i) === 'beech';
    const [nearCamp] = nearestMatureTrees(forest, changes, camp, 1, new Set(), isBeech);
    const [nearHome] = nearestMatureTrees(forest, changes, NEAR_FOREST, 1, new Set(), isBeech);
    expect(nearCamp!.id).not.toBe(nearHome!.id);
    expect(campUsable(s, DAY + 1, forest, camp)).toBe(true);
    craftDays(s, 1, forest);
    expect(workshopOf(s).camp).toEqual(camp);
    expect(kilnsOf(s)[0]!.trees[0]!.id).toBe(nearCamp!.id);
    expect(s.campRemnants).toBeUndefined();
  });

  it('bez dávky buků do 150 m – stará zemnice se opustí, u nového milíře vznikne nová', () => {
    const s = village();
    workshopOf(s).camp = { id: 95, x: -300, z: 0, rotation: 1, done: 10, builtDay: DAY - 30 };
    expect(campUsable(s, DAY + 1, forest, { x: -300, z: 0 })).toBe(false);
    craftDays(s, 1, forest);
    expect(s.campRemnants).toEqual([
      { id: 95, burnerId: BURNER, x: -300, z: 0, rotation: 1, day: DAY + 1 },
    ]);
    const camp = workshopOf(s).camp!;
    expect(camp.id).not.toBe(95);
    const kiln = kilnsOf(s)[0]!;
    expect(Math.hypot(camp.x - kiln.site!.x, camp.z - kiln.site!.z)).toBeLessThanOrEqual(
      BURNER_CAMP.maxFromKilnM + 0.01,
    );
    // opuštěná zemnice dál brání stavbám
    expect(placementVillageOf(s, s.lastDay).camps).toHaveLength(2);
  });
});

describe('zemnice u milíře – zánik', () => {
  it('opuštěná zemnice za 5 let zmizí – prázdný seznam ze stavu zmizí', () => {
    const s = village();
    workshopOf(s).camp = { id: 95, x: 60, z: 20, rotation: 0, done: 10, builtDay: DAY - 30 };
    abandonCamp(s, burnerOf(s), DAY);
    expect(workshopOf(s).camp).toBeUndefined();
    const [remnant] = s.campRemnants!;
    expect(remnant).toEqual({ id: 95, burnerId: BURNER, x: 60, z: 20, rotation: 0, day: DAY });
    expect(campRemnantOvergrowth(remnant!, DAY)).toBe(0);
    expect(campRemnantOvergrowth(remnant!, DAY + 2.5 * 365)).toBeCloseTo(0.5, 6);
    updateCampRemnants(s, DAY + 4 * 365);
    expect(s.campRemnants).toHaveLength(1);
    updateCampRemnants(s, DAY + BURNER_CAMP.abandonedYears * 365);
    expect(s.campRemnants).toBeUndefined();
    expect('campRemnants' in s).toBe(false);
  });

  it('zchátralá dílna uhlíře zanikne – zemnice u milíře zůstane opuštěná', () => {
    const s = village();
    burnerOf(s).condition = 1e-6;
    workshopOf(s).camp = { id: 95, x: 60, z: 20, rotation: 0, done: 10, builtDay: DAY - 30 };
    // dílna uhlíře prázdná – ostatní obydlí obydlená
    decayEmptyDwellings(s, DAY + 1, new Set([1, 51]));
    expect(s.dwellings.some((d) => d.id === BURNER)).toBe(false);
    expect(s.campRemnants).toEqual([
      { id: 95, burnerId: BURNER, x: 60, z: 20, rotation: 0, day: DAY + 1 },
    ]);
  });

  it('dílna zanikne během stavby zemnice – opuštěná si nese odvedenou práci', () => {
    const s = village();
    burnerOf(s).condition = 1e-6;
    workshopOf(s).camp = { id: 95, x: 60, z: 20, rotation: 0, done: 3.3 };
    decayEmptyDwellings(s, DAY + 1, new Set([1, 51]));
    expect(s.campRemnants).toEqual([
      { id: 95, burnerId: BURNER, x: 60, z: 20, rotation: 0, day: DAY + 1, done: 3.3 },
    ]);
  });
});

describe('zemnice u milíře – bez místa', () => {
  it('hustý les bez místa bez stromů do 30 m – zemnice nevznikne a milíř jede dál', () => {
    const dense = denseForest();
    const s = village();
    craftDays(s, 2, dense);
    const kiln = kilnsOf(s)[0]!;
    expect(kiln.site).toBeTruthy();
    expect(workshopOf(s).camp).toBeUndefined();
    expect(s.campRemnants).toBeUndefined();
    expect(kiln.stage).toBe('wood');
    expect(kiln.done).toBeGreaterThan(0);
    expect(findCampSite(s, s.lastDay, landscape, dense, kiln.site!)).toBeNull();
  });

  it('ves bez vrstvy překážek – milíř bez polohy, zemnice nevznikne', () => {
    const s = village();
    craftDays(s, 1, null);
    expect(kilnsOf(s)[0]!.site).toBeNull();
    expect(workshopOf(s).camp).toBeUndefined();
  });
});

describe('zemnice u milíře – brání stavbám', () => {
  const camp = { x: 64, z: 7, rotation: 0.4 };
  const empty: PlacementVillage = { dwellings: [], constructions: [], parts: [] };
  const open = packObstacles([], 128, 15);

  it('obydlí ani milíř přes zemnici – „Stojí tu zemnice uhlíře.“', () => {
    const position = { x: 65, z: 8, rotation: 0 };
    expect(checkDwellingPlacement(landscape, empty, 'zemnice', position, open).ok).toBe(true);
    const withCamp = { ...empty, camps: [camp] };
    expect(checkDwellingPlacement(landscape, withCamp, 'zemnice', position, open).reason).toBe(
      'Stojí tu zemnice uhlíře.',
    );
    expect(checkKilnSite(landscape, empty, { x: 66, z: 7 }, open).ok).toBe(true);
    expect(checkKilnSite(landscape, withCamp, { x: 66, z: 7 }, open).reason).toBe(
      'Stojí tu zemnice uhlíře.',
    );
  });
});

describe('zemnice u milíře – jen u nadzemní dílny (Martin 15. 11. 2026)', () => {
  it('uhlíř v dnešní dílně (zemnice ve vsi) zemnici u milíře nestaví, milíř pálí dál', () => {
    const s = village(NEAR_FOREST, CRAFT_BASE.burner);
    craftDays(s, 3, forest);
    expect(kilnsOf(s).length).toBeGreaterThan(0);
    expect(workshopOf(s).camp).toBeUndefined();
    expect(s.campRemnants).toBeUndefined();
  });

  it('uhlíř v nadzemní dílně zemnici staví jako dosud', () => {
    for (const type of ['vypleteny', 'srub'] as const) {
      const s = village(NEAR_FOREST, type);
      craftDays(s, 1, forest);
      expect(workshopOf(s).camp).toBeDefined();
    }
  });

  it('stará zemnice uhlíře v dnešní dílně se opustí a nová nevznikne', () => {
    const s = village(NEAR_FOREST, CRAFT_BASE.burner);
    workshopOf(s).camp = { id: 91, x: 60, z: 20, rotation: 0, done: 0, builtDay: DAY - 5 };
    burnerDay(s, DAY + 1, forest, 1.5, NEW_KILN);
    expect(workshopOf(s).camp).toBeUndefined();
    expect(s.campRemnants).toHaveLength(1);
    burnerDay(s, DAY + 2, forest, 1.5);
    expect(s.campRemnants).toHaveLength(1);
  });
});

describe('zemnice u milíře – starší ves', () => {
  /** Milíř ze vsi uložené před zemnicemi – bez `camp`. */
  const oldKiln = (stage: CharcoalKiln['stage']): CharcoalKiln => ({
    id: 90,
    startDay: DAY - 100,
    site: { x: 70, z: 0 },
    trees: Array.from({ length: CHARCOAL_KILN.trees }, (_, i) => ({
      id: 2 * (i + 1),
      cost: 2,
    })),
    stage,
    prepared: CHARCOAL_KILN.trees,
    done: 0,
  });

  it('pálící milíř bez zemnice se dopočítá bez pádu, zemnice vznikne až u dalšího milíře', () => {
    const s = village();
    workshopOf(s).kilns = [oldKiln('burn')];
    expect(() => advanceVillage(s, DAY + 3, forest, landscape)).not.toThrow();
    for (let day = DAY + 1; day <= DAY + CHARCOAL_KILN.burnDays; day++) {
      burnerDay(s, day, forest, 1.5, NEW_KILN);
    }
    expect(kilnsOf(s)[0]!.stage).toBe('draw');
    expect(workshopOf(s).camp).toBeUndefined();
    burnerDay(s, DAY + CHARCOAL_KILN.burnDays + 1, forest, 1.5, NEW_KILN);
    expect(kilnsOf(s)).toHaveLength(2);
    expect(workshopOf(s).camp).toBeDefined();
    expect(s.campRemnants).toBeUndefined();
  });

  it('stavěný milíř bez zemnice se staví dál jako dřív', () => {
    const s = village();
    workshopOf(s).kilns = [oldKiln('build')];
    burnerDay(s, DAY + 1, forest, 1.5);
    expect(kilnsOf(s)[0]!.done).toBeCloseTo(1.5, 9);
    expect(workshopOf(s).camp).toBeUndefined();
  });
});

describe('zemnice u milíře – dopočet po kouscích', () => {
  /** Uhlíř se starou zemnicí u vykáceného lesa – u 4 buků začne milíř, zemnici opustí a staví novou. */
  function camped(): VillageState {
    const s = village();
    workshopOf(s).camp = { id: 95, x: 60, z: 40, rotation: 0, done: 10, builtDay: DAY - 30 };
    return s;
  }
  const end = DAY + 60;
  const whole = advanceVillage(camped(), end, fewBeeches, landscape);

  it('celý dopočet: nový milíř, opuštěná a dostavěná zemnice', () => {
    expect(whole.campRemnants).toEqual([
      { id: 95, burnerId: BURNER, x: 60, z: 40, rotation: 0, day: DAY + 1 },
    ]);
    const camp = workshopOf(whole).camp!;
    expect(camp.builtDay).toBeGreaterThan(DAY + 1);
    expect(camp.builtDay).toBeLessThan(end);
    expect(kilnsOf(whole)[0]!.trees.map((t) => t.id)).toEqual([1, 2, 3, 4]);
    expect(obstacleIndex(fewBeeches, 1)).toBeGreaterThanOrEqual(0);
  });

  it.each([1, 7, 30])('po %i dnech stejně jako vcelku', (step) => {
    let chunked = camped();
    for (let day = DAY + step; day < end; day += step) {
      chunked = advanceVillage(chunked, day, fewBeeches, landscape);
    }
    chunked = advanceVillage(chunked, end, fewBeeches, landscape);
    expect(chunked).toEqual(whole);
  });
});
