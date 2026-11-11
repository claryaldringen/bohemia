import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../../landscape';
import { fieldPartLooks } from '../field-progress';
import { sowingOrder } from '../fields';
import {
  fieldHoldings,
  sowingBlocks,
  villageHoldings,
  workOrder,
  type FieldHoldings,
  type HoldingHouse,
} from '../holdings';
import { advanceVillage } from '../simulate';

import type { Dwelling, FieldPart, Person, TileCell, VillageState } from '../types';
import { nearestFirst, seasonCrops, seasonCrop } from '../year-plan';

// Hospodaření podle polohy domů (fields.md; Martin, 18. 10. 2026): díl patří k nejbližšímu domu,
// hospodářství se dělí na úseky od domu, ves osévá po celých úsecích a práce jde v úseku od domu
// ven.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const key = (c: TileCell): string => `${c.x},${c.y}`;
const HALF = (LANDSCAPE_SIZE * CELL_SIZE_M) / 2;
const center = (c: TileCell): { x: number; z: number } => ({
  x: -HALF + (c.x + 0.5) * CELL_SIZE_M,
  z: -HALF + (c.y + 0.5) * CELL_SIZE_M,
});
const house = (id: number, cell: TileCell): HoldingHouse => ({ id, position: center(cell) });

function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 225,
    distanceM: 100,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'ready',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 1,
    foundingDone: 1,
    surface: 'meadow',
    ...over,
  };
}

/** Čtverce v okruhu (Čebyševova vzdálenost) kolem políčka, bez něj. */
function square(c: TileCell, reach: number): TileCell[] {
  const cells: TileCell[] = [];
  for (let y = c.y - reach; y <= c.y + reach; y++) {
    for (let x = c.x - reach; x <= c.x + reach; x++) {
      if (x !== c.x || y !== c.y) cells.push({ x, y });
    }
  }
  return cells;
}

const cellsOf = (h: FieldHoldings, sector: number, parts: Map<number, TileCell>): TileCell[] =>
  h.sectors[sector]!.partIds.map((id) => parts.get(id)!);

/** Úsek je souvislý (8-sousedství). */
function connected(cells: readonly TileCell[]): boolean {
  const left = new Set(cells.map(key));
  const stack = [cells[0]!];
  left.delete(key(cells[0]!));
  while (stack.length > 0) {
    const c = stack.pop()!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (left.delete(key(n))) stack.push(n);
      }
    }
  }
  return left.size === 0;
}

describe('hospodářství – díl k nejbližšímu domu', () => {
  it('nejbližší dům vzdušnou čarou, při shodě menší id; díl bez políčka bez hospodářství', () => {
    const houses = [house(2, { x: 50, y: 50 }), house(1, { x: 60, y: 50 })];
    const parts = [
      { id: 10, cell: { x: 52, y: 50 } },
      { id: 11, cell: { x: 58, y: 51 } },
      { id: 12, cell: { x: 55, y: 50 } }, // stejně daleko od obou
      { id: 13, distanceM: 40 }, // staré pole z obrysu
    ];
    const h = fieldHoldings(houses, parts);
    const holding = (id: number): number | null => h.sectors[h.byPart.get(id)!.sector]!.dwellingId;
    expect(h.active).toBe(true);
    expect(holding(10)).toBe(2);
    expect(holding(11)).toBe(1);
    expect(holding(12)).toBe(1);
    expect(holding(13)).toBeNull();
    expect(h.byPart.get(10)!.distanceM).toBeCloseTo(2 * CELL_SIZE_M, 9);
  });

  it('ves bez domů nebo bez políček hospodářství nemá – platí dřívější pořadí', () => {
    const parts = [
      part(1, { distanceM: 300 }),
      part(2, { distanceM: 120, state: 'fallow', fallowSinceDay: 10 }),
      part(3, { distanceM: 200 }),
    ];
    const none = fieldHoldings([house(1, { x: 5, y: 5 })], parts);
    expect(none.active).toBe(false);
    expect(sowingBlocks(parts, none)).toEqual(sowingOrder(parts).map((p) => [p]));
    expect(workOrder(none)).toBe(nearestFirst);
    expect(fieldHoldings([], [{ id: 1, cell: { x: 1, y: 1 } }]).active).toBe(false);
  });
});

describe('úseky od domu', () => {
  it('dům uprostřed pole: úseky jako výseče, každý začíná u domu a je souvislý', () => {
    const home = { x: 60, y: 60 };
    const cells = square(home, 8);
    const byId = new Map(cells.map((c, i) => [i + 1, c]));
    const h = fieldHoldings(
      [house(1, home)],
      cells.map((cell, i) => ({ id: i + 1, cell })),
    );
    expect(h.sectors).toHaveLength(8);
    const sizes = h.sectors.map((s) => s.partIds.length);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeLessThan(1.6);
    for (const sector of h.sectors) {
      // první díl v prvním prstenci u domu, díly od domu ven
      expect(sector.distances[0]!).toBeLessThan(1.5 * CELL_SIZE_M);
      expect(sector.distances).toEqual([...sector.distances].sort((a, b) => a - b));
      expect(connected(cellsOf(h, sector.index, byId))).toBe(true);
    }
  });

  it('dům na kraji pole: souběžné pásy (lány) od domu dozadu', () => {
    const home = { x: 60, y: 60 };
    const cells: TileCell[] = [];
    for (let y = 61; y <= 80; y++) for (let x = 59; x <= 61; x++) cells.push({ x, y });
    const byId = new Map(cells.map((c, i) => [i + 1, c]));
    const h = fieldHoldings(
      [house(1, home)],
      cells.map((cell, i) => ({ id: i + 1, cell })),
    );
    expect(h.sectors).toHaveLength(3);
    for (const sector of h.sectors) {
      const columns = new Set(cellsOf(h, sector.index, byId).map((c) => c.x));
      expect(columns.size).toBe(1);
      expect(sector.partIds).toHaveLength(20);
    }
  });

  it('domy v řadě: každý má pás za sebou, úseky nepřeskočí k sousedovi', () => {
    const houses = [house(1, { x: 50, y: 60 }), house(2, { x: 55, y: 60 })];
    const cells: TileCell[] = [];
    for (let y = 61; y <= 75; y++) for (let x = 48; x <= 57; x++) cells.push({ x, y });
    const byId = new Map(cells.map((c, i) => [i + 1, c]));
    const h = fieldHoldings(
      houses,
      cells.map((cell, i) => ({ id: i + 1, cell })),
    );
    for (const sector of h.sectors) {
      const xs = cellsOf(h, sector.index, byId).map((c) => c.x);
      const own = sector.dwellingId === 1 ? [48, 52] : [53, 57];
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(own[0]!);
      expect(Math.max(...xs)).toBeLessThanOrEqual(own[1]!);
      expect(connected(cellsOf(h, sector.index, byId))).toBe(true);
    }
  });
});

describe('osev po úsecích', () => {
  it('blok úseku od domu ven; rozběhnutý úsek ves dokončí, příloh před blokem ho odsune', () => {
    const home = { x: 60, y: 60 };
    const cells: TileCell[] = [];
    for (let y = 61; y <= 70; y++) for (let x = 59; x <= 61; x++) cells.push({ x, y });
    const parts = cells.map((cell, i) => part(i + 1, { cell }));
    const h = fieldHoldings([house(1, home)], parts);
    const lane = (x: number): FieldPart[] =>
      h.sectors
        .find((s) => s.partIds.every((id) => parts[id - 1]!.cell!.x === x))!
        .partIds.map((id) => parts[id - 1]!);
    // pás x = 59: osévaná polovina u domu, za ní příloh ≥ 95 % – ves ho dokončí přednostně
    lane(59).forEach((p, i) =>
      Object.assign(p, i < 5 ? { state: 'sown', sownYears: 1, fertilityShare: 0.88 } : {}),
    );
    lane(59)
      .slice(5)
      .forEach((p) => Object.assign(p, { state: 'fallow', fallowSinceDay: 0 }));
    // pás x = 60: celý příloh ≥ 95 %; pás x = 61: vyčerpaná polovina u domu, za ní příloh ≥ 95 %
    lane(60).forEach((p) => Object.assign(p, { state: 'fallow', fallowSinceDay: 0 }));
    lane(61).forEach((p, i) =>
      Object.assign(p, { state: 'fallow', fallowSinceDay: 0, fertilityShare: i < 5 ? 0.6 : 1 }),
    );
    const blocks = sowingBlocks(parts, h);
    const ids = (b: FieldPart[]): number[] => b.map((p) => p.id);
    expect(blocks.map(ids)).toEqual([
      ids(lane(59).slice(0, 5)), // osévané díly
      ids(lane(59).slice(5)), // rozběhnutý úsek dokončit
      ids(lane(60)), // celý úsek od domu
      ids(lane(61).slice(5)), // až nakonec – před ním leží vyčerpaný příloh
    ]);
  });

  it('osev se dělí mezi hospodářství podle velikosti', () => {
    const houses = [house(1, { x: 40, y: 40 }), house(2, { x: 80, y: 40 })];
    const big = square({ x: 40, y: 40 }, 6).map((cell, i) => part(i + 1, { cell }));
    const small = square({ x: 80, y: 40 }, 3).map((cell, i) => part(1000 + i, { cell }));
    const parts = [...big, ...small];
    const h = fieldHoldings(houses, parts);
    const blocks = sowingBlocks(parts, h);
    // prvních pár bloků střídá obě hospodářství, ne jen to s bližšími úseky
    const firstHoldings = blocks.slice(0, 4).map((b) => (b[0]!.id >= 1000 ? 2 : 1));
    expect(new Set(firstHoldings).size).toBe(2);
  });
});

// --- ves s hospodářstvími v simulaci ------------------------------------------------------

const START = at(600, 8, 20);
const AGES = [25.5, 25.5];

/** Dva domy na pozemcích, pole kolem nich (díly připravené), dva dospělí v každém domě. */
function village(cells = true): { state: VillageState; cellOf: Map<number, TileCell> } {
  const homes = [
    { x: 50, y: 50 },
    { x: 62, y: 53 },
  ];
  const dwellings: Dwelling[] = homes.map((cell, i) => ({
    id: i + 1,
    type: 'polozemnice',
    builtDay: START - 1,
    condition: 1,
    position: { ...center(cell), rotation: 0 },
    plot: { cell, variant: 'center' },
    forestDistanceM: 50,
  }));
  const taken = new Set(homes.map(key));
  const field = homes
    .flatMap((h) => square(h, 7))
    .filter((c, i, all) => !taken.has(key(c)) && all.findIndex((d) => key(d) === key(c)) === i);
  const cellOf = new Map<number, TileCell>();
  const parts = field.map((cell, i) => {
    const c = center(cell);
    const distanceM = Math.min(
      ...dwellings.map((d) => Math.hypot(d.position.x - c.x, d.position.z - c.z)),
    );
    cellOf.set(100 + i, cell);
    return part(100 + i, { distanceM, ...(cells ? { cell } : {}) });
  });
  const state: VillageState = {
    seed: 7,
    foundedDay: START - 1,
    lastDay: START - 1,
    nextId: 1000,
    people: [],
    dwellings,
    fields: [{ id: 1 }],
    parts,
    constructions: [],
    season: null,
    threshingSeason: null,
    storesKg: 1500,
    hungry: false,
    commonLaborHistory: [],
    chronicle: [],
    clearedObstacles: [],
    felledTrees: [],
    woodLogs: 100,
    plotsMigrated: true,
  };
  return { state, cellOf };
}

/** Lidé v pevném složení – ves neroste ani nestárne (jako sondy kalibrace). */
function pin(state: VillageState, day: number): void {
  let id = 1_000_000;
  state.people = state.dwellings.flatMap((d) =>
    AGES.map((age): Person => ({
      id: id++,
      bornDay: day - Math.ceil(age * 365.25),
      dwellingId: d.id,
    })),
  );
}

/**
 * Ves po `years` letech (každý rok 2. 9., den po začátku hospodářského roku), vrací stavy po
 * 1. 9. Zásoby obilí se jako lidé drží na výchozí hodnotě a ves jí jen obilí (bez změřeného podílu
 * jídla z pole) – obě porovnávané vsi tak mají rok co rok stejné podmínky; test měří pořadí osevu,
 * ne kolik se oseje.
 */
/**
 * Hráč staví – stavba bere všechnu práci, která zbude po polní práci (ta má přednost – fields.md,
 * Osevní postup po dílech, bod 3). Mutuje ves.
 */
function building<T extends { state: VillageState }>(v: T): T {
  v.state.constructions.push({
    id: 900,
    kind: 'dwelling',
    startedDay: START - 1,
    cost: 1e9,
    done: 0,
    dwellingType: 'zemnice',
    position: null,
    dwellingId: null,
    fieldId: null,
  });
  return v;
}

/**
 * Stav vsi `years` let po sobě – 2. 9. (začátek hospodářského roku), s `cultivated` 31. 8. (konec
 * roku: osety jsou díly, které ves opravdu obdělala – fields.md, Postup práce po dílech).
 */
function seasons(start: VillageState, years: number, cultivated = false): VillageState[] {
  let state = structuredClone(start);
  const out: VillageState[] = [];
  for (let year = 0; year < years; year++) {
    const planDay = cultivated ? at(601 + year, 8, 31) : at(600 + year, 9, 2);
    while (state.lastDay < planDay) {
      pin(state, state.lastDay + 1);
      state.storesKg = start.storesKg;
      delete state.fieldFood;
      state = advanceVillage(state, Math.min(planDay, state.lastDay + 28), null);
    }
    out.push(state);
  }
  return out;
}

/** Podíl osetých dílů, ke kterým se od domu dojde po vlastním úseku bez přecházení přílohu. */
function reachableShare(state: VillageState, holdings: FieldHoldings): number {
  const byId = new Map(state.parts.map((p) => [p.id, p]));
  let sown = 0;
  let reachable = 0;
  for (const sector of holdings.sectors) {
    let open = true;
    for (const id of sector.partIds) {
      const p = byId.get(id)!;
      if (p.state === 'fallow') open = false;
      if (p.state !== 'sown') continue;
      sown++;
      if (open) reachable++;
    }
  }
  return reachable / Math.max(1, sown);
}

describe('ves hospodaří podle domů', () => {
  it('za 20 let osévá souvislé úseky od domu – méně roztříštěné než dřív', () => {
    // hráč staví – stavby dostanou jen práci, která zbude po polní práci
    const now = building(village(true));
    const before = building(village(false));
    const after = seasons(now.state, 20, true).slice(5);
    const old = seasons(before.state, 20, true).slice(5);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    // počet osetých ostrůvků se už neporovnává: ves bez stropu oseje všechny díly na řadě (fields.md
    // – Osevní postup po dílech, bod 3, 9. 11. 2026), s úseky i bez nich je oseté skoro celé pole
    // dosažitelnost po úsecích měřená na stejných úsecích (staré díly dostanou políčka zpět)
    const withCells = (s: VillageState): VillageState => ({
      ...s,
      parts: s.parts.map((p) => ({ ...p, cell: before.cellOf.get(p.id)! })),
    });
    const reachNow = mean(after.map((s) => reachableShare(s, villageHoldings(s))));
    const reachOld = mean(
      old.map((s) => reachableShare(withCells(s), villageHoldings(withCells(s)))),
    );
    // ves seje všechny díly na řadě (fields.md – Osevní postup po dílech) – víc dílů i dál od domu;
    // postup dílu (osevy do 70 %, pak příloh – fields.md, Přílohová soustava do roku 1100) nechá
    // blíž domu úhor (pastvinu), přes který se k osetým dílům dál chodí. Měří se obdělané díly
    // 31. 8. (25. 10. 2026: 0,146 proti 0,083 bez úseků; 0,49 v Úloze 3 měřilo 2. 9. přibrané
    // díly včetně neobdělaných, dřív se osévalo třikrát v řadě – 0,7). Ověření na Vlkově (plán
    // osevního postupu, Úloha 9 – fields.md, Naměřeno): 30. 8. po letech 0,00–0,79, průměr 0,48
    // (dosavadní kód 0,61) – po dvou osevech u domu tam díly u domu odpočívají a osévají se
    // vzdálenější, takže skutečná ves práh nezpřísní; práh hlídá tuto ves těsně pod naměřenou
    // hodnotou (0,12 → 0,14, rozdíl proti úsekům 0,04 → 0,05)
    expect(reachNow).toBeGreaterThan(0.14);
    expect(reachNow).toBeGreaterThan(reachOld + 0.05);
    // osévá se pořád podobně – úseky jídlo neberou
    const sownParts = (xs: VillageState[]): number =>
      mean(xs.map((s) => s.parts.filter((p) => p.state === 'sown').length));
    expect(sownParts(after)).toBeGreaterThan(0.9 * sownParts(old));
  }, 120_000);

  it('práce jde po úsecích, v úseku od domu ven – kopání ozimu je předpona pořadí', () => {
    // hráč staví – polní práce má přednost, stavby ozim nezvětší ani nezmenší
    const [end] = seasons(building(village()).state, 1, true);
    // díly přibývají po dávkách na čele práce (fields.md – Postup práce po dílech) – každá dávka
    // dne jde po úsecích, v úseku od domu ven
    let planned = end!;
    const batches: number[][] = [];
    for (let day = at(601, 9, 1); day <= at(601, 9, 3); day++) {
      const before = new Map(
        (planned.season ? seasonCrops(planned.season) : []).map((c) => [c.crop, c.work.partIds]),
      );
      pin(planned, day);
      planned = advanceVillage(planned, day, null);
      for (const { crop, work } of seasonCrops(planned.season!)) {
        const had = new Set(before.get(crop) ?? []);
        const batch = work.partIds.filter((id) => !had.has(id));
        if (batch.length > 0) batches.push(batch);
      }
    }
    expect(batches.length).toBeGreaterThan(0);
    const holdings = villageHoldings(planned);
    for (const batch of batches) {
      const sectors = batch.map((id) => holdings.byPart.get(id)!.sector);
      // úseky za sebou bez přerušení
      const seen = new Set<number>();
      sectors.forEach((s, i) => {
        if (i > 0 && sectors[i - 1] !== s) expect(seen.has(s)).toBe(false);
        seen.add(s);
      });
      // v úseku od domu ven
      batch.forEach((id, i) => {
        if (i === 0 || sectors[i - 1] !== sectors[i]) return;
        const prev = holdings.byPart.get(batch[i - 1]!)!.distanceM;
        expect(holdings.byPart.get(id)!.distanceM).toBeGreaterThanOrEqual(prev);
      });
    }
    // 30. 9.: zkopané díly ozimu jsou začátek pořadí, zbytek čeká (dřív 20. 9. – s levnějším setím,
    // rozsévač za spřežením 9. 11. 2026, ves loni osela víc dílů a v září déle mlátí: kopání
    // ozimu začne až po 20. 9.)
    let state = planned!;
    pin(state, state.lastDay + 1);
    state = advanceVillage(state, at(601, 9, 30), null);
    const winter = seasonCrop(state.season!, 'winter')!;
    const looks = fieldPartLooks(state, state.lastDay);
    const untouched = ['stubble', 'pasture', 'bare'];
    const done = winter.partIds.map((id) => !untouched.includes(looks.get(id)!.look));
    // díly přibývají den po dni – ves bez staveb už může mít zkopané všechny
    const firstUndone = done.indexOf(false);
    expect(done[0]).toBe(true);
    if (firstUndone >= 0) expect(done.slice(firstUndone + 1).every((d) => !d)).toBe(true);
  }, 30_000);

  it('po kouscích dá stejný stav jako jedním voláním', () => {
    const { state } = village();
    pin(state, START);
    const end = at(603, 10, 1);
    const whole = advanceVillage(state, end, null);
    let chunked = state;
    const steps = [1, 17, 90, 3, 200, 45];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(
        chunked,
        Math.min(end, chunked.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(chunked).toEqual(whole);
  }, 30_000);
});

describe('paměť hospodářství podle obsahu', () => {
  it('kopie stavu (dopočet po kouscích) dá z paměti totéž, změněný díl nový výpočet', () => {
    const { state } = village();
    const first = villageHoldings(state);
    const copy = structuredClone(state);
    // kopie stavu na začátku dopočtu (`cloneState`) – jiné pole dílů, stejný obsah
    const again = villageHoldings(copy);
    expect(again).toBe(first);
    expect(again).toEqual(fieldHoldings(holdingsHousesOf(copy), copy.parts));
    // díl jinde = jiný obsah – počítá se znovu a výsledek odpovídá novým dílům
    const moved = structuredClone(state);
    const far = moved.parts.find((p) => p.cell)!;
    far.cell = { x: far.cell!.x + 30, y: far.cell!.y };
    const recomputed = villageHoldings(moved);
    expect(recomputed).not.toBe(first);
    expect(recomputed).toEqual(fieldHoldings(holdingsHousesOf(moved), moved.parts));
  });
});

function holdingsHousesOf(state: VillageState): HoldingHouse[] {
  return state.dwellings.map((d) => ({ id: d.id, position: d.position }));
}
