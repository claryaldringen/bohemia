import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../actions';
import { DAIRY, daysUntilMilking } from '../../livestock/dairy';
import { legumeEnergy } from '../../fields/legumes';
import {
  DAILY_CHEESE_KEEP,
  DAILY_MEAT_KEEP,
  DIET,
  PROTEIN,
  daysUntilMeatEnd,
  daysUntilSlaughter,
  dietOf,
  dietQuality,
  eatDiet,
  fruitEnergy,
  grainAheadForOutlookKg,
  honeyEnergy,
  legumeKeepPerDay,
  meatEnergy,
  spoilMeat,
  villageHoneyRationKg,
  type DietInput,
  type Eaten,
} from '../diet';
import { happinessFactors } from '../../people/happiness';
import { HIVES, HONEY } from '../../rules/rules-wares';
import { NO_CRAFTS, storageLossPerYear } from '../productivity';
import { advanceVillage } from '../simulate';
import type { VillageState } from '../../types';
import { withBuiltFirstDwelling, withoutSmallGame } from '../../__tests__/village-fixtures';

// Strava (diet.md): energie × kvalita z bílkovin a ovoce, pořadí jídla bez stropů (Strava po
// vrstvách a porážka celý rok – Martin 18. 11. 2026), mléko a sýr, med, hlad jen z energie.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
/** Potřeba energie 10 kg obilí za den – podíly v kg jsou pak desetiny. */
const NEED = 10;
/** Potřeba bílkovin k NEED – dospělí (180 kg obilí ročně, 60 kg × 1,6 g na den). */
const PROTEIN_NEED = (NEED / (180 / 365)) * ((PROTEIN.bodyKg.adult * PROTEIN.gPerKgBody) / 1000);

function input(over: Partial<DietInput>): DietInput {
  return {
    grainKg: 1e6,
    meatKg: 0,
    fruitKg: 0,
    needPerDay: NEED,
    proteinNeedPerDay: PROTEIN_NEED,
    daysToHarvest: 100,
    daysToRot: 0,
    daysToMeatEnd: 100,
    potteryCoverage: NO_CRAFTS.pottery,
    ...over,
  };
}

const NONE: Eaten = {
  grainKg: 0,
  meatKg: 0,
  fruitKg: 0,
  milkL: 0,
  milkProteinKg: 0,
  milkEnergy: 0,
  cheeseKg: 0,
  eggsKg: 0,
  legumesKg: 0,
  honeyKg: 0,
};

describe('nasycení = energie × kvalita z bílkovin a ovoce (diet.md)', () => {
  it('samo obilí ≈ 80 % (bílkoviny z obilí jen ≈ polovina potřeby), s bílkovinami 94 %, s ovocem 100 %', () => {
    const grainOnly = dietOf(NEED, PROTEIN_NEED, { ...NONE, grainKg: NEED });
    expect(grainOnly.energy).toBeCloseTo(1, 9);
    expect(grainOnly.protein).toBeGreaterThan(0.45);
    expect(grainOnly.protein).toBeLessThan(0.65);
    expect(grainOnly.satiation).toBeGreaterThan(0.76);
    expect(grainOnly.satiation).toBeLessThan(0.84);
    const meatKg = 9.5; // bílkoviny z obilí ≈ polovina – zbytek z masa ≈ 57 % energie
    const withMeat = dietOf(NEED, PROTEIN_NEED, {
      ...NONE,
      grainKg: NEED - meatEnergy(meatKg),
      meatKg,
    });
    expect(withMeat.protein).toBe(1);
    expect(withMeat.satiation).toBeCloseTo(DIET.quality.base + DIET.quality.protein, 9);
    const fruitKg = (DIET.fruitShare * NEED) / fruitEnergy(1);
    const all = dietOf(NEED, PROTEIN_NEED, {
      ...NONE,
      grainKg: NEED - meatEnergy(meatKg) - fruitEnergy(fruitKg),
      meatKg,
      fruitKg,
    });
    expect(all.satiation).toBeCloseTo(1, 9);
  });

  it('kvalita 0,60 + 0,34 × pokrytí bílkovin + 0,06 × pokrytí ovoce, nejvýš 1', () => {
    expect(dietQuality(0, 0)).toBeCloseTo(0.6, 9);
    expect(dietQuality(0.5, 0)).toBeCloseTo(0.77, 9);
    expect(dietQuality(1, 1)).toBeCloseTo(1, 9);
    expect(dietQuality(3, 3)).toBeCloseTo(1, 9);
  });

  it('bílkoviny ze všech zdrojů – obilí, maso, sýr, mléko, vejce', () => {
    const d = dietOf(NEED, 1, {
      grainKg: 1,
      meatKg: 1,
      fruitKg: 0,
      milkL: 2,
      milkProteinKg: 0.07,
      milkEnergy: 0.4,
      cheeseKg: 1,
      eggsKg: 1,
      legumesKg: 0,
      honeyKg: 0,
    });
    const protein =
      PROTEIN.perKg.grain + PROTEIN.perKg.meat + PROTEIN.perKg.cheese + PROTEIN.perKg.eggs + 0.07;
    expect(d.protein).toBeCloseTo(Math.min(1, protein), 9);
    expect(d.shares.dairy).toBeCloseTo((0.4 + DAIRY.cheeseEnergy) / NEED, 9);
  });
});

/** Kravské mléko dne (l) jako vstup jídla – litry, bílkoviny a energie. */
function cowMilk(milkL: number): Partial<DietInput> {
  return {
    milkL,
    milkProteinKg: milkL * DAIRY.proteinPerL.cow,
    milkEnergy: milkL * DAIRY.energyPerL.cow,
  };
}

describe('eatDiet – pořadí jídla bez stropů (diet.md – Strava po vrstvách; Martin 18. 11. 2026)', () => {
  it('bez stropů – samo maso nasytí energií', () => {
    // maso do sklizně ≈ 1 200 kg obilí na potřebu 1 000 – dřív jen strop 40 %
    const meal = eatDiet(
      input({ meatKg: 2000, grainKg: 0, daysToHarvest: 100, daysToMeatEnd: 200 }),
    );
    expect(meal.eaten.meatKg).toBeCloseTo(NEED / DIET.meatEnergy, 9);
    expect(meal.diet.energy).toBeCloseTo(1, 9);
    expect(meal.outlook).toBe(1);
    expect(meal.meatKg).toBeCloseTo(2000 * DAILY_MEAT_KEEP - NEED / DIET.meatEnergy, 9);
  });

  it('uzené se jí před obilím', () => {
    const meal = eatDiet(input({ meatKg: 6, grainKg: 5000, daysToHarvest: 100 }));
    expect(meal.eaten.meatKg).toBeCloseTo(6 * DAILY_MEAT_KEEP, 9);
    expect(meal.eaten.grainKg).toBeCloseTo(NEED - meatEnergy(6 * DAILY_MEAT_KEEP), 9);
    expect(meal.meatKg).toBe(0);
    expect(meal.diet.energy).toBeCloseTo(1, 9);
  });

  it('ovoce před luštěninami a obilím, bez stropu 25 %', () => {
    // ovoce na 60 % potřeby, luštěniny na víc než zbytek
    const fruitKg = (0.6 * NEED) / fruitEnergy(1);
    const meal = eatDiet(input({ fruitKg, legumesKg: 100, daysToRot: 50 }));
    expect(fruitEnergy(meal.eaten.fruitKg)).toBeCloseTo(0.6 * NEED, 9);
    expect(fruitEnergy(meal.eaten.fruitKg)).toBeGreaterThan(0.25 * NEED);
    expect(meal.fruitKg).toBe(0);
    // luštěniny dorovnají zbytek potřeby, obilí se dnes nejí
    expect(legumeEnergy(meal.eaten.legumesKg)).toBeCloseTo(0.4 * NEED, 9);
    expect(meal.eaten.grainKg).toBe(0);
    // samo ovoce nasytí energií, ne kvalitou – samo obilí ani samo ovoce nikdy úplně nenasytí
    const fruitOnly = eatDiet(input({ grainKg: 0, fruitKg: 1e6, daysToRot: 50 }));
    expect(fruitOnly.diet.energy).toBeCloseTo(1, 9);
    expect(fruitOnly.diet.satiation).toBeCloseTo(dietQuality(0, 1), 9);
    expect(fruitOnly.outlook).toBeLessThan(1);
  });

  it('napřed, co se kazí: mléko, vejce, čerstvé maso, uzené, sýr – pak ovoce, luštěniny, obilí', () => {
    // energie dne po zdrojích (kg obilí) – dohromady víc než potřeba 10
    const milkL = 3 / DAIRY.energyPerL.cow;
    const meal = eatDiet(
      input({
        ...cowMilk(milkL),
        eggsKg: 2 / DIET.energy.eggs,
        freshMeatKg: 2 / DIET.meatEnergy,
        meatKg: 2 / DIET.meatEnergy / DAILY_MEAT_KEEP,
        cheeseKg: 2 / DAIRY.cheeseEnergy / DAILY_CHEESE_KEEP,
        fruitKg: 2 / fruitEnergy(1),
        daysToRot: 50,
        legumesKg: 2 / legumeEnergy(1) / legumeKeepPerDay(NO_CRAFTS.pottery),
      }),
    );
    const e = meal.eaten;
    expect(e.milkL).toBeCloseTo(milkL, 9);
    expect(e.eggsKg * DIET.energy.eggs).toBeCloseTo(2, 9);
    expect(meatEnergy(e.freshMeatKg ?? 0)).toBeCloseTo(2, 9);
    // maso celkem = čerstvé i uzené
    expect(meatEnergy(e.meatKg)).toBeCloseTo(4, 9);
    expect(e.cheeseKg * DAIRY.cheeseEnergy).toBeCloseTo(1, 9);
    expect(e.fruitKg).toBe(0);
    expect(e.legumesKg).toBe(0);
    expect(e.grainKg).toBe(0);
    expect(meal.diet.energy).toBeCloseTo(1, 9);
    // zbytek sýra, ovoce i luštěnin počká, maso se snědlo celé
    expect(meal.meatKg).toBe(0);
    expect(meal.cheeseKg * DAIRY.cheeseEnergy).toBeCloseTo(1, 9);
    expect(fruitEnergy(meal.fruitKg)).toBeCloseTo(2, 9);
  });

  it('mléko celé, sýr jen z přebytku', () => {
    // mléko pod potřebou se vypije celé – dřív strop 30 %
    const littleL = (0.8 * NEED) / DAIRY.energyPerL.cow;
    const little = eatDiet(input(cowMilk(littleL)));
    expect(little.eaten.milkL).toBeCloseTo(littleL, 9);
    expect(little.diet.shares.dairy).toBeCloseTo(0.8, 9);
    expect(little.cheeseMadeKg).toBe(0);
    expect(little.cheeseKg).toBe(0);
    // mléko přidá bílkoviny k obilí
    expect(little.diet.protein).toBeGreaterThan(eatDiet(input({})).diet.protein + 0.1);
    // mléko nad potřebu – vypije se do potřeby, z přebytku je sýr
    const milkL = 1000;
    const plenty = eatDiet(input(cowMilk(milkL)));
    const drunk = NEED / DAIRY.energyPerL.cow;
    expect(plenty.eaten.milkL).toBeCloseTo(drunk, 9);
    expect(plenty.diet.shares.dairy).toBeCloseTo(1, 9);
    expect(plenty.eaten.grainKg).toBe(0);
    // kravské mléko: z 10 l kilogram sýra (75 % bílkovin mléka, sýr 25 %)
    expect(plenty.cheeseMadeKg).toBeCloseTo(
      ((milkL - drunk) * DAIRY.proteinPerL.cow * DAIRY.cheeseProteinKept) / DAIRY.cheeseProtein,
      9,
    );
    expect((milkL - drunk) / plenty.cheeseMadeKg).toBeCloseTo(10.1, 1);
    expect(plenty.cheeseKg).toBeCloseTo(plenty.cheeseMadeKg, 9);
  });

  it('sýr se jí hned, do potřeby – zbytek dál ztrácí sušením', () => {
    const cheeseKg = 100;
    const meal = eatDiet(input({ cheeseKg }));
    const kept = cheeseKg * DAILY_CHEESE_KEEP;
    expect(meal.eaten.cheeseKg).toBeCloseTo(NEED / DAIRY.cheeseEnergy, 9);
    expect(meal.diet.shares.dairy).toBeCloseTo(1, 9);
    expect(meal.cheeseKg).toBeCloseTo(kept - NEED / DAIRY.cheeseEnergy, 9);
    expect(daysUntilMilking(at(601, 4, 30))).toBe(1);
    expect(daysUntilMilking(at(601, 5, 1))).toBe(365);
  });

  it('obilí nevystačí do sklizně: příděl ze všeho jídla do sklizně (s masem, které ještě přijde)', () => {
    const meatKg = (0.2 * NEED * 100) / DIET.meatEnergy;
    const grainKg = 0.4 * NEED * 100; // s masem 60 % energie do sklizně
    const meal = eatDiet(input({ grainKg, meatKg, potteryCoverage: 1 }));
    expect(meal.diet.energy).toBeCloseTo(0.6, 2);
    expect(meal.outlook).toBeCloseTo(meal.diet.energy, 2);
    // dnešní příděl se sní napřed z masa, obilí počká
    expect(meatEnergy(meal.eaten.meatKg)).toBeCloseTo(meal.diet.energy * NEED, 9);
    expect(meal.eaten.grainKg).toBe(0);
  });

  it('přebytek masa se sní nad příděl – maso se do 1. 9. celé sní (Vlkov 895)', () => {
    // maso ≈ 600 kg obilí na potřebu 2 400 do sklizně – výhled 25 %, ale maso se do zkažení
    // (150 dní) sní tempem proti zkažení, ne přídělem
    const vlkov = (meatKg: number, day: number): DietInput =>
      input({
        needPerDay: 8,
        meatKg,
        daysToMeatEnd: 150 - day,
        grainKg: 0,
        daysToHarvest: 300 - day,
      });
    const meal = eatDiet(vlkov(1000, 0));
    expect(meal.outlook).toBeCloseTo(0.25, 3);
    expect(meal.eaten.meatKg).toBeCloseTo((1000 * DAILY_MEAT_KEEP) / 150, 9);
    expect(meal.diet.energy).toBeCloseTo(meatEnergy(1000 * DAILY_MEAT_KEEP) / 150 / 8, 3);
    expect(meal.diet.energy).toBeGreaterThan(meal.outlook + 0.2);
    // do konce masa se sní všechno – nic se nezkazí
    let meatKg = 1000;
    for (let day = 0; day < 150; day++) meatKg = eatDiet(vlkov(meatKg, day)).meatKg;
    expect(meatKg).toBeCloseTo(0, 9);
  });

  it('v hladu se jí aspoň tempem proti zkažení – vejce celá, čerstvé maso do konce masa, zbytek se udí', () => {
    // výhled 6 % – dnes víc: vejce celá, maso rovným dílem do konce masa (návrh Clauda)
    const meal = eatDiet(
      input({ grainKg: 0, eggsKg: 1, freshMeatKg: 30, daysToHarvest: 100, daysToMeatEnd: 50 }),
    );
    expect(meal.eaten.eggsKg).toBeCloseTo(1, 9);
    expect(meal.eaten.freshMeatKg).toBeCloseTo(30 / 50, 9);
    expect(meal.meatKg).toBeCloseTo(30 - 30 / 50, 9);
    expect(meal.diet.energy).toBeCloseTo((DIET.energy.eggs + meatEnergy(30 / 50)) / NEED, 9);
  });

  it('bez lidí nikdo nejí – plné nasycení, zásoby jen ztrácejí', () => {
    const meal = eatDiet(input({ needPerDay: 0, meatKg: 100 }));
    expect(meal.diet.satiation).toBe(1);
    expect(meal.meatKg).toBeLessThan(100);
  });

  it('maso se uzením ztrácí 20 % ročně', () => {
    let meat = 100;
    for (let i = 0; i < 365; i++) meat = eatDiet(input({ needPerDay: 0, meatKg: meat })).meatKg;
    expect(meat).toBeCloseTo(80, 6);
  });

  it('dní do porážky (1. 11.) bez jejího dne', () => {
    expect(daysUntilSlaughter(at(601, 10, 31))).toBe(1);
    expect(daysUntilSlaughter(at(601, 11, 1))).toBe(365);
    expect(daysUntilSlaughter(at(603, 11, 1))).toBe(366); // únor 604 je přestupný
    expect(daysUntilSlaughter(at(601, 1, 1))).toBe(at(601, 11, 1) - at(601, 1, 1));
    // poslední podzim světa – příští porážka by byla v roce 1500
    expect(daysUntilSlaughter(at(1499, 12, 31))).toBeGreaterThan(300);
  });

  it('maso se jí do zkažení (31. 8.), maso ze září a října do porážky (diet.md – Trvanlivost masa)', () => {
    expect(daysUntilMeatEnd(at(601, 8, 31))).toBe(1);
    expect(daysUntilMeatEnd(at(601, 11, 1))).toBe(at(602, 9, 1) - at(601, 11, 1));
    expect(daysUntilMeatEnd(at(602, 1, 1))).toBe(at(602, 9, 1) - at(602, 1, 1));
    expect(daysUntilMeatEnd(at(601, 9, 1))).toBe(at(601, 11, 1) - at(601, 9, 1));
    expect(daysUntilMeatEnd(at(601, 10, 31))).toBe(1);
  });

  it('1. 9. ráno se zbytek masa zkazí – do kroniky od kila', () => {
    const s = { meatKg: 120.4 } as VillageState;
    expect(spoilMeat(s, at(601, 8, 31))).toBeNull();
    expect(s.meatKg).toBe(120.4);
    expect(spoilMeat(s, at(601, 9, 1))).toEqual({
      day: at(601, 9, 1),
      kind: 'meat-spoiled',
      kg: 120,
    });
    expect(s.meatKg).toBe(0);
    const crumbs = { meatKg: 0.4 } as VillageState;
    expect(spoilMeat(crumbs, at(601, 9, 1))).toBeNull();
    expect(crumbs.meatKg).toBe(0);
  });

  it('výhled do sklizně počítá maso jen do jeho zkažení – nejvýš plnou potřebu za ty dny', () => {
    // maso by stačilo na 360 dní, do zkažení se ho ale sní nejvýš 30 dní plné potřeby
    const meal = eatDiet(
      input({ grainKg: 200, meatKg: 6000, daysToHarvest: 60, daysToMeatEnd: 30 }),
    );
    // obilí po ztrátách skladováním do dne, kdy se sní (rovným dílem do sklizně)
    const grain = 200 * KEEP * eatenShare(KEEP, 0, 60);
    expect(meal.outlook).toBeCloseTo((grain + NEED * 30) / (NEED * 60), 9);
    // do zkažení dost – maso samo vydrží do sklizně
    expect(eatDiet(input({ grainKg: 0, meatKg: 6000, daysToHarvest: 60 })).outlook).toBe(1);
  });
});

/** Denní podíl obilí, který zbude po ztrátě skladováním bez nádob (`grainKeepPerDay`). */
const KEEP = (1 - storageLossPerYear(NO_CRAFTS.pottery)) ** (1 / 365);

/** Podíl obilí, který se sní rovným dílem `count` dní od dne `from` – zbytek ztrácí `keep` za den. */
function eatenShare(keep: number, from: number, count: number): number {
  let stored = 0;
  for (let j = from; j < from + count; j++) stored += keep ** -j;
  return count / stored;
}

describe('výhled zná ztráty obilí skladováním do žní (fields.md – Přídělový systém; Martin 15. 11. 2026)', () => {
  const DAYS = 300;
  /** Ves se stálou potřebou a bez příjmu jídla jí den po dni do žní – výhledy dní a zbylé obilí. */
  function untilHarvest(
    over: Partial<DietInput>,
    rotDays = 0,
  ): { outlooks: number[]; energy: number[]; leftKg: number; honeyLeftKg: number } {
    let grainKg = over.grainKg ?? 0;
    let fruitKg = over.fruitKg ?? 0;
    let honeyKg = over.honeyKg ?? 0;
    const outlooks: number[] = [];
    const energy: number[] = [];
    for (let day = 0; day < DAYS; day++) {
      const meal = eatDiet(
        input({
          ...over,
          grainKg,
          fruitKg,
          honeyKg,
          daysToHarvest: DAYS - day,
          daysToRot: Math.max(0, rotDays - day),
        }),
      );
      outlooks.push(meal.outlook);
      energy.push(meal.diet.energy);
      grainKg = meal.grainKg;
      fruitKg = meal.fruitKg;
      honeyKg = meal.honeyKg;
    }
    return { outlooks, energy, leftKg: grainKg, honeyLeftKg: honeyKg };
  }
  const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);

  it('jen obilí: příděl je od začátku do žní rovný a zásoba vyjde právě na den žní', () => {
    const grainKg = 0.5 * NEED * DAYS;
    const run = untilHarvest({ grainKg });
    // bez nádob ztrácí obilí nejvíc (STORAGE_LOSS_PER_YEAR) – dřív příděl klesal rychlostí ztrát
    expect(spread(run.outlooks)).toBeLessThan(1e-9);
    expect(spread(run.energy)).toBeLessThan(1e-9);
    expect(run.outlooks[0]).toBeCloseTo(0.5 * KEEP * eatenShare(KEEP, 0, DAYS), 9);
    expect(run.outlooks[0]).toBeLessThan(0.5 * KEEP);
    expect(run.leftKg).toBeCloseTo(0, 6);
    // obrácený výhled zná tytéž ztráty – na tentýž příděl chce právě tuto zásobu (po dnešní ztrátě)
    const ahead = grainAheadForOutlookKg(input({ grainKg: 0, daysToHarvest: DAYS }), 0.4);
    const atAhead = untilHarvest({ grainKg: ahead / KEEP });
    expect(spread(atAhead.outlooks)).toBeLessThan(1e-9);
    expect(atAhead.outlooks[0]).toBeCloseTo(0.4, 9);
  });

  it('s ovocem napřed: ovoce se do zkažení sní celé, obilí počká a vyjde právě do žní', () => {
    // ovoce na 50 % potřeby po 100 dní do zkažení, cíl 20 % – do zkažení se jí jen ovoce, tempem
    // proti zkažení (výhled 20 % je průměr do žní)
    const fruitKg = (0.5 * NEED * 100) / fruitEnergy(1);
    const ahead = grainAheadForOutlookKg(
      input({ grainKg: 0, fruitKg, daysToHarvest: DAYS, daysToRot: 100 }),
      0.2,
    );
    const run = untilHarvest({ grainKg: ahead / KEEP, fruitKg }, 100);
    expect(run.outlooks[0]).toBeCloseTo(0.2, 9);
    expect(spread(run.energy.slice(0, 100))).toBeLessThan(1e-9);
    expect(run.energy[0]).toBeCloseTo(0.5, 9);
    // ovoce se celé snědlo – do zkažení nic nezbylo
    const fruitEaten = run.energy.slice(0, 100).reduce((sum, e) => sum + e * NEED, 0);
    expect(fruitEaten).toBeCloseTo(fruitEnergy(fruitKg), 6);
    // pak obilí rovným dílem až do žní – zásoba vyjde právě na den žní
    expect(spread(run.energy.slice(100))).toBeLessThan(1e-9);
    expect(run.energy[DAYS - 1]).toBeGreaterThan(0);
    expect(run.leftKg).toBeCloseTo(0, 6);
  });

  it('výhled a obrácený výhled souhlasí – v hladu, na hraně i s hojností jídla mimo obilí', () => {
    const cases: Partial<DietInput>[] = [
      // hlad – skoro jen obilí a trochu medu
      { honeyKg: 20, honeyRationKg: 0.01 },
      // na hraně – maso, které se zkazí před sklizní, ovoce, sýr, luštěniny i ve snopech, mléko
      // dne a stád do sklizně, vejce a med, který vydrží jen část doby do sklizně
      {
        meatKg: 300,
        daysToMeatEnd: 60,
        fruitKg: 400,
        daysToRot: 40,
        cheeseKg: 50,
        legumesKg: 30,
        sheavesLegumesKg: 20,
        ...cowMilk(20),
        milkAheadEnergy: 150,
        eggsKg: 0.5,
        honeyKg: 3,
        honeyRationKg: 0.05,
      },
      // hojnost – čerstvé maso zimní porážky do konce zimy, velké zásoby a med (bez obilí ≈ 75 %)
      {
        freshMeatKg: 5,
        freshAheadEnergy: 1000,
        meatKg: 5000,
        fruitKg: 1000,
        daysToRot: 80,
        honeyKg: 100,
        honeyRationKg: 0.1,
      },
    ];
    for (const over of cases) {
      const base = input({ ...over, grainKg: 0, daysToHarvest: DAYS });
      // bez obilí – výhled ze samotného jídla mimo obilí
      const bare = eatDiet(base).outlook;
      for (const x of [0.5, 0.8, 1]) {
        const grainKg = grainAheadForOutlookKg(base, x) / KEEP;
        expect(eatDiet({ ...base, grainKg }).outlook).toBeCloseTo(Math.max(x, bare), 6);
      }
    }
  });

  it('s medem v hladu: příděl rovný do žní, obilí i med vyjdou právě na den žní', () => {
    // med se nekazí – výhled ho počítá celý, obilí se ztrátami (hides-honey.md – Klát u obydlí)
    const grainKg = 0.3 * NEED * DAYS;
    const honeyKg = (0.2 * NEED * DAYS) / honeyEnergy(1);
    const run = untilHarvest({ grainKg, honeyKg, honeyRationKg: 0.01 });
    expect(spread(run.outlooks)).toBeLessThan(1e-9);
    expect(spread(run.energy)).toBeLessThan(1e-9);
    expect(run.outlooks[0]).toBeCloseTo(0.3 * KEEP * eatenShare(KEEP, 0, DAYS) + 0.2, 9);
    expect(run.leftKg).toBeCloseTo(0, 6);
    expect(run.honeyLeftKg).toBeCloseTo(0, 6);
  });
});

describe('med – pevný příděl (hides-honey.md – Klát u obydlí; diet.md – Pojmy)', () => {
  /** 73 lidí × 0,5 kg za rok ÷ 365 dní = příděl 0,1 kg medu za den. */
  const RATION = (73 * HONEY.kgPerPersonYear) / 365;

  it('jí se příděl, zbytek zůstane v zásobě; 0,9 obilí na kg – o tolik méně obilí', () => {
    expect(RATION).toBeCloseTo(0.1, 12);
    expect(honeyEnergy(1)).toBe(0.9);
    const plain = eatDiet(input({}));
    const meal = eatDiet(input({ honeyKg: 10, honeyRationKg: RATION }));
    expect(meal.honeyKg).toBeCloseTo(9.9, 12);
    expect(meal.diet.shares.honey).toBeCloseTo(0.009, 12);
    expect(meal.diet.shares.grain).toBeCloseTo(plain.diet.shares.grain - 0.009, 12);
    expect(meal.grainKg - plain.grainKg).toBeCloseTo(0.09, 9);
    expect(meal.diet.energy).toBeCloseTo(1, 12);
  });

  it('zásoba menší než příděl – sní se, co je', () => {
    const meal = eatDiet(input({ honeyKg: 0.05, honeyRationKg: RATION }));
    expect(meal.honeyKg).toBe(0);
    expect(meal.diet.shares.honey).toBeCloseTo(0.0045, 12);
  });

  it('bez bílkovin a bez vlivu na kvalitu stravy – přidá jen energii', () => {
    const eaten = { ...NONE, grainKg: 6, meatKg: 2 };
    const plain = dietOf(NEED, PROTEIN_NEED, eaten);
    const sweet = dietOf(NEED, PROTEIN_NEED, { ...eaten, honeyKg: 1 });
    expect(sweet.protein).toBe(plain.protein);
    expect(sweet.diversity).toBe(plain.diversity);
    expect(sweet.shares.honey).toBeCloseTo(0.09, 12);
    expect(sweet.energy).toBeCloseTo(plain.energy + 0.09, 12);
  });

  it('vstup bez medových polí dá totéž co nulová zásoba – podíl medu chybí', () => {
    const plain = eatDiet(input({}));
    expect(eatDiet(input({ honeyKg: 0, honeyRationKg: RATION }))).toEqual(plain);
    expect(eatDiet(input({ honeyKg: 10 }))).toEqual({ ...plain, honeyKg: 10 });
    expect('honey' in plain.diet.shares).toBe(false);
    expect(plain.honeyKg).toBe(0);
  });

  it('dost jídla – výhled plný, med jen pevným přídělem a obilí navíc bez zbytku medu', () => {
    const meal = eatDiet(input({ grainKg: 2000, honeyKg: 100, honeyRationKg: RATION }));
    expect(meal.outlook).toBe(1);
    expect(meal.honeyKg).toBeCloseTo(100 - RATION, 12);
    // obilí navíc (koně) počítá s medem jen v přídělu do sklizně, ne s celou zásobou
    const plain = eatDiet(input({ grainKg: 2000 }));
    expect(meal.grainSpareKg - plain.grainSpareKg).toBeCloseTo(0.09 * 100, 6);
  });

  it('pevný příděl medu se jí i při dostatku obilí a jiného jídla (návrh Clauda – štěstí z medu)', () => {
    // maso by dnes nasytilo samo – pevný příděl medu se sní přesto, maso dorovná zbytek
    const meal = eatDiet(input({ meatKg: 1e4, honeyKg: 10, honeyRationKg: RATION }));
    expect(meal.outlook).toBe(1);
    expect(meal.eaten.honeyKg).toBeGreaterThan(0);
    expect(meal.eaten.honeyKg).toBeCloseTo(RATION, 12);
    expect(meal.honeyKg).toBeCloseTo(10 - RATION, 12);
    expect(meatEnergy(meal.eaten.meatKg)).toBeCloseTo(NEED - honeyEnergy(RATION), 9);
    expect(meal.eaten.grainKg).toBe(0);
    expect(meal.diet.energy).toBeCloseTo(1, 12);
  });

  it('málo jídla – výhled počítá s celou zásobou medu, jídlo dne i přežívací zásoba (Martin 15. 11. 2026)', () => {
    const honey = { honeyKg: 100, honeyRationKg: RATION };
    const share = eatenShare(KEEP, 0, 100);
    // pod plným přídělem celá zásoba 100 kg × 0,9 = 90 kg obilí – dnešního obilí o ztráty
    // skladováním víc; plný příděl s ní nepočítá, jen s pevným přídělem do sklizně (100 dní ×
    // 0,1 kg × 0,9)
    const without = (target: number): number =>
      grainAheadForOutlookKg(input({ grainKg: 0 }), target) -
      grainAheadForOutlookKg(input({ grainKg: 0, ...honey }), target);
    expect(without(0.5)).toBeCloseTo(90 / share, 9);
    expect(without(1)).toBeCloseTo(9 / share, 9);
    const lean = eatDiet(input({ grainKg: 500 }));
    const leanHoney = eatDiet(input({ grainKg: 500, ...honey }));
    expect(lean.outlook).toBeLessThan(1);
    expect(leanHoney.outlook - lean.outlook).toBeCloseTo(90 / (NEED * 100), 9);
    expect(leanHoney.diet.energy).toBeCloseTo(leanHoney.outlook, 9);
    // med se jí s obilím rovným dílem do sklizně – 100 kg na 100 dní, víc než pevný příděl
    expect(100 - leanHoney.honeyKg).toBeCloseTo(1, 9);
    expect(100 - leanHoney.honeyKg).toBeGreaterThan(RATION);
    expect(leanHoney.grainSpareKg).toBe(0);
  });

  it('malá zásoba (nevydrží do sklizně ani na příděl) – výhled ji počítá celou jako dřív', () => {
    // 5 kg = 4,5 kg obilí; jí se s obilím rovným dílem do sklizně – 0,05 kg denně místo přídělu 0,1
    const honey = { honeyKg: 5, honeyRationKg: RATION };
    expect(
      grainAheadForOutlookKg(input({ grainKg: 0 }), 1) -
        grainAheadForOutlookKg(input({ grainKg: 0, ...honey }), 1),
    ).toBeCloseTo(4.5 / eatenShare(KEEP, 0, 100), 9);
    const lean = eatDiet(input({ grainKg: 500 }));
    const leanHoney = eatDiet(input({ grainKg: 500, ...honey }));
    expect(leanHoney.outlook - lean.outlook).toBeCloseTo(4.5 / (NEED * 100), 9);
    expect(leanHoney.diet.energy).toBeCloseTo(leanHoney.outlook, 9);
    expect(leanHoney.honeyKg).toBeCloseTo(4.95, 12);
  });

  it('obilí do sklizně chybí jen kousek – med ho doplní, ves jí dosyta a med ubude jen o to', () => {
    // obilí do sklizně dá 95 % potřeby (950 z 1 000 kg), zásoba medu 90 kg obilí – chybí 50
    const share = eatenShare(KEEP, 0, 100);
    const full = grainAheadForOutlookKg(input({ grainKg: 0 }), 1);
    const grainKg = (full - 50 / share) / KEEP;
    expect(eatDiet(input({ grainKg })).outlook).toBeCloseTo(0.95, 9);
    const meal = eatDiet(input({ grainKg, honeyKg: 100, honeyRationKg: RATION }));
    expect(meal.outlook).toBe(1);
    expect(meal.diet.energy).toBeCloseTo(1, 12);
    expect(meal.grainSpareKg).toBe(0);
    // med dá do sklizně 50 z 1 000 kg obilí – dnes 5 % potřeby: 0,5 kg obilí = 0,556 kg medu
    expect(meal.diet.shares.honey).toBeCloseTo(0.05, 9);
    expect(100 - meal.honeyKg).toBeCloseTo(0.5 / 0.9, 9);
  });

  it('příděl vsi – 0,5 kg za rok na každého, kdo jí ze zásob vsi (i hosté)', () => {
    const day = at(600, 12, 2);
    const s = foundVillage({ seed: 3, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    const perPerson = HONEY.kgPerPersonYear / 365;
    expect(s.people.length).toBeGreaterThan(0);
    expect(villageHoneyRationKg(s, day)).toBeCloseTo(s.people.length * perPerson, 12);
    s.guests = [
      { ref: { villageId: 'pan', personId: 1 }, kind: 'labor', untilDay: day + 30, adult: true },
      { ref: { villageId: 'pan', personId: 2 }, kind: 'labor', untilDay: day, adult: true },
    ];
    expect(villageHoneyRationKg(s, day)).toBeCloseTo((s.people.length + 1) * perPerson, 12);
  });

  it('ves jí med ze zásoby zboží, zbytek se hromadí', () => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 1, day: at(600, 12, 1), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.storesKg = 50_000;
    withoutSmallGame(s);
    s.wares = { hides: 0, sheepFurs: 0, wildFurs: 0, honeyKg: 10, waxKg: 0 };
    const day = at(600, 12, 2);
    // v prosinci včely nelétají – med jen ubývá, každý den stejný příděl
    const ration = villageHoneyRationKg(s, day);
    const end = advanceVillage(s, day, null);
    expect(end.people.length).toBe(s.people.length);
    expect(end.wares!.honeyKg).toBeCloseTo(10 - (day - s.lastDay) * ration, 12);
    expect(end.diet!.shares.honey).toBeGreaterThan(0);
    // ves bez zboží med nemá – podíl medu chybí (zboží může mezitím vzniknout jen z lišky v oku)
    const bare = structuredClone(s);
    delete bare.wares;
    const after = advanceVillage(bare, day, null);
    expect(after.wares?.honeyKg ?? 0).toBe(0);
    expect(after.diet!.shares.honey).toBeUndefined();
  });

  it('ves s dost obilím v létě – med jen pevným přídělem, zbytek z klátů roste', () => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 1, day: at(601, 6, 1), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.storesKg = 50_000;
    withoutSmallGame(s);
    s.wares = { hides: 0, sheepFurs: 0, wildFurs: 0, honeyKg: 10, waxKg: 0 };
    const day = at(601, 6, 30);
    const end = advanceVillage(s, day, null);
    expect(end.people.length).toBe(s.people.length);
    expect(end.dwellings.length).toBe(s.dwellings.length);
    expect(end.ration).toBeUndefined();
    const hives = (s.dwellings.length * HIVES.honeyKgPerYear) / HIVES.seasonDays;
    const days = day - s.lastDay;
    expect(end.wares!.honeyKg).toBeCloseTo(10 + days * (hives - villageHoneyRationKg(s, day)), 9);
    expect(end.wares!.honeyKg).toBeGreaterThan(10);
  });

  it('hladová ves sní i zásobu medu – šetří méně, hladoví později a med ubývá víc než příděl', () => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 1, day: at(600, 12, 1), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    withoutSmallGame(s);
    s.storesKg = 100;
    s.wares = { hides: 0, sheepFurs: 0, wildFurs: 0, honeyKg: 0, waxKg: 0 };
    const withHoney = (kg: number): VillageState => {
      const v = structuredClone(s);
      v.wares!.honeyKg = kg;
      return v;
    };
    const day = at(600, 12, 31);
    const days = day - s.lastDay;
    const bare = advanceVillage(s, day, null);
    const some = advanceVillage(withHoney(200), day, null);
    const plenty = advanceVillage(withHoney(1000), day, null);
    // bez medu ves šetří přídělem, s medem méně – a med ubývá víc než pevný příděl
    expect(bare.ration).toBeLessThan(1);
    expect(some.ration).toBeGreaterThan(bare.ration!);
    expect(200 - some.wares!.honeyKg).toBeGreaterThan(2 * days * villageHoneyRationKg(s, day));
    // s velkou zásobou nešetří vůbec – med doplní, co obilí chybí, a zbytek zůstane
    expect(plenty.ration).toBeUndefined();
    expect(plenty.hungry).toBe(false);
    expect(bare.chronicle.some((e) => e.kind === 'hunger-began' && e.day > s.lastDay)).toBe(true);
    expect(plenty.wares!.honeyKg).toBeLessThan(1000 - 2 * days * villageHoneyRationKg(s, day));
    expect(plenty.wares!.honeyKg).toBeGreaterThan(0);
  });
});

describe('simulace – hlad jen z energie', () => {
  it('ves jen s obilím (dost energie) je nasycená na 80 %, ale nehladoví a hlad nenarůstá', () => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 1, day: at(600, 9, 2), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.storesKg = 50_000;
    withoutSmallGame(s);
    s.livestock = {
      herds: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    };
    const end = advanceVillage(s, at(601, 3, 1), null);
    expect(end.diet!.energy).toBeCloseTo(1, 9);
    // bílkoviny jen z obilí a vajec slepic – nasycení kolem 0,8
    expect(end.diet!.satiation).toBeGreaterThan(0.77);
    expect(end.diet!.satiation).toBeLessThan(0.86);
    expect(end.starvationDays ?? 0).toBe(0);
    expect(end.hungry).toBe(false);
  });

  it('ovoce, které se jí, přidá štěstí +5 (diet.md); bez stropu vytlačí obilí i s jeho bílkovinami', () => {
    const base = withBuiltFirstDwelling(
      foundVillage({ seed: 2, day: at(600, 9, 2), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    base.storesKg = 50_000;
    withoutSmallGame(base);
    const withFruit = structuredClone(base);
    withFruit.applesKg = 2000;
    const day = at(600, 10, 1);
    const a = advanceVillage(base, day, null);
    const b = advanceVillage(withFruit, day, null);
    // ovoce se jí před obilím, kolik ho je – dřív nejvýš 25 % energie
    expect(a.diet!.shares.fruit).toBe(0);
    expect(b.diet!.shares.fruit).toBeGreaterThan(0.5);
    expect(b.diet!.energy).toBeCloseTo(1, 9);
    // ovoce nemá bílkoviny – nasycení je nižší než s obilím
    expect(b.diet!.satiation).toBeLessThan(a.diet!.satiation);
    const plain = happinessFactors(a, day, a.diet!.satiation, a.diet!.shares.fruit > 0);
    const sweet = happinessFactors(b, day, b.diet!.satiation, b.diet!.shares.fruit > 0);
    expect(sweet.fruit - plain.fruit).toBe(DIET.fruitHappiness);
    expect(sweet.hunger).toBeGreaterThan(plain.hunger);
  });
});
