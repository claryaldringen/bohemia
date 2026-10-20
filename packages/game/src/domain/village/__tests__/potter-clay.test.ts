import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { cartTripManDays, oreCartOffer } from '../cart-jobs';
import { newWorkshop, restingCrafters } from '../crafts';
import { CARTS, CART_JOBS, CLAY, CRAFT_BASE, CRAFT_PRODUCTION } from '../rules';
import { advanceVillage } from '../simulate';
import {
  basketManDaysPerKg,
  chooseDugSite,
  clayDigManDaysPerKg,
  potteryClayKg,
} from '../smith-supply';
import { NO_CRAFTS } from '../productivity';
import { summarizeVillage } from '../summary';
import type { Craft, Dwelling, LaborShare, Person, Position, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Hlína hrnčíře (crafts.md – Hlína hrnčíře; Martin 20. 10. 2026: „Ano, udělej to jak říkáš“ – návrh
// nových nákladů vozů, wagons.md – Co se vozí a na čem): hrnčíř kope hlínu na hliništi u potoka jako
// kovář rudu – nosí ji v koších, nebo ji odveze vůz se sedlákem; bez hlíny nepracuje.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
/** 10. 1. – žádná polní práce. */
const WINTER = at(601, 1, 10);
const POTTER = 52;
const POTTER_HEAD = 520;

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

/** Ves s plnou domácností dospělých (obydlí 1). */
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

/**
 * Dílna hrnčíře (52) s hrnčířem (36 let) a ženou; voda `waterM` m od dílny; palivo na dlouho
 * (vypálí se bez kácení), praxe vyučeného (učení řemesla jen u dílen se `skillTracked`).
 */
function withPotter(s: VillageState, waterM = 300): Dwelling {
  const potter = addWorkshop(s, 'potter', POTTER, { x: 40, z: 40, rotation: 0 });
  potter.workshop!.waterDistanceM = waterM;
  potter.workshop!.fuelKg = 5_000;
  s.people.push(person(POTTER_HEAD, 36, POTTER, s.lastDay, { sex: 'male' }));
  s.people.push(person(POTTER_HEAD + 1, 30, POTTER, s.lastDay, { sex: 'female' }));
  return potter;
}

/** Ohrada se spřežením a dvoukolák (vůz doma). */
function withCart(s: VillageState): VillageState {
  s.pens = [
    {
      id: 900,
      cell: { x: 8, y: 9 },
      x: -22.5,
      z: -7.5,
      builtDay: s.lastDay - 800,
      team: { readyDay: s.lastDay - 10 },
      training: null,
    },
  ];
  s.carts = [{ id: 1, kind: 'two-wheel', builtDay: s.lastDay - 10 }];
  return s;
}

const shares = (s: VillageState): LaborShare[] => s.labor?.shares ?? [];
const potterWorkshop = (s: VillageState): NonNullable<Dwelling['workshop']> =>
  s.dwellings.find((d) => d.id === POTTER)!.workshop!;

describe('hlína hrnčíře (crafts.md – Hlína hrnčíře)', () => {
  it('1,5 kg hlíny na kg keramiky; potřeba dne jde podle výkonu dílny podle praxe', () => {
    expect(potteryClayKg(2)).toBeCloseTo(
      (2 / CRAFT_PRODUCTION.potteryManDaysPerKg) * CLAY.kgPerPotteryKg,
      12,
    );
    // hrnčíř bez praxe (výkon 50 %) potřebuje za den polovinu hlíny
    expect(potteryClayKg(2, 0.5)).toBeCloseTo(potteryClayKg(2) / 2, 12);
    // kopání 300 kg za čd, s přirážkou za chůzi (+20 % na 300 m)
    expect(clayDigManDaysPerKg(300)).toBeCloseTo(1.2 / CLAY.kgPerManDay, 12);
  });

  it('hrnčíř bez hlíny ji jde kopat a nosit – keramiku dělá jen z hlíny, kterou má', () => {
    const s = village(WINTER - 1);
    withPotter(s, 300);
    potterWorkshop(s).clayKg = 0;
    const next = advanceVillage(s, WINTER, null);
    const workshop = potterWorkshop(next);
    const dig = shares(next).find((share) => share.activity === 'clay')!;
    expect(dig.target).toMatchObject({ kind: 'clay', id: POTTER });
    const carry = shares(next).find(
      (share) => share.activity === 'fetch' && share.target.kind === 'clay',
    )!;
    const dug = workshop.claySite!.minedKg;
    expect(dig.manDays).toBeCloseTo(dug * clayDigManDaysPerKg(300), 3);
    expect(carry.manDays).toBeCloseTo(dug * basketManDaysPerKg(300, CLAY.basketKg), 3);
    // keramika z donesené hlíny – spotřebovaná hlína zmizela ze zásoby
    expect(next.crafts!.potteryKg).toBeGreaterThan(0);
    // (keramika se den po výrobě trochu opotřebí – nádoby v užívání)
    expect(workshop.clayKg! + next.crafts!.potteryKg * CLAY.kgPerPotteryKg).toBeCloseTo(dug, 2);
    // jáma hlíny u hliniště
    expect(next.orePits).toHaveLength(1);
    expect(next.orePits![0]).toMatchObject({ smithId: POTTER, clay: true });
    expect(workshop.activity).toBe('producing');
  });

  it('hliniště je v mokřině u potoka nejblíž dílně, ne na rudišti kováře', () => {
    const s = village(WINTER);
    const potter = withPotter(s);
    const site = chooseDugSite(s, potter, WINTER, LANDSCAPE, 'clay')!;
    expect(site).not.toBeNull();
    expect(chooseDugSite(s, potter, WINTER, LANDSCAPE, 'clay')).toEqual(site);
    // kovář, který kope na stejném místě – hliniště jinde, aspoň 20 m od rudiště
    const smith = addWorkshop(s, 'smith', 53, { x: 41, z: 41, rotation: 0 });
    smith.workshop!.oreSite = { x: site.x, z: site.z, minedKg: 0, day: WINTER, walkM: 10 };
    const other = chooseDugSite(s, potter, WINTER, LANDSCAPE, 'clay')!;
    expect(Math.hypot(other.x - site.x, other.z - site.z)).toBeGreaterThanOrEqual(20 - 1e-6);
    // bez vody v okolí není kde kopat
    expect(chooseDugSite(s, potter, WINTER, makeLandscape({ size: 20 }), 'clay')).toBeNull();
  });

  it('bez hlíny a bez místa, kde ji kopat, hrnčíř pracuje se vsí – upozornění', () => {
    const s = village(WINTER);
    withPotter(s);
    potterWorkshop(s).clayKg = 0;
    potterWorkshop(s).claySite = null;
    expect(restingCrafters(s, WINTER, NO_CRAFTS).get(POTTER)).toBe('no-clay');
    const summary = summarizeVillage(s, WINTER);
    const clay = summary.crafts.workshops.find((w) => w.dwellingId === POTTER)!.clay!;
    expect(clay).toMatchObject({ stockKg: 0, site: null, heapKg: 0, cart: false });
  });

  it('dílna z doby před hlínou dostane zásobu na dávku – pracuje hned, hliniště až při kopání', () => {
    const s = village(WINTER - 1);
    withPotter(s);
    expect(potterWorkshop(s).clayKg).toBeUndefined();
    const next = advanceVillage(s, WINTER, null);
    expect(next.crafts!.potteryKg).toBeGreaterThan(0);
    expect(potterWorkshop(next).claySite).toBeUndefined();
    expect(potterWorkshop(next).clayKg).toBeGreaterThan(0);
  });
});

describe('vůz se sedlákem pro hlínu (crafts.md – Hlína hrnčíře, wagons.md – Co vozy vozí)', () => {
  it('s vozem kope na celý vůz – sedlák a hrnčíř pak dovezou hromadu od jámy', () => {
    let s = withCart(village(WINTER - 1));
    withPotter(s, 400);
    potterWorkshop(s).clayKg = 0;
    let haul: LaborShare | undefined;
    for (let day = WINTER; day < WINTER + 20 && !haul; day++) {
      s = advanceVillage(s, day, null);
      haul = shares(s).find((share) => share.activity === 'haul' && share.job === 'clay');
    }
    expect(haul).toBeDefined();
    expect(haul!.target).toMatchObject({ kind: 'clay', id: POTTER });
    const ride = shares(s).find(
      (share) => share.activity === 'fetch' && share.target.kind === 'clay' && share.carts === 1,
    )!;
    expect(ride.manDays).toBeCloseTo(haul!.manDays, 3);
    expect(potterWorkshop(s).claySite!.minedKg).toBeCloseTo(CARTS.loadKg['two-wheel'], 6);
  });

  it('vůz pro hlínu jako pro rudu – jízda obou proti nošení v koších po 25 kg', () => {
    const foot = basketManDaysPerKg(400, CLAY.basketKg);
    const offer = oreCartOffer({ costM: 400, x: 0, z: 0 }, foot, 'clay')!;
    const trip = cartTripManDays(400, CART_JOBS.clay.stopS, 1) / CARTS.loadKg['two-wheel'];
    expect(offer.manDaysPerKg).toBeCloseTo(trip, 12);
    expect(offer.riderManDaysPerKg).toBeCloseTo(trip, 12);
    expect(oreCartOffer({ costM: 400, x: 0, z: 0 }, trip, 'clay')).toBeNull();
  });
});
