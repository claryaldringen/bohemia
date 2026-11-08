import { dateOfDayIndex } from '../calendar';
import { tileCenterWorld } from '../landscape';
import { setPartsAbandoned } from './abandon-parts';
import { distanceFactor, isOvergrown, partWalkDistance } from './fields';
import { villageDwellingPositions } from './placement-village';
import { STEWARD } from './rules-steward';
import {
  laborBudget,
  minFieldCells,
  nextFieldBlock,
  startFieldBlock,
  type FieldBlock,
  type StewardContext,
} from './steward';
import { fieldCellValue, fieldCells, type FieldCells } from './steward-land';
import { isStewardBuilt } from './steward-state';
import type { VillageState } from './types';

// Výměna dílů pole správcem (steward.md – Přestavba vlastních staveb, Pole). Martin 8. 11. 2026:
// „Já měl za to, že správce pole opouští, když jsou na hovno, ne když má málo lidí.“ Opouští
// stejnou akcí jako hráč (`setPartsAbandoned`; Martin 8. 11. 2026: „A“). Návrh Clauda (Martin
// 8. 11. 2026: „ok“): jednou za rok, první den správce v září (po žních a novém osevním postupu
// 1. 9.), opustí díly, které sám založil a které vycházejí o `STEWARD.rebuildMargin` hůř než
// volné místo plánu i s cenou jeho založení, a na tom místě založí nové pole – jen když na ně ves
// má práci. Kvůli nedostatku lidí neopouští nic – pole bez lidí leží ladem samo.

/** Výměna: díly k opuštění (od nejhoršího) a blok nového pole z plánu, které je nahradí. */
export interface FieldSwap {
  parts: number[];
  block: FieldBlock;
}

/**
 * Hodnota založeného dílu na políčku `index` (kg čisté úrody na člověkoden za léta osevu):
 * `fieldCellValue` bez ceny založení – tu ves už zaplatila. Jinak by správce opouštěl díly
 * kvůli kamenům a pařezům, které už odklidil, a čerstvě založené pole by příští září zase měnil.
 */
function foundedValue(cells: FieldCells, index: number, distanceM: number): number {
  const kg = cells.kg[index]!;
  if (kg <= 0) return 0;
  return (kg * cells.kept[index]!) / (cells.work[index]! * distanceFactor(distanceM));
}

/**
 * Díly, které správce sám založil (`steward.built`) a smí opustit – s `cell`, ne zakládané,
 * opuštěné ani zarostlé – s hodnotou (`foundedValue` políčka dílu se vzdáleností chůze), od
 * nejhorší (při shodě nižší id).
 */
function ownParts(state: VillageState, ctx: StewardContext): { id: number; value: number }[] {
  const cells = fieldCells(ctx.landscape, ctx.obstacles);
  const size = ctx.landscape.size;
  return state.parts
    .filter(
      (p) =>
        p.cell !== undefined &&
        p.state !== 'founding' &&
        !p.abandoned &&
        !isOvergrown(p) &&
        isStewardBuilt(state, p.id),
    )
    .map((p) => ({
      id: p.id,
      value: foundedValue(cells, p.cell!.y * size + p.cell!.x, partWalkDistance(p)),
    }))
    .sort((a, b) => a.value - b.value || a.id - b.id);
}

/**
 * Hodnoty čtverců bloku v mapě hodnot (`fieldCellValue` – i s cenou založení) se vzdáleností od
 * nejbližšího obydlí i rozestavěného – tu dostane nový díl (`distanceM`); chůze po pěšinách je
 * nejvýš tolik.
 */
function blockValues(state: VillageState, ctx: StewardContext, block: FieldBlock): number[] {
  const { landscape } = ctx;
  const cells = fieldCells(landscape, ctx.obstacles);
  const homes = villageDwellingPositions(state);
  return block.cells.map((t) => {
    const c = tileCenterWorld(landscape, t % landscape.size, Math.floor(t / landscape.size));
    let d2 = Infinity;
    for (const h of homes) {
      const dx = h.x - c.x;
      const dz = h.z - c.z;
      d2 = Math.min(d2, dx * dx + dz * dz);
    }
    return fieldCellValue(cells, t, Math.sqrt(d2));
  });
}

/**
 * Kolik nejhorších dílů vyměnit: `worst` hodnoty dílů vzestupně, `values` hodnoty čtverců bloku
 * v pořadí bloku. Nejvíc k (nejvýš čtverců bloku), kdy k-tý nejhorší díl × (1 + `rebuildMargin`)
 * vychází hůř než průměr prvních max(`min`, k) čtverců – nové pole má aspoň nejmenší plochu.
 */
export function swapCount(
  worst: readonly number[],
  values: readonly number[],
  min: number,
): number {
  const sums = [0];
  for (const v of values) sums.push(sums[sums.length - 1]! + v);
  for (let k = Math.min(worst.length, values.length); k > 0; k--) {
    const n = Math.max(min, k);
    if (n > values.length) continue;
    if (worst[k - 1]! * (1 + STEWARD.rebuildMargin) < sums[n]! / n) return k;
  }
  return 0;
}

/**
 * Výměna dílů (stav nemění; `skip` – políčka bloku, která dnes neprošla kontrolou místa): v Nouzi
 * nic – výměna se splatí až za roky. Blok z plánu jako u nového pole (`nextFieldBlock`) na tolik
 * čtverců, kolik má správce vlastních dílů, v rozpočtu práce × `STEWARD.fieldSwapLaborShare`;
 * z něj `swapCount` nejhorších dílů a blok zkrácený na max(nejmenší pole, jejich počet) – začátek
 * bloku je souvislý. Null = není co vyměnit (žádný díl není o přirážku horší, místo ani práce).
 */
export function fieldSwap(
  state: VillageState,
  ctx: StewardContext,
  skip: ReadonlySet<number> = new Set(),
): FieldSwap | null {
  if (ctx.mode === 'emergency') return null;
  const own = ownParts(state, ctx);
  if (own.length === 0) return null;
  const budget = laborBudget(state).left * STEWARD.fieldSwapLaborShare;
  const block = nextFieldBlock(state, ctx, { cells: own.length }, budget, skip);
  if (!block) return null;
  const min = minFieldCells(ctx.landscape);
  const k = swapCount(
    own.map((p) => p.value),
    blockValues(state, ctx, block),
    min,
  );
  if (k === 0) return null;
  const cells = block.cells.slice(0, Math.max(min, k));
  const found = fieldCells(ctx.landscape, ctx.obstacles).found;
  return {
    parts: own.slice(0, k).map((p) => p.id),
    block: { ...block, cells, foundMd: cells.reduce((s, t) => s + found[t]!, 0) },
  };
}

/**
 * Krok dne správce (mutuje stav): první den správce v září založí pole z `fieldSwap` stejnou
 * cestou jako nové pole (`startFieldBlock` – záměr stavby pole) a teprve když začne, opustí díly
 * stejnou akcí jako hráč (`setPartsAbandoned` – jeden řádek kroniky).
 */
export function abandonStep(state: VillageState, ctx: StewardContext): void {
  if (ctx.date.month !== 9 || dateOfDayIndex(ctx.day - STEWARD.everyDays).month === 9) return;
  let parts: readonly number[] = [];
  const started = startFieldBlock(state, ctx, (skip) => {
    const swap = fieldSwap(state, ctx, skip);
    parts = swap?.parts ?? [];
    return swap?.block ?? null;
  });
  if (started === 'started' && parts.length > 0) setPartsAbandoned(state, ctx.day, parts, true);
}
