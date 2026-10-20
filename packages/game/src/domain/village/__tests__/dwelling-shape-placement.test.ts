import { describe, expect, it } from 'vitest';
import { packObstacles, type ObstaclePlacement } from '../../landscape';
import { foundVillage } from '../actions';
import { dwellingShape, shapedFootprint } from '../dwelling-shape';
import { dwellingClearing } from '../obstacles';
import { checkDwellingPlacement, type PlacementVillage } from '../placement';
import { DWELLING_FOOTPRINT_M } from '../rules';
import { withDwellingShapes } from '../shape-migration';
import type { Dwelling, Position, VillageState } from '../types';
import { clearingRect, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// population.md – Varianty rozměrů (Martin, GitHub #1): kontrola umístění počítá se skutečným
// tvarem varianty a starší vsi dostanou variantu ze své polohy, nebo dnešní tvar, kdyby větší
// varianta zasáhla jinou stavbu.

const landscape = makeLandscape({ size: 32 });
const at = (x: number, z: number, rotation = 0): Position => ({ x, z, rotation });
const halfWidth = (p: Position): number =>
  shapedFootprint('zemnice', dwellingShape({ type: 'zemnice', position: p })).width / 2;

/**
 * Dvojice zemnic v řadě (natočení 0), jejichž dnešní půdorysy by se minuly o 0,1 m, ale varianty
 * se překrývají – hledá se od `fromX` po 0,37 m.
 */
function overlappingPair(fromX: number, bFitsPlain = false): { a: Position; b: Position } {
  const gap = DWELLING_FOOTPRINT_M.zemnice.width + 0.1;
  const plainHalf = DWELLING_FOOTPRINT_M.zemnice.width / 2;
  for (let x = fromX; x < fromX + 200; x += 0.37) {
    const a = at(x, 20);
    const b = at(x + gap, 20);
    if (halfWidth(a) + halfWidth(b) <= gap + 0.05) continue;
    // b se vejde vedle dnešního tvaru a
    if (bFitsPlain && plainHalf + halfWidth(b) > gap - 0.05) continue;
    return { a, b };
  }
  throw new Error('Žádná dvojice větších variant.');
}

describe('kontrola umístění se skutečným tvarem', () => {
  it('větší varianta se s obydlím vedle překrývá, i když by se dnešní tvar vešel', () => {
    const { a, b } = overlappingPair(-150);
    const village: PlacementVillage = {
      dwellings: [{ type: 'zemnice', position: a }],
      constructions: [],
      parts: [],
    };
    const check = checkDwellingPlacement(landscape, village, 'zemnice', b);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/obydlím/);
    // o kus dál – za oběma variantami – se vejde
    const far = at(b.x + 0.5, b.z);
    const fits = halfWidth(a) + halfWidth(far) < far.x - a.x;
    expect(checkDwellingPlacement(landscape, village, 'zemnice', far).ok).toBe(fits);
  });

  it('vyklízená plocha je podle varianty – překážky u okraje se platí podle ní', () => {
    // místo, kde se staveniště napříč rozšíří aspoň o 0,2 m
    let position = at(0, 0);
    for (let x = -100; x < 100; x += 0.53) {
      position = at(x, 40);
      if (clearingRect('zemnice', position).maxX > position.x + 4.8 + 0.2) break;
    }
    const edgeX = position.x + 4.8 + 0.1;
    const layer = packObstacles([stone(1, edgeX, position.z)], 32, 15);
    const check = checkDwellingPlacement(landscape, null, 'zemnice', position, layer);
    expect(check.ok).toBe(true);
    expect(check.obstacleIds).toEqual([1]);
    const clearing = dwellingClearing(
      'zemnice',
      position,
      dwellingShape({ type: 'zemnice', position }),
    );
    expect(Math.max(...clearing.map(([x]) => x))).toBeCloseTo(
      clearingRect('zemnice', position).maxX,
      9,
    );
  });
});

function stone(id: number, x: number, z: number): ObstaclePlacement {
  return { id, kind: 'stone', look: 'stone-1', x, z, rotation: 0, scale: 1 };
}

/** Ves uložená před variantami – obydlí na daných místech, bez příznaku kontroly tvarů. */
function oldVillage(positions: readonly Position[]): VillageState {
  const state = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: 1000, dwellingPosition: at(-200, -200) }),
  );
  for (const position of positions) {
    const dwelling: Dwelling = {
      id: state.nextId++,
      type: 'zemnice',
      builtDay: 1000,
      condition: 1,
      position: { ...position },
    };
    state.dwellings.push(dwelling);
  }
  delete state.shapesChecked;
  return state;
}

describe('starší vsi (withDwellingShapes)', () => {
  it('stavba, jejíž větší varianta by zasáhla souseda, zůstane v dnešním tvaru', () => {
    const { a, b } = overlappingPair(-150, true);
    const lone = at(150, 150);
    const state = oldVillage([a, b, lone]);
    const migrated = withDwellingShapes(state, landscape, packObstacles([], 32, 15));
    expect(migrated.shapesChecked).toBe(true);
    const flag = (p: Position): boolean | undefined =>
      migrated.dwellings.find((d) => d.position.x === p.x && d.position.z === p.z)?.plainShape;
    // první z dvojice (menší id) se kontroluje proti variantě druhého – zmenší se; druhý se pak
    // vejde vedle dnešního tvaru prvního
    expect(flag(a)).toBe(true);
    expect(flag(b)).toBeUndefined();
    expect(flag(lone)).toBeUndefined();
    // podruhé se nic nemění
    expect(withDwellingShapes(migrated, landscape)).toBe(migrated);
    // původní stav zůstal beze změny
    expect(state.shapesChecked).toBeUndefined();
  });

  it('překážky, které větší staveniště nově zabere, se odstraní – menší je nevrací', () => {
    let position = at(0, 0);
    for (let x = -100; x < 100; x += 0.53) {
      position = at(x, 80);
      if (clearingRect('zemnice', position).maxX > position.x + 4.8 + 0.2) break;
    }
    const layer = packObstacles([stone(7, position.x + 4.8 + 0.1, position.z)], 32, 15);
    const state = oldVillage([position]);
    const migrated = withDwellingShapes(state, landscape, layer);
    expect(migrated.dwellings.at(-1)!.plainShape).toBeUndefined();
    expect(migrated.clearedObstacles?.map((o) => o.id)).toContain(7);
  });

  it('nová ves má kontrolu hotovou – první zemnice má variantu od umístění', () => {
    const state = foundVillage({ seed: 5, day: 1000, dwellingPosition: at(10, 10) });
    const migrated = withDwellingShapes(state, landscape, packObstacles([], 32, 15));
    expect(migrated.constructions.every((c) => !c.plainShape)).toBe(true);
  });
});
