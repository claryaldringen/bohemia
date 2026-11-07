// Mřížka obalů pro rychlé hledání kusů stěn opevnění (chůze kolem stěn – `cutsWall`, odstup osy
// trasy – `wallOutline`). Opevnění z bodů má stovky krátkých kusů pásu (křivka po 1,5 m); dotaz
// projde jen kusy z buněk kolem úsečky nebo bodu místo všech. Jen zrychlení: vrátí aspoň všechny
// kusy, jejichž obal se úsečky nebo okna dotkne (i s rezervou na zaokrouhlení), takže výsledek
// volajícího (logické „některý“ nebo nejmenší vzdálenost) je bit po bitu týž. Jen sčítání,
// násobení a zaokrouhlení dolů (deterministická vrstva).

/** Obal kusu (osy x a z). */
export interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Strana buňky mřížky (m) – kusy pásu jsou ≈ 1,5 m dlouhé a pár metrů široké. */
const GRID_CELL_M = 4;
/** Rezerva obalu kusu i úsečky (m) – víc než chyba zaokrouhlení souřadnic. */
const MARGIN_M = 0.05;

/** Mřížka obalů: v buňce indexy kusů (vzestupně), jejichž obal (s rezervou) do ní zasahuje. */
export interface BoxGrid {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  readonly cells: readonly (readonly number[])[];
  /** Kusy bez plochy obalu – dotaz je vrátí vždy (pojistka, dotaz jinde by je minul). */
  readonly always: readonly number[];
  /** Razítko posledního dotazu u každého kusu – kus se v jednom dotazu vrátí jednou. */
  readonly seen: Int32Array;
  stamp: number;
}

/** Mřížka obalů `boxes`; `flat(i)` – kus i nemá plochu (vrací ho každý dotaz). */
export function boxGridOf(boxes: readonly Box[], flat: (i: number) => boolean): BoxGrid {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minZ = Math.min(minZ, b.minZ);
    maxZ = Math.max(maxZ, b.maxZ);
  }
  const x0 = minX - MARGIN_M;
  const z0 = minZ - MARGIN_M;
  const nx = Math.max(1, Math.floor((maxX + MARGIN_M - x0) / GRID_CELL_M) + 1);
  const nz = Math.max(1, Math.floor((maxZ + MARGIN_M - z0) / GRID_CELL_M) + 1);
  const cells: number[][] = Array.from({ length: nx * nz }, () => []);
  const always: number[] = [];
  boxes.forEach((b, i) => {
    if (flat(i)) {
      always.push(i);
      return;
    }
    const ix0 = Math.floor((b.minX - MARGIN_M - x0) / GRID_CELL_M);
    const ix1 = Math.min(nx - 1, Math.floor((b.maxX + MARGIN_M - x0) / GRID_CELL_M));
    const iz0 = Math.floor((b.minZ - MARGIN_M - z0) / GRID_CELL_M);
    const iz1 = Math.min(nz - 1, Math.floor((b.maxZ + MARGIN_M - z0) / GRID_CELL_M));
    for (let iz = Math.max(0, iz0); iz <= iz1; iz++) {
      for (let ix = Math.max(0, ix0); ix <= ix1; ix++) cells[iz * nx + ix]!.push(i);
    }
  });
  return { x0, z0, nx, nz, cells, always, seen: new Int32Array(boxes.length), stamp: 0 };
}

/** Začne dotaz: nové razítko a kusy bez plochy do `out`. */
function begin(grid: BoxGrid, out: number[]): void {
  out.length = 0;
  grid.stamp++;
  if (grid.stamp === 0x7fffffff) {
    grid.seen.fill(0);
    grid.stamp = 1;
  }
  for (const i of grid.always) {
    grid.seen[i] = grid.stamp;
    out.push(i);
  }
}

/** Přidá kusy buněk sloupce `ix` v řádcích pokrývajících z ∈ [zLo, zHi]. */
function addColumn(grid: BoxGrid, ix: number, zLo: number, zHi: number, out: number[]): void {
  const iz0 = Math.max(0, Math.floor((zLo - grid.z0) / GRID_CELL_M));
  const iz1 = Math.min(grid.nz - 1, Math.floor((zHi - grid.z0) / GRID_CELL_M));
  for (let iz = iz0; iz <= iz1; iz++) {
    for (const i of grid.cells[iz * grid.nx + ix]!) {
      if (grid.seen[i] === grid.stamp) continue;
      grid.seen[i] = grid.stamp;
      out.push(i);
    }
  }
}

/**
 * Kusy, jejichž obal může zasáhnout okno [minX, maxX] × [minZ, maxZ] (do `out`, bez opakování;
 * pořadí není dané – volající bere logické „některý“ nebo nejmenší hodnotu).
 */
export function boxesInWindow(
  grid: BoxGrid,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  out: number[],
): number[] {
  begin(grid, out);
  const ix0 = Math.max(0, Math.floor((minX - MARGIN_M - grid.x0) / GRID_CELL_M));
  const ix1 = Math.min(grid.nx - 1, Math.floor((maxX + MARGIN_M - grid.x0) / GRID_CELL_M));
  for (let ix = ix0; ix <= ix1; ix++) addColumn(grid, ix, minZ - MARGIN_M, maxZ + MARGIN_M, out);
  return out;
}

/**
 * Kusy, jejichž obal může zasáhnout úsečka a → b (do `out`, bez opakování, pořadí není dané):
 * buňky sloupců, přes které úsečka vede, v rozsahu z úsečky nad sloupcem (s rezervou).
 */
export function boxesAlong(
  grid: BoxGrid,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  out: number[],
): number[] {
  begin(grid, out);
  const loX = Math.min(ax, bx) - MARGIN_M;
  const hiX = Math.max(ax, bx) + MARGIN_M;
  const ix0 = Math.max(0, Math.floor((loX - grid.x0) / GRID_CELL_M));
  const ix1 = Math.min(grid.nx - 1, Math.floor((hiX - grid.x0) / GRID_CELL_M));
  const dx = bx - ax;
  const slope = dx === 0 ? 0 : (bz - az) / dx;
  for (let ix = ix0; ix <= ix1; ix++) {
    let zLo: number;
    let zHi: number;
    if (dx === 0 || ix0 === ix1) {
      zLo = Math.min(az, bz);
      zHi = Math.max(az, bz);
    } else {
      // část úsečky nad sloupcem (s rezervou v x) – z na jejích koncích
      const u0 = Math.max(loX, grid.x0 + ix * GRID_CELL_M - MARGIN_M);
      const u1 = Math.min(hiX, grid.x0 + (ix + 1) * GRID_CELL_M + MARGIN_M);
      const za = az + (Math.min(Math.max(u0, Math.min(ax, bx)), Math.max(ax, bx)) - ax) * slope;
      const zb = az + (Math.min(Math.max(u1, Math.min(ax, bx)), Math.max(ax, bx)) - ax) * slope;
      zLo = Math.min(za, zb);
      zHi = Math.max(za, zb);
    }
    addColumn(grid, ix, zLo - MARGIN_M, zHi + MARGIN_M, out);
  }
  return out;
}
