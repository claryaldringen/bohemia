import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { obstaclesOf } from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { advanceVillage } from '../../core/simulate';
import { START_SEED_YEARS, FOOD_NEED_KG_PER_YEAR, LEAVING } from '../../rules';
import { newSteward } from '../../steward/steward-state';
import { land } from '../../steward/__tests__/steward-son-fixtures';
import { looseOxenDay } from '../../livestock/oxen';
import { summarizeVillage } from '../../core/summary';
import { TRADE_GOODS, isHorseGood, isLivestockGood, isPeopleGood } from '../../trade/goods';
import { addGood, villageGoodStock } from '../../trade/trade';
import type { Horse, Ox, Pen, PenSpecies, Person, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { CARRIED_STOCKS, takeCarriedStocks } from '../belongings';
import {
  departVillage,
  departureBlock,
  everyoneLeaves,
  MARKET_AWAY,
  wholeVillageBlock,
  leavingFood,
  leavingSeedKg,
  settlersOf,
  travellingVillage,
  wholeVillagePreview,
  type Settlers,
} from '../departure';
import { withPeopleNames } from '../people-names';
import { ageGroup } from '../people';

// Odchod celé vsi bere úplně vše (migration.md – Co si vezmou; Martin 25. 11. 2026: „Pokud se lidéí
// někam stěhují, berou si úplně vše.“): zásoby, vybavení, stáda, voli, koně a vozy jdou s lidmi, ve
// staré vsi zůstane jen to, co nejde odnést (stavby, pole, hromady klád a kamene). Nic nezmizí
// a nic nevznikne.

const DAY = dayIndexOf({ year: 600, month: 4, day: 10 });
const YEAR = 365.25;
const ON_THE_WAY = { direction: 'E', departedDay: DAY, arrivalDay: DAY + 2 } as const;

const pen = (id: number, species: PenSpecies, extra: Partial<Pen> = {}): Pen => ({
  id,
  species,
  cell: { x: id, y: 9 },
  x: -22.5,
  z: -7.5,
  builtDay: DAY - 800,
  ...extra,
});

const horse = (id: number, ageYears: number, extra: Partial<Horse> = {}): Horse => ({
  id,
  bornDay: Math.round(DAY - ageYears * YEAR),
  sex: 'male',
  training: 0,
  ...extra,
});

/**
 * Ves se dvěma domácnostmi (zakladatelé 4, vedle muž se ženou a dítětem 3 roky), která má po kousku
 * všeho, co stav vsi umí: zásoby, snopy, jámy, zboží řemesel, kůže, med, seno, stáda, voly, koně
 * (i bez ohrady), vozy, hromady klád a kamene.
 */
function richVillage(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day: DAY, dwellingPosition: { x: 10, z: 20, rotation: 0 } }),
  );
  s.lastDay = DAY;
  const home = s.nextId++;
  s.dwellings.push({
    id: home,
    type: 'zemnice',
    builtDay: DAY,
    condition: 1,
    position: { x: 60, z: 20, rotation: 0 },
  });
  const man: Person = {
    id: s.nextId++,
    bornDay: DAY - Math.ceil(22 * YEAR),
    dwellingId: home,
    sex: 'male',
  };
  const wife: Person = { ...man, id: s.nextId++, sex: 'female', spouseId: man.id };
  man.spouseId = wife.id;
  const child: Person = {
    id: s.nextId++,
    bornDay: DAY - Math.ceil(3 * YEAR),
    dwellingId: home,
    sex: 'female',
    motherId: wife.id,
    fatherId: man.id,
  };
  s.people.push(man, wife, child);
  s.nextId = 3000;

  s.storesKg = 4000;
  s.reservedSeedKg = 900;
  s.reservedSeedUntilDay = DAY + 2000;
  s.sowingSeed = { crop: 'spring', totalKg: 300, days: 40, kg: 250 };
  s.meatKg = 300;
  s.slaughterMeatKg = 200;
  s.cheeseKg = 45;
  s.legumesKg = 110;
  s.applesKg = 60;
  s.sheaves = {
    grainKg: 85,
    legumesKg: 25,
    work: { winter: 3, legume: 1.5 },
    byKg: true,
  };
  s.grainPits = [
    { id: 880, x: 40, z: 40, capacityKg: 900, grainKg: 700, state: 'sealed', dugDay: DAY - 300 },
    { id: 881, x: 44, z: 40, capacityKg: 900, grainKg: 250, state: 'open', dugDay: DAY - 300 },
  ];
  s.grainPitWork = { queueKg: 60, manDays: 1 };
  s.toolEquipmentKg = 21.5;
  s.ards = 2;
  s.crafts = { charcoalKg: 130, potteryKg: 45, ironBarsKg: 18.5, bloomKg: 6, woodToolsKg: 12 };
  s.wares = {
    hides: 3.5,
    smallHides: 2,
    sheepFurs: 7,
    wildFurs: 4,
    honeyKg: 9,
    waxKg: 1.5,
    beeTrees: { honeyKg: 2, waxKg: 0.25 },
    need: { hides: 1, furs: 2 },
    curing: [{ doneDay: DAY + 20, hides: 1, furs: 2 }],
  };
  s.hay = { kg: 900, mowing: null, mowCapacityKg: 5000, straw: { kg: 150, yearKg: 400 } };
  s.livestock = {
    ...s.livestock,
    herds: { sheep: 14.4, goat: 5, pig: 9.2, cow: 6 },
    young: { sheep: 2.5, goat: 1, pig: 3, cow: 0.5 },
    culling: { sheep: 2, goat: 1, pig: 3, cow: 0 },
  };
  s.pens = [
    pen(900, 'team', {
      oxen: [
        { trainedDay: DAY - 400 },
        { trainedDay: DAY - 900, weak: 0.8 },
        { trainedDay: DAY + 300 },
      ],
    }),
    pen(901, 'team', { oxen: [{ trainedDay: DAY - 100 }, { trainedDay: DAY - 90 }] }),
    pen(902, 'horse', {
      horses: [
        horse(910, 6, { riderId: man.id, training: 4 }),
        horse(911, 8, { sex: 'female' }),
        horse(912, 0.5),
      ],
    }),
    pen(903, 'cattle'),
  ];
  s.looseOxen = [{ trainedDay: DAY - 50 }];
  s.looseHorses = [horse(913, 4, { sex: 'female' })];
  s.carts = [
    { id: 950, kind: 'two-wheel', builtDay: DAY - 100 },
    { id: 951, kind: 'four-wheel', builtDay: DAY - 300 },
    { id: 952, kind: 'two-wheel', builtDay: DAY - 30 },
  ];
  s.woodLogs = 14;
  s.logStacks = [{ id: 960, fieldId: 0, x: 5, z: 5, logs: 14 }];
  s.stoneM3 = 3;
  s.stoneStacks = [{ id: 1, x: 9, z: 9, m3: 3 }];
  // lidé se jmény (population.md – Jména) – převod jmen při dopočtu nemá co měnit
  return withPeopleNames(s);
}

const households = (s: VillageState): number[] => s.dwellings.map((d) => d.id);

const byDay = (a: Ox, b: Ox): number => a.trainedDay - b.trainedDay;

/** Všechno, co ves má a jde odnést – po druzích (id koní a vozů jsou v každé vsi jiná). */
function inventory(v: VillageState): Record<string, unknown> {
  const wares = v.wares;
  const oxen = (v.pens ?? []).flatMap((p) => p.oxen ?? []);
  const horses = (v.pens ?? []).flatMap((p) => p.horses ?? []);
  return {
    grainKg: v.storesKg,
    reservedSeedKg: v.reservedSeedKg ?? 0,
    meatKg: v.meatKg ?? 0,
    slaughterMeatKg: v.slaughterMeatKg ?? 0,
    cheeseKg: v.cheeseKg ?? 0,
    legumesKg: v.legumesKg ?? 0,
    applesKg: v.applesKg ?? 0,
    sheaves: [v.sheaves?.grainKg ?? 0, v.sheaves?.legumesKg ?? 0, v.sheaves?.work ?? {}],
    toolsKg: v.toolEquipmentKg ?? 0,
    ards: v.ards ?? 0,
    charcoalKg: v.crafts?.charcoalKg ?? 0,
    potteryKg: v.crafts?.potteryKg ?? 0,
    ironBarsKg: v.crafts?.ironBarsKg ?? 0,
    bloomKg: v.crafts?.bloomKg ?? 0,
    woodToolsKg: v.crafts?.woodToolsKg ?? 0,
    hides: [wares?.hides ?? 0, wares?.smallHides ?? 0],
    furs: [wares?.sheepFurs ?? 0, wares?.wildFurs ?? 0],
    honeyKg: wares?.honeyKg ?? 0,
    waxKg: wares?.waxKg ?? 0,
    curing: wares?.curing ?? [],
    waresNeed: wares?.need ?? null,
    hayKg: v.hay?.kg ?? 0,
    strawKg: v.hay?.straw?.kg ?? 0,
    herds: v.livestock?.herds,
    young: v.livestock?.young,
    oxen: [...oxen, ...(v.looseOxen ?? [])].map((o) => ({ ...o })).sort(byDay),
    horses: [...horses, ...(v.looseHorses ?? [])]
      .map(({ bornDay, sex, training, riderId }) => ({ bornDay, sex, training, riderId }))
      .sort((a, b) => a.bornDay - b.bornDay),
    carts: (v.carts ?? [])
      .map(({ kind, builtDay }) => ({ kind, builtDay }))
      .sort((a, b) => a.builtDay - b.builtDay),
  };
}

const NOTHING: Record<string, unknown> = {
  grainKg: 0,
  reservedSeedKg: 0,
  meatKg: 0,
  slaughterMeatKg: 0,
  cheeseKg: 0,
  legumesKg: 0,
  applesKg: 0,
  sheaves: [0, 0, {}],
  toolsKg: 0,
  ards: 0,
  charcoalKg: 0,
  potteryKg: 0,
  ironBarsKg: 0,
  bloomKg: 0,
  woodToolsKg: 0,
  hides: [0, 0],
  furs: [0, 0],
  honeyKg: 0,
  waxKg: 0,
  curing: [],
  waresNeed: null,
  hayKg: 0,
  strawKg: 0,
  herds: { sheep: 0, goat: 0, pig: 0, cow: 0 },
  young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
  oxen: [],
  horses: [],
  carts: [],
};

/** Nová ves z osadníků (bez krajiny – jako v testech odchodu). */
function settle(settlers: Settlers, day = DAY + 2): VillageState {
  return foundVillage({
    seed: 9,
    day,
    dwellingPosition: { x: -200, z: -200, rotation: 0 },
    settlers,
  });
}

describe('odchod celé vsi (migration.md – Co si vezmou)', () => {
  it('nová ves má úplně vše, stará nic – nic nezmizí a nic nevznikne', () => {
    const s = richVillage();
    const before = structuredClone(s);
    const { state: old, settlers } = departVillage(s, DAY, households(s), 'E');
    expect(old.abandonedDay).toBe(DAY);
    expect(inventory(settle(settlers, DAY))).toEqual(inventory(before));
    expect(inventory(old)).toEqual(NOTHING);
    // vstupní stav se nemění
    expect(s).toEqual(before);
  });

  it('totéž přes cestu na novou mapu – ves na cestě nese vše s sebou', () => {
    const s = richVillage();
    const { settlers } = departVillage(s, DAY, households(s), 'E');
    const travelling = travellingVillage(settlers, 42, DAY, ON_THE_WAY);
    expect(inventory(travelling)).toEqual(inventory(s));
    const there = advanceVillage(travelling, DAY + 2, null);
    expect(inventory(there)).toEqual(inventory(s));
    const fresh = settle(settlersOf(there));
    expect(inventory(fresh)).toEqual(inventory(s));
    // ohrady na nové mapě nejsou – zvířata čekají bez ohrady, vozy a koně mají nová id
    expect(fresh.pens ?? []).toEqual([]);
    expect(fresh.looseOxen).toHaveLength(6);
    expect(fresh.looseHorses).toHaveLength(4);
    const ids = [...fresh.looseHorses!.map((h) => h.id), ...fresh.carts!.map((c) => c.id)];
    expect(new Set(ids).size).toBe(7);
    expect(Math.max(...ids)).toBeLessThan(fresh.nextId);
    expect(Math.min(...ids)).toBeGreaterThan(Math.max(...fresh.people.map((p) => p.id)));
    // kůň si nese jezdce (id lidí zůstala)
    const rider = fresh.looseHorses!.find((h) => h.riderId !== undefined)!.riderId;
    expect(fresh.people.some((p) => p.id === rider)).toBe(true);
  });

  it('dopočet cesty po kouscích dá totéž jako vcelku – i s příjezdem a založením', () => {
    const landscape = land(60);
    const obstacles = obstaclesOf(landscape);
    const s = richVillage();
    const { settlers } = departVillage(s, DAY, households(s), 'E');
    const start: VillageState = {
      ...travellingVillage(settlers, 42, DAY, ON_THE_WAY),
      steward: newSteward(DAY, true),
    };
    const to = (v: VillageState, day: number): VillageState =>
      advanceVillage(v, day, obstacles, landscape);
    const whole = to(start, DAY + 6);
    expect(whole.journey).toBeUndefined();
    const byPieces = to(to(to(start, DAY + 1), DAY + 2), DAY + 6);
    const saved = JSON.parse(JSON.stringify(to(start, DAY + 1))) as VillageState;
    expect(JSON.stringify(byPieces)).toBe(JSON.stringify(whole));
    expect(JSON.stringify(to(saved, DAY + 6))).toBe(JSON.stringify(whole));
    // den založení: vybavení je v nové vsi celé, zvířata čekají bez ohrady
    expect(whole.carts).toHaveLength(3);
    expect(whole.ards).toBe(2);
    expect(whole.looseOxen).toHaveLength(6);
    expect(whole.looseHorses).toHaveLength(4);
    expect(whole.crafts).toMatchObject({ ironBarsKg: 18.5, bloomKg: 6 });
  });

  it('ve staré vsi zůstanou stavby, pole a hromady klád a kamene; jámy jsou prázdné', () => {
    const s = richVillage();
    const { state: old } = departVillage(s, DAY, households(s), 'E');
    expect(old.dwellings).toEqual(s.dwellings);
    expect(old.parts).toEqual(s.parts);
    expect(old.woodLogs).toBe(14);
    expect(old.logStacks).toEqual(s.logStacks);
    expect(old.stoneM3).toBe(3);
    expect(old.stoneStacks).toEqual(s.stoneStacks);
    expect(old.pens!.map((p) => p.id)).toEqual([900, 901, 902, 903]);
    // ohrada koní bez koní nedostane zdarma další (`withHorsePenStock` – prázdné pole)
    expect(old.pens![2]!.horses).toEqual([]);
    expect(old.grainPits!.map((p) => [p.state, p.grainKg])).toEqual([
      ['empty', 0],
      ['empty', 0],
    ]);
    expect(old.grainPitWork!.queueKg).toBe(0);
    expect(old.sowingSeed).toBeUndefined();
    expect(old.reservedSeedUntilDay).toBeUndefined();
    expect(old.livestock!.culling).toBeUndefined();
    // med v brtích je v krajině, dokud ho nikdo nevybere
    expect(old.wares?.beeTrees).toEqual({ honeyKg: 2, waxKg: 0.25 });
    // opuštěná ves se dál nemění
    expect(inventory(advanceVillage(old, DAY + 400, null))).toEqual(NOTHING);
  });

  it('seno, snopy a brtě: seč a výnos roku patří staré vsi, nová začíná svůj rok', () => {
    const s = richVillage();
    const { state: old, settlers } = departVillage(s, DAY, households(s), 'E');
    const fresh = settle(settlers);
    expect(fresh.hay).toEqual({ kg: 900, mowing: null, straw: { kg: 150, yearKg: 0 } });
    expect(old.hay).toEqual({
      kg: 0,
      mowing: null,
      mowCapacityKg: 5000,
      straw: { kg: 0, yearKg: 400 },
    });
    expect(fresh.sheaves).toEqual(s.sheaves);
    expect(fresh.wares!.beeTrees).toBeUndefined();
  });

  it('vozy odejdou i bez volů, voli i bez vozů', () => {
    const s = richVillage();
    for (const p of s.pens!) if (p.oxen) p.oxen = [];
    delete s.looseOxen;
    const noOxen = departVillage(s, DAY, households(s)).settlers;
    expect(settle(noOxen).carts).toHaveLength(3);
    expect(settle(noOxen).looseOxen).toBeUndefined();
    const t = richVillage();
    delete t.carts;
    const noCarts = departVillage(t, DAY, households(t)).settlers;
    expect(settle(noCarts).carts).toBeUndefined();
    expect(settle(noCarts).looseOxen).toHaveLength(6);
  });

  it('odejde-li jen část, ostatní zásoby zůstanou ve staré vsi jako dřív', () => {
    const s = richVillage();
    const { state: old, settlers } = departVillage(s, DAY, [households(s)[1]!], 'E');
    expect(old.abandonedDay).toBeUndefined();
    expect(settlers.whole).toBeUndefined();
    for (const key of CARRIED_STOCKS) {
      if (key === 'sheaves') continue; // poměrný díl snopů – jako zásoby
      expect([key, old[key]]).toEqual([key, s[key]]);
    }
    expect(old.reservedSeedKg).toBe(900);
    expect(old.reservedSeedUntilDay).toBe(DAY + 2000);
    expect(old.looseOxen).toEqual(s.looseOxen);
    expect(old.looseHorses).toEqual(s.looseHorses);
    expect(old.pens![2]!.horses).toEqual(s.pens![2]!.horses);
    expect(old.livestock!.culling).toEqual(s.livestock!.culling);
    const fresh = settle(settlers);
    expect(fresh.crafts).toBeUndefined();
    expect(fresh.toolEquipmentKg).toBeUndefined();
    expect(fresh.slaughterMeatKg).toBe(0);
  });

  it('ves na cestě z doby před opravou zůstane, jak je – nic se nepřidá', () => {
    const s = richVillage();
    const { settlers } = departVillage(s, DAY, [households(s)[1]!], 'E');
    const travelling = travellingVillage(settlers, 42, DAY, ON_THE_WAY);
    // převody při dopočtu přidají prázdné části (snopy, zásoba masa z porážky)
    const later = advanceVillage(travelling, DAY + 1, null);
    const back = settlersOf(later);
    expect(later.journey!.whole).toBeUndefined();
    expect(back.whole).toBeUndefined();
    expect(settle(back).slaughterMeatKg).toBe(0);
    expect(Object.keys(back).sort()).toEqual(Object.keys(settlersOf(travelling)).sort());
  });

  it('ves opuštěná před opravou se nemění – zásoby v ní zůstanou', () => {
    const abandoned: VillageState = { ...richVillage(), people: [], abandonedDay: DAY };
    const later = advanceVillage(abandoned, DAY + 400, null);
    expect(inventory(later)).toEqual(inventory(abandoned));
  });
});

describe('zvířata bez ohrady na novém místě', () => {
  it('voli jdou do všech hotových ohrad volů s místem – do každé, co se vejde', () => {
    const s = richVillage();
    const { settlers } = departVillage(s, DAY, households(s), 'E');
    const fresh = settle(settlers);
    fresh.looseOxen = [...fresh.looseOxen!, { trainedDay: DAY - 20 }, { trainedDay: DAY - 10 }];
    const five = Array.from({ length: 5 }, () => ({ trainedDay: DAY - 700 }));
    fresh.pens = [
      pen(991, 'team'),
      pen(990, 'team', { oxen: five }),
      pen(992, 'team', { builtDay: null }),
    ];
    const events = looseOxenDay(fresh, DAY + 3);
    // 8 volů: do 990 jeden, do 991 šest – mezi nimi tele, které se ještě cvičí –, jeden čeká dál
    expect(fresh.pens.map((p) => p.oxen?.length ?? 0)).toEqual([6, 6, 0]);
    expect(fresh.looseOxen).toHaveLength(1);
    expect(events).toEqual([
      { day: DAY + 3, kind: 'team-ready', penId: 990, oxen: 1 },
      { day: DAY + 3, kind: 'team-ready', penId: 991, oxen: 5 },
    ]);
  });

  it('lišta zvířat ukáže i voly a koně, kteří čekají bez ohrady', () => {
    const s = richVillage();
    const { settlers } = departVillage(s, DAY, households(s), 'E');
    const fresh = settle(settlers);
    expect(summarizeVillage(fresh, DAY + 2).livestock).toMatchObject({ oxen: 6, looseHorses: 4 });
    // ves s ohradami: voli v ohradách i bez ohrady, koně ohrad zvlášť (panel ohrady)
    expect(summarizeVillage(s, DAY).livestock).toMatchObject({ oxen: 6, looseHorses: 1 });
    delete s.looseHorses;
    expect(summarizeVillage(s, DAY).livestock).not.toHaveProperty('looseHorses');
  });

  it('náhled odchodu celé vsi sedí s tím, co si vezme', () => {
    const s = richVillage();
    s.refuge = {
      refId: 'r1',
      campaignId: 'c1',
      mode: 'all',
      departedDay: DAY - 2,
      hidden: { foodKg: 70, herd: { sheep: 2, goat: 0, pig: 1, cow: 0 } },
    };
    const preview = wholeVillagePreview(s, DAY);
    const { settlers, state: old } = departVillage(s, DAY, households(s));
    const { food, seedKg } = settlers;
    // i co ves na útěku ukryla v lese
    expect(food.grainKg + seedKg!).toBe(4070);
    expect(preview.foodKg).toBeCloseTo(4070 + 300 + 45 + 110 + 60, 6);
    expect(settlers.herds).toEqual({ sheep: 16.4, goat: 5, pig: 10.2, cow: 6 });
    expect(preview.animals).toBe(16 + 5 + 10 + 6 + 6 + 4);
    expect(preview.carts).toBe(3);
    expect(old.refuge).not.toHaveProperty('hidden');
  });
});

describe('osivo celé vsi (fields.md – Osivo pro ves bez zásob)', () => {
  const seedNeed = (s: VillageState): number =>
    s.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, DAY)], 0) *
    START_SEED_YEARS;

  it('rezerva osiva odejde celá i s lhůtou zakladatelů; nad ni jen do půl roční potřeby', () => {
    const s = richVillage();
    s.reservedSeedKg = 2000;
    expect(seedNeed(s)).toBeLessThan(2000);
    const { settlers } = departVillage(s, DAY, households(s));
    expect(settlers.seedKg).toBe(2000);
    expect(settlers.food.grainKg).toBe(2000);
    const fresh = settle(settlers);
    expect(fresh).toMatchObject({
      storesKg: 4000,
      reservedSeedKg: 2000,
      reservedSeedUntilDay: DAY + 2000,
    });
    const travelling = travellingVillage(settlers, 42, DAY, ON_THE_WAY);
    expect(settle(settlersOf(travelling)).reservedSeedUntilDay).toBe(DAY + 2000);
    // po lhůtě se nenese
    const late = settle(settlers, DAY + 2000);
    expect(late.reservedSeedKg).toBe(2000);
    expect(late.reservedSeedUntilDay).toBeUndefined();
  });

  it('bez rezervy má osivo na první osev (půl roční potřeby) a zbytek je jídlo', () => {
    const s = richVillage();
    delete s.reservedSeedKg;
    delete s.reservedSeedUntilDay;
    const leavers = s.people;
    expect(leavingSeedKg(s, leavers, DAY)).toBeCloseTo(seedNeed(s), 6);
    expect(leavingFood(s, leavers, DAY).grainKg).toBeCloseTo(4000 - seedNeed(s), 6);
    const { settlers } = departVillage(s, DAY, households(s));
    expect(settlers.seedKg).toBeCloseTo(seedNeed(s), 6);
    expect(settlers.whole!.seedUntilDay).toBeUndefined();
  });

  it('chudá ves nemá z celého zrna osivo – jídlo na 180 dní má přednost, pěšky 20 kg na nosiče', () => {
    const s = richVillage();
    delete s.reservedSeedKg;
    delete s.reservedSeedUntilDay;
    s.storesKg = 500;
    s.meatKg = 0;
    s.cheeseKg = 0;
    s.legumesKg = 0;
    s.applesKg = 0;
    delete s.sheaves;
    const { settlers } = departVillage(s, DAY, households(s));
    // 6 nosičů (dítěti jsou 3 roky); na 180 dní jídla zrno nestačí, víc osiva než pěšky tedy ne
    expect(settlers.seedKg).toBeCloseTo(6 * LEAVING.seedKgPerCarrier, 6);
    expect(settlers.food.grainKg).toBeCloseTo(500 - 6 * LEAVING.seedKgPerCarrier, 6);
  });
});

describe('zásoby k odnesení – jeden seznam (CARRIED_STOCKS)', () => {
  it('projde každou část seznamu: odnese ji celou a nic nesdílí', () => {
    const s = richVillage();
    const before = structuredClone(s);
    const stocks = takeCarriedStocks(s);
    expect(Object.keys(stocks).sort()).toEqual([...CARRIED_STOCKS].sort());
    expect(stocks.crafts).toEqual(before.crafts);
    expect(stocks.toolEquipmentKg).toBe(21.5);
    // podruhé už není co vzít
    expect(takeCarriedStocks(s)).toEqual({});
  });

  it('každé zboží trhu odejde celé – zboží, které v seznamu chybí, tu spadne', () => {
    const s = richVillage();
    const goods = TRADE_GOODS.filter((good) => !isPeopleGood(good));
    for (const good of goods) if (!isHorseGood(good)) addGood(s, good, 7, DAY);
    const before = new Map(goods.map((good) => [good, villageGoodStock(s, good, DAY)]));
    const { state: old, settlers } = departVillage(s, DAY, households(s));
    const fresh = settle(settlers, DAY);
    for (const good of goods) {
      // hromady klád a kamene nejde odnést
      const heap = good === 'logs' || good === 'stone';
      const left = villageGoodStock(old, good, DAY);
      expect([good, left]).toEqual([good, heap ? before.get(good) : 0]);
      // zvířata bez ohrady na trh nejdou – ta hlídá součet výš
      if (heap || isLivestockGood(good)) continue;
      expect([good, villageGoodStock(fresh, good, DAY)]).toEqual([good, before.get(good)]);
    }
  });

  it('odejdou všichni: jen když odchází každý, kdo ve vsi žije', () => {
    expect(everyoneLeaves(7, 7)).toBe(true);
    expect(everyoneLeaves(6, 7)).toBe(false);
    expect(everyoneLeaves(0, 0)).toBe(false);
  });
});

/** Výprava na trh ve vsi – lidé a vozy jsou pryč do `market.returnDay`. */
function withMarketTrip(s: VillageState): VillageState {
  s.trade = {
    nextId: 2,
    expeditions: [
      {
        id: 1,
        kind: 'market',
        direction: 'S',
        trailId: -1,
        startedDay: DAY - 1,
        give: {},
        get: {},
        porters: 2,
        days: 4,
        cost: 8,
        done: 1,
      },
    ],
  };
  return s;
}

describe('výprava na trhu při odchodu celé vsi', () => {
  it('odchází-li všichni a výprava je na trhu, odejít nejde; po návratu ano', () => {
    const s = withMarketTrip(richVillage());
    expect(MARKET_AWAY).toBe('Výprava se ještě nevrátila z trhu.');
    expect(departureBlock(s, households(s), DAY)).toBe(MARKET_AWAY);
    expect(wholeVillageBlock(s)).toBe(MARKET_AWAY);
    expect(() => departVillage(s, DAY, households(s))).toThrow(MARKET_AWAY);
    s.trade!.expeditions = [];
    expect(departureBlock(s, households(s), DAY)).toBeNull();
    expect(wholeVillageBlock(s)).toBeNull();
  });

  it('odchod části lidí a obchod se sousedem a zásilka beze změny', () => {
    const s = withMarketTrip(richVillage());
    expect(departureBlock(s, [households(s)[1]!], DAY)).toBeNull();
    s.trade!.expeditions[0] = { ...s.trade!.expeditions[0]!, kind: 'shipment' };
    delete s.trade!.expeditions[0]!.market;
    expect(departureBlock(s, households(s), DAY)).toBeNull();
    expect(wholeVillageBlock(s)).toBeNull();
  });
});

describe('ves na útěku odejde celá', () => {
  it('lidé ukrytí v lese jdou s ostatními a nová ves staví bez NaN', () => {
    const landscape = land(60);
    const obstacles = obstaclesOf(landscape);
    const s = richVillage();
    s.refuge = {
      refId: 'r1',
      campaignId: 'c1',
      mode: 'all',
      departedDay: DAY - 2,
      hidden: { foodKg: 70, herd: { sheep: 2, goat: 0, pig: 1, cow: 0 } },
    };
    for (const p of s.people) p.away = { kind: 'refuge', refId: 'r1' };
    const { settlers } = departVillage(s, DAY, households(s), 'E');
    expect(settlers.people).toHaveLength(s.people.length);
    expect(settlers.people.every((p) => p.away === undefined)).toBe(true);
    const start: VillageState = {
      ...travellingVillage(settlers, 42, DAY, ON_THE_WAY),
      steward: newSteward(DAY, true),
    };
    const later = advanceVillage(start, DAY + 100, obstacles, landscape);
    expect(later.journey).toBeUndefined();
    expect(later.people.length).toBeGreaterThanOrEqual(s.people.length);
    expect(later.people.filter((p) => p.away !== undefined)).toEqual([]);
    expect(later.dwellings.length + later.constructions.length).toBeGreaterThan(0);
    expect(JSON.stringify(later)).not.toContain('null,null');
    expect(Number.isFinite(later.storesKg)).toBe(true);
    expect(JSON.stringify(later)).not.toMatch(/NaN/);
  });
});

describe('pojistka zásob – nic ve vsi nezůstane bez rozhodnutí', () => {
  it('každá část stavu bohaté vsi je odnesená, řešená jinde, nebo výslovně zůstává', () => {
    // ve vsi zůstává, protože to nejde odnést (návrh Clauda – belongings.ts)
    const stays = [
      'dwellings',
      'constructions',
      'fields',
      'woodLogs',
      'logStacks',
      'stoneM3',
      'stoneStacks',
      'grainPits',
      'grainPitWork',
      'chronicle',
      'lastDay',
      'seed',
      'nextId',
      'foundedDay',
      'steward',
      'parts',
      'season',
      'threshingSeason',
      'sowingRotation',
      'hungry',
      'commonLaborHistory',
      'clearedObstacles',
      'felledTrees',
      'manorId',
      'armsCapped',
    ];
    // řeší departure.ts jinde – lidé, jídlo, osivo, stáda, zvířata, vozy
    const handled = [
      'people',
      'dynasty',
      'storesKg',
      'reservedSeedKg',
      'reservedSeedUntilDay',
      'sowingSeed',
      'meatKg',
      'slaughterMeatKg',
      'cheeseKg',
      'legumesKg',
      'applesKg',
      'livestock',
      'pens',
      'looseOxen',
      'looseHorses',
      'carts',
    ];
    const known = new Set<string>([...CARRIED_STOCKS, ...stays, ...handled]);
    const unknown = Object.keys(richVillage()).filter((key) => !known.has(key));
    // nová část stavu: buď ji odnést (CARRIED_STOCKS), nebo ji sem výslovně zařadit
    expect(unknown).toEqual([]);
  });
});
