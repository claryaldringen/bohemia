import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstacleId, packObstacles, type ObstaclePlacement } from '../../landscape';
import { foundVillage } from '../actions';
import { cartTripManDays, oreCartOffer } from '../cart-jobs';
import { homeKilnCenter } from '../charcoal';
import { newWorkshop } from '../crafts';
import { PATH_FOREST, PATH_WETLAND } from '../paths/terrain';
import { groundSpots, walkGroundOf } from '../paths/walking';
import { CARTS, CART_JOBS, CHARCOAL_KILN, CRAFT_BASE, DUG_SITE_VIEW, SMITH_SUPPLY } from '../rules';
import { advanceVillage } from '../simulate';
import {
  basketManDaysPerKg,
  chooseDugSite,
  chooseOreSite,
  footOreBatchKg,
  forgeOreKg,
  openOrePit,
  orePitOvergrowth,
  smithSons,
  updateOrePits,
  workOre,
} from '../smith-supply';
import type { Craft, Dwelling, LaborShare, Person, Position, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Uhlí a ruda kováře (crafts.md – Uhlí a ruda kováře; Martin 20. 10. 2026): uhlí z milíře nosí
// synové kováře od 10 let (ten den nepasou) nebo kovář sám, s vozem ho přiveze sedlák; rudu kope
// kovář a synové od 14 let na rudišti v mokřině u potoka, bez rudy kovář nekove.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
/** 10. 1. – žádná polní práce, uhlíř nesází; stáda: v zimě se pasou jen prasata. */
const WINTER = at(601, 1, 10);
/** 10. 6. – pasou se ovce. */
const SUMMER = at(601, 6, 10);
const BURNER = 50;
const SMITH = 51;
/** Kovář, jeho žena a synové (id). */
const SMITH_HEAD = 510;

const person = (
  id: number,
  years: number,
  dwellingId: number,
  day: number,
  extra: Partial<Person> = {},
): Person => ({ id, bornDay: day - Math.ceil(years * YEAR) - 10, dwellingId, ...extra });

function addWorkshop(s: VillageState, craft: Craft, id: number, position: Position): Dwelling {
  const dwelling: Dwelling = {
    id,
    type: CRAFT_BASE[craft],
    builtDay: s.lastDay,
    condition: 1,
    position: { ...position },
    workshop: newWorkshop(craft),
  };
  s.dwellings.push(dwelling);
  return dwelling;
}

/** Ves s plnou domácností dospělých (obydlí 1), bez dětí – pasou jen synové kováře. */
function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [25, 25, 20, 19].map((age, i) =>
    person(2 + i, age, 1, day, { sex: i % 2 === 0 ? 'male' : 'female' }),
  );
  s.constructions = [];
  s.storesKg = 5_000;
  s.lastDay = day;
  s.nextId = 1000;
  s.crafts = { charcoalKg: 0, toolsKg: 0, potteryKg: 0 };
  return s;
}

/** Uhlíř (50) 40 m od kovárny s vypáleným milířem – dnes vytahá uhlí pro kováře. */
function withBurner(s: VillageState, stage: 'draw' | 'burn' = 'draw'): VillageState {
  addWorkshop(s, 'burner', BURNER, { x: 40, z: 0, rotation: 0 });
  s.people.push(person(500, 30, BURNER, s.lastDay, { sex: 'male' }));
  s.people.push(person(501, 28, BURNER, s.lastDay, { sex: 'female' }));
  s.dwellings.find((d) => d.id === BURNER)!.workshop!.kiln = {
    site: null,
    trees: Array.from({ length: CHARCOAL_KILN.trees }, () => ({ id: null, cost: 2 })),
    stage,
    prepared: CHARCOAL_KILN.trees,
    done: 0,
    ...(stage === 'draw' ? { charcoalKg: CHARCOAL_KILN.trees * 120 } : {}),
  };
  return s;
}

/** Kovárna (51) s kovářem (36 let), ženou a syny daného věku; voda `waterM` m od dílny. */
function withSmith(s: VillageState, sons: number[] = [], waterM = 80): Dwelling {
  const smith = addWorkshop(s, 'smith', SMITH, { x: 40, z: 40, rotation: 0 });
  smith.workshop!.waterDistanceM = waterM;
  s.people.push(person(SMITH_HEAD, 36, SMITH, s.lastDay, { sex: 'male' }));
  s.people.push(person(SMITH_HEAD + 1, 30, SMITH, s.lastDay, { sex: 'female' }));
  sons.forEach((age, k) =>
    s.people.push(
      person(SMITH_HEAD + 2 + k, age, SMITH, s.lastDay, {
        sex: 'male',
        fatherId: SMITH_HEAD,
        motherId: SMITH_HEAD + 1,
      }),
    ),
  );
  return smith;
}

/** Ohrada se spřežením a dvoukolák (vůz doma). */
function withCart(s: VillageState, pen = { x: -22.5, z: -7.5 }): VillageState {
  s.pens = [
    {
      id: 900,
      cell: { x: 8, y: 9 },
      x: pen.x,
      z: pen.z,
      builtDay: s.lastDay - 800,
      team: { readyDay: s.lastDay - 10 },
      training: null,
    },
  ];
  s.carts = [{ id: 1, kind: 'two-wheel', builtDay: s.lastDay - 10 }];
  return s;
}

const shares = (s: VillageState): LaborShare[] => s.labor?.shares ?? [];
const fetches = (s: VillageState): LaborShare[] =>
  shares(s).filter((share) => share.activity === 'fetch');
const smithWorkshop = (s: VillageState): NonNullable<Dwelling['workshop']> =>
  s.dwellings.find((d) => d.id === SMITH)!.workshop!;

describe('synové kováře (crafts.md – Uhlí a ruda kováře)', () => {
  it('synové jsou chlapci domácnosti, jejichž rodič v ní bydlí – od nejstaršího', () => {
    const s = village(WINTER);
    withSmith(s, [11, 15]);
    // dcera a chlapec bez rodiče v domě synové nejsou
    s.people.push(person(530, 12, SMITH, WINTER, { sex: 'female', fatherId: SMITH_HEAD }));
    s.people.push(person(531, 12, SMITH, WINTER, { sex: 'male' }));
    expect(smithSons(s, SMITH, WINTER).map((son) => son.age)).toEqual([15, 11]);
  });

  it('syn 10–13 nosí uhlí a ten den nepase; od 14 let kope rudu', () => {
    const run = (stage: 'draw' | 'burn'): VillageState => {
      const s = withBurner(village(SUMMER - 1), stage);
      withSmith(s, [15, 11]);
      s.livestock!.herds.sheep = 300;
      // bez rudy – kovář s nejstarším synem jdou kopat
      smithWorkshop(s).oreKg = 0;
      return advanceVillage(s, SUMMER, null);
    };
    const drawDay = run('draw');
    const charcoal = fetches(drawDay).filter((share) => share.target.kind === 'kiln');
    expect(charcoal.length).toBeGreaterThan(0);
    expect(charcoal[0]!.target).toMatchObject({ kind: 'kiln', id: BURNER, from: SMITH });
    expect(charcoal[0]!.ages).toEqual([11]);
    // syn, který nosí, nepase (jiné výrostky ves nemá)
    expect(drawDay.labor!.herders?.children).toBe(0);
    expect(run('burn').labor!.herders?.children).toBe(1);
    // rudu kope syn od 14 let (a kovář), mladší syn ne
    const ore = shares(drawDay).find((share) => share.activity === 'ore')!;
    expect(ore.target).toMatchObject({ kind: 'ore', id: SMITH });
    expect(ore.ages).toContain(15);
    expect(ore.ages).not.toContain(11);
  });

  it('bez synů nosí uhlí kovář sám – z práce dílny, kove méně', () => {
    const run = (sons: number[]): VillageState => {
      const s = withBurner(village(WINTER - 1));
      withSmith(s, sons);
      return advanceVillage(s, WINTER, null);
    };
    const alone = run([]);
    const helped = run([11]);
    const own = fetches(alone).filter((share) => share.target.kind === 'kiln');
    expect(own.map((share) => share.ages)).toEqual([[36]]);
    const forged = (s: VillageState): number =>
      shares(s).find(
        (share) =>
          share.activity === 'craft' &&
          share.target.kind === 'dwelling' &&
          share.target.id === SMITH,
      )?.manDays ?? 0;
    expect(forged(alone)).toBeLessThan(forged(helped));
    expect(forged(helped) - forged(alone)).toBeCloseTo(own[0]!.manDays, 3);
    // nošení podle vzdálenosti chůze kovárna ↔ milíř u dílny uhlíře (bez krajiny vzdušně)
    const kiln = alone.dwellings.find((d) => d.id === BURNER)!.workshop!.kiln!;
    const at = homeKilnCenter({ x: 40, z: 0, rotation: 0 });
    expect(kiln.carry!.smithId).toBe(SMITH);
    expect(kiln.carry!.walkM).toBeCloseTo(Math.hypot(at.x - 40, at.z - 40), 2);
  });
});

describe('ruda a rudiště (crafts.md – Uhlí a ruda kováře)', () => {
  it('rudiště je v mokřině u potoka nejblíž kovárně – deterministicky', () => {
    const s = village(WINTER);
    const smith = withSmith(s);
    smith.position = { x: 0, z: 0, rotation: 0 };
    const site = chooseOreSite(s, smith, WINTER, LANDSCAPE)!;
    const wet = groundSpots(walkGroundOf(LANDSCAPE), PATH_WETLAND);
    expect(wet.some((p) => p.x === site.x && p.z === site.z)).toBe(true);
    // potok leží z ∈ (75, 90) – mokřina těsně u něj ze strany vsi
    expect(site.z).toBeGreaterThan(55);
    expect(site.z).toBeLessThan(76);
    expect(site.walkM).toBeGreaterThanOrEqual(Math.hypot(site.x, site.z) - 1e-6);
    expect(chooseOreSite(s, smith, WINTER, LANDSCAPE)).toEqual(site);
    // žádná mokřina blíž
    const nearest = Math.min(...wet.map((p) => Math.hypot(p.x, p.z)));
    expect(Math.hypot(site.x, site.z)).toBeCloseTo(nearest, 9);
    // bez krajiny místo ve vzdálenosti dílny k vodě
    const plain = chooseOreSite(
      s,
      { ...smith, workshop: { ...smith.workshop!, waterDistanceM: 120 } },
      WINTER,
      null,
    )!;
    expect(plain.walkM).toBe(120);
  });

  it('po 3 t rudy kovář vybere další místo aspoň 20 m od vyčerpaného', () => {
    const s = village(WINTER);
    const smith = withSmith(s);
    smith.position = { x: 0, z: 0, rotation: 0 };
    const first = chooseOreSite(s, smith, WINTER, LANDSCAPE)!;
    const workshop = smith.workshop!;
    workshop.oreSite = { ...first, minedKg: SMITH_SUPPLY.depositKg };
    workshop.oreKg = 0;
    workOre(s, smith, 1.5, WINTER, { landscape: LANDSCAPE, batchDays: 30 });
    const next = workshop.oreSite!;
    expect(workshop.oreSitesUsed).toEqual([{ x: first.x, z: first.z }]);
    expect(Math.hypot(next.x - first.x, next.z - first.z)).toBeGreaterThanOrEqual(
      SMITH_SUPPLY.siteSpacingM,
    );
    expect(next.minedKg).toBeGreaterThan(0);
    // bez mokřiny i vody nic – kovář nemá kde kopat
    expect(chooseOreSite(s, smith, WINTER, makeLandscape({ size: 20 }))).toBeNull();
  });

  it('jámy zarůstají a po SMITH_SUPPLY.pitYears zmizí', () => {
    const s = village(WINTER);
    const site = { x: 10, z: 70, minedKg: 0, day: WINTER, walkM: 70 };
    const pit = openOrePit(s, SMITH, site, WINTER);
    expect(Math.hypot(pit.x - site.x, pit.z - site.z)).toBeLessThanOrEqual(
      SMITH_SUPPLY.pitSpreadM + 0.01,
    );
    // deterministicky ze seedu
    const again = village(WINTER);
    expect(openOrePit(again, SMITH, site, WINTER)).toEqual(pit);
    const years = SMITH_SUPPLY.pitYears * 365;
    expect(orePitOvergrowth(pit, WINTER)).toBe(0);
    expect(orePitOvergrowth(pit, WINTER + years / 2)).toBeCloseTo(0.5, 9);
    updateOrePits(s, WINTER + years - 1);
    expect(s.orePits).toHaveLength(1);
    updateOrePits(s, WINTER + years);
    expect(s.orePits).toBeUndefined();
  });

  it('kovář bez rudy nekove – bez místa ke kopání odpočívá (no-ore)', () => {
    const s = village(WINTER - 1);
    withSmith(s);
    s.crafts = { charcoalKg: 1_000, toolsKg: 0, potteryKg: 0 };
    smithWorkshop(s).oreKg = 0;
    smithWorkshop(s).oreSite = null;
    const next = advanceVillage(s, WINTER + 3, null);
    expect(next.crafts!.toolsKg).toBe(0);
    expect(smithWorkshop(next).activity).toBe('no-ore');
  });

  it('dávka rudy pěšky na 30 dní kování: kope, nosí v koších a kove z ní', () => {
    const s = village(WINTER - 1);
    withSmith(s, [], 300);
    s.crafts = { charcoalKg: 1_000, toolsKg: 0, potteryKg: 0 };
    smithWorkshop(s).oreKg = 0;
    const next = advanceVillage(s, WINTER, null);
    const workshop = smithWorkshop(next);
    expect(workshop.oreSite!.walkM).toBe(300);
    const ore = shares(next).find((share) => share.activity === 'ore')!;
    const carry = fetches(next).find((share) => share.target.kind === 'ore')!;
    expect(carry.ages).toEqual([36]);
    const batch = footOreBatchKg(1.7, 30);
    expect(batch).toBeGreaterThan(SMITH_SUPPLY.basketKg.ore);
    // kopání s přirážkou za chůzi (+20 % na 300 m), nošení v koších po 25 kg
    const dug = workshop.oreSite!.minedKg;
    expect(ore.manDays).toBeCloseTo((dug / 60) * 1.2, 2);
    expect(carry.manDays).toBeCloseTo(dug * basketManDaysPerKg(300, 25), 2);
    expect(next.crafts!.toolsKg).toBeGreaterThan(0);
    // jáma u rudiště
    expect(next.orePits).toHaveLength(1);
    expect(next.orePits![0]!.kg).toBeCloseTo(dug, 6);
  });
});

describe('rudiště a hliniště na očích (crafts.md – Rudiště a hliniště na očích)', () => {
  const ground = walkGroundOf(LANDSCAPE);
  const t = ground.terrain;
  const flagAt = (p: { x: number; z: number }): number =>
    t.flags[
      Math.round((p.z - t.originZ) / t.cellM) * t.width + Math.round((p.x - t.originX) / t.cellM)
    ]!;
  const wet = groundSpots(ground, PATH_WETLAND);
  /** Nejbližší mokřina (vzdušnou čarou) – kde se kopalo dřív. */
  const nearestWet = (from: { x: number; z: number }): { x: number; z: number; d: number } =>
    wet
      .map((p) => ({ ...p, d: Math.hypot(p.x - from.x, p.z - from.z) }))
      .reduce((a, b) => (b.d < a.d ? b : a));
  /** Dospělý strom vrstvy překážek (id ze zdroje osamělých stromů). */
  const tree = (id: number, x: number, z: number): ObstaclePlacement => ({
    id: obstacleId('meadowTree', id),
    kind: 'tree',
    look: 'oak-1',
    x,
    z,
    rotation: 0,
    scale: 1,
  });

  it('kovárna v lese: rudiště v mokřině mimo les, nejvýš o polovinu dál než nejbližší', () => {
    const s = village(WINTER);
    const smith = withSmith(s);
    // les je pro x < −90 (pathLandscape) – kovárna uprostřed něj
    smith.position = { x: -120, z: 0, rotation: 0 };
    const closest = nearestWet(smith.position);
    expect(flagAt(closest) & PATH_FOREST).toBeTruthy();
    const site = chooseOreSite(s, smith, WINTER, LANDSCAPE)!;
    expect(flagAt(site) & PATH_WETLAND).toBeTruthy();
    expect(flagAt(site) & PATH_FOREST).toBe(0);
    const d = Math.hypot(site.x + 120, site.z);
    expect(d).toBeGreaterThan(closest.d);
    expect(d).toBeLessThanOrEqual(
      Math.max(closest.d * DUG_SITE_VIEW.openFarther, closest.d + DUG_SITE_VIEW.openSlackM) + 1e-9,
    );
    // deterministicky; hliniště hrnčíře podle stejného pravidla
    expect(chooseOreSite(s, smith, WINTER, LANDSCAPE)).toEqual(site);
    const potter = addWorkshop(s, 'potter', 52, { x: -120, z: -10, rotation: 0 });
    const clay = chooseDugSite(s, potter, WINTER, LANDSCAPE, 'clay')!;
    expect(flagAt(clay) & PATH_FOREST).toBe(0);
    // už vybrané rudiště v lese (starší ves) zůstane – kope se tam dál
    const workshop = smith.workshop!;
    workshop.oreSite = { x: closest.x, z: closest.z, minedKg: 0, day: WINTER - 30, walkM: 64 };
    workshop.oreKg = 0;
    workOre(s, smith, 1.5, WINTER, { landscape: LANDSCAPE, batchDays: 30 });
    expect(workshop.oreSite).toMatchObject({ x: closest.x, z: closest.z });
    expect(workshop.oreSite.minedKg).toBeGreaterThan(0);
  });

  it('pod korunou stromu se nekope – jen když pokácený strom zbyl pařezem', () => {
    const s = village(WINTER);
    const smith = withSmith(s);
    smith.position = { x: 0, z: 0, rotation: 0 };
    const open = chooseOreSite(s, smith, WINTER, LANDSCAPE)!;
    const oak = tree(1, open.x + 2, open.z);
    const layer = packObstacles([oak], LANDSCAPE.size, LANDSCAPE.cellSizeM);
    const site = chooseOreSite(s, smith, WINTER, LANDSCAPE, layer)!;
    expect(flagAt(site) & PATH_WETLAND).toBeTruthy();
    expect(Math.hypot(site.x - oak.x, site.z - oak.z)).toBeGreaterThanOrEqual(
      DUG_SITE_VIEW.treeClearM,
    );
    expect(Math.hypot(site.x, site.z)).toBeGreaterThan(Math.hypot(open.x, open.z));
    // strom pokácený – stojí pařez, místo je zase vidět
    s.felledTrees = [{ id: oak.id, day: WINTER - 10 }];
    expect(chooseOreSite(s, smith, WINTER, LANDSCAPE, layer)).toEqual(open);
  });

  it('stromy všude kolem potoka – kope se u nejbližší mokřiny jako dřív', () => {
    const s = village(WINTER);
    const smith = withSmith(s);
    smith.position = { x: 0, z: 0, rotation: 0 };
    // hustý břehový porost po celé délce potoka (po 6 m) – volné místo nikde
    const trees: ObstaclePlacement[] = [];
    for (let k = 0; k < 51; k++) {
      for (let r = 0; r < 10; r++) trees.push(tree(k * 10 + r, -150 + k * 6, 50 + r * 6));
    }
    const layer = packObstacles(trees, LANDSCAPE.size, LANDSCAPE.cellSizeM);
    const site = chooseOreSite(s, smith, WINTER, LANDSCAPE, layer)!;
    const closest = nearestWet(smith.position);
    expect(site).toMatchObject({ x: closest.x, z: closest.z });
  });
});

describe('vůz se sedlákem pro rudu (crafts.md – Uhlí a ruda kováře, wagons.md – Co vozy vozí)', () => {
  it('s vozem kope na celý vůz – sedlák a kovář pak dovezou hromadu od jámy', () => {
    let s = withCart(village(WINTER - 1));
    withSmith(s, [], 300);
    s.crafts = { charcoalKg: 5_000, toolsKg: 0, potteryKg: 0 };
    smithWorkshop(s).oreKg = 0;
    let haul: LaborShare | undefined;
    let ride: LaborShare | undefined;
    for (let day = WINTER; day < WINTER + 20 && !haul; day++) {
      s = advanceVillage(s, day, null);
      haul = shares(s).find((share) => share.activity === 'haul' && share.job === 'ore');
      ride = fetches(s).find((share) => share.carts === 1);
    }
    expect(haul).toBeDefined();
    expect(haul!.target).toMatchObject({ kind: 'ore', id: SMITH });
    // kovář jede s vozem – stejně práce jako sedlák
    expect(ride!.manDays).toBeCloseTo(haul!.manDays, 3);
    expect(smithWorkshop(s).oreSite!.minedKg).toBeCloseTo(CARTS.loadKg['two-wheel'], 6);
    // dovezená ruda je u kovárny (kovář z ní hned kove)
    expect(smithWorkshop(s).oreKg).toBeGreaterThan(CARTS.loadKg['two-wheel'] * 0.9);
  });

  it('na celý vůz kope dřív – dokud má rudu na kopání a pár dní kování, hromada počká na vůz', () => {
    const setup = (): { s: VillageState; smith: Dwelling; need: number } => {
      const s = village(WINTER);
      const smith = withSmith(s, [], 300);
      smith.workshop!.oreSite = { x: 340, z: 40, minedKg: 0, day: WINTER, walkM: 300 };
      const need = forgeOreKg(1.5);
      smith.workshop!.oreKg = need * 10;
      return { s, smith, need };
    };
    const withCartBatch = setup();
    workOre(withCartBatch.s, withCartBatch.smith, 1.5, WINTER, {
      landscape: null,
      batchDays: 30,
      cartBatch: () => CARTS.loadKg['two-wheel'],
    });
    const batch = withCartBatch.smith.workshop!.oreBatch!;
    expect(batch).toMatchObject({ kg: CARTS.loadKg['two-wheel'], cart: true });
    // vykopaná ruda leží na hromadě u jámy, zásoba v kovárně zůstala
    expect(batch.heap).toBeCloseTo(batch.dug, 9);
    expect(withCartBatch.smith.workshop!.oreKg).toBeCloseTo(withCartBatch.need * 10, 9);
    // bez vozu se kope, až ruda dojde
    const plain = setup();
    workOre(plain.s, plain.smith, 1.5, WINTER, { landscape: null, batchDays: 30 });
    expect(plain.smith.workshop!.oreBatch ?? null).toBeNull();
  });

  it('vůz se nevezme, když jízda neušetří práci proti nošení v koších', () => {
    const footNear = basketManDaysPerKg(20, SMITH_SUPPLY.basketKg.ore);
    const near = oreCartOffer({ costM: 80, x: 0, z: 0 }, footNear)!;
    expect(near).not.toBeNull();
    const trip = cartTripManDays(80, CART_JOBS.ore.stopS, 1) / CARTS.loadKg['two-wheel'];
    expect(near.manDaysPerKg).toBeCloseTo(trip, 12);
    expect(near.riderManDaysPerKg).toBeCloseTo(trip, 12);
    expect(oreCartOffer({ costM: 1_100, x: 0, z: 0 }, footNear)).toBeNull();
    expect(oreCartOffer(null, footNear)).toBeNull();
  });
});

describe('převod a ves bez kováře (crafts.md – Uhlí a ruda kováře, Starší vsi)', () => {
  it('kovárna z doby před rudou dostane zásobu na dávku – kove hned, rudiště až při kopání', () => {
    const s = village(WINTER - 1);
    withSmith(s);
    s.crafts = { charcoalKg: 1_000, toolsKg: 0, potteryKg: 0 };
    expect(smithWorkshop(s).oreKg).toBeUndefined();
    const next = advanceVillage(s, WINTER, null);
    const workshop = smithWorkshop(next);
    expect(workshop.oreKg).toBeGreaterThan(0);
    expect(workshop.oreSite).toBeUndefined();
    expect(next.crafts!.toolsKg).toBeGreaterThan(0);
    expect(shares(next).some((share) => share.activity === 'ore')).toBe(false);
  });
});
