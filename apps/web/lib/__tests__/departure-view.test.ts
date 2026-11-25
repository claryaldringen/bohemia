import { departVillage, type VillageState } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import { foundVillage, makeLandscapeForTests, withBuiltFirstDwelling } from './departure-fixtures';
import {
  journeyView,
  leaveOptions,
  ownMapsAround,
  ownVillageThere,
  villageAbandonment,
} from '../departure-view';

// Odchod do nové vsi v pohledu na ves (migration.md – fáze 3 a 4).

describe('ownMapsAround', () => {
  const settlements = [
    { id: 'seat', isSeat: true, worldCell: null },
    { id: 'north', isSeat: false, worldCell: { x: 0, y: 1 } },
    { id: 'far', isSeat: false, worldCell: { x: 3, y: 3 } },
  ];
  const villages = [
    { settlementId: 'north', name: 'Budeč' },
    { settlementId: 'far', name: 'Daleko' },
  ];

  it('vlastní vsi na sousedních mapách po směrech; sídelní sídlo bez polohy je v (0, 0)', () => {
    expect(ownMapsAround(settlements, villages, 'seat')).toEqual({ N: 'Budeč' });
    expect(ownMapsAround(settlements, villages, 'north')).toEqual({});
    expect(ownMapsAround(settlements, [], 'seat')).toEqual({});
  });
});

describe('leaveOptions, journeyView, villageAbandonment', () => {
  const landscape = makeLandscapeForTests();
  const state = foundVillage();

  it('8 směrů s dny cesty, tam, kde leží vlastní ves, ne', () => {
    const leave = leaveOptions(state, landscape, { E: 'Budeč' }, null);
    expect(leave.directions.map((d) => d.direction)).toEqual([
      'N',
      'NE',
      'E',
      'SE',
      'S',
      'SW',
      'W',
      'NW',
    ]);
    expect(leave.directions.every((d) => d.days >= 1 && d.days <= 3)).toBe(true);
    expect(leave.directions.find((d) => d.direction === 'E')!.blocked).toBe(
      ownVillageThere('Budeč'),
    );
    expect(leave.directions.find((d) => d.direction === 'N')!.blocked).toBeNull();
    const nowhere = leaveOptions(state, landscape, {}, 'Mapa nemá místo.');
    expect(nowhere.directions.every((d) => d.blocked === 'Mapa nemá místo.')).toBe(true);
  });

  it('celá ves: všechno jídlo i s osivem, všechna zvířata a vozy – co odchod opravdu vezme', () => {
    const rich: VillageState = {
      ...withBuiltFirstDwelling(state),
      lastDay: 1000,
      storesKg: 900,
      reservedSeedKg: 300,
      meatKg: 40,
      carts: [
        { id: 70, kind: 'two-wheel', builtDay: 900 },
        { id: 71, kind: 'four-wheel', builtDay: 900 },
      ],
      looseOxen: [{ trainedDay: 800 }],
      looseHorses: [{ id: 72, bornDay: 0, sex: 'female', training: 0 }],
      livestock: {
        herds: { sheep: 6.4, goat: 1, pig: 2, cow: 1 },
        young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      },
    };
    const { all } = leaveOptions(rich, landscape, {}, null);
    expect(all).toEqual({ foodKg: 940, animals: 12, carts: 2 });
    const { settlers } = departVillage(
      rich,
      1000,
      rich.dwellings.map((d) => d.id),
    );
    expect(settlers.food.grainKg + settlers.seedKg! + settlers.food.meatKg).toBe(all.foodKg);
    expect(settlers.whole!.carts).toHaveLength(all.carts);
  });

  it('lidé na cestě: kolik dní ještě jdou, pak dorazili; opuštěná ves s roky', () => {
    expect(journeyView(state, 1000)).toBeNull();
    const travelling = {
      ...state,
      journey: { direction: 'W' as const, departedDay: 1000, arrivalDay: 1003 },
    };
    expect(journeyView(travelling, 1001)).toEqual({
      direction: 'W',
      arrivalDay: 1003,
      arrived: false,
      daysLeft: 2,
    });
    expect(journeyView(travelling, 1004)?.arrived).toBe(true);
    expect(villageAbandonment(state)).toBeNull();
    const abandoned = villageAbandonment({ ...state, abandonedDay: state.foundedDay + 800 });
    expect(abandoned?.years).toBe(2);
  });
});
