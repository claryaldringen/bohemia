import { describe, expect, it } from 'vitest';
import { treeAround, treeBelow, treeBelowDepths, wouldBeMutual, type VassalEdge } from '../tree';

const e = (lordHouseId: string, vassalHouseId: string): VassalEdge => ({
  lordHouseId,
  vassalHouseId,
});

describe('wouldBeMutual', () => {
  it('přímé vzájemné vazalství je zakázané', () => {
    expect(wouldBeMutual([e('A', 'B')], 'B', 'A')).toBe(true);
  });
  it('stejný směr a cizí rody nevadí', () => {
    expect(wouldBeMutual([e('A', 'B')], 'A', 'B')).toBe(false);
    expect(wouldBeMutual([e('A', 'B')], 'C', 'A')).toBe(false);
  });
  it('delší kruh přes víc rodů zakázaný není (Martin: „udělej to, jak říkáš“)', () => {
    expect(wouldBeMutual([e('A', 'B'), e('B', 'C')], 'C', 'A')).toBe(false);
  });
});

describe('treeBelow', () => {
  it('vazalové a jejich vazalové, každý jednou, od nejbližších', () => {
    const edges = [e('A', 'B'), e('A', 'C'), e('B', 'D'), e('C', 'D'), e('D', 'E')];
    expect(treeBelow(edges, 'A')).toEqual(['B', 'C', 'D', 'E']);
  });
  it('kruh A → B → C → A projde každý rod jednou', () => {
    const edges = [e('A', 'B'), e('B', 'C'), e('C', 'A')];
    expect(treeBelow(edges, 'A')).toEqual(['B', 'C', 'A']);
  });
  it('rod bez vazalů má prázdný strom', () => {
    expect(treeBelow([e('A', 'B')], 'B')).toEqual([]);
  });
});

describe('treeAround', () => {
  it('celá souvislá síť nahoru i dolů, každý jednou', () => {
    const edges = [e('A', 'B'), e('B', 'C'), e('X', 'Y')];
    expect(treeAround(edges, ['B'])).toEqual(['B', 'A', 'C']);
  });
  it('víc výchozích rodů a kruh', () => {
    const edges = [e('A', 'B'), e('B', 'C'), e('C', 'A'), e('X', 'Y')];
    expect(treeAround(edges, ['A', 'X', 'A']).sort()).toEqual(['A', 'B', 'C', 'X', 'Y']);
  });
  it('osamělý rod je sám', () => {
    expect(treeAround([], ['Q'])).toEqual(['Q']);
  });
});

describe('treeBelowDepths', () => {
  it('patra s pánem, kruh se ukáže jednou, hloubka je omezená', () => {
    const edges = [e('A', 'B'), e('A', 'C'), e('B', 'D'), e('D', 'A'), e('C', 'D')];
    expect(treeBelowDepths(edges, 'A', 5)).toEqual([
      { houseId: 'B', depth: 1, parentHouseId: 'A' },
      { houseId: 'C', depth: 1, parentHouseId: 'A' },
      { houseId: 'D', depth: 2, parentHouseId: 'B' },
    ]);
    expect(treeBelowDepths(edges, 'A', 1).map((n) => n.houseId)).toEqual(['B', 'C']);
  });
});
