import { describe, expect, it } from 'vitest';
import type { VillageState } from '../../types';
import { addHides, addSlaughterWares, addWildFurs } from '../wares';

const bare = (): VillageState => ({ dwellings: [] }) as unknown as VillageState;

describe('zboží z porážky a lovu', () => {
  it('ovce dá kožešinu, kráva kůži skotu, koza a prase menší kůži', () => {
    const s = bare();
    addSlaughterWares(s, 'sheep', 2);
    addSlaughterWares(s, 'pig', 1.5);
    addSlaughterWares(s, 'goat', 1);
    addSlaughterWares(s, 'cow', 1);
    expect(s.wares?.sheepFurs).toBe(2);
    expect(s.wares?.hides).toBe(1);
    expect(s.wares?.smallHides).toBe(2.5);
  });
  it('nulový přírůstek nevytvoří wares', () => {
    const s = bare();
    addHides(s, 0);
    addWildFurs(s, 0);
    addSlaughterWares(s, 'cow', 0);
    expect(s.wares).toBeUndefined();
  });
  it('kožešiny z lovu se sčítají', () => {
    const s = bare();
    addWildFurs(s, 2);
    expect(s.wares?.wildFurs).toBe(2);
  });
});
