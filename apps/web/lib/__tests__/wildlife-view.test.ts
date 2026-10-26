import { describe, expect, it } from 'vitest';
import { dayIndexOf, foundVillage, withWildlife, type VillageState } from '@bohemia/game';
import { fieldDamageViews, huntView, wildlifeView } from '../wildlife-view';

// Hrubé stavy zvěře, lov a psi, škoda na dílech (wildlife.md – Co hráč vidí).

const DAY = dayIndexOf({ year: 600, month: 7, day: 10 });

function village(): VillageState {
  const s = foundVillage({ seed: 3, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  return withWildlife(s, null);
}

const level = (s: VillageState, species: string): number | undefined =>
  wildlifeView(s, DAY)?.species.find((x) => x.species === species)?.level;

describe('wildlifeView', () => {
  it('ves bez zvěře nemá údaj', () => {
    const s = foundVillage({ seed: 3, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    expect(wildlifeView(s, DAY)).toBeNull();
  });

  it('na stropu jsou tři stupně a nikdo není nad stropem', () => {
    const view = wildlifeView(village(), DAY)!;
    expect(view.species.map((x) => x.species)).toEqual([
      'boar',
      'deer',
      'hare',
      'wolf',
      'bear',
      'fox',
      'fish',
    ]);
    for (const x of view.species) {
      expect(x.level).toBe(3);
      expect(x.full).toBe(false);
    }
  });

  it('stupeň podle stavu ÷ strop (⅓, ⅔, nad stropem plno)', () => {
    const s = village();
    const w = s.wildlife!;
    const cap = w.deer.stags + w.deer.hinds + w.deer.calves;
    const scale = (k: number): void => {
      w.deer = { stags: w.deer.stags * k, hinds: w.deer.hinds * k, calves: w.deer.calves * k };
    };
    scale(0.3);
    expect(level(s, 'deer')).toBe(1);
    scale(0.5 / 0.3);
    expect(level(s, 'deer')).toBe(2);
    scale(1.5 / 0.5);
    expect(wildlifeView(s, DAY)!.species.find((x) => x.species === 'deer')!.full).toBe(true);
    scale(0);
    expect(level(s, 'deer')).toBe(0);
    expect(cap).toBeGreaterThan(0);
  });

  it('kapacita je celé číslo, škoda loni a strhnutý dobytek jen u svých druhů', () => {
    const s = village();
    s.wildlife!.damage = {
      fromDay: DAY - 40,
      risk: [],
      parts: {},
      topPartId: null,
      totalKg: 0,
      lastYearKg: 412.4,
    };
    s.wildlife!.predation = {
      acc: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      killDays: [DAY - 3, DAY - 1],
      yearHeads: { sheep: 2, goat: 0, pig: 1, cow: 0 },
    };
    const view = wildlifeView(s, DAY)!;
    const by = (id: string) => view.species.find((x) => x.species === id)!;
    expect(by('boar').lastYearDamageKg).toBe(412);
    expect(by('hare').lastYearDamageKg).toBeNull();
    expect(by('wolf').killedHeads).toBe(3);
    expect(by('deer').capacity).toBe(Math.round(by('deer').capacity));
    expect(view.wolvesTroubling).toBe(true);
  });

  it('vlci strhli kus před více než 30 dny – nic se nehlásí', () => {
    const s = village();
    s.wildlife!.predation = {
      acc: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      killDays: [DAY - 40, DAY - 1],
      yearHeads: { sheep: 2, goat: 0, pig: 0, cow: 0 },
    };
    expect(wildlifeView(s, DAY)!.wolvesTroubling).toBe(false);
  });

  it('psi bez obilí', () => {
    const s = village();
    s.wildlife!.dogs = { count: 4.6, fed: false };
    expect(wildlifeView(s, DAY)!.dogsUnfed).toBe(true);
    s.wildlife!.dogs = { count: 0.4, fed: false };
    expect(wildlifeView(s, DAY)!.dogsUnfed).toBe(false);
  });
});

describe('huntView', () => {
  it('bez psů a úlovku nic', () => {
    expect(huntView(village(), DAY)).toBeNull();
  });

  it('úlovky letos, maso a psi s obilím za den', () => {
    const s = village();
    s.wildlife!.hunt = {
      hope: { boar: 0, deer: 0, wolf: 0, bear: 0 },
      today: null,
      year: { boar: 2, deer: 1, wolves: 0, bear: 0, meatKg: 140, days: 3 },
    };
    s.wildlife!.smallGame = {
      today: null,
      year: { fishKg: 12.4, hares: 3.2, meatKg: 20, days: 5 },
    };
    s.wildlife!.dogs = { count: 6.4, fed: false };
    const hunt = huntView(s, DAY)!;
    expect(hunt.catches).toEqual([
      { icon: 'boar', name: 'Divoká prasata', count: 2 },
      { icon: 'deer', name: 'Jelení zvěř', count: 1 },
      { icon: 'hare', name: 'Zajíci', count: 3 },
      { icon: 'fish', name: 'Ryby (kg)', count: 12 },
    ]);
    expect(hunt.meatKg).toBe(160);
    expect(hunt.dogs).toMatchObject({ count: 6, fed: false, grainKgPerDay: 1.9 });
  });
});

describe('fieldDamageViews', () => {
  it('škoda letos po dílech a hlídka', () => {
    const s = village();
    s.wildlife!.damage = {
      fromDay: DAY - 40,
      risk: [
        { partId: 1, weightHa: 0.1, edgeM: 80.4 },
        { partId: 2, weightHa: 0.1, edgeM: 200 },
      ],
      parts: { '1': { share: 0.124, kg: 55.6 } },
      topPartId: 1,
      totalKg: 55.6,
    };
    s.wildlife!.watch = {
      fromDay: DAY - 40,
      parts: [{ partId: 1, ha: 1, threat: 0.2, free: 0.5, adult: false }],
      guards: { elders: 1, youngsters: 0 },
      wantedManDays: 0,
      paidManDays: 0,
    };
    const views = fieldDamageViews(s, DAY);
    expect(views.get(1)).toEqual({ percent: 12, kg: 56, edgeM: 80, watched: true });
    expect(views.get(2)).toEqual({ percent: 0, kg: 0, edgeM: 200, watched: false });
    expect(views.get(3)).toBeUndefined();
  });

  it('bez škod prázdná mapa', () => {
    expect(fieldDamageViews(village(), DAY).size).toBe(0);
  });
});
