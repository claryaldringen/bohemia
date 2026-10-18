import { describe, expect, it } from 'vitest';
import { packObstacles, type Landscape } from '@bohemia/game';
import type { SceneVillage } from '../../village-view';
import { dayOfYearFromDate } from '../field-look';
import {
  aftermathGrazing,
  chooseHayMeadows,
  hayPhase,
  meadowHay,
  meadowLook,
  stackStands,
} from '../hay-meadows';

// Krajina 40 × 40 políček po 15 m se středem v počátku – louka, jen sloupce x ≥ 30 jsou les.
const SIZE = 40;
const landscape: Landscape = {
  size: SIZE,
  cellSizeM: 15,
  heights: new Float32Array(SIZE * SIZE),
  surface: Uint8Array.from({ length: SIZE * SIZE }, (_, i) => (i % SIZE >= 30 ? 1 : 2)),
  fertility: new Uint8Array(SIZE * SIZE).fill(50),
  villageSite: { x: 20, y: 20 },
  stream: [],
  obstacleLayer: null,
};
/** Kameny po celé louce západně od vsi (x < −40 m) – tam se nesečе. */
const stones = packObstacles(
  Array.from({ length: 160 }, (_, i) => ({
    id: i + 1,
    kind: 'stone' as const,
    look: 'stone-1' as const,
    x: -300 + (i % 16) * 16 + 7,
    z: -300 + Math.floor(i / 16) * 60 + 7,
    rotation: 0,
    scale: 1,
  })).flatMap((s) =>
    Array.from({ length: 4 }, (_, k) => ({ ...s, id: s.id * 10 + k, z: s.z + k * 15 })),
  ),
  SIZE,
  15,
);

const home = (id: number, x: number, z: number): SceneVillage['dwellings'][number] => ({
  id,
  type: 'zemnice',
  position: { x, z, rotation: 0 },
  built: true,
  progress: 1,
});

const village = (homes: number): SceneVillage => ({
  dwellings: Array.from({ length: homes }, (_, i) => home(i + 1, 7.5 + i * 12, 7.5)),
  fields: [
    {
      id: 1,
      parts: [
        { cell: { x: 22, y: 20 }, x: 37.5, z: 7.5, size: 15, stage: 'sown' },
        { cell: { x: 23, y: 20 }, x: 52.5, z: 7.5, size: 15, stage: 'sown' },
      ],
    },
  ],
});

describe('louky na seno – kdy', () => {
  it('na jaře roste tráva, v červnu seč, sušení a kupky, pak stohy přes podzim a zimu', () => {
    expect(hayPhase(dayOfYearFromDate(5, 20))).toBeNull();
    expect(hayPhase(dayOfYearFromDate(3, 20))).toBeNull();
    expect(hayPhase(dayOfYearFromDate(9, 10))!.hay).toBe('stacks');
    expect(hayPhase(dayOfYearFromDate(1, 10))!.hay).toBe('stacks');
    expect(hayPhase(dayOfYearFromDate(1, 10))!.regrowth).toBe(1);
    const early = hayPhase(dayOfYearFromDate(6, 10))!;
    const late = hayPhase(dayOfYearFromDate(6, 22))!;
    expect(early.hay).toBe('swaths');
    expect(late.mown).toBeGreaterThan(early.mown);
    expect(hayPhase(dayOfYearFromDate(7, 5))!.hay).toBe('heaps');
    const stacks = hayPhase(dayOfYearFromDate(8, 10))!;
    expect(stacks.hay).toBe('stacks');
    expect(meadowLook(stacks)).toBe('haystacks');
    expect(meadowLook(early)).toBe('mown');
    expect(stacks.regrowth).toBeGreaterThan(hayPhase(dayOfYearFromDate(7, 20))!.regrowth);
  });
});

describe('louky na seno – kde', () => {
  it('bez obydlené vsi žádné; na dvě domácnosti jedna louka, nejvýš čtyři', () => {
    expect(chooseHayMeadows(landscape, null, { dwellings: [], fields: [] })).toEqual([]);
    expect(chooseHayMeadows(landscape, null, village(2))).toHaveLength(1);
    expect(chooseHayMeadows(landscape, null, village(5))).toHaveLength(3);
    expect(chooseHayMeadows(landscape, null, village(12))).toHaveLength(4);
  });

  it('jen na louce bez kamenů a stromů, mimo pole a kus od vsi; louky se nedotýkají', () => {
    const v = village(8);
    const meadows = chooseHayMeadows(landscape, stones, v);
    expect(meadows.length).toBe(4);
    const taken = new Set(v.fields.flatMap((f) => f.parts.map((p) => `${p.cell.x},${p.cell.y}`)));
    const cells = meadows.flatMap((m) => m.squares);
    for (const s of cells) {
      expect(s.cell.x).toBeLessThan(30); // ne v lese
      expect(s.x).toBeGreaterThan(-40); // ne mezi kameny
      expect(taken.has(`${s.cell.x},${s.cell.y}`)).toBe(false);
      expect(Math.hypot(s.x - 50, s.z - 7.5)).toBeGreaterThan(20);
    }
    for (const [i, a] of meadows.entries()) {
      for (const b of meadows.slice(i + 1)) {
        for (const p of a.squares)
          for (const q of b.squares) {
            const near = Math.abs(p.cell.x - q.cell.x) <= 1 && Math.abs(p.cell.y - q.cell.y) <= 1;
            expect(near).toBe(false);
          }
      }
    }
    // deterministické
    expect(chooseHayMeadows(landscape, stones, v)).toEqual(meadows);
  });

  it('kupky na každém čtverci, pak stoh na každém druhém; stohy přes zimu postupně mizí', () => {
    const [meadow] = chooseHayMeadows(landscape, null, village(2));
    const hay = (month: number, day: number): ReturnType<typeof meadowHay> => {
      const d = dayOfYearFromDate(month, day);
      return meadowHay(meadow!, hayPhase(d), d);
    };
    expect(hay(6, 10)).toEqual([]);
    expect(hay(5, 1)).toEqual([]);
    const heaps = hay(7, 5);
    expect(heaps.length).toBe(meadow!.squares.length * 4);
    expect(heaps.every((h) => h.width < 0.5)).toBe(true);
    const stacks = hay(8, 1);
    expect(stacks.length).toBe(Math.ceil(meadow!.squares.length / 2));
    expect(hay(9, 20)).toEqual(stacks);
    // přes zimu se stohy zkrmí – každý jindy, do poloviny března všechny
    const counts = [hay(10, 1), hay(11, 15), hay(1, 10), hay(3, 10)].map((h) => h.length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    expect(hay(3, 20)).toEqual([]);
  });

  it('stoh stojí od poloviny července, pak zmizí v náhodný den mezi říjnem a březnem', () => {
    let removed = 0;
    for (let seed = 1; seed <= 200; seed++) {
      expect(stackStands(seed, dayOfYearFromDate(7, 20))).toBe(true);
      expect(stackStands(seed, dayOfYearFromDate(9, 30))).toBe(true);
      expect(stackStands(seed, dayOfYearFromDate(4, 1))).toBe(false);
      if (!stackStands(seed, dayOfYearFromDate(12, 31))) removed++;
    }
    expect(removed).toBeGreaterThan(40);
    expect(removed).toBeLessThan(160);
  });

  it('na otavě se pase až po seči – od srpna do konce listopadu', () => {
    expect(aftermathGrazing(dayOfYearFromDate(6, 20))).toBe(false);
    expect(aftermathGrazing(dayOfYearFromDate(8, 10))).toBe(true);
    expect(aftermathGrazing(dayOfYearFromDate(11, 20))).toBe(true);
    expect(aftermathGrazing(dayOfYearFromDate(1, 20))).toBe(false);
  });
});
