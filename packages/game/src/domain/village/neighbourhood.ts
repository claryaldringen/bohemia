import { abandonedVillageAt, isVillageTravelling } from './departure';
import { plotCells } from './plot-cells';
import type { NeighbourSnapshot, TileCell, VillageState } from './types';
import { claimedObstacles } from './wood';

// Vsi na téže mapě o sobě vědí (migration.md – Vsi na téže mapě, fáze 3): ves dostane při dopočtu
// a pohledu přehled ostatních vsí své mapy – co zabírají a které stromy, keře a kameny už
// odstranily, pokácely nebo si vyhradily. Kontroly umístění jejich stavby a pole znají (stavět
// přes ně nejde), kácení a mýcení se s nimi nekříží a scéna jejich paseky ukáže. Přehled se
// neukládá – sestaví se znovu z uložených vsí (`withNeighbours`), simulace jiné vsi nemění.

/**
 * Přehled vsí `others` na téže mapě v den `day`: obydlí a rozestavěná obydlí (s pozemky
 * a řemesly), modly a svatyně (i rozestavěné), políčka polí, sadů, hřbitovů, ohrad, lesa vsi
 * a pozemků, odstraněné a pokácené překážky a stromy, které si vyhradily jejich stavby. Opuštěná
 * ves zabírá jen to, co z ní ještě stojí (`abandonedVillageAt`); ves na cestě nic. Bez vsí null.
 */
export function neighbourSnapshot(
  others: readonly VillageState[],
  day: number,
): NeighbourSnapshot | null {
  const standing = others.filter((v) => !isVillageTravelling(v));
  if (standing.length === 0) return null;
  const snapshot: NeighbourSnapshot = {
    dwellings: [],
    sacredBuildings: [],
    cells: [],
    cleared: [],
    felled: [],
    reserved: [],
  };
  const cells = new Map<string, TileCell>();
  const addCell = (cell: TileCell): void => {
    cells.set(`${cell.x},${cell.y}`, { x: cell.x, y: cell.y });
  };
  const reserved = new Set<number>();
  for (const original of standing) {
    const state = abandonedVillageAt(original, day);
    for (const d of state.dwellings) {
      snapshot.dwellings.push({
        type: d.type,
        position: { ...d.position },
        ...(d.plot ? { plot: d.plot } : {}),
        ...(d.workshop ? { craft: d.workshop.craft } : {}),
      });
      if (d.plot) plotCells(d.plot).forEach(addCell);
    }
    for (const c of state.constructions) {
      if (c.position === null) continue;
      if (c.kind === 'idol' || c.kind === 'shrine') {
        snapshot.sacredBuildings.push({ kind: c.kind, position: { ...c.position } });
        continue;
      }
      if (c.dwellingType === null) continue;
      snapshot.dwellings.push({
        type: c.dwellingType,
        position: { ...c.position },
        ...(c.plot ? { plot: c.plot } : {}),
        ...(c.craft ? { craft: c.craft } : {}),
      });
      if (c.plot) plotCells(c.plot).forEach(addCell);
    }
    for (const b of state.sacredBuildings ?? []) {
      snapshot.sacredBuildings.push({ kind: b.kind, position: { ...b.position } });
    }
    for (const p of state.parts) if (p.cell) addCell(p.cell);
    for (const c of state.cemeteries ?? []) for (const s of c.squares) addCell(s.cell);
    for (const o of state.orchards ?? []) for (const s of o.squares) addCell(s.cell);
    for (const pen of state.pens ?? []) addCell(pen.cell);
    for (const wood of state.woods ?? []) addCell(wood.cell);
    snapshot.cleared.push(...(original.clearedObstacles ?? []).map((c) => ({ ...c })));
    snapshot.felled.push(...(original.felledTrees ?? []).map((f) => ({ ...f })));
    for (const id of claimedObstacles(original)) reserved.add(id);
  }
  snapshot.cells = [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  snapshot.reserved = [...reserved].sort((a, b) => a - b);
  return snapshot;
}

/**
 * Ves s přehledem ostatních vsí své mapy (bez nich přehled zmizí). Stav vsi jinak nemění; přehled
 * se před uložením odebere (`withoutNeighbours`).
 */
export function withNeighbours(
  state: VillageState,
  snapshot: NeighbourSnapshot | null,
): VillageState {
  if (snapshot === null) return withoutNeighbours(state);
  return { ...state, neighbours: snapshot };
}

/** Ves bez přehledu ostatních vsí – tak se ukládá. Bez přehledu vrací týž objekt. */
export function withoutNeighbours(state: VillageState): VillageState {
  if (state.neighbours === undefined) return state;
  const copy = { ...state };
  delete copy.neighbours;
  return copy;
}
