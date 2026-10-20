import { describe, expect, it } from 'vitest';
import { dayIndexOf, foundVillage, type VillageState } from '@bohemia/game';
import { dugSitesField, dugSiteViews, type VillageDugSite } from '../ore-site-view';

const oreSiteViews = (s: VillageState, day: number): VillageDugSite[] =>
  dugSiteViews(s, day, 'ore');

// Rudiště a hliniště v pohledu na ves (crafts.md – Uhlí a ruda kováře – Co hráč vidí, Hlína
// hrnčíře): ložisko, hromada, zásoba v dílně, cesta, jámy u místa a kdo tu dnes pracuje.

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const born = (age: number): number => DAY - age * 365 - 30;

/** Ves s kovárnou (id 50): kovář 41 let a syn 15 let, rudiště v mokřině kus od kovárny. */
const smithVillage = (): VillageState => {
  const s = foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: -50, z: -50, rotation: 0 } });
  s.dwellings.push({
    id: 50,
    type: 'polozemnice',
    builtDay: DAY - 400,
    condition: 1,
    position: { x: 0, z: 0, rotation: 0 },
    workshop: {
      craft: 'smith',
      felling: null,
      fuelKg: 0,
      activity: 'digging',
      oreKg: 20.4,
      oreSite: { x: 30, z: -40, minedKg: 860.6, day: DAY - 100, walkM: 81.6 },
      oreBatch: { kg: 400, dug: 120, heap: 35.4, cart: false },
    },
  });
  s.people.push(
    { id: 900, bornDay: born(41), dwellingId: 50, sex: 'male' },
    { id: 901, bornDay: born(15), dwellingId: 50, sex: 'male', fatherId: 900 },
  );
  s.orePits = [
    { x: 31, z: -41, smithId: 50, kg: 400, day: DAY - 10 },
    { x: 26, z: -36, smithId: 50, kg: 460, day: DAY - 60 },
    // jáma vyčerpaného ložiska – 30 m od místa, k rudišti nepatří
    { x: 60, z: -40, smithId: 50, kg: 3000, day: DAY - 900 },
  ];
  return s;
};

describe('oreSiteViews', () => {
  it('ložisko, hromada, zásoba a cesta po celých; jámy jen u místa', () => {
    const [site] = oreSiteViews(smithVillage(), DAY);
    expect(site).toMatchObject({
      workshopId: 50,
      leftKg: 2139,
      depositKg: 3000,
      heapKg: 35,
      stockKg: 20,
      walkM: 82,
      pits: 2,
      workers: [],
      cart: false,
    });
  });

  it('kdo tu dnes pracuje: kovář první, syn s věkem; vůz se sedlákem – jen dnešní práce', () => {
    const s = smithVillage();
    const target = { kind: 'ore' as const, id: 50, x: 30, z: -40 };
    s.labor = {
      day: DAY,
      shares: [
        { activity: 'ore', target, manDays: 1.4, ages: [41, 15] },
        { activity: 'fetch', target, manDays: 0.3, ages: [41] },
        { activity: 'haul', target, manDays: 0.07, carts: 1, job: 'ore' },
        // jiná kovárna se nepočítá
        { activity: 'ore', target: { ...target, id: 51 }, manDays: 1, ages: [60] },
      ],
    };
    const [site] = oreSiteViews(s, DAY);
    expect(site!.workers).toEqual([
      { age: 41, craftsman: true, digs: true, carries: true, rides: false },
      { age: 15, craftsman: false, digs: true, carries: false, rides: false },
    ]);
    expect(site!.cart).toBe(true);
    // syn jede s vozem pro rudu sám (kovář kove)
    s.labor.shares = [{ activity: 'fetch', target, manDays: 0.07, ages: [15], carts: 1 }];
    expect(oreSiteViews(s, DAY)[0]!.workers).toEqual([
      { age: 15, craftsman: false, digs: false, carries: false, rides: true },
    ]);
    // rozdělení práce jiného dne – dnes nikdo
    expect(oreSiteViews(s, DAY + 1)[0]!.workers).toEqual([]);
  });

  it('kovárna bez rudiště a ves bez kovárny – pole v pohledu chybí', () => {
    const s = smithVillage();
    s.dwellings.find((d) => d.id === 50)!.workshop!.oreSite = null;
    expect(oreSiteViews(s, DAY)).toEqual([]);
    expect(dugSitesField(s, DAY)).toEqual({});
    expect(dugSitesField(smithVillage(), DAY).oreSites).toHaveLength(1);
    expect(dugSitesField(smithVillage(), DAY).claySites).toBeUndefined();
  });
});

describe('dugSiteViews – hliniště hrnčíře (crafts.md – Hlína hrnčíře)', () => {
  /** Ves s kovárnou a dílnou hrnčíře (id 60): hrnčíř 38 let a syn 16 let, hliniště u potoka. */
  const potterVillage = (): VillageState => {
    const s = smithVillage();
    s.dwellings.push({
      id: 60,
      type: 'polozemnice',
      builtDay: DAY - 400,
      condition: 1,
      position: { x: 40, z: 0, rotation: 0 },
      workshop: {
        craft: 'potter',
        felling: null,
        fuelKg: 0,
        activity: 'digging',
        clayKg: 142.4,
        claySite: { x: 70, z: -40, minedKg: 2540.2, day: DAY - 200, walkM: 120.4 },
        clayBatch: { kg: 400, dug: 400, heap: 260.2, cart: true, readyDay: DAY - 2 },
      },
    });
    s.people.push(
      { id: 910, bornDay: born(38), dwellingId: 60, sex: 'male' },
      { id: 911, bornDay: born(16), dwellingId: 60, sex: 'male', fatherId: 910 },
    );
    s.orePits!.push(
      { x: 71, z: -39, smithId: 60, kg: 400, day: DAY - 5, clay: true },
      { x: 66, z: -42, smithId: 60, kg: 1200, day: DAY - 90, clay: true },
      // jáma hlíny těsně u rudiště (jen pro test) – k rudišti nepatří
      { x: 32, z: -38, smithId: 60, kg: 300, day: DAY - 400, clay: true },
    );
    return s;
  };

  it('hliniště jako rudiště – ložisko 20 t, jen jámy hlíny, kdo kope a kdo jede s vozem', () => {
    const s = potterVillage();
    const target = { kind: 'clay' as const, id: 60, x: 70, z: -40 };
    s.labor = {
      day: DAY,
      shares: [
        { activity: 'clay', target, manDays: 0.8, ages: [16] },
        { activity: 'fetch', target, manDays: 0.1, ages: [38], carts: 1 },
        { activity: 'haul', target, manDays: 0.1, carts: 1, job: 'clay' },
        // rudiště kovárny se nepočítá
        { activity: 'ore', target: { kind: 'ore', id: 50, x: 30, z: -40 }, manDays: 1, ages: [41] },
      ],
    };
    const [site] = dugSiteViews(s, DAY, 'clay');
    expect(site).toMatchObject({
      workshopId: 60,
      leftKg: 17460,
      depositKg: 20000,
      heapKg: 260,
      stockKg: 142,
      walkM: 120,
      pits: 2,
      workers: [
        { age: 38, craftsman: true, digs: false, carries: false, rides: true },
        { age: 16, craftsman: false, digs: true, carries: false, rides: false },
      ],
      cart: true,
    });
    // rudiště kovárny jámy hlíny nepočítá
    expect(oreSiteViews(s, DAY)[0]!.pits).toBe(2);
    expect(dugSitesField(s, DAY).claySites).toHaveLength(1);
  });
});
