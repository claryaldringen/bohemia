import { describe, expect, it } from 'vitest';
import { EDGE_SCROLL_PX, edgeScrollDirection } from '../edge-scroll';

const viewport = { width: 1000, height: 600 };

describe('edgeScrollDirection', () => {
  it('uprostřed okna nic, u okrajů směr ven', () => {
    expect(edgeScrollDirection({ x: 500, y: 300 }, viewport)).toEqual({ x: 0, y: 0 });
    expect(edgeScrollDirection({ x: 2, y: 300 }, viewport)).toEqual({ x: -1, y: 0 });
    expect(edgeScrollDirection({ x: 999, y: 300 }, viewport)).toEqual({ x: 1, y: 0 });
    expect(edgeScrollDirection({ x: 500, y: 0 }, viewport)).toEqual({ x: 0, y: -1 });
    expect(edgeScrollDirection({ x: 500, y: 595 }, viewport)).toEqual({ x: 0, y: 1 });
  });

  it('v rohu oba směry, hranice pásu podle EDGE_SCROLL_PX', () => {
    expect(edgeScrollDirection({ x: 0, y: 599 }, viewport)).toEqual({ x: -1, y: 1 });
    expect(edgeScrollDirection({ x: EDGE_SCROLL_PX - 1, y: 300 }, viewport).x).toBe(-1);
    expect(edgeScrollDirection({ x: EDGE_SCROLL_PX, y: 300 }, viewport).x).toBe(0);
  });

  it('miniaturní okno neposouvá', () => {
    expect(edgeScrollDirection({ x: 1, y: 1 }, { width: 10, height: 10 })).toEqual({ x: 0, y: 0 });
  });
});
