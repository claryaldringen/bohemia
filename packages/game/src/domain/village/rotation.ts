import { dateOfDayIndex } from '../calendar';
import {
  effectiveFertility,
  endOfSeason,
  expectedNetKg,
  fallowStage,
  isEmergencyFallow,
  isSowableFertility,
  partOvergrowthYears,
} from './fields';
import { expectedFlaxKg, flaxAllowedIn, seasonHarvestYear } from './flax';
import { EMERGENCY_GROUP, sowingBlocks, villageHoldings } from './holdings';
import { partsByIdOf } from './parts-by-id';
import { CROP_WINDOWS, FERTILITY } from './rules';
import type { Crop, FarmSeason, FieldPart, SeasonCrop, VillageState } from './types';
import { logsFromClearedTrees } from './wood';
import { woodMatureShare, woodTreesOnArea } from './woods';
import { lateSpringCrop, seasonCrops, windowEndOf } from './year-plan';

// Přílohová soustava do roku 1100 (fields.md, Martin 10. 11. 2026: „od roku 500 do roku 1100 bude
// přílohový systém“) a setí do konce okna (Osevní postup po dílech, 25. 10. 2026). Ves nemá roční
// plán: díl se osévá rok po roku, dokud jeho úrodnost neklesne pod 70 %, pak leží ladem, dokud se
// neodpočine na 95 % (`nextSowing`); plodinu dostane podle prvního okna, ve kterém na něj ves práci
// dotáhne (`sowingCropToday`), a ves k letošní práci přibírá všechny díly na řadě, dokud stačí
// lidé, spřežení a osivo (`turnSelection`). Čisté funkce stavu a dne – žádná náhoda.

/** Tolerance porovnání úrodnosti a práce. */
const EPSILON = 1e-9;
/** Tolerance porovnání lnu (kg). */
const KG_EPSILON = 1e-6;

/**
 * Co je na dílu na řadě (fields.md – Přílohová soustava do roku 1100): `first` – první osev oběhu
 * (čerstvě založený díl, příloh odpočatý aspoň na `FERTILITY.fallowReady`), `again` – díl
 * v osevu, který po sklizni smí dál (aspoň `FERTILITY.sowableMin` – osévá se rok po roku), `late`
 * – příloh 70–95 % (jen když běžné díly nestačí), `emergency` – příloh 40–70 % (nouzový osev),
 * `rest` – příloh odpočívá. Plodinu žádný druh nepředepisuje (`sowingCropToday`).
 */
export type SowingKind = 'first' | 'again' | 'late' | 'emergency' | 'rest';

/** Co je na dílu na řadě; díl v sezóně (zasetý) a zakládaný null. */
export function nextSowing(part: FieldPart): SowingKind | null {
  // opuštěný díl odpočívá napořád (fields.md – Opuštěný díl); osetý dál roste do žní
  if (part.abandoned) return part.state === 'fallow' || part.state === 'ready' ? 'rest' : null;
  if (part.state === 'ready') return part.sownYears > 0 ? 'again' : 'first';
  if (part.state !== 'fallow') return null;
  if (part.fertilityShare >= FERTILITY.fallowReady - EPSILON) return 'first';
  if (isSowableFertility(part)) return 'late';
  return isEmergencyFallow(part) ? 'emergency' : 'rest';
}

/** Okno úlohy plodiny dnes běží. */
export function windowOpen(crop: Crop, task: 'reclaim' | 'dig' | 'sow', day: number): boolean {
  return windowEndOf(CROP_WINDOWS[crop][task], dateOfDayIndex(day).month) !== null;
}

/**
 * Ozim smí na dílu dnes začít – celé okno setí: seje se týž den hned za orbou a motykou (fields.md –
 * Práce; Martin 9. 11. 2026: „Setí by mělo probíhat ihned po orbě“).
 */
function winterStartable(day: number): boolean {
  return windowOpen('winter', 'sow', day);
}

/** Jař (i len místo ní) smí dnes začít – v oknech kopání (seje se týž den hned za orbou a motykou). */
export function springStartable(day: number): boolean {
  return windowOpen('spring', 'dig', day);
}

/**
 * Obilí, které dnes začne na dílu na řadě (fields.md – Přílohová soustava do roku 1100, Plodina
 * podle prvního okna): každý díl na řadě (první osev, díl v osevu i po ozimu, příloh 70–95 %
 * a nouzový) ozim, dokud běží okno setí ozimu, potom jař – díl, na kterém setí ozimu do konce
 * října nezačne, se oseje na jaře jaří. Žádný předepsaný sled. Jinak null (okna zavřená, díl
 * odpočívá).
 */
export function sowingCropToday(kind: SowingKind | null, day: number): 'winter' | 'spring' | null {
  if (kind === null || kind === 'rest') return null;
  if (winterStartable(day)) return 'winter';
  return springStartable(day) ? 'spring' : null;
}

/**
 * Opuštěný díl jde do přílohu (mutuje – fields.md, Opuštěný díl): jako díl po osevu, který
 * vyčerpal úrodnost – od dne `day` ladem, bez plodiny, postupu a popela z vymýcení.
 */
export function toAbandonedFallow(part: FieldPart, day: number): void {
  part.state = 'fallow';
  part.fallowSinceDay = day;
  part.sownYears = 0;
  part.bonusUntilDay = null;
  delete part.crop;
}

/**
 * Konec hospodářského roku (1. 9.) pro jeden díl podle přílohové soustavy (fields.md – Přílohová
 * soustava do roku 1100) – mění ho na místě. Úrodnost jako `endOfSeason`: díl, kterému po osevu
 * zůstalo aspoň `FERTILITY.sowableMin`, se osévá dál (čeká na řadě – `again`, plodinu dostane podle
 * prvního okna), jinak ho `endOfSeason` pošle do přílohu (i bez bonusu vymýceného lesa). Platí pro
 * každý osev – obilí, len, luštěniny starších vsí i nouzový příloh. Osetý len (i nevytrhaný) si díl
 * pamatuje rokem `flaxYear` (fields.md – Len, nejdřív za 7 let znovu).
 */
export function rotateAfterSeason(part: FieldPart, day: number): void {
  const sown = part.state === 'sown';
  const crop = part.crop ?? 'spring';
  if (sown && crop === 'flax') part.flaxYear = dateOfDayIndex(day).year;
  endOfSeason(part, day);
  // opuštěný díl po žních do přílohu (fields.md – Opuštěný díl)
  if (part.abandoned && (part.state === 'sown' || part.state === 'ready')) {
    toAbandonedFallow(part, day);
    return;
  }
  if (!sown || part.state !== 'sown') return;
  delete part.crop;
  part.state = 'ready';
}

/**
 * Vybrané díly se osejí plodinou `crop` (příloh se vrací do osevu – zarůstání začne znovu); díl
 * z přílohu si pamatuje, jak ležel, kdyby ho ves zase uvolnila (`returnPart`). Díl v osevu si
 * nechá léta v řadě (`sownYears`) – uvolněný nebo nezasetý díl na řadu přijde zase stejně.
 */
export function sowParts(parts: readonly FieldPart[], crop: Crop): void {
  for (const part of parts) {
    if (part.state === 'fallow') {
      part.fallowBeforeSeason = {
        sinceDay: part.fallowSinceDay,
        ...(part.overgrowthYears !== undefined ? { overgrowthYears: part.overgrowthYears } : {}),
      };
      part.fallowSinceDay = null;
      part.sownYears = 0;
      delete part.overgrowthYears;
    }
    part.state = 'sown';
    part.crop = crop;
  }
}

/**
 * Díl, který ves k letošní práci přibrala a pak z ní vyřadila (nezasetá jař na konci okna –
 * fields.md, Osevní postup po dílech, bod 2), se vrátí, jak byl (mění ho na místě): příloh
 * leží ladem jako předtím (`fallowBeforeSeason`), hotový díl a díl v osevu zase čeká na řadě
 * (`sownYears` zůstal). Rozkopání propadne.
 */
export function returnPart(part: FieldPart, startDay: number): void {
  const before = part.fallowBeforeSeason;
  delete part.crop;
  delete part.fallowBeforeSeason;
  if (!before) {
    // opuštěný díl se nevrací k osevu – leží ladem (fields.md – Opuštěný díl)
    if (part.abandoned) toAbandonedFallow(part, startDay);
    else part.state = 'ready';
    return;
  }
  part.state = 'fallow';
  part.fallowSinceDay = before.sinceDay ?? startDay;
  part.sownYears = 0;
  if (before.overgrowthYears !== undefined) part.overgrowthYears = before.overgrowthYears;
}

/**
 * Klády z vracených dílů v mladém lese (fields.md – Zarůstání): dospělých stromů jako v lese vsi
 * stejného stáří (`woodMatureShare` × hustota lesa) – za každý celý strom kláda (forest.md –
 * Mýcení). Díly ve stavu před osevem.
 */
export function reclaimedLogs(parts: readonly FieldPart[], day: number): number {
  let trees = 0;
  for (const part of parts) {
    if (part.state !== 'fallow' || fallowStage(part, day) !== 'young-forest') continue;
    trees += woodTreesOnArea(part.areaM2) * woodMatureShare(partOvergrowthYears(part));
  }
  return logsFromClearedTrees(Math.floor(trees + 1e-9));
}

/**
 * Klády z mladého lesa na přibraných dílech, které ves vyklučila (fields.md – Zarůstání,
 * forest.md – Mýcení): stáří lesa podle stavu před osevem (`fallowBeforeSeason`) – jinak jako
 * `reclaimedLogs`.
 */
export function clearedLogs(parts: readonly FieldPart[], day: number): number {
  let trees = 0;
  for (const part of parts) {
    const before = part.fallowBeforeSeason;
    if (!before || before.overgrowthYears === undefined) continue;
    const was = { fallowSinceDay: before.sinceDay, overgrowthYears: before.overgrowthYears };
    if (fallowStage(was, day) !== 'young-forest') continue;
    trees += woodTreesOnArea(part.areaM2) * woodMatureShare(before.overgrowthYears);
  }
  return logsFromClearedTrees(Math.floor(trees + 1e-9));
}

/** Díl, který přibude k letošní práci, a jeho plodina. */
export interface SeasonJoin {
  id: number;
  crop: Crop;
}

/** Co výběr dílů dne potřebuje vědět mimo stav dílů (`turnSelection`). */
export interface TurnOptions {
  /**
   * Potřeba lnu na oděv zapsaná v hospodářském roce k 1. 9. (kg třeného lnu – fields.md, Len): len bere díly
   * jen do ní; 0 = len se nevybírá (plán bez potřeby).
   */
  flaxNeedKg: number;
  /**
   * Skutečný nedostatek – zásoby k sklizni (i hromada osiva okna a snopy) pod přežívací zásobou do
   * žní (`seedKeepKg`): k práci přibudou i přílohy 70–95 % a nouzové přílohy 40–70 %.
   */
  shortage: boolean;
}

/** Díly seřazené podle id – výběr nezávisí na pořadí dílů ve stavu. */
function byId(parts: readonly FieldPart[]): readonly FieldPart[] {
  for (let i = 1; i < parts.length; i++) {
    if (parts[i - 1]!.id > parts[i]!.id) return [...parts].sort((a, b) => a.id - b.id);
  }
  return parts;
}

/**
 * Díly na řadě jsou oseté (fields.md – Osevní postup po dílech, bod 3, „na řadě“ – návrh Clauda):
 * žádný díl na řadě dnes nepřibývá a plodiny letošní práce, jejichž okno setí dnes běží, mají
 * zaseto. Okno setí přílohu 70–95 % (ozim, nebo jař podle dne) musí dnes běžet.
 */
function turnSown(state: VillageState, day: number): boolean {
  const crop = sowingCropToday('late', day);
  if (crop === null || !windowOpen(crop, 'sow', day)) return false;
  if (!state.season) return true;
  for (const { crop: c, work } of seasonCrops(state.season)) {
    if (work.harvestedKg !== null || !windowOpen(c, 'sow', day)) continue;
    if (work.done.sow < work.required.sow - EPSILON) return false;
  }
  return true;
}

/**
 * Díly, které dnes přibudou k letošní práci, v pořadí, ve kterém je ves vezme (fields.md – Osevní
 * postup po dílech, bod 3; Martin 25. 10. 2026: „ves by měla vyrobit maximum obilí a maximum sena,
 * kolik jí umožňuje rozloha polí a množství lidí“): bez odhadu úrody a bez stropu – kolik ves
 * zvládne, určí čelo práce (lidé a spřežení) a osivo. Napřed len místo jaře do potřeby lnu na oděv
 * (`flaxCandidates` – fields.md, Len; Martin 9. 11. 2026), pak obilí na všech dílech na řadě (první
 * osev a díly v osevu) v pořadí přílohové soustavy po úsecích od domu
 * (`sowingBlocks`), v dávce ozim před jaří (jeho okno končí dřív); plodina `sowingCropToday`.
 * Na řadě (návrh Clauda): zotavené přílohy 70–95 % až když jsou díly na řadě oseté a okno setí
 * běží (`turnSown` – osivo z toho, co zbude nad přežívací zásobou), nouzové přílohy 40–70 % s kladnou
 * úrodou jen při skutečném nedostatku (`TurnOptions.shortage` – pak i přílohy 70–95 % hned).
 * Luštěniny ves na poli nepěstuje (fields.md – Luštěniny, zrušeno – má je domácnost na zahrádce
 * u obydlí; Martin 9. 11. 2026). Stav nemění.
 */
export function turnSelection(
  state: VillageState,
  day: number,
  options: TurnOptions,
): SeasonJoin[] {
  const parts = byId(state.parts);
  const holdings = villageHoldings(parts === state.parts ? state : { ...state, parts: [...parts] });
  // druh osevu a vybrané díly v polích podle id místo map (jen zrychlení – díly jsou seřazené,
  // poslední má největší id); id mimo rozsah dílů žádný díl nemá
  const size = idSlots(parts);
  const inSeason = size > 0 ? new Uint8Array(size) : null;
  const inSeasonSet = inSeason ? null : new Set<number>();
  const mark = (id: number): void => {
    if (!inSeason) inSeasonSet!.add(id);
    else if (Number.isInteger(id) && id >= 0 && id < size) inSeason[id] = 1;
  };
  // len letošní práce, který ještě poroste – kolik ho ves čeká
  let flaxKg = 0;
  const partsById = partsByIdOf(parts);
  for (const { crop, work } of state.season ? seasonCrops(state.season) : []) {
    for (const id of work.partIds) mark(id);
    if (crop !== 'flax' || work.harvestedKg !== null) continue;
    for (const id of work.partIds) {
      const part = partsById.get(id);
      if (part) flaxKg += expectedFlaxKg(part, day);
    }
  }
  // jař, kterou srpen nedosklidil, je na poli – díl přijde na řadu, až se sklidí (fields.md – Žeň
  // jaře i v září)
  for (const id of lateSpringCrop(state)?.partIds ?? []) mark(id);
  // druh osevu podle id dílu (KIND_UNKNOWN = ještě nezjištěný); bez polí podle id mapa
  const kindSlots = size > 0 ? new Uint8Array(size) : null;
  const kindOf = kindSlots ? null : new Map<number, SowingKind | null>();
  const kind = (p: FieldPart): SowingKind | null => {
    if (kindSlots) {
      const code = kindSlots[p.id]!;
      if (code !== KIND_UNKNOWN) return KIND_OF_CODE[code] ?? null;
      const k = inSeason![p.id] ? null : nextSowing(p);
      kindSlots[p.id] = CODE_OF_KIND.get(k)!;
      return k;
    }
    let k = kindOf!.get(p.id);
    if (k === undefined) {
      k = inSeasonSet!.has(p.id) ? null : nextSowing(p);
      kindOf!.set(p.id, k);
    }
    return k;
  };
  // obilí dnes podle druhu osevu – jen druh a den, tak jednou za druh (jen zrychlení)
  const cropToday = new Map<SowingKind | null, 'winter' | 'spring' | null>();
  const cropOf = (k: SowingKind | null): 'winter' | 'spring' | null => {
    let crop = cropToday.get(k);
    if (crop === undefined) {
      crop = sowingCropToday(k, day);
      cropToday.set(k, crop);
    }
    return crop;
  };
  const blocks = sowingBlocks(parts, holdings).flat();
  const turn = blocks.filter((p) => onTurn(kind(p)));
  const join: SeasonJoin[] = [];
  const usedSlots = size > 0 ? new Uint8Array(size) : null;
  const usedSet = usedSlots ? null : new Set<number>();
  const isUsed = (id: number): boolean => (usedSlots ? usedSlots[id] === 1 : usedSet!.has(id));
  const use = (id: number): void => {
    if (usedSlots) usedSlots[id] = 1;
    else usedSet!.add(id);
  };
  // len místo jaře do potřeby na oděv – jen když jař dnes smí začít; na podzim (jař ještě ne) si ves
  // díly na příští jarní len jen odloží (`used` bez zápisu do `join`) – ozim je nedostane; s lnem,
  // který potřebu už pokryje, se díly pro len nehledají (jen zrychlení – nevzal by žádný)
  if (options.flaxNeedKg > KG_EPSILON && flaxKg < options.flaxNeedKg - KG_EPSILON) {
    // dokud běží okno ozimu, díl na řadě dostává ozim – len se tehdy jen odkládá
    const reserving = winterStartable(day);
    const sowNow = !reserving && springStartable(day);
    if (sowNow || reserving) {
      for (const p of flaxCandidates(blocks, kind, cropOf, day)) {
        if (flaxKg >= options.flaxNeedKg - KG_EPSILON) break;
        if (sowNow) join.push({ id: p.id, crop: 'flax' });
        use(p.id);
        flaxKg += expectedFlaxKg(p, day);
      }
    }
  }
  // obilí v pořadí bloků, v dávce ozim před jaří
  const grain = (list: readonly FieldPart[]): number => {
    const batch: SeasonJoin[] = [];
    for (const p of list) {
      if (isUsed(p.id)) continue;
      const crop = cropOf(kind(p));
      if (!crop) continue;
      batch.push({ id: p.id, crop });
      use(p.id);
    }
    for (const j of batch) if (j.crop === 'winter') join.push(j);
    for (const j of batch) if (j.crop !== 'winter') join.push(j);
    return batch.length;
  };
  const onTurnJoins = grain(turn);
  const late = (): FieldPart[] => blocks.filter((p) => kind(p) === 'late');
  if (options.shortage) {
    grain(late());
    grain(
      sowingBlocks(parts, holdings, EMERGENCY_GROUP)
        .flat()
        .filter((p) => kind(p) === 'emergency' && expectedNetKg(p, day) > 0),
    );
  } else if (onTurnJoins === 0 && turnSown(state, day)) {
    grain(late());
  }
  return join;
}

/** Druh osevu dílu ještě nezjištěný (pole druhů v `turnSelection`). */
const KIND_UNKNOWN = 0;
/** Druhy osevu podle kódu v poli druhů (`turnSelection`; 0 = nezjištěný). */
const KIND_OF_CODE: readonly (SowingKind | null)[] = [
  null,
  null,
  'first',
  'again',
  'late',
  'emergency',
  'rest',
];
const CODE_OF_KIND = new Map<SowingKind | null, number>(
  KIND_OF_CODE.map((k, code) => [k, code] as const).filter(([, code]) => code > 0),
);

/**
 * Velikost polí podle id dílu (`turnSelection`) – největší id + 1 u dílů seřazených podle id
 * s celými nezápornými id a rozumným rozsahem; jinak 0 (výběr pak jede přes mapy).
 */
function idSlots(parts: readonly FieldPart[]): number {
  if (parts.length === 0) return 0;
  const lastId = parts[parts.length - 1]!.id;
  const firstId = parts[0]!.id;
  if (!Number.isInteger(firstId) || firstId < 0 || !Number.isInteger(lastId)) return 0;
  if (lastId >= 64 * parts.length + 4096) return 0;
  for (const p of parts) if (!Number.isInteger(p.id)) return 0;
  return lastId + 1;
}

/**
 * Díly, které smí dostat len (fields.md – Len; Martin 9. 11. 2026: „Len je extrémně náročná
 * plodina na kvalitu půdy.“), v pořadí, ve kterém je len bere: všechny díly na řadě (díly v osevu,
 * první osev, příloh 70–95 %) od nejlepší úrodnosti (při shodě podle id) – len je na půdu
 * nejnáročnější, tak mu patří nejlepší díly, ať jsou kdekoli (Martin 10. 11. 2026: „Ano. Jak jsme
 * řekli, len je extrémně náročná plodina, ale zase ho není potřeba moc“; dřívější přednost dílů
 * v osevu před prvním osevem je pryč – návrh Clauda); jen díly od 70 % (`isSowableFertility`),
 * na kterých len 7 let nerostl (`flaxAllowed`). Nouzový příloh ne. Stejné pořadí slouží na jaře
 * k setí a na podzim k odložení dílů před ozimem (`turnSelection`). Vydává díly postupně z haldy
 * (len bere jen pár nejlepších – celé řazení by bylo zbytečné; pořadí jako stabilní řazení podle
 * úrodnosti a id, při shodě obojího podle pořadí v blocích).
 */
function* flaxCandidates(
  blocks: readonly FieldPart[],
  kind: (p: FieldPart) => SowingKind | null,
  cropOf: (k: SowingKind | null) => 'winter' | 'spring' | null,
  day: number,
): Generator<FieldPart, void, void> {
  const list: FieldPart[] = [];
  const fertility: number[] = [];
  const harvestYear = seasonHarvestYear(day);
  for (const p of blocks) {
    const k = kind(p);
    if (k !== 'again' && k !== 'first' && k !== 'late') continue;
    if (cropOf(k) === null || !isSowableFertility(p) || !flaxAllowedIn(p, harvestYear)) continue;
    list.push(p);
    fertility.push(effectiveFertility(p, day));
  }
  // halda indexů do `list` – nahoře díl, který by stabilní řazení dalo první
  const before = (a: number, b: number): boolean => {
    const d = fertility[b]! - fertility[a]! || list[a]!.id - list[b]!.id;
    return d < 0 || (d === 0 && a < b);
  };
  const heap = list.map((_, i) => i);
  const down = (from: number, size: number): void => {
    let i = from;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= size) return;
      const r = l + 1;
      const c = r < size && before(heap[r]!, heap[l]!) ? r : l;
      if (!before(heap[c]!, heap[i]!)) return;
      const t = heap[i]!;
      heap[i] = heap[c]!;
      heap[c] = t;
      i = c;
    }
  };
  for (let i = (heap.length >> 1) - 1; i >= 0; i--) down(i, heap.length);
  for (let size = heap.length; size > 0;) {
    const top = heap[0]!;
    size--;
    heap[0] = heap[size]!;
    down(0, size);
    yield list[top]!;
  }
}

/** Díl na řadě s obilím – první osev a díl v osevu (ne příloh 70–95 % ani nouzový). */
export function onTurn(kind: SowingKind | null): boolean {
  return kind === 'first' || kind === 'again';
}

/** Díl osevu navíc z doby ročního plánu – `sownYears`: osévaný díl ležel ladem jen od plánu. */
interface LegacyExtraPart {
  id: number;
  sownYears?: number;
}
/** Hospodářský rok uložený s ročním plánem: osev navíc a čekající příprava jeho dílů. */
type LegacySeason = FarmSeason & { extra?: LegacyExtraPart[] };
type LegacyCrop = SeasonCrop & { extraLeft?: unknown };
type LegacyPart = FieldPart & { fallowBeforePlan?: FieldPart['fallowBeforeSeason'] };

/** Hospodářský rok bez klíčů ročního plánu (`extra`, `extraLeft`). */
function seasonWithoutPlan(season: LegacySeason | null): FarmSeason | null {
  if (!season) return null;
  const legacy =
    season.extra !== undefined || season.crops.some((c: LegacyCrop) => c.extraLeft !== undefined);
  if (!legacy) return season;
  const copy: LegacySeason = {
    ...season,
    crops: season.crops.map((c) => {
      const crop: LegacyCrop = { ...c };
      delete crop.extraLeft;
      return crop;
    }),
  };
  delete copy.extra;
  return copy;
}

/** Převod bez značky – může selhat na poškozeném stavu (`withSowingRotation` ho zachytí). */
function convertToRotation(state: VillageState): VillageState {
  const season = state.season as LegacySeason | null;
  const inSeason = new Set(season?.crops.flatMap((c) => c.partIds));
  const waiting = new Map((season?.extra ?? []).map((e) => [e.id, e]));
  let partsChanged = false;
  const parts = state.parts.map((p: LegacyPart) => {
    const sownYears = waiting.get(p.id)?.sownYears;
    const restore = sownYears !== undefined && p.state === 'fallow' && !inSeason.has(p.id);
    if (p.fallowBeforePlan === undefined && !restore) return p;
    partsChanged = true;
    const part: LegacyPart = { ...p };
    if (part.fallowBeforePlan !== undefined) {
      part.fallowBeforeSeason = part.fallowBeforePlan;
      delete part.fallowBeforePlan;
    }
    if (restore) {
      // osévaný díl ležel ladem jen od plánu – zase čeká na řadě s léty v řadě
      part.state = 'ready';
      part.fallowSinceDay = null;
      part.sownYears = sownYears;
      delete part.overgrowthYears;
    }
    return part;
  });
  const next = seasonWithoutPlan(season);
  const threshing = seasonWithoutPlan(state.threshingSeason as LegacySeason | null);
  if (!partsChanged && next === state.season && threshing === state.threshingSeason) return state;
  return { ...state, parts, season: next, threshingSeason: threshing };
}

/**
 * Ves uložená s ročním plánem přejde na osevní postup po dílech jednou (fields.md – Osevní postup
 * po dílech, bod 7 – Starší vsi; značka `VillageState.sowingRotation`). Volat po `withSeason`.
 * Plodiny hospodářského roku zůstanou s hotovou prací a jsou nutné – i začaté díly osevu navíc:
 * jejich čekající příprava (`extraLeft`) je v potřebné práci, převodem se stane nutnou. Díly
 * osevu navíc, na kterých práce nezačala (`extra`), čekají podle stavu – osévaný díl, který ležel
 * ladem jen od plánu, je zase na řadě s léty v řadě, příloh leží dál. Příloh vracený do osevu si
 * pamatuje stav před sezónou (`fallowBeforeSeason`). Zda se díl osévá dál, rozhodne
 * `rotateAfterSeason` 1. 9.; pomoc rodiny a potřeba lnu zůstanou do konce roku. Při chybě se ves
 * načte beze změny se značkou (jako `withRoadsRebuilt`; zpráva chyby zůstane v `sowingRotationFailed`). Vstupní stav nemění.
 */
export function withSowingRotation(state: VillageState): VillageState {
  if (state.sowingRotation) return state;
  try {
    return { ...convertToRotation(state), sowingRotation: true };
  } catch (error) {
    // ves se načte a počítá dál; příznak s chybou si přečte aplikace a zapíše ji (`updateVillage`)
    const message = error instanceof Error ? error.message : String(error);
    return { ...state, sowingRotation: true, sowingRotationFailed: message };
  }
}

/** Díl uložený s pevným sledem ozim → jař → úhor (25. 10. – 10. 11. 2026): co na něm mělo růst. */
type SequencedPart = FieldPart & { next?: 'spring' | 'winter' };

/**
 * Převod na přílohovou soustavu (fields.md – Přílohová soustava do roku 1100, Starší vsi – návrh
 * Clauda): díl uložený s pevným sledem (`next` – po ozimu jař, po jaři ozim) se osévá dál, má-li
 * aspoň `FERTILITY.sowableMin`, a plodinu dostane podle prvního okna jako každý díl v osevu; díl
 * na řadě s menší úrodností jde ode dneška (`lastDay`) do přílohu. Zasetý díl jen ztratí `next`.
 * Jednou, idempotentně – ves bez `next` se nemění. Vstupní stav nemění.
 */
export function withoutRotationNext(state: VillageState): VillageState {
  if (!state.parts.some((p: SequencedPart) => p.next !== undefined)) return state;
  const parts = state.parts.map((p: SequencedPart) => {
    if (p.next === undefined) return p;
    const part: SequencedPart = { ...p };
    delete part.next;
    if (part.state === 'ready' && !isSowableFertility(part)) {
      part.state = 'fallow';
      part.fallowSinceDay = state.lastDay;
      part.sownYears = 0;
      part.bonusUntilDay = null;
    }
    return part;
  });
  return { ...state, parts };
}
