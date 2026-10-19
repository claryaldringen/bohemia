// VÝVOJOVÝ NÁSTROJ – hospodaření podle polohy domů na /dev/landscape (fields.md – Hospodaření
// podle polohy domů): obrysy úseků hospodářství, ukázkové vsi (řadová ves s lány, samoty uprostřed
// polností) a vzorec polí po letech skutečné simulace herního jádra s domácnostmi v pevném složení
// (jako sondy kalibrace). Pravidla jsou jen v jádru (holdings.ts) – tady se jen volají.
import {
  advanceVillage,
  dayIndexOf,
  fieldHoldings,
  fieldPartLooks,
  partStage,
  plotHousePosition,
  surfaceAt,
  tileCenterWorld,
  type Dwelling,
  type FieldPart,
  type Landscape,
  type PartStage,
  type Person,
  type TileCell,
  type VillageState,
} from '@bohemia/game';
import type { HoldingsOverlaySector } from '@/lib/scene/holdings-overlay';
import type { SceneDwelling } from '@/lib/scene/village-types';
import { scenePlot, type FieldLook } from '@/lib/village-view';

/** Ukázková uspořádání vsi. */
export const HOLDINGS_DEMOS = ['row', 'farms'] as const;
export type HoldingsDemo = (typeof HOLDINGS_DEMOS)[number];
export const HOLDINGS_DEMO_NAMES: Record<HoldingsDemo, string> = {
  row: 'řadová ves',
  farms: 'samoty',
};

/** Simulovaný vzhled dílu – stadium a vzhled z herního jádra. */
export interface SimulatedPart {
  stage: PartStage;
  look?: FieldLook;
  work?: number;
  before?: FieldLook;
}

const key = (c: TileCell): string => `${c.x},${c.y}`;
/** Ukázka začíná těsně před plánem osevu (1. 9.) a ukáže polovinu června po `years` letech. */
const START = dayIndexOf({ year: 600, month: 8, day: 20 });
const SHOW = { month: 6, day: 15 } as const;
/** Domácnost v pevném složení: dva dospělí (věk v letech). */
const AGES = [25.5, 25.5];
const DAYS_PER_YEAR = 365.25;
const STEP_DAYS = 28;

/**
 * Ukázková ves u místa vsi: polozemnice na pozemcích a čtverce pole (bez vody a pozemků). Řadová
 * ves – tři domy v řadě po pěti čtvercích a pole za nimi na obě strany; samoty – tři domy daleko
 * od sebe, každý uprostřed polnosti.
 */
export function holdingsDemo(
  l: Landscape,
  demo: HoldingsDemo,
  nextId: () => number,
): { dwellings: SceneDwelling[]; cells: TileCell[] } {
  const { x: sx, y: sy } = l.villageSite;
  const homes =
    demo === 'row'
      ? [-5, 0, 5].map((dx) => ({ x: sx + dx, y: sy }))
      : [
          { x: sx - 14, y: sy - 4 },
          { x: sx + 1, y: sy + 2 },
          { x: sx - 6, y: sy + 13 },
        ];
  const taken = new Set(homes.map(key));
  const cells: TileCell[] = [];
  const inside = (c: TileCell): boolean =>
    c.x >= 0 && c.y >= 0 && c.x < l.size && c.y < l.size && surfaceAt(l, c.x, c.y) !== 'water';
  if (demo === 'row') {
    for (let y = sy - 24; y <= sy + 24; y++) {
      if (y === sy) continue; // náves s domy
      for (let x = sx - 7; x <= sx + 7; x++) cells.push({ x, y });
    }
  } else {
    for (let y = sy - 25; y <= sy + 30; y++) {
      for (let x = sx - 30; x <= sx + 20; x++) {
        if (homes.some((h) => Math.hypot(h.x - x, h.y - y) <= 8.8)) cells.push({ x, y });
      }
    }
  }
  const dwellings = homes.map((cell): SceneDwelling => {
    const plot = { cell, variant: 'center' as const };
    return {
      id: nextId(),
      type: 'polozemnice',
      position: plotHousePosition(l, plot),
      built: true,
      progress: 1,
      plot: scenePlot(l, plot),
    };
  });
  return { dwellings, cells: cells.filter((c) => inside(c) && !taken.has(key(c))) };
}

/** Hotová obydlí vývojové vsi jako domy hospodářství. */
function houses(
  dwellings: readonly SceneDwelling[],
): { id: number; position: { x: number; z: number } }[] {
  return dwellings.filter((d) => d.built).map((d) => ({ id: d.id, position: d.position }));
}

/**
 * Obrysy úseků hospodářství: barva podle domu (odstín), sousední úseky světlejší a tmavší.
 */
export function holdingsOverlay(
  l: Landscape,
  dwellings: readonly SceneDwelling[],
  cells: readonly TileCell[],
): HoldingsOverlaySector[] {
  const parts = cells.map((cell, i) => ({ id: i + 1, cell }));
  const holdings = fieldHoldings(houses(dwellings), parts);
  const homes = [...new Set(holdings.sectors.map((s) => s.dwellingId))];
  return holdings.sectors.map((sector) => {
    const hue = (homes.indexOf(sector.dwellingId) * 137.5) % 360;
    const light = sector.lane % 2 === 0 ? 0.62 : 0.42;
    return {
      cells: sector.partIds.map((id) => {
        const cell = parts[id - 1]!.cell;
        const c = tileCenterWorld(l, cell.x, cell.y);
        return { cell, x: c.x, z: c.z, size: l.cellSizeM };
      }),
      color: hsl(hue, 0.85, light),
    };
  });
}

/** Barva z odstínu (°), sytosti a světlosti (0–1) jako RGB 0–1. */
function hsl(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/** Lidé v pevném složení – v každém hotovém obydlí dva dospělí. */
function pin(state: VillageState, day: number): void {
  let id = 1_000_000;
  state.people = state.dwellings.flatMap((d) =>
    AGES.map((age): Person => ({
      id: id++,
      bornDay: day - Math.ceil(age * DAYS_PER_YEAR),
      dwellingId: d.id,
    })),
  );
}

/**
 * Vzorec polí po `years` letech skutečné simulace (15. 6.): vývojová ves se všemi čtverci pole
 * připravenými (založenými), v každém hotovém obydlí dva dospělí. Čtverec → stadium a vzhled.
 */
export function simulateHoldings(
  l: Landscape,
  dwellings: readonly SceneDwelling[],
  cells: readonly TileCell[],
  years: number,
): Map<string, SimulatedPart> {
  const built: Dwelling[] = dwellings
    .filter((d) => d.built)
    .map((d) => ({
      id: d.id,
      type: d.type,
      builtDay: START - 1,
      condition: 1,
      position: d.position,
      ...(d.plot ? { plot: { cell: d.plot.cell, variant: d.plot.variant } } : {}),
      forestDistanceM: 50,
    }));
  const result = new Map<string, SimulatedPart>();
  if (built.length === 0 || cells.length === 0) return result;
  const parts = cells.map((cell, i): FieldPart => {
    const c = tileCenterWorld(l, cell.x, cell.y);
    const distanceM = Math.min(
      ...built.map((d) => Math.hypot(d.position.x - c.x, d.position.z - c.z)),
    );
    return {
      id: 100_000 + i,
      fieldId: 1,
      areaM2: l.cellSizeM * l.cellSizeM,
      distanceM,
      naturalFertility: l.fertility[cell.y * l.size + cell.x]!,
      fertilityShare: 1,
      bonusUntilDay: null,
      state: 'ready',
      sownYears: 0,
      fallowSinceDay: null,
      foundingCost: 1,
      foundingDone: 1,
      surface: 'meadow',
      cell,
    };
  });
  let state: VillageState = {
    seed: 42,
    foundedDay: START - 1,
    lastDay: START - 1,
    nextId: 1,
    people: [],
    dwellings: built,
    fields: [{ id: 1 }],
    parts,
    constructions: [],
    plan: null,
    threshingFromPlan: null,
    storesKg: 500 * built.length,
    hungry: false,
    commonLaborHistory: [],
    chronicle: [],
    clearedObstacles: [],
    felledTrees: [],
    woodLogs: 100,
    plotsMigrated: true,
  };
  const end = dayIndexOf({ year: 600 + years, ...SHOW });
  while (state.lastDay < end) {
    pin(state, state.lastDay + 1);
    state = advanceVillage(state, Math.min(end, state.lastDay + STEP_DAYS), null);
  }
  const looks = fieldPartLooks(state, end);
  for (const part of state.parts) {
    const view = looks.get(part.id);
    result.set(key(part.cell!), {
      stage: partStage(part, end),
      ...(view ? { look: view.look } : {}),
      ...(view?.work !== undefined ? { work: view.work } : {}),
      ...(view?.before ? { before: view.before } : {}),
    });
  }
  return result;
}

/** Den v roce, který ukázka ukazuje (pro roční období scény). */
export const HOLDINGS_SHOW_DAY =
  dayIndexOf({ year: 600, ...SHOW }) - dayIndexOf({ year: 600, month: 1, day: 1 }) + 1;
