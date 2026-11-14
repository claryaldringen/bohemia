import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../actions';
import { DAIRY, daysUntilMilking } from '../../livestock/dairy';
import {
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
  meatEnergy,
  spoilMeat,
  villageHoneyRationKg,
  type DietInput,
  type Eaten,
} from '../diet';
import { HONEY } from '../../rules/rules-wares';
import { NO_CRAFTS, storageLossPerYear } from '../productivity';
import { advanceVillage } from '../simulate';
import type { VillageState } from '../../types';
import { withBuiltFirstDwelling, withoutSmallGame } from '../../__tests__/village-fixtures';

// Strava (diet.md): energie × kvalita z bílkovin a ovoce, stropy, ovoce, mléko a sýr, hlad jen
// z energie.

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
    const meatKg = 9.5; // bílkoviny z obilí ≈ polovina – zbytek z masa ≈ u stropu 40 % energie
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

describe('eatDiet – příděl', () => {
  it('maso a ovoce v hojnosti: strop masa 40 % a ovoce 25 % energie, obilí dorovná', () => {
    const meal = eatDiet(input({ meatKg: 1e6, fruitKg: 1e6, daysToRot: 50 }));
    expect(meal.diet.shares.meat).toBeCloseTo(DIET.caps.meat, 9);
    expect(meal.diet.shares.fruit).toBeCloseTo(DIET.caps.fruit, 9);
    expect(meal.diet.shares.grain).toBeCloseTo(1 - DIET.caps.meat - DIET.caps.fruit, 9);
    expect(meal.diet.energy).toBeCloseTo(1, 9);
    expect(meal.diet.satiation).toBeCloseTo(dietQuality(meal.diet.protein, 1), 9);
  });

  it('ovoce rovným dílem do zkažení, maso rovným dílem do porážky', () => {
    // ovoce na 2 % energie denně do 1. 3., maso na 10 % do porážky
    const fruitKg = 0.02 * NEED * 7 * 40;
    const meatKg = (0.1 * NEED * 60) / DIET.meatEnergy;
    const meal = eatDiet(input({ fruitKg, meatKg, daysToRot: 40, daysToMeatEnd: 60 }));
    expect(meal.diet.shares.fruit).toBeCloseTo(0.02, 9);
    // maso se ztrátou uzením za den
    expect(meal.diet.shares.meat).toBeCloseTo(0.1 * (1 - DIET.meatLossPerYear) ** (1 / 365), 9);
    expect(meal.diet.energy).toBeCloseTo(1, 9);
  });

  it('samo ovoce ani maso nenasytí – bez obilí nejvýš strop a ves hladoví', () => {
    const meal = eatDiet(input({ grainKg: 0, meatKg: 1e6, fruitKg: 1e6, daysToRot: 50 }));
    expect(meal.diet.energy).toBeCloseTo(DIET.caps.meat + DIET.caps.fruit, 9);
    expect(meal.outlook).toBeLessThan(1);
    const fruitOnly = eatDiet(input({ grainKg: 0, fruitKg: 1e6, daysToRot: 50 }));
    expect(fruitOnly.diet.energy).toBeCloseTo(DIET.caps.fruit, 9);
    expect(fruitOnly.diet.satiation).toBeLessThan(0.25);
  });

  it('obilí nevystačí do sklizně: energie se dělí rovně (s masem, které ještě přijde)', () => {
    const meatKg = (0.2 * NEED * 100) / DIET.meatEnergy;
    const grainKg = 0.4 * NEED * 100; // s masem 60 % energie do sklizně
    const meal = eatDiet(input({ grainKg, meatKg, potteryCoverage: 1 }));
    expect(meal.diet.energy).toBeCloseTo(0.6, 2);
    expect(meal.outlook).toBeCloseTo(meal.diet.energy, 2);
  });

  it('výhled s mlékem stád do sklizně a celou zásobou sýra – ves s malými zásobami nehladoví', () => {
    // září: dnešní mléko na stropu (sýr se dnes nejí), obilí jen na zbytek energie po mase
    // a mléku – dřívější výhled (mléko jen dnešní) by ves zbytečně dělil
    const days = 300;
    const milkL = (DIET.caps.dairy * NEED) / DAIRY.energyPerL.cow;
    const fresh = {
      milkL,
      milkProteinKg: milkL * DAIRY.proteinPerL.cow,
      milkEnergy: milkL * DAIRY.energyPerL.cow,
    };
    const meatKg = (DIET.caps.meat * NEED * 400) / DIET.meatEnergy;
    const cheeseKg = (DIET.caps.dairy * NEED * 150) / DAIRY.cheeseEnergy; // zima do 1. 5.
    const grainKg = 0.32 * NEED * days; // 30 % potřeby + ztráty
    // maso vydrží do 31. 8. příštího roku – v září je to přes sklizeň (zkazí se až 1. 9.)
    const base = input({
      ...fresh,
      meatKg,
      cheeseKg,
      grainKg,
      daysToHarvest: days,
      daysToMeatEnd: 364,
    });
    const old = eatDiet({ ...base, daysToMilking: 240 });
    expect(old.outlook).toBeLessThan(0.95);
    const ahead = DIET.caps.dairy * NEED * (days - 1 - 150); // mléko v létě do sklizně
    const meal = eatDiet({ ...base, daysToMilking: 240, milkAheadEnergy: ahead });
    expect(meal.outlook).toBe(1);
    expect(meal.diet.energy).toBeCloseTo(1, 9);
    // bez zásoby sýra a mléka do sklizně výhled hladoví dál
    const none = eatDiet({ ...base, cheeseKg: 0, daysToMilking: 240, milkAheadEnergy: 0 });
    expect(none.outlook).toBeLessThan(old.outlook + 1e-9);
    // výhled nikdy nepočítá víc mléka a sýra než strop za dny do sklizně
    const flood = eatDiet({ ...base, cheeseKg: 1e6, daysToMilking: 240, milkAheadEnergy: 1e6 });
    const capped = eatDiet({
      ...base,
      grainKg: 0.3 * NEED * days - 1,
      cheeseKg: 1e6,
      daysToMilking: 240,
      milkAheadEnergy: 1e6,
    });
    expect(flood.outlook).toBe(1);
    expect(capped.outlook).toBeLessThan(1);
  });

  it('čerstvé mléko se pije do stropu mléka a sýra, zbytek se zpracuje na sýr', () => {
    const milkL = 1000;
    const meal = eatDiet(
      input({
        milkL,
        milkProteinKg: milkL * DAIRY.proteinPerL.cow,
        milkEnergy: milkL * DAIRY.energyPerL.cow,
      }),
    );
    expect(meal.diet.shares.dairy).toBeCloseTo(DIET.caps.dairy, 9);
    const drunk = (DIET.caps.dairy * NEED) / DAIRY.energyPerL.cow;
    // kravské mléko: z 10 l kilogram sýra (75 % bílkovin mléka, sýr 25 %)
    expect(meal.cheeseMadeKg).toBeCloseTo(
      ((milkL - drunk) * DAIRY.proteinPerL.cow * DAIRY.cheeseProteinKept) / DAIRY.cheeseProtein,
      9,
    );
    expect((milkL - drunk) / meal.cheeseMadeKg).toBeCloseTo(10.1, 1);
    expect(meal.cheeseKg).toBeCloseTo(meal.cheeseMadeKg, 9);
    // mléko přidá bílkoviny k obilí
    expect(meal.diet.protein).toBeGreaterThan(eatDiet(input({})).diet.protein + 0.1);
  });

  it('sýr rovným dílem do příštího dojení, s mlékem nejvýš strop', () => {
    const cheeseKg = 100;
    const meal = eatDiet(input({ cheeseKg, daysToMilking: 50 }));
    const keep = (1 - DAIRY.cheeseLossPerYear) ** (1 / 365);
    expect(meal.diet.shares.dairy).toBeCloseTo(
      (((cheeseKg * keep) / 50) * DAIRY.cheeseEnergy) / NEED,
      9,
    );
    expect(daysUntilMilking(at(601, 4, 30))).toBe(1);
    expect(daysUntilMilking(at(601, 5, 1))).toBe(365);
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

  it('výhled do sklizně počítá maso jen do jeho zkažení', () => {
    // maso na strop 40 % (4 kg obilí denně) jen 30 dní z 60 do sklizně – obilí chybí
    const meal = eatDiet(
      input({ grainKg: 400, meatKg: 6000, daysToHarvest: 60, daysToMeatEnd: 30 }),
    );
    const grain = 400 * (1 - storageLossPerYear(NO_CRAFTS.pottery)) ** (1 / 365);
    expect(meal.outlook).toBeCloseTo((grain + 4 * 30) / (NEED * 60), 9);
    // do zkažení dost
    expect(eatDiet(input({ grainKg: 400, meatKg: 6000, daysToHarvest: 60 })).outlook).toBe(1);
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

  it('výhled do sklizně počítá s přídělem (`daily`) – jídlo dne i přežívací zásoba', () => {
    const honey = { honeyKg: 100, honeyRationKg: RATION };
    // 0,09 kg obilí denně × 100 dní do sklizně
    expect(
      grainAheadForOutlookKg(input({ grainKg: 0 }), 1) -
        grainAheadForOutlookKg(input({ grainKg: 0, ...honey }), 1),
    ).toBeCloseTo(9, 9);
    const lean = eatDiet(input({ grainKg: 500 }));
    const leanHoney = eatDiet(input({ grainKg: 500, ...honey }));
    expect(lean.outlook).toBeLessThan(1);
    expect(leanHoney.outlook - lean.outlook).toBeCloseTo(9 / (NEED * 100), 9);
  });

  it('výhled počítá med jen, dokud zásoba vydrží (jako maso do zkažení)', () => {
    // 5 kg vydrží 50 ze 100 dní do sklizně – výhled s ním počítá 4,5 kg obilí, ne 9
    const honey = { honeyKg: 5, honeyRationKg: RATION };
    expect(
      grainAheadForOutlookKg(input({ grainKg: 0 }), 1) -
        grainAheadForOutlookKg(input({ grainKg: 0, ...honey }), 1),
    ).toBeCloseTo(4.5, 9);
    const lean = eatDiet(input({ grainKg: 500 }));
    const leanHoney = eatDiet(input({ grainKg: 500, ...honey }));
    expect(leanHoney.outlook - lean.outlook).toBeCloseTo(4.5 / (NEED * 100), 9);
    // dnes se jí celý příděl – obilí dnes o to méně, ať je dnešní energie rovný příděl
    expect(leanHoney.diet.energy).toBeCloseTo(leanHoney.outlook, 9);
    expect(leanHoney.honeyKg).toBeCloseTo(4.9, 12);
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

  it('ovoce, které se jí, přidá štěstí +5 (diet.md)', () => {
    const base = withBuiltFirstDwelling(
      foundVillage({ seed: 2, day: at(600, 9, 2), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    base.storesKg = 50_000;
    const withFruit = structuredClone(base);
    withFruit.applesKg = 2000;
    const a = advanceVillage(base, at(600, 12, 1), null);
    const b = advanceVillage(withFruit, at(600, 12, 1), null);
    expect(b.happiness!.value).toBeGreaterThan(a.happiness!.value + 1);
  });
});
