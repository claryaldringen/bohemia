import { describe, expect, it } from 'vitest';
import { fortSections, sectionOf } from '../sections';
import type { FortGate } from '../gates';
import type { FortSegment } from '../types';

// Úseky opevnění pro hráče (demolition.md – Opevnění): díl s branou a díly po směru hodin až před
// další díl s branou; obvod bez brány i s jedinou branou je jeden úsek.

const segments = (n: number): FortSegment[] =>
  Array.from({ length: n }, (_, index) => ({ index, builtDay: 0, state: 1 }));
const gate = (segment: number): FortGate => ({ segment, offsetM: 5, x: 0, z: 0 });

describe('úseky mezi branami', () => {
  it('3 brány – 3 úseky začínající dílem s branou, po směru hodin přes konec obvodu', () => {
    const fort = { segments: segments(10), gates: [gate(1), gate(4), gate(8)] };
    expect(fortSections(fort)).toEqual([
      { segments: [1, 2, 3], gateSegment: 1 },
      { segments: [4, 5, 6, 7], gateSegment: 4 },
      { segments: [8, 9, 0], gateSegment: 8 },
    ]);
  });

  it('1 brána – 1 úsek ze všech dílů od dílu s branou', () => {
    const fort = { segments: segments(6), gates: [gate(4)] };
    expect(fortSections(fort)).toEqual([{ segments: [4, 5, 0, 1, 2, 3], gateSegment: 4 }]);
  });

  it('bez brány – 1 úsek od dílu 0', () => {
    const fort = { segments: segments(5), gates: [] };
    expect(fortSections(fort)).toEqual([{ segments: [0, 1, 2, 3, 4], gateSegment: null }]);
  });

  it('sousední brány – úsek jen z dílu s branou; každý díl je v právě jednom úseku', () => {
    const fort = { segments: segments(8), gates: [gate(2), gate(3), gate(6)] };
    const sections = fortSections(fort);
    expect(sections[0]).toEqual({ segments: [2], gateSegment: 2 });
    const all = sections.flatMap((s) => s.segments).sort((a, b) => a - b);
    expect(all).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('sectionOf najde úsek dílu; neznámý díl null', () => {
    const fort = { segments: segments(10), gates: [gate(1), gate(4), gate(8)] };
    expect(sectionOf(fort, 9)).toEqual({ segments: [8, 9, 0], gateSegment: 8 });
    expect(sectionOf(fort, 0)?.gateSegment).toBe(8);
    expect(sectionOf(fort, 5)?.gateSegment).toBe(4);
    expect(sectionOf(fort, 10)).toBeNull();
  });
});
