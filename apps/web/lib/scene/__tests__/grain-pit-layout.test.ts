import { describe, expect, it } from 'vitest';
import { grainPitGeometry } from '../grain-pit-layout';

// Dno otevřené obilné jámy (issue #3, Martin 22. 10. 2026: „Na dně obilné jámy by mělo být vidět
// obilí, ne průhled na louku“): hrdlo je vždy zakryté – zrno, u prázdné jámy hliněné dno.

const flat = (): number => 0;
const pit = (fill: number) => ({ id: 1, x: 0, z: 0, fill });

/** Střed jámy: první vrchol sítě. */
function centre(fill: number): { y: number; rgb: number[] } {
  const g = grainPitGeometry([pit(fill)], flat);
  return { y: g.positions[1]!, rgb: g.colors.slice(0, 3) };
}

describe('dno obilné jámy', () => {
  it('s obilím je střed zrno a hladina stoupá s plností', () => {
    const half = centre(0.5);
    const full = centre(1);
    expect(half.rgb).toEqual([0.74, 0.57, 0.27]);
    expect(full.y).toBeGreaterThan(half.y);
  });

  it('prázdná jáma má hliněné dno, ne tmavou díru', () => {
    expect(centre(0).rgb).toEqual([0.3, 0.22, 0.13]);
    const g = grainPitGeometry([pit(0)], flat);
    for (let i = 0; i < g.colors.length; i += 3) {
      expect(g.colors[i]!).toBeGreaterThan(0.2);
    }
  });

  it('hrdlo je celé pokryté trojúhelníky', () => {
    const g = grainPitGeometry([pit(0.25)], flat);
    expect(g.indices.length).toBeGreaterThan(20 * 3 * 5);
  });
});
