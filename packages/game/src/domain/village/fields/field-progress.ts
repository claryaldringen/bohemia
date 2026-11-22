import { dateOfDayIndex } from '../../calendar';
import { springSowingExtended } from '../disasters/weather-effects';
import { distanceFactor, fallowStage, isOvergrown, isWeedFree, partWalkDistance } from './fields';
import { clearingFellCost, clearingStage } from '../forest/forest-clearing';
import { isHayMeadow, mowingPosition, mowingSpans } from '../livestock/hay';
import { PLOUGH_SOD_FACTOR } from '../livestock/plough';
import { partStage } from '../core/summary';
import type { Crop, CropWork, FieldPart, PloughBand, TileCell, VillageState } from '../types';
import { cropTaskRemaining, cropTaskWindows, cropsAfield, seasonCrops } from '../core/year-plan';
import { partsByIdOf } from '../core/parts-by-id';

// Postup práce po čtvercích (fields.md – Postup práce po čtvercích; Martin, 18. 10. 2026): plán
// vede práci za celou plodinu, díl po dílu ji odvozuje odsud – díly plodiny v pořadí `partIds`
// (nejblíž obydlím první), každý s vahou své práce (plocha × vzdálenost). Při podílu hotové
// úlohy 40 % je hotových prvních 40 % váhy, další díl je čelo práce (rozpracovaný), zbytek čeká.
// Jen čte stav – simulace z toho nic nepočítá.

/** Polní úlohy, které postupují po dílech (výmlat se dělá u vsi); orba rádlem (oxen.md). */
export type PartTask = 'reclaim' | 'plough' | 'dig' | 'sow' | 'weed' | 'harvest';
export const PART_TASKS: readonly PartTask[] = [
  'reclaim',
  'plough',
  'dig',
  'sow',
  'weed',
  'harvest',
];

/**
 * Co je na dílu pole vidět (fields.md – Co hráč vidí; názvy jako `FieldLook` scény): `bare` –
 * rozrytý drn (zakládaný a připravený díl, nově založený díl před kopáním), `plowed` – zkopaný,
 * `sown` – zasetý, `sprouted` – vzešlé osení, `green` – zelené obilí, `ripe` – zralé obilí,
 * `harvesting` – sklizeno, panáky snopů na poli (do konce sklizně plodiny), `stubble` –
 * strniště (po sklizni a loňské před kopáním), `young-fallow` – mladý příloh, `pasture` –
 * spásaný drn přílohu, který se vrací do osevu (i pastvina, která se letos neseče). Úhor ve fázi
 * louky, který se seče na seno (oxen.md – Seno): `meadow` – vysoká tráva, `mown` – posečeno,
 * řádky a kupky sena, `haystacks` – stohy na otavě (do jara se zkrmí). Nepasený a nesečený
 * příloh zarůstá (fields.md – Zarůstání): `shrubs` – křoviny, `young-forest` – mladý les (obtisk
 * pole zmizí, tráva louky zůstane, rostou keře a stromky). Klučení lesa (forest.md – Klučení
 * lesa pro pole – postup): `slash` – paseka s pařezy a hromadami větví (kácení, schnutí),
 * `burnt` – spálenina s popelem (pálení a připravený díl po dohoření do první práce).
 */
export type FieldPartLook =
  | 'bare'
  | 'plowed'
  | 'sown'
  | 'sprouted'
  | 'green'
  | 'ripe'
  | 'harvesting'
  | 'stubble'
  | 'young-fallow'
  | 'pasture'
  | 'meadow'
  | 'mown'
  | 'haystacks'
  | 'shrubs'
  | 'young-forest'
  | 'slash'
  | 'burnt';

/**
 * Vzhled dílu: `look`, u rozpracovaného dílu (čelo práce) i `work` – kolik práce dnešní úlohy je
 * na něm hotovo 0–1 (hotová část má `look`) a `before` – vzhled zbytku. `furrow` – díl plodiny,
 * kterou orá spřežení (oxen.md – Co nejdelší brázda): osa brázd v mřížce pole a směr, kterým orba
 * a setí za ní postupují napříč (`work` se měří od té strany).
 */
export interface PartView {
  look: FieldPartLook;
  work?: number;
  before?: FieldPartLook;
  furrow?: { axis: 'x' | 'y'; sweep: 1 | -1 };
  /**
   * Díl plodiny, kterou orá spřežení: jak vypadal před orbou (strniště, drn pastviny, rozrytý
   * drn) – scéna z něj kreslí ranní stav dílů dnešní orby (oxen.md – Orba za herní den).
   */
  unploughed?: FieldPartLook;
}

/**
 * Úsek dílu v pořadí úlohy – od–do jako podíl celé práce úlohy (0–1). Díly pásu orby (oxen.md –
 * Co nejdelší brázda) mají úsek celého pásu (postupují spolu, pruh po pruhu) a `share` – kolik
 * z práce úseku připadá na díl (bez údaje celý úsek).
 */
export interface PartSpan {
  id: number;
  fieldId: number;
  start: number;
  end: number;
  share?: number;
}

const M2_PER_HA = 10_000;
/** Tolerance proti chybám desetinných čísel u hranic úseků. */
const EPSILON = 1e-9;

/**
 * Váha dílu v úloze – jeho práce (plocha × vzdálenost, orba drnu `PLOUGH_SOD_FACTOR`× víc –
 * `sod`); díl, kterého se úloha netýká, 0. `reclaim` – díly zakládání (jen u úlohy `reclaim`).
 */
function partWeight(
  part: FieldPart,
  task: PartTask,
  day: number,
  reclaim: ReadonlySet<number> | null,
  sod: ReadonlySet<number> | null,
): number {
  if (reclaim && !reclaim.has(part.id)) return 0;
  if (task === 'weed' && isWeedFree(part, day)) return 0;
  const weight = (part.areaM2 / M2_PER_HA) * distanceFactor(partWalkDistance(part));
  return sod?.has(part.id) ? weight * PLOUGH_SOD_FACTOR : weight;
}

/**
 * Díly úlohy v pořadí postupu: orba díly spřežení (oxen.md – Jen rádlo: všechny díly plodiny),
 * kopání díly motyky (v plánu starší vsi, kde spřežení oralo jen část, ty ostatní), ostatní úlohy
 * všechny díly plodiny.
 */
function taskPartIds(work: CropWork, task: PartTask): readonly number[] {
  const plough = work.plough;
  if (task === 'plough') return plough?.partIds ?? [];
  if (task !== 'dig' || !plough) return work.partIds;
  const ploughed = new Set(plough.partIds);
  return work.partIds.filter((id) => !ploughed.has(id));
}

/**
 * Úseky dílů práce plodiny v úloze v pořadí postupu (díly s nulovou vahou vynechané). Díly a váhy
 * v souběžných polích, součty ve stejném pořadí jako dřív (jen zrychlení – volá se mnohokrát denně).
 */
export function taskSpans(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  task: PartTask,
  day: number,
): PartSpan[] {
  // orba a setí za ní ve vsi s pásy orby: díl s drnem váží jako v orbě (orba křížem), ať setí
  // dojde přesně tam, kam orba (seje se, co je zorané – `tilledShare`)
  const banded = work.plough?.bands !== undefined;
  const sodIds = task === 'plough' || (task === 'sow' && banded) ? (work.plough?.sodIds ?? []) : [];
  const sod = sodIds.length > 0 ? new Set(sodIds) : null;
  const reclaim = task === 'reclaim' ? new Set(work.reclaimIds ?? []) : null;
  const parts: FieldPart[] = [];
  const weights: number[] = [];
  let total = 0;
  for (const id of taskPartIds(work, task)) {
    const part = partsById.get(id);
    if (!part) continue;
    const weight = partWeight(part, task, day, reclaim, sod);
    if (!(weight > 0)) continue;
    parts.push(part);
    weights.push(weight);
    total += weight;
  }
  // orba a setí za ní jdou po pásech – díly pásu postupují spolu (oxen.md – Co nejdelší brázda)
  const bands = task === 'plough' || task === 'sow' ? work.plough?.bands : undefined;
  if (bands) return bandSpans(parts, weights, total, bands);
  const spans: PartSpan[] = new Array(parts.length);
  let start = 0;
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k]!;
    const end = start + weights[k]! / total;
    spans[k] = { id: part.id, fieldId: part.fieldId, start, end };
    start = end;
  }
  return spans;
}

/**
 * Úseky po pásech: po sobě jdoucí díly téhož pásu dostanou úsek celého pásu (podle součtu vah)
 * a podíl své váhy; díl mimo pás je úsek sám.
 */
function bandSpans(
  parts: readonly FieldPart[],
  weights: readonly number[],
  total: number,
  bands: readonly PloughBand[],
): PartSpan[] {
  const bandOf = new Map<number, number>();
  bands.forEach((band, k) => {
    for (const id of band.partIds) bandOf.set(id, k);
  });
  const spans: PartSpan[] = [];
  let start = 0;
  for (let i = 0; i < parts.length;) {
    const band = bandOf.get(parts[i]!.id);
    let j = i + 1;
    while (j < parts.length && band !== undefined && bandOf.get(parts[j]!.id) === band) {
      j++;
    }
    let weight = 0;
    for (let k = i; k < j; k++) weight += weights[k]!;
    const end = start + weight / total;
    for (let k = i; k < j; k++) {
      const part = parts[k]!;
      spans.push(
        j - i > 1
          ? { id: part.id, fieldId: part.fieldId, start, end, share: weights[k]! / weight }
          : { id: part.id, fieldId: part.fieldId, start, end },
      );
    }
    start = end;
    i = j;
  }
  return spans;
}

/** Díly plodiny, na kterých setí nezačalo (úloha setí nedošla na začátek jejich úseku). */
export function unsownPartIds(
  state: Pick<VillageState, 'parts'>,
  work: CropWork,
  day: number,
): number[] {
  const partsById = partsByIdOf(state.parts);
  const position = taskPosition(work, 'sow');
  return taskSpans(work, partsById, 'sow', day)
    .filter((span) => position <= span.start + EPSILON)
    .map((span) => span.id);
}

/** Kam úloha došla – podíl hotové práce úlohy 0–1 (úloha bez práce 1). */
export function taskPosition(work: CropWork, task: PartTask, done?: number): number {
  const required = task === 'plough' ? (work.plough?.required ?? 0) : work.required[task];
  const doneNow = done ?? (task === 'plough' ? (work.plough?.done ?? 0) : work.done[task]);
  return required > 0 ? Math.min(1, doneNow / required) : 1;
}

/**
 * Díly plodiny, na kterých už začala práce – některá úloha `tasks` (i orba) přešla začátek jejich
 * úseku (fields.md – Osevní postup po dílech). Úseky dílů se spočítají jednou za úlohu.
 */
export function startedPartIds(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  day: number,
  tasks: readonly PartTask[] = PART_TASKS,
): Set<number> {
  const started = new Set<number>();
  for (const task of tasks) {
    // úloha bez práce (ozim se neplete, bez přílohu se nevrací) díl nezačala
    const required = task === 'plough' ? (work.plough?.required ?? 0) : work.required[task];
    if (required <= 0) continue;
    const position = taskPosition(work, task);
    for (const span of taskSpans(work, partsById, task, day)) {
      if (position > span.start + EPSILON) started.add(span.id);
    }
  }
  return started;
}

/**
 * Díly s vracením přílohu (`reclaimIds` – křoviny a mladý les, s motykou i drn louky), přes které
 * vracení ještě nedošlo celé, i rozpracovaný – na ty orba ani motyka zatím nesmí (fields.md –
 * Postup práce po dílech, orba a setí až po vyklučení). Žádný takový díl null.
 */
export function unreclaimedPartIds(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  day: number,
): Set<number> | null {
  if (!work.reclaimIds || work.reclaimIds.length === 0) return null;
  const position = taskPosition(work, 'reclaim');
  const unreclaimed = new Set<number>();
  for (const span of taskSpans(work, partsById, 'reclaim', day)) {
    if (!isDone(span, position)) unreclaimed.add(span.id);
  }
  return unreclaimed.size > 0 ? unreclaimed : null;
}

/**
 * Kolik orby, kopání nebo setí plodina smí (člověkodny – fields.md, Postup práce po dílech, orba
 * a setí až po vyklučení): úloha dojde nejvýš na začátek prvního úseku, který ještě nedodělala a na
 * kterém je díl dosud nevyklučený (`unreclaimedPartIds`, stav do včerejška; díly pásu mají společný
 * úsek). Takové díly dá za připravené `readyTillageFirst` – rádlo i motyka tak pokračují dalším
 * připraveným dílem v pořadí a setí jde za nimi.
 */
export function tillableRemaining(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  task: 'plough' | 'dig' | 'sow',
  day: number,
): number {
  const remaining = cropTaskRemaining(work, task);
  if (remaining <= 0) return 0;
  const unreclaimed = unreclaimedPartIds(work, partsById, day);
  if (!unreclaimed) return remaining;
  const position = taskPosition(work, task);
  const blocked = taskSpans(work, partsById, task, day).find(
    (s) => !isDone(s, position) && unreclaimed.has(s.id),
  );
  if (!blocked) return remaining;
  const required = task === 'plough' ? (work.plough?.required ?? 0) : work.required[task];
  return Math.min(remaining, Math.max(0, (blocked.start - position) * required));
}

/** Díl je v úloze hotový – úloha došla za jeho konec. */
function isDone(span: PartSpan, position: number): boolean {
  return span.end <= position + EPSILON;
}

/**
 * Díly, na kterých se v úloze dnes pracovalo – úseky, přes které úloha přešla z `before` do
 * `after` (hotová práce v člověkodnech), s podílem dnešní práce na každém a s tím, kolik práce
 * dílu bylo hotovo na začátku a na konci dne (`from`, `to` 0–1 – kudy dnes práce na dílu prošla).
 */
export function partsWorked(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  task: PartTask,
  day: number,
  before: number,
  after: number,
): { id: number; fieldId: number; share: number; from: number; to: number }[] {
  const from = taskPosition(work, task, before);
  const to = taskPosition(work, task, after);
  if (to - from <= EPSILON) return [];
  return taskSpans(work, partsById, task, day).flatMap((span) => {
    const overlap = Math.min(to, span.end) - Math.max(from, span.start);
    return overlap > EPSILON
      ? [
          {
            id: span.id,
            fieldId: span.fieldId,
            share: (overlap / (to - from)) * (span.share ?? 1),
            from: shareOn(span, from) ?? 0,
            to: shareOn(span, to) ?? 1,
          },
        ]
      : [];
  });
}

/** Čelo úlohy – první díl, ke kterému práce ještě nedošla celá; hotová úloha null. */
export function frontierPart(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  task: PartTask,
  day: number,
): number | null {
  const position = taskPosition(work, task);
  return taskSpans(work, partsById, task, day).find((s) => !isDone(s, position))?.id ?? null;
}

/**
 * Čela polních prací dne: pro každou plodinu plánu a úlohu, jejíž okno dnes běží a která má
 * nedodělek, díl, na kterém se pracuje. Díl id → úlohy.
 */
export function fieldFrontiers(state: VillageState, day: number): Map<number, PartTask[]> {
  const frontiers = new Map<number, PartTask[]>();
  if (state.season === null) return frontiers;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const month = dateOfDayIndex(day).month;
  for (const { crop, work } of seasonCrops(state.season)) {
    for (const task of PART_TASKS) {
      const open =
        cropTaskWindows(crop, task).some(([from, to]) => month >= from && month <= to) ||
        (task === 'sow' && springSowingExtended(state, day, crop));
      if (!open || cropTaskRemaining(work, task) <= 0) continue;
      // rádlo a motyka čekají na vyklučení – čelo, na kterém se dnes nepracuje, se neukáže
      if (
        (task === 'plough' || task === 'dig') &&
        tillableRemaining(work, partsById, task, day) <= 0
      )
        continue;
      const id = frontierPart(work, partsById, task, day);
      if (id === null) continue;
      frontiers.set(id, [...(frontiers.get(id) ?? []), task]);
    }
  }
  return frontiers;
}

/**
 * Přirozené stadium zasetého dílu podle kalendáře (měsíc 1–12): v měsíci, kdy setí začíná,
 * zasetý; pak vzešlé osení (ozim přes zimu), od jara zelené obilí, v měsíci sklizně zralé.
 */
const NATURAL_STAGE: Record<Crop, readonly FieldPartLook[]> = {
  // leden … prosinec
  winter: [
    'sprouted',
    'sprouted',
    'sprouted',
    'green',
    'green',
    'green',
    'ripe',
    'ripe',
    'sown',
    'sprouted',
    'sprouted',
    'sprouted',
  ],
  spring: [
    'sprouted',
    'sprouted',
    'sown',
    'sprouted',
    'green',
    'green',
    'green',
    'ripe',
    'sprouted',
    'sprouted',
    'sprouted',
    'sprouted',
  ], // luštěniny: seje se na jaře, v květnu–červnu kvetou zelené, v červenci zralé (sklizeň)
  legume: [
    'sprouted',
    'sprouted',
    'sown',
    'sprouted',
    'green',
    'green',
    'ripe',
    'ripe',
    'sprouted',
    'sprouted',
    'sprouted',
    'sprouted',
  ],
  // len: seje se na jaře, v květnu–červnu zelený (v červnu kvete – modře ve scéně), v červenci
  // dozrává dohněda a trhá se (fields.md – Len)
  flax: [
    'sprouted',
    'sprouted',
    'sown',
    'sprouted',
    'green',
    'green',
    'ripe',
    'ripe',
    'sprouted',
    'sprouted',
    'sprouted',
    'sprouted',
  ],
};

/** Kolik práce úlohy je na dílu hotovo 0–1; díl, kterého se úloha netýká, null. */
function shareOn(
  span: Pick<PartSpan, 'start' | 'end'> | undefined,
  position: number,
): number | null {
  if (!span) return null;
  const share = (position - span.start) / (span.end - span.start);
  // zaokrouhlovací zbytek součtů úseků – hotové a nezačaté jako u vzhledu dílu (DONE)
  return share >= DONE ? 1 : share <= EPSILON ? 0 : share;
}

/** Úseky dílů úlohy podle id. */
function spansById(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  task: PartTask,
  day: number,
): Map<number, PartSpan> {
  return new Map(taskSpans(work, partsById, task, day).map((span) => [span.id, span]));
}

/** Hotovo, nebo rozpracovaný díl s podílem práce. */
const DONE = 1 - EPSILON;

/**
 * Vzhled dílů jedné plodiny plánu: sklizeň > setí > kopání či orba (a vrácení přílohu) – co je
 * nejdál, to je vidět; rozpracovaný díl úlohy má `work` a `before`. Před kopáním je díl, jak ho
 * práce zastihla: loňské strniště (díl v osevu), drn pastviny (vrací se z přílohu, drn louky
 * založené rádlem), nebo rozrytý drn (nově založený díl).
 */
function cropLooks(
  crop: Crop,
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  day: number,
  views: Map<number, PartView>,
): void {
  const month = dateOfDayIndex(day).month;
  const harvested = work.harvestedKg !== null;
  const spans = Object.fromEntries(
    (['reclaim', 'plough', 'dig', 'sow', 'harvest'] as const).map((task) => [
      task,
      { byId: spansById(work, partsById, task, day), at: taskPosition(work, task) },
    ]),
  ) as Record<
    'reclaim' | 'plough' | 'dig' | 'sow' | 'harvest',
    { byId: Map<number, PartSpan>; at: number }
  >;
  const share = (task: keyof typeof spans, id: number): number | null =>
    shareOn(spans[task].byId.get(id), spans[task].at);
  const sodIds = new Set([...(work.reclaimIds ?? []), ...(work.plough?.sodIds ?? [])]);
  const banded = work.plough?.bands !== undefined;
  const furrows = new Map<number, { axis: 'x' | 'y'; sweep: 1 | -1 }>();
  for (const band of work.plough?.bands ?? []) {
    for (const id of band.partIds) furrows.set(id, { axis: band.axis, sweep: band.sweep });
  }
  for (const id of work.partIds) {
    const part = partsById.get(id);
    if (!part || part.state !== 'sown') continue;
    const untouched: FieldPartLook = sodIds.has(id)
      ? 'pasture'
      : part.sownYears > 0
        ? 'stubble'
        : isFreshBurn(part)
          ? 'burnt'
          : 'bare';
    const harvest = share('harvest', id) ?? 0;
    const sow = share('sow', id) ?? 0;
    // plodina, kterou orá spřežení po pásech: zoraná zem jen tam, kam došla orba (klučení křovin
    // lidmi zem nezorá – oxen.md, Jen rádlo); jinak kopání či vrácení přílohu jako dřív
    const dig = banded
      ? (share('plough', id) ?? 0)
      : Math.max(share('dig', id) ?? 0, share('reclaim', id) ?? 0, share('plough', id) ?? 0);
    let view: PartView;
    if (harvested) view = { look: 'stubble' };
    else if (harvest >= DONE) view = { look: 'harvesting' };
    else if (harvest > EPSILON) view = { look: 'harvesting', work: harvest, before: 'ripe' };
    else if (sow >= DONE) view = { look: NATURAL_STAGE[crop][month - 1]! };
    else if (sow > EPSILON) view = { look: 'sown', work: sow, before: 'plowed' };
    else if (dig >= DONE) view = { look: 'plowed' };
    else if (dig > EPSILON) view = { look: 'plowed', work: dig, before: untouched };
    else view = { look: untouched };
    // zoraný díl rádlem nese i vzhled před orbou – scéna z něj kreslí začátek dne, když spřežení
    // dnešní orbu teprve projíždí (oxen.md – Orba za herní den)
    if (view.look === 'plowed' && view.before === undefined && share('plough', id) !== null) {
      view.before = untouched;
    }
    const furrow = furrows.get(id);
    // vzhled před orbou – ranní stav dnešní orby pro scénu (oxen.md – Orba za herní den)
    views.set(id, furrow ? { ...view, furrow, unploughed: untouched } : view);
  }
}

// Seno na dílech úhoru ve fázi louky (oxen.md – Seno; dny v roce, nepřestupný rok): v létě se
// seče po dílech od obydlí, posečené seno leží v řádcích a kupkách, od poloviny července stojí
// stohy na otavě a přes zimu se zkrmí (do poloviny března). Louka, která se neseče, se pase.
const HAY_STACKS_FROM = 193; // 12. 7.
const HAY_SPRING = 74; // 15. 3.
const DAY_JUNE_1 = 152;

/** Podíl posečení dílů letošní (loňské do 1. 6.) seče: díl id → 0–1. */
function mownShares(
  state: VillageState,
  partsById: ReadonlyMap<number, FieldPart>,
): Map<number, number> {
  const mowing = state.hay?.mowing;
  const shares = new Map<number, number>();
  if (!mowing) return shares;
  const at = mowingPosition(mowing);
  for (const span of mowingSpans(mowing, partsById)) {
    if (span.partId !== undefined) shares.set(span.partId, shareOn(span, at) ?? 0);
  }
  return shares;
}

/** Vzhled políčka přirozené louky v seči (oxen.md – Seno). */
export interface MeadowSquareView extends PartView {
  cell: TileCell;
}

/**
 * Přirozené louky letošní (do 1. 6. loňské) seče a co je na nich vidět – vysoká tráva, seč po
 * řádcích, posečeno, stohy (jako louka na seno z úhoru). Louky, které se nesečou, nejsou.
 */
export function hayMeadowLooks(state: VillageState, day: number): MeadowSquareView[] {
  const mowing = state.hay?.mowing;
  if (!mowing?.squares) return [];
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const at = mowingPosition(mowing);
  return mowingSpans(mowing, partsById).flatMap((span) => {
    if (!span.cell) return [];
    const view = hayLook(shareOn(span, at) ?? 0, day);
    if (view.work !== undefined) {
      view.work = Math.min(
        1,
        Math.max(1 / WORK_STEP, Math.round(view.work * WORK_STEP) / WORK_STEP),
      );
    }
    return [{ cell: span.cell, ...view }];
  });
}

/**
 * Vzhled louky na seno: díl v seči – na jaře vysoká tráva, od června podle seče po řádcích,
 * posečený s řádky a kupkami, od poloviny července stohy (do poloviny března); díl, který se
 * neseče, je pastvina.
 */
function hayLook(mown: number | null, day: number): PartView {
  if (mown === null) return { look: 'pasture' };
  const dayOfYear = dateOfDayIndex(day).dayOfYear;
  if (dayOfYear < HAY_SPRING) return { look: mown >= DONE ? 'haystacks' : 'meadow' };
  if (dayOfYear < DAY_JUNE_1) return { look: 'meadow' };
  if (mown >= DONE) return { look: dayOfYear >= HAY_STACKS_FROM ? 'haystacks' : 'mown' };
  if (mown > EPSILON) return { look: 'mown', work: mown, before: 'meadow' };
  return { look: 'meadow' };
}

/** Krok podílu práce rozpracovaného dílu – scéna se nepřestavuje při každém dotazu. */
const WORK_STEP = 20;

/** Příprava půdy dílu před setím: rozrytí drnu přílohu, orba rádlem, nebo kopání motykou. */
export type PrepTask = 'reclaim' | 'plough' | 'dig';

/**
 * Letošní práce na dílu (fields.md – Co hráč vidí, panel dílu): díl hospodářského roku – plodina,
 * příprava půdy (úloha, která je na řadě, a kolik z ní je na dílu hotovo; všechno hotové –
 * poslední úloha s 1), setí a sklizeň; díl letošní seče sena – kolik je posečeno. Podíly 0–1
 * stejně jako vzhled dílu (`fieldPartLooks`): práce mění díl, až když k němu dojde.
 */
export interface PartYearWork {
  crop?: {
    crop: Crop;
    prep: { task: PrepTask; share: number } | null;
    sow: number;
    harvest: number;
  };
  mow?: number;
}

/**
 * Plodiny letošní práce (po sklizni jaře plán u výmlatu) a v září i jař, kterou srpen nedosklidil
 * (`cropsAfield` – fields.md, Žeň jaře i v září).
 */
function yearCrops(state: VillageState): { crop: Crop; work: CropWork }[] {
  if (state.season) return cropsAfield(state);
  return state.threshingSeason ? seasonCrops(state.threshingSeason) : [];
}

/**
 * Letošní práce na dílech pole v den `day` (díl id → práce) – jen díly hospodářského roku (po sklizni
 * jaře plán u výmlatu) a díly letošní seče sena. Jen čte stav.
 */
export function partYearWork(state: VillageState, day: number): Map<number, PartYearWork> {
  const result = new Map<number, PartYearWork>();
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  for (const { crop, work } of yearCrops(state)) {
    const tasks = ['reclaim', 'plough', 'dig', 'sow', 'harvest'] as const;
    const spans = new Map(
      tasks.map((task) => [
        task,
        { byId: spansById(work, partsById, task, day), at: taskPosition(work, task) },
      ]),
    );
    const share = (task: (typeof tasks)[number], id: number): number | null => {
      const t = spans.get(task)!;
      return shareOn(t.byId.get(id), t.at);
    };
    const harvested = work.harvestedKg !== null;
    for (const id of work.partIds) {
      const part = partsById.get(id);
      if (!part || part.state !== 'sown') continue;
      // ves se spřežením orá všechno (oxen.md); díl mimo orbu (plán starší vsi) se kope
      const steps = (['reclaim', 'plough', 'dig'] as const).flatMap((task) => {
        const done = share(task, id);
        if (done === null) return [];
        return [{ task, share: harvested ? 1 : done }];
      });
      const prep = steps.find((s) => s.share < DONE) ?? steps.at(-1) ?? null;
      result.set(id, {
        crop: {
          crop,
          prep,
          sow: harvested ? 1 : (share('sow', id) ?? 0),
          harvest: harvested ? 1 : (share('harvest', id) ?? 0),
        },
      });
    }
  }
  for (const [id, mown] of mownShares(state, partsById)) {
    result.set(id, { ...result.get(id), mow: mown });
  }
  return result;
}

/**
 * Spálenina po klučení lesa (forest.md – Klučení lesa pro pole – postup, bod 4): díl po dohoření
 * do první práce – první oběh osevu (bonus popela běží, ještě nesklizeno).
 */
function isFreshBurn(part: FieldPart): boolean {
  return (
    part.burnedDay !== undefined && part.sownYears === 0 && part.bonusUntilDay !== null && !part.sod
  );
}

/**
 * Vzhled zakládaného dílu v lese po fázích (forest.md – Klučení lesa pro pole – postup): kácení
 * – paseka (`slash`) po padlých stromech (čtverec bez stromů podle práce kácení), schnutí –
 * paseka, pálení – spálenina podle práce pálení, zbytek paseka. Díl bez fází null.
 */
function clearingLook(part: FieldPart, day: number): PartView | null {
  const clearing = part.clearing;
  const stage = clearingStage(part, day);
  if (!clearing || stage === null) return null;
  const fellCost = clearingFellCost(part);
  if (stage === 'fell') {
    const n = clearing.fell.length;
    const work = n > 0 ? clearing.felled / n : fellCost > 0 ? part.foundingDone / fellCost : 0;
    return { look: 'slash', work: Math.min(1, Math.max(0, work)) };
  }
  if (stage === 'dry' && part.foundingDone <= fellCost + EPSILON) return { look: 'slash' };
  // pálení (i přerušené koncem okna – rozpálená část zůstane spálenina)
  const burn = clearing.burnCost > 0 ? (part.foundingDone - fellCost) / clearing.burnCost : 1;
  return { look: 'burnt', work: Math.min(1, Math.max(0, burn)), before: 'slash' };
}

/**
 * Vzhled dílů pole v den `day` (fields.md – Postup práce po čtvercích): díl id → vzhled.
 * Zakládané díly (rozrytý drn, rozpracovaný s podílem založení – zakládá se od nejbližšího
 * k obydlí, nezačatý má podíl 0), připravené (rozrytý drn), díly plánu podle toho, kam došlo
 * kopání, setí a sklizeň jejich plodiny (po sklizni jaře 31. 8. je plán u výmlatu), mladý
 * příloh, zarůstající příloh (křoviny, mladý les) a louka na seno podle seče.
 * Podíl práce je po dvacetinách (začatá práce aspoň jedna dvacetina).
 */
export function fieldPartLooks(
  state: VillageState,
  day: number,
  sceneOnly = false,
): Map<number, PartView> {
  const views = new Map<number, PartView>();
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const mown = mownShares(state, partsById);
  for (const { crop, work } of yearCrops(state)) {
    cropLooks(crop, work, partsById, day, views);
  }
  for (const part of state.parts) {
    if (views.has(part.id)) continue;
    const clearing = part.state === 'founding' ? clearingLook(part, day) : null;
    if (clearing) {
      views.set(part.id, clearing);
    } else if (part.state === 'founding') {
      const work = part.foundingCost > 0 ? part.foundingDone / part.foundingCost : 0;
      // louku zakládanou rádlem jen vyklízí od překážek – drn zůstane do orby (oxen.md – Jen rádlo)
      views.set(part.id, { look: part.sod ? 'pasture' : 'bare', work: Math.min(1, work) });
    } else if (sceneOnly && part.state === 'ready' && part.sownYears > 0 && !part.sod) {
      // jen pro scénu (`sceneOnly`): díl v osevu po sklizni čeká na řadě – strniště do další práce
      // (fields.md – Osevní postup po dílech, bod 6); chůze, vozy a pastva (simulace) berou
      // skutečný stav dílu, takže vzhled strniště je nemění
      views.set(part.id, { look: 'stubble' });
    } else if (part.state === 'ready' || part.state === 'sown') {
      views.set(part.id, { look: part.sod ? 'pasture' : isFreshBurn(part) ? 'burnt' : 'bare' });
    } else if (isOvergrown(part)) {
      // zarůstající příloh (fields.md – Zarůstání) – křoviny a mladý les
      views.set(part.id, { look: fallowStage(part, day) === 'shrubs' ? 'shrubs' : 'young-forest' });
    } else if (partStage(part, day) === 'young-fallow') {
      views.set(part.id, { look: 'young-fallow' });
    } else if (isHayMeadow(part, day)) {
      views.set(part.id, hayLook(mown.get(part.id) ?? null, day));
    }
  }
  // po dvacetinách; začatá práce aspoň jedna dvacetina (nezačatý díl má 0 – jen vytyčený)
  for (const view of views.values()) {
    if (view.work === undefined || view.work <= 0) continue;
    const step = Math.round(view.work * WORK_STEP) / WORK_STEP;
    view.work = Math.min(1, Math.max(1 / WORK_STEP, step));
  }
  return views;
}
