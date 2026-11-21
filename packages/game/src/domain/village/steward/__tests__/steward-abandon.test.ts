import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  SURFACE_CODES,
  tileCenterWorld,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { applyBuildIntent } from '../../buildings/build-intent';
import { NO_CRAFTS } from '../../core/productivity';
import { STEWARD } from '../../rules/rules-steward';
import { advanceVillage } from '../../core/simulate';
import { minFieldCells, type StewardContext } from '../steward';
import { abandonStep, fieldSwap, swapCount } from '../steward-abandon';
import { fieldCellValue, fieldCells } from '../steward-land';
import { stewardOutlook, type StewardOutlook } from '../steward-outlook';
import { farmCells, planSettlement } from '../steward-plan';
import { isStewardBuilt, markStewardBuilt, newSteward } from '../steward-state';
import type { VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Výměna dílů pole správcem (steward.md – Přestavba vlastních staveb, Pole; Martin 8. 11. 2026:
// „Já měl za to, že správce pole opouští, když jsou na hovno, ne když má málo lidí“): jednou za
// rok v září opustí své díly, které vycházejí o přirážku hůř než volné místo plánu, a tam založí
// nové pole – akcí hráče, jen s prací na založení. Kvůli nedostatku lidí neopouští nic.

const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
const cells = fieldCells(landscape, obstacles);
const size = landscape.size;
const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
/** První den správce v září. */
const SEPT = Math.ceil(at(600, 9, 1) / STEWARD.everyDays) * STEWARD.everyDays;
/** Políček dalekého pole – víc než nejmenší pole. */
const FAR = minFieldCells(landscape) + 1;

const cellOf = (tile: number): { x: number; y: number } => ({
  x: tile % size,
  y: Math.floor(tile / size),
});

/** Ves u sídla krajiny se stojící zemnicí, hotovým plánem a volnou prací `free` člověkodnů denně. */
function plannedVillage(free = 20): VillageState {
  const site = landscape.villageSite;
  const c = tileCenterWorld(landscape, site.x, site.y);
  const founded = foundVillage({
    seed: 4242,
    day: SEPT,
    dwellingPosition: { x: c.x, z: c.z, rotation: 0 },
  });
  let s = withBuiltFirstDwelling({ ...founded, steward: newSteward(SEPT, true) });
  for (let k = 0; k < 10 && s.steward?.plan?.stage !== 'done'; k++) {
    s = planSettlement(s, s.lastDay, landscape, obstacles);
  }
  if (s.steward?.plan?.stage !== 'done') throw new Error('plán nedoběhl');
  s.commonLaborHistory = Array.from({ length: 30 }, () => free);
  return s;
}

/** Hotové pole ze čtverců `tiles` (záměr stavby pole jako hráč); `steward` – založil ho správce. */
function withField(s: VillageState, tiles: readonly number[], steward: boolean): VillageState {
  const result = applyBuildIntent({ ...s, lastDay: SEPT }, SEPT, landscape, obstacles, {
    kind: 'field',
    cells: tiles.map(cellOf),
  });
  if (!result.ok) throw new Error(result.reason);
  const next = { ...result.state, lastDay: s.lastDay };
  next.constructions = next.constructions.filter((c) => c.id < s.nextId);
  for (const p of next.parts) {
    if (p.id < s.nextId) continue;
    p.state = 'ready';
    p.foundingDone = p.foundingCost;
    if (steward) markStewardBuilt(next, p.id);
  }
  return next;
}

/** Řada `FAR` políček louky s úrodou mimo plán 740–795 m od domu, kam jde pole založit. */
function farRow(s: VillageState): number[] {
  const home = s.dwellings[0]!.position;
  const plan = new Set(s.steward!.plan!.farms.flatMap((f) => farmCells(f, size)));
  const ok = (t: number): boolean => {
    const c = tileCenterWorld(landscape, t % size, Math.floor(t / size));
    const d = Math.hypot(c.x - home.x, c.z - home.z);
    return (
      d > 740 &&
      d < 795 &&
      !plan.has(t) &&
      landscape.surface[t] === SURFACE_CODES.meadow &&
      fieldCellValue(cells, t, 0) > 0
    );
  };
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x + FAR < size - 1; x++) {
      const row = Array.from({ length: FAR }, (_, i) => y * size + x + i);
      if (!row.every(ok)) continue;
      const built = applyBuildIntent({ ...s, lastDay: SEPT }, SEPT, landscape, obstacles, {
        kind: 'field',
        cells: row.map(cellOf),
      });
      if (built.ok) return row;
    }
  }
  throw new Error('žádná řada pro daleké pole');
}

/** Výhled vsi bez úzkého hrdla, nebo s trvalým nedostatkem lidí (`lackOfPeople`). */
function outlookOf(lackOfPeople: boolean): StewardOutlook {
  return {
    laborHa: lackOfPeople ? 0.01 : Infinity,
    workableHa: lackOfPeople ? 0.01 : Infinity,
    sowHa: lackOfPeople ? 0.01 : Infinity,
    harvestHa: Infinity,
    threshHa: Infinity,
    seedHa: Infinity,
    landHa: lackOfPeople ? 1 : 0,
    bottleneck: lackOfPeople ? 'labor' : 'land',
    lasting: lackOfPeople ? 'labor' : 'land',
    workPerHa: 0,
    landPeople: 0,
    sustainablePeople: 0,
  };
}

function ctxOf(day: number, lackOfPeople = false): StewardContext {
  return {
    day,
    date: dateOfDayIndex(day),
    landscape,
    obstacles,
    coverage: NO_CRAFTS,
    mode: 'growth',
    outlook: outlookOf(lackOfPeople),
  };
}

const base = plannedVillage();
const far = farRow(base);
/** Ves se špatným (dalekým) polem správce. */
const badVillage = withField(base, far, true);
const badParts = badVillage.parts.filter((p) => p.id >= base.nextId).map((p) => p.id);
/** Ves s polem správce na bloku, který by plán založil první – nejlepší místo u domu. */
const goodVillage = withField(base, fieldSwap(badVillage, ctxOf(SEPT))!.block.cells, true);

/** Den správce `ctx` nad kopií vsi `s` – zda se ves změnila. */
function changes(s: VillageState, ctx: StewardContext): boolean {
  const copy = structuredClone(s);
  abandonStep(copy, ctx);
  return JSON.stringify(copy) !== JSON.stringify(s);
}

describe('výměna dílů – kolik', () => {
  it('k-tý nejhorší díl musí vycházet o přirážku hůř než průměr nového pole', () => {
    const m = 1 + STEWARD.rebuildMargin;
    const block = [12, 12, 12, 12, 12];
    // díl přesně o přirážku horší nestačí
    expect(swapCount([12 / m], block, 5)).toBe(0);
    expect(swapCount([9.9], block, 5)).toBe(1);
    // nejvíc k: třetí díl (10,5) už o přirážku hůř nevychází
    expect(swapCount([5, 9, 10.5], block, 5)).toBe(2);
    // nové pole má aspoň nejmenší plochu – průměr prvních pěti čtverců i pro jeden díl
    expect(swapCount([10], [20, 20, 1, 1, 1, 50], 5)).toBe(0);
    expect(swapCount([10, 11, 12, 13, 14, 15], [20, 20, 20, 20, 20, 1], 5)).toBe(5);
  });
});

describe('výměna dílů – kdy a které', () => {
  it('špatný díl a lepší volné místo: opustí ho a na tom místě založí nové pole akcí hráče', () => {
    const s = structuredClone(badVillage);
    const swap = fieldSwap(s, ctxOf(SEPT))!;
    expect([...swap.parts].sort((a, b) => a - b)).toEqual(badParts);
    expect(swap.block.cells).toHaveLength(Math.max(minFieldCells(landscape), badParts.length));
    const nextId = s.nextId;
    abandonStep(s, ctxOf(SEPT));
    const abandoned = s.parts.filter((p) => p.abandoned);
    expect(abandoned.map((p) => p.id).sort((a, b) => a - b)).toEqual(badParts);
    // připravený díl jde hned do přílohu (stejně jako akce hráče), jeden řádek kroniky
    expect(abandoned.every((p) => p.state === 'fallow')).toBe(true);
    expect(s.chronicle.at(-1)).toEqual({ day: SEPT, kind: 'parts-abandoned', parts: FAR });
    // nové pole – stavba správce na čtvercích bloku, blíž domu, než ležely opuštěné díly
    const founding = s.parts.filter((p) => p.id >= nextId);
    const tiles = founding.map((p) => p.cell!.y * size + p.cell!.x);
    expect(tiles.sort((a, b) => a - b)).toEqual([...swap.block.cells].sort((a, b) => a - b));
    expect(founding.every((p) => p.state === 'founding' && isStewardBuilt(s, p.id))).toBe(true);
    const nearest = Math.min(...abandoned.map((p) => p.distanceM));
    expect(Math.max(...founding.map((p) => p.distanceM))).toBeLessThan(nearest);
  });

  it('bez lepšího místa nic – pole na nejlepším místě plánu i plán bez volného místa', () => {
    expect(fieldSwap(goodVillage, ctxOf(SEPT))).toBeNull();
    expect(changes(goodVillage, ctxOf(SEPT))).toBe(false);
    const full = structuredClone(badVillage);
    full.steward!.plan!.farms = full.steward!.plan!.farms.map((f) => ({ ...f, runs: [] }));
    expect(changes(full, ctxOf(SEPT))).toBe(false);
  });

  it('bez práce na založení nic (rozpočet práce jako u nového pole), v Nouzi také', () => {
    const idle = structuredClone(badVillage);
    idle.commonLaborHistory = idle.commonLaborHistory.map(() => 0);
    expect(changes(idle, ctxOf(SEPT))).toBe(false);
    expect(changes(badVillage, { ...ctxOf(SEPT), mode: 'emergency' })).toBe(false);
  });

  it('díl založený hráčem nikdy', () => {
    expect(changes(withField(base, far, false), ctxOf(SEPT))).toBe(false);
  });

  it('nedostatek lidí sám o sobě nic – dobré díly zůstanou', () => {
    expect(changes(goodVillage, ctxOf(SEPT, true))).toBe(false);
  });

  it('jen první den správce v září', () => {
    expect(changes(badVillage, ctxOf(SEPT + STEWARD.everyDays))).toBe(false);
    expect(changes(badVillage, ctxOf(at(601, 6, 10)))).toBe(false);
  });

  it('po kouscích stejně jako vcelku – výměna proběhne', { timeout: 120_000 }, () => {
    const start = structuredClone(badVillage);
    const to = SEPT + 40;
    const whole = advanceVillage(start, to, obstacles, landscape);
    let chunked = start;
    while (chunked.lastDay < to) {
      chunked = advanceVillage(chunked, Math.min(to, chunked.lastDay + 7), obstacles, landscape);
    }
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
    const parts = whole.parts.filter((p) => badParts.includes(p.id));
    expect(parts.every((p) => p.abandoned)).toBe(true);
  });
});

describe('výhled bez opuštěných dílů', () => {
  it('opuštěný zarostlý díl nezvedne práci na vrácení přílohu ani pole v oběhu', () => {
    const s = withField(base, far, false);
    for (const p of s.parts) {
      if (!badParts.includes(p.id)) continue;
      p.state = 'fallow';
      p.fallowSinceDay = SEPT - 365;
    }
    const before = stewardOutlook(s, SEPT, NO_CRAFTS);
    const withAbandoned = structuredClone(s);
    const old = withAbandoned.parts.find((p) => p.id === badParts.at(-1))!;
    old.abandoned = true;
    old.fallowSinceDay = SEPT - 30 * 365;
    old.distanceM = 40;
    delete old.walkDistanceM;
    const kept = structuredClone(withAbandoned);
    kept.parts = kept.parts.filter((p) => p.id !== old.id);
    const outlook = stewardOutlook(withAbandoned, SEPT, NO_CRAFTS);
    expect(outlook.workPerHa).toBeCloseTo(stewardOutlook(kept, SEPT, NO_CRAFTS).workPerHa, 9);
    expect(outlook.landHa).toBeLessThan(before.landHa);
  });
});
