import { describe, expect, it } from 'vitest';
import type { SceneFieldPart } from '../../village-view';
import { cellsBoundary } from '../field-cells';
import {
  CROP_KINDS,
  LOOK_STYLES,
  ROW_M,
  STEP_M,
  decalPieces,
  fieldPlants,
  fieldStaking,
  patchNoise,
  raggedCoverage,
} from '../field-crops';
import { FIELD_LOOKS, workAt, workFrame, type FieldLook, type PartView } from '../field-look';

const part = (cx: number, cy: number): SceneFieldPart => ({
  id: cx * 100 + cy,
  cell: { x: cx, y: cy },
  x: cx * 15 + 7.5,
  z: cy * 15 + 7.5,
  size: 15,
  stage: 'sown',
});

const view = (
  p: SceneFieldPart,
  look: FieldLook | null,
  extra: Partial<PartView> = {},
): PartView => ({
  part: p,
  look,
  work: null,
  before: null,
  staked: false,
  order: 0,
  ...extra,
});

/** Ves leží na −x – práce na dílech jde k +x. */
const CENTER = { x: -50, z: 7.5 };
const ROWS: [number, number] = [0, 1];
const all = (): number => 1;

describe('vzhled dílů – styl kreslení', () => {
  it('každý vzhled má styl; zralé, strniště a zoraná zem se liší texturou nebo barvou', () => {
    for (const look of FIELD_LOOKS) expect(LOOK_STYLES[look]).toBeDefined();
    const key = (look: FieldLook): string =>
      JSON.stringify([LOOK_STYLES[look].texture, LOOK_STYLES[look].tint]);
    expect(
      new Set(['ripe', 'stubble', 'plowed', 'sown'].map((l) => key(l as FieldLook))).size,
    ).toBe(4);
    // obilí roste: vzcházející < zelené < zralé
    expect(LOOK_STYLES.sprouted.crop!.height).toBeLessThan(LOOK_STYLES.green.crop!.height);
    expect(LOOK_STYLES.green.crop!.height).toBeLessThan(LOOK_STYLES.ripe.crop!.height);
    // panáky jen na žni, plevel jen na mladém úhoru, pastvina bez trsů
    expect(FIELD_LOOKS.filter((l) => LOOK_STYLES[l].stooks)).toEqual(['harvesting']);
    expect(FIELD_LOOKS.filter((l) => LOOK_STYLES[l].weeds > 0)).toEqual(['young-fallow', 'meadow']);
    expect(FIELD_LOOKS.filter((l) => LOOK_STYLES[l].hay)).toEqual(['mown', 'haystacks']);
    expect(LOOK_STYLES.pasture.crop).toBeNull();
  });
});

describe('obtisky dílů', () => {
  it('celý díl = jeden kus, vytyčený díl se nekreslí', () => {
    const p = part(0, 0);
    expect(decalPieces([view(p, 'plowed')], ROWS, CENTER)).toHaveLength(1);
    expect(decalPieces([view(p, null, { staked: true })], ROWS, CENTER)).toHaveLength(0);
  });

  it('rozpracovaný díl: hotová část u vsi, zbytek za čarou práce – po pruzích sítě', () => {
    const p = part(0, 0);
    const pieces = decalPieces([view(p, 'plowed', { work: 0.3, before: 'stubble' })], ROWS, CENTER);
    expect(pieces.map((x) => x.look)).toEqual(['plowed', 'stubble']);
    const [done, rest] = pieces;
    // 0,3 → 2 pruhy z 8 (0,25 dílu): 3,75 m hotových u vsi (−x)
    expect(done!.bounds.minX).toBeCloseTo(0);
    expect(done!.bounds.maxX).toBeCloseTo(3.75);
    expect(rest!.bounds.minX).toBeCloseTo(3.75);
    expect(rest!.bounds.maxX).toBeCloseTo(15);
    // zakládaný díl: zbytek je louka (nekreslí se)
    expect(decalPieces([view(p, 'bare', { work: 0.5 })], ROWS, CENTER)).toHaveLength(1);
  });
});

describe('trsy obilí, panáky a plevel', () => {
  it('zralé obilí v řádcích podél pole – asi tolik trsů, kolik míst v řádcích', () => {
    const p = part(0, 0);
    const plants = fieldPlants([view(p, 'ripe')], ROWS, CENTER, all);
    const places = Math.floor(15 / ROW_M) * Math.floor(15 / STEP_M);
    expect(plants.crops.ripe.length).toBe(places);
    for (const kind of CROP_KINDS) if (kind !== 'ripe') expect(plants.crops[kind]).toHaveLength(0);
    for (const c of plants.crops.ripe) {
      expect(Math.abs(c.x - p.x)).toBeLessThanOrEqual(7.5);
      expect(Math.abs(c.z - p.z)).toBeLessThanOrEqual(7.5);
      expect(c.height).toBeGreaterThan(0.8);
    }
  });

  it('je deterministické a u meze trsy řídnou', () => {
    const p = part(0, 0);
    const a = fieldPlants([view(p, 'green')], ROWS, CENTER, all);
    const b = fieldPlants([view(p, 'green')], ROWS, CENTER, all);
    expect(a).toEqual(b);
    const edge = raggedCoverage([p], 1.6);
    const soft = fieldPlants([view(p, 'green')], ROWS, CENTER, edge);
    expect(soft.crops.green.length).toBeLessThan(a.crops.green.length);
    expect(soft.crops.green.length).toBeGreaterThan(a.crops.green.length * 0.6);
  });

  it('žeň: panáky jen na sklizené části (kus za čarou), zralé obilí jen na nesklizené', () => {
    const p = part(0, 0);
    const frame = workFrame(p, ROWS, CENTER);
    const plants = fieldPlants(
      [view(p, 'harvesting', { work: 0.5, before: 'ripe' })],
      ROWS,
      CENTER,
      all,
    );
    expect(plants.stooks.length).toBeGreaterThan(0);
    for (const s of plants.stooks) expect(workAt(frame, p, s.x, s.z)).toBeLessThan(0.5);
    for (const c of plants.crops.ripe)
      expect(workAt(frame, p, c.x, c.z)).toBeGreaterThanOrEqual(0.5);
    for (const c of plants.crops.stubble) expect(workAt(frame, p, c.x, c.z)).toBeLessThan(0.5);
  });

  it('louka na seno: kupky v červenci, stohy na otavě, na jaře nic', () => {
    const parts = [part(0, 0), part(1, 0), part(0, 1), part(1, 1)];
    const plants = (look: FieldLook, day: number): ReturnType<typeof fieldPlants> =>
      fieldPlants(
        parts.map((p) => view(p, look)),
        ROWS,
        CENTER,
        all,
        day,
      );
    expect(plants('mown', 186).hay.length).toBe(16);
    expect(plants('haystacks', 220).hay.length).toBe(2);
    expect(plants('meadow', 120).hay).toHaveLength(0);
    expect(plants('meadow', 120).weeds.length).toBeGreaterThan(50);
  });

  it('mladý úhor má plevel, pastvina a oranice nic', () => {
    const p = part(0, 0);
    expect(fieldPlants([view(p, 'young-fallow')], ROWS, CENTER, all).weeds.length).toBeGreaterThan(
      5,
    );
    const pasture = fieldPlants([view(p, 'pasture')], ROWS, CENTER, all);
    expect(pasture.weeds).toHaveLength(0);
    expect(CROP_KINDS.every((k) => pasture.crops[k].length === 0)).toBe(true);
  });
});

describe('vytyčení pole', () => {
  it('provázek po obrysu zakládaných dílů, kolíky v rozích a po čtvercích, drobné uvnitř', () => {
    const parts = [part(0, 0), part(1, 0), part(0, 1), part(1, 1)];
    const staking = fieldStaking(parts.map((p) => view(p, null, { staked: true })));
    expect(staking.lines).toEqual(cellsBoundary(parts));
    // obrys 30 × 30 m: 4 rohy + 4 kolíky uprostřed stran, uprostřed jeden drobný
    expect(staking.pegs.filter((p) => p.scale === 1)).toHaveLength(4);
    expect(staking.pegs.filter((p) => p.scale < 1 && p.scale > 0.6)).toHaveLength(4);
    expect(staking.pegs.filter((p) => p.scale <= 0.6)).toHaveLength(1);
  });

  it('hotové díly vytyčení ztratí; bez zakládaných dílů žádné', () => {
    const parts = [part(0, 0), part(1, 0)];
    const staking = fieldStaking([
      view(parts[0]!, 'bare', { staked: true, work: 0.5 }),
      view(parts[1]!, 'bare'),
    ]);
    expect(staking.lines).toEqual(cellsBoundary([parts[0]!]));
    expect(fieldStaking(parts.map((p) => view(p, 'plowed')))).toEqual({ pegs: [], lines: [] });
  });
});

describe('šum skvrn a okraje', () => {
  it('skvrny 0–1, okraj pole uvnitř 1 a venku 0', () => {
    for (let i = 0; i < 50; i++) {
      const n = patchNoise(i * 3.7, i * 1.3);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
    const p = part(0, 0);
    const c = raggedCoverage([p], 1.6);
    expect(c(p.x, p.z)).toBe(1);
    expect(c(-5, p.z)).toBe(0);
    const edge = c(0.4, p.z);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });
});
