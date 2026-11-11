import { describe, expect, it } from 'vitest';
import { obstaclesOf } from '../../../landscape';
import { mapCapacity } from '../map-capacity';
import { STEWARD } from '../../rules/rules-steward';
import { stewardCrowded } from '../steward-son';
import type { VillageState } from '../../types';
import { makeLandscape } from '../../__tests__/placement-fixtures';

const map = (
  fertility: number,
  surface: (x: number, y: number) => 'water' | 'forest' | 'meadow' = () => 'meadow',
): ReturnType<typeof makeLandscape> =>
  makeLandscape({ size: 64, surface, height: () => 5, fertility: () => fertility });
const capacity = (l: ReturnType<typeof makeLandscape>): number => mapCapacity(l, obstaclesOf(l));

describe('kapacita mapy (steward.md – Model kapacity vsi)', () => {
  it('víc úrodné půdy = větší kapacita', () => {
    expect(capacity(map(80))).toBeGreaterThan(capacity(map(30)));
    const half = map(60, (x) => (x < 32 ? 'water' : 'meadow'));
    expect(capacity(half)).toBeLessThan(capacity(map(60)));
  });

  it('voda se nepočítá, vyklučitelný les ano', () => {
    expect(capacity(map(60, () => 'water'))).toBe(0);
    const forest = capacity(map(60, () => 'forest'));
    expect(forest).toBeGreaterThan(0);
    // les dává v prvních letech navíc (bonus lesní půdy), ale ne řádově víc než louka
    expect(forest / capacity(map(60))).toBeGreaterThan(0.5);
    expect(forest / capacity(map(60))).toBeLessThan(2);
  });

  it('stejná krajina dá stejné číslo', () => {
    const a = map(55);
    const b = map(55);
    expect(capacity(a)).toBe(capacity(a));
    expect(capacity(a)).toBe(capacity(b));
  });

  it('odchod syna při 81 % kapacity ano, při 79 % ne', () => {
    const l = map(60);
    const cap = capacity(l);
    const withPeople = (n: number): VillageState =>
      ({ people: new Array(n) }) as unknown as VillageState;
    expect(STEWARD.mapCrowdedShare).toBe(0.8);
    expect(stewardCrowded(withPeople(Math.ceil(cap * 0.81)), l, obstaclesOf(l))).toBe(true);
    expect(stewardCrowded(withPeople(Math.floor(cap * 0.79)), l, obstaclesOf(l))).toBe(false);
  });
});
