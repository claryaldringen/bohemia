import type { Landscape } from '../landscape';
import { villageCemeteries } from './cemetery';
import { villageHerds } from './livestock';
import { villagePens } from './oxen';
import { cellCorners, dwellingFootprint } from './placement';
import { polygonsOverlap, type Point } from './polygon';
import { ABANDONMENT } from './rules';
import { sacredBuildingPlots, sacredFootprint } from './sacred';
import type {
  AbandonedStructure,
  ChronicleEvent,
  Pen,
  SacredBuildingKind,
  SacredRuin,
  StructureWear,
  VillageState,
} from './types';

// Opuštěné stavby chátrají (docs/design/abandonment.md – Martin 18. 10. 2026: „Jo ty stavby, kam
// nikdo nechodí, budou postupně chátrat a rozpadnou se“). Opuštěná je stavba, ke které podle
// roční sítě cest (roads.md – 1. 11., stejný výpočet jako pevné cesty) za celý uplynulý rok
// nevedla žádná cesta – provoz ke stavbě dává síť pěšin (`PathNetwork.visits`). Opuštěná stavba
// ztrácí stav rovnoměrně a za ABANDONMENT.fallYears let od plného stavu spadne; když se k ní lidé
// znovu začnou chodit, chátrání se zastaví (stav se nezvedá – jako u obydlí). Modla a svatyně
// dávají štěstí, dokud stojí; padlá modla leží jako zbytek, ze svatyně zbude zarostlý příkop.
// U hřbitova se rozpadne jen plot (hroby zůstávají, pohřbívá se dál), ohrada se rozpadne a zmizí.
// Bez krajiny (kalibrace, testy) síť cest není a nic se neopouští.

const DAYS_PER_YEAR = 365.25;
/** Ohrada, do které se vrátila zvířata, má stav aspoň tolik – se zvířaty nespadne. */
const MIN_STOCKED_CONDITION = 0.01;

/** Klíč stavby v provozu roční sítě (`PathNetwork.visits` – network.ts). */
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
 * Ohrady se zvířaty (abandonment.md – ohrada se zvířaty opuštěná není): spřežení, telata ve
 * výcviku, nebo krávy, které v ní přes zimu stojí – krávy stáda rovným dílem do hotových ohrad
 * jako ve scéně (oxen.md – přes zimu stojí v ohradě).
 */
export function stockedPenIds(state: Pick<VillageState, 'pens' | 'livestock'>): Set<number> {
  const pens = villagePens(state);
  const stocked = new Set<number>();
  const built = pens.filter((p) => p.builtDay !== null);
  const cows = Math.round(villageHerds(state).cow);
  built.forEach((pen, index) => {
    const share = Math.floor(cows / built.length) + (index < cows % built.length ? 1 : 0);
    if (pen.team !== null || pen.training !== null || share > 0) stocked.add(pen.id);
  });
  return stocked;
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
 * Roční kontrola opuštěných staveb (1. 11. – volá simulace s provozem roční sítě cest; mutuje
 * stav): stavba, ke které za rok nevedla žádná cesta (`visits` – network.ts), začne chátrat,
 * navštěvovaná přestane. Stavba dokončená za poslední rok (ABANDONMENT.graceDays) opuštěná není
 * – lidé k ní chodili stavět; ohrada se zvířaty taky ne.
 */
export function abandonmentCheck(
  state: VillageState,
  day: number,
  visits: ReadonlyMap<string, number>,
): void {
  const fresh = (builtDay: number | null): boolean =>
    builtDay !== null && day - builtDay < ABANDONMENT.graceDays;
  const visited = (key: string): boolean => (visits.get(key) ?? 0) > 0;
  for (const b of state.sacredBuildings ?? []) {
    const on = visited(visitKey(b.kind, b.id)) || fresh(b.builtDay);
    setWear(b, 'wear', nextWear(b.wear, b.kind, day, on));
  }
  for (const c of villageCemeteries(state)) {
    if (c.builtDay === null) continue;
    const on = visited(visitKey('cemetery', c.id)) || fresh(c.builtDay);
    setWear(c, 'fenceWear', nextWear(c.fenceWear, 'cemetery-fence', day, on));
  }
  const stocked = stockedPenIds(state);
  for (const p of villagePens(state)) {
    if (p.builtDay === null) continue;
    const on = stocked.has(p.id) || visited(visitKey('pen', p.id)) || fresh(p.builtDay);
    setWear(p, 'wear', nextWear(p.wear, 'pen', day, on));
  }
}

/**
 * Krok dne (mutuje stav – volá simulace na konci dne): opuštěná stavba, jejíž stav dnes došel na
 * nulu, spadne – modla a svatyně zmizí a zůstane po nich zbytek (`sacredRuins`), plot hřbitova
 * se rozpadne (hřbitov zůstává), ohrada zmizí. Ohrada, do které se mezitím vrátila zvířata,
 * chátrat přestane hned. Zbytky padlých model a svatyní po ABANDONMENT.remnantYears zmizí,
 * stejně jako zbytky pod stavbou. Vrátí události kroniky.
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
        // nespadne – zůstane aspoň na MIN_STOCKED_CONDITION)
        p.wear = {
          condition: Math.max(MIN_STOCKED_CONDITION, structureCondition(p.wear, 'pen', day)),
        };
        continue;
      }
      if (structureCondition(p.wear, 'pen', day) <= 0) gone.push(p);
    }
    if (gone.length > 0) {
      state.pens = pens.filter((p) => !gone.includes(p));
      if (state.pens.length === 0) delete state.pens;
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
 * Zbytky, přes které nestojí ani se nestaví jiná stavba (obydlí, modla, svatyně; s krajinou
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
  const near = (shape: Point[]): boolean => {
    const b = boundsOf(shape);
    return boxes.some(
      (r) => b.minX < r.maxX && b.maxX > r.minX && b.minZ < r.maxZ && b.maxZ > r.minZ,
    );
  };
  const shapes: Point[][] = [
    ...state.dwellings.map((d) => dwellingFootprint(d.type, d.position)),
    ...state.constructions.flatMap((c) =>
      c.position !== null && c.dwellingType !== null
        ? [dwellingFootprint(c.dwellingType, c.position)]
        : [],
    ),
    ...sacredBuildingPlots(state).map((b) => sacredFootprint(b.kind, b.position)),
  ];
  if (landscape) {
    const cells = [
      ...state.parts.flatMap((p) => (p.cell ? [p.cell] : [])),
      ...villageCemeteries(state).flatMap((c) => c.squares.map((s) => s.cell)),
      ...(state.orchards ?? []).flatMap((o) => o.squares.map((s) => s.cell)),
      ...villagePens(state).map((p) => p.cell),
      ...state.dwellings.flatMap((d) => (d.plot ? [d.plot.cell] : [])),
      ...state.constructions.flatMap((c) => (c.plot ? [c.plot.cell] : [])),
    ];
    for (const cell of cells) shapes.push(cellCorners(landscape, cell));
  }
  const close = shapes.filter(near);
  return ruins.filter((_, k) => !close.some((shape) => polygonsOverlap(shape, footprints[k]!)));
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
