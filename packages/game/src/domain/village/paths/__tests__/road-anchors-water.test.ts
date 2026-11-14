import { describe, expect, it } from 'vitest';
import { generateLandscape, type Landscape } from '../../../landscape';
import { waterKindAt } from '../road-anchors';

// Voda na konci cesty je potok, nebo řeka (D44, Martin 14. 11. 2026: „teče tam přece potok“).

const cellM = (l: Landscape): number => l.cellSizeM;
const world = (l: Landscape, p: { x: number; y: number }): { x: number; z: number } => ({
  x: (p.x - l.size / 2) * cellM(l),
  z: (p.y - l.size / 2) * cellM(l),
});

describe('waterKindAt', () => {
  it('mapa bez řeky má jen potok', () => {
    const l = generateLandscape(1);
    expect(l.river).toBeUndefined();
    const p = world(l, l.stream[Math.floor(l.stream.length / 2)]!);
    expect(waterKindAt(l, p.x, p.z)).toBe('stream');
  });

  it('prémiová splavná řeka: u osy řeky řeka, u osy potoka potok', () => {
    const l = generateLandscape(7919, undefined, 'navigable-river');
    const r = l.river!;
    const rp = world(l, r[Math.floor(r.length / 2)]!);
    expect(waterKindAt(l, rp.x, rp.z)).toBe('river');
    const sp = world(l, l.stream[Math.floor(l.stream.length / 2)]!);
    expect(waterKindAt(l, sp.x, sp.z)).toBe('stream');
  });
});
