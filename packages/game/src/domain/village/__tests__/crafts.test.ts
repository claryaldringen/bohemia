import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../landscape';
import { foundField, foundVillage, startWorkshop } from '../actions';
import { BUILD_COSTS } from '../costs';
import {
  craftCoverage,
  craftStocks,
  newWorkshop,
  wearCraftStocks,
  workCrafts,
  workshopLabor,
} from '../crafts';
import { appleKeepDays, applesSpoiled, daysUntilAppleRot } from '../food';
import {
  checkDwellingPlacement,
  checkWorkshopPlacement,
  type PlacementVillage,
} from '../placement';
import { NO_CRAFTS } from '../productivity';
import { CRAFT_BASE, workshopBuildLabor, workshopCost, workshopTrees } from '../rules';
import { withPlots } from '../plots';
import { advanceVillage } from '../simulate';
import { summarizeVillage } from '../summary';
import type { Craft, Person, VillageState } from '../types';
import { reservedTrees } from '../wood';
import { planCrops } from '../year-plan';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 10, 1);
const YEAR = 365.25;
const SITE = { x: 0, z: 0, rotation: 0 };
/** Dílna stojí 40 m na východ – milíř uhlíře (−9, +3 m) pak ≈ 29 m od okraje lesa. */
const WORKSHOP_SITE = { x: 40, z: 0, rotation: 0 };
const WORKSHOP_ID = 50;

const tree = (id: number, x: number, z: number): ObstaclePlacement => ({
  id,
  kind: 'tree',
  look: 'beech-1',
  x,
  z,
  rotation: 0,
  scale: 1,
});

/** Les na východ: dospělé stromy po 4 m od x = 60 m do 340 m (krajina 64 × 15 m). */
function forestLayer(): ObstacleLayer {
  const trees: ObstaclePlacement[] = [];
  let id = 1;
  for (let x = 60; x <= 340; x += 4)
    for (let z = -100; z <= 100; z += 4) trees.push(tree(id++, x, z));
  return packObstacles(trees, 64, 15);
}
const forest = forestLayer();
const noTrees = packObstacles([], 64, 15);

const person = (id: number, years: number, dwellingId: number, day = DAY): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR),
  dwellingId,
});

/** Ves s hotovou zemnicí (id 1) a plnou domácností – jeden pár k osídlení, bez polí a staveb. */
function fullVillage(day = DAY): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day, dwellingPosition: SITE }));
  s.people = [
    person(2, 25, 1, day),
    person(3, 25, 1, day),
    person(4, 20, 1, day),
    person(5, 19, 1, day),
    person(6, 5, 1, day),
    person(7, 3, 1, day),
  ];
  s.constructions = [];
  s.storesKg = 50_000;
  s.lastDay = day;
  s.nextId = 100;
  return s;
}

/** Přidá hotovou dílnu `craft` s domácností dvou dospělých (id lidí od `firstPerson`). */
function withWorkshop(
  s: VillageState,
  craft: Craft,
  id = WORKSHOP_ID,
  position = WORKSHOP_SITE,
  firstPerson = 60,
): VillageState {
  s.dwellings.push({
    id,
    type: CRAFT_BASE[craft],
    builtDay: s.lastDay,
    condition: 1,
    position: { ...position },
    workshop: newWorkshop(craft),
  });
  s.people.push(person(firstPerson, 24, id, s.lastDay), person(firstPerson + 1, 22, id, s.lastDay));
  return s;
}

/** Den práce dílen bez zbytku simulace (štěstí 50 → práce × 1). */
function craftDays(s: VillageState, days: number, layer: ObstacleLayer | null): void {
  for (let i = 1; i <= days; i++) workCrafts(s, s.lastDay + i, layer, NO_CRAFTS, 1);
}

describe('řemeslná dílna – cena a stavba (crafts.md – Budovy)', () => {
  it('dílna stojí jako základní obydlí + 30 % práce i dřeva', () => {
    expect(workshopCost('potter')).toBe(286);
    expect(workshopTrees('potter')).toBe(23);
    expect(workshopCost('smith')).toBe(286);
    expect(workshopCost('burner')).toBe(78);
    expect(workshopTrees('burner')).toBe(9);
    expect(BUILD_COSTS.smith).toEqual({
      laborManDays: 286,
      perHa: false,
      upfront: { wood: 23, settlers: 1 },
    });
  });

  it('startWorkshop zahájí stavbu obydlí řemesla s cenou dílny a vyhradí dřevo', () => {
    const next = startWorkshop(fullVillage(), DAY, 'smith', WORKSHOP_SITE, 3, [], {
      waterDistanceM: 250,
    });
    const site = next.constructions.at(-1)!;
    expect(site).toMatchObject({
      kind: 'dwelling',
      craft: 'smith',
      dwellingType: 'polozemnice',
      dwellingId: null,
      waterDistanceM: 250,
    });
    expect(site.wood?.fell).toHaveLength(23);
    expect(site.cost).toBeCloseTo(workshopBuildLabor('smith') + 3 + 23 * 2, 9);
  });

  it('bez mladého páru k osídlení dílna nejde', () => {
    const s = fullVillage();
    s.people = s.people.slice(0, 2);
    expect(() => startWorkshop(s, DAY, 'potter', WORKSHOP_SITE, 0)).toThrow(RangeError);
  });

  it('po dostavění se do dílny nastěhuje mladý pár a řemeslo patří budově', () => {
    const next = startWorkshop(fullVillage(), DAY, 'burner', WORKSHOP_SITE, 0);
    const site = next.constructions.at(-1)!;
    site.done = site.cost;
    site.wood!.felled = site.wood!.fell.length;
    const after = advanceVillage(next, DAY + 1, null);
    const workshop = after.dwellings.find((d) => d.workshop);
    expect(workshop?.workshop?.craft).toBe('burner');
    expect(workshop?.type).toBe('zemnice');
    expect(after.people.filter((p) => p.dwellingId === workshop?.id)).toHaveLength(2);
    expect(after.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'construction-finished', craft: 'burner' }),
    );
  });
});

describe('řemeslník na plný úvazek (crafts.md – Práce a jídlo)', () => {
  it('domácnost dílny dá řemeslu práci po denním minimu a domácí výrobě', () => {
    const s = withWorkshop(fullVillage(), 'smith');
    const labor = workshopLabor(s, DAY + 1, WORKSHOP_ID, 0);
    expect(labor.capacity).toBe(2);
    expect(labor.dailyMin).toBeCloseTo(0.5, 9);
    expect(labor.domestic).toBeCloseTo(0.3 + 2 * 0.15, 9);
    expect(labor.craft).toBeCloseTo(0.9, 9);
    // s plným pokrytím nádobami je denní minimum menší
    expect(workshopLabor(s, DAY + 1, WORKSHOP_ID, 1).craft).toBeCloseTo(0.95, 9);
  });

  it('práce domácnosti dílny nejde na pole ani do společné práce vsi', () => {
    const withCraft = advanceVillage(withWorkshop(fullVillage(), 'burner'), DAY + 1, null);
    const empty = withWorkshop(fullVillage(), 'burner');
    empty.people = empty.people.filter((p) => p.dwellingId !== WORKSHOP_ID);
    const without = advanceVillage(empty, DAY + 1, null);
    // slepice u dílny krmí ves (péče o zvířata – diet.md), jinak stejně
    expect(withCraft.commonLaborHistory.at(-1)).toBeCloseTo(without.commonLaborHistory.at(-1)!, 2);
    // uhlíř kácí strom bez polohy (ves bez vrstvy) – práce jde k dílně
    const fell = withCraft.labor!.shares.filter((s) => s.activity === 'fell');
    expect(fell).toEqual([
      { activity: 'fell', target: { kind: 'dwelling', id: WORKSHOP_ID }, manDays: 0.9 },
    ]);
    expect(without.dwellings.find((d) => d.id === WORKSHOP_ID)?.workshop?.activity).toBe('empty');
  });
});

describe('výroba (crafts.md – Výroba)', () => {
  it('uhlíř kácí nejbližší dospělý strom a pálí z něj 120 kg uhlí po 10 kg za člověkoden', () => {
    const s = withWorkshop(fullVillage(), 'burner');
    craftDays(s, 1, forest);
    const workshop = s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!;
    expect(workshop.activity).toBe('felling');
    const treeId = workshop.felling!.id!;
    // strom patří dílně – jiná stavba ho nekácí
    expect(reservedTrees(s).has(treeId)).toBe(true);
    // 20 dní × 0,9 člověkodne: 2 stromy po 2 čd kácení, zbytek pálení po 10 kg
    craftDays(s, 19, forest);
    expect(craftStocks(s).charcoalKg).toBeCloseTo((20 * 0.9 - 2 * 2) * 10, 6);
    expect(s.felledTrees?.map((f) => f.id)).toContain(treeId);
    expect(s.felledTrees).toHaveLength(2);
    expect(workshop.activity).toBe('producing');
  });

  it('kovář kuje z uhlí – 1 kg nástrojů za 10 člověkodní a 50 kg uhlí, bez uhlí stojí', () => {
    const s = withWorkshop(fullVillage(), 'smith');
    s.crafts = { charcoalKg: 1000, toolsKg: 0, potteryKg: 0 };
    craftDays(s, 1, null);
    expect(s.crafts.toolsKg).toBeCloseTo(0.09, 9);
    expect(s.crafts.charcoalKg).toBeCloseTo(1000 - 0.09 * 50, 9);
    const workshop = s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!;
    expect(workshop.activity).toBe('producing');
    s.crafts.charcoalKg = 2;
    craftDays(s, 1, null);
    expect(s.crafts.toolsKg).toBeCloseTo(0.09 + 0.04, 9);
    craftDays(s, 1, null);
    expect(s.crafts.toolsKg).toBeCloseTo(0.13, 9);
    expect(workshop.activity).toBe('no-charcoal');
  });

  it('ruda dál od potoka stojí víc práce (+1 % za 10 m nad 100 m)', () => {
    const s = withWorkshop(fullVillage(), 'smith');
    s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!.waterDistanceM = 300;
    s.crafts = { charcoalKg: 1000, toolsKg: 0, potteryKg: 0 };
    craftDays(s, 1, null);
    expect(s.crafts.toolsKg).toBeCloseTo(0.9 / 12, 9);
  });

  it('hrnčíř vypálí 1 kg keramiky za člověkoden a na 500 kg skácí strom', () => {
    const s = withWorkshop(fullVillage(), 'potter');
    craftDays(s, 10, forest);
    const workshop = s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!;
    expect(craftStocks(s).potteryKg).toBeCloseTo(10 * 0.9 - 2, 6);
    expect(workshop.fuelKg).toBeCloseTo(500 - (10 * 0.9 - 2), 6);
  });

  it('bez dospělých stromů uhlíř i hrnčíř čekají na dřevo', () => {
    for (const craft of ['burner', 'potter'] as const) {
      const s = withWorkshop(fullVillage(), craft);
      craftDays(s, 3, noTrees);
      expect(s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!.activity).toBe('no-wood');
      expect(craftStocks(s)).toEqual({ charcoalKg: 0, toolsKg: 0, potteryKg: 0 });
    }
  });

  it('prázdná dílna nic nevyrábí', () => {
    const s = withWorkshop(fullVillage(), 'burner');
    s.people = s.people.filter((p) => p.dwellingId !== WORKSHOP_ID);
    expect(workCrafts(s, DAY + 1, forest, NO_CRAFTS)).toEqual([]);
    expect(s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!.activity).toBe('empty');
    expect(craftStocks(s).charcoalKg).toBe(0);
  });
});

describe('pokrytí a meze produktivity (crafts.md – Účinek)', () => {
  it('pokrytí = zásoba ÷ potřeba (3 kg nástrojů na pracujícího, 5 kg nádob na člověka)', () => {
    const s = fullVillage();
    s.crafts = { charcoalKg: 0, toolsKg: 6, potteryKg: 60 };
    // 4 pracující potřebují 12 kg nástrojů, 6 lidí 30 kg nádob
    expect(craftCoverage(s, DAY)).toEqual({ tools: 0.5, pottery: 1 });
  });

  it('ves bez řemesel – i uložená před nimi – má pokrytí 0', () => {
    const s = fullVillage();
    delete s.crafts;
    expect(craftCoverage(s, DAY)).toEqual(NO_CRAFTS);
    expect(craftStocks(s)).toEqual({ charcoalKg: 0, toolsKg: 0, potteryKg: 0 });
  });

  it('opotřebí se jen nástroje a nádoby v užívání (30 % a 40 % ročně)', () => {
    const s = fullVillage();
    s.crafts = { charcoalKg: 50, toolsKg: 24, potteryKg: 30 };
    for (let i = 1; i <= 365; i++) wearCraftStocks(s, DAY + i);
    // v užívání je nejvýš potřeba (12 kg nástrojů) – za rok se jich nahradí 30 %, druhá půlka
    // zásoby leží
    expect(s.crafts.toolsKg).toBeCloseTo(24 - 12 * 0.3, 9);
    // nádoby bez náhrady: 40 % / 365 denně z toho, co zbývá
    expect(s.crafts.potteryKg).toBeCloseTo(30 * (1 - 0.4 / 365) ** 365, 9);
    expect(s.crafts.charcoalKg).toBe(50);
  });

  it('nádoby posouvají denní minimum a ztráty zásob dne', () => {
    const base = fullVillage();
    const potted = fullVillage();
    potted.crafts = { charcoalKg: 0, toolsKg: 0, potteryKg: 1000 };
    const a = advanceVillage(base, DAY + 1, null);
    const b = advanceVillage(potted, DAY + 1, null);
    // denní minimum jedné domácnosti 0,5 → 0,45
    expect(b.commonLaborHistory.at(-1)! - a.commonLaborHistory.at(-1)!).toBeCloseTo(0.05, 9);
    // ztráty zásob 10 → 5 % ročně
    const expected = 50_000 * (0.95 ** (1 / 365) - 0.9 ** (1 / 365));
    expect(b.storesKg - a.storesKg).toBeCloseTo(expected, 6);
  });

  it('nástroje zlevní práci plánu osevu (kopání 100 → 50 čd/ha) i založení pole', () => {
    const plan = (tools: number): number => {
      const s = foundField(fullVillage(at(600, 8, 1)), at(600, 8, 1), {
        parts: Array.from({ length: 40 }, () => ({
          areaM2: 225,
          distanceM: 50,
          naturalFertility: 70,
          surface: 'meadow' as const,
          obstacleCost: 0,
        })),
      });
      s.crafts = { charcoalKg: 0, toolsKg: tools, potteryKg: 0 };
      const founded = s.constructions.at(-1)!;
      for (const p of s.parts) {
        p.foundingDone = p.foundingCost;
        p.state = 'ready';
      }
      founded.done = founded.cost;
      const after = advanceVillage(s, at(600, 9, 1), null);
      const crops = planCrops(after.plan!);
      const dig = crops.reduce((sum, c) => sum + c.work.required.dig, 0);
      const sow = crops.reduce((sum, c) => sum + c.work.required.sow, 0);
      return dig / sow;
    };
    expect(plan(0)).toBeCloseTo(10, 6);
    expect(plan(1000)).toBeCloseTo(5, 6);
    const field = {
      parts: [
        { areaM2: 1000, distanceM: 50, naturalFertility: 70, surface: 'meadow', obstacleCost: 0 },
      ] as const,
    };
    const tooled = fullVillage();
    tooled.crafts = { charcoalKg: 0, toolsKg: 1000, potteryKg: 0 };
    const cost = (s: VillageState): number =>
      foundField(s, DAY, { parts: [...field.parts] }).parts.at(-1)!.foundingCost;
    expect(cost(fullVillage())).toBeCloseTo(10, 9);
    expect(cost(tooled)).toBeCloseTo(9, 9);
  });
});

describe('jablka v nádobách (crafts.md – Účinek, orchard.md)', () => {
  it('s plným pokrytím vydrží do 1. 5., s částečným poměrně', () => {
    expect(appleKeepDays(0)).toBe(0);
    expect(appleKeepDays(1)).toBe(61);
    expect(appleKeepDays(0.5)).toBe(31);
    const feb = at(600, 2, 28);
    expect(daysUntilAppleRot(feb)).toBe(at(600, 3, 1) - feb);
    expect(daysUntilAppleRot(feb, 1)).toBe(at(600, 5, 1) - feb);
    const march = at(600, 3, 10);
    expect(daysUntilAppleRot(march)).toBe(at(601, 3, 1) - march);
    expect(daysUntilAppleRot(march, 1)).toBe(at(600, 5, 1) - march);
    expect(applesSpoiled(at(600, 3, 1))).toBe(true);
    expect(applesSpoiled(at(600, 3, 1), 1)).toBe(false);
    expect(applesSpoiled(at(600, 5, 1), 1)).toBe(true);
    expect(applesSpoiled(at(600, 6, 1))).toBe(false);
  });

  it('ve vsi s nádobami se jablka jí i v březnu a dubnu', () => {
    const day = at(600, 2, 20);
    const make = (pottery: number): VillageState => {
      const s = fullVillage(day);
      s.applesKg = 20_000;
      s.crafts = { charcoalKg: 0, toolsKg: 0, potteryKg: pottery };
      return s;
    };
    expect(advanceVillage(make(0), at(600, 3, 15), null).applesKg).toBe(0);
    const potted = advanceVillage(make(10_000), at(600, 3, 15), null);
    expect(potted.applesKg).toBeGreaterThan(0);
    expect(advanceVillage(potted, at(600, 5, 1), null).applesKg).toBe(0);
  });
});

describe('dílny ve vsi – simulace', () => {
  /** Ves s uhlířem, kovářem a hrnčířem vedle obyčejné domácnosti. */
  function craftVillage(): VillageState {
    const s = fullVillage();
    withWorkshop(s, 'burner', 50, { x: 40, z: 0, rotation: 0 }, 60);
    withWorkshop(s, 'smith', 51, { x: 40, z: 30, rotation: 0 }, 70);
    withWorkshop(s, 'potter', 52, { x: 40, z: -30, rotation: 0 }, 80);
    return s;
  }

  it('výsledek nezávisí na kouscích dopočítání', () => {
    const end = DAY + 400;
    const whole = advanceVillage(craftVillage(), end, forest);
    let chunked = craftVillage();
    for (const to of [DAY + 37, DAY + 100, DAY + 101, DAY + 250, end]) {
      chunked = advanceVillage(chunked, to, forest);
    }
    expect(chunked).toEqual(whole);
    expect(whole.crafts!.toolsKg).toBeGreaterThan(0);
    expect(whole.crafts!.potteryKg).toBeGreaterThan(0);
  });

  it('stav po JSON (uložení do databáze) se dopočítá stejně', () => {
    const s = advanceVillage(craftVillage(), DAY + 30, forest);
    const stored = JSON.parse(JSON.stringify(s)) as VillageState;
    expect(advanceVillage(stored, DAY + 90, forest)).toEqual(advanceVillage(s, DAY + 90, forest));
  });

  it('ves uložená před řemesly se dopočítá bez zásob a dílen', () => {
    const s = fullVillage();
    delete s.crafts;
    const after = advanceVillage(s, DAY + 60, null);
    expect(after.crafts).toBeUndefined();
    expect(after.dwellings.some((d) => d.workshop)).toBe(false);
  });

  it('přestavba dílny zachová řemeslo i typ obydlí', () => {
    const s = withWorkshop(fullVillage(), 'burner');
    s.dwellings.find((d) => d.id === WORKSHOP_ID)!.builtDay = DAY - Math.ceil(30 * YEAR);
    // dost společné práce na polozemnici – obyčejná zemnice by se přestavěla na ni
    s.commonLaborHistory = Array.from({ length: 30 }, () => 10);
    const after = advanceVillage(s, DAY + 1, null);
    const rebuild = after.constructions.find((c) => c.kind === 'rebuild');
    expect(rebuild).toMatchObject({ dwellingId: WORKSHOP_ID, dwellingType: 'zemnice' });
    expect(rebuild!.wood!.trees).toBe(workshopTrees('burner'));
    expect(rebuild!.cost).toBeCloseTo(workshopBuildLabor('burner') + 9 * 2, 9);
    rebuild!.done = rebuild!.cost;
    rebuild!.wood!.felled = rebuild!.wood!.fell.length;
    const rebuilt = advanceVillage(after, DAY + 2, null);
    const dwelling = rebuilt.dwellings.find((d) => d.id === WORKSHOP_ID)!;
    expect(dwelling.workshop?.craft).toBe('burner');
    expect(dwelling.type).toBe('zemnice');
  });
});

describe('dílny a pozemky polozemnic', () => {
  const land = makeLandscape();
  const empty = packObstacles([], 16, 15);
  const smithVillage = (): VillageState => {
    const s = withWorkshop(fullVillage(), 'smith', WORKSHOP_ID, { x: 7.5, z: 7.5, rotation: 0 });
    s.dwellings.find((d) => d.id === 1)!.position = { x: -60, z: -60, rotation: 0 };
    return s;
  };

  it('převod starších polozemnic na pozemky dílnu vynechá – stojí volně', () => {
    const migrated = withPlots(smithVillage(), land, empty);
    expect(migrated.plotsMigrated).toBe(true);
    expect(migrated.dwellings.find((d) => d.id === WORKSHOP_ID)?.plot).toBeUndefined();
  });

  it('přestavba dílny na polozemnici se nestěhuje na pozemek', () => {
    const s = smithVillage();
    s.dwellings.find((d) => d.id === WORKSHOP_ID)!.builtDay = DAY - Math.ceil(30 * YEAR);
    const after = advanceVillage(s, DAY + 1, empty, land);
    const rebuild = after.constructions.find(
      (c) => c.kind === 'rebuild' && c.dwellingId === WORKSHOP_ID,
    );
    expect(rebuild).toMatchObject({ dwellingType: 'polozemnice', position: null });
    expect(rebuild?.plot).toBeUndefined();
  });
});

describe('souhrn řemesel pro panel (crafts.md – Co hráč vidí)', () => {
  it('zásoby, potřeba, pokrytí a dílny s tím, co dělají', () => {
    const s = withWorkshop(fullVillage(), 'smith');
    s.crafts = { charcoalKg: 0, toolsKg: 9, potteryKg: 0 };
    const after = advanceVillage(s, DAY + 1, null);
    const { crafts } = summarizeVillage(after, DAY + 1);
    expect(crafts.needs).toEqual({ toolsKg: 18, potteryKg: 40 });
    expect(crafts.coverage.tools).toBeCloseTo(after.crafts!.toolsKg / 18, 9);
    expect(crafts.workshops).toEqual([
      {
        dwellingId: WORKSHOP_ID,
        craft: 'smith',
        activity: 'no-charcoal',
        occupants: 2,
        laborPerDay: expect.closeTo(0.9, 1),
        oreFactor: 1,
      },
    ]);
  });
});

describe('umístění dílny (crafts.md – Budovy)', () => {
  // políčko (8, 8) = x 0–15 m, z 0–15 m; zemnice na (19; 7,5) stojí v políčku (9, 8), milíř
  // (−9, +3 m) se středem (10; 10,5) celý v políčku (8, 8)
  const HOUSE = { x: 19, z: 7.5, rotation: 0 };
  const empty = packObstacles([], 16, 15);
  const water = makeLandscape({ surface: (x, y) => (x === 8 && y === 8 ? 'water' : 'meadow') });

  it('uhlíř potřebuje volné místo i pro milíř', () => {
    expect(checkDwellingPlacement(water, null, 'zemnice', HOUSE, empty).ok).toBe(true);
    expect(checkWorkshopPlacement(water, null, 'smith', HOUSE, empty).ok).toBe(true);
    const burner = checkWorkshopPlacement(water, null, 'burner', HOUSE, empty);
    expect(burner.ok).toBe(false);
    expect(burner.reason).toBe('Milíř nemůže stát ve vodě.');
  });

  it('jiné obydlí se nesmí překrývat s milířem hotové dílny', () => {
    const land = makeLandscape();
    const village = (craft?: Craft): PlacementVillage => ({
      dwellings: [{ type: 'zemnice', position: HOUSE, ...(craft ? { workshop: { craft } } : {}) }],
      constructions: [],
      parts: [],
    });
    const atMilir = { x: 10, z: 10.5, rotation: 0 };
    expect(checkDwellingPlacement(land, village(), 'zemnice', atMilir, empty).ok).toBe(true);
    expect(checkDwellingPlacement(land, village('burner'), 'zemnice', atMilir, empty).reason).toBe(
      'Překrývá se s jiným obydlím.',
    );
  });

  it('překážky kolem milíře osadníci odstraní a zaplatí', () => {
    const stone: ObstaclePlacement = {
      id: 7,
      kind: 'stone',
      look: 'stone-1',
      x: 10,
      z: 10.5,
      rotation: 0,
      scale: 1,
    };
    const layer = packObstacles([stone], 16, 15);
    const check = checkWorkshopPlacement(makeLandscape(), null, 'burner', HOUSE, layer);
    expect(check.ok).toBe(true);
    expect(check.obstacleIds).toEqual([7]);
    expect(check.obstacleCost).toBe(1);
  });
});
