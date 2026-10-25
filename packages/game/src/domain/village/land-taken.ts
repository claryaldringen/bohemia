import { tileOfWorldPoint, type Landscape } from '../landscape';
import { PART_TASKS, taskPosition, taskSpans, type PartTask } from './field-progress';
import { mowingPosition, mowingSpans, mowingYieldPerHa } from './hay';
import { recordClearedObstacles } from './obstacles';
import { normalizeGrid, squareKey } from './square-grid';
import { PolygonIndex, villageLandSquares, type LandSquare, type SquaresVillage } from './squares';
import { squareCareWork, squareHarvestWork, squareYieldKg } from './orchard';
import { TAKEN_LAND_MIN_SHARE, TAKEN_LAND_TREE_M2 } from './rules';
import type {
  ChronicleEvent,
  CropWork,
  FieldPart,
  LandTaker,
  OrchardSquare,
  SquareGrid,
  TileCell,
  VillageState,
  YearPlan,
} from './types';
import { addLogs, logsFromClearedTrees } from './wood';
import { partWeight, planCrops } from './year-plan';

// Pole a sad ustupují stavbám (population.md – Obydlí na poli a v sadu; Martin, 18. 10. 2026:
// „domy by měly jít stavět na polích a v sadech. Pole a sad se prostě zmenší o plochu domu“ –
// a fields.md – Pole jako krajina: „Pole by se mělo chovat jako normální krajina. Takže by na
// něm mělo jít postavit cokoliv kromě jiného pole.“). Kolik ze kterého čtverce stavba sebere,
// spočítá kontrola umístění (placement.ts) – stavba po čtvercích a pozemek celé políčko, obydlí
// bez pozemku, modla a svatyně průnik půdorysu (vyklízené plochy) se čtvercem, jabloň a strom
// u cesty TAKEN_LAND_TREE_M2 (`treeTakenLand`). Sad ustupuje jen obydlí – ostatní stavby na sad
// dál nesmí. Odsud se to promítne do stavu vsi: díl pole nebo čtverec sadu se zmenší, pod
// TAKEN_LAND_MIN_SHARE políčka zmizí celý; s plochou ubude úměrně i úroda a práce (plán osevu i s orbou rádlem, seč sena,
// založení, výsadba, sezónní práce v sadech). Pole a sad, kterým nezbyl žádný čtverec, zaniknou;
// zbytek zůstává jedním polem / sadem, i když se tím rozpadne na nesouvislé části.

/**
 * Kus čtverce pole nebo sadu, který stavba sebere – plocha (m²) z políčka `cellAreaM2`. Čtverec
 * natočeného pole či sadu (fields.md – Natočené stavby) nese mřížku stavby `grid` – `cell` je
 * pak čtverec v ní.
 */
export interface TakenLand {
  cell: TileCell;
  grid?: SquareGrid;
  areaM2: number;
  cellAreaM2: number;
}

/** Plochy pod tuto mez (m²) jsou jen dotyk hranou – stavba z čtverce nic nebere. */
export const TAKEN_LAND_EPSILON_M2 = 0.01;
const EPSILON = 1e-9;

/**
 * Kolik plochy dílu nebo čtverce (`areaM2`) zbude, když obydlí sebere `takenM2` z políčka
 * `cellAreaM2`; méně než TAKEN_LAND_MIN_SHARE políčka = 0 – díl (čtverec) zmizí celý.
 */
export function landLeftM2(areaM2: number, takenM2: number, cellAreaM2: number): number {
  const left = areaM2 - takenM2;
  return left < TAKEN_LAND_MIN_SHARE * cellAreaM2 - EPSILON ? 0 : left;
}

/** Ověří vstup – celočíselná políčka bez opakování, konečné nezáporné plochy; jinak RangeError. */
export function validateTakenLand(taken: readonly TakenLand[]): void {
  const cells = new Set<string>();
  for (const t of taken) {
    if (!Number.isInteger(t.cell.x) || !Number.isInteger(t.cell.y)) {
      throw new RangeError('Políčko zabrané stavbou musí mít celočíselné souřadnice.');
    }
    if (t.grid && !normalizeGrid(t.grid)) {
      throw new RangeError('Mřížka zabraného čtverce musí být natočená po 15°.');
    }
    if (!Number.isFinite(t.areaM2) || t.areaM2 < 0) {
      throw new RangeError('Plocha zabraná stavbou musí být nezáporná a konečná.');
    }
    if (!Number.isFinite(t.cellAreaM2) || t.cellAreaM2 <= 0) {
      throw new RangeError('Plocha políčka musí být kladná a konečná.');
    }
    cells.add(takenKey(t));
  }
  if (cells.size !== taken.length) throw new RangeError('Políčko zabrané stavbou se opakuje.');
}

/**
 * Kolik půdy vezmou polím stromy na místech `points` (jabloně a stromy u cesty – fields.md, Pole
 * jako krajina): každý strom na čtverci dílu pole TAKEN_LAND_TREE_M2 (pod korunou se neorá),
 * nejvýš celý čtverec. Stromy mimo pole nic neberou. Po řádcích políček, čtverce natočených polí
 * (fields.md – Natočené stavby) nakonec.
 */
export function treeTakenLand(
  landscape: Landscape,
  village: Pick<SquaresVillage, 'parts' | 'fields'>,
  points: readonly { x: number; z: number }[],
): TakenLand[] {
  const cellAreaM2 = landscape.cellSizeM * landscape.cellSizeM;
  const index = new PolygonIndex(landscape, villageLandSquares(landscape, village, ['field']));
  const trees = new Map<string, { square: LandSquare; count: number }>();
  for (const { x, z } of points) {
    if (!tileOfWorldPoint(landscape, x, z)) continue;
    const square = index.containing(x, z)[0];
    if (!square) continue;
    const key = squareKey(square.grid, square.cell);
    const known = trees.get(key);
    if (known) known.count++;
    else trees.set(key, { square, count: 1 });
  }
  return [...trees.values()]
    .sort((a, b) => {
      const ta = a.square.tile;
      const tb = b.square.tile;
      if ((ta === null) !== (tb === null)) return ta === null ? 1 : -1;
      if (ta !== null && tb !== null) return ta - tb;
      const ka = squareKey(a.square.grid, a.square.cell);
      const kb = squareKey(b.square.grid, b.square.cell);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
    .map(({ square, count }) => ({
      cell: { x: square.cell.x, y: square.cell.y },
      ...(square.grid ? { grid: square.grid } : {}),
      areaM2: Math.min(cellAreaM2, count * TAKEN_LAND_TREE_M2),
      cellAreaM2,
    }));
}

/** Klíč zabraného kusu – čtverec v mřížce stavby (bez mřížky políčko krajiny). */
const takenKey = (t: Pick<TakenLand, 'cell' | 'grid'>): string => squareKey(t.grid, t.cell);

/**
 * Varování, že stavba sebere půdu poli nebo sadu (neblokuje – u kurzoru oranžově, u jabloní
 * u cesty v nabídce): „Pole se zmenší“, nebo „Pole zanikne“, když mu nezbude žádný díl (podle
 * `landLeftM2`); u sadu totéž. Díly bez plochy mají celé políčko `cellAreaM2`, díly bez pole
 * (staré vstupy) nezanikají. Bez zabrané půdy undefined.
 */
export function landTakenWarning(
  village: {
    readonly fields?: readonly { readonly id: number; readonly grid?: SquareGrid }[];
    readonly parts: readonly {
      readonly cell?: TileCell;
      readonly fieldId?: number;
      readonly areaM2?: number;
    }[];
    readonly orchards?: readonly {
      readonly grid?: SquareGrid;
      readonly squares: readonly { readonly cell: TileCell; readonly areaM2?: number }[];
    }[];
  },
  taken: readonly TakenLand[],
  cellAreaM2: number,
): string | undefined {
  if (taken.length === 0) return undefined;
  const byCell = new Map(taken.map((t) => [takenKey(t), t]));
  const grids = new Map((village.fields ?? []).map((f) => [f.id, f.grid]));
  const leftOf = (
    cell: TileCell | undefined,
    grid: SquareGrid | undefined,
    areaM2: number | undefined,
  ): number | null => {
    const t = cell ? byCell.get(squareKey(grid, cell)) : undefined;
    return t ? landLeftM2(areaM2 ?? cellAreaM2, t.areaM2, t.cellAreaM2) : null;
  };
  const fields = new Map<number, { hit: boolean; alive: boolean }>();
  let looseHit = false;
  for (const part of village.parts) {
    const grid = part.fieldId === undefined ? undefined : grids.get(part.fieldId);
    const left = leftOf(part.cell, grid, part.areaM2);
    if (part.fieldId === undefined) {
      looseHit ||= left !== null;
      continue;
    }
    const field = fields.get(part.fieldId) ?? { hit: false, alive: false };
    if (left !== null) field.hit = true;
    if (left === null || left > 0) field.alive = true;
    fields.set(part.fieldId, field);
  }
  const hitFields = [...fields.values()].filter((f) => f.hit);
  const orchards = (village.orchards ?? []).flatMap((orchard) => {
    const lefts = orchard.squares.map((s) => leftOf(s.cell, orchard.grid, s.areaM2));
    if (lefts.every((l) => l === null)) return [];
    return [lefts.some((l) => l === null || l > 0)];
  });
  const lines = [
    hitFields.length > 0 || looseHit
      ? hitFields.some((f) => !f.alive)
        ? 'Pole zanikne'
        : 'Pole se zmenší'
      : null,
    orchards.length > 0
      ? orchards.some((alive) => !alive)
        ? 'Sad zanikne'
        : 'Sad se zmenší'
      : null,
  ].filter((line) => line !== null);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * Pole (a u obydlí i sady) ustoupí stavbě `by` (mutuje stav – volat na klonu): každý díl pole
 * a u obydlí i čtverec sadu na políčku z `taken` se zmenší o zabranou plochu, pod
 * TAKEN_LAND_MIN_SHARE políčka zmizí celý. Sad ustupuje jen obydlí – ostatní stavby na sad
 * nesmí (nový sad na poli tak o své čtverce nepřijde). S plochou ubude úměrně práce a úroda – plán osevu i s orbou (`taskSpans` – díl drží
 * svůj podíl hotové práce), seč sena na úhoru, rozestavěné založení pole a výsadba sadu (cena
 * i odvedená práce), sezónní práce v sadech a úroda jablek. Zmizelý zakládaný díl nebo
 * nevysazený čtverec předá své překážky stavbě – odklidí se se staveništěm bez práce navíc
 * a dospělé stromy dají klády. Pole a sad bez čtverců zaniknou i se svou stavbou. Kronika zapíše
 * `land-taken` (s `by`).
 */
export function giveWayToBuilding(
  state: VillageState,
  day: number,
  taken: readonly TakenLand[],
  by: LandTaker = 'dwelling',
): void {
  if (taken.length === 0) return;
  const byCell = new Map(taken.map((t) => [takenKey(t), t]));
  const fieldLoss = shrinkParts(state, day, byCell);
  // sad ustupuje jen obydlí (population.md) – ostatní stavby na sad nesmí
  const orchardLoss = by === 'dwelling' ? shrinkOrchards(state, day, byCell) : new Map();
  const events: ChronicleEvent[] = [];
  for (const [id, areaM2] of [...fieldLoss].sort((a, b) => a[0] - b[0])) {
    const gone = !state.parts.some((p) => p.fieldId === id);
    if (gone) dropField(state, id);
    events.push({ day, kind: 'land-taken', land: 'field', id, areaM2, gone, by });
  }
  for (const [id, areaM2] of [...orchardLoss].sort((a, b) => a[0] - b[0])) {
    const gone = !(state.orchards ?? []).some((o) => o.id === id);
    events.push({ day, kind: 'land-taken', land: 'orchard', id, areaM2, gone, by });
  }
  state.chronicle.push(...events);
}

/**
 * Pole ustoupí pevným cestám (roads.md a fields.md – Cesta přes pole; mutuje stav – volat na
 * klonu): díl dostane plochu bez toho, co mu cesty berou podle `land` (pás cest, plácky rozcestí
 * a oddělené kousky – `roadLand`; díl, který v `land` není, nic). Co cesty braly dřív
 * (`FieldPart.roadM2`), se nejdřív vrátí – cesta, která zarostla nebo se přesunula, půdu vrátí
 * (zvětšený díl je obdělaný jako zbytek dílu). S plochou se úměrně změní plán osevu, seč
 * a založení (`resizeParts`). Díl, kterému cesty vezmou tolik, že zbude méně než
 * TAKEN_LAND_MIN_SHARE políčka, zmizí celý (jako pod stavbou). Kronika `land-taken` (`by: 'road'`)
 * u polí, která se zmenšila.
 */
export function giveWayToRoads(
  state: VillageState,
  day: number,
  land: ReadonlyMap<number, { roadM2: number; cutM2: number; cut: number[] | null }>,
  cellAreaM2: number,
): void {
  const taken = new Map<number, number>();
  const loss = resizeParts(state, day, (part) => {
    if (!part.cell) return null;
    const old = part.roadM2 ?? 0;
    const entry = land.get(part.id);
    const whole = part.areaM2 + old;
    const next = Math.min(whole, entry ? entry.roadM2 + entry.cutM2 : 0);
    taken.set(part.id, next);
    if (Math.abs(next - old) <= EPSILON) return null;
    const left = whole - next;
    return next > old && left < TAKEN_LAND_MIN_SHARE * cellAreaM2 - EPSILON ? 0 : left;
  });
  for (const part of state.parts) {
    const next = taken.get(part.id);
    if (next === undefined) continue;
    if (next > EPSILON) part.roadM2 = next;
    else delete part.roadM2;
    const cut = land.get(part.id)?.cut;
    if (next > EPSILON && cut) part.roadCut = [...cut];
    else delete part.roadCut;
  }
  const events: ChronicleEvent[] = [];
  for (const [id, areaM2] of [...loss].sort((a, b) => a[0] - b[0])) {
    if (areaM2 <= EPSILON) continue;
    const gone = !state.parts.some((p) => p.fieldId === id);
    if (gone) dropField(state, id);
    events.push({ day, kind: 'land-taken', land: 'field', id, areaM2, gone, by: 'road' });
  }
  state.chronicle.push(...events);
}

/** Díly polí na zabraných políčkách – zmenší je nebo odeberou; vrátí ztrátu plochy po polích. */
function shrinkParts(
  state: VillageState,
  day: number,
  byCell: ReadonlyMap<string, TakenLand>,
): Map<number, number> {
  const grids = new Map(state.fields.map((f) => [f.id, f.grid]));
  return resizeParts(state, day, (part) => {
    const t = part.cell ? byCell.get(squareKey(grids.get(part.fieldId), part.cell)) : undefined;
    return t ? landLeftM2(part.areaM2, t.areaM2, t.cellAreaM2) : null;
  });
}

/**
 * Díly polí dostanou novou plochu `areaOf` (null = beze změny, 0 = díl zmizí; mutuje stav): s plochou
 * se úměrně změní plán osevu i s orbou, seč sena a rozestavěné založení (`shrinkInPlan` – zmenšení
 * i zvětšení, vrácená půda je obdělaná jako zbytek dílu); zmizelý díl odejde z plánů, seče
 * i rozdělení práce a předá překážky. Vrátí změnu plochy po polích (ztráta kladně).
 */
function resizeParts(
  state: VillageState,
  day: number,
  areaOf: (part: FieldPart) => number | null,
): Map<number, number> {
  const loss = new Map<number, number>();
  const removed = new Set<number>();
  for (const part of state.parts) {
    const left = areaOf(part);
    if (left === null) continue;
    const lost = part.areaM2 - left;
    if (Math.abs(lost) <= EPSILON) continue;
    const share = left > 0 ? lost / part.areaM2 : 1;
    // plán, seč a založení podle plochy před zmenšením (váha dílu v pořadí práce)
    if (state.plan) shrinkInPlan(state, state.plan, part, share, day);
    shrinkInMowing(state, part, share);
    shrinkFounding(state, part, share);
    loss.set(part.fieldId, (loss.get(part.fieldId) ?? 0) + lost);
    if (left > 0) {
      part.areaM2 = left;
      continue;
    }
    // z pořadí práce hned – další díly se počítají už bez něj
    removed.add(part.id);
    for (const plan of [state.plan, state.threshingFromPlan]) {
      if (!plan) continue;
      for (const { work } of planCrops(plan)) dropFromWork(work, new Set([part.id]));
    }
    dropFromMowing(state, part.id);
    handOverObstacles(state, part, day);
  }
  if (removed.size === 0) return loss;
  state.parts = state.parts.filter((p) => !removed.has(p.id));
  for (const share of state.labor?.shares ?? []) {
    if (share.target.kind !== 'field' || !share.target.parts) continue;
    share.target.parts = share.target.parts.filter((id) => !removed.has(id));
  }
  // založení, kterému nezbyl žádný díl a nic nezaložilo, zmizí (jinak doběhne jako hotové)
  state.constructions = state.constructions.filter(
    (c) =>
      c.kind !== 'field' ||
      c.fieldId === null ||
      !loss.has(c.fieldId) ||
      c.cost > EPSILON ||
      state.parts.some((p) => p.fieldId === c.fieldId && p.state === 'founding'),
  );
  return loss;
}

/** Potřebná a odvedená práce úlohy plodiny – orba rádlem (oxen.md) vedená zvlášť v `plough`. */
function taskWork(work: CropWork, task: PartTask): { required: number; done: number } {
  if (task === 'plough')
    return { required: work.plough?.required ?? 0, done: work.plough?.done ?? 0 };
  return { required: work.required[task], done: work.done[task] };
}

function setTaskWork(work: CropWork, task: PartTask, required: number, done: number): void {
  if (task !== 'plough') {
    work.required[task] = required;
    work.done[task] = done;
  } else if (work.plough) {
    work.plough.required = required;
    work.plough.done = done;
  }
}

/**
 * Díl ubere z práce plodiny podíl `share` (mutuje plán): v každé úloze (i v orbě) ubude potřebné
 * práce podle jeho váhy a hotové práce, kolik jí na něm bylo – čelo práce i hotové díly ostatních
 * zůstanou tam, kde byly. Výmlat jako sklizeň; váha oraných či kopaných dílů orby (setí jde za
 * obojím) ubude o váhu dílu. Sklizená plodina (úroda už je v zásobách) se nemění.
 */
export function shrinkInPlan(
  state: VillageState,
  plan: YearPlan,
  part: FieldPart,
  share: number,
  day: number,
): void {
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  for (const { work } of planCrops(plan)) {
    if (work.harvestedKg !== null || !work.partIds.includes(part.id)) continue;
    for (const task of PART_TASKS) {
      const span = taskSpans(work, partsById, task, day).find((s) => s.id === part.id);
      if (!span) continue;
      const { required, done } = taskWork(work, task);
      const position = taskPosition(work, task);
      // díl pásu orby nese jen svůj podíl úseku pásu (oxen.md – Co nejdelší brázda)
      const own = span.share ?? 1;
      const doneOnPart =
        (Math.min(span.end, Math.max(span.start, position)) - span.start) * required * own;
      setTaskWork(
        work,
        task,
        Math.max(0, required - share * (span.end - span.start) * required * own),
        Math.max(0, done - share * doneOnPart),
      );
    }
    const plough = work.plough;
    if (plough) {
      const lost = share * partWeight(part);
      if (plough.partIds.includes(part.id)) plough.weight = Math.max(0, plough.weight - lost);
      else if (plough.digWeight !== undefined) {
        plough.digWeight = Math.max(0, plough.digWeight - lost);
      }
    }
    const harvest = taskSpans(work, partsById, 'harvest', day).find((s) => s.id === part.id);
    if (harvest) {
      const cut = 1 - share * (harvest.end - harvest.start);
      work.required.thresh = Math.max(0, work.required.thresh * cut);
      work.done.thresh = Math.max(0, work.done.thresh * cut);
    }
  }
}

/** Odebrané díly zmizí z pořadí práce plodiny (i z vracených přílohů a z orby s drnem). */
export function dropFromWork(work: CropWork, removed: ReadonlySet<number>): void {
  work.partIds = work.partIds.filter((id) => !removed.has(id));
  const plough = work.plough;
  if (plough) {
    plough.partIds = plough.partIds.filter((id) => !removed.has(id));
    const sodIds = (plough.sodIds ?? []).filter((id) => !removed.has(id));
    if (sodIds.length > 0) plough.sodIds = sodIds;
    else delete plough.sodIds;
    if (plough.bands) {
      plough.bands = plough.bands
        .map((band) => ({ ...band, partIds: band.partIds.filter((id) => !removed.has(id)) }))
        .filter((band) => band.partIds.length > 0);
    }
  }
  if (!work.reclaimIds) return;
  const reclaimIds = work.reclaimIds.filter((id) => !removed.has(id));
  if (reclaimIds.length > 0) work.reclaimIds = reclaimIds;
  else delete work.reclaimIds;
}

/**
 * Díl úhoru v letošní seči sena (oxen.md – Seno) ubere podíl `share`: potřebná práce podle jeho
 * váhy, hotová, kolik jí na něm bylo (čelo seče zůstane), a seno při plné seči podle plochy.
 * Posečené seno už je v zásobě.
 */
function shrinkInMowing(state: VillageState, part: FieldPart, share: number): void {
  const mowing = state.hay?.mowing;
  if (!mowing || !mowing.partIds.includes(part.id)) return;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const span = mowingSpans(mowing, partsById).find((s) => s.partId === part.id);
  if (!span) return;
  const position = mowingPosition(mowing);
  const doneOnPart =
    (Math.min(span.end, Math.max(span.start, position)) - span.start) * mowing.required;
  mowing.required = Math.max(
    0,
    mowing.required - share * (span.end - span.start) * mowing.required,
  );
  mowing.done = Math.max(0, Math.min(mowing.required, mowing.done - share * doneOnPart));
  mowing.yieldKg = Math.max(
    0,
    mowing.yieldKg - (share * part.areaM2 * mowingYieldPerHa(mowing)) / 10_000,
  );
  // louka v pořadí seče (s přirozenými loukami) nese plochu z plánu – ubude jí stejný podíl
  for (const square of mowing.squares ?? []) {
    if (square.partId === part.id) square.areaM2 *= 1 - share;
  }
}

/** Odebraný díl zmizí ze seče; seč bez luk se zruší. */
function dropFromMowing(state: VillageState, partId: number): void {
  const hay = state.hay;
  if (!hay?.mowing) return;
  hay.mowing.partIds = hay.mowing.partIds.filter((id) => id !== partId);
  const firstCut = hay.mowing.firstCut;
  if (firstCut) firstCut.partIds = firstCut.partIds.filter((id) => id !== partId);
  if (hay.mowing.squares) {
    hay.mowing.squares = hay.mowing.squares.filter((sq) => sq.partId !== partId);
  }
  // seč bez luk se zruší (přirozené louky zůstávají)
  if (hay.mowing.partIds.length === 0 && (hay.mowing.squares?.length ?? 0) === 0) {
    hay.mowing = null;
  }
}

/** Zakládaný díl: založení se zmenší úměrně – cena i odvedená práce dílu i stavby pole. */
function shrinkFounding(state: VillageState, part: FieldPart, share: number): void {
  if (part.state !== 'founding') return;
  const cost = part.foundingCost * share;
  const done = part.foundingDone * share;
  part.foundingCost -= cost;
  part.foundingDone -= done;
  const c = state.constructions.find((x) => x.kind === 'field' && x.fieldId === part.fieldId);
  if (!c) return;
  c.cost = Math.max(0, c.cost - cost);
  c.done = Math.max(0, Math.min(c.cost, c.done - done));
}

/**
 * Překážky zmizelého zakládaného dílu nebo nevysazeného čtverce (dosud patřily jeho stavbě)
 * odklidí stavba – zmizí natrvalo (co už odklidila sama, se nepíše znovu) a dospělé stromy dají
 * klády na hromadu.
 */
function handOverObstacles(
  state: VillageState,
  square: Pick<FieldPart | OrchardSquare, 'obstacles' | 'trees'>,
  day: number,
): void {
  if (square.obstacles) {
    const cleared = new Set((state.clearedObstacles ?? []).map((o) => o.id));
    recordClearedObstacles(
      state,
      square.obstacles.filter((id) => !cleared.has(id)),
      day,
    );
  }
  if (square.trees) addLogs(state, logsFromClearedTrees(square.trees));
}

/** Pole bez dílů zanikne i se svou stavbou (založení). */
function dropField(state: VillageState, fieldId: number): void {
  state.fields = state.fields.filter((f) => f.id !== fieldId);
  state.constructions = state.constructions.filter(
    (c) => !(c.kind === 'field' && c.fieldId === fieldId),
  );
}

/**
 * Čtverce sadů na zabraných políčkách – zmenší je nebo odeberou (výsadba úměrně, sezónní práce
 * a úroda jablek také); sad bez čtverců zanikne i se stavbou. Vrátí ztrátu plochy po sadech.
 */
function shrinkOrchards(
  state: VillageState,
  day: number,
  byCell: ReadonlyMap<string, TakenLand>,
): Map<number, number> {
  const loss = new Map<number, number>();
  if (!state.orchards) return loss;
  for (const orchard of state.orchards) {
    const kept: OrchardSquare[] = [];
    for (const square of orchard.squares) {
      const t = byCell.get(squareKey(orchard.grid, square.cell));
      const left = t ? landLeftM2(square.areaM2, t.areaM2, t.cellAreaM2) : square.areaM2;
      const lost = square.areaM2 - left;
      if (lost <= EPSILON) {
        kept.push(square);
        continue;
      }
      const share = left > 0 ? lost / square.areaM2 : 1;
      shrinkOrchardWork(state, square, share, day);
      loss.set(orchard.id, (loss.get(orchard.id) ?? 0) + lost);
      if (left <= 0) {
        handOverObstacles(state, square, day);
        continue;
      }
      square.plantingCost -= square.plantingCost * share;
      square.plantingDone -= square.plantingDone * share;
      square.areaM2 = left;
      kept.push(square);
    }
    if (!loss.has(orchard.id)) continue;
    orchard.squares = kept;
    const c = state.constructions.find((x) => x.kind === 'orchard' && x.orchardId === orchard.id);
    if (c) {
      c.cost = kept.reduce((sum, s) => sum + s.plantingCost, 0);
      c.done = kept.reduce((sum, s) => sum + s.plantingDone, 0);
    }
  }
  const gone = new Set(state.orchards.filter((o) => o.squares.length === 0).map((o) => o.id));
  if (gone.size > 0) {
    state.orchards = state.orchards.filter((o) => !gone.has(o.id));
    state.constructions = state.constructions.filter(
      (c) => !(c.kind === 'orchard' && c.orchardId != null && gone.has(c.orchardId)),
    );
  }
  return loss;
}

/**
 * Rozběhnutá sezónní práce v sadech (sklizeň, péče) přijde o podíl čtverce – potřebná práce
 * i úroda jablek ubudou, hotový podíl zůstane (sklizená jablka už jsou v zásobách).
 */
function shrinkOrchardWork(
  state: VillageState,
  square: OrchardSquare,
  share: number,
  day: number,
): void {
  const work = state.orchardWork;
  if (!work || work.required <= 0) return;
  const part = work.task === 'harvest' ? squareHarvestWork(square, day) : squareCareWork(square);
  const progress = Math.min(1, work.done / work.required);
  work.required = Math.max(0, work.required - share * part);
  work.done = progress * work.required;
  if (work.task === 'harvest') {
    work.yieldKg = Math.max(0, work.yieldKg - share * squareYieldKg(square, day));
  }
}
