import type { TileCell } from '../types';

// Plot podle délky (oxen.md – Plot ohrady podle délky, cemetery.md – Plot hřbitova podle délky;
// Martin 22. 10. 2026, issue #3: „Pokud rozšiřuju nějakou ohradu nebo hřbitov (tj. postavím nové
// políčko vedle starého políčka), tak se plot na jedné či více stranách stavět nemusí a mělo by se
// ušetřit poměrně dřeva a času.“). Strana čtverce je jednotka plotu; čtverec má 4 strany.

/** Strany čtverce (políčka), které potřebují plot. */
export const SQUARE_SIDES = 4;

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Kolik stran nových čtverců `added` je vnějších, tedy chce nový plot: strana, za kterou leží
 * jiný nový čtverec nebo čtverec už stojící stavby (`existing` – tam plot už stojí, nebo se
 * stavět nemusí), plot nepotřebuje. Jeden samostatný čtverec = 4.
 */
export function newFenceSides(added: readonly TileCell[], existing: readonly TileCell[]): number {
  const taken = new Set([...added, ...existing].map((c) => `${c.x},${c.y}`));
  let sides = 0;
  for (const c of added) {
    for (const [dx, dy] of NEIGHBOURS) if (!taken.has(`${c.x + dx},${c.y + dy}`)) sides++;
  }
  return sides;
}

/** Vnější strany celého obrysu čtverců (plot kolem všech). */
export function outerFenceSides(cells: readonly TileCell[]): number {
  return newFenceSides(cells, []);
}

/**
 * Cena plotu v „čtvercích“ (násobek ceny jednoho celého čtverce, 0–∞): cena bez plotu `(1 − podíl)`
 * za každý čtverec a plot `podíl × strany / 4`. Samostatný čtverec = 1, rozšíření o čtverec
 * po jedné straně (3 nové strany) méně.
 */
export function fencedSquareEquivalents(
  squares: number,
  sides: number,
  fenceShare: number,
): number {
  return squares * (1 - fenceShare) + (fenceShare * sides) / SQUARE_SIDES;
}
