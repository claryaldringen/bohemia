import { describe, expect, it } from 'vitest';
import { foundVillage, startReplacement } from '../../core/actions';
import {
  abandonedVillageAt,
  departVillage,
  departureBlock,
  edgeDistanceM,
  isVillageDormant,
  leavingFood,
  leavingSeedKg,
  settlersOf,
  travelDays,
  travellingVillage,
} from '../departure';
import { isGameOver } from '../../core/extinction';
import { ageGroup, ageYears, occupants } from '../people';
import { CARTS, DWELLINGS, FOOD_NEED_KG_PER_YEAR, LEAVING } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { CartKind, Person, VillageState } from '../../types';
import { directionBetween, neighbourCell, OPPOSITE, SEAT_CELL } from '../world-grid';
import { makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Odchod do nové vsi (migration.md – fáze 3 a 4): domácnosti odejdou celé, s jídlem, které unesou,
// a poměrným dílem stád; stará ves zůstane, odejdou-li všichni, je opuštěná.

const DAY = 1000;
const YEAR = 365.25;
const HOME = { x: 10, z: 20, rotation: 0 };

/**
 * Ves se dvěma domácnostmi: zakladatelé (4 lidé) v zemnici 1 a rodina syna (otec, matka, dítě 3
 * roky) v zemnici vedle – syn je dítětem zakladatelů. Zásoby 2000 kg obilí, 300 kg masa, 100 kg
 * luštěnin.
 */
function twoHouseholds(): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 7, day: DAY, dwellingPosition: HOME }));
  const founders = s.people.filter((p) => p.dwellingId === 1);
  const [father, mother] = founders;
  const home = s.nextId++;
  s.dwellings.push({
    id: home,
    type: 'zemnice',
    builtDay: DAY,
    condition: 1,
    position: { x: 60, z: 20, rotation: 0 },
  });
  const son: Person = {
    id: s.nextId++,
    bornDay: DAY - Math.ceil(22 * YEAR),
    dwellingId: home,
    sex: 'male',
    motherId: mother!.id,
    fatherId: father!.id,
  };
  const wife: Person = {
    id: s.nextId++,
    bornDay: DAY - Math.ceil(20 * YEAR),
    dwellingId: home,
    sex: 'female',
  };
  son.spouseId = wife.id;
  wife.spouseId = son.id;
  const child: Person = {
    id: s.nextId++,
    bornDay: DAY - Math.ceil(3 * YEAR),
    dwellingId: home,
    sex: 'female',
    motherId: wife.id,
    fatherId: son.id,
  };
  s.people.push(son, wife, child);
  s.storesKg = 2000;
  s.meatKg = 300;
  s.legumesKg = 100;
  return s;
}

const sonHome = (s: VillageState): number => s.dwellings[1]!.id;

describe('departVillage', () => {
  it('domácnost odejde celá i s rodokmenem, jídlem a dílem stád; stará ves zůstane', () => {
    const s = twoHouseholds();
    const herdsBefore = { ...s.livestock!.herds };
    const { state, settlers } = departVillage(s, DAY, [sonHome(s)]);
    expect(settlers.people.map((p) => p.id).sort()).toEqual(
      s.people
        .filter((p) => p.dwellingId === sonHome(s))
        .map((p) => p.id)
        .sort(),
    );
    // manželé i dítě si nesou vazby, rodiče syna jsou v rodokmenu nové vsi
    const son = settlers.people.find((p) => p.sex === 'male')!;
    expect(son.spouseId).toBeDefined();
    expect(settlers.ancestors.map((a) => a.id).sort()).toEqual(
      [son.motherId!, son.fatherId!].sort(),
    );
    // 3 ze 7 lidí, unesou dva dospělí (dítěti jsou 3 roky): 2 × 25 kg
    const food = settlers.food;
    const carried = food.grainKg + food.meatKg + food.legumesKg + food.cheeseKg + food.applesKg;
    expect(carried).toBeCloseTo(2 * LEAVING.carryKgPerPerson, 6);
    // osivo navíc k jídlu – dva nosiči po 20 kg (potřeba na první osev 230 kg je víc)
    const seed = settlers.seedKg ?? 0;
    expect(seed).toBeCloseTo(2 * LEAVING.seedKgPerCarrier, 6);
    // ze všech zásob stejný podíl – obilí bez osiva, které mají napřed
    expect(food.grainKg / food.meatKg).toBeCloseTo(((2000 * 3) / 7 - seed) / ((300 * 3) / 7), 6);
    expect(state.storesKg).toBeCloseTo(2000 - food.grainKg - seed, 6);
    expect(state.meatKg).toBeCloseTo(300 - food.meatKg, 6);
    // stáda: 3/7
    expect(settlers.herds.sheep).toBeCloseTo((herdsBefore.sheep * 3) / 7, 6);
    expect(state.livestock!.herds.sheep).toBeCloseTo((herdsBefore.sheep * 4) / 7, 6);
    // ve staré vsi zůstal prázdný dům, syn je v rodokmenu (rodič žijících ne – jeho dítě odešlo)
    expect(occupants(state, sonHome(s))).toEqual([]);
    expect(state.dwellings).toHaveLength(2);
    expect(state.people).toHaveLength(4);
    expect(state.abandonedDay).toBeUndefined();
    expect(state.chronicle.at(-1)).toEqual({
      day: DAY,
      kind: 'households-left',
      households: 1,
      people: 3,
    });
    // vstupní stav se nemění
    expect(s.people).toHaveLength(7);
  });

  it('malé zásoby si vezmou jen poměrný díl – napřed osivo', () => {
    const s = twoHouseholds();
    s.storesKg = 70;
    s.meatKg = 0;
    s.legumesKg = 0;
    const leavers = s.people.filter((p) => p.dwellingId === sonHome(s));
    // díl 3/7 = 30 kg – celý jako osivo (na první osev chtějí 230 kg, unesou 2 × 20 kg)
    expect(leavingSeedKg(s, leavers, DAY)).toBeCloseTo(30, 6);
    expect(leavingFood(s, leavers, DAY).grainKg).toBeCloseTo(0, 6);
    // osivo, které má mateřská ves jen na setí, mezi jejich díl nepatří
    s.reservedSeedKg = 35;
    expect(leavingSeedKg(s, leavers, DAY)).toBeCloseTo(15, 6);
  });

  it('snopy, které ves smí vymlátit, se dělí jako zásoby – bez humna zůstanou ve vsi', () => {
    const s = twoHouseholds();
    s.storesKg = 35;
    s.meatKg = 0;
    s.legumesKg = 0;
    s.sheaves = { grainKg: 35, legumesKg: 0, work: { spring: 10 } };
    s.threshingFloors = [{ id: 900, position: { x: 200, z: 0, rotation: 0 }, builtDay: DAY - 30 }];
    // 3 ze 7 lidí: (35 + 35) × 3/7 = 30 kg – unesou (2 × 25 kg); napřed osivo 35 × 3/7 = 15 kg
    // z vymláceného zrna, zbytek jako jídlo
    const { state, settlers } = departVillage(s, DAY, [sonHome(s)]);
    expect(settlers.seedKg).toBeCloseTo(15, 6);
    expect(settlers.food.grainKg).toBeCloseTo(15, 6);
    expect(state.storesKg).toBeCloseTo(20, 6);
    expect(state.sheaves!.grainKg).toBeCloseTo(20, 6);
    expect(state.sheaves!.work!.spring).toBeCloseTo((10 * 4) / 7, 6);
    // bez humna se mlátí nouzově – snopy jsou jídlem o 10 % zrna méně: (35 × 0,9 + 35) × 3/7
    const bare = structuredClone(s);
    delete bare.threshingFloors;
    const left = departVillage(bare, DAY, [sonHome(bare)]);
    expect(left.settlers.food.grainKg).toBeCloseTo(28.5 - 15, 6);
  });

  it('na novou mapu: ve staré vsi zůstanou jako odešlí ve směru (war.md)', () => {
    const s = twoHouseholds();
    const { state } = departVillage(s, DAY, [sonHome(s)], 'N');
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'households-left', direction: 'N' });
    expect((state.emigrants ?? []).every((e) => e.direction === 'N')).toBe(true);
    expect((state.emigrants ?? []).length).toBeGreaterThan(0);
  });

  it('odejdou-li všichni, ves je opuštěná a dál se nesimuluje (nevymře)', () => {
    const s = twoHouseholds();
    const { state } = departVillage(s, DAY, [1, sonHome(s)]);
    expect(state.people).toEqual([]);
    expect(state.abandonedDay).toBe(DAY);
    expect(state.chronicle.at(-1)).toEqual({ day: DAY, kind: 'village-abandoned' });
    expect(isVillageDormant(state)).toBe(true);
    const later = advanceVillage(state, DAY + 500, null);
    expect(later.extinctDay).toBeUndefined();
    expect(later.lastDay).toBe(DAY + 500);
    expect(later.dwellings).toEqual(state.dwellings);
    // konec hry: jediná ves opuštěná
    expect(isGameOver([later])).toBe(true);
    expect(isGameOver([later, s])).toBe(false);
  });

  it('odejít nejde z prázdného domu, s domácností, která se stěhuje, ani dvakrát', () => {
    const s = twoHouseholds();
    expect(departureBlock(s, [], DAY)).not.toBeNull();
    expect(departureBlock(s, [999], DAY)).not.toBeNull();
    expect(departureBlock(s, [1, 1], DAY)).not.toBeNull();
    s.woodLogs = 20;
    const moving = startReplacement(
      s,
      DAY,
      sonHome(s),
      'zemnice',
      { x: 120, z: 0, rotation: 0 },
      0,
    );
    expect(departureBlock(moving, [sonHome(s)], DAY)).toMatch(/staví nový dům/);
    expect(() => departVillage(moving, DAY, [sonHome(s)])).toThrow(RangeError);
    const { state } = departVillage(s, DAY, [1, sonHome(s)]);
    expect(departureBlock(state, [1], DAY)).not.toBeNull();
  });

  it('domácnost s člověkem na výpravě odejít nemůže; po návratu (`untilDay`) už ano', () => {
    const s = twoHouseholds();
    const member = s.people.find((p) => p.dwellingId === sonHome(s))!;
    member.away = { kind: 'journey', refId: 'j1' };
    expect(departureBlock(s, [sonHome(s)], DAY)).toBe('Někdo z domácnosti je na výpravě.');
    expect(() => departVillage(s, DAY, [sonHome(s)])).toThrow(RangeError);
    // jiný druh nepřítomnosti odchod neblokuje (beze změny)
    member.away = { kind: 'service', refId: 'r1', untilDay: DAY + 30 };
    expect(departureBlock(s, [sonHome(s)], DAY)).toBeNull();
    // hlouček došel domů – od `untilDay` je doma, i když záznam ještě trvá
    member.away = { kind: 'journey', refId: 'j1', untilDay: DAY };
    expect(departureBlock(s, [sonHome(s)], DAY)).toBeNull();
  });
});

describe('nová ves z osadníků', () => {
  it('foundVillage s osadníky: jejich lidé, jídlo a stáda, id za nimi', () => {
    const s = twoHouseholds();
    const { settlers } = departVillage(s, DAY, [sonHome(s)]);
    const fresh = foundVillage({
      seed: 9,
      day: DAY,
      dwellingPosition: { x: -200, z: -200, rotation: 0 },
      settlers,
    });
    const maxId = Math.max(
      ...settlers.people.map((p) => p.id),
      ...settlers.ancestors.map((a) => a.id),
    );
    const household = maxId + 1;
    expect(fresh.people.map((p) => p.id).sort()).toEqual(settlers.people.map((p) => p.id).sort());
    expect(fresh.people.every((p) => p.dwellingId === household)).toBe(true);
    expect(fresh.constructions[0]).toMatchObject({
      dwellingId: household,
      dwellingType: 'zemnice',
    });
    expect(fresh.manorId).toBe(household);
    // osivo osadníků je v zásobách, ves ho má jen na setí (fields.md – Osivo pro ves bez zásob)
    expect(settlers.seedKg).toBeGreaterThan(0);
    expect(fresh.storesKg).toBeCloseTo(settlers.food.grainKg + settlers.seedKg!, 6);
    expect(fresh.reservedSeedKg).toBeCloseTo(settlers.seedKg!, 6);
    expect(fresh.livestock!.herds).toEqual(settlers.herds);
    expect(fresh.ancestors).toEqual(settlers.ancestors);
    // ves se dopočítává jako každá jiná
    const later = advanceVillage(fresh, DAY + 60, null);
    expect(later.people.length).toBeGreaterThan(0);
  });

  it('ves na cestě se nesimuluje; po příjezdu se založí ze svých osadníků', () => {
    const s = twoHouseholds();
    const { settlers } = departVillage(s, DAY, [sonHome(s)], 'E');
    const travelling = travellingVillage(settlers, 42, DAY, {
      direction: 'E',
      departedDay: DAY,
      arrivalDay: DAY + 2,
    });
    expect(isVillageDormant(travelling)).toBe(true);
    expect(isGameOver([travelling])).toBe(false);
    const later = advanceVillage(travelling, DAY + 10, null);
    expect(later.people).toEqual(travelling.people);
    expect(later.lastDay).toBe(DAY + 10);
    const back = settlersOf(later);
    expect(back.people.map((p) => p.id)).toEqual(settlers.people.map((p) => p.id));
    expect(back.food.grainKg).toBeCloseTo(settlers.food.grainKg, 6);
    expect(back.herds).toEqual(settlers.herds);
  });
});

describe('vůz s voly při odchodu (migration.md – Vůz při odchodu)', () => {
  /** Ohrada volů se `trained` vycvičenými voly a rádlem, vozy `carts`. */
  function withDraft(s: VillageState, trained: number, carts: CartKind[]): VillageState {
    s.pens = [
      {
        id: 900,
        cell: { x: 8, y: 9 },
        x: -22.5,
        z: -7.5,
        builtDay: DAY - 800,
        species: 'team',
        oxen: Array.from({ length: trained }, (_, k) => ({ trainedDay: DAY - 400 + k * 10 })),
      },
    ];
    s.ards = 1;
    s.carts = carts.map((kind, k) => ({ id: 950 + k, kind, builtDay: DAY - 100 + k }));
    return s;
  }

  it('volný vůz s voly odejde s nimi – uveze víc jídla; ves si nechá pár k rádlu', () => {
    const s = withDraft(twoHouseholds(), 3, ['two-wheel', 'four-wheel']);
    const { state, settlers } = departVillage(s, DAY, [sonHome(s)]);
    // 3 voli, pár orá – zbude jeden vůl na dvoukolák (čtyřkolák chce dva)
    expect(settlers.cart).toMatchObject({ id: 950, kind: 'two-wheel' });
    expect(settlers.oxen).toEqual([{ trainedDay: DAY - 380 }]);
    expect(state.carts!.map((c) => c.id)).toEqual([951]);
    expect(state.pens![0]!.oxen!.map((ox) => ox.trainedDay)).toEqual([DAY - 400, DAY - 390]);
    // jídlo: dva nosiči a dvoukolák (díl zásob 3/7 je víc)
    const food = settlers.food;
    const carried = food.grainKg + food.meatKg + food.legumesKg + food.cheeseKg + food.applesKg;
    // osivo na první osev (230 kg): 2 × 20 kg nosiči, zbytek na voze místo jídla
    expect(settlers.seedKg).toBeCloseTo(230, 6);
    expect(carried + settlers.seedKg!).toBeCloseTo(
      2 * (LEAVING.carryKgPerPerson + LEAVING.seedKgPerCarrier) + CARTS.loadKg['two-wheel'],
      6,
    );
    expect(leavingFood(s, [], DAY, 'four-wheel').grainKg).toBe(0);
  });

  it('vůz veze napřed jídlo na LEAVING.cartSeedFoodDays dní, osivo jen z toho, co zbude', () => {
    const s = withDraft(twoHouseholds(), 3, ['four-wheel']);
    const leavers = s.people.filter((p) => p.dwellingId === sonHome(s));
    const need = leavers.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, DAY)], 0);
    const food = leavingFood(s, leavers, DAY, 'four-wheel');
    const foodKg = food.grainKg + food.meatKg + food.legumesKg + food.cheeseKg + food.applesKg;
    expect(foodKg).toBeGreaterThanOrEqual((need * LEAVING.cartSeedFoodDays) / YEAR - 1e-6);
    // nosnost se neprekročí: jídlo + osivo nad osivo pěšky ≤ nosnost
    const seed = leavingSeedKg(s, leavers, DAY, 'four-wheel');
    const carriers = leavers.filter((p) => ageYears(p.bornDay, DAY) >= LEAVING.carryFromAge).length;
    const foot = carriers * LEAVING.seedKgPerCarrier;
    expect(foodKg + Math.max(0, seed - foot)).toBeLessThanOrEqual(
      carriers * LEAVING.carryKgPerPerson + CARTS.loadKg['four-wheel'] + 1e-6,
    );
  });

  it('poměrný díl se počítá ze zásob bez rezervy osiva mateřské vsi – ta zůstane jí', () => {
    const s = twoHouseholds();
    s.reservedSeedKg = 700;
    const { state, settlers } = departVillage(s, DAY, [sonHome(s)]);
    const taken = settlers.food.grainKg + (settlers.seedKg ?? 0);
    expect(taken).toBeLessThanOrEqual(((2000 - 700) * 3) / 7 + 1e-6);
    expect(state.storesKg).toBeCloseTo(2000 - taken, 6);
    expect(state.storesKg).toBeGreaterThanOrEqual(700);
  });

  it('bez volných volů vůz zůstane; odchází-li celá ves, vezme si čtyřkolák i s páry', () => {
    const tight = withDraft(twoHouseholds(), 2, ['four-wheel']);
    expect(departVillage(tight, DAY, [sonHome(tight)]).settlers.cart).toBeUndefined();
    const s = withDraft(twoHouseholds(), 2, ['four-wheel']);
    const all = departVillage(s, DAY, [1, sonHome(s)]);
    expect(all.settlers.cart).toMatchObject({ kind: 'four-wheel' });
    expect(all.settlers.oxen).toHaveLength(2);
    expect(all.state.carts).toBeUndefined();
  });

  it('v nové vsi je vůz její, voli čekají bez ohrady a s první ohradou volů do ní přejdou', () => {
    const s = withDraft(twoHouseholds(), 3, ['two-wheel']);
    const { settlers } = departVillage(s, DAY, [sonHome(s)]);
    const fresh = foundVillage({
      seed: 9,
      day: DAY,
      dwellingPosition: { x: -200, z: -200, rotation: 0 },
      settlers,
    });
    expect(fresh.carts).toHaveLength(1);
    expect(fresh.carts![0]!.kind).toBe('two-wheel');
    expect(fresh.looseOxen).toEqual(settlers.oxen);
    // ves na cestě je nese s sebou
    const travelling = travellingVillage(settlers, 42, DAY, {
      direction: 'E',
      departedDay: DAY,
      arrivalDay: DAY + 2,
    });
    expect(settlersOf(travelling).cart).toMatchObject({ kind: 'two-wheel' });
    expect(settlersOf(travelling).oxen).toEqual(settlers.oxen);
    // hotová ohrada volů – voli do ní přejdou
    fresh.pens = [
      {
        id: 990,
        cell: { x: 3, y: 3 },
        x: -200,
        z: -170,
        builtDay: DAY,
        species: 'team',
        oxen: [],
      },
    ];
    const later = advanceVillage(fresh, DAY + 1, null);
    expect(later.looseOxen).toBeUndefined();
    expect(later.pens![0]!.oxen).toEqual(settlers.oxen);
  });
});

describe('opuštěná ves jen pro pohled', () => {
  it('domy chátrají ode dne odchodu, pak zbude zarůstající jáma; pole ladem', () => {
    const s = twoHouseholds();
    s.parts.push({
      id: 500,
      fieldId: 499,
      areaM2: 225,
      distanceM: 30,
      naturalFertility: 60,
      fertilityShare: 1,
      bonusUntilDay: null,
      state: 'sown',
      crop: 'winter',
      sownYears: 1,
      fallowSinceDay: null,
      foundingCost: 10,
      foundingDone: 10,
      surface: 'meadow',
      cell: { x: 3, y: 3 },
    });
    const { state } = departVillage(s, DAY, [1, sonHome(s)]);
    expect(abandonedVillageAt(s, DAY + 100)).toBe(s);
    const soon = abandonedVillageAt(state, DAY + 365);
    expect(soon.dwellings).toHaveLength(2);
    expect(soon.dwellings.every((d) => d.condition < 1 && d.condition > 0)).toBe(true);
    expect(soon.parts[0]).toMatchObject({ state: 'fallow', fallowSinceDay: DAY });
    expect(soon.parts[0]!.crop).toBeUndefined();
    const fallen = abandonedVillageAt(
      state,
      DAY + Math.ceil(DWELLINGS.zemnice.emptyLifespanYears * YEAR) + 30,
    );
    expect(fallen.dwellings).toEqual([]);
    expect(fallen.ruins?.map((r) => r.id).sort()).toEqual([1, sonHome(s)].sort());
    // zbytky jam po letech zmizí
    expect(abandonedVillageAt(state, DAY + 40 * 365).ruins).toEqual([]);
  });
});

describe('cesta na novou mapu', () => {
  it('dny cesty podle vzdálenosti ke kraji mapy, po stezce 1 den', () => {
    expect(travelDays(150, false)).toBe(1);
    expect(travelDays(401, false)).toBe(2);
    expect(travelDays(5000, false)).toBe(3);
    expect(travelDays(5000, true)).toBe(1);
  });

  it('vzdálenost ke kraji krajiny ve směru', () => {
    const l = makeLandscape({ size: 40 }); // 600 m, kraje ±300 m
    expect(edgeDistanceM(l, { x: 0, z: 0 }, 'N')).toBeCloseTo(300, 6);
    expect(edgeDistanceM(l, { x: 100, z: 0 }, 'E')).toBeCloseTo(200, 6);
    expect(edgeDistanceM(l, { x: 0, z: 0 }, 'NE')).toBeCloseTo(300 * Math.SQRT2, 6);
  });

  it('mřížka map: sousední políčko, směr mezi políčky a opačný směr', () => {
    expect(neighbourCell(SEAT_CELL, 'N')).toEqual({ x: 0, y: 1 });
    expect(neighbourCell({ x: 2, y: 3 }, 'SW')).toEqual({ x: 1, y: 2 });
    expect(directionBetween({ x: 0, y: 0 }, { x: 1, y: -1 })).toBe('SE');
    expect(directionBetween({ x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
    expect(OPPOSITE.NW).toBe('SE');
  });
});
