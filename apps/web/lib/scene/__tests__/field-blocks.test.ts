import { describe, expect, it } from 'vitest';
import type { SceneFieldPart } from '../../village-view';
import {
  FIELD_BLOCK,
  fieldBlockContent,
  fieldBlockOf,
  groupFieldBlocks,
  mergeFieldBlocks,
  type FieldBlockContent,
} from '../field-blocks';
import { fieldPlants, raggedCoverage } from '../field-crops';
import { FIELD_LOOKS, type FieldLook, type PartView } from '../field-look';

const part = (cx: number, cy: number, extra: Partial<SceneFieldPart> = {}): SceneFieldPart => ({
  id: cx * 100 + cy,
  cell: { x: cx, y: cy },
  x: cx * 15 + 7.5,
  z: cy * 15 + 7.5,
  size: 15,
  stage: 'sown',
  ...extra,
});

/** Pole 19 × 13 dílů (přes hranice bloků) se všemi vzhledy, rozpracovanými díly a luštěninami. */
function fieldViews(): PartView[] {
  const views: PartView[] = [];
  let k = 0;
  for (let cy = 3; cy < 16; cy++) {
    for (let cx = 5; cx < 24; cx++) {
      const look: FieldLook = FIELD_LOOKS[k % FIELD_LOOKS.length]!;
      const p = part(cx, cy, k % 7 === 0 ? { crop: 'legume' } : {});
      const working = k % 5 === 0;
      views.push({
        part: p,
        look,
        work: working ? (k % 9) / 9 : null,
        before: working ? 'plowed' : null,
        staked: k % 11 === 0,
        order: k,
      });
      k++;
    }
  }
  return views;
}

const ROWS: [number, number] = [0.6, 0.8];
const CENTER = { x: -40, z: 30 };

/** Sítě obtisku po texturách jako seřazené řetězce (pořadí sítí na vzhled nemá vliv). */
function layerGrids(content: { layers: FieldBlockContent['layers'] }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, layer] of content.layers) {
    out[key] = layer.grids
      .map((grid, i) =>
        JSON.stringify([
          [...grid.positions],
          [...grid.alphas],
          [...grid.indices],
          layer.colors[i],
          layer.alphas[i],
        ]),
      )
      .sort();
  }
  return out;
}

describe('pole po blocích dílů', () => {
  it('díly se dělí do bloků 8 × 8 políček', () => {
    expect(FIELD_BLOCK).toBe(8);
    expect(fieldBlockOf({ x: 7, y: 0 })).toBe('0,0');
    expect(fieldBlockOf({ x: 8, y: 15 })).toBe('1,1');
    const blocks = groupFieldBlocks(fieldViews());
    expect([...blocks.keys()]).toEqual(['0,0', '1,0', '2,0', '0,1', '1,1', '2,1']);
    expect([...blocks.values()].reduce((sum, b) => sum + b.length, 0)).toBe(19 * 13);
  });

  // 165 = seč (řádky sena), 185 = kupky, 196 = stohy, 300 = podzim
  for (const day of [120, 165, 185, 196, 300]) {
    it(`spojené bloky = celé pole najednou (obtisky, řádky sena, rostliny v pořadí; den ${day})`, () => {
      const views = fieldViews();
      const coverage = raggedCoverage(
        views.map((v) => v.part),
        1.6,
      );
      const whole = fieldBlockContent(views, ROWS, CENTER, coverage, day);
      const blocks = [...groupFieldBlocks(views).values()].map((blockViews) =>
        fieldBlockContent(blockViews, ROWS, CENTER, coverage, day),
      );
      const merged = mergeFieldBlocks(views, blocks);
      // rostliny přesně jako fieldPlants celého pole – i pořadí (plevel se dělí podle pořadí)
      expect(merged.plants).toEqual(fieldPlants(views, ROWS, CENTER, coverage, day));
      expect(mergeFieldBlocks(views, [whole]).plants).toEqual(merged.plants);
      expect(layerGrids(merged)).toEqual(layerGrids(whole));
      if (day === 165) expect(merged.swaths.length).toBeGreaterThan(0);
      expect(merged.swaths.map((g) => [...g.positions].join()).sort()).toEqual(
        whole.swaths.map((g) => [...g.positions].join()).sort(),
      );
    });
  }
});
