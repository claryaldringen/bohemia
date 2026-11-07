// Smršť (disasters.md – Smršť (tornádo); Martin 27. 10. 2026: „Přidej i tornádo. Máme ho doložené
// z Kosmovy kroniky. Jen dej pravděpodobnost obvyklou pro střední Evropu“, „Takhle vzácné tornádo
// je dobré“). Stopa je společná celé mapě (`yearTornadoes` – seed počasí mapy); tady se počítají
// škody jedné vsi v pásu stopy podle síly: stavby, polehlá úroda a louky, rozmetané stohy,
// vyvrácené stromy (vrstva překážek, les vsi, sad, jabloně u cest) a u F3–F4 úmrtí.

import { dateOfDayIndex } from '../calendar';
import { CELL_SIZE_M, LANDSCAPE_SIZE, type Landscape } from '../landscape';
import { detCos, detSin } from '../landscape/det-math';
import { deriveSeed } from '../landscape/random';
import { obstacleKind, obstaclesNear } from '../landscape/obstacles/query';
import type { ObstacleLayer } from '../landscape/obstacles/types';
import { disasterDeaths } from './disaster-deaths';
import {
  inDisasterProtection,
  inTornadoTrack,
  tornadoStrengthRule,
  yearTornadoes,
} from './disaster-schedule';
import { collapseDwellings } from './fire';
import { villageCenter } from './hail';
import { damageUnmownMeadows } from './hay';
import { obstacleChangesAt } from './obstacles';
import { uprootOrchardSquares } from './orchard';
import { TORNADO, type TornadoStrengthRule } from './rules-disasters';
import { squareCenter, type GridGeometry } from './square-grid';
import { villageLandSquares } from './squares';
import type { ChronicleEvent } from './types-chronicle';
import type { TornadoPlan } from './types-disasters';
import type { Dwelling, OrchardSquare, VillageState } from './types';
import { harvestYearOf } from './weather-effects';
import { addFallenTrunks } from './wood';
import { villageWoods, woodTreeSpots } from './woods';

const EPSILON = 1e-9;
const UINT32 = 4294967296;

/** Bez krajiny (kalibrace, testy) díly leží v mřížce běžné krajiny – políčka dílů jsou stejná. */
const DEFAULT_GEOMETRY: GridGeometry = { size: LANDSCAPE_SIZE, cellSizeM: CELL_SIZE_M };

/**
 * Dnešní smrště vsi: vynucená (přebije los i ochranu – stopa přes střed vsi, průměrná délka a šířka
 * síly), nebo z rozpisu mapy. Ves bez počasí kraje (zlaté otisky) a nová ves (5 let) nic.
 */
function tornadoesToday(state: VillageState, day: number): TornadoPlan[] {
  const forced = state.disasters?.override?.tornado?.[day];
  if (forced) {
    const center = villageCenter(state) ?? { x: 0, z: 0 };
    const rule = tornadoStrengthRule(forced.strength);
    const nx = -detSin(forced.angle);
    const nz = detCos(forced.angle);
    return [
      {
        day,
        strength: forced.strength,
        track: {
          x: center.x + nx * forced.offsetM,
          z: center.z + nz * forced.offsetM,
          angle: forced.angle,
          lengthM: rule.lengthM,
          widthM: rule.widthM,
        },
      },
    ];
  }
  if (state.weatherSeed === undefined) return [];
  if (inDisasterProtection(state.foundedDay, day)) return [];
  return yearTornadoes(state.weatherSeed, dateOfDayIndex(day).year).filter((t) => t.day === day);
}

/**
 * Padne strom (sad, jabloň) `key` při smršti? Los podle seedu počasí mapy, dne a klíče – dvě vsi
 * téže mapy vidí tytéž vývraty; F3 a F4 vyvrátí všechny.
 */
function falls(base: number, key: string, share: number): boolean {
  if (share >= 1) return true;
  return deriveSeed(base, key) / UINT32 < share;
}

/**
 * Den smrště (disasters.md – Smršť (tornádo)): zápis starší smrště z dřívějšího roku smaže (platí
 * do konce svého roku – scéna). V den stopy přes ves poničí, co leží v pásu. Mutuje stav, vrátí
 * zápisy do kroniky (smršť a úmrtí).
 */
export function tornadoDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): ChronicleEvent[] {
  const old = state.disasters?.tornado;
  if (old && dateOfDayIndex(old.day).year < dateOfDayIndex(day).year) {
    delete state.disasters!.tornado;
  }
  const events: ChronicleEvent[] = [];
  for (const plan of tornadoesToday(state, day)) {
    events.push(...strike(state, day, plan, landscape, obstacles));
  }
  return events;
}

/** Škody jedné smrště ve vsi; nic v pásu – nic. */
function strike(
  state: VillageState,
  day: number,
  plan: TornadoPlan,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): ChronicleEvent[] {
  const rule = tornadoStrengthRule(plan.strength);
  const { track } = plan;
  const geo = landscape ?? DEFAULT_GEOMETRY;
  const inside = (x: number, z: number): boolean => inTornadoTrack(track, x, z);
  const base = deriveSeed(state.weatherSeed ?? state.seed, 'tornado-trees:' + day);
  // díly polí – střed čtverce dílu v pásu
  const partIds = new Set<number>();
  for (const sq of villageLandSquares(geo, state, ['field'])) {
    if (sq.partId !== undefined && inside(sq.center.x, sq.center.z)) partIds.add(sq.partId);
  }
  const hitParts = flattenCrops(state, day, rule, partIds);
  const meadowShare = damageUnmownMeadows(state, day, (span) => {
    if (span.partId !== undefined) return partIds.has(span.partId) ? rule.crop : 0;
    if (!span.cell) return 0;
    const c = squareCenter(geo, undefined, span.cell);
    return inside(c.x, c.z) ? rule.crop : 0;
  });
  // stromy – vývraty před stavbami (kmen na hromadu, i když dům padne)
  const uprootedTrees = uprootTrees(state, day, rule, plan, obstacles, base);
  const orchardSquares = uprootOrchards(state, day, rule, geo, inside, base);
  const roadApples = uprootRoadApples(state, day, rule, inside, base);
  // stavby – úmrtí v zasažených obydlích před zřícením (obyvatelé se pak stěhují)
  const hitDwellings = state.dwellings.filter((d) => inside(d.position.x, d.position.z));
  const deaths = disasterDeaths(
    state,
    day,
    hitDwellings.map((d) => d.id),
    rule.death,
    'tornado-death:',
    'tornado',
  );
  const lostHayKg = scatterHay(state, rule, hitDwellings.length);
  const { dwellingIds, collapsedIds } = damageDwellings(state, day, rule, hitDwellings);
  const nothing =
    hitParts.length === 0 &&
    dwellingIds.length === 0 &&
    meadowShare <= 0 &&
    uprootedTrees === 0 &&
    orchardSquares === 0 &&
    roadApples === 0;
  if (nothing) return deaths;
  (state.disasters ??= {}).tornado = {
    day,
    strength: plan.strength,
    track: { ...track },
  };
  return [
    {
      day,
      kind: 'tornado',
      strength: plan.strength,
      partIds: hitParts,
      dwellingIds,
      collapsedDwellingIds: collapsedIds,
      uprootedTrees,
      ...(orchardSquares > 0 ? { orchardSquares } : {}),
      ...(roadApples > 0 ? { roadApples } : {}),
      ...(meadowShare > 0 ? { meadowShare } : {}),
      ...(lostHayKg > 0 ? { lostHayKg: Math.round(lostHayKg) } : {}),
    },
    ...deaths,
  ];
}

/**
 * Polehlá nesklizená úroda dílů v pásu: ztráta do `disasters.losses.tornado` za rok sklizně
 * (sloučí ji `dayPartLosses`; druhá smršť téhož roku se sloučí). Vrátí id zasažených dílů.
 */
function flattenCrops(
  state: VillageState,
  day: number,
  rule: TornadoStrengthRule,
  partIds: ReadonlySet<number>,
): number[] {
  const year = harvestYearOf(day);
  const previous = state.disasters?.losses;
  const current = previous?.year === year ? previous : undefined;
  const losses: Record<string, number> = { ...current?.tornado };
  const hit = new Set<number>();
  for (const crop of state.season?.crops ?? []) {
    if (crop.harvestedKg !== null) continue;
    for (const id of crop.partIds) {
      if (!partIds.has(id) || hit.has(id)) continue;
      const key = String(id);
      losses[key] = 1 - (1 - (losses[key] ?? 0)) * (1 - rule.crop);
      hit.add(id);
    }
  }
  if (hit.size > 0) (state.disasters ??= {}).losses = { ...current, year, tornado: losses };
  return [...hit].sort((a, b) => a - b);
}

/**
 * Vyvrácené stromy (forest.md – vývrat jako kácení): dospělé stromy vrstvy překážek a lesa vsi
 * v pásu do `TORNADO.reachM` od středu vsi – zmizí jako pokácené (`felledTrees` – pařez, pak
 * nálet) a kmeny zůstanou ležet na místě jako hromady klád u lesa (`addFallenTrunks`) – ves je zpracuje a odveze prací, žádné dřevo zdarma u vsi. Mladé stromky a keře se ohnou. Vrátí počet.
 */
function uprootTrees(
  state: VillageState,
  day: number,
  rule: TornadoStrengthRule,
  plan: TornadoPlan,
  obstacles: ObstacleLayer | null,
  base: number,
): number {
  const center = villageCenter(state);
  if (!center) return 0;
  const { track } = plan;
  const reach = TORNADO.reachM;
  const near = (x: number, z: number): boolean => {
    const dx = x - center.x;
    const dz = z - center.z;
    return dx * dx + dz * dz <= reach * reach && inTornadoTrack(track, x, z);
  };
  const changes = obstacleChangesAt(state, day);
  const gone = new Set([...changes.removed, ...changes.stumps, ...changes.saplings]);
  const ids: number[] = [];
  const positions = new Map<number, { x: number; z: number }>();
  if (obstacles) {
    for (const i of obstaclesNear(
      obstacles,
      center.x - reach,
      center.z - reach,
      center.x + reach,
      center.z + reach,
    )) {
      if (obstacleKind(obstacles, i) !== 'tree') continue;
      const id = obstacles.id[i]!;
      if (gone.has(id) || !near(obstacles.x[i]!, obstacles.z[i]!)) continue;
      ids.push(id);
      positions.set(id, { x: obstacles.x[i]!, z: obstacles.z[i]! });
    }
  }
  // les vsi – dospělé stromy (přidané nad vrstvu, `added` s druhem strom)
  const woodIds = new Set(villageWoods(state).flatMap((w) => woodTreeSpots(w).map((s) => s.id)));
  for (const o of changes.added ?? []) {
    if (o.kind === 'tree' && woodIds.has(o.id) && near(o.x, o.z)) {
      ids.push(o.id);
      positions.set(o.id, { x: o.x, z: o.z });
    }
  }
  const fallen = [...new Set(ids)]
    .sort((a, b) => a - b)
    .filter((id) => falls(base, 'tree:' + id, rule.trees));
  if (fallen.length === 0) return 0;
  state.felledTrees = [...(state.felledTrees ?? []), ...fallen.map((id) => ({ id, day }))];
  // padlé kmeny leží na místě (hromada u lesa, ne u vsi)
  const spots = new Map<number, { x: number; z: number }>();
  for (const [id, p] of positions) spots.set(id, p);
  const trunks = fallen.flatMap((id) => {
    const at = spots.get(id);
    return at ? [at] : [];
  });
  addFallenTrunks(state, trunks);
  return fallen.length;
}

/** Vyvrácené čtverce sadů v pásu – ves je obnoví jako staré (`uprootOrchardSquares`). */
function uprootOrchards(
  state: VillageState,
  day: number,
  rule: TornadoStrengthRule,
  geo: GridGeometry,
  inside: (x: number, z: number) => boolean,
  base: number,
): number {
  const orchards = state.orchards ?? [];
  if (orchards.length === 0) return 0;
  // pořadí `villageLandSquares(['orchard'])` = pořadí sadů a jejich čtverců (squares.ts, jako kroupy)
  const centers = villageLandSquares(geo, state, ['orchard']);
  let index = 0;
  let count = 0;
  for (const orchard of orchards) {
    const hit: OrchardSquare[] = [];
    orchard.squares.forEach((square, k) => {
      const c = centers[index++]?.center;
      if (!c || !inside(c.x, c.z) || square.plantedDay === null) return;
      if (falls(base, `orchard:${orchard.id}:${k}`, rule.trees)) hit.push(square);
    });
    if (hit.length > 0) count += uprootOrchardSquares(state, day, orchard, hit);
  }
  return count;
}

/**
 * Vyvrácené jabloně u cest v pásu: vesničané hned zasadí nový stromek na totéž místo (návrh
 * Clauda – jabloň roste znovu od výsadby, plody až po letech). Vrátí počet.
 */
function uprootRoadApples(
  state: VillageState,
  day: number,
  rule: TornadoStrengthRule,
  inside: (x: number, z: number) => boolean,
  base: number,
): number {
  let count = 0;
  for (const apple of state.roads?.apples ?? []) {
    if (apple.plantedDay === null || apple.plantedDay >= day || !inside(apple.x, apple.z)) continue;
    if (!falls(base, 'apple:' + apple.id, rule.trees)) continue;
    apple.plantedDay = day;
    count++;
  }
  return count;
}

/**
 * Rozmetané seno: stohy stojí u obydlí (jako u požáru – návrh Clauda), podíl sena = zasažená
 * obydlí ÷ všechna × `rule.hay` (F0 půlka stohu). Vrátí kg.
 */
function scatterHay(state: VillageState, rule: TornadoStrengthRule, hit: number): number {
  const total = state.dwellings.length;
  if (!state.hay || hit === 0 || total === 0) return 0;
  const lost = state.hay.kg * (hit / total) * rule.hay;
  state.hay.kg -= lost;
  return lost;
}

/**
 * Stavby v pásu ztratí stav podle síly (zemnice zahloubená odolá lépe); co dojde na nulu, spadne
 * jako po požáru (`collapseDwellings` – zbytek jámy, obyvatelé k příbuzným, přestavba).
 */
function damageDwellings(
  state: VillageState,
  day: number,
  rule: TornadoStrengthRule,
  hit: readonly Dwelling[],
): { dwellingIds: number[]; collapsedIds: number[] } {
  const destroyed: Dwelling[] = [];
  const dwellingIds: number[] = [];
  for (const d of hit) {
    dwellingIds.push(d.id);
    const damage = d.type === 'zemnice' ? rule.zemnice : rule.building;
    d.condition = Math.max(0, d.condition - damage);
    if (d.condition <= EPSILON) destroyed.push(d);
  }
  collapseDwellings(state, day, destroyed);
  return {
    dwellingIds: dwellingIds.sort((a, b) => a - b),
    collapsedIds: destroyed.map((d) => d.id).sort((a, b) => a - b),
  };
}
