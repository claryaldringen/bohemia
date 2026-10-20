import { describe, expect, it } from 'vitest';
import {
  oreHeapGeometry,
  oreHeapRadius,
  orePitGeometry,
  orePitRadius,
  orePitWater,
  oreSitesKey,
} from '../ore-site-layout';

// Rudiště ve scéně (crafts.md – Uhlí a ruda kováře): jámy s valem a vodou na dně zarůstají,
// u místa hromádka rudy.

const flat = (): number => 10;
const pit = (overgrowth: number, kg = 200) => ({ x: 5, z: -3, kg, overgrowth });

/** Nejvyšší bod sítě nad terénem (m). */
const peak = (positions: readonly number[]): number => {
  let top = -Infinity;
  for (let i = 1; i < positions.length; i += 3) top = Math.max(top, positions[i]! - 10);
  return top;
};

describe('jámy po rudě', () => {
  it('větší jáma z víc rudy, val kolem; zarůstáním se slehne a zezelená', () => {
    expect(orePitRadius(30)).toBeLessThan(orePitRadius(400));
    expect(orePitRadius(10_000)).toBe(1.8);
    const fresh = orePitGeometry([pit(0)], flat);
    const old = orePitGeometry([pit(0.9)], flat);
    expect(fresh.indices.length).toBeGreaterThan(0);
    expect(fresh.positions.length / 3).toBe(fresh.colors.length / 3);
    // val čerstvé jámy vystupuje, zarostlý skoro ne
    expect(peak(fresh.positions)).toBeGreaterThan(0.25);
    expect(peak(old.positions)).toBeLessThan(0.15);
    // zarostlá jáma je zelená (drn) – čerstvá hnědá a rezavá
    const green = (colors: readonly number[]): number => {
      let n = 0;
      for (let i = 0; i < colors.length; i += 3) if (colors[i + 1]! > colors[i]!) n++;
      return n / (colors.length / 3);
    };
    expect(green(fresh.colors)).toBeLessThan(0.1);
    expect(green(old.colors)).toBeGreaterThan(0.9);
  });

  it('voda na dně čerstvé jámy; od poloviny zarůstání vyschne', () => {
    expect(orePitWater([pit(0)], flat).indices.length).toBeGreaterThan(0);
    expect(orePitWater([pit(0.5)], flat).indices).toEqual([]);
  });

  it('hromádka rudy jen tam, kde ruda leží nebo se kope', () => {
    const site = { dwellingId: 1, x: 0, z: 0, heapKg: 0, digging: false };
    expect(oreHeapRadius(site)).toBe(0);
    expect(oreHeapGeometry([site], flat).indices).toEqual([]);
    expect(oreHeapRadius({ ...site, digging: true })).toBeGreaterThan(0.3);
    expect(oreHeapRadius({ ...site, heapKg: 400 })).toBeGreaterThan(
      oreHeapRadius({ ...site, heapKg: 50 }),
    );
    expect(oreHeapGeometry([{ ...site, heapKg: 400 }], flat).indices.length).toBeGreaterThan(0);
  });

  it('klíč se změní jen se změnou jam nebo rudišť', () => {
    const site = { dwellingId: 1, x: 0, z: 0, heapKg: 0, digging: true };
    expect(oreSitesKey([site], [pit(0)])).toBe(oreSitesKey([{ ...site }], [pit(0)]));
    expect(oreSitesKey([site], [pit(0)])).not.toBe(oreSitesKey([site], [pit(0.05)]));
    expect(oreSitesKey(undefined, undefined)).toBe('|');
  });
});
