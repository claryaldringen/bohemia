// Cíle a provoz domácností: domácnosti, skupiny cest podle práce dne a zavedených míst.
// Součást výpočtu sítě pěšin – rozcestník je network.ts (komentář k celku tam).

import { length2 } from '../../landscape';
import { HUMNO, SACRED_BUILDINGS, SMITH_SUPPLY, WATER_FETCHING } from '../rules';
import { type DwellingType, type RoutePurpose } from '../types';
import {
  cemeteryEntrance,
  penGateToward,
  penSquaresEntrance,
  sacredEntrance,
  threshingFloorEntrance,
  type Entrance,
} from './entrances';
import { PATH_FOREST_EDGE, PATH_WATER_SPOT } from './terrain';
import {
  AFTERMATH_MONTHS,
  BASE_TRIPS,
  CEMETERY_VISITS_PER_PERSON,
  DAYS_PER_YEAR,
  DEFAULT_HOUSEHOLD,
  ENTRANCE_REACH_M,
  ENTRANCE_STEP_M,
  ERRAND_MAX_COST,
  ERRAND_NEAR_COST,
  GRAIN_PIT_REACH_M,
  MIN_TRIP,
  NEIGHBOURS,
  NEIGHBOUR_TRIPS,
  OAK_REACH_M,
  PASTURE,
  PATH_YEARS_UNKNOWN,
  type PathErrands,
  type PathNetworkInput,
  type PathPoint,
  type PathVillage,
  SMITH_SITE_REACH_M,
  TRIPS_PER_MAN_DAY,
  WATER_TRIPS_PER_PERSON,
  WINTER_MONTHS,
  WOOD_TRIPS,
  type Square,
} from './network-types';
import {
  laborByTarget,
  middleOf,
  pastureHerds,
  pathAgeFactor,
  penPathSquares,
} from './network-keys';
import {
  type Building,
  type Grid,
  cellX,
  cellZ,
  cellsAround,
  gateAround,
  gateOf,
  passableNear,
  squareCells,
} from './network-grid';

export interface Household {
  dwellingId: number;
  gate: number;
  /** Brána přesně (pěšina končí u ní, buňka `gate` je střed buňky). */
  gatePoint: PathPoint;
  /** Lidí v domácnosti (odhad). */
  size: number;
  /** Jak vyšlapaná jsou její spojení podle stáří obydlí (0–1). */
  age: number;
  /** Stáří obydlí v herních letech (PATH_YEARS_UNKNOWN, když ho obydlí nenese). */
  years: number;
  x: number;
  z: number;
}

/** Skupina cest do jednoho cíle: buňky cíle a kolik cest za den k němu vede z každé domácnosti. */
export interface TripGroup {
  /** Pochůzka pro vodu nebo dřevo – konec trasy si domácnost zapamatuje (postavy tam chodí). */
  errand?: keyof PathErrands;
  sources: number[];
  weights: number[];
  /** Stálá část `weights` po domácnostech (chůze na zavedené místo, ne práce dne). */
  baseWeights?: number[];
  /** Stáří spojení po domácnostech (roky) – bez údaje stáří domácnosti. */
  years?: number[];
  maxCost: number;
  /**
   * Pochůzka, kam se dál chodí méně často: do této ceny cesty naplno, dál úměrně méně (dřevo);
   * bez údaje vždy naplno (voda).
   */
  nearCost?: number;
  /**
   * Pochůzka: buňky míst (1 = sem se chodí) a po prvním kole, jak daleko smí hledání každé
   * domácnosti (cena) – další kola hledají každé domácnosti zvlášť od brány k nejbližšímu místu
   * podle cen se slevou, aby se trasy sousedů mohly slít.
   */
  marks?: Uint8Array;
  reach?: number[];
  /**
   * Pochůzka s `nearCost`: podíl cest, který domácnosti po prvním kole zbyl (`weights` = váha ×
   * podíl) – trasa si ho nese, aby se dala převážit bez hledání (`StoredRoute.scale`).
   */
  scale?: number[];
  /** Místo, ke kterému domácnost došla v prvním kole – směr pro A* dalších hledání. */
  goals?: number[];
  /** Stavba, jejíž provoz se počítá do `PathNetwork.visits` (`<druh>:<id>`). */
  visit?: string;
  /** Klíč cíle trasy (`StoredRoute.to` – jako klíč práce: `field:<id>`, `water`, `d:<id>`…). */
  to: string;
  purpose: RoutePurpose;
}

export function households(
  village: PathVillage,
  grid: Grid,
  buildings: Map<number, Building>,
): Household[] {
  const day = village.labor?.day ?? null;
  const homes = village.dwellings.filter((d) => d.built && d.inhabited !== false);
  // zakladatelé bydlí na staveništi první zemnice
  const settled = homes.length > 0 ? homes : village.dwellings;
  const people = village.labor
    ? village.labor.people.adults + village.labor.people.children + village.labor.people.elders
    : settled.length * DEFAULT_HOUSEHOLD;
  const weight = (type: DwellingType): number => (type === 'polozemnice' ? 1.5 : 1);
  const total = settled.reduce((s, d) => s + weight(d.type), 0);
  const out: Household[] = [];
  for (const d of settled) {
    const b = buildings.get(d.id);
    if (!b) continue;
    let gatePoint = gateOf(b);
    let gate = passableNear(grid, gatePoint.x, gatePoint.z, 2);
    if (gate < 0) {
      // brána padla do souseda (pozemek přední stranou k cizímu pozemku nebo domu) – domácnost
      // vyjde z nejbližšího volného místa těsně kolem svého obydlí
      gate = gateAround(grid, b, gatePoint);
      if (gate >= 0) gatePoint = { x: cellX(grid, gate), z: cellZ(grid, gate) };
    }
    if (gate < 0) continue;
    const years =
      d.since !== undefined && day !== null
        ? Math.max(0, (day - d.since) / DAYS_PER_YEAR)
        : PATH_YEARS_UNKNOWN;
    out.push({
      dwellingId: d.id,
      gate,
      gatePoint,
      size: total > 0 ? (people * weight(d.type)) / total : DEFAULT_HOUSEHOLD,
      age: pathAgeFactor(years),
      years: Math.min(PATH_YEARS_UNKNOWN, years),
      x: d.position.x,
      z: d.position.z,
    });
  }
  return out;
}

/** Cesty za den celé vsi rozdělené mezi domácnosti podle velikosti a stáří. */
function shareWeights(homes: readonly Household[], trips: number, targetAge = 1): number[] {
  const total = homes.reduce((s, h) => s + h.size, 0);
  return homes.map((h) => (total > 0 ? (trips * h.size * Math.min(h.age, targetAge)) / total : 0));
}

export function tripGroups(
  input: PathNetworkInput,
  grid: Grid,
  homes: readonly Household[],
  buildings: Map<number, Building>,
): TripGroup[] {
  const v = input.village;
  const groups: TripGroup[] = [];
  const labor = new Map(laborByTarget(v));
  const work = (key: string): number => (labor.get(key) ?? 0) * TRIPS_PER_MAN_DAY;

  const target = (
    to: string,
    purpose: RoutePurpose,
    sources: number[],
    trips: number,
    targetAge = 1,
    visit?: string,
    baseTrips = 0,
  ): void => {
    if (sources.length === 0 || trips <= 0) return;
    groups.push({
      to,
      purpose,
      sources,
      weights: shareWeights(homes, trips, targetAge),
      ...(baseTrips > 0 ? { baseWeights: shareWeights(homes, baseTrips, targetAge) } : {}),
      maxCost: groupReach(grid, sources, homes),
      ...(visit ? { visit } : {}),
    });
  };
  const squaresTarget = (squares: readonly Square[]): number[] => {
    const { inside, edge } = squareCells(grid, squares);
    return [...inside, ...edge].filter((c) => Number.isFinite(grid.base[c]!));
  };
  // vchod stavby (paths.md – Vchody): buňky kus před ním
  const entranceTarget = (e: Entrance): number[] =>
    cellsAround(
      grid,
      { x: e.x + e.outX * ENTRANCE_STEP_M, z: e.z + e.outZ * ENTRANCE_STEP_M },
      ENTRANCE_REACH_M,
    );

  // pole je pole od umístění – stálá část nezávisí na stadiu dílů (paths.md – Stálé trasy,
  // pravidlo 5: stadia mapu ani váhy tras nemění)
  for (const field of v.fields) {
    const to = `field:${field.id}`;
    const base = BASE_TRIPS.field;
    target(to, 'work', squaresTarget(field.parts), base + work(to), 1, undefined, base);
  }
  // sad: zavedené místo jen k nejbližšímu sadu, práce dne tam, kde se dnes pracuje
  const orchards = v.orchards ?? [];
  const nearestOrchard = nearestOfKind(
    homes,
    orchards.map((o) => o.squares),
  );
  orchards.forEach((orchard, k) => {
    const sources = squaresTarget(orchard.squares);
    if (sources.length === 0) return;
    const base = shareWeights(homes, BASE_TRIPS.orchard);
    const builders = shareWeights(homes, work(`orchard:${orchard.id}`));
    const weights = homes.map((_, i) => builders[i]! + (nearestOrchard[i] === k ? base[i]! : 0));
    if (weights.every((w) => w < MIN_TRIP)) return;
    groups.push({
      to: `orchard:${orchard.id}`,
      purpose: 'work',
      sources,
      weights,
      baseWeights: homes.map((_, i) => (nearestOrchard[i] === k ? base[i]! : 0)),
      maxCost: groupReach(grid, sources, homes),
    });
  });
  // hřbitov: návštěvy hrobů podle lidí v domácnosti (k nejbližšímu hřbitovu) brankou hotového
  // hřbitova (paths.md – Vchody), práce dne (založení, rozšíření – plot) u ohrazovaných čtverců
  const cemeteries = v.cemeteries ?? [];
  const nearestCemetery = nearestOfKind(
    homes,
    cemeteries.map((c) => c.squares),
  );
  cemeteries.forEach((cemetery, k) => {
    const squares = squaresTarget(cemetery.squares);
    if (squares.length === 0) return;
    const gate = cemetery.built === false ? null : cemeteryEntrance(cemetery, v.dwellings);
    const gateCells = gate ? entranceTarget(gate) : [];
    const visitors = homes.map((h, i) =>
      nearestCemetery[i] === k ? CEMETERY_VISITS_PER_PERSON * h.size * h.age : 0,
    );
    const builders = shareWeights(homes, work(`cemetery:${cemetery.id}`));
    const visit = `cemetery:${cemetery.id}`;
    const push = (purpose: RoutePurpose, sources: number[], weights: number[]): void => {
      if (sources.length === 0 || weights.every((w) => w <= 0)) return;
      const maxCost = groupReach(grid, sources, homes);
      groups.push({ to: visit, purpose, sources, weights, maxCost, visit });
    };
    if (gateCells.length > 0) {
      push('visit', gateCells, visitors);
      const pending = cemetery.squares.filter((q) => q.pending);
      push('work', pending.length > 0 ? squaresTarget(pending) : squares, builders);
    } else {
      push(
        'visit',
        squares,
        homes.map((_, i) => builders[i]! + visitors[i]!),
      );
    }
  });
  // vylepšení pevné cesty (roads.md) – nosí se k polovině úseku
  for (const road of v.roads ?? []) {
    if (road.id === undefined || road.points.length === 0) continue;
    const trips = work(`road:${road.id}`);
    if (trips > 0)
      target(`road:${road.id}`, 'work', cellsAround(grid, middleOf(road.points), 3), trips);
  }
  // stavba vozové cesty (roads.md – Vozová cesta) – k čelu práce na nové trase
  const wagons = new Set<number>();
  for (const share of v.labor?.shares ?? []) {
    const t = share.target;
    if (t.kind !== 'wagon' || wagons.has(t.id)) continue;
    wagons.add(t.id);
    const trips = work(`wagon:${t.id}`);
    if (trips > 0) target(`wagon:${t.id}`, 'work', cellsAround(grid, t, 3), trips);
  }
  // ohrada: krmení a napájení dobytka, stavba a rádlo (práce dne na ohradě); do ohrady bez
  // zvířat se krmit nechodí (abandonment.md)
  // hotová ohrada brankou (paths.md – Vchody), staveniště ze všech stran
  for (const pen of v.pens ?? []) {
    const base = pen.built ? (pen.stocked === false ? 0 : BASE_TRIPS.pen) : BASE_TRIPS.site;
    const squares = penPathSquares(pen);
    const sources = pen.built
      ? entranceTarget(penSquaresEntrance(squares, penGateToward(squares, v.dwellings)))
      : squaresTarget(squares);
    const to = `pen:${pen.id}`;
    target(
      to,
      'work',
      sources.length > 0 ? sources : squaresTarget(squares),
      base + work(to),
      1,
      to,
      base,
    );
  }
  // humno (production-chains.md – Humno): k hotovému vstupem na předku za výmlatem – nosí se na
  // něj snopy, odnáší zrno; staveniště ze všech stran
  for (const floor of v.threshingFloors ?? []) {
    if (floor.built) {
      const to = `threshing-floor:${floor.id}`;
      const trips = work(to);
      if (trips > 0)
        target(to, 'work', entranceTarget(threshingFloorEntrance(floor.position)), trips);
      continue;
    }
    target(
      `site:${floor.id}`,
      'work',
      cellsAround(grid, floor.position, HUMNO.sizeM.z / 2 + grid.cellM),
      BASE_TRIPS.site + work(`site:${floor.id}`),
      1,
      undefined,
      BASE_TRIPS.site,
    );
  }
  // obilné jámy (production-chains.md – Obilné jámy): k otevřené jámě pro zrno, k jámě, do které se
  // dnes ukládá zrno z humna, za prací dne (k zavřené jámě jen za prací)
  const pitsDone = new Set<number>();
  for (const pit of v.grainPits ?? []) {
    pitsDone.add(pit.id);
    const base = pit.open === false ? 0 : BASE_TRIPS.grainPit;
    target(
      `grain-pit:${pit.id}`,
      'work',
      cellsAround(grid, pit, GRAIN_PIT_REACH_M),
      base + work(`grain-pit:${pit.id}`),
      1,
      undefined,
      base,
    );
  }
  for (const share of v.labor?.shares ?? []) {
    const t = share.target;
    if (t.kind !== 'grain-pit' || pitsDone.has(t.id)) continue;
    pitsDone.add(t.id);
    const to = `grain-pit:${t.id}`;
    target(to, 'work', cellsAround(grid, t, GRAIN_PIT_REACH_M), work(to));
  }
  // stáda na pastvu – na úhor vsi (louka na seno až po seči; v roční síti obojí)
  const herds = pastureHerds(v.livestock);
  if (herds > 0) {
    const aftermath = input.annual || AFTERMATH_MONTHS.includes(v.labor?.month ?? 6);
    // jen díly, které stáda opravdu spásají (fields.md – Zarůstání – nejbližší příloh napřed)
    const pasture = v.fields.flatMap((f) =>
      f.parts.filter(
        (p) =>
          p.grazed !== false && (p.stage === 'young-fallow' || (aftermath && p.stage === 'meadow')),
      ),
    );
    if (pasture.length > 0) {
      target('pasture', 'herd', squaresTarget(pasture), herds * PASTURE.tripsPerHerd);
    }
  }
  // staveniště nových obydlí – nosí se k jejich čelu
  for (const d of v.dwellings) {
    const b = buildings.get(d.id);
    if (!b) continue;
    if (!d.built) {
      const to = `site:${d.id}`;
      target(
        to,
        'work',
        cellsAround(grid, gateOf(b), 2.5),
        BASE_TRIPS.site + work(to),
        1,
        undefined,
        BASE_TRIPS.site,
      );
    } else {
      const to = `dwelling:${d.id}`;
      const repair = work(to);
      if (repair > 0) target(to, 'work', cellsAround(grid, gateOf(b), 2.5), repair);
    }
  }
  // seč přirozených luk (oxen.md – Seno): k políčkům, kde se dnes seče, chodí sekáči
  if (v.hayMeadows && v.hayMeadows.length > 0) {
    const byCell = new Map(v.hayMeadows.map((m) => [`${m.cell.x},${m.cell.y}`, m]));
    for (const t of v.labor?.shares ?? []) {
      if (t.target.kind !== 'meadow') continue;
      const squares = t.target.cells.flatMap((c) => {
        const m = byCell.get(`${c.x},${c.y}`);
        return m ? [m] : [];
      });
      target('meadow', 'work', squaresTarget(squares), t.manDays * TRIPS_PER_MAN_DAY);
    }
  }
  for (const t of v.labor?.shares ?? []) {
    if (t.target.kind !== 'trees' || !input.tree) continue;
    const trees = t.target.ids.flatMap((id) => {
      const p = input.tree?.(id);
      return p ? [p] : [];
    });
    const sources = trees.flatMap((p) => cellsAround(grid, p, 2.5));
    target(`trees:${t.target.ids.join('.')}`, 'work', sources, t.manDays * TRIPS_PER_MAN_DAY);
  }
  // posvátná místa: každá domácnost chodí jen k nejbližšímu místu každého druhu (posvátný dub,
  // háj, modla, svatyně – Martin); rozestavěná modla a svatyně jsou staveniště (práce dne)
  const visit = (
    places: readonly { to: string; sources: number[]; at: readonly PathPoint[]; visit?: string }[],
  ): void => {
    if (places.length === 0) return;
    const nearest = nearestOfKind(
      homes,
      places.map((p) => p.at),
    );
    const weights = shareWeights(homes, BASE_TRIPS.sacred);
    places.forEach((place, k) => {
      const own = weights.map((w, i) => (nearest[i] === k ? w : 0));
      if (place.sources.length === 0 || own.every((w) => w < MIN_TRIP)) return;
      groups.push({
        to: place.to,
        purpose: 'visit',
        sources: place.sources,
        weights: own,
        maxCost: groupReach(grid, place.sources, homes),
        ...(place.visit ? { visit: place.visit } : {}),
      });
    });
  };
  visit(
    (v.sacred?.oaks ?? []).map((oak) => ({
      to: `oak:${oak.id}`,
      sources: cellsAround(grid, oak, OAK_REACH_M),
      at: [oak],
    })),
  );
  visit(
    (v.sacred?.groves ?? []).map((grove) => ({
      to: `grove:${grove.id}`,
      sources: squaresTarget(grove.squares),
      at: grove.squares,
    })),
  );
  // hotová modla a svatyně – vstupem na předku (paths.md – Vchody), staveniště ze všech stran
  const sacredBuildings = v.sacred?.buildings ?? [];
  const sacredEntranceCells = (b: (typeof sacredBuildings)[number]): number[] => {
    const cells = entranceTarget(sacredEntrance(b));
    const half = SACRED_BUILDINGS[b.kind].footprintM / 2;
    return cells.length > 0 ? cells : cellsAround(grid, b.position, half + grid.cellM);
  };
  for (const kind of ['idol', 'shrine'] as const) {
    visit(
      sacredBuildings
        .filter((b) => b.built && b.kind === kind)
        .map((b) => ({
          to: `${b.kind}:${b.id}`,
          sources: sacredEntranceCells(b),
          at: [b.position],
          visit: `${b.kind}:${b.id}`,
        })),
    );
  }
  for (const b of sacredBuildings) {
    const half = SACRED_BUILDINGS[b.kind].footprintM / 2;
    if (b.built) {
      // oprava hotové modly a svatyně (abandonment.md – Oprava) – práce dne u stavby, i to je
      // provoz ke stavbě
      const repair = work(`sacred:${b.id}`);
      if (repair > 0) {
        target(`sacred:${b.id}`, 'work', sacredEntranceCells(b), repair, 1, `${b.kind}:${b.id}`);
      }
      continue;
    }
    target(
      `site:${b.id}`,
      'work',
      cellsAround(grid, b.position, half + grid.cellM),
      BASE_TRIPS.site + work(`site:${b.id}`),
      1,
      undefined,
      BASE_TRIPS.site,
    );
  }
  // kovář (crafts.md – Uhlí a ruda kováře): z kovárny na rudiště kopat a pro rudu, k milíři pro
  // uhlí – jen jeho domácnost; hrnčíř stejně na hliniště (crafts.md – Hlína hrnčíře); nošení
  // v koších po cestách tam a zpět (cest za den podle délky), kopání jedna cesta na člověkoden;
  // s vozem jede řemeslník vozem (bez pěšiny). Uhlíř chodí k milíři ze zemnice (crafts.md – Milíř
  // u skácených buků) – jedna cesta na člověkoden u milíře.
  const smithWalks = new Map<string, { to: string; home: number; at: PathPoint; trips: number }>();
  for (const share of v.labor?.shares ?? []) {
    const t = share.target;
    if (share.carts || (t.kind !== 'ore' && t.kind !== 'clay' && t.kind !== 'kiln')) continue;
    const from = t.kind === 'kiln' ? (t.from ?? t.id) : t.id;
    // roční součet práce činnost nezná – pro uhlí od milíře se jen nosí, na rudišti hlavně kope
    const carrying =
      share.activity === 'fetch' ||
      (share.activity === undefined && t.kind === 'kiln' && t.from !== undefined);
    const home = homes.findIndex((h) => h.dwellingId === from);
    if (home < 0) continue;
    const h = homes[home]!;
    const tripS =
      (2 * length2(t.x - h.x, t.z - h.z)) / SMITH_SUPPLY.carryMps + SMITH_SUPPLY.basketLoadS;
    const trips = carrying
      ? (share.manDays * WATER_FETCHING.dayHours * 3600) / tripS
      : share.manDays * TRIPS_PER_MAN_DAY;
    const key = `${from}:${t.x},${t.z}`;
    const same = smithWalks.get(key);
    if (same) same.trips += trips;
    else smithWalks.set(key, { to: `${t.kind}:${t.id}`, home, at: { x: t.x, z: t.z }, trips });
  }
  for (const { to, home, at, trips } of smithWalks.values()) {
    const sources = cellsAround(grid, at, SMITH_SITE_REACH_M);
    if (sources.length === 0 || trips <= 0) continue;
    groups.push({
      to,
      purpose: 'work',
      sources,
      weights: homes.map((_, i) => (i === home ? trips : 0)),
      maxCost: groupReach(grid, sources, homes),
    });
  }
  // sousedé – každá domácnost se dvěma nejbližšími (dvojice jednou)
  const pairs = new Set<string>();
  homes.forEach((h, a) => {
    const near = homes
      .map((o, b) => ({ b, d: length2(o.x - h.x, o.z - h.z) }))
      .filter((n) => n.b !== a)
      .sort((p, q) => p.d - q.d || p.b - q.b)
      .slice(0, NEIGHBOURS);
    for (const { b } of near) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      const weights = homes.map((_, k) =>
        k === b ? NEIGHBOUR_TRIPS * Math.min(h.age, homes[b]!.age) : 0,
      );
      const years = homes.map(() => Math.min(h.years, homes[b]!.years));
      groups.push({
        to: `d:${h.dwellingId}`,
        purpose: 'neighbour',
        sources: [h.gate],
        weights,
        years,
        maxCost: groupReach(grid, [h.gate], homes),
      });
    }
  });
  return groups;
}

/**
 * Pochůzky pro vodu (suchý břeh u potoka) a pro dřevo (okraj lesa) – mimo stavby vsi, každá
 * domácnost k nejbližšímu místu. Cest za den: voda podle lidí v domácnosti – vždy, k nejbližší vodě
 * v okně bez ohledu na vzdálenost a naplno (paths.md – Pochůzky pro vodu; Martin, 19. 10. 2026:
 * „Ale vesničané tam přece musí chodit nějak pro vodu a musí jim to zabírat čas.“), dřevo na
 * domácnost (v zimní půlce roku víc) nejvýš ERRAND_MAX_COST, dál méně často. Hledá se od všech
 * míst najednou k branám.
 */
export function errandGroups(
  annual: boolean,
  village: PathVillage,
  grid: Grid,
  homes: readonly Household[],
): TripGroup[] {
  const all = grid.width * grid.height;
  const water: number[] = [];
  const wood: number[] = [];
  for (let c = 0; c < all; c++) {
    if (grid.village[c] || grid.base[c] === Infinity) continue;
    const f = grid.flags[c]!;
    if (f & PATH_WATER_SPOT) water.push(c);
    if (f & PATH_FOREST_EDGE) wood.push(c);
  }
  const winter = WINTER_MONTHS.includes(village.labor?.month ?? 6);
  const woodTrips = annual
    ? (WOOD_TRIPS.winter * WINTER_MONTHS.length + WOOD_TRIPS.summer * (12 - WINTER_MONTHS.length)) /
      12
    : winter
      ? WOOD_TRIPS.winter
      : WOOD_TRIPS.summer;
  const groups: TripGroup[] = [];
  const marksOf = (cells: readonly number[]): Uint8Array => {
    const marks = new Uint8Array(all);
    for (const c of cells) marks[c] = 1;
    return marks;
  };
  if (water.length > 0) {
    groups.push({
      to: 'water',
      purpose: 'water',
      errand: 'water',
      marks: marksOf(water),
      sources: water,
      weights: homes.map((h) => WATER_TRIPS_PER_PERSON * h.size * h.age),
      maxCost: Infinity,
      goals: nearestByAir(grid, water, homes),
    });
  }
  if (wood.length > 0) {
    groups.push({
      to: 'wood',
      purpose: 'wood',
      errand: 'wood',
      marks: marksOf(wood),
      sources: wood,
      weights: homes.map((h) => woodTrips * h.age),
      maxCost: ERRAND_MAX_COST,
      nearCost: ERRAND_NEAR_COST,
      goals: nearestByAir(grid, wood, homes),
    });
  }
  return groups;
}

/**
 * Nejbližší místo daného druhu každé domácnosti (index v `places`, −1 = žádné): vzdušnou čarou
 * od domu k nejbližšímu bodu místa (čtverce, kmene, stavby), při shodě první místo. K zavedeným
 * místům (posvátná místa, hřbitov, sad) chodí domácnost jen k nejbližšímu (Martin).
 */
function nearestOfKind(
  homes: readonly Household[],
  places: readonly (readonly PathPoint[])[],
): number[] {
  return homes.map((h) => {
    let best = -1;
    let bestD = Infinity;
    places.forEach((points, k) => {
      for (const p of points) {
        const d = length2(p.x - h.x, p.z - h.z);
        if (d < bestD) {
          best = k;
          bestD = d;
        }
      }
    });
    return best;
  });
}

/** Nejbližší místo pochůzky každé domácnosti vzdušnou čarou (−1 = žádné) – směr pro A*. */
function nearestByAir(grid: Grid, cells: readonly number[], homes: readonly Household[]): number[] {
  return homes.map((h) => {
    let best = -1;
    let bestD = Infinity;
    for (const c of cells) {
      const d = length2(cellX(grid, c) - h.x, cellZ(grid, c) - h.z);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  });
}

/**
 * Nejvyšší cena hledání do cíle: k nejvzdálenější domácnosti přímo, s rezervou na objížďku – když
 * je některá brána nedosažitelná, hledání neprojde celé okno.
 */
function groupReach(grid: Grid, sources: readonly number[], homes: readonly Household[]): number {
  let sx = 0;
  let sz = 0;
  for (const c of sources) {
    sx += cellX(grid, c);
    sz += cellZ(grid, c);
  }
  sx /= sources.length;
  sz /= sources.length;
  let spread = 0;
  for (const c of sources)
    spread = Math.max(spread, length2(cellX(grid, c) - sx, cellZ(grid, c) - sz));
  let far = 0;
  for (const h of homes) far = Math.max(far, length2(h.x - sx, h.z - sz));
  return (far + spread + 40) * 6;
}
