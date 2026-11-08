import type { Landscape } from '../landscape';
import { villageCemeteries } from './cemetery';
import { isDisused } from './disused';
import { dwellingShape, type ShapedDwelling } from './dwelling-shape';
import { villagePens } from './oxen';
import { penOccupancy } from './pens';
import { dwellingFootprint } from './placement';
import { plotShapes } from './plot-cells';
import { pointsBounds, squareCenter, squareCorners } from './square-grid';
import { fieldGrids } from './squares';
import { polygonsOverlap, type Point } from './polygon';
import { cancelRepair, startRepair, type StructureRef } from './repair';
import { ABANDONMENT, HUMNO, SACRED_BUILDINGS } from './rules';
import { sacredBuildingPlots, sacredFootprint } from './sacred';
import { threshingFloorFootprint, villageThreshingFloors } from './threshing-floors';
import type {
  AbandonedStructure,
  ChronicleEvent,
  DwellingPlot,
  Pen,
  Position,
  SacredBuildingKind,
  SacredRuin,
  SquareGrid,
  StructureWear,
  TileCell,
  VillageState,
} from './types';

// Opuštěné stavby chátrají (docs/design/abandonment.md – Martin 18. 10. 2026: „Jo ty stavby, kam
// nikdo nechodí, budou postupně chátrat a rozpadnou se“). Opuštěná je stavba, ke které podle
// uložených tras (roads.md – 1. 11.) za celý uplynulý rok nevedla žádná cesta – provoz ke stavbě
// se sčítá z tras (`VillageRoads.visits`, `accrueVisits`). Opuštěná stavba
// ztrácí stav rovnoměrně a za ABANDONMENT.fallYears let od plného stavu spadne; když se k ní lidé
// znovu začnou chodit, chátrání se zastaví a vesničané ji opraví ze společné práce (abandonment.md
// – Oprava, Martin 19. 10. 2026 – repair.ts). Modla a svatyně dávají štěstí, dokud stojí; padlá
// modla leží jako zbytek, ze svatyně zbude zarostlý příkop. U hřbitova se rozpadne jen plot (hroby
// zůstávají, pohřbívá se dál – spadlý plot se postaví znovu), ohrada se rozpadne a zmizí.
// Bez krajiny (kalibrace, testy) síť cest není a nic se neopouští.

const DAYS_PER_YEAR = 365.25;
/** Obydlí sahá od středu nejvýš tolik (m) – rychlé vyřazení vzdálených obydlí. */
const DWELLING_REACH_M = 6;
/** Ohrada, do které se vrátila zvířata, má stav aspoň tolik – se zvířaty nespadne. */
const MIN_STOCKED_CONDITION = 0.01;

/** Klíč stavby v provozu z tras (`StoredRoute.visit`, `VillageRoads.visits`). */
export function visitKey(kind: SacredBuildingKind | 'cemetery' | 'pen', id: number): string {
  return `${kind}:${id}`;
}

/** Za kolik dní opuštěná stavba spadne z plného stavu. */
function fallDays(structure: AbandonedStructure): number {
  return ABANDONMENT.fallYears[structure] * DAYS_PER_YEAR;
}

/**
 * Stav stavby 0–1 v den `day` (abandonment.md – Chátrání): bez záznamu celá, navštěvovaná drží
 * stav, opuštěná ho ztrácí rovnoměrně od dne, kdy ji roční kontrola uznala za opuštěnou.
 */
export function structureCondition(
  wear: StructureWear | undefined,
  structure: AbandonedStructure,
  day: number,
): number {
  if (!wear) return 1;
  if (wear.abandonedDay === undefined) return wear.condition;
  return Math.max(0, wear.condition - Math.max(0, day - wear.abandonedDay) / fallDays(structure));
}

/** Je stavba opuštěná (chátrá)? */
export function isAbandoned(wear: StructureWear | undefined): boolean {
  return wear?.abandonedDay !== undefined;
}

/** Den, kdy opuštěná stavba spadne (stav dojde na nulu); navštěvovaná null. */
export function structureFallDay(
  wear: StructureWear | undefined,
  structure: AbandonedStructure,
): number | null {
  if (wear?.abandonedDay === undefined) return null;
  return wear.abandonedDay + Math.ceil(wear.condition * fallDays(structure));
}

/**
 * Ohrady se zvířaty (abandonment.md – ohrada se zvířaty opuštěná není): hotová ohrada, ve které
 * v noci stojí zvířata jejího druhu (oxen.md – Ohrady podle druhu: stádo do ohrad svého druhu podle
 * míst – `penOccupancy`), ohrada spřežení se spřežením nebo telaty ve výcviku.
 */
export function stockedPenIds(state: Pick<VillageState, 'pens' | 'livestock'>): Set<number> {
  const occupancy = penOccupancy(state);
  return new Set(
    villagePens(state)
      .filter((p) => p.builtDay !== null && (occupancy.get(p.id) ?? 0) > 0)
      .map((p) => p.id),
  );
}

/**
 * Nový záznam chátrání po roční kontrole: navštěvovaná stavba chátrat přestane (stav zůstane),
 * nenavštěvovaná začne chátrat od dne `day`. Celá navštěvovaná stavba záznam nemá (undefined).
 */
function nextWear(
  wear: StructureWear | undefined,
  structure: AbandonedStructure,
  day: number,
  visited: boolean,
): StructureWear | undefined {
  const condition = structureCondition(wear, structure, day);
  if (condition <= 0) return wear;
  if (visited) {
    if (!wear) return undefined;
    return { condition: wear.abandonedDay === undefined ? wear.condition : condition };
  }
  if (wear?.abandonedDay !== undefined) return wear;
  return { condition, abandonedDay: day };
}

/** Uloží záznam chátrání do objektu stavby (bez záznamu klíč smaže). */
function setWear<K extends string>(
  target: { [key in K]?: StructureWear },
  key: K,
  wear: StructureWear | undefined,
): void {
  if (wear) target[key] = wear;
  else delete target[key];
}

/**
 * Po roční kontrole (mutuje stav – abandonment.md, Oprava): navštěvovaná stavba pod plným stavem
 * dostane opravu (jen stojící – plot hřbitova i spadlý, padlá modla, svatyně a ohrada dnes ještě
 * zmizí), opuštěná o rozestavěnou opravu přijde (spravené zůstane).
 */
function keepRepaired(
  state: VillageState,
  day: number,
  ref: StructureRef,
  wear: StructureWear | undefined,
  visited: boolean,
): void {
  if (!visited) {
    cancelRepair(state, ref);
    return;
  }
  const condition = structureCondition(wear, ref.structure, day);
  if (condition <= 0 && ref.structure !== 'cemetery-fence') return;
  startRepair(state, day, ref, condition);
}

/**
 * Roční kontrola opuštěných staveb (1. 11. – volá simulace s provozem ke stavbám z tras; mutuje
 * stav): stavba, ke které za rok nevedla žádná cesta (`visits` – součet z tras), začne chátrat,
 * navštěvovaná přestane a vesničané ji opraví (repair.ts). Stavba dokončená za poslední rok
 * (ABANDONMENT.graceDays) opuštěná není – lidé k ní chodili stavět; ohrada se zvířaty taky ne.
 * Práce opravy vede k stavbě cesty – oprava ji tak drží navštěvovanou.
 */
export function abandonmentCheck(
  state: VillageState,
  day: number,
  visits: ReadonlyMap<string, number>,
): void {
  const fresh = (builtDay: number | null): boolean =>
    builtDay !== null && day - builtDay < ABANDONMENT.graceDays;
  const visited = (key: string): boolean => (visits.get(key) ?? 0) > 0;
  // nepoužívaná stavba (demolition.md – Opuštění) chátrá dál bez ohledu na provoz a bez opravy –
  // vrátí ji jen hráč (`restoreStructure`)
  for (const b of state.sacredBuildings ?? []) {
    const on = !isDisused(b) && (visited(visitKey(b.kind, b.id)) || fresh(b.builtDay));
    setWear(b, 'wear', nextWear(b.wear, b.kind, day, on));
    keepRepaired(state, day, { structure: b.kind, id: b.id }, b.wear, on);
  }
  for (const c of villageCemeteries(state)) {
    if (c.builtDay === null) continue;
    const on = visited(visitKey('cemetery', c.id)) || fresh(c.builtDay);
    setWear(c, 'fenceWear', nextWear(c.fenceWear, 'cemetery-fence', day, on));
    keepRepaired(state, day, { structure: 'cemetery-fence', id: c.id }, c.fenceWear, on);
  }
  const stocked = stockedPenIds(state);
  for (const p of villagePens(state)) {
    if (p.builtDay === null) continue;
    const on =
      !isDisused(p) && (stocked.has(p.id) || visited(visitKey('pen', p.id)) || fresh(p.builtDay));
    setWear(p, 'wear', nextWear(p.wear, 'pen', day, on));
    keepRepaired(state, day, { structure: 'pen', id: p.id }, p.wear, on);
  }
}

/**
 * Krok dne (mutuje stav – volá simulace na konci dne): opuštěná stavba, jejíž stav dnes došel na
 * nulu, spadne – modla a svatyně zmizí a zůstane po nich zbytek (`sacredRuins`), plot hřbitova
 * se rozpadne (hřbitov zůstává), ohrada zmizí. Ohrada, do které se mezitím vrátila zvířata,
 * chátrat přestane hned a vesničané ji opraví (repair.ts). Zbytky padlých model a svatyní po
 * ABANDONMENT.remnantYears zmizí, stejně jako zbytky pod stavbou. Vrátí události kroniky.
 */
export function abandonmentDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  const buildings = state.sacredBuildings;
  if (buildings?.some((b) => isAbandoned(b.wear))) {
    const fallen = buildings.filter((b) => structureCondition(b.wear, b.kind, day) <= 0);
    if (fallen.length > 0) {
      state.sacredBuildings = buildings.filter((b) => !fallen.includes(b));
      if (state.sacredBuildings.length === 0) delete state.sacredBuildings;
      const ruins = (state.sacredRuins ??= []);
      for (const b of fallen) {
        ruins.push({ id: b.id, kind: b.kind, position: { ...b.position }, day });
        events.push({ day, kind: 'structure-fell', structure: b.kind, id: b.id });
      }
    }
  }
  for (const c of villageCemeteries(state)) {
    const wear = c.fenceWear;
    if (wear?.abandonedDay === undefined) continue;
    if (structureCondition(wear, 'cemetery-fence', day) > 0) continue;
    // plot je pryč – hřbitov zůstává (hroby, pohřby); stav 0 už se nemění
    c.fenceWear = { condition: 0 };
    events.push({ day, kind: 'structure-fell', structure: 'cemetery-fence', id: c.id });
  }
  const pens = state.pens;
  if (pens?.some((p) => isAbandoned(p.wear))) {
    const stocked = stockedPenIds(state);
    const gone: Pen[] = [];
    for (const p of pens) {
      if (!isAbandoned(p.wear)) continue;
      if (stocked.has(p.id)) {
        // zvířata se vrátila – lidé sem chodí krmit, chátrání se zastaví (ohrada se zvířaty
        // nespadne – zůstane aspoň na MIN_STOCKED_CONDITION) a vesničané ji opraví
        p.wear = {
          condition: Math.max(MIN_STOCKED_CONDITION, structureCondition(p.wear, 'pen', day)),
        };
        startRepair(state, day, { structure: 'pen', id: p.id }, p.wear.condition);
        continue;
      }
      if (structureCondition(p.wear, 'pen', day) <= 0) gone.push(p);
    }
    if (gone.length > 0) {
      state.pens = pens.filter((p) => !gone.includes(p));
      if (state.pens.length === 0) delete state.pens;
      // rozestavěné rozšíření spadlé ohrady zmizí s ní
      const goneIds = new Set(gone.map((p) => p.id));
      state.constructions = state.constructions.filter(
        (c) =>
          c.kind !== 'pen' || c.penId === null || c.penId === undefined || !goneIds.has(c.penId),
      );
      for (const p of gone)
        events.push({ day, kind: 'structure-fell', structure: 'pen', id: p.id });
    }
  }
  updateSacredRuins(state, day, landscape);
  return events;
}

/** Jak daleko zbytek padlé modly nebo svatyně zarostl 0–1 (1 = zmizel). */
export function sacredRuinOvergrowth(ruin: Pick<SacredRuin, 'kind' | 'day'>, day: number): number {
  const days = ABANDONMENT.remnantYears[ruin.kind] * DAYS_PER_YEAR;
  return Math.min(1, Math.max(0, (day - ruin.day) / days));
}

/** Zbytky zarostlé po ABANDONMENT.remnantYears a zbytky pod stavbou zmizí (mutuje stav). */
function updateSacredRuins(state: VillageState, day: number, landscape: Landscape | null): void {
  const ruins = state.sacredRuins;
  if (!ruins) return;
  const kept = ruins.filter((r) => sacredRuinOvergrowth(r, day) < 1);
  const left = kept.length > 0 ? withoutBuiltOver(state, kept, landscape) : kept;
  if (left.length === ruins.length) return;
  if (left.length > 0) state.sacredRuins = left;
  else delete state.sacredRuins;
}

/**
 * Zbytky, přes které nestojí ani se nestaví jiná stavba (obydlí, modla, svatyně, humno; s krajinou
 * i čtverce polí, hřbitovů, sadů, ohrad a pozemky) – na místo zbytku jde stavět a stavba ho
 * odstraní (jako zbytek jámy obydlí – ruins.ts).
 */
function withoutBuiltOver(
  state: VillageState,
  ruins: SacredRuin[],
  landscape: Landscape | null,
): SacredRuin[] {
  const footprints = ruins.map((r) => sacredFootprint(r.kind, r.position));
  const boxes = footprints.map(boundsOf);
  // rychlé vyřazení podle obdélníku kolem bodu (bez skládání mnohoúhelníků) – stav vsi má tisíce
  // dílů a kontrola běží každý den, dokud nějaký zbytek leží
  const near = (x: number, z: number, reach: number): boolean =>
    boxes.some(
      (b) => x + reach > b.minX && x - reach < b.maxX && z + reach > b.minZ && z - reach < b.maxZ,
    );
  const shapes: Point[][] = [];
  const building = (d: ShapedDwelling & { position: Position }): void => {
    if (near(d.position.x, d.position.z, DWELLING_REACH_M)) {
      shapes.push(dwellingFootprint(d.type, d.position, dwellingShape(d)));
    }
  };
  for (const d of state.dwellings) building(d);
  for (const c of state.constructions) {
    if (c.position !== null && c.dwellingType !== null) {
      building({
        type: c.dwellingType,
        position: c.position,
        ...(c.plot ? { plot: c.plot } : {}),
        ...(c.plainShape ? { plainShape: true } : {}),
      });
    }
  }
  for (const b of sacredBuildingPlots(state)) {
    const half = (SACRED_BUILDINGS[b.kind].footprintM * Math.SQRT2) / 2;
    if (near(b.position.x, b.position.z, half)) shapes.push(sacredFootprint(b.kind, b.position));
  }
  // humno (production-chains.md – Humno) – poloviční úhlopříčka půdorysu
  const floorReach = Math.hypot(HUMNO.sizeM.x, HUMNO.sizeM.z) / 2;
  for (const f of villageThreshingFloors(state)) {
    if (near(f.position.x, f.position.z, floorReach)) {
      shapes.push(threshingFloorFootprint(f.position));
    }
  }
  if (landscape) {
    const reach = (landscape.cellSizeM * Math.SQRT2) / 2;
    // čtverce staveb i natočené (fields.md – Natočené stavby) – střed a rohy v mřížce stavby
    const cell = (c: TileCell | undefined, grid?: SquareGrid): void => {
      if (!c) return;
      const center = squareCenter(landscape, grid, c);
      if (near(center.x, center.z, reach)) shapes.push(squareCorners(landscape, grid, c));
    };
    const grids = fieldGrids(state);
    for (const p of state.parts) cell(p.cell, grids.get(p.fieldId));
    for (const c of villageCemeteries(state)) for (const q of c.squares) cell(q.cell, c.grid);
    for (const o of state.orchards ?? []) for (const q of o.squares) cell(q.cell, o.grid);
    for (const p of villagePens(state)) cell(p.cell, p.grid);
    const plot = (p: DwellingPlot | undefined): void => {
      if (!p) return;
      // jen čtverec domu (dvůr dvorce zbytky nepřekrývá – jako dřív)
      for (const shape of plotShapes(landscape, p).slice(0, 1)) {
        const [minX, minZ, maxX, maxZ] = pointsBounds(shape.corners);
        if (near((minX + maxX) / 2, (minZ + maxZ) / 2, reach)) shapes.push([...shape.corners]);
      }
    };
    for (const d of state.dwellings) plot(d.plot);
    for (const c of state.constructions) plot(c.plot);
  }
  if (shapes.length === 0) return ruins;
  return ruins.filter((_, k) => !shapes.some((shape) => polygonsOverlap(shape, footprints[k]!)));
}

function boundsOf(points: readonly Point[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}
