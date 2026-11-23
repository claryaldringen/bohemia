import { describe, expect, it } from 'vitest';
import { foundVillage } from '../../core/actions';
import { NEIGHBOR_DIRECTIONS } from '../../rules';
import { legacyNeighbourName, withoutFictionalNeighbours } from '../legacy-neighbours';
import type { TradeExpedition, VillageState } from '../../types';

// Jména dřívějších smyšlených sousedů (markets.md – Pravidla 10) – stará kronika a karavany je jmenují dál.
describe('legacyNeighbourName', () => {
  it('jména jsou pevná – týž los jako dřív (3 seedy × 8 směrů)', () => {
    const names = (seed: number): string[] =>
      NEIGHBOR_DIRECTIONS.map((d) => legacyNeighbourName(seed, d));
    expect(NEIGHBOR_DIRECTIONS).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
    expect(names(1)).toEqual([
      'Chlumec',
      'Vlkov',
      'Lipany',
      'Poříčí',
      'Radotín',
      'Kamenice',
      'Lipany',
      'Březí',
    ]);
    expect(names(1234)).toEqual([
      'Vlkov',
      'Úhonice',
      'Lomnice',
      'Kamenice',
      'Chotěšov',
      'Olešnice',
      'Libice',
      'Jasenná',
    ]);
    expect(names(987654)).toEqual([
      'Radotín',
      'Kojetice',
      'Libice',
      'Lomnice',
      'Olešnice',
      'Úhonice',
      'Bystřice',
      'Jasenná',
    ]);
  });
});

// Převod `fictional-neighbours` (markets.md – Pravidla 10): zbytky roku sousedů zmizí, výpravy
// na cestě zůstanou.
describe('withoutFictionalNeighbours', () => {
  const expedition: TradeExpedition = {
    id: 1,
    direction: 'S',
    trailId: 7,
    startedDay: 99,
    give: { grain: 100 },
    get: { cows: 1 },
    porters: 2,
    days: 6,
    cost: 12,
    done: 0,
  };
  const village = (): VillageState =>
    foundVillage({ seed: 5, day: 100, dwellingPosition: { x: 0, z: 0, rotation: 0 } });

  it('na kopii smaže zbytky roku sousedů, výpravy a další id nechá', () => {
    const s = village();
    s.trade = {
      neighbours: [{ direction: 'S', season: 600, supply: { cheese: 80 }, demand: {} }],
      expeditions: [expedition],
      nextId: 2,
    } as unknown as VillageState['trade'];
    const before = structuredClone(s);
    const next = withoutFictionalNeighbours(s);
    expect(next.trade).toEqual({ expeditions: [expedition], nextId: 2 });
    expect('neighbours' in next.trade!).toBe(false);
    expect(next.trade!.expeditions).toBe(s.trade!.expeditions);
    expect(s).toEqual(before);
    expect(withoutFictionalNeighbours(next)).toBe(next);
  });

  it('ves bez zbytků sousedů nebo bez obchodu vrátí týž objekt', () => {
    const s = village();
    expect(withoutFictionalNeighbours(s)).toBe(s);
    s.trade = { expeditions: [expedition], nextId: 2 } as unknown as VillageState['trade'];
    expect(withoutFictionalNeighbours(s)).toBe(s);
  });
});
