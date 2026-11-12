import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../../calendar';
import { foundVillage } from '../../../core/actions';
import { advanceVillage } from '../../../core/simulate';
import { migrateVillage } from '../../../core/migrations';
import { cartTripManDays, stoneCartOffer, type CartDrives } from '../../../crafts/cart-jobs';
import { jobsDemand, stoneDemand } from '../../../core/simulate-hauls';
import {
  churchMaterials,
  churchQuarryLeft,
  churchWorkProgress,
  startChurch,
  withChurchQuarryDistance,
} from '../../../buildings/church-build';
import { defaultChurchDims } from '../../../buildings/church-geometry';
import { CARTS, CART_JOBS, MASON_CRAFTS } from '../../../rules';
import { STONE } from '../../../rules/rules-stone';
import type { Construction, LaborShare, Person, VillageState } from '../../../types';
import { withBuiltFirstDwelling } from '../../../__tests__/village-fixtures';
import {
  constructionStoneWork,
  investStoneWork,
  orderQuarrying,
  quarryManDaysPerM3,
  stoneCartLabor,
  stoneCartProgress,
  stoneCarryManDaysPerM3,
  stoneWorkNeed,
  type StoneCart,
} from '../quarry';

// Nošení kamene a vůz s kamenem (fortifications.md – Kámen, Nošení kamene a vůz; wagons.md – Co
// vozy vozí, bod 5).

const YEAR = 365;
/** Listopad – žádné setí ani sklizeň, vůz nemá jinou jízdu; lámání kostela běží i v zimě. */
const DAY = dayIndexOf({ year: 600, month: 11, day: 5 });

/** Ves s karolinskou hutí, lomem 300 m od kostela (0, 0) a muži navíc; `cart` = ohrada se spřežením a dvoukolák. */
function churchVillage(cart: boolean): VillageState {
  const base = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: -90, z: -90, rotation: 0 } }),
  );
  const home = base.dwellings[0]!.id;
  let id = base.nextId;
  const person = (extra: Partial<Person>): Person => ({
    id: id++,
    bornDay: DAY - 30 * YEAR,
    dwellingId: home,
    sex: 'male',
    faith: 'christian',
    ...extra,
  });
  const masters = MASON_CRAFTS.map((mason) => person({ mason }));
  const helpers = Array.from({ length: 4 }, () => person({}));
  const s: VillageState = {
    ...base,
    nextId: id,
    people: [...base.people, ...masters, ...helpers],
    storesKg: base.storesKg + 200000,
    meatKg: 20000,
    legumesKg: 20000,
    lodge: { circle: 'carolingian', invitedDay: DAY - 60 },
    quarries: [{ outcropId: 7, x: 300, z: 0, rotation: 0, builtDay: DAY - 10 }],
  };
  if (cart) {
    s.pens = [
      {
        id: 900,
        cell: { x: 8, y: 9 },
        x: -60,
        z: -60,
        builtDay: DAY - 800,
        team: { readyDay: DAY - 10 },
        training: null,
      },
    ];
    s.carts = [{ id: 1, kind: 'two-wheel', builtDay: DAY - 10 }];
  }
  const r = startChurch(s, s.lastDay, null, null, {
    type: 'rotunda',
    dims: defaultChurchDims('rotunda'),
    position: { x: 0, z: 0, rotation: 0 },
  });
  if (!r.ok) throw new Error(r.reason);
  const next = r.state;
  // příprava staveniště hotová – dnes se láme
  const c = church(next)!;
  c.done = c.church!.prepManDays;
  delete c.wood;
  return next;
}

const church = (s: VillageState): Construction | undefined =>
  s.constructions.find((c) => c.kind === 'church');

const shares = (s: VillageState, activity: LaborShare['activity']): LaborShare[] =>
  s.labor?.shares.filter((x) => x.activity === activity) ?? [];

describe('nošení kamene v nůších', () => {
  it('na m³ u lomu ≈ 0,14 čd, 100 m ≈ 0,6 čd, 300 m ≈ 1,5 čd navíc k lámání 1 čd', () => {
    expect(stoneCarryManDaysPerM3(0)).toBeCloseTo(0.14, 2);
    expect(stoneCarryManDaysPerM3(100)).toBeCloseTo(0.6, 2);
    expect(stoneCarryManDaysPerM3(300)).toBeCloseTo(1.53, 2);
    expect(quarryManDaysPerM3(300)).toBeCloseTo(STONE.quarryManDaysPerM3 + 1.53, 2);
  });
});

describe('vůz s kamenem – nabídka a postup', () => {
  const carry = stoneCarryManDaysPerM3(300);

  it('jede, když posádka stojí méně než nošení; u lomu ne', () => {
    const offer = stoneCartOffer({ costM: 288, x: 0, z: 0 }, carry)!;
    const loadM3 = CARTS.loadKg['two-wheel'] / STONE.carry.kgPerM3;
    expect(offer.loadM3).toBeCloseTo(0.16, 9);
    expect(offer.crewPerM3).toBeCloseTo(
      cartTripManDays(288, CART_JOBS.stone.stopS, CART_JOBS.stone.crew) / loadM3,
      9,
    );
    expect(offer.crewPerM3).toBeLessThan(carry);
    // nejvýš CARTS.loadsPerCartDay jízd za den
    expect(offer.maxM3).toBeCloseTo(loadM3 * CARTS.loadsPerCartDay, 9);
    // lom u stavby – naložení a složení vozu stojí víc než nošení
    expect(stoneCartOffer({ costM: 0, x: 0, z: 0 }, stoneCarryManDaysPerM3(0))).toBeNull();
    expect(stoneCartOffer(null, carry)).toBeNull();
  });

  it('uveze nejvýš to, co se ten den nalámalo, a nejvýš denní náklad; obrácená práce sedí', () => {
    const cart: StoneCart = {
      constructionId: 1,
      outcropId: 7,
      ...stoneCartOffer({ costM: 288, x: 0, z: 0 }, carry)!,
    };
    const b = STONE.quarryManDaysPerM3;
    // málo práce: všechno nalámané odveze vůz – práce = lámání + posádka
    const small = stoneCartProgress(0.5, 1, cart);
    expect(small.m3).toBeCloseTo(0.5 / (b + cart.crewPerM3), 9);
    expect(small.m3).toBeLessThanOrEqual(small.progress / (b + carry) + 1e-9);
    // hodně práce: vůz nejvýš maxM3, zbytek se nosí
    const big = stoneCartProgress(20, 1, cart);
    expect(big.m3).toBeCloseTo(cart.maxM3, 9);
    expect(big.progress).toBeCloseTo(20 + cart.maxM3 * (carry - cart.crewPerM3), 9);
    for (const progress of [0.3, 2, 20]) {
      const labor = stoneCartLabor(progress, 1, cart);
      expect(labor).toBeLessThan(progress);
      expect(stoneCartProgress(labor, 1, cart).progress).toBeCloseTo(progress, 9);
    }
    // podíl lámání v práci (hradba): vůz uveze nejvýš m³ nalámané z toho podílu
    const part = stoneCartProgress(2, 0.4, cart);
    expect(part.m3).toBeLessThanOrEqual((0.4 * part.progress) / (b + carry) + 1e-9);
    expect(stoneCartLabor(part.progress, 0.4, cart)).toBeCloseTo(2, 9);
  });
});

describe('vůz s kamenem v simulaci (kostel)', () => {
  it('stavba s vozem postoupí za stejnou práci víc; bez vozu nejede', () => {
    const withCart = advanceVillage(churchVillage(true), DAY + 5, null, null);
    const without = advanceVillage(churchVillage(false), DAY + 5, null, null);
    const quarried = (s: VillageState): number => church(s)!.church!.done.quarry ?? 0;
    expect(quarried(without)).toBeGreaterThan(0);
    expect(quarried(withCart)).toBeGreaterThan(quarried(without) + 0.5);
    // práce vsi na kostele stejná – lámání u lomu, posádka vozu, zbytek na staveništi
    const labor = (s: VillageState): number =>
      (s.labor?.shares ?? [])
        .filter((x) => x.construction === church(s)!.id)
        .reduce((sum, x) => sum + x.manDays, 0);
    expect(labor(withCart)).toBeCloseTo(labor(without), 2);
    // jízda vozu s kamenem jako ostatní jízdy vozu – cíl lom
    const haul = shares(withCart, 'haul').filter((x) => x.job === 'stone');
    expect(haul).toHaveLength(1);
    expect(haul[0]).toMatchObject({ target: { kind: 'quarry', id: 7 }, carts: 1 });
    expect(shares(without, 'haul').some((x) => x.job === 'stone')).toBe(false);
    // jízda z lomu ke kostelu se uložila u stavby
    expect(church(withCart)!.stoneCart).toEqual({ costM: 288, x: 0, z: 0 });
  });

  it('nejede bez volného vozu – jediný vůz má první stavba, zásoba se nosí; bez vozu nic', () => {
    const ordered = orderQuarrying(churchVillage(true), DAY, 7, 10);
    if (!ordered.ok) throw new Error(ordered.reason);
    const next = advanceVillage(ordered.state, DAY + 1, null, null);
    const stone = (s: VillageState): LaborShare[] =>
      shares(s, 'haul').filter((x) => x.job === 'stone');
    expect(stone(next)).toHaveLength(1);
    expect(stone(next)[0]!.construction).toBe(church(next)!.id);
    // zakázka do zásoby láme a nosí v nůších (vůz by se jí vyplatil – lom 400 m od dvorce)
    const order = next.constructions.find((c) => c.kind === 'quarrying')!;
    expect(order.done).toBeGreaterThan(0);
    expect(shares(next, 'quarry').some((x) => x.construction === order.id)).toBe(true);
    const noCart = structuredClone(ordered.state);
    delete noCart.carts;
    expect(stone(advanceVillage(noCart, DAY + 1, null, null))).toEqual([]);
  });

  it('zakázka do zásoby s vozem postoupí víc; jízda k hromadě u dvorce', () => {
    const order = (cart: boolean): VillageState => {
      const s = churchVillage(true);
      s.constructions = s.constructions.filter((c) => c.kind !== 'church');
      if (!cart) delete s.carts;
      const r = orderQuarrying(s, DAY, 7, 50);
      if (!r.ok) throw new Error(r.reason);
      return advanceVillage(r.state, DAY + 3, null, null);
    };
    const done = (s: VillageState): number =>
      s.constructions.find((c) => c.kind === 'quarrying')!.done;
    expect(done(order(true))).toBeGreaterThan(done(order(false)) + 0.5);
    expect(shares(order(true), 'haul').filter((x) => x.job === 'stone')).toHaveLength(1);
  });

  it('rozdělení práce dne: lámání u lomu, na staveništi bez lámání', () => {
    const next = advanceVillage(churchVillage(true), DAY + 1, null, null);
    const c = church(next)!;
    const quarry = shares(next, 'quarry');
    expect(quarry).toHaveLength(1);
    expect(quarry[0]).toMatchObject({ target: { kind: 'quarry', id: 7 }, construction: c.id });
    expect(quarry[0]!.manDays).toBeGreaterThan(0);
    for (const share of shares(next, 'build'))
      expect(share.churchWork ?? []).not.toContain('quarry');
  });

  it('vcelku = po kouscích s vozem', () => {
    const s = churchVillage(true);
    const to = DAY + 40;
    const whole = advanceVillage(s, to, null, null);
    let pieces = s;
    for (const end of [DAY + 1, DAY + 9, DAY + 23, to])
      pieces = advanceVillage(pieces, end, null, null);
    expect(pieces).toEqual(whole);
  });
});

describe('kámen hradby v práci úseků', () => {
  const fort = (): Construction => ({
    id: 5,
    kind: 'fortification',
    startedDay: DAY,
    cost: 300,
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    fortSegments: [
      { index: 0, cost: 150 },
      { index: 1, cost: 150 },
    ],
    fortStone: { outcropId: 7, m3: 40, distanceM: 300, at: { x: 0, z: 0 } },
  });
  const cart: StoneCart = {
    constructionId: 5,
    outcropId: 7,
    ...stoneCartOffer({ costM: 288, x: 0, z: 0 }, stoneCarryManDaysPerM3(300))!,
  };

  it('podíl lámání z kamene a ceny úseků; s vozem postoupí víc, potřeba sedí', () => {
    const work = constructionStoneWork(fort())!;
    expect(work.share).toBeCloseTo((40 * quarryManDaysPerM3(300)) / 300, 9);
    const plain = fort();
    const day = investStoneWork(plain, work, 10, false)!;
    expect(plain.done).toBe(10);
    expect(day.manDays).toBeCloseTo(10 * work.share, 9);
    expect(day.crew).toBe(0);
    const carted = fort();
    const withCart = investStoneWork(carted, work, 10, false, cart)!;
    expect(carted.done).toBeGreaterThan(10);
    expect(withCart.m3).toBeGreaterThan(0);
    expect(withCart.manDays + withCart.crew).toBeLessThan(10);
    // potřeba s vozem: přesně tolik práce stavbu dokončí
    const last = fort();
    last.done = 290;
    const need = stoneWorkNeed(last, constructionStoneWork(last)!, cart);
    expect(need).toBeLessThan(10);
    investStoneWork(last, constructionStoneWork(last)!, need, false, cart);
    expect(last.done).toBeCloseTo(300, 9);
  });
});

describe('převod staveniště kostela (church-quarry-carry)', () => {
  it('lámání se přecení na lámání a nošení, dodaný kámen zůstane; jednou', () => {
    const s = churchVillage(false);
    const c = church(s)!;
    const site = c.church!;
    // staveniště ze starší vsi: příplatek za vzdálenost, část lámání hotová
    const legacy: Record<string, unknown> = {
      ...site,
      quarryManDaysPerM3: 1.2,
      done: { quarry: 100 },
    };
    delete legacy.quarryDistanceM;
    const old: VillageState = {
      ...s,
      constructions: s.constructions.map((k) =>
        k.id === c.id
          ? ({ ...k, done: k.done + 100, church: legacy } as unknown as Construction)
          : k,
      ),
    };
    // celé lámání staveniště za nové ceny; za staré bylo × 1,2 ÷ (1 + nošení 300 m)
    const fresh = churchQuarryLeft({ ...site, done: {} });
    const oldTotal = (fresh / quarryManDaysPerM3(300)) * 1.2;
    const next = withChurchQuarryDistance(old);
    const migrated = church(next)!;
    expect(migrated.church!.quarryDistanceM).toBeCloseTo(300, 9);
    expect('quarryManDaysPerM3' in migrated.church!).toBe(false);
    const factor = quarryManDaysPerM3(300) / 1.2;
    expect(migrated.church!.done.quarry).toBeCloseTo(100 * factor, 9);
    expect(migrated.done).toBeCloseTo(c.done + 100 * factor, 9);
    expect(migrated.cost).toBeCloseTo(c.cost + fresh - oldTotal, 9);
    // dodaný kámen jako před převodem – podíl hotového lámání se nemění
    expect(churchWorkProgress(migrated.church!).quarry).toBeCloseTo(100 / oldTotal, 9);
    expect(churchMaterials(migrated.church!).stoneM3).toBeGreaterThan(0);
    // jednou a idempotentně – i v seznamu převodů
    expect(withChurchQuarryDistance(next)).toBe(next);
    const ctx = { obstacles: null, landscape: null };
    expect(church(migrateVillage(old, ctx))!.church).toEqual(migrated.church);
    expect(withChurchQuarryDistance(s)).toBe(s);
  });
});

describe('vůz s kamenem – vyjeté cesty a poptávka po vozech', () => {
  const withRoads = (s: VillageState): VillageState => {
    s.roads = { nextId: 1, roads: [], trees: [], labor: { from: DAY, days: 0, shares: [] } };
    return s;
  };

  it('jízdy kamene se zapíšou do ročního provozu cest po trase lom – stavba', () => {
    const start = withRoads(churchVillage(true));
    const next = advanceVillage(start, DAY + 1, null, null);
    const days = next.lastDay - start.lastDay;
    const day = next.labor!.shares.filter((x) => x.job === 'stone' && x.activity === 'haul');
    expect(day).toHaveLength(1);
    const trips = next.roads!.labor.cart ?? [];
    expect(trips).toHaveLength(1);
    // konec uložené trasy stavby, dvoukolák; jízd tolik, kolik kamene vůz uvezl (náklad 0,16 m³)
    expect(trips[0]).toMatchObject({ x: 0, z: 0, kind: 'two-wheel' });
    const m3 = next.labor!.shares.find((x) => x.activity === 'quarry')!;
    expect(m3).toBeDefined();
    expect(trips[0]!.trips).toBeGreaterThan(0);
    expect(trips[0]!.trips).toBeLessThanOrEqual(CARTS.loadsPerCartDay * days + 1e-9);
    // bez vozu se nezapíše nic
    const without = advanceVillage(withRoads(churchVillage(false)), DAY + 1, null, null);
    expect(without.roads!.labor.cart ?? []).toEqual([]);
  });

  const drives: CartDrives = (_s, goals) => goals.map(() => ({ costM: 288, x: 0, z: 0 }));

  it('poptávka: rozestavěný kostel s lomem chce vůz, ves bez lomu nic', () => {
    const s = churchVillage(true);
    const loadM3 = CARTS.loadKg['two-wheel'] / STONE.carry.kgPerM3;
    const offer = stoneCartOffer({ costM: 288, x: 0, z: 0 }, stoneCarryManDaysPerM3(300))!;
    const demand = stoneDemand(s, () => drives);
    expect(demand).toHaveLength(1);
    expect(demand[0]).toBeCloseTo(
      (offer.carryPerM3 - offer.crewPerM3) * loadM3 * CARTS.loadsPerCartDay,
      6,
    );
    expect(demand[0]).toBeGreaterThan(0);
    expect(church(s)!.stoneCart).toEqual({ costM: 288, x: 0, z: 0 });
    // stejný výsledek v celkové poptávce jízd
    const all = jobsDemand(churchVillage(true), {
      landscape: null,
      deliveries: [],
      drives: () => drives,
      water: [],
    });
    expect(all).toEqual(demand);
    // bez lomu
    const none = churchVillage(true);
    none.quarries = [];
    expect(stoneDemand(none, () => drives)).toEqual([]);
    // příliš dlouhá jízda – vůz se nevyplatí
    const near = churchVillage(true);
    expect(stoneDemand(near, () => () => [{ costM: 1e6, x: 0, z: 0 }])).toEqual([]);
  });
});
