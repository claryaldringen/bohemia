// Natočené pole (fields.md – Natočené stavby) ve scéně bez Babylonu: obtisky, trsy, panáky
// a vytyčení se počítají v „rovném prostoru“ mřížky pole (field-cells.ts – `GridFrame`), kde jsou
// čtverce v osách jako políčka krajiny – stejnými funkcemi jako nenatočené pole. Výsledek se pak
// otočí do světa: polohy sítí obtisků, rostlin a kolíků kolem prvního čtverce, natočení rostlin
// o natočení pole.
import { gridFrame, isRotatedSquare, type CellSquare, type GridFrame } from './field-cells';
import type { CanopyMesh } from './field-canopy';
import type { FieldPlants, Peg, PlantInstance } from './field-crops';
import type { DecalGrid, Point } from './village-layout';

/** Převod natočeného pole mezi světem a rovným prostorem jeho mřížky. */
export interface FieldSpace {
  frame: GridFrame;
  /** Natočení pole (rad) – přičte se k natočení rostlin. */
  rotation: number;
  /** Čtverec do rovného prostoru (bez natočení). */
  square<T extends CellSquare>(square: T): T;
  /** Bod světa do rovného prostoru. */
  point(p: { x: number; z: number }): { x: number; z: number };
  /** Směr (jednotkový vektor) z rovného prostoru do světa. */
  direction(d: readonly [number, number]): Point;
  /** Síť obtisku z rovného prostoru do světa (kopie). */
  grid(grid: DecalGrid): DecalGrid;
  /** Koruna porostu z rovného prostoru do světa (kopie – výšky a barvy beze změny, směry řádků otočené). */
  canopy(canopy: CanopyMesh): CanopyMesh;
  /** Rostliny z rovného prostoru do světa. */
  plants(plants: FieldPlants): FieldPlants;
  /** Čáry z rovného prostoru do světa. */
  lines(lines: readonly Point[][]): Point[][];
  /** Kolíky z rovného prostoru do světa. */
  pegs(pegs: readonly Peg[]): Peg[];
}

/** Rovný prostor natočeného pole podle jeho čtverců; nenatočené pole null (počítá se ve světě). */
export function fieldSpace(squares: readonly CellSquare[]): FieldSpace | null {
  const first = squares[0];
  if (!first || !isRotatedSquare(first)) return null;
  const frame = gridFrame(first);
  const rotation = first.rotation!;
  const toWorld = (x: number, z: number): Point => frame.toWorld(x, z);
  const [ox, oz] = toWorld(0, 0);
  const direction = (dx: number, dz: number): Point => {
    const [x, z] = toWorld(dx, dz);
    return [x - ox, z - oz];
  };
  const plant = (p: PlantInstance): PlantInstance => {
    const [x, z] = toWorld(p.x, p.z);
    return { ...p, x, z, rotation: p.rotation + rotation };
  };
  return {
    frame,
    rotation,
    square: (square) => {
      const [x, z] = frame.toSpace(square.x, square.z);
      const { rotation: _turned, ...rest } = square;
      void _turned;
      return { ...rest, x, z } as typeof square;
    },
    point: (p) => {
      const [x, z] = frame.toSpace(p.x, p.z);
      return { x, z };
    },
    direction: (d) => direction(d[0], d[1]),
    grid: (grid) => {
      const positions = new Float32Array(grid.positions.length);
      for (let k = 0; k < positions.length; k += 2) {
        const [x, z] = toWorld(grid.positions[k]!, grid.positions[k + 1]!);
        positions[k] = x;
        positions[k + 1] = z;
      }
      return { positions, alphas: grid.alphas, indices: grid.indices };
    },
    canopy: (canopy) => {
      const positions = new Float32Array(canopy.positions.length);
      for (let k = 0; k < positions.length; k += 2) {
        const [x, z] = toWorld(canopy.positions[k]!, canopy.positions[k + 1]!);
        positions[k] = x;
        positions[k + 1] = z;
      }
      const rows = new Float32Array(canopy.rows.length);
      for (let k = 0; k < rows.length; k += 2) {
        const [x, z] = direction(canopy.rows[k]!, canopy.rows[k + 1]!);
        rows[k] = x;
        rows[k + 1] = z;
      }
      return { ...canopy, positions, rows };
    },
    plants: (plants) => ({
      crops: Object.fromEntries(
        Object.entries(plants.crops).map(([kind, list]) => [kind, list.map(plant)]),
      ) as FieldPlants['crops'],
      stooks: plants.stooks.map(plant),
      heaps: plants.heaps.map(plant),
      weeds: plants.weeds.map(plant),
      hay: plants.hay.map(plant),
    }),
    lines: (lines) => lines.map((line) => line.map(([x, z]) => toWorld(x, z))),
    pegs: (pegs) =>
      pegs.map((peg) => {
        const [x, z] = toWorld(peg.x, peg.z);
        return { ...peg, x, z };
      }),
  };
}
