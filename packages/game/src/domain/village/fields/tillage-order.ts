import { partsByIdOf } from '../core/parts-by-id';
import { seasonCrops } from '../core/year-plan';
import type { CropWork, FieldPart, PloughBand, VillageState } from '../types';
import { startedPartIds, unreclaimedPartIds, type PartTask } from './field-progress';

// Orba a setí až po vyklučení (fields.md – Postup práce po čtvercích; návrh Clauda 22. 11. 2026 –
// D116, oprava modelu, ne nové pravidlo): práce plodiny jde po dílech v pořadí `partIds` (orba po
// `plough.partIds`, díly pásu spolu) a díl s vracením přílohu, který lidé ještě klučí, rádlo ani
// motyka nezačnou (`tillableRemaining`) – na křoví a mladý les se neorá a neseje. Ať rádlo nečeká,
// dokud má co orat, jdou každý den nezačaté díly, které čekají na vyklučení, v pořadí za
// připravené (louky, díly v osevu, vyklučené díly). Obě skupiny drží dosavadní pořadí, takže
// vracení přílohu – jde po dílech s klučením v témže pořadí a vyklučené jsou vždy před
// nevyklučenými – zůstane, kde bylo; díly, na kterých začala orba, kopání, setí, pletí nebo žeň,
// se nehnou.

/** Úlohy, po jejichž začátku díl v pořadí zůstává (vracení přílohu ne – jde po svých dílech). */
const AFTER_RECLAIM: readonly PartTask[] = ['plough', 'dig', 'sow', 'weed', 'harvest'];

/**
 * Díly čekající na vyklučení za připravené ve všech plodinách hospodářského roku (mutuje stav;
 * volá se každý den po přibrání dílů – `seasonDay`), viz výše.
 */
export function readyTillageFirst(state: VillageState, day: number): void {
  const season = state.season;
  if (!season) return;
  let partsById: ReadonlyMap<number, FieldPart> | null = null;
  for (const { work } of seasonCrops(season)) {
    if (!work.reclaimIds || work.reclaimIds.length === 0 || work.harvestedKg !== null) continue;
    partsById ??= partsByIdOf(state.parts);
    readyFirst(work, partsById, day);
  }
}

/**
 * Pořadí práce plodiny s díly čekajícími na vyklučení za připravenými (mutuje `work`): orba po
 * pásech a setí, kopání a vracení přílohu ve vsi, která orá celou plodinu, v pořadí orby; plán
 * starší vsi s díly kopanými motykou a ves bez spřežení po dílech.
 */
function readyFirst(work: CropWork, partsById: ReadonlyMap<number, FieldPart>, day: number): void {
  const unreclaimed = unreclaimedPartIds(work, partsById, day);
  if (!unreclaimed) return;
  const started = startedPartIds(work, partsById, day, AFTER_RECLAIM);
  const reclaim = new Set(work.reclaimIds);
  const plough = work.plough;
  if (plough) {
    const before = plough.partIds;
    const next = readyOrder(before, { started, unreclaimed, reclaim }, plough.bands);
    if (next) {
      plough.partIds = next.ids;
      if (next.bands) plough.bands = next.bands;
    }
    if (sameIds(work.partIds, before)) {
      if (next) work.partIds = [...next.ids];
      return;
    }
  }
  const next = readyOrder(work.partIds, { started, unreclaimed, reclaim }, undefined);
  if (next) work.partIds = next.ids;
}

/** Stav dílů pro nové pořadí: začaté, dosud nevyklučené a díly s vracením přílohu. */
interface PartsNow {
  started: ReadonlySet<number>;
  unreclaimed: ReadonlySet<number>;
  reclaim: ReadonlySet<number>;
}

/**
 * Nové pořadí dílů `ids` (a pásů orby): za posledním začatým dílem (i se zbytkem jeho pásu – pás
 * postupuje celý; začatý úsek s nevyklučeným dílem na konci se počítá za nezačatý) napřed
 * připravené, pak čekající na vyklučení, obojí v dosavadním pořadí. Pás
 * čeká, dokud lidé nevyklučí všechny jeho díly – díly pásu se orají spolu, pruh po pruhu (oxen.md –
 * Co nejdelší brázda). Pás s nevyklučeným dílem a s díly bez klučení (louka, díl v osevu) se
 * rozdělí na kus bez klučení a kus s klučením (stejná osa, směr i blok) – kus bez klučení se zorá
 * hned, kratší brázdou. Beze změny (nebo pás přes řez – neměl by nastat) null.
 */
function readyOrder(
  ids: readonly number[],
  now: PartsNow,
  bands: readonly PloughBand[] | undefined,
): { ids: number[]; bands?: PloughBand[] } | null {
  const { started, unreclaimed, reclaim } = now;
  const bandOf = new Map<number, PloughBand>();
  for (const band of bands ?? []) for (const id of band.partIds) bandOf.set(id, band);
  let cut = 0;
  for (let i = 0; i < ids.length; i++) if (started.has(ids[i]!)) cut = i + 1;
  const sameBand = (i: number): boolean => {
    const band = bandOf.get(ids[i]!);
    return band !== undefined && band === bandOf.get(ids[i - 1]!);
  };
  while (cut > 0 && cut < ids.length && sameBand(cut)) cut++;
  // úsek na konci začatých s nevyklučeným dílem: rádlo ani setí do něj nesmí, poloha práce se do
  // něj dostala jen posunem (přibraná dávka s jinou prací na váhu dílu) nebo ve vsi z doby před
  // opravou – úsek jde za řez a počká, poloha práce připadne dalším připraveným dílům
  for (;;) {
    let start = cut - 1;
    while (start > 0 && sameBand(start)) start--;
    if (start < 0 || !ids.slice(start, cut).some((id) => unreclaimed.has(id))) break;
    cut = start;
  }
  const tail = ids.slice(cut);
  if (!tail.some((id) => unreclaimed.has(id))) return null;
  const head = new Set(ids.slice(0, cut));
  // pásy za řezem: rozdělit, když mají nevyklučený díl i díl bez klučení
  const split = new Map<PloughBand, PloughBand[]>();
  for (const id of tail) {
    const band = bandOf.get(id);
    if (!band || split.has(band)) continue;
    if (band.partIds.some((p) => head.has(p))) return null;
    const own = band.partIds.filter((p) => !reclaim.has(p));
    const cleared = band.partIds.filter((p) => reclaim.has(p));
    if (own.length === 0 || !cleared.some((p) => unreclaimed.has(p))) {
      split.set(band, [band]);
      continue;
    }
    split.set(band, [
      { ...band, partIds: own },
      { ...band, partIds: cleared },
    ]);
  }
  const pieceOf = new Map<number, PloughBand>();
  for (const pieces of split.values()) {
    for (const piece of pieces) for (const id of piece.partIds) pieceOf.set(id, piece);
  }
  // kus pásu (díl bez pásu sám) čeká, dokud má nevyklučený díl
  const waits = (id: number): boolean => {
    const piece = pieceOf.get(id);
    return piece ? piece.partIds.some((p) => unreclaimed.has(p)) : unreclaimed.has(id);
  };
  const ready = tail.filter((id) => !waits(id));
  const waiting = tail.filter((id) => waits(id));
  const order = [...ids.slice(0, cut), ...ready, ...waiting];
  const divided = [...split.values()].some((pieces) => pieces.length > 1);
  if (!divided && order.every((id, i) => id === ids[i])) return null;
  if (!bands) return { ids: order };
  // pole pásů v pořadí orby (podle prvního dílu pásu v novém pořadí) – spoléhá na něj
  // `ploughBlockEndPart` i `relayUntouchedBands` (livestock/plough-trip.ts)
  const rank = new Map(order.map((id, i) => [id, i]));
  const first = (band: PloughBand): number =>
    Math.min(...band.partIds.map((id) => rank.get(id) ?? Infinity));
  const sorted = bands
    .flatMap((band) => split.get(band) ?? [band])
    .sort((a, b) => first(a) - first(b));
  return { ids: order, bands: sorted };
}

/** Stejné díly ve stejném pořadí. */
function sameIds(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
