import { describe, expect, it } from 'vitest';
import { generateLandscape, tileCenterWorld, surfaceAt } from '../../landscape';
import {
  checkDwellingPlacement,
  fieldPartsFromOutline,
  villageDwellingPositions,
  type PlacementVillage,
} from '../placement';
import { DWELLING_FOOTPRINT_M, FIELD_LIMITS } from '../rules';
import type { Position } from '../types';
import { makeLandscape, square } from './placement-fixtures';

const at = (x: number, z: number, rotation = 0): Position => ({ x, z, rotation });
const EMPTY: PlacementVillage = { dwellings: [], constructions: [], fields: [] };

describe('DWELLING_FOOTPRINT_M', () => {
  it('zemnice má půdorys 4 × 4 m, polozemnice 5 × 5 m', () => {
    expect(DWELLING_FOOTPRINT_M.zemnice).toEqual({ width: 4, depth: 4 });
    expect(DWELLING_FOOTPRINT_M.polozemnice).toEqual({ width: 5, depth: 5 });
  });
});

describe('checkDwellingPlacement – terén', () => {
  it('na rovné louce jde stavět', () => {
    const check = checkDwellingPlacement(makeLandscape(), null, 'zemnice', at(7.5, 7.5));
    expect(check).toEqual({ ok: true, reason: null });
  });

  it('mimo krajinu stavět nejde', () => {
    const check = checkDwellingPlacement(makeLandscape(), null, 'zemnice', at(119, 0));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/krajiny/);
  });

  it('ve vodě stavět nejde', () => {
    const l = makeLandscape({ surface: (x) => (x === 8 ? 'water' : 'meadow') });
    const check = checkDwellingPlacement(l, null, 'zemnice', at(7.5, 7.5));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/vod/);
  });

  it('v lese stavět nejde – ani když do lesa zasahuje jen roh půdorysu', () => {
    const l = makeLandscape({ surface: (x) => (x === 8 ? 'forest' : 'meadow') });
    const inForest = checkDwellingPlacement(l, null, 'zemnice', at(7.5, 7.5));
    expect(inForest.ok).toBe(false);
    expect(inForest.reason).toMatch(/louce/);
    // políčko 8 začíná na x = 0, půdorys u x = −1 zasahuje 1 m do lesa
    expect(checkDwellingPlacement(l, null, 'zemnice', at(-1, 7.5)).ok).toBe(false);
    expect(checkDwellingPlacement(l, null, 'zemnice', at(-3, 7.5)).ok).toBe(true);
  });

  it('na příliš prudkém svahu stavět nejde, na mírném ano', () => {
    const steep = makeLandscape({ height: (x) => x * 2 }); // 4 m půdorysu ≈ 0,53 m
    const gentle = makeLandscape({ height: (x) => x * 1.5 }); // ≈ 0,4 m
    const check = checkDwellingPlacement(steep, null, 'zemnice', at(7.5, 7.5));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/nerovná/);
    expect(checkDwellingPlacement(gentle, null, 'zemnice', at(7.5, 7.5)).ok).toBe(true);
  });

  it('otočení půdorysu se počítá – po úhlopříčce je svah delší', () => {
    const l = makeLandscape({ height: (x) => x * 1.5 }); // úhlopříčka 5,66 m ≈ 0,57 m
    expect(checkDwellingPlacement(l, null, 'zemnice', at(7.5, 7.5, 0)).ok).toBe(true);
    expect(checkDwellingPlacement(l, null, 'zemnice', at(7.5, 7.5, Math.PI / 4)).ok).toBe(false);
  });

  it('větší polozemnice na stejném svahu neprojde, kde zemnice ano', () => {
    const l = makeLandscape({ height: (x) => x * 1.6 }); // 4 m ≈ 0,43 m, 5 m ≈ 0,53 m
    expect(checkDwellingPlacement(l, null, 'zemnice', at(7.5, 7.5)).ok).toBe(true);
    expect(checkDwellingPlacement(l, null, 'polozemnice', at(7.5, 7.5)).ok).toBe(false);
  });

  it('neplatná čísla polohy neprojdou', () => {
    expect(checkDwellingPlacement(makeLandscape(), null, 'zemnice', at(NaN, 0)).ok).toBe(false);
  });
});

describe('checkDwellingPlacement – překryv', () => {
  const landscape = makeLandscape();
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: at(0, 0) }],
    constructions: [{ dwellingType: 'polozemnice', position: at(30, 0) }],
    fields: [{ outline: square(-60, 30, 40) }],
  };

  it('nesmí se překrývat s obydlím', () => {
    const check = checkDwellingPlacement(landscape, village, 'zemnice', at(3, 1));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/obydlím/);
    expect(checkDwellingPlacement(landscape, village, 'zemnice', at(10, 0)).ok).toBe(true);
  });

  it('nesmí se překrývat s rozestavěným obydlím', () => {
    const check = checkDwellingPlacement(landscape, village, 'zemnice', at(33, 0));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/rozestavěným/);
  });

  it('nesmí stát v poli', () => {
    const check = checkDwellingPlacement(landscape, village, 'zemnice', at(-40, 45));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/polem/);
    // těsně vedle pole (hrana pole x = −20, půdorys do −20,5)
    expect(checkDwellingPlacement(landscape, village, 'zemnice', at(-18, 45)).ok).toBe(true);
  });
});

describe('fieldPartsFromOutline – díly po políčkách', () => {
  const landscape = makeLandscape({ fertility: (x) => (x < 8 ? 40 : 80) });
  const home = [at(0, -100)];

  it('čtverec uvnitř jednoho políčka dá jeden díl s plochou čtverce', () => {
    const result = fieldPartsFromOutline(landscape, null, square(2, 2, 10), home);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toMatchObject({
      surface: 'meadow',
      obstacleCost: 0,
      naturalFertility: 80,
      cell: { x: 8, y: 8 },
    });
    expect(result.parts[0]?.areaM2).toBeCloseTo(100);
    expect(result.areaM2).toBeCloseTo(100);
    // vzdálenost od středu políčka (7,5; 7,5) k obydlí (0; −100)
    expect(result.parts[0]?.distanceM).toBeCloseTo(Math.hypot(7.5, 107.5));
  });

  it('malé pole neprojde nejmenší výměrou', () => {
    const result = fieldPartsFromOutline(landscape, null, square(2, 2, 10), home);
    expect(result.check.ok).toBe(false);
    expect(result.check.reason).toMatch(/0,1 ha/);
  });

  it('čtverec přes roh čtyř políček se rozdělí na čtyři díly', () => {
    const result = fieldPartsFromOutline(landscape, null, square(-12, -12, 24), home);
    expect(result.parts).toHaveLength(4);
    for (const part of result.parts) expect(part.areaM2).toBeCloseTo(144);
    expect(result.areaM2).toBeCloseTo(576);
    expect(result.parts.map((p) => p.cell)).toEqual([
      { x: 7, y: 7 },
      { x: 8, y: 7 },
      { x: 7, y: 8 },
      { x: 8, y: 8 },
    ]);
  });

  it('průměrná úrodnost je vážená plochou dílů', () => {
    // 2/3 plochy v úrodnosti 40 (x < 0), 1/3 v úrodnosti 80
    const result = fieldPartsFromOutline(
      landscape,
      null,
      [
        [-30, 0],
        [15, 0],
        [15, 30],
        [-30, 30],
      ],
      home,
    );
    expect(result.averageFertility).toBeCloseTo((40 * 2 + 80) / 3);
  });

  it('trojúhelník: celé, poloviční a jen vrcholem dotčené políčko', () => {
    const result = fieldPartsFromOutline(
      landscape,
      null,
      [
        [0, 0],
        [30, 0],
        [0, 30],
      ],
      home,
    );
    expect(result.parts.map((p) => p.areaM2)).toEqual([225, 112.5, 112.5]);
    expect(result.areaM2).toBeCloseTo(450);
  });

  it('dost velké pole projde, cena je 40 člověkodní za hektar louky', () => {
    const result = fieldPartsFromOutline(landscape, null, square(-20, -20, 40), home);
    expect(result.check).toEqual({ ok: true, reason: null });
    expect(result.parts).toHaveLength(16);
    expect(result.areaM2).toBeCloseTo(1600);
    expect(result.foundingCost).toBeCloseTo(40 * 0.16);
    expect(result.areaM2).toBeGreaterThanOrEqual(FIELD_LIMITS.minAreaM2);
  });

  it('opakovaný bod a uzavírající bod obrysu nevadí', () => {
    const outline: [number, number][] = [...square(-20, -20, 40), [-20, -20]];
    outline.splice(1, 0, [-20, -20]);
    const result = fieldPartsFromOutline(landscape, null, outline, home);
    expect(result.check.ok).toBe(true);
    expect(result.areaM2).toBeCloseTo(1600);
  });
});

describe('fieldPartsFromOutline – co pole nesmí', () => {
  const home = [at(0, -100)];

  it('obrys s méně než 3 body nebo křížící se obrys neprojde', () => {
    const l = makeLandscape();
    const short = fieldPartsFromOutline(
      l,
      null,
      [
        [0, 0],
        [30, 0],
      ],
      home,
    );
    expect(short.check.ok).toBe(false);
    expect(short.parts).toHaveLength(0);
    const bow = fieldPartsFromOutline(
      l,
      null,
      [
        [0, 0],
        [40, 40],
        [40, 0],
        [0, 40],
      ],
      home,
    );
    expect(bow.check.ok).toBe(false);
    expect(bow.check.reason).toMatch(/křížit/);
  });

  it('pole zasahující do vody neprojde', () => {
    const l = makeLandscape({ surface: (x) => (x === 9 ? 'water' : 'meadow') });
    const result = fieldPartsFromOutline(l, null, square(-20, -20, 40), home);
    expect(result.check.ok).toBe(false);
    expect(result.check.reason).toMatch(/vod/);
  });

  it('díly v lese se zahodí – počítá se jen louka', () => {
    const l = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });
    const result = fieldPartsFromOutline(l, null, square(-40, -20, 60), home);
    expect(result.areaM2).toBeCloseTo(40 * 60);
    expect(result.parts.every((p) => p.cell !== undefined && p.cell.x < 8)).toBe(true);
    expect(result.check.ok).toBe(true);
  });

  it('pole celé v lese nemá žádný díl a neprojde', () => {
    const l = makeLandscape({ surface: () => 'forest' });
    const result = fieldPartsFromOutline(l, null, square(-20, -20, 40), home);
    expect(result.parts).toHaveLength(0);
    expect(result.check.ok).toBe(false);
  });

  it('pole mimo krajinu neprojde', () => {
    const result = fieldPartsFromOutline(makeLandscape(), null, square(100, 0, 40), home);
    expect(result.check.ok).toBe(false);
    expect(result.check.reason).toMatch(/krajiny/);
  });

  it('pole se nesmí překrývat s jiným polem, sousedit s ním smí', () => {
    const l = makeLandscape();
    const village: PlacementVillage = { ...EMPTY, fields: [{ outline: square(-20, -20, 40) }] };
    const over = fieldPartsFromOutline(l, village, square(0, 0, 40), home);
    expect(over.check.ok).toBe(false);
    expect(over.check.reason).toMatch(/polem/);
    expect(fieldPartsFromOutline(l, village, square(20, -20, 40), home).check.ok).toBe(true);
  });

  it('pole se nesmí překrývat s obydlím ani s plánovaným obydlím', () => {
    const l = makeLandscape();
    const village: PlacementVillage = {
      ...EMPTY,
      dwellings: [{ type: 'zemnice', position: at(0, 0) }],
    };
    expect(fieldPartsFromOutline(l, village, square(-20, -20, 40), home).check.ok).toBe(false);
    const planned = fieldPartsFromOutline(l, null, square(-20, -20, 40), [at(0, 0)]);
    expect(planned.check.ok).toBe(false);
    expect(planned.check.reason).toMatch(/obydlím/);
  });

  it('pole dál než 800 m od obydlí neprojde', () => {
    const l = makeLandscape({ size: 64 }); // 960 m
    const far = fieldPartsFromOutline(l, null, square(400, 400, 40), [at(-400, -400)]);
    expect(far.check.ok).toBe(false);
    expect(far.check.reason).toMatch(/800 m/);
    const near = fieldPartsFromOutline(l, null, square(-300, -300, 40), [at(-400, -400)]);
    expect(near.check.ok).toBe(true);
  });

  it('bez obydlí je každý díl moc daleko', () => {
    const result = fieldPartsFromOutline(makeLandscape(), null, square(-20, -20, 40), []);
    expect(result.check.ok).toBe(false);
  });
});

describe('villageDwellingPositions', () => {
  it('vrátí polohy obydlí i rozestavěných obydlí', () => {
    const village: PlacementVillage = {
      dwellings: [{ type: 'zemnice', position: at(1, 2) }],
      constructions: [
        { dwellingType: 'polozemnice', position: at(3, 4) },
        { dwellingType: null, position: null },
      ],
      fields: [],
    };
    expect(villageDwellingPositions(village)).toEqual([at(1, 2), at(3, 4)]);
    expect(villageDwellingPositions(null)).toEqual([]);
  });
});

describe('umístění na vygenerované krajině', () => {
  // U místa vsi najde první políčko, kde zemnice uprostřed projde, a pole vedle ní.
  const findSpot = (seed: number): { dwelling: Position; field: [number, number][] } | null => {
    const l = generateLandscape(seed);
    const { x: sx, y: sy } = l.villageSite;
    for (let r = 0; r < 10; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = sx + dx;
          const ty = sy + dy;
          if (surfaceAt(l, tx, ty) !== 'meadow') continue;
          const c = tileCenterWorld(l, tx, ty);
          const dwelling = at(c.x, c.z);
          if (!checkDwellingPlacement(l, null, 'zemnice', dwelling).ok) continue;
          const field = square(c.x + 5, c.z - 20, 40);
          if (fieldPartsFromOutline(l, null, field, [dwelling]).check.ok)
            return { dwelling, field };
        }
      }
    }
    return null;
  };

  it('u místa vsi jde postavit zemnici a založit pole (5 krajin)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(findSpot(seed), `seed ${seed}`).not.toBeNull();
    }
  });

  it('díly pole na vygenerované krajině nesou úrodnost svého políčka', () => {
    const l = generateLandscape(3);
    const spot = findSpot(3);
    expect(spot).not.toBeNull();
    const result = fieldPartsFromOutline(l, null, spot!.field, [spot!.dwelling]);
    for (const part of result.parts) {
      expect(part.naturalFertility).toBe(l.fertility[part.cell!.y * l.size + part.cell!.x]);
    }
    expect(result.parts.reduce((s, p) => s + p.areaM2, 0)).toBeCloseTo(result.areaM2);
  });
});
