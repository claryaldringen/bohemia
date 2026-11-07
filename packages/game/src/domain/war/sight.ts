import { MARCH_FOREST, marchCellAt, type MarchGrid, type Pos } from './march-grid';
import { WAR } from './rules-war';

// Dohled a mlha války (war.md – Mlha války; Martin 18. 10. 2026): útočník vidí, kam dohlédnou
// jeho muži – ≈ 150 m, v lese míň (`WAR.sight`); objevené zůstane, dění vidí jen v dohledu.

/**
 * Vidí muž v `from` na místo `to`? Stojí-li kterýkoli z nich v lese, dohled je lesní. Bez mřížky
 * (mapa ještě není) se bere dohled v lese – mlha války raději skryje víc než míň.
 */
export function inSight(grid: MarchGrid | null, from: Pos, to: Pos): boolean {
  const forest =
    grid === null ||
    (grid.flags[marchCellAt(grid, from)]! & MARCH_FOREST) !== 0 ||
    (grid.flags[marchCellAt(grid, to)]! & MARCH_FOREST) !== 0;
  const r = forest ? WAR.sight.forestM : WAR.sight.openM;
  const dx = from.x - to.x;
  const dz = from.z - to.z;
  return dx * dx + dz * dz <= r * r;
}

/**
 * Objevené stavby (war.md – Mlha války): k dosud objeveným id přidá stavby `buildings`, na které
 * dohlédne kterýkoli z mužů `eyes`. Vrátí seřazený seznam bez opakování (stav je JSON).
 */
export function discoverBuildings(
  discovered: readonly number[],
  buildings: readonly { id: number; position: Pos }[],
  eyes: readonly Pos[],
  grid: MarchGrid | null,
): number[] {
  const known = new Set(discovered);
  for (const b of buildings) {
    if (known.has(b.id)) continue;
    if (eyes.some((e) => inSight(grid, e, b.position))) known.add(b.id);
  }
  return [...known].sort((a, b) => a - b);
}
