import { describe, expect, it } from 'vitest';
import { partsByIdOf } from '../parts-by-id';
import type { FieldPart } from '../../types';

const part = (id: number): FieldPart => ({ id }) as FieldPart;

describe('partsByIdOf – díly podle id z paměti', () => {
  it('nezměněný seznam vrátí tutéž mapu, jakou by postavila nová', () => {
    const parts = [part(3), part(1), part(2)];
    const map = partsByIdOf(parts);
    expect([...map]).toEqual([...new Map(parts.map((p) => [p.id, p]))]);
    expect(partsByIdOf(parts)).toBe(map);
  });

  it('doplněný, zkrácený, přeskládaný seznam nebo nahrazený díl dostane novou mapu – stará se nemění', () => {
    const parts = [part(1), part(2)];
    const first = partsByIdOf(parts);
    parts.push(part(3));
    const grown = partsByIdOf(parts);
    expect(grown).not.toBe(first);
    expect([...first.keys()]).toEqual([1, 2]);
    expect([...grown.keys()]).toEqual([1, 2, 3]);
    parts.reverse();
    expect([...partsByIdOf(parts).keys()]).toEqual([3, 2, 1]);
    const replaced = part(2);
    parts[1] = replaced;
    expect(partsByIdOf(parts).get(2)).toBe(replaced);
    parts.pop();
    expect([...partsByIdOf(parts).keys()]).toEqual([3, 2]);
    parts[0]!.id = 7;
    expect([...partsByIdOf(parts).keys()]).toEqual([7, 2]);
  });

  it('dvojí id – jako nová mapa (platí poslední díl)', () => {
    const later = part(1);
    const parts = [part(1), later];
    expect(partsByIdOf(parts).get(1)).toBe(later);
    expect(partsByIdOf(parts).size).toBe(1);
  });
});
