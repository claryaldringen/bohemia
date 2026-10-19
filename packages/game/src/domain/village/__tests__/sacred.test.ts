import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstacleIndex,
  obstacleKind,
  obstacleLook,
  obstaclesOf,
  packObstacles,
  type ObstacleLayer,
  type ObstaclePlacement,
} from '../../landscape';
import { foundField, foundVillage, startSacredBuilding } from '../actions';
import { buildAffordability, sacredBuildLabor, villageStock } from '../costs';
import { obstacleChangesAt } from '../obstacles';
import {
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  checkPlotPlacement,
  checkSacredBuildingPlacement,
  fieldPartsFromCells,
  orchardPartsFromCells,
  placementVillageOf,
} from '../placement';
import {
  OAK_AGE,
  OAK_MODEL_HEIGHT_M,
  SACRED_BUILDINGS,
  SACRED_OAK,
  SACRED_OAK_LIFE,
} from '../rules';
import {
  groveHappiness,
  sacredHappiness,
  sacredSitesOf,
  villageGroves,
  villageSacredOaks,
} from '../sacred';
import {
  groveAgeYears,
  oakAgeHappiness,
  oakAgeYears,
  sacredOakEvents,
  sacredOakLife,
  sacredOakNow,
  sacredOakStage,
} from '../sacred-life';
import { advanceVillage } from '../simulate';
import type { Grove, Position, SacredOak, VillageState } from '../types';
import { fellingCost, isOak, planSacredWood } from '../wood';
import { block, makeLandscape } from './placement-fixtures';

// Posvátná místa (happiness.md). Ruční krajina 16 × 16 políček po 15 m se středem v počátku:
// políčko (8, 8) = svět 0–15 m. Velký osamělý dub v louce na políčku (8, 8), dubový háj (12 dubů
// po 5 m) na políčkách (3, 12) a (4, 12), smíšený les (dub každý třetí strom) vpravo dole a dva
// malé osamělé duby.

const DAY = dayIndexOf({ year: 600, month: 10, day: 1 });
const HOME: Position = { x: -100, z: -20, rotation: 0 };
const BIG_OAK = 1;
const tree = (
  id: number,
  look: ObstaclePlacement['look'],
  x: number,
  z: number,
  scale = 1,
): ObstaclePlacement => ({ id, kind: 'tree', look, x, z, rotation: 0, scale });

function makeLayer(): { layer: ObstacleLayer; groveIds: number[]; mixedOakIds: number[] } {
  const placements: ObstaclePlacement[] = [tree(BIG_OAK, 'oak-large-1', 7.5, 7.5, 1.2)];
  placements.push(tree(2, 'oak-1', -52.5, 22.5, 0.8), tree(3, 'oak-1', -52.5, -52.5, 0.8));
  const groveIds: number[] = [];
  let id = 10;
  for (const z of [65, 60, 70]) {
    for (const x of [-70, -75, -65, -60]) {
      groveIds.push(id);
      placements.push(tree(id++, 'oak-1', x, z));
    }
  }
  const mixedOakIds: number[] = [];
  id = 100;
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const oak = (i + j) % 3 === 0;
      if (oak) mixedOakIds.push(id);
      // jeden mohutný dub uprostřed lesa – v souvislém lese posvátný není
      const big = i === 4 && j === 5;
      placements.push(
        tree(
          id++,
          big ? 'oak-large-1' : oak ? 'oak-1' : 'beech-1',
          30 + i * 5,
          -70 + j * 5,
          big ? 1.2 : 1,
        ),
      );
    }
  }
  placements.push({
    id: 500,
    kind: 'stone',
    look: 'stone-1',
    x: -100,
    z: 31,
    rotation: 0,
    scale: 1,
  });
  placements.sort((a, b) => a.id - b.id);
  return { layer: packObstacles(placements, 16, 15), groveIds, mixedOakIds };
}

const { layer, groveIds, mixedOakIds } = makeLayer();
const landscape = makeLandscape();
const village = (): VillageState =>
  foundVillage({ seed: 3, day: DAY, dwellingPosition: HOME, obstacles: layer });

describe('sacredSitesOf – posvátné duby a háje z vrstvy překážek', () => {
  const sites = sacredSitesOf(layer);

  it('posvátný dub = velký dub mimo souvislý les; malé duby ani dub v lese ne', () => {
    expect(sites.oaks).toEqual([{ id: BIG_OAK, x: 7.5, z: 7.5 }]);
    expect(sites.oaksByTile.get(8 * 16 + 8)).toEqual([{ id: BIG_OAK, x: 7.5, z: 7.5 }]);
  });

  it('háj = aspoň 6 dubů v okruhu 25 m, kde duby převažují; smíšený les hájem není', () => {
    expect(sites.groves).toHaveLength(1);
    const grove = sites.groves[0]!;
    expect(grove.id).toBe(groveIds[0]);
    expect(grove.oaks).toBe(12);
    expect(grove.cells).toEqual([
      { x: 3, y: 12 },
      { x: 4, y: 12 },
    ]);
    expect(sites.groveByTile.get(12 * 16 + 3)).toBe(grove);
    for (const id of groveIds) expect(sites.protectedTrees.has(id)).toBe(true);
    expect(sites.protectedTrees.has(BIG_OAK)).toBe(true);
    for (const id of mixedOakIds) expect(sites.protectedTrees.has(id)).toBe(false);
  });

  it('počítá se jednou na vrstvu', () => {
    expect(sacredSitesOf(layer)).toBe(sites);
  });

  it('skutečná krajina: posvátné duby jsou dospělé duby, háje se nepřekrývají', () => {
    const real = obstaclesOf(generateLandscape(5, CURRENT_LAYER_VERSIONS));
    const realSites = sacredSitesOf(real);
    expect(realSites.oaks.length).toBeGreaterThan(20);
    expect(realSites.groves.length).toBeGreaterThan(2);
    expect(realSites.groves.length).toBeLessThan(25);
    for (const oak of realSites.oaks) {
      const index = obstacleIndex(real, oak.id);
      expect(obstacleKind(real, index)).toBe('tree');
      expect(isOak(real, index)).toBe(true);
    }
    const cells = realSites.groves.flatMap((g) => g.cells.map((c) => `${c.x},${c.y}`));
    expect(new Set(cells).size).toBe(cells.length);
    for (const grove of realSites.groves) expect(grove.oaks).toBeGreaterThanOrEqual(6);
  });
});

describe('stáří dubů – podle velikosti a herního času', () => {
  const START = 0; // 1. 1. 500
  const sizeOf = (layerIn: ObstacleLayer, id: number): number => {
    const index = obstacleIndex(layerIn, id);
    return OAK_MODEL_HEIGHT_M[obstacleLook(layerIn, index)]! * layerIn.scale[index]!;
  };

  it('k začátku světa: nejmenší posvátný dub 150 let, největší 400, mezi tím lineárně', () => {
    expect(oakAgeYears(OAK_AGE.minSizeM, START)).toBe(150);
    expect(oakAgeYears(OAK_AGE.maxSizeM, START)).toBe(400);
    expect(oakAgeYears((OAK_AGE.minSizeM + OAK_AGE.maxSizeM) / 2, START)).toBe(275);
    // mimo rozpětí oříznuté
    expect(oakAgeYears(10, START)).toBe(150);
    expect(oakAgeYears(40, START)).toBe(400);
  });

  it('stárne s herním časem – po celých herních letech', () => {
    const size = 20;
    const atStart = oakAgeYears(size, START);
    expect(oakAgeYears(size, dayIndexOf({ year: 500, month: 12, day: 31 }))).toBe(atStart);
    expect(oakAgeYears(size, dayIndexOf({ year: 501, month: 1, day: 1 }))).toBe(atStart + 1);
    expect(oakAgeYears(size, DAY)).toBe(atStart + 100);
    expect(oakAgeYears(size, dayIndexOf({ year: 1499, month: 12, day: 31 }))).toBe(atStart + 999);
  });

  it('posvátný dub vrstvy: stáří z jeho velikosti; jiný strom nebo neznámé id bez stáří', () => {
    // oak-large-1 × 1,2 = 24,84 m → 150 + 250 × (24,84 − 17,7) / 8,8 ≈ 353 let k 1. 1. 500
    expect(sacredOakNow(layer, BIG_OAK, START).ageYears).toBe(353);
    expect(sacredOakNow(layer, BIG_OAK, DAY).ageYears).toBe(453);
    expect(sacredOakLife(layer, 500)).toBeNull(); // kámen
    expect(sacredOakLife(layer, 101)).toBeNull(); // buk
    expect(sacredOakLife(layer, 99_999)).toBeNull();
    // bez vrstvy (ruční krajina) nejmladší živý dub bez známého stáří
    expect(sacredOakNow(null, BIG_OAK, DAY)).toEqual({
      stage: 'alive',
      ageYears: null,
      happiness: 1,
      sizeM: null,
      diedDay: null,
    });
  });

  it('háj: stáří nejstaršího dubu v okruhu háje; bez dubů null', () => {
    const grove = sacredSitesOf(layer).groves[0]!;
    // duby háje oak-1 × 1 = 16,95 m – pod rozpětím, tedy 150 let k začátku světa
    expect(groveAgeYears(layer, grove, DAY)).toBe(250);
    expect(groveAgeYears(layer, { x: -100, z: -100 }, DAY)).toBeNull();
  });

  it('skutečná krajina: posvátné duby 150–400 let k začátku světa, deterministicky', () => {
    const land = generateLandscape(5, CURRENT_LAYER_VERSIONS);
    const real = obstaclesOf(land);
    const ages = sacredSitesOf(real).oaks.map((o) => sacredOakNow(real, o.id, START).ageYears!);
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(150);
    expect(Math.min(...ages)).toBeLessThan(160);
    expect(Math.max(...ages)).toBeLessThanOrEqual(400);
    expect(Math.max(...ages)).toBeGreaterThan(300);
    // stejný dub = stejné stáří i život z nově vygenerované vrstvy (jiný objekt)
    const again = obstaclesOf(generateLandscape(5, CURRENT_LAYER_VERSIONS));
    for (const oak of sacredSitesOf(real).oaks.slice(0, 10)) {
      expect(sacredOakLife(again, oak.id)).toEqual(sacredOakLife(real, oak.id));
      expect(sacredOakLife(real, oak.id)!.ageAtStart).toBe(oakAgeYears(sizeOf(real, oak.id), 0));
    }
    for (const grove of sacredSitesOf(real).groves) {
      const age = groveAgeYears(real, grove, START)!;
      expect(age).toBeGreaterThanOrEqual(150);
      expect(age).toBeLessThanOrEqual(400);
    }
  });
});

describe('štěstí z posvátného dubu podle stáří', () => {
  it('150 let 1, 2000 let 10, mezi tím podle logaritmu stáří – 200 a 600 let je znát', () => {
    expect(oakAgeHappiness(150)).toBe(1);
    expect(oakAgeHappiness(200)).toBe(2);
    expect(oakAgeHappiness(400)).toBe(4);
    expect(oakAgeHappiness(600)).toBe(6);
    expect(oakAgeHappiness(1000)).toBe(8);
    expect(oakAgeHappiness(1400)).toBe(9);
    expect(oakAgeHappiness(2000)).toBe(10);
    // mimo rozpětí oříznuté
    expect(oakAgeHappiness(100)).toBe(1);
    expect(oakAgeHappiness(3000)).toBe(10);
  });

  it('s věkem nikdy neubývá', () => {
    let last = oakAgeHappiness(150);
    for (let age = 151; age <= 2000; age++) {
      const value = oakAgeHappiness(age);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
  });
});

describe('život posvátného dubu – uschne, souš stojí a padne', () => {
  // mnoho osamělých dubů po 40 m – rozdělení délky života
  const many = packObstacles(
    Array.from({ length: 2000 }, (_, i) =>
      tree(i + 1, 'oak-large-1', -980 + (i % 50) * 40, -980 + Math.floor(i / 50) * 40),
    ),
    140,
    15,
  );
  const lives = Array.from({ length: 2000 }, (_, i) => sacredOakLife(many, i + 1)!);

  it('délka života 800–2000 let: většina 800–1400, málokterý přes 1700', () => {
    const spans = lives.map((l) => l.lifespanYears);
    expect(Math.min(...spans)).toBeGreaterThanOrEqual(SACRED_OAK_LIFE.minYears);
    expect(Math.max(...spans)).toBeLessThanOrEqual(SACRED_OAK_LIFE.maxYears);
    expect(Math.max(...spans)).toBeGreaterThan(1650);
    const share = (test: (v: number) => boolean): number =>
      spans.filter(test).length / spans.length;
    expect(share((v) => v <= 1400)).toBeGreaterThan(0.76);
    expect(share((v) => v <= 1400)).toBeLessThan(0.86);
    expect(share((v) => v > 1700)).toBeLessThan(0.04);
    const mean = spans.reduce((sum, v) => sum + v, 0) / spans.length;
    expect(mean).toBeGreaterThan(1150);
    expect(mean).toBeLessThan(1250);
  });

  it('uschne v létě ve věku délky života, souš padne za 50–100 let', () => {
    for (const life of lives) {
      if (life.diesDay === null) continue;
      const died = dateOfDayIndex(life.diesDay);
      expect(died.month).toBeGreaterThanOrEqual(6);
      expect(died.month).toBeLessThanOrEqual(8);
      expect(life.ageAtStart + died.year - 500).toBe(life.lifespanYears);
      if (life.fallsDay === null) continue;
      const years = dateOfDayIndex(life.fallsDay).year - died.year;
      expect(years).toBeGreaterThanOrEqual(50);
      expect(years).toBeLessThanOrEqual(100);
    }
    // duby 150 let s délkou života nad 1149 let se konce světa nedožijí smrti
    expect(lives.some((l) => l.diesDay === null)).toBe(true);
    expect(lives.some((l) => l.diesDay !== null && l.fallsDay !== null)).toBe(true);
  });

  it('stadium, stáří a štěstí podle dne: živý dub, souš (1), padlá souš (nic)', () => {
    const life = sacredOakLife(layer, BIG_OAK)!;
    // oak-large-1 × 1,2: 353 let k roku 500, dožije se 1175 let – uschne 24. 6. 1322, padne 1376
    expect(life.lifespanYears).toBe(1175);
    const died = life.diesDay!;
    const fell = life.fallsDay!;
    expect(dateOfDayIndex(died)).toMatchObject({ year: 1322, month: 6, day: 24 });
    expect(dateOfDayIndex(fell).year).toBe(1376);
    expect(sacredOakNow(layer, BIG_OAK, died - 1)).toMatchObject({
      stage: 'alive',
      ageYears: 1175,
      happiness: oakAgeHappiness(1175),
      diedDay: null,
    });
    expect(sacredOakNow(layer, BIG_OAK, died)).toEqual({
      stage: 'snag',
      ageYears: 1175,
      happiness: 1,
      sizeM: life.sizeM,
      diedDay: died,
    });
    expect(sacredOakNow(layer, BIG_OAK, fell - 1).stage).toBe('snag');
    expect(sacredOakNow(layer, BIG_OAK, fell)).toMatchObject({ stage: 'fallen', happiness: 0 });
    expect(sacredOakStage(life, DAY)).toBe('alive');
  });

  it('kronika: dub uschl a souš padla – jednou, v den podle dubu; simulace je zapíše', () => {
    const life = sacredOakLife(layer, BIG_OAK)!;
    const spared: SacredOak[] = [{ id: BIG_OAK, day: DAY, x: 7.5, z: 7.5 }];
    expect(sacredOakEvents(spared, layer, life.diesDay!)).toEqual([
      { day: life.diesDay, kind: 'sacred-oak-died', id: BIG_OAK },
    ]);
    expect(sacredOakEvents(spared, layer, life.fallsDay!)).toEqual([
      { day: life.fallsDay, kind: 'sacred-snag-fell', id: BIG_OAK },
    ]);
    expect(sacredOakEvents(spared, layer, life.diesDay! + 1)).toEqual([]);
    expect(sacredOakEvents(spared, null, life.diesDay!)).toEqual([]);
    // ves s ušetřeným dubem dopočítaná přes den uschnutí – po kouscích i najednou stejně
    const s = foundVillage({
      seed: 3,
      day: life.diesDay! - 3,
      dwellingPosition: HOME,
      obstacles: layer,
    });
    s.sacredOaks = [{ id: BIG_OAK, day: s.foundedDay, x: 7.5, z: 7.5 }];
    const whole = advanceVillage(s, life.diesDay! + 2, layer);
    const pieces = advanceVillage(
      advanceVillage(s, life.diesDay!, layer),
      life.diesDay! + 2,
      layer,
    );
    const died = (v: VillageState): unknown[] =>
      v.chronicle.filter((e) => e.kind === 'sacred-oak-died');
    expect(died(whole)).toEqual([{ day: life.diesDay, kind: 'sacred-oak-died', id: BIG_OAK }]);
    expect(died(pieces)).toEqual(died(whole));
    // štěstí z dubu: souš přidá 1
    expect(sacredHappiness(whole, whole.lastDay, layer)).toBe(1);
  });
});

describe('štěstí z posvátných míst', () => {
  const oak = (id: number): SacredOak => ({ id, day: DAY, x: 0, z: 0 });
  const grove = (id: number, oaks: number): Grove => ({
    id,
    day: DAY,
    x: 0,
    z: 0,
    cells: [],
    oaks,
  });

  it('háj +10 a +1 za každé 2 duby nad 6, nejvýš +15', () => {
    expect(groveHappiness(6)).toBe(10);
    expect(groveHappiness(7)).toBe(10);
    expect(groveHappiness(8)).toBe(11);
    expect(groveHappiness(15)).toBe(14);
    expect(groveHappiness(16)).toBe(15);
    expect(groveHappiness(40)).toBe(15);
  });

  it('duby nejvýš 3, háje nejvýš 2 nejlepší, modly nejvýš 2, svatyně – dohromady nejvýš +40', () => {
    // bez vrstvy překážek se dub počítá jako nejmladší (+1)
    expect(sacredHappiness({ sacredOaks: [oak(1), oak(2), oak(3), oak(4)] }, DAY, null)).toBe(3);
    expect(sacredHappiness({ groves: [grove(1, 6), grove(2, 16), grove(3, 10)] }, DAY, null)).toBe(
      27,
    );
    const idol = (id: number): NonNullable<VillageState['sacredBuildings']>[number] => ({
      id,
      kind: 'idol',
      position: HOME,
      builtDay: DAY,
    });
    expect(sacredHappiness({ sacredBuildings: [idol(1), idol(2), idol(3)] }, DAY, null)).toBe(16);
    expect(
      sacredHappiness(
        {
          sacredOaks: [{ ...oak(BIG_OAK), x: 7.5, z: 7.5 }],
          sacredBuildings: [idol(1), { ...idol(2), kind: 'shrine' }],
        },
        DAY,
        layer,
      ),
    ).toBe(5 + 8 + 25); // dub 453 let = 5
    expect(
      sacredHappiness(
        {
          sacredOaks: [oak(1), oak(2)],
          groves: [grove(1, 16)],
          sacredBuildings: [{ ...idol(2), kind: 'shrine' }],
        },
        DAY,
        null,
      ),
    ).toBe(40); // 2 + 15 + 25 = 42 → strop +40
    expect(sacredHappiness({}, DAY, null)).toBe(0);
  });

  it('počítají se 3 duby, které přidávají nejvíc – stáří rozhoduje, souš přidá 1', () => {
    const life = sacredOakLife(layer, BIG_OAK)!;
    const big = { ...oak(BIG_OAK), x: 7.5, z: 7.5 };
    const young = [oak(900), oak(901), oak(902)]; // bez dubu ve vrstvě – po 1
    expect(sacredHappiness({ sacredOaks: [...young, big] }, DAY, layer)).toBe(5 + 1 + 1);
    expect(sacredHappiness({ sacredOaks: [big] }, life.diesDay! - 1, layer)).toBe(
      oakAgeHappiness(1175),
    );
    expect(sacredHappiness({ sacredOaks: [big] }, life.diesDay!, layer)).toBe(1);
    expect(sacredHappiness({ sacredOaks: [big] }, life.fallsDay!, layer)).toBe(0);
  });
});

describe('mýcení kolem posvátných míst', () => {
  const positions = [HOME];

  it('pole: posvátný dub zůstane stát, plocha pod korunou se do dílu nepočítá', () => {
    const preview = fieldPartsFromCells(landscape, null, block(7, 7, 3, 3), positions, layer);
    expect(preview.check.ok).toBe(true);
    expect(preview.check.warning).toBe('Posvátný dub zůstane stát');
    const part = preview.parts.find((p) => p.cell?.x === 8 && p.cell.y === 8)!;
    expect(part.areaM2).toBe(225 - SACRED_OAK.crownM2);
    expect(part.obstacleIds ?? []).not.toContain(BIG_OAK);
    expect(preview.spared.oaks).toEqual([{ id: BIG_OAK, x: 7.5, z: 7.5 }]);
    expect(preview.sacredCells).toEqual([{ x: 8, y: 8 }]);
  });

  it('pole: čtverce háje se vyjmou a háj zůstane stát', () => {
    const cells = block(2, 11, 4, 3);
    const preview = fieldPartsFromCells(landscape, null, cells, positions, layer);
    expect(preview.check.ok).toBe(true);
    expect(preview.check.warning).toBe('Dubový háj zůstane stát');
    expect(preview.parts).toHaveLength(cells.length - 2);
    expect(preview.parts.some((p) => p.cell?.y === 12 && (p.cell.x === 3 || p.cell.x === 4))).toBe(
      false,
    );
    expect(preview.spared.groves.map((g) => g.id)).toEqual([groveIds[0]]);
    // jen čtverce háje – pole nevznikne
    const only = fieldPartsFromCells(landscape, null, block(3, 12, 2, 1), positions, layer);
    expect(only.check).toEqual({
      ok: false,
      reason: 'Roste tu posvátný dubový háj – ten vesničané nevykácejí.',
    });
  });

  it('sad: dub zůstane stát (plocha bez koruny); hřbitov na čtverec s dubem nesmí', () => {
    const orchard = orchardPartsFromCells(landscape, null, block(8, 8, 1, 1), positions, layer);
    expect(orchard.check.ok).toBe(true);
    expect(orchard.squares[0]!.areaM2).toBe(225 - SACRED_OAK.crownM2);
    expect(orchard.spared.oaks).toHaveLength(1);
    const cemetery = cemeteryPartsFromCells(landscape, null, block(8, 8, 1, 1), positions, layer);
    expect(cemetery.check.ok).toBe(false);
    expect(cemetery.check.reason).toBe(
      'Stojí tu posvátný dub – mezi hroby ho vesničané nenechají.',
    );
    expect(cemetery.blockedCells).toEqual([{ x: 8, y: 8 }]);
  });

  it('obydlí: pod korunou dubu stavět nejde, dub na vyklízené ploše zůstane stát', () => {
    const under = checkDwellingPlacement(
      landscape,
      null,
      'zemnice',
      { x: 9, z: 7, rotation: 0 },
      layer,
    );
    expect(under.ok).toBe(false);
    expect(under.reason).toBe('Stojí tu posvátný dub – ten vesničané nepokácí.');
    const near = checkDwellingPlacement(
      landscape,
      null,
      'zemnice',
      { x: 7.5, z: 1, rotation: 0 },
      layer,
    );
    expect(near.ok).toBe(true);
    expect(near.obstacleIds).not.toContain(BIG_OAK);
    expect(near.spared.oaks.map((o) => o.id)).toEqual([BIG_OAK]);
    expect(near.warning).toContain('Posvátný dub zůstane stát');
  });

  it('pozemek polozemnice: na políčku nesmí být posvátný dub ani háj (nic nezůstane stát)', () => {
    const plot = (x: number, y: number) =>
      checkPlotPlacement(
        landscape,
        null,
        'polozemnice',
        { cell: { x, y }, variant: 'center' },
        layer,
      );
    const oak = plot(8, 8);
    expect(oak.ok).toBe(false);
    expect(oak.reason).toBe('Na pozemku stojí posvátný dub – ten vesničané nepokácí.');
    const grove = plot(3, 12);
    expect(grove.ok).toBe(false);
    expect(grove.reason).toBe('Na pozemku roste posvátný dubový háj – ten vesničané nevykácejí.');
    // sousední políčko jde – dub stojí dál od domu, než sahá koruna
    const beside = plot(8, 7);
    expect(beside.ok).toBe(true);
    expect(beside.obstacleIds).not.toContain(BIG_OAK);
    expect(beside.spared).toEqual({ oaks: [], groves: [] });
  });

  it('založení pole zapíše ušetřený dub do vsi a kroniky – jednou', () => {
    const s = village();
    const preview = fieldPartsFromCells(
      landscape,
      placementVillageOf(s, DAY),
      block(7, 7, 3, 3),
      positions,
      layer,
    );
    const next = foundField(s, DAY, { parts: preview.parts, sacred: preview.spared });
    expect(villageSacredOaks(next)).toEqual([{ id: BIG_OAK, day: DAY, x: 7.5, z: 7.5 }]);
    expect(next.chronicle.at(-1)).toEqual({
      day: DAY,
      kind: 'sacred-spared',
      site: 'oak',
      id: BIG_OAK,
    });
    const again = foundField(next, DAY, {
      parts: fieldPartsFromCells(
        landscape,
        placementVillageOf(next, DAY),
        block(2, 2, 3, 3),
        positions,
        layer,
      ).parts,
      sacred: preview.spared,
    });
    expect(villageSacredOaks(again)).toHaveLength(1);
    expect(villageGroves(again)).toEqual([]);
  });

  it('kácení pro stavby posvátné duby ani stromy hájů nebere', () => {
    const s = village();
    const fell = s.constructions[0]!.wood!.fell.map((t) => t.id!);
    expect(fell).toHaveLength(7);
    const sites = sacredSitesOf(layer);
    for (const id of fell) expect(sites.protectedTrees.has(id)).toBe(false);
  });
});

describe('modla a svatyně', () => {
  it('kontrola umístění: louka, výchoz, posvátný dub, překryv, jedna svatyně, rovina', () => {
    const at = (x: number, z: number): Position => ({ x, z, rotation: 0 });
    const ok = checkSacredBuildingPlacement(landscape, null, 'idol', at(-100, 30), layer);
    expect(ok.ok).toBe(true);
    expect(ok.obstacleIds).toEqual([500]);
    expect(ok.obstacleCost).toBe(1);
    expect(checkSacredBuildingPlacement(landscape, null, 'idol', at(8, 9), layer).reason).toBe(
      'Stojí tu posvátný dub – ten vesničané nepokácí.',
    );
    expect(checkSacredBuildingPlacement(landscape, null, 'shrine', at(-55, 70), layer).reason).toBe(
      'Roste tu posvátný dubový háj – ten vesničané nevykácejí.',
    );
    const s = village();
    const v = placementVillageOf(s, DAY);
    expect(
      checkSacredBuildingPlacement(landscape, v, 'idol', at(HOME.x + 1, HOME.z), layer).ok,
    ).toBe(false);
    const withShrine = {
      ...v,
      sacredBuildings: [{ kind: 'shrine' as const, position: at(60, 60) }],
    };
    expect(
      checkSacredBuildingPlacement(landscape, withShrine, 'shrine', at(-60, -60), layer).reason,
    ).toBe('Ves už svatyni má – svatyně je jedna na ves.');
    expect(
      checkSacredBuildingPlacement(landscape, withShrine, 'idol', at(60, 60), layer).reason,
    ).toBe('Překrývá se se svatyní.');
    // v lese modla jde – les se vyklučí za sazbu lesa (Martin 19. 10. 2026), 4 × 4 m = 16 m²
    const forest = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });
    const inForest = checkSacredBuildingPlacement(forest, null, 'idol', at(30, -100), layer);
    expect(inForest.ok).toBe(true);
    expect(inForest.obstacleCost).toBeCloseTo((250 * 16) / 10_000);
    const slope = makeLandscape({ height: (x) => x * 0.6 });
    expect(checkSacredBuildingPlacement(slope, null, 'shrine', at(-60, -60), layer).ok).toBe(false);
    expect(checkSacredBuildingPlacement(slope, null, 'idol', at(-60, -60), layer).ok).toBe(true);
  });

  it('duby: kácí se nejbližší dospělé duby, ne buky ani posvátné duby', () => {
    const plan = planSacredWood(
      'shrine',
      { x: 50, z: -50 },
      { changes: () => obstacleChangesAt({}, DAY), claimed: () => new Set() },
      { obstacles: layer },
    );
    expect(plan.missing).toBe(0);
    expect(plan.fell).toHaveLength(SACRED_BUILDINGS.shrine.oaks);
    for (const t of plan.fell) expect(mixedOakIds).toContain(t.id);
  });

  it('cena předem: duby ke kácení (bez posvátných); svatyně jedna na ves', () => {
    const s = village();
    const fellable = mixedOakIds.length + 2 - s.constructions[0]!.wood!.fell.length;
    expect(villageStock(s, layer).oaks).toBeLessThanOrEqual(mixedOakIds.length + 2);
    expect(villageStock(s, layer).oaks).toBeGreaterThanOrEqual(fellable);
    expect(buildAffordability(s, 'idol', layer).affordable).toBe(true);
    const shrine = startSacredBuilding(s, DAY, 'shrine', { x: -60, z: -60, rotation: 0 }, 0, [], {
      obstacles: layer,
    });
    expect(() =>
      startSacredBuilding(shrine, DAY, 'shrine', { x: 60, z: 60, rotation: 0 }, 0, [], {
        obstacles: layer,
      }),
    ).toThrow(RangeError);
  });

  it('modla se staví ze společné práce: nejdřív se skácí dub, pak stojí a přidává štěstí', () => {
    const s = village();
    const position: Position = { x: -100, z: 30, rotation: 0.5 };
    const started = startSacredBuilding(s, DAY, 'idol', position, 1, [500], { obstacles: layer });
    const c = started.constructions.at(-1)!;
    expect(c.kind).toBe('idol');
    expect(c.position).toEqual(position);
    expect(c.wood!.fell).toHaveLength(1);
    const oakId = c.wood!.fell[0]!.id!;
    expect(isOak(layer, obstacleIndex(layer, oakId))).toBe(true);
    expect(c.cost).toBeCloseTo(sacredBuildLabor('idol') + 1 + c.wood!.fell[0]!.cost, 9);
    expect(c.wood!.fell[0]!.cost).toBeGreaterThanOrEqual(fellingCost(0));
    expect(obstacleChangesAt(started, DAY).removed).toContain(500);
    const built = advanceVillage(started, DAY + 400, layer);
    expect(built.sacredBuildings).toEqual([
      expect.objectContaining({ id: c.id, kind: 'idol', position }),
    ]);
    expect(obstacleChangesAt(built, built.lastDay).stumps).toContain(oakId);
    expect(sacredHappiness(built, built.lastDay, layer)).toBe(SACRED_BUILDINGS.idol.happiness);
    expect(built.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'construction-finished', constructionKind: 'idol' }),
    );
  });
});
