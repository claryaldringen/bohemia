import { describe, expect, it } from 'vitest';
import { dayIndexOf, foundVillage, type VillageState } from '@bohemia/game';
import { oreSitesField, oreSiteViews } from '../ore-site-view';

// Rudiště v pohledu na ves (crafts.md – Uhlí a ruda kováře – Co hráč vidí): ložisko, hromada,
// zásoba v kovárně, cesta, jámy u místa a kdo tu dnes pracuje.

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
      smithId: 50,
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
      { age: 41, smith: true, digs: true, carries: true, rides: false },
      { age: 15, smith: false, digs: true, carries: false, rides: false },
    ]);
    expect(site!.cart).toBe(true);
    // syn jede s vozem pro rudu sám (kovář kove)
    s.labor.shares = [{ activity: 'fetch', target, manDays: 0.07, ages: [15], carts: 1 }];
    expect(oreSiteViews(s, DAY)[0]!.workers).toEqual([
      { age: 15, smith: false, digs: false, carries: false, rides: true },
    ]);
    // rozdělení práce jiného dne – dnes nikdo
    expect(oreSiteViews(s, DAY + 1)[0]!.workers).toEqual([]);
  });

  it('kovárna bez rudiště a ves bez kovárny – pole v pohledu chybí', () => {
    const s = smithVillage();
    s.dwellings.find((d) => d.id === 50)!.workshop!.oreSite = null;
    expect(oreSiteViews(s, DAY)).toEqual([]);
    expect(oreSitesField(s, DAY)).toEqual({});
    expect(oreSitesField(smithVillage(), DAY).oreSites).toHaveLength(1);
  });
});
