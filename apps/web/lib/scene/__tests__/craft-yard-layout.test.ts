import { describe, expect, it } from 'vitest';
import { DWELLING_CLEARING_M, WORKSHOP_YARD_PATH_BOX_M } from '@bohemia/game';
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

  it('plná houba a hřivny jsou z herní výšky vidět, ale nepřerostou pec ani dosah hromádky', () => {
    const origin = { ...smith(), position: { x: 0, z: 0, rotation: 0 } };
    const pile = (yard: CraftYardView['yard'], lx: number, lz: number): number[] => {
      const empty = craftYardGeometry([{ ...origin, yard: {} }], flat).positions.length;
      const p = craftYardGeometry([{ ...origin, yard }], flat).positions.slice(empty);
      const reach: number[] = [];
      let top = 0;
      for (let i = 0; i < p.length; i += 3) {
        const [x, z] = localToWorld(origin.position, lx, lz);
        reach.push(Math.hypot(p[i]! - x, p[i + 2]! - z));
        top = Math.max(top, p[i + 1]!);
      }
      return [Math.max(...reach), top];
    };
    const [bloomReach, bloomTop] = pile({ bloom: 3 }, BLOOM_PILE.lx, BLOOM_PILE.lz);
    expect(bloomReach).toBeLessThanOrEqual(BLOOM_PILE.reach);
    expect(bloomTop).toBeGreaterThan(0.3);
    expect(bloomTop).toBeLessThan(BLOOMERY.height / 2);
    const [barReach, barTop] = pile({ bars: 3 }, BAR_PILE.lx, BAR_PILE.lz);
    expect(barReach).toBeLessThanOrEqual(BAR_PILE.reach);
    expect(barTop).toBeGreaterThan(0.3);
    expect(barTop).toBeLessThan(BLOOMERY.height / 2);
  });

  it('pec, měch, houba, hřivny i jáma leží ve vyklízené ploše dílny', () => {
    const area = DWELLING_CLEARING_M.polozemnice;
    const reach: [number, number, number][] = [
      [BLOOMERY.lx, BLOOMERY.lz, BLOOMERY.radiusBottom + 0.06],
      [BLOOMERY_BELLOWS.lx1, BLOOMERY_BELLOWS.lz, BLOOMERY_BELLOWS.width / 2],
      [BLOOM_PILE.lx, BLOOM_PILE.lz, BLOOM_PILE.reach],
      [BAR_PILE.lx, BAR_PILE.lz, BAR_PILE.reach],
      [CLAY_PIT.lx, CLAY_PIT.lz, CLAY_PIT.rim],
    ];
    // místa kováře a měchaře u tavby (osy modelu: dílna v počátku bez natočení), postava ≈ 0,25 m
    const origin = { ...smith(), position: { x: 0, z: 0, rotation: 0 } };
    for (const spot of smeltSpots(origin)) reach.push([spot.x, spot.z, 0.25]);
    for (const [lx, lz, r] of reach) {
      expect(lx - r).toBeGreaterThan(area.minX);
      expect(lx + r).toBeLessThan(area.maxX);
      expect(lz + r).toBeLessThan(area.maxZ);
    }
  });

  it('pěšiny dvůr obejdou – pec, měch, houba, hřivny i jáma leží v obdélníku dvora pro pěšiny', () => {
    const inside = (craft: 'smith' | 'potter', lx: number, lz: number, r: number): void => {
      const box = WORKSHOP_YARD_PATH_BOX_M[craft]!;
      expect(lx - r).toBeGreaterThanOrEqual(box.minX);
      expect(lx + r).toBeLessThanOrEqual(box.maxX);
      expect(lz - r).toBeGreaterThanOrEqual(box.minZ);
      expect(lz + r).toBeLessThanOrEqual(box.maxZ);
    };
    inside('smith', BLOOMERY.lx, BLOOMERY.lz, BLOOMERY.radiusBottom + 0.06);
    const bellowsMid = (BLOOMERY_BELLOWS.lx0 + BLOOMERY_BELLOWS.lx1) / 2;
    inside('smith', bellowsMid, BLOOMERY_BELLOWS.lz, BLOOMERY_BELLOWS.width / 2);
    inside('smith', BLOOMERY_BELLOWS.lx0, BLOOMERY_BELLOWS.lz, 0);
    inside('smith', BLOOMERY_BELLOWS.lx1, BLOOMERY_BELLOWS.lz, 0);
    inside('smith', BLOOM_PILE.lx, BLOOM_PILE.lz, BLOOM_PILE.reach);
    inside('smith', BAR_PILE.lx, BAR_PILE.lz, BAR_PILE.reach);
    inside('potter', CLAY_PIT.lx, CLAY_PIT.lz, CLAY_PIT.rim);
    // osa vchodu (brána pěšin) mezi pecí a jámou zůstane volná
    expect(WORKSHOP_YARD_PATH_BOX_M.smith!.maxX).toBeLessThan(-0.5);
    expect(WORKSHOP_YARD_PATH_BOX_M.potter!.minX).toBeGreaterThan(0.5);
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
    // jiná práce než tavba dvůr nemění
    const forge = craftYardsKey([smith({ task: 'forge', bloom: 1 }), potter({ clay: 2 })]);
    expect(craftYardsKey([smith({ task: 'refine', bloom: 1 }), potter({ clay: 2 })])).toBe(forge);
  });
});
