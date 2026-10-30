import { penCells } from './pens';
import { villageOrigin } from './placement-squares';
import { abandonedVillageAt, isVillageTravelling, villageCentre } from './departure';
import { plotCells } from './plot-cells';
import { gridKey, squareKey } from './square-grid';
import { fieldGrids } from './squares';
import type { NeighbourSnapshot, SquareGrid, TileCell, VillageState } from './types';
import { claimedObstacles } from './wood';

// Vsi na téže mapě o sobě vědí (migration.md – Vsi na téže mapě, fáze 3): ves dostane při dopočtu
// a pohledu přehled ostatních vsí své mapy – co zabírají a které stromy, keře a kameny už
// odstranily, pokácely nebo si vyhradily. Kontroly umístění jejich stavby a pole znají (stavět
// přes ně nejde), kácení a mýcení se s nimi nekříží a scéna jejich paseky ukáže. Přehled se
// neukládá – sestaví se znovu z uložených vsí (`withNeighbours`), simulace jiné vsi nemění.

/**
 * Přehled vsí `others` na téže mapě v den `day`: obydlí a rozestavěná obydlí (s pozemky
 * a řemesly), modly, svatyně a humna (i rozestavěné), políčka polí, sadů, hřbitovů, ohrad, lesa vsi
 * a pozemků (natočené čtverce zvlášť v `squares` – fields.md, Natočené stavby), odstraněné
 * a pokácené překážky a stromy, které si vyhradily jejich stavby, a obývané kovárny se jménem vsi
 * (`names` – po vsích `others`; wagons.md, Kování vozů). Opuštěná ves zabírá jen to, co z ní ještě
 * stojí (`abandonedVillageAt`); ves na cestě nic. Bez vsí null.
 */
export function neighbourSnapshot(
  others: readonly VillageState[],
  day: number,
  names: readonly string[] = [],
): NeighbourSnapshot | null {
  const named = others.map((state, i) => ({ state, name: names[i] ?? 'Vedlejší ves' }));
  const standing = named.filter((v) => !isVillageTravelling(v.state)).map((v) => v.state);
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
  const squares = new Map<string, { cell: TileCell; grid: SquareGrid }>();
  // čtverec v mřížce stavby – natočený zvlášť (fields.md – Natočené stavby), jinak políčko
  const addCell = (cell: TileCell, grid?: SquareGrid): void => {
    if (grid) squares.set(squareKey(grid, cell), { cell: { ...cell }, grid: { ...grid } });
    else cells.set(`${cell.x},${cell.y}`, { x: cell.x, y: cell.y });
  };
  // pozemek – natočený zabírá obydlí podle tvaru (`plot.square`), ne políčko pod středem
  const addPlot = (plot: NonNullable<VillageState['dwellings'][number]['plot']>): void => {
    if (!plot.square) plotCells(plot).forEach((cell) => addCell(cell));
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
        ...(d.plainShape ? { plainShape: true as const } : {}),
      });
      if (d.plot) addPlot(d.plot);
    }
    for (const c of state.constructions) {
      if (c.position === null) continue;
      if (c.kind === 'idol' || c.kind === 'shrine') {
        snapshot.sacredBuildings.push({ kind: c.kind, position: { ...c.position } });
        continue;
      }
      // humno má záznam hned od zahájení stavby (níž)
      if (c.kind === 'threshing-floor') continue;
      if (c.dwellingType === null) continue;
      snapshot.dwellings.push({
        type: c.dwellingType,
        position: { ...c.position },
        ...(c.plot ? { plot: c.plot } : {}),
        ...(c.craft ? { craft: c.craft } : {}),
        ...(c.plainShape ? { plainShape: true as const } : {}),
      });
      if (c.plot) addPlot(c.plot);
    }
    for (const b of state.sacredBuildings ?? []) {
      snapshot.sacredBuildings.push({ kind: b.kind, position: { ...b.position } });
    }
    // humna i rozestavěná (production-chains.md – Humno)
    for (const f of state.threshingFloors ?? []) {
      (snapshot.threshingFloors ??= []).push({ position: { ...f.position } });
    }
    const grids = fieldGrids(state);
    for (const p of state.parts) if (p.cell) addCell(p.cell, grids.get(p.fieldId));
    for (const c of state.cemeteries ?? []) for (const s of c.squares) addCell(s.cell, c.grid);
    for (const o of state.orchards ?? []) for (const s of o.squares) addCell(s.cell, o.grid);
    for (const pen of state.pens ?? []) for (const c of penCells(pen)) addCell(c, pen.grid);
    for (const wood of state.woods ?? []) addCell(wood.cell, wood.grid);
    snapshot.cleared.push(...(original.clearedObstacles ?? []).map((c) => ({ ...c })));
    snapshot.felled.push(...(original.felledTrees ?? []).map((f) => ({ ...f })));
    for (const id of claimedObstacles(original)) reserved.add(id);
  }
  snapshot.cells = [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  if (squares.size > 0) {
    // pořadí podle mřížky (prosté porovnání řetězců – nezávisí na jazyku) a čtverce
    const order = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
    snapshot.squares = [...squares.values()].sort(
      (a, b) =>
        order(gridKey(a.grid), gridKey(b.grid)) || a.cell.y - b.cell.y || a.cell.x - b.cell.x,
    );
  }
  snapshot.reserved = [...reserved].sort((a, b) => a - b);
  // obývané kovárny – tesař ves bez kováře pro kování dojde k nejbližší (wagons.md – Kování vozů)
  const smithies = named.flatMap(({ state, name }) => {
    if (isVillageTravelling(state)) return [];
    const occupied = new Set(state.people.map((p) => p.dwellingId));
    return state.dwellings
      .filter((d) => d.workshop?.craft === 'smith' && occupied.has(d.id))
      .map((d) => ({ x: d.position.x, z: d.position.z, name }));
  });
  if (smithies.length > 0) snapshot.smithies = smithies;
  // středy obývaných vsí a den založení – území vsi pro plán správce (steward.md – Mapa hodnot
  // krajiny); vylidněná ves území nedrží
  const villages = standing.flatMap((state) => {
    if (state.people.length === 0 || !villageOrigin(state)) return [];
    const centre = villageCentre(state);
    return [{ x: centre.x, z: centre.z, foundedDay: state.foundedDay }];
  });
  if (villages.length > 0) snapshot.villages = villages;
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
