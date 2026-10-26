import { describe, expect, it } from 'vitest';
import { DWELLING_CLEARING_M } from '@bohemia/game';
import {
  BAR_PILE,
  BLOOMERY,
  BLOOMERY_BELLOWS,
  BLOOM_PILE,
  CLAY_PIT,
  craftYardGeometry,
  craftYardsKey,
  hasCraftYard,
  smeltSpots,
  smeltVents,
  type CraftYardView,
} from '../craft-yard-layout';
import { localToWorld } from '../village-layout';
import { PORCH_FRONT_M } from '../workshop-layout';

const flat = (): number => 0;
const smith = (yard: CraftYardView['yard'] = {}): CraftYardView => ({
  id: 7,
  craft: 'smith',
  position: { x: 10, z: -5, rotation: 0.4 },
  yard,
});
const potter = (yard: CraftYardView['yard'] = {}): CraftYardView => ({
  id: 8,
  craft: 'potter',
  position: { x: -20, z: 12, rotation: 0 },
  yard,
});

describe('dvůr kovárny a hrnčíře (production-chains.md – Kovář; crafts.md – Hlína hrnčíře)', () => {
  it('pec stojí u každé kovárny, jáma jen u hrnčíře s hlínou, tesař nic', () => {
    expect(hasCraftYard(smith())).toBe(true);
    expect(hasCraftYard(potter())).toBe(false);
    expect(hasCraftYard(potter({ clay: 1 }))).toBe(true);
    expect(hasCraftYard({ craft: 'carpenter', yard: { clay: 3 } })).toBe(false);
    expect(craftYardGeometry([potter()], flat).indices).toHaveLength(0);
  });

  it('síť je jen poloha, barva a indexy (normály dopočítá renderer – málo vertex bufferů)', () => {
    const g = craftYardGeometry(
      [smith({ task: 'smelt', bloom: 3, bars: 3 }), potter({ clay: 2 })],
      flat,
    );
    expect(Object.keys(g).sort()).toEqual(['colors', 'indices', 'positions']);
    expect(g.colors.length).toBe(g.positions.length);
    const vertices = g.positions.length / 3;
    expect(Math.max(...g.indices)).toBeLessThan(vertices);
    expect(g.indices.length % 3).toBe(0);
    // deterministicky – stejný vstup, stejná síť
    expect(
      craftYardGeometry([smith({ task: 'smelt', bloom: 3, bars: 3 }), potter({ clay: 2 })], flat),
    ).toEqual(g);
  });

  it('houba a hřivny přibývají po stupních', () => {
    const size = (yard: CraftYardView['yard']): number =>
      craftYardGeometry([smith(yard)], flat).positions.length;
    expect(size({ bloom: 1 })).toBeGreaterThan(size({}));
    expect(size({ bloom: 3 })).toBeGreaterThan(size({ bloom: 1 }));
    expect(size({ bars: 1 })).toBeGreaterThan(size({}));
    expect(size({ bars: 3 })).toBeGreaterThan(size({ bars: 2 }));
  });

  it('pec, měch, houba, hřivny i jáma leží ve vyklízené ploše dílny', () => {
    const area = DWELLING_CLEARING_M.polozemnice;
    const reach: [number, number, number][] = [
      [BLOOMERY.lx, BLOOMERY.lz, BLOOMERY.radiusBottom + 0.06],
      [BLOOMERY_BELLOWS.lx1, BLOOMERY_BELLOWS.lz, BLOOMERY_BELLOWS.width / 2],
      [BLOOM_PILE.lx, BLOOM_PILE.lz, 0.6],
      [BAR_PILE.lx, BAR_PILE.lz, 0.3],
      [CLAY_PIT.lx, CLAY_PIT.lz, CLAY_PIT.rim],
    ];
    for (const [lx, lz, r] of reach) {
      expect(lx - r).toBeGreaterThan(area.minX);
      expect(lx + r).toBeLessThan(area.maxX);
      expect(lz + r).toBeLessThan(area.maxZ);
    }
  });

  it('pec stojí před přístřeškem a při tavbě v ní žhne uhlí', () => {
    expect(BLOOMERY.lz - BLOOMERY.radiusBottom).toBeGreaterThan(PORCH_FRONT_M);
    const cold = craftYardGeometry([smith()], flat).colors;
    const hot = craftYardGeometry([smith({ task: 'smelt' })], flat).colors;
    expect(hot).not.toEqual(cold);
    // dým tavby stoupá z hrdla pece, ne z výhně
    const [vent] = smeltVents(smith());
    const [x, z] = localToWorld(smith().position, BLOOMERY.lx, BLOOMERY.lz);
    expect(Math.hypot(vent!.x - x, vent!.z - z)).toBeLessThan(1e-9);
    expect(vent!.y).toBeGreaterThan(BLOOMERY.height);
  });

  it('kovář u tavby hledí do pece, měchař stojí u měchu mimo pec', () => {
    const [charge, pump] = smeltSpots(smith());
    const [fx, fz] = localToWorld(smith().position, BLOOMERY.lx, BLOOMERY.lz);
    expect(charge!.hx * (fx - charge!.x) + charge!.hz * (fz - charge!.z)).toBeGreaterThan(0);
    for (const spot of [charge!, pump!]) {
      expect(Math.hypot(spot.x - fx, spot.z - fz)).toBeGreaterThan(BLOOMERY.radiusBottom + 0.2);
    }
  });

  it('hladina hlíny v jámě stoupá se zásobou', () => {
    const top = (clay: number): number => {
      const g = craftYardGeometry([potter({ clay })], flat);
      const [cx, cz] = localToWorld(potter().position, CLAY_PIT.lx, CLAY_PIT.lz);
      let y = -Infinity;
      for (let i = 0; i < g.positions.length; i += 3) {
        if (Math.hypot(g.positions[i]! - cx, g.positions[i + 2]! - cz) < 1e-9) {
          y = Math.max(y, g.positions[i + 1]!);
        }
      }
      return y;
    };
    expect(top(2)).toBeGreaterThan(top(1));
    expect(top(3)).toBeGreaterThan(top(2));
  });

  it('klíč se mění jen se změnou, kterou je vidět', () => {
    const a = craftYardsKey([smith({ task: 'smelt', bloom: 1 }), potter({ clay: 2 })]);
    expect(craftYardsKey([smith({ task: 'smelt', bloom: 1 }), potter({ clay: 2 })])).toBe(a);
    expect(craftYardsKey([smith({ task: 'refine', bloom: 1 }), potter({ clay: 2 })])).not.toBe(a);
    expect(craftYardsKey([smith({ task: 'smelt', bloom: 2 }), potter({ clay: 2 })])).not.toBe(a);
    expect(craftYardsKey([smith({ task: 'smelt', bloom: 1 }), potter({ clay: 3 })])).not.toBe(a);
  });
});
