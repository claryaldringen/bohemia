// Dílny zlata (plán 6, issue #13; gold.md – Pravidla 2, 4, 5): rýžovník, šperkař a mincíř.
import { dateOfDayIndex } from '../../calendar';
import { length2, type Landscape } from '../../landscape';
import { goldPlacers } from '../core/premium-effects';
import { distanceFactor } from '../fields/fields';
import { villageRoadWalk, type Walk } from '../paths/walking';
import { GOLD, JEWELLER, MINT, PANNING } from '../rules/rules-gold';
import { addGood } from '../trade/trade';
import { jewelleryMaterialG } from '../trade/jewellery';
import type { Craft, Workshop, WorkshopActivity } from '../types/types-crafts';
import type { Dwelling, VillageState } from '../types';
import type { WorkshopLabor } from './crafts';

/** Zbytek náplavu pod touto mezí (g) je jen šum desetinných čísel – dobere se týž den. */
const DUST_G = 1e-9;

/** Dílny zlata – správce je nestaví a nepočítá s nimi (Rozhodnutí plánu 6, bod 10). */
export const GOLD_CRAFTS: readonly Craft[] = ['panner', 'jeweller', 'minter'];

/** Rýžovník nejde postavit na krajině bez zlatonosného náplavu (gold.md – Pravidla 1). */
export const PANNER_NO_PLACER = 'Bez zlatonosného náplavu';
/** Všechny náplavy krajiny jsou vyrýžované (gold.md – Pravidla 3). */
export const PANNER_PLACERS_EMPTY = 'Náplavy jsou vyrýžované';
/** Mincovna až od 1. 1. `MINT.fromYear` (gold.md – Pravidla 5). */
export const MINT_YEAR = `Od roku ${MINT.fromYear}`;

/** Zbývá na náplavu `index` (g) – `PANNING.placerG` − `goldPanned[index]`, nejméně 0. */
export function placerLeftG(state: Pick<VillageState, 'goldPanned'>, index: number): number {
  return Math.max(0, PANNING.placerG - (state.goldPanned?.[index] ?? 0));
}

/** Důvod, proč dílnu nejde postavit (gold.md – Pravidla 1 a 3), jinak null; ostatní řemesla null. */
export function workshopBlocked(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  craft: Craft,
): string | null {
  if (craft === 'panner') {
    const placers = goldPlacers(landscape);
    if (placers.length === 0) return PANNER_NO_PLACER;
    return placers.every((_, index) => placerLeftG(state, index) <= 0)
      ? PANNER_PLACERS_EMPTY
      : null;
  }
  if (craft === 'minter') return dateOfDayIndex(day).year >= MINT.fromYear ? null : MINT_YEAR;
  return null;
}

// --- rýžování (gold.md – Pravidla 1 a 2) -------------------------------------------------------

/** Rýžuje se v měsících `PANNING.months` (teče voda bez ledu – duben až říjen). */
export function inPanningSeason(day: number): boolean {
  const { month } = dateOfDayIndex(day);
  return month >= PANNING.months.from && month <= PANNING.months.to;
}

/** První den sezóny rýžování (1. 4.) – `Workshop.placer: null` se zahodí a hledá se znovu. */
function panningSeasonStart(day: number): boolean {
  const date = dateOfDayIndex(day);
  return date.month === PANNING.months.from && date.day === 1;
}

/**
 * Chůze rýžovníka k náplavům po pevných cestách vsi s půdou krajiny (`villageRoadWalk`); graf cest
 * se staví až při výběru náplavu. Bez krajiny undefined – vzdušně.
 */
export function pannerWalk(state: VillageState, landscape: Landscape | null): Walk | undefined {
  return landscape
    ? (from, targets) => villageRoadWalk(state, landscape)(from, targets)
    : undefined;
}

/**
 * Nejbližší náplav se zlatem (`placerLeftG` > 0), ke kterému se z dílny dojde: chůze `walk`
 * (bez ní vzdušně) na cm, jen konečná – přes potok bez brodu je `Infinity` a ta by se v JSON
 * uložila jako `null` (dopočet po kouscích by se rozešel s dopočtem vcelku). Při shodě nižší
 * index; žádný – null.
 */
export function choosePlacer(
  state: VillageState,
  dwelling: Dwelling,
  placers: readonly { x: number; z: number }[],
  walk?: Walk,
): { index: number; walkM: number } | null {
  const open = placers.flatMap((p, index) => (placerLeftG(state, index) > 0 ? [{ p, index }] : []));
  if (open.length === 0) return null;
  const from = dwelling.position;
  const lengths = walk
    ? walk(
        from,
        open.map((o) => o.p),
      )
    : open.map((o) => length2(o.p.x - from.x, o.p.z - from.z));
  let best: { index: number; walkM: number } | null = null;
  for (let k = 0; k < open.length; k++) {
    const walkM = Math.round(lengths[k]! * 100) / 100;
    if (Number.isFinite(walkM) && (best === null || walkM < best.walkM)) {
      best = { index: open[k]!.index, walkM };
    }
  }
  return best;
}

/**
 * Náplav rýžovníka `dwelling` na den `day` (mutuje jen `Workshop.placer`): uložený, pokud je mezi
 * `placers` a má zlato; `null` platí do 1. 4., pak se hledá znovu; chybí-li (nebo náplav dobral
 * jiný rýžovník), vybere ho `choosePlacer` a uloží. Null – žádný dosažitelný náplav se zlatem.
 */
export function pannerPlacer(
  state: VillageState,
  dwelling: Dwelling,
  day: number,
  placers: readonly { x: number; z: number }[],
  walk?: Walk,
): { index: number; walkM: number } | null {
  const workshop: Workshop = dwelling.workshop!;
  const kept = workshop.placer;
  if (kept === null && !panningSeasonStart(day)) return null;
  if (kept && kept.index < placers.length && placerLeftG(state, kept.index) > 0) return kept;
  workshop.placer = choosePlacer(state, dwelling, placers, walk);
  return workshop.placer;
}

/** Den rýžovníka: činnost, vyrýžované gramy, kde rýžoval a – vyčerpal-li náplav – kolik jich zbývá. */
export interface PannerOutput {
  activity: WorkshopActivity;
  pannedG: number;
  /** Náplav, kde dnes rýžoval (m) – scéna; nerýžoval – null. */
  site: { x: number; z: number } | null;
  /** Náplav se dnes vyčerpal – kolik náplavů krajiny ještě má zlato; jinak chybí. */
  exhaustedLeft?: number;
}

/**
 * Rýžovník rýžuje na náplavu (gold.md – Pravidla 1 a 2): muži domácnosti z práce dílny
 * (`labor.craft`) × praxe (`labor.skill`) × `PANNING.gPerManDay` ÷ přirážka za chůzi k náplavu
 * (`distanceFactor`), nejvýš co na náplavu zbývá – zbytek dne propadne a další den jde k dalšímu
 * (`Workshop.placer` se smaže). Zlato přibude do `VillageState.gold` a `goldPanned[index]`.
 * Mimo sezónu `resting`, bez náplavu `no-placer`. Náplav ze `Workshop.placer`; chybí-li (volání
 * bez `restingCrafters`), vybere ho týmž `choosePlacer`.
 */
export function workPanner(
  state: VillageState,
  dwelling: Dwelling,
  labor: Pick<WorkshopLabor, 'craft' | 'skill'>,
  day: number,
  placers: readonly { x: number; z: number }[],
  walk?: Walk,
): PannerOutput {
  if (!inPanningSeason(day)) return { activity: 'resting', pannedG: 0, site: null };
  const placer = pannerPlacer(state, dwelling, day, placers, walk);
  if (!placer) return { activity: 'no-placer', pannedG: 0, site: null };
  const left = placerLeftG(state, placer.index);
  const output = (labor.craft * labor.skill * PANNING.gPerManDay) / distanceFactor(placer.walkM);
  if (output <= 0) return { activity: 'producing', pannedG: 0, site: null };
  const pannedG = left - output <= DUST_G ? left : output;
  state.gold = (state.gold ?? 0) + pannedG;
  const panned = (state.goldPanned ??= []);
  while (panned.length <= placer.index) panned.push(0);
  panned[placer.index] = panned[placer.index]! + pannedG;
  const site = placers[placer.index]!;
  if (placerLeftG(state, placer.index) > 0) return { activity: 'producing', pannedG, site };
  // náplav je vyrýžovaný a neobnovuje se – další den rýžovník jde k dalšímu
  delete dwelling.workshop!.placer;
  const exhaustedLeft = placers.filter((_, index) => placerLeftG(state, index) > 0).length;
  return { activity: 'producing', pannedG, site, exhaustedLeft };
}

// --- šperkař a mincovna (gold.md – Pravidla 4 a 5) ---------------------------------------------

/** Zbytek pod touto mezí je jen šum desetinných čísel – zlato `n − ε` se ještě razí jako `n`. */
const EPSILON = 1e-9;

/**
 * Šperkař zpracovává kov vsi (gold.md – Pravidla 4): práce dílny × praxe × `JEWELLER.gPerManDay`,
 * nejvýš co do kovu vsi (`jewelleryMaterialG`) ještě chybí. Zlato ani mince se nemění – roste
 * jen `jewelleryG`. Bez kovu `no-gold`, kapacita na kovu `resting`.
 */
export function workJeweller(
  state: VillageState,
  labor: Pick<WorkshopLabor, 'craft' | 'skill'>,
): { activity: WorkshopActivity; wroughtG: number } {
  const material = jewelleryMaterialG(state);
  if (material <= 0) return { activity: 'no-gold', wroughtG: 0 };
  const stored = state.jewelleryG ?? 0;
  const room = material - stored;
  if (room <= EPSILON) return { activity: 'resting', wroughtG: 0 };
  const wroughtG = Math.min(labor.craft * labor.skill * JEWELLER.gPerManDay, room);
  if (wroughtG <= 0) return { activity: 'producing', wroughtG: 0 };
  state.jewelleryG = stored + wroughtG;
  return { activity: 'producing', wroughtG };
}

/**
 * Mincíř razí zlato na mince (gold.md – Pravidla 5): práce dílny × praxe × `MINT.gPerManDay`,
 * nejvýš celé gramy zlata ve vsi; gram zlata = `GOLD.coinGrams` na minci, jen celé mince. Zlato se
 * odečte a mince přičtou přes `addGood`, součet zlato + mince × `coinGrams` se nemění. Méně než
 * gram zlata – `no-gold`.
 */
export function workMinter(
  state: VillageState,
  labor: Pick<WorkshopLabor, 'craft' | 'skill'>,
  day: number,
): { activity: WorkshopActivity; mintedCoins: number } {
  const coins = Math.floor(
    Math.min((state.gold ?? 0) + EPSILON, labor.craft * labor.skill * MINT.gPerManDay) /
      GOLD.coinGrams,
  );
  if (!((state.gold ?? 0) + EPSILON >= GOLD.coinGrams))
    return { activity: 'no-gold', mintedCoins: 0 };
  if (coins <= 0) return { activity: 'producing', mintedCoins: 0 };
  addGood(state, 'gold', -coins * GOLD.coinGrams, day);
  addGood(state, 'coins', coins, day);
  return { activity: 'producing', mintedCoins: coins };
}
