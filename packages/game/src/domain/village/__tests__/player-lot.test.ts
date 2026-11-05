import { describe, expect, it } from 'vitest';
import { drawPlayerLot, isPlayerLot, playerLotCandidates } from '../player-lot';
import { DAY, trackedVillage, type KinSpec } from './kin-fixtures';

// Los o nástupnictví hráče (seniorate.md – Nástupnictví hráče): kdo je v losu a jaké jsou šance.

/** Ves po smrti vojvody 10 (ve vsi není): synové 20 (30 let), 21 (20 let), 22 (10 let). */
function widowed(extra: KinSpec[] = []): ReturnType<typeof trackedVillage> {
  return trackedVillage([
    { id: 11, age: 50, sex: 'female' },
    { id: 20, age: 30, sex: 'male', father: 10, mother: 11 },
    { id: 21, age: 20, sex: 'male', father: 10, mother: 11 },
    { id: 22, age: 10, sex: 'male', father: 10, mother: 11 },
    ...extra,
  ]);
}

describe('playerLotCandidates', () => {
  it('nástupce vsi a mladší synové od 16 let; chlapec do 16 let v losu není', () => {
    expect(playerLotCandidates(widowed(), DAY, 10)).toEqual({ successor: 20, younger: [21] });
  });

  it('ke dni smrti: syn, který tehdy ještě nebyl dospělý, v losu není', () => {
    // 21 je ke dni DAY 20 let, o 5 let dřív jen 15
    expect(playerLotCandidates(widowed(), DAY - 5 * 365.25, 10)).toEqual({
      successor: 20,
      younger: [],
    });
  });

  it('jediný syn: nástupce bez mladších – los není', () => {
    const state = trackedVillage([{ id: 20, age: 30, sex: 'male', father: 10 }]);
    const candidates = playerLotCandidates(state, DAY, 10);
    expect(candidates).toEqual({ successor: 20, younger: [] });
    expect(isPlayerLot(candidates)).toBe(false);
  });

  it('ves bez muže rodu: žádný nástupce', () => {
    const state = trackedVillage([{ id: 11, age: 50, sex: 'female' }]);
    state.people = state.people.filter((p) => p.id !== 10);
    expect(playerLotCandidates(state, DAY, 10)).toEqual({ successor: null, younger: [] });
  });
});

describe('drawPlayerLot', () => {
  const count = (candidates: { successor: number | null; younger: number[] }, n: number) => {
    const wins = new Map<number, number>();
    for (let seed = 0; seed < n; seed++) {
      const id = drawPlayerLot(seed * 7919 + 13, DAY, candidates);
      wins.set(id, (wins.get(id) ?? 0) + 1);
    }
    return wins;
  };

  it('s jedním mladším: ½ a ½', () => {
    const wins = count({ successor: 1, younger: [2] }, 2000);
    expect(wins.get(1)! / 2000).toBeGreaterThan(0.45);
    expect(wins.get(1)! / 2000).toBeLessThan(0.55);
  });

  it('se dvěma mladšími: ½, ¼, ¼', () => {
    const wins = count({ successor: 1, younger: [2, 3] }, 2000);
    expect(wins.get(1)! / 2000).toBeGreaterThan(0.45);
    expect(wins.get(1)! / 2000).toBeLessThan(0.55);
    for (const id of [2, 3]) {
      expect(wins.get(id)! / 2000).toBeGreaterThan(0.2);
      expect(wins.get(id)! / 2000).toBeLessThan(0.3);
    }
  });

  it('je deterministický ze seedu a dne smrti', () => {
    const c = { successor: 1, younger: [2, 3] };
    expect(drawPlayerLot(42, 1000, c)).toBe(drawPlayerLot(42, 1000, c));
  });

  it('bez nástupce losují jen mladší rovným dílem', () => {
    const wins = count({ successor: null, younger: [2, 3] }, 1000);
    expect(wins.has(1)).toBe(false);
    expect(wins.get(2)! / 1000).toBeGreaterThan(0.4);
  });
});
