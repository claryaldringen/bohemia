import { describe, expect, it } from 'vitest';
import { daylightFactor } from '../../core/daylight';
import { dayIndexOf } from '../../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../../landscape';
import { foundField, foundVillage, startWorkshop } from '../../core/actions';
import { PLAIN_SHAPE } from '../../buildings/dwelling-shape';
import { BUILD_COSTS } from '../../buildings/costs';
import {
  burnerPlans,
  craftCoverage,
  craftNeeds,
  craftStocks,
  craftTargets,
  restingCrafters,
  smithsCharcoalPerYear,
  smithsForgeCharcoalKg,
  newWorkshop,
  occupiedWorkshops,
  wearCraftStocks,
  workCrafts,
  forgeLabor,
  workshopFootprints,
  workshopLabor,
} from '../crafts';
import { DRAW_MAN_DAYS_PER_KG, kilnWalkFactor } from '../charcoal';
import { fetchWalkManDays } from '../charcoal-pole';
import { basketManDaysPerKg } from '../smith-supply';
import { appleKeepDays, applesSpoiled, daysUntilAppleRot } from '../../core/food';
import { barsReserveKg } from '../iron';
import {
  checkDwellingPlacement,
  checkWorkshopPlacement,
  type PlacementVillage,
} from '../../placement/placement';
import { NO_CRAFTS } from '../../core/productivity';
import {
  CHARCOAL_KILN,
  COMMON_LABOR_YEAR_DAYS,
  CRAFT_BASE,
  SMITH_SUPPLY,
  SOWERS,
  workshopBuildLabor,
  workshopCost,
  workshopTrees,
} from '../../rules';
import { withPlots } from '../../buildings/plots';
import { advanceVillage } from '../../core/simulate';
import { summarizeVillage } from '../../core/summary';
import type { Craft, Person, VillageState } from '../../types';
import { seasonCrops } from '../../core/year-plan';
import { makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling, withoutSmallGame } from '../../__tests__/village-fixtures';

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
  return withoutSmallGame(s);
}

/**
 * Dva dospělí 18 let navíc v prvním obydlí (mutuje stav) – vojvodova rodina pak cvičí mimo práci
 * vsi s dílnou i bez ní (lord.md – Zakládání vsi), srovnání vsí ukáže jen práci dílny.
 */
function withTwoMore(s: VillageState): VillageState {
  s.people.push(person(8, 18, 1, s.lastDay), person(9, 18, 1, s.lastDay));
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
  it('dílna stojí jako základní obydlí + 30 % práce i dřeva, uhlíř jako zemnice', () => {
    expect(workshopCost('potter')).toBe(286);
    expect(workshopTrees('potter')).toBe(23);
    expect(workshopCost('smith')).toBe(286);
    // milíř staví uhlíř u každé dávky buků (crafts.md – Milíř u skácených buků)
    expect(workshopCost('burner')).toBe(60);
    expect(workshopTrees('burner')).toBe(7);
    expect(BUILD_COSTS.smith).toEqual({
      laborManDays: 286,
      perHa: false,
      upfront: { wood: 23 },
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

  it('bez mladého páru dílna jde postavit – po dostavění stojí prázdná a nevyrábí', () => {
    const s = fullVillage();
    s.people = s.people.slice(0, 2);
    const next = startWorkshop(s, DAY, 'potter', WORKSHOP_SITE, 0);
    const site = next.constructions.at(-1)!;
    site.done = site.cost;
    site.wood!.felled = site.wood!.fell.length;
    const after = advanceVillage(next, DAY + 1, null);
    const workshop = after.dwellings.find((d) => d.workshop);
    expect(workshop?.workshop?.craft).toBe('potter');
    expect(after.people.filter((p) => p.dwellingId === workshop?.id)).toHaveLength(0);
    expect(occupiedWorkshops(after, 'potter')).toEqual([]);
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
  it('domácnost dílny dá řemeslu práci po denním minimu (domácí výroba jde bokem)', () => {
    const s = withWorkshop(fullVillage(), 'smith');
    const labor = workshopLabor(s, DAY + 1, WORKSHOP_ID, 0);
    expect(labor.capacity).toBe(2);
    expect(labor.dailyMin).toBeCloseTo(0.5, 9);
    expect(labor.craft).toBeCloseTo(1.5, 9);
    // s plným pokrytím nádobami je denní minimum menší
    expect(workshopLabor(s, DAY + 1, WORKSHOP_ID, 1).craft).toBeCloseTo(1.55, 9);
  });

  it('řemeslo dělá jen muž; žena kryje domácnost a zbytek dá vsi (Martin 22. 10. 2026)', () => {
    const s = withWorkshop(fullVillage(), 'smith');
    for (const p of s.people.filter((q) => q.dwellingId === WORKSHOP_ID)) {
      p.sex = p.id === 60 ? 'male' : 'female';
    }
    const labor = workshopLabor(s, DAY + 1, WORKSHOP_ID, 0);
    expect(labor.capacity).toBe(2);
    expect(labor.dailyMin).toBeCloseTo(0.5, 9);
    // kuje jen muž (1 čd), žena po denním minimu dá vsi 0,5 čd
    expect(labor.craft).toBeCloseTo(1, 9);
    expect(labor.light).toBeCloseTo(0.5, 9);
    // vdova s dítětem bez muže drží dílnu celá
    s.people = s.people.filter((p) => p.id !== 60);
    const widow = workshopLabor(s, DAY + 1, WORKSHOP_ID, 0);
    expect(widow.craft).toBeCloseTo(0.5, 9);
    expect(widow.light).toBe(0);
  });

  it('starší v domácnosti dílny kryje denní minimum – řemeslo dostane celou práci dospělých', () => {
    const s = withWorkshop(fullVillage(), 'smith');
    s.people.push({ id: 999, bornDay: DAY + 1 - Math.ceil(60 * 365.25), dwellingId: WORKSHOP_ID });
    const labor = workshopLabor(s, DAY + 1, WORKSHOP_ID, 0);
    // starší do práce dílny nepřidá, minimum (0,5) ale pokryje celé
    expect(labor.capacity).toBe(2);
    expect(labor.dailyMin).toBe(0);
    expect(labor.craft).toBeCloseTo(2, 9);
  });

  it('práce mužů domácnosti dílny nejde na pole; ženy po domácnosti dělají lehčí práce se vsí', () => {
    const withCraft = advanceVillage(
      withWorkshop(withTwoMore(fullVillage()), 'potter'),
      DAY + 1,
      null,
    );
    const empty = withWorkshop(withTwoMore(fullVillage()), 'potter');
    empty.people = empty.people.filter((p) => p.dwellingId !== WORKSHOP_ID);
    const without = advanceVillage(empty, DAY + 1, null);
    // zvířata a domácí výroba jdou bokem (population.md – Práce); řemeslo dělá muž, žena po
    // denním minimu dává zbytek práce (0,5 čd) jen na lehčí polní práce (`allocateDay.light`) –
    // do společné práce (stavby, opravy) nejde (crafts.md – Kdo dělá řemeslo)
    expect(withCraft.commonLaborHistory.at(-1)).toBeCloseTo(without.commonLaborHistory.at(-1)!, 2);
    // hrnčíř kácí strom na palivo bez polohy (ves bez vrstvy) – práce jde k dílně
    const fell = withCraft.labor!.shares.filter((s) => s.activity === 'fell');
    expect(fell).toEqual([
      { activity: 'fell', target: { kind: 'dwelling', id: WORKSHOP_ID }, manDays: 1 },
    ]);
    expect(without.dwellings.find((d) => d.id === WORKSHOP_ID)?.workshop?.activity).toBe('empty');
  });
});

describe('výroba (crafts.md – Výroba)', () => {
  it('kovář kove nástroje z hřiven do vybavení – 1,5 čd a 2,5 kg uhlí na kg, bez uhlí stojí', () => {
    // production-chains.md – Kovář: kování nástrojů je 15 % práce a 5 % uhlí dnešní ceny kování
    const s = withWorkshop(fullVillage(), 'smith');
    s.crafts = { charcoalKg: 1000, potteryKg: 0, ironBarsKg: 100 };
    craftDays(s, 1, null);
    // domácnost kováře dá dílně 1,5 čd → 1 kg nástrojů, zbytek práce na překování ani tavbu není
    // (houba ani ruda k ní chybí – ruda se kope až s tavbou)
    expect(s.toolEquipmentKg).toBeCloseTo(1, 9);
    expect(s.crafts.ironBarsKg).toBeCloseTo(100 - 1.2, 9);
    expect(s.crafts.charcoalKg).toBeCloseTo(1000 - 2.5, 9);
    const workshop = s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!;
    expect(workshop.activity).toBe('producing');
    s.crafts.charcoalKg = 2;
    craftDays(s, 1, null);
    expect(s.toolEquipmentKg).toBeCloseTo(1 + 0.8, 9);
    craftDays(s, 1, null);
    expect(s.toolEquipmentKg).toBeCloseTo(1.8, 9);
    expect(workshop.activity).toBe('no-charcoal');
  });

  it('přirážka za vodu daleko zmizela – kovář a hrnčíř kopou rudu a hlínu u potoka', () => {
    const s = withWorkshop(fullVillage(), 'smith');
    s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!.waterDistanceM = 300;
    s.crafts = { charcoalKg: 1000, potteryKg: 0 };
    craftDays(s, 1, null);
    // kovárna z doby před rudou dostane rudu na dávku – první den taví celý den (s měchařkou)
    expect(s.crafts.bloomKg).toBeCloseTo(1.5 / 3, 9);
  });

  it('hrnčíř vypálí 1 kg keramiky za člověkoden a na 500 kg skácí strom', () => {
    const s = withWorkshop(fullVillage(), 'potter');
    craftDays(s, 10, forest);
    const workshop = s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!;
    expect(craftStocks(s).potteryKg).toBeCloseTo(10 * 1.5 - 2, 6);
    expect(workshop.fuelKg).toBeCloseTo(500 - (10 * 1.5 - 2), 6);
  });

  it('bez dospělých stromů uhlíř i hrnčíř čekají na dřevo', () => {
    for (const craft of ['burner', 'potter'] as const) {
      const s = withWorkshop(fullVillage(), craft);
      // uhlíř pálí, jen když ves uhlí potřebuje – pro kováře (crafts.md – Uhlíř)
      if (craft === 'burner') withWorkshop(s, 'smith', 51, { x: 40, z: 30, rotation: 0 }, 70);
      craftDays(s, 3, noTrees);
      expect(s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!.activity).toBe('no-wood');
      expect(craftStocks(s)).toEqual({ charcoalKg: 0, potteryKg: 0 });
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
    s.crafts = { charcoalKg: 0, potteryKg: 60 };
    // nástroje jsou vybavení domácností (production-chains.md)
    s.toolEquipmentKg = 6;
    // 4 pracující potřebují 12 kg nástrojů, 6 lidí 30 kg nádob
    expect(craftCoverage(s, DAY)).toEqual({ tools: 0.5, pottery: 1 });
  });

  it('ves bez řemesel – i uložená před nimi – má pokrytí 0', () => {
    const s = fullVillage();
    delete s.crafts;
    expect(craftCoverage(s, DAY)).toEqual(NO_CRAFTS);
    expect(craftStocks(s)).toEqual({ charcoalKg: 0, potteryKg: 0 });
  });

  it('opotřebí se jen nástroje a nádoby v užívání (30 % a 40 % ročně)', () => {
    const s = fullVillage();
    s.crafts = { charcoalKg: 50, potteryKg: 30 };
    s.toolEquipmentKg = 24;
    for (let i = 1; i <= 365; i++) wearCraftStocks(s, DAY + i);
    // v užívání je nejvýš potřeba (12 kg nástrojů) – za rok se jich nahradí 30 %, druhá půlka
    // vybavení leží
    expect(s.toolEquipmentKg).toBeCloseTo(24 - 12 * 0.3, 9);
    // nádoby bez náhrady: 40 % / 365 denně z toho, co zbývá
    expect(s.crafts.potteryKg).toBeCloseTo(30 * (1 - 0.4 / 365) ** 365, 9);
    expect(s.crafts.charcoalKg).toBe(50);
  });

  it('nádoby posouvají denní minimum a ztráty zásob dne', () => {
    const base = fullVillage();
    const potted = fullVillage();
    potted.crafts = { charcoalKg: 0, potteryKg: 1000 };
    const a = advanceVillage(base, DAY + 1, null);
    const b = advanceVillage(potted, DAY + 1, null);
    // denní minimum jedné domácnosti 0,5 → 0,45 – venku podle délky dne (population.md – Skladba
    // dne podle ročního období)
    // (celá společná práce – roční průměr; posledních 30 dní je jen práce mužů na stavby a denní
    // minimum nesou napřed ženy – population.md – Práce, Stavby staví muži)
    expect((b.commonLaborYearly! - a.commonLaborYearly!) * COMMON_LABOR_YEAR_DAYS).toBeCloseTo(
      0.05 * daylightFactor(DAY + 1),
      9,
    );
    // ztráty zásob 10 → 5 % ročně
    const expected = 50_000 * (0.95 ** (1 / 365) - 0.9 ** (1 / 365));
    expect(b.storesKg - a.storesKg).toBeCloseTo(expected, 6);
  });

  it('nástroje zlevní polní práci hospodářského roku (kopání 100 → 50 čd/ha) i založení pole', () => {
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
      s.toolEquipmentKg = tools;
      const founded = s.constructions.at(-1)!;
      for (const p of s.parts) {
        p.foundingDone = p.foundingCost;
        p.state = 'ready';
      }
      founded.done = founded.cost;
      const after = advanceVillage(s, at(600, 9, 1), null);
      const crops = seasonCrops(after.season!);
      const dig = crops.reduce((sum, c) => sum + c.work.required.dig, 0);
      const sow = crops.reduce((sum, c) => sum + c.work.required.sow, 0);
      return dig / sow;
    };
    // kopání 100 → 50 čd/ha na setí motykou 1 / 0,3 čd/ha (rozsévač, fields.md – Práce; dřív 10)
    expect(plan(0)).toBeCloseTo(100 * SOWERS.hoeHaPerDay, 6);
    expect(plan(1000)).toBeCloseTo(50 * SOWERS.hoeHaPerDay, 6);
    const field = {
      parts: [
        { areaM2: 1000, distanceM: 50, naturalFertility: 70, surface: 'meadow', obstacleCost: 0 },
      ] as const,
    };
    const tooled = fullVillage();
    tooled.toolEquipmentKg = 1000;
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
      s.crafts = { charcoalKg: 0, potteryKg: pottery };
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
    expect(whole.toolEquipmentKg).toBeGreaterThan(0);
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
    // do 15. 11. – pak už může ves nakoupit u sousedů (crafts.md – Nákup u sousedů)
    const after = advanceVillage(s, DAY + 40, null);
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
    expect(rebuild!.cost).toBeCloseTo(workshopBuildLabor('burner') + 7 * 2, 9);
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
  it('dílna, do které se lidé nastěhovali dnes po práci dne, není prázdná – začne zítra', () => {
    // dostavěná dílna má z `newWorkshop` uloženo `empty`, lidé přijdou až po kroku práce
    const s = withWorkshop(fullVillage(), 'carpenter');
    expect(s.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!.activity).toBe('empty');
    expect(summarizeVillage(s, DAY).crafts.workshops[0]!.activity).toBe('settled');
    // bez lidí prázdná
    s.people = s.people.filter((p) => p.dwellingId !== WORKSHOP_ID);
    expect(summarizeVillage(s, DAY).crafts.workshops[0]!.activity).toBe('empty');
    // druhý den už dílna pracuje
    const next = withWorkshop(fullVillage(), 'carpenter');
    const after = advanceVillage(next, DAY + 1, null);
    expect(summarizeVillage(after, DAY + 1).crafts.workshops[0]!.activity).not.toBe('settled');
  });

  it('zásoby, potřeba, pokrytí a dílny s tím, co dělají', () => {
    const s = withWorkshop(fullVillage(), 'smith');
    s.crafts = { charcoalKg: 0, potteryKg: 0 };
    s.toolEquipmentKg = 9;
    const after = advanceVillage(s, DAY + 1, null);
    const { crafts } = summarizeVillage(after, DAY + 1);
    expect(crafts.needs).toEqual({ toolsKg: 18, potteryKg: 40, woodToolsKg: 24 });
    expect(crafts.equipmentKg).toBe(after.toolEquipmentKg);
    expect(crafts.coverage.tools).toBeCloseTo(after.toolEquipmentKg! / 18, 9);
    expect(crafts.workshops).toEqual([
      {
        dwellingId: WORKSHOP_ID,
        craft: 'smith',
        activity: 'no-charcoal',
        occupants: 2,
        // jen muž řemeslníka; žena se stará o domácnost a pomáhá se vsí
        laborPerDay: expect.closeTo(1, 1),
        // kovář bez uhlí odpočívá – rudu ještě nekopal (crafts.md – Uhlí a ruda kováře)
        // ves bez uhlíře – o uhlí od milíře se v panelu nemluví
        ore: { stockKg: 0, site: null, heapKg: 0, cart: false, burner: false },
        // řetěz kovárny (production-chains.md – Kovář): zásoba hřiven na rok obnovy 18 × 0,3 × 1,2
        iron: {
          bloomKg: 0,
          barsKg: 0,
          barsTargetKg: expect.closeTo(18 * 0.3 * 1.2, 9),
          equipmentKg: after.toolEquipmentKg,
          needKg: 18,
          // žena měch nešlape, syna kovář nemá – tavba sám
          bellows: null,
        },
        clay: null,
        kilns: [],
        toPlant: 0,
        // kovář z doby před učením řemesla je vyučený (crafts.md – Učení řemesla)
        skill: { share: 1, years: 5, apprentices: [] },
        carpenter: null,
      },
    ]);
    expect(crafts.carts).toEqual([]);
  });
});

describe('umístění dílny (crafts.md – Budovy)', () => {
  // políčko (8, 8) = x 0–15 m, z 0–15 m; zemnice na (19; 7,5) stojí v políčku (9, 8), kde stával
  // milíř u zemnice (−9, +3 m – střed 10; 10,5) je políčko (8, 8)
  const HOUSE = { x: 19, z: 7.5, rotation: 0 };
  const empty = packObstacles([], 16, 15);
  const water = makeLandscape({ surface: (x, y) => (x === 8 && y === 8 ? 'water' : 'meadow') });

  it('uhlíř je jen zemnice – milíř staví u dávky buků (crafts.md – Milíř u skácených buků)', () => {
    expect(checkDwellingPlacement(water, null, 'zemnice', HOUSE, empty).ok).toBe(true);
    expect(checkWorkshopPlacement(water, null, 'smith', HOUSE, empty).ok).toBe(true);
    expect(checkWorkshopPlacement(water, null, 'burner', HOUSE, empty).ok).toBe(true);
    expect(workshopFootprints('burner', HOUSE, PLAIN_SHAPE, 'zemnice')).toHaveLength(1);
  });

  it('jiné obydlí se nesmí překrývat s milířem – milíř je samostatná stavba', () => {
    const land = makeLandscape();
    const village = (kilns: { x: number; z: number }[]): PlacementVillage => ({
      dwellings: [{ type: 'zemnice', position: HOUSE, workshop: { craft: 'burner' } }],
      constructions: [],
      parts: [],
      kilns,
    });
    const atKiln = { x: 10, z: 10.5, rotation: 0 };
    expect(checkDwellingPlacement(land, village([]), 'zemnice', atKiln, empty).ok).toBe(true);
    expect(
      checkDwellingPlacement(land, village([{ x: 10, z: 10.5 }]), 'zemnice', atKiln, empty).reason,
    ).toBe('Stojí tu milíř.');
  });

  it('kámen, kde stával milíř u zemnice, osadníci uhlíře neodstraňují', () => {
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
    expect(check.obstacleIds).toEqual([]);
  });
});

describe('řemeslníci vyrábějí podle potřeby, volný čas pracují pro ves (crafts.md – Podle potřeby)', () => {
  it('zásoba do potřeby vsi a opotřebení za rok – nástroje × 1,3, keramika × 1,4', () => {
    const s = fullVillage();
    // 4 pracující a 6 lidí; dřevěné nářadí od tesaře 4 kg na pracujícího (wagons.md)
    expect(craftNeeds(s, DAY)).toEqual({ toolsKg: 12, potteryKg: 30, woodToolsKg: 16 });
    const targets = craftTargets(s, DAY);
    expect(targets.toolsKg).toBeCloseTo(12 * 1.3, 9);
    expect(targets.potteryKg).toBeCloseTo(30 * 1.4, 9);
    expect(targets.woodToolsKg).toBeCloseTo(16 * 1.3, 9);
  });

  it('kovář s plným vybavením a hřivnami nekuje a jeho domácnost pracuje se vsí', () => {
    const s = withWorkshop(fullVillage(), 'smith');
    // 6 pracujících (i kovářovi dva) → potřeba 18 kg, hřivny na rok obnovy 18 × 0,3 × 1,2 kg
    // (production-chains.md – Kovář)
    s.crafts = { charcoalKg: 1000, potteryKg: 0, ironBarsKg: 6.5 };
    s.toolEquipmentKg = 18;
    expect(restingCrafters(s, DAY + 1, NO_CRAFTS)).toEqual(new Map([[WORKSHOP_ID, 'resting']]));
    const resting = advanceVillage(s, DAY + 1, null);
    expect(resting.dwellings.find((d) => d.id === WORKSHOP_ID)?.workshop?.activity).toBe('resting');
    expect(resting.crafts!.charcoalKg).toBe(1000);
    // bez hřiven na rok obnovy taví (uhlí ubývá) a do práce vsi nepřispívá
    const short = withWorkshop(fullVillage(), 'smith');
    short.crafts = { charcoalKg: 1000, potteryKg: 0 };
    short.toolEquipmentKg = 18;
    expect(restingCrafters(short, DAY + 1, NO_CRAFTS).size).toBe(0);
    const working = advanceVillage(short, DAY + 1, null);
    expect(working.crafts!.charcoalKg).toBeLessThan(1000);
    // domácnost kováře (2 dospělí, po minimu a domácí výrobě 0,9 čd) přidá vsi práci
    expect(resting.commonLaborHistory.at(-1)! - working.commonLaborHistory.at(-1)!).toBeGreaterThan(
      0.8,
    );
  });

  it('kovář bez uhlí pomáhá vsi a dílna hlásí, že čeká na uhlí', () => {
    const s = withWorkshop(withTwoMore(fullVillage()), 'smith');
    s.crafts = { charcoalKg: 0, potteryKg: 0 };
    const after = advanceVillage(s, DAY + 1, null);
    expect(after.dwellings.find((d) => d.id === WORKSHOP_ID)?.workshop?.activity).toBe(
      'no-charcoal',
    );
    const empty = withWorkshop(withTwoMore(fullVillage()), 'smith');
    empty.people = empty.people.filter((p) => p.dwellingId !== WORKSHOP_ID);
    const without = advanceVillage(empty, DAY + 1, null);
    expect(after.commonLaborHistory.at(-1)!).toBeGreaterThan(without.commonLaborHistory.at(-1)!);
  });

  it('hrnčíř vypaluje jen do zásoby keramiky na rok', () => {
    const s = withWorkshop(fullVillage(), 'potter');
    // 8 lidí → potřeba 40 kg, zásoba do 56 kg
    s.crafts = { charcoalKg: 0, potteryKg: 56 };
    expect(restingCrafters(s, DAY + 1, NO_CRAFTS).get(WORKSHOP_ID)).toBe('resting');
    s.crafts.potteryKg = 50;
    expect(restingCrafters(s, DAY + 1, NO_CRAFTS).has(WORKSHOP_ID)).toBe(false);
  });

  it('uhlíř nosí uhlí z vypáleného milíře, jen když u kováře dochází (crafts.md – Rovnováha)', () => {
    const s = withWorkshop(fullVillage(), 'smith', 51, { x: 40, z: 30, rotation: 0 }, 70);
    withWorkshop(s, 'burner', 52, { x: 40, z: -30, rotation: 0 }, 80);
    s.dwellings.find((d) => d.id === 52)!.workshop!.kilns = [
      {
        id: 900,
        site: { x: 70, z: -30 },
        trees: Array.from({ length: 15 }, () => ({ id: null, cost: 2 })),
        stage: 'draw',
        prepared: 15,
        done: 0,
        charcoalKg: 1800,
      },
    ];
    // kovář pracuje (nástroje i hřivny chybí) – dnes spálí práci ÷ 10 čd × 50 kg uhlí celým
    // řetězem (production-chains.md – Kovář)
    s.crafts = { charcoalKg: 0, potteryKg: 0 };
    const forge = smithsForgeCharcoalKg(s, DAY + 1, NO_CRAFTS);
    const smithLabor = workshopLabor(s, DAY + 1, 51, 0).craft;
    expect(forge).toBeCloseTo((smithLabor / 10) * 50, 9);
    // u kováře uhlí nestačí – uhlíř dnes nosí, kovář na uhlí nečeká
    const short = restingCrafters(s, DAY + 1, NO_CRAFTS);
    expect(short.has(52)).toBe(false);
    expect(short.has(51)).toBe(false);
    // u kováře zásoba na cestu a rezervu – vypálený milíř čeká, uhlíř pomáhá vsi
    s.crafts.charcoalKg = forge * 100;
    expect(restingCrafters(s, DAY + 1, NO_CRAFTS).get(52)).toBe('resting');
    // roční spotřeba podle potřeby – s plným vybavením a hřivnami jen na opotřebení nástrojů
    // (8 pracujících → potřeba 24 kg nástrojů, opotřebení 7,2 kg ročně → 360 kg uhlí)
    s.toolEquipmentKg = 24;
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 24 * 0.3 * 1.2 };
    expect(smithsCharcoalPerYear(s, DAY + 1, NO_CRAFTS)).toBeCloseTo(24 * 0.3 * 50, 6);
    // plné vybavení a hřivny – kovář nekove
    expect(smithsForgeCharcoalKg(s, DAY + 1, NO_CRAFTS)).toBe(0);
    const full = restingCrafters(s, DAY + 1, NO_CRAFTS);
    expect(full.get(51)).toBe('resting');
    // kovář si i tak drží zásobu na opotřebení nástrojů (crafts.md – Rovnováha uhlíř – kovář) –
    // prázdná kovárna dostane dávku, s rezervou uhlíř pomáhá vsi
    expect(full.has(52)).toBe(false);
    s.crafts.charcoalKg = 200;
    expect(restingCrafters(s, DAY + 1, NO_CRAFTS).get(52)).toBe('resting');
  });

  it('výsledek nezávisí na kouscích dopočítání', () => {
    const make = (): VillageState => {
      const s = withWorkshop(fullVillage(), 'smith', 51, { x: 40, z: 30, rotation: 0 }, 70);
      withWorkshop(s, 'potter', 52, { x: 40, z: -30, rotation: 0 }, 80);
      withWorkshop(s, 'burner', 53, { x: 40, z: 0, rotation: 0 }, 90);
      return s;
    };
    const end = DAY + 3 * 365;
    const whole = advanceVillage(make(), end, forest);
    let chunked = make();
    for (const to of [DAY + 50, DAY + 51, DAY + 400, DAY + 777, end]) {
      chunked = advanceVillage(chunked, to, forest);
    }
    expect(chunked).toEqual(whole);
    // zásoby drží potřebu – nerostou do nekonečna: vybavení nejvýš potřeba, hřivny kolem zásoby
    // na rok obnovy (production-chains.md – Kovář)
    const targets = craftTargets(whole, end);
    const need = craftNeeds(whole, end).toolsKg;
    expect(whole.toolEquipmentKg).toBeLessThanOrEqual(need + 1e-9);
    expect(whole.toolEquipmentKg).toBeGreaterThan(0);
    expect(whole.crafts!.ironBarsKg ?? 0).toBeLessThan(barsReserveKg(whole, end) * 1.2 + 1);
    expect(whole.crafts!.potteryKg).toBeLessThan(targets.potteryKg * 1.2);
  });
});

describe('plán uhlíře s odnosem na tyči (workshops.md – Uhlíř – odnos uhlí na tyči)', () => {
  const BURNER = WORKSHOP_ID;
  const SMITH = 51;
  /** Uhlíř (id 60) s vypáleným milířem 300 m chůze od kovárny, dávka pro kováře na celý milíř. */
  function burnerVillage(burnerSons: number[], smithSons: number[] = []): VillageState {
    const s = withWorkshop(fullVillage(), 'burner');
    withWorkshop(s, 'smith', SMITH, { x: 40, z: 40, rotation: 0 }, 70);
    const sonsOf = (head: number, dwellingId: number, ages: number[]): Person[] =>
      ages.map((age, k) => ({
        ...person(head + 10 + k, age, dwellingId, s.lastDay),
        bornDay: s.lastDay - Math.ceil(age * YEAR) - 10,
        sex: 'male',
        fatherId: head,
      }));
    // uhlíř a kovář jsou muži, jinak by hlavou dílny byl dospělý syn (`smithHead`)
    for (const p of s.people) if (p.id === 60 || p.id === 70) p.sex = 'male';
    s.people.push(...sonsOf(60, BURNER, burnerSons), ...sonsOf(70, SMITH, smithSons));
    const workshop = s.dwellings.find((d) => d.id === BURNER)!.workshop!;
    workshop.kilns = [
      {
        id: 990,
        site: { x: 70, z: 0 },
        trees: Array.from({ length: CHARCOAL_KILN.trees }, () => ({ id: null, cost: 2 })),
        stage: 'draw',
        prepared: CHARCOAL_KILN.trees,
        done: 0,
        charcoalKg: CHARCOAL_KILN.trees * 120,
        carry: { smithId: SMITH, walkM: 300 },
      },
    ];
    workshop.charcoalOrderKg = CHARCOAL_KILN.trees * 120;
    s.crafts = { charcoalKg: 0, potteryKg: 0 };
    return s;
  }

  /** Kolik uhlí uhlíř dnes vytahá: práce dílny bez cesty pro kováře ÷ (vytahání + díl nošení). */
  function expectedKg(s: VillageState, share: number, fetch: boolean): number {
    const day = s.lastDay + 1;
    const work = workshopLabor(s, day, BURNER, NO_CRAFTS.pottery, 1);
    // dílna bez praxe – výkon 1, práce je čd
    expect(work.skill).toBe(1);
    const labor = forgeLabor(work);
    expect(labor).toBeGreaterThan(0.5);
    const burner = s.dwellings.find((d) => d.id === BURNER)!;
    const kiln = burner.workshop!.kilns![0]!;
    const walk = fetch ? fetchWalkManDays(300) : 0;
    return (
      (labor - walk) /
      (DRAW_MAN_DAYS_PER_KG * kilnWalkFactor(kiln, burner.position) +
        basketManDaysPerKg(300, SMITH_SUPPLY.basketKg.charcoal) * share)
    );
  }

  const drawn = (s: VillageState): number =>
    burnerPlans(s, s.lastDay + 1, NO_CRAFTS, 1)
      .get(BURNER)!
      .draws.reduce((sum, d) => sum + d.kg, 0);

  it('se synem 12–13 polovina nošení, se synem od 14 let celé – bez cesty pro kováře', () => {
    const young = burnerVillage([13]);
    expect(drawn(young)).toBeCloseTo(expectedKg(young, 0.5, false), 9);
    const grown = burnerVillage([15]);
    expect(drawn(grown)).toBeCloseTo(expectedKg(grown, 1, false), 9);
  });

  it('s kovářem nebo jeho synem polovina nošení a cesta pro kováře', () => {
    const smith = burnerVillage([]);
    expect(drawn(smith)).toBeCloseTo(expectedKg(smith, 0.5, true), 9);
    const smithSon = burnerVillage([], [12]);
    expect(drawn(smithSon)).toBeCloseTo(expectedKg(smithSon, 0.5, true), 9);
    // syn uhlíře 11 tyč neunese – jde kovář
    const small = burnerVillage([11]);
    expect(drawn(small)).toBeCloseTo(expectedKg(small, 0.5, true), 9);
  });

  it('bez druhého u tyče uhlíř nevytahá – dávka počká', () => {
    const s = burnerVillage([]);
    s.people.find((p) => p.id === 70)!.away = { kind: 'campaign' };
    expect(drawn(s)).toBe(0);
    expect(burnerPlans(s, s.lastDay + 1, NO_CRAFTS, 1).get(BURNER)!.orderKg).toBeGreaterThan(0);
  });

  it('jediný syn kováře nese jen s jedním uhlířem – druhý bez nosiče nevytahá', () => {
    // druhý uhlíř (obydlí 52, lidé 90 a 91) se stejně plným milířem; kovář je pryč
    const s = burnerVillage([], [12]);
    const OTHER = 52;
    withWorkshop(s, 'burner', OTHER, { x: -40, z: 40, rotation: 0 }, 90);
    s.people.find((p) => p.id === 90)!.sex = 'male';
    const first = s.dwellings.find((d) => d.id === BURNER)!.workshop!;
    const other = s.dwellings.find((d) => d.id === OTHER)!.workshop!;
    other.kilns = [{ ...first.kilns![0]!, id: 991 }];
    other.charcoalOrderKg = first.charcoalOrderKg;
    s.people.find((p) => p.id === 70)!.away = { kind: 'campaign' };
    const plans = burnerPlans(s, s.lastDay + 1, NO_CRAFTS, 1);
    expect(plans.get(BURNER)!.draws).toHaveLength(1);
    expect(plans.get(OTHER)!.draws).toEqual([]);
    // kovář doma – s druhým uhlířem nese on
    delete s.people.find((p) => p.id === 70)!.away;
    expect(burnerPlans(s, s.lastDay + 1, NO_CRAFTS, 1).get(OTHER)!.draws).toHaveLength(1);
  });
});
