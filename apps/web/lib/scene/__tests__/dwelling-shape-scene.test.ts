import { describe, expect, it } from 'vitest';
import {
  DWELLING_SHAPE,
  PLAIN_FRAME,
  PLOT_VARIANTS,
  dwellingFrame,
  dwellingShapeAt,
  shapeFrame,
  shapeScales,
  shapeX,
  shapeY,
  shapeZ,
  type DwellingShape,
  type DwellingType,
  type PlotVariant,
  type Position,
} from '@bohemia/game';
import { PIT_SHAPES, pitOutline, pitShapeOf, shapedPit } from '../dwelling-pit';
import { ruinPitShape } from '../dwelling-decay';
import { SMOKE_VENT, eaveTufts, smokeVent } from '../dwelling-decor';
import {
  HOUSE_RECT_M,
  homesteadLayout,
  houseFrame,
  plotFenceRect,
  plotHouse,
  type PlotSquare,
} from '../homestead-layout';
import { chickenBox } from '../livestock-placement';
import { SHAPE_BONES, shapeBoneMatrices, shapeRegion } from '../shape-bones';
import { footprintRect, localToWorld, sceneFrame, shapedToWorld } from '../village-layout';
import { houseBox } from '../villager-plan';
import { modelSpots } from '../workshop-layout';

// population.md – Varianty rozměrů (Martin, GitHub #1): ve scéně se mění vše kolem domu jedním
// zobrazením – model (kosti oblastí), jáma a řez terénu, šíje, hlína, trsy, dým, místa
// řemeslníků; dveře, schody a šíje se nenatahují.

const TYPES: readonly Exclude<DwellingType, 'dvorec'>[] = ['zemnice', 'polozemnice'];
const EXTREMES: readonly DwellingShape[] = [
  { area: 1.1, ratio: 0.9, height: 1.1 },
  { area: 0.9, ratio: 1.1, height: 0.9 },
  { area: 1.1, ratio: 1.1, height: 0.9 },
  { area: 0.9, ratio: 0.9, height: 1.1 },
];

/** Násobí bod (x, y, z) maticí kosti (rozložení `Matrix.m` Babylonu – sloupce po čtyřech). */
function applyBone(m: Float32Array, bone: number, x: number, y: number, z: number): number[] {
  const o = bone * 16;
  return [
    m[o]! * x + m[o + 4]! * y + m[o + 8]! * z + m[o + 12]!,
    m[o + 1]! * x + m[o + 5]! * y + m[o + 9]! * z + m[o + 13]!,
    m[o + 2]! * x + m[o + 6]! * y + m[o + 10]! * z + m[o + 14]!,
  ];
}

describe('kosti oblastí modelu (shaped-model.ts)', () => {
  it('vrchol modelu se kostí své oblasti zobrazí přesně jako shapeX/Y/Z', () => {
    for (const type of TYPES) {
      for (const shape of EXTREMES) {
        const frame = shapeFrame(type, shape);
        const bones = new Float32Array(SHAPE_BONES * 16);
        shapeBoneMatrices(frame, bones);
        for (let i = 0; i < 400; i++) {
          const x = -4 + ((i * 0.737) % 8);
          const y = -1.2 + ((i * 0.311) % 4);
          const z = -4 + ((i * 0.519) % 9);
          const [bx, by, bz] = applyBone(bones, shapeRegion(type, x, y, z), x, y, z);
          expect(bx).toBeCloseTo(shapeX(frame, x), 5);
          expect(by).toBeCloseTo(shapeY(frame, y), 5);
          expect(bz).toBeCloseTo(shapeZ(frame, z), 5);
        }
      }
    }
  });

  it('dnešní tvar – všechny kosti jsou identita', () => {
    const bones = new Float32Array(SHAPE_BONES * 16);
    shapeBoneMatrices(PLAIN_FRAME, bones);
    for (let b = 0; b < SHAPE_BONES; b++) {
      expect(applyBone(bones, b, 1.3, 0.7, -2.1)).toEqual([
        expect.closeTo(1.3, 9),
        expect.closeTo(0.7, 9),
        expect.closeTo(-2.1, 9),
      ]);
    }
  });
});

describe('jáma a řez terénu sedí s modelem', () => {
  it('jádro a scéna se shodnou, kde šíje začíná a jak je široká (dwellings.py – DOOR)', () => {
    for (const type of ['zemnice', 'polozemnice', 'dvorec'] as const) {
      expect(PIT_SHAPES[type].halfZ).toBe(DWELLING_SHAPE.frontM[type]);
      expect(PIT_SHAPES[type].rampHalfX).toBe(DWELLING_SHAPE.doorHalfM);
    }
  });

  it('jáma varianty = obrys jámy zobrazený jako model; hloubka, schody i šíje zůstanou', () => {
    for (const type of TYPES) {
      for (const shape of EXTREMES) {
        const frame = shapeFrame(type, shape);
        const pit = PIT_SHAPES[type];
        const shaped = shapedPit(pit, frame);
        // obrys jámy varianty = obrys dnešní jámy, jehož rohy prošly zobrazením modelu
        const mapped = pitOutline(pit).map(([x, z]) => [shapeX(frame, x), shapeZ(frame, z)]);
        pitOutline(shaped).forEach(([x, z], i) => {
          expect(x).toBeCloseTo(mapped[i]![0]!, 9);
          expect(z).toBeCloseTo(mapped[i]![1]!, 9);
        });
        expect(shaped.depth).toBe(pit.depth);
        expect(shaped.steps).toBe(pit.steps);
        // šíje se schody: stejně široká jako dveře a stejně dlouhá
        expect(shaped.rampHalfX).toBe(pit.rampHalfX);
        expect(shaped.rampEndZ - shaped.halfZ).toBeCloseTo(pit.rampEndZ - pit.halfZ, 9);
        // jáma pod domem roste s domem
        const { sx, sz } = shapeScales(shape);
        expect(Math.sign(shaped.halfX - pit.halfX)).toBe(Math.sign(sx - 1));
        expect(shaped.halfZ).toBeCloseTo(pit.halfZ * sz, 9);
        // zbytek jámy po zániku má tvar jámy domu
        const ruin = ruinPitShape(type, frame);
        expect(ruin.halfX).toBe(shaped.halfX);
        expect(ruin.halfZ).toBe(shaped.halfZ);
      }
    }
  });

  it('jáma obydlí ve scéně jde z polohy, pozemku a příznaku dnešního tvaru', () => {
    const at: Position = { x: 12.34, z: -56.78, rotation: 0 };
    const d = { type: 'polozemnice' as const, position: at };
    expect(pitShapeOf(d)).toEqual(shapedPit(PIT_SHAPES.polozemnice, dwellingFrame(d)));
    expect(pitShapeOf({ ...d, plainShape: true })).toBe(PIT_SHAPES.polozemnice);
    expect(pitShapeOf({ type: 'dvorec', position: at })).toBe(PIT_SHAPES.dvorec);
  });
});

describe('vše kolem domu podle varianty', () => {
  const at: Position = { x: 40.21, z: -12.07, rotation: 0.7 };
  const frame = shapeFrame('zemnice', { area: 1.1, ratio: 0.9, height: 1.1 });

  it('dýmník se zvedne s výškou a posune s délkou domu', () => {
    const vent = smokeVent('polozemnice', frame);
    expect(vent.y).toBeCloseTo(SMOKE_VENT.polozemnice.y * 1.1, 9);
    expect(vent.z).toBeCloseTo(shapeZ(frame, SMOKE_VENT.polozemnice.z), 9);
  });

  it('trsy pod okapem jdou s okapem, dům bez varianty má trsy jako dřív', () => {
    const plain = eaveTufts('zemnice', at, 3);
    const shaped = eaveTufts('zemnice', at, 3, frame);
    expect(shaped).toHaveLength(plain.length);
    const reach = (list: typeof plain): number =>
      Math.max(...list.map((t) => Math.hypot(t.x - at.x, t.z - at.z)));
    expect(reach(shaped)).toBeGreaterThan(reach(plain));
    expect(eaveTufts('zemnice', at, 3, PLAIN_FRAME)).toEqual(plain);
  });

  it('obdélník domu pro slepice a postavy podle varianty; vchod (brána) se posune se šíjí', () => {
    const box = chickenBox('zemnice', frame);
    const plain = chickenBox('zemnice');
    expect(box.halfX).toBeGreaterThan(plain.halfX);
    expect(box.maxZ - plain.maxZ).toBeCloseTo((frame.sz - 1) * frame.front, 9);
    expect(houseBox('zemnice', frame).maxZ).toBe(box.maxZ);
  });

  it('místa řemeslníků pod přístřeškem se posunou s domem', () => {
    const plain = modelSpots('kovar', at);
    const shaped = modelSpots('kovar', at, shapeFrame('polozemnice', EXTREMES[0]!));
    expect(shaped).toHaveLength(plain.length);
    // přístřešek je před šíjí – jen se posune o změnu přední části domu
    const shift = (shapeScales(EXTREMES[0]!).sz - 1) * DWELLING_SHAPE.frontM.polozemnice;
    const moved = Math.hypot(shaped[0]!.x - plain[0]!.x, shaped[0]!.z - plain[0]!.z);
    expect(moved).toBeGreaterThan(Math.abs(shift) * 0.5);
  });

  it('půdorys ve scéně = půdorys jádra (výběr, zvýraznění, minimapa)', () => {
    const d = { type: 'polozemnice' as const, position: at };
    const rect = footprintRect(d);
    const corner = shapedToWorld(at, sceneFrame(d), 2.5, -2.5);
    expect(corner).toEqual(localToWorld(at, rect.maxX, rect.minZ));
  });
});

describe('pozemek – dům uvnitř plotu', () => {
  /** Poloha kousek od (x, z), jejíž varianta je co největší napříč (sx) i podél (sz). */
  function widest(x: number, z: number, along: boolean): { x: number; z: number } {
    let best = { x, z, score: -Infinity };
    for (let i = 0; i < 400; i++) {
      const px = x + (i % 20) * 0.03;
      const pz = z + Math.floor(i / 20) * 0.03;
      const { sx, sz } = shapeScales(dwellingShapeAt(px, pz));
      const score = along ? sz : sx;
      if (score > best.score) best = { x: px, z: pz, score };
    }
    return best;
  }

  it('dům s valy a trsy u okapu zůstane uvnitř plotu i v největší variantě – každý roh pozemku', () => {
    for (const variant of PLOT_VARIANTS) {
      for (const along of [false, true]) {
        // pozemek posunutý tak, aby dům na něm měl výraznou variantu
        const base = widest(30, 60, along);
        const square: PlotSquare = { x: base.x, z: base.z, size: 15, variant };
        const house = plotHouse(square, variant);
        const frame = houseFrame(square, variant, house);
        const fence = plotFenceRect(square);
        const { halfX, front, back } = HOUSE_RECT_M;
        for (const [lx, lz] of [
          [-halfX, -back],
          [halfX, -back],
          [halfX, front],
          [-halfX, front],
        ] as const) {
          const [x, z] = shapedToWorld(house, frame, lx, lz);
          expect(x).toBeGreaterThan(fence.minX);
          expect(x).toBeLessThan(fence.maxX);
          expect(z).toBeGreaterThan(fence.minZ);
          expect(z).toBeLessThan(fence.maxZ);
        }
        // záhony se domu vyhnou
        const layout = homesteadLayout(square, variant);
        const inHouse = (x: number, z: number): boolean => {
          const c = Math.cos(house.rotation);
          const s = Math.sin(house.rotation);
          const lx = (x - house.x) * c - (z - house.z) * s;
          const lz = (x - house.x) * s + (z - house.z) * c;
          return (
            Math.abs(lx) < shapeX(frame, halfX) && lz < shapeZ(frame, front) && lz > -back * 1.1
          );
        };
        for (const bed of layout.beds) {
          for (const dx of [-bed.length / 2, 0, bed.length / 2]) {
            expect(inHouse(bed.x + dx, bed.z)).toBe(false);
          }
        }
      }
    }
  });

  it('dvorec variantu nemá', () => {
    const square: PlotSquare = { x: 0, z: 0, size: 15, yard: { x: 0, z: -15 } };
    expect(houseFrame(square, 'center' as PlotVariant, plotHouse(square, 'center'))).toBe(
      PLAIN_FRAME,
    );
  });
});
