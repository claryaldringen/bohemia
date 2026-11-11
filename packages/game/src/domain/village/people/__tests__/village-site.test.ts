import { describe, expect, it } from 'vitest';
import { freeVillageSite } from '../village-site';
import { makeLandscape } from '../../__tests__/placement-fixtures';

// Místo první zemnice vsi, kterou si vesničané zakládají sami (příjezd vsi na cestě se správcem).
// Jedna ves, jedna mapa – jiné vsi místo neovlivní, jen krajina.

describe('freeVillageSite', () => {
  it('vybere místo vsi krajiny, deterministicky', () => {
    const landscape = makeLandscape({ size: 48 });
    const free = freeVillageSite(landscape);
    expect(free).toEqual({ x: 7.5, z: 7.5, rotation: 0 });
    expect(freeVillageSite(landscape)).toEqual(free);
  });
});
