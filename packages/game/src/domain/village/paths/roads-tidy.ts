// Úklid sítě pevných cest: souběžné cesty, copánky, díry mezi úseky a volné konce (roads.md – Úseky a rozcestí).

import { length2 } from '../../landscape';
import { cloneState } from '../clone';
import { ROAD_ANCHORS, ROAD_BRAID_RING, ROAD_JOIN, ROAD_TREES, WAGON_MERGE } from '../rules';
import {
  type Construction,
  type Road,
  type RoadGrade,
  type RoadPoint,
  type Trail,
  type VillageRoads,
} from '../types';
import { type PathVillage } from './network-types';
import { type PathTerrain } from './terrain';
import {
  END_SNAP_M,
  MIN_ROAD_M,
  PARALLEL_MIN_M,
  PARALLEL_STEP_M,
  RoadHit,
  alongsideRoad,
  axisDistance,
  axisSlice,
  groundPart,
  lengthsAlong,
  nearestOnRoads,
  resample,
  roadGroundOf,
  roadLengthM,
  toSegment,
} from './roads-geometry';
import { retrailPieces } from './roads-overgrow';
import { dropGoneTrailPieces, endKey, mergeRoadChains, roadsInWork, splitRoad } from './roads-form';
import { type RoadAnchors, nearAnchor } from './road-anchors';
import { type StubNetwork, hasLoop, hasStubWork, splitLoops, trimStubs } from './roads-stubs';
import { SpotContext } from './roads-trees';

/**
 * Copánek: dva úseky mezi stejnými dvěma uzly, které se od sebe nevzdálí víc než tolik (m) –
 * slabší zmizí (lidé chodí po silnější).
 */
const BRAID_M = 25;
/**
 * Krátký vzdálený kus copánku (návrh Clauda, Vlkov 24. 10. 2026): slabší úsek smí od silnějšího
 * odběhnout nad BRAID_M, ale souvisle nejvýš max(BRAID_FAR_RUN_M, BRAID_FAR_SHARE délky úseku)
 * a nejdál BRAID_FAR_MAX_M – oblouk kolem překážky je pořád ta samá cesta. Delší nebo vzdálenější
 * kus jsou dvě cesty.
 */
const BRAID_FAR_RUN_M = 25;
const BRAID_FAR_SHARE = 0.08;
const BRAID_FAR_MAX_M = 2 * BRAID_M;
/** Trasa delší o víc než tento násobek je u copánku oklika – zmizí ona. */
const BRAID_LONGER = 1.05;
/** Kol úklidu (souběžné kusy → díry → copánky) nejvýš. */
const TIDY_ROUNDS = 3;

/** Síla stupně cesty – vozová cesta (roads.md – Vozová cesta) je nejsilnější. */
const GRADE_RANK: Readonly<Record<RoadGrade, number>> = {
  trodden: 0,
  improved: 1,
  wagon: 3,
};

/** Pořadí síly cest: vyšší stupeň, starší, víc provozu loni, menší id – silnější dřív. */
function strongerRoad(a: Road, b: Road): number {
  const grade = (r: Road): number => GRADE_RANK[r.grade];
  return (
    grade(b) - grade(a) ||
    // vozová cesta před pěší (wagons.md – Vyjeté cesty)
    (b.cart ? 1 : 0) - (a.cart ? 1 : 0) ||
    a.bornDay - b.bornDay ||
    (b.traffic[b.traffic.length - 1] ?? 0) - (a.traffic[a.traffic.length - 1] ?? 0) ||
    a.id - b.id
  );
}

/** Nejdelší souběžný kus osy `road` se silnějšími cestami `stronger` (od–do v m); jinak null. */
function parallelRun(
  road: Road,
  stronger: readonly Road[],
): { from: number; to: number; partner: Road } | null {
  if (stronger.length === 0) return null;
  const samples = resample(road.points, null, PARALLEL_STEP_M).points;
  const at = lengthsAlong(samples);
  let best: { from: number; to: number; partner: Road } | null = null;
  let start = -1;
  let partner: Road | null = null;
  const close = (end: number): void => {
    if (start < 0 || !partner) return;
    const from = at[start]!;
    const to = at[end]!;
    if (to - from >= PARALLEL_MIN_M && (!best || to - from > best.to - best.from)) {
      best = { from, to, partner };
    }
  };
  samples.forEach((p, k) => {
    const before = samples[Math.max(0, k - 1)]!;
    const after = samples[Math.min(samples.length - 1, k + 1)]!;
    const along = stronger.filter((r) => alongsideRoad([r], p, before, after));
    if (along.length > 0) {
      if (start < 0) {
        start = k;
        partner = along[0]!;
      }
      return;
    }
    close(k - 1);
    start = -1;
    partner = null;
  });
  close(samples.length - 1);
  return best;
}

/**
 * Po dostavění úseku vozové cesty (roads.md – Vozová cesta; mutuje): kusy slabších cest souběžné
 * s ní se vyříznou hned, ne až při roční kontrole (`mergeParallelRoads`), a navazující úseky se
 * spojí – kde vozová cesta vede po ose staré cesty, nahradí ji bez dočasného rozcestí.
 */
export function absorbParallelRoads(
  roads: VillageRoads,
  constructions: Construction[],
  trails?: readonly Trail[],
): void {
  if (mergeParallelRoads(roads, constructions, trails)) {
    mergeRoadChains(roads, constructions, trails);
    dropGoneTrailPieces(roads, trails);
  }
}

/**
 * Souběžné pevné cesty se sloučí (mutuje): z mladší / slabší cesty se vyřízne kus, který vede
 * souběžně se silnější (`parallelRun`) – zbytky kratší než MIN_ROAD_M zmizí, delší zůstanou jako
 * úseky (první s id cesty, další s novým) a jejich konce u silnější cesty pak napojí
 * `joinRoadGaps`. Místa na stromy ve vyříznutém kusu: se stromem do ROAD_TREES.offsetM.to + 1 m
 * od silnější cesty přejdou k ní, ostatní stromy stojí dál bez cesty (jako u zarostlé). Jabloně
 * vyříznutého kusu patří silnější cestě. Cesty ve stavbě (vylepšení, výsadba) se nemění. Vozová
 * cesta se vyřízne jen souběžnou silnější vozovou a jen bez ztráty konce (`wagonCutKeepsEnds` –
 * paths.md, Zdvojená vozová cesta). Vrátí, jestli něco sloučil.
 */
export function mergeParallelRoads(
  roads: VillageRoads,
  constructions: readonly Construction[],
  /** Zemské stezky – po vyříznutí prostředního kusu vedou po obou zbytcích. */
  trails?: readonly Trail[],
): boolean {
  const building = roadsInWork(constructions);
  let merged = false;
  for (let guard = roads.roads.length * 2; guard > 0; guard--) {
    const order = roads.roads.filter((r) => !r.abandoned).sort(strongerRoad);
    let cut: { road: Road; from: number; to: number; partner: Road } | null = null;
    // od nejslabší – se silnějšími než ona
    for (let i = order.length - 1; i > 0 && !cut; i--) {
      const road = order[i]!;
      if (building.has(road.id) || road.points.length < 2) continue;
      // vozová cesta (roads.md – Vozová cesta) se pěší cestou nevyřízne – jen souběžnou silnější
      // vozovou (paths.md – Zdvojená vozová cesta); silnější než vozová jsou jen vozové, a to jen
      // hotové – rozestavěná ještě nejezdí, hotová se kvůli ní nevyřízne
      const stronger =
        road.grade === 'wagon'
          ? order.slice(0, i).filter((r) => !building.has(r.id))
          : order.slice(0, i);
      const run = parallelRun(road, stronger);
      if (run && (road.grade !== 'wagon' || wagonCutKeepsEnds(road, run, stronger))) {
        cut = { road, ...run };
      }
    }
    if (!cut) break;
    cutRoad(roads, cut.road, cut.from, cut.to, cut.partner, trails);
    merged = true;
  }
  return merged;
}

/**
 * Smí se ze slabší vozové cesty `road` vyříznout souběžný kus `run` (paths.md – Zdvojená vozová
 * cesta)? Partner musí být vozová cesta a konec úseku, který by vyříznutím zmizel (kus začíná na
 * začátku nebo končí na konci osy), musí ležet do `WAGON_MERGE.endM` od osy silnější vozové cesty –
 * jinak by vozová síť přišla o spojení (konec u humna, dvorce, pole). Vnitřní konce zbytků leží
 * u silnější vozové do 12 m a napojí je `joinRoadGaps`.
 */
function wagonCutKeepsEnds(
  road: Road,
  run: { from: number; to: number; partner: Road },
  stronger: readonly Road[],
): boolean {
  if (run.partner.grade !== 'wagon') return false;
  const wagons = axisDistance(stronger.filter((r) => r.grade === 'wagon').map((r) => r.points));
  const length = roadLengthM(road);
  const first = road.points[0]!;
  const last = road.points[road.points.length - 1]!;
  // zbytek kratší než MIN_ROAD_M zmizí s vyříznutým kusem – jeho konec taky
  if (run.from < MIN_ROAD_M && wagons(first.x, first.z) > WAGON_MERGE.endM) return false;
  if (length - run.to < MIN_ROAD_M && wagons(last.x, last.z) > WAGON_MERGE.endM) return false;
  return true;
}

/** Vyřízne z úseku `road` kus od `from` do `to` m (souběžný s `partner`) – mutuje. */
function cutRoad(
  roads: VillageRoads,
  road: Road,
  from: number,
  to: number,
  partner: Road,
  trails?: readonly Trail[],
): void {
  const length = roadLengthM(road);
  const pieces = [
    { a: 0, b: from },
    { a: to, b: length },
  ].filter(({ a, b }) => b - a >= MIN_ROAD_M);
  const made: Road[] = pieces.map(({ a, b }, k) => {
    const points = axisSlice(road.points, a, b);
    return {
      id: k === 0 ? road.id : roads.nextId++,
      points,
      bornDay: road.bornDay,
      grade: road.grade,
      traffic: [...road.traffic],
      spots: [],
      ...(road.ground ? { ground: groundPart(road.ground, a, b) } : {}),
      ...(road.cart ? { cart: true as const } : {}),
      ...(road.unbridged ? { unbridged: true as const } : {}),
      ...(road.swath ? { swath: true as const } : {}),
      ...(road.cartTraffic ? { cartTraffic: [...road.cartTraffic] } : {}),
    };
  });
  // místa na stromy a jabloně k nejbližšímu kusu, ve vyříznutém kusu k silnější cestě
  const partnerAxis = axisDistance([partner.points]);
  const axes = made.map((r) => axisDistance([r.points]));
  const occupied = new Set(roads.trees.map((t) => t.spot));
  const nearPiece = (x: number, z: number): Road | null => {
    let best: Road | null = null;
    let bestD = ROAD_TREES.offsetM.to + 1;
    made.forEach((r, k) => {
      const d = axes[k]!(x, z);
      if (d <= bestD) {
        best = r;
        bestD = d;
      }
    });
    return best;
  };
  for (const spot of road.spots) {
    const piece = nearPiece(spot.x, spot.z);
    if (piece) piece.spots.push(spot);
    else if (occupied.has(spot.id) && partnerAxis(spot.x, spot.z) <= ROAD_TREES.offsetM.to + 1) {
      partner.spots.push(spot);
    }
  }
  for (const apple of roads.apples ?? []) {
    if (apple.roadId !== road.id) continue;
    apple.roadId = (nearPiece(apple.x, apple.z) ?? partner).id;
  }
  // stav kusů k nejbližšímu zbytku (paths.md – Zarůstání)
  for (const q of road.condition ?? []) {
    const piece = nearPiece(q.x, q.z);
    if (piece) (piece.condition ??= []).push(q);
  }
  const index = roads.roads.indexOf(road);
  retrailPieces(trails, roads, road.id, road.points, made);
  roads.roads.splice(index, 1, ...made);
}

/**
 * Která ze dvou tras mezi stejnými uzly zůstane: vyšší stupeň, pak kratší (delší o víc než
 * BRAID_LONGER je oklika), pak silnější (`strongerRoad`) – ta dřív.
 */
function braidOrder(a: Road, b: Road): number {
  const grade = (r: Road): number => GRADE_RANK[r.grade];
  const la = roadLengthM(a);
  const lb = roadLengthM(b);
  const shorter = la > lb * BRAID_LONGER ? 1 : lb > la * BRAID_LONGER ? -1 : 0;
  return grade(b) - grade(a) || shorter || strongerRoad(a, b);
}

/**
 * Slabší úsek se od os `axes` nikde nevzdálí víc než BRAID_M – krátký vzdálený kus se toleruje
 * (souvisle nejvýš max(BRAID_FAR_RUN_M, BRAID_FAR_SHARE délky), nejdál BRAID_FAR_MAX_M).
 */
function staysNear(weak: Road, axes: readonly (readonly RoadPoint[])[]): boolean {
  const limit = Math.max(BRAID_FAR_RUN_M, BRAID_FAR_SHARE * roadLengthM(weak));
  let run = 0;
  for (const p of resample(weak.points, null, PARALLEL_STEP_M).points) {
    let best = Infinity;
    for (const axis of axes) {
      for (let k = 1; k < axis.length; k++) {
        best = Math.min(best, toSegment(p.x, p.z, axis[k - 1]!, axis[k]!).distance);
      }
    }
    run = best > BRAID_M ? run + PARALLEL_STEP_M : 0;
    if (best > BRAID_FAR_MAX_M || run > limit) return false;
  }
  return true;
}

/** Živé úseky v pořadí copánků – silnější dřív (`braidOrder`). */
function braidOrderOf(roads: VillageRoads): Road[] {
  return roads.roads.filter((r) => r.points.length >= 2 && !r.abandoned).sort(braidOrder);
}

/** Leží bod uvnitř okruhu (sudý počet průsečíků paprsku – jen sčítání a dělení)? */
function insideRing(ring: readonly RoadPoint[], p: RoadPoint): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Stavba pro okruh copánku – body, kterými leží na zemi (jedna stavba = jeden člen v okruhu). */
export type RingBuilding = readonly RoadPoint[];

/** Střed a rohy čtverce (bez natočení – konzervativně o kousek víc, než zabírá). */
function squarePoints(s: { x: number; z: number; size: number }): RoadPoint[] {
  const h = s.size / 2;
  return [
    { x: s.x, z: s.z },
    { x: s.x - h, z: s.z - h },
    { x: s.x + h, z: s.z - h },
    { x: s.x + h, z: s.z + h },
    { x: s.x - h, z: s.z + h },
  ];
}

/**
 * Stavby vsi pro okruh copánku (paths.md – Copánek přes křižovatku) – jedna na stavbu: obydlí
 * (střed pozemku, bez něj dům, i rozestavěné), modla a svatyně, humno, milíř a obilná jáma jedním
 * bodem; pozemky – díl pole (všechny díly), sad, hřbitov a ohrada – středy a rohy všech čtverců:
 * stavba je uvnitř okruhu, když je uvnitř kterýkoli z těch bodů (návrh Clauda, konzervativně).
 */
export function ringBuildingPoints(village: PathVillage): RingBuilding[] {
  const out: RingBuilding[] = [];
  for (const d of village.dwellings) {
    out.push([d.plot ? { x: d.plot.x, z: d.plot.z } : { x: d.position.x, z: d.position.z }]);
  }
  for (const p of village.pens ?? []) out.push([p, ...(p.extra ?? [])].flatMap(squarePoints));
  for (const f of village.fields) {
    if (f.parts.length > 0) out.push(f.parts.flatMap(squarePoints));
  }
  for (const o of village.orchards ?? []) {
    if (o.squares.length > 0) out.push(o.squares.flatMap(squarePoints));
  }
  for (const c of village.cemeteries ?? []) {
    if (c.squares.length > 0) out.push(c.squares.flatMap(squarePoints));
  }
  for (const b of village.sacred?.buildings ?? []) out.push([{ x: b.position.x, z: b.position.z }]);
  for (const f of village.threshingFloors ?? []) out.push([{ x: f.position.x, z: f.position.z }]);
  for (const k of village.kilns ?? []) out.push([{ x: k.x, z: k.z }]);
  for (const g of village.grainPits ?? []) out.push([{ x: g.x, z: g.z }]);
  return out;
}

/**
 * Je úsek `weak` jediným přístupem k některému vchodu stavby (paths.md – Copánek přes křižovatku)?
 * Vchod leží do `ROAD_ANCHORS.entranceM` od jeho osy a žádný jiný živý úsek tam nevede – tak
 * `accessRoads` pozná, že vchod cestu má. Zrušený by ji vchod hned dostal znovu (oscilace).
 */
function soleAccess(order: readonly Road[], weak: Road, entrances: readonly RoadPoint[]): boolean {
  if (entrances.length === 0) return false;
  const onWeak = axisDistance([weak.points]);
  const others = axisDistance(order.filter((r) => r !== weak).map((r) => r.points));
  return entrances.some(
    (e) => onWeak(e.x, e.z) <= ROAD_ANCHORS.entranceM && others(e.x, e.z) > ROAD_ANCHORS.entranceM,
  );
}

/**
 * Copánek přes křižovatku (paths.md – Copánek přes křižovatku; rules-roads.ts – ROAD_BRAID_RING):
 * nejslabší úsek A–B (`order` od silnějšího), ke kterému vede souběžně (`staysNear`) druhá větev
 * z A do B přes 1 až `maxNodes` mezilehlé uzly jen ze silnějších úseků; okruh obou větví nejvýš
 * `maxM` m a uvnitř nejvýš `maxInside` staveb a pozemků (0) (`buildings` – počítají se, až když sedí délka
 * a souběh). Vozová a rozestavěná cesta jako slabší nezmizí, ani úsek, který je jediným přístupem
 * k vchodu stavby (`entrances`). Vrátí slabý úsek a úsek druhé větve
 * nejblíž jeho středu, nebo null.
 */
function ringBraid(
  order: readonly Road[],
  building: ReadonlySet<number>,
  buildings: () => readonly RingBuilding[],
  entrances?: () => readonly RoadPoint[],
): { weak: Road; strong: Road } | null {
  const ends: [string, string][] = order.map((r) => [
    endKey(r.points[0]!),
    endKey(r.points[r.points.length - 1]!),
  ]);
  const lengths = order.map((r) => roadLengthM(r));
  // uzel → úseky v něm (indexy v `order`, vzestupně)
  const at = new Map<string, number[]>();
  ends.forEach(([a, b], k) => {
    if (a === b) return;
    for (const key of [a, b]) {
      const list = at.get(key);
      if (list) list.push(k);
      else at.set(key, [k]);
    }
  });
  // sedí okruh slabého úseku `weak` (z `start`) a druhé větve? Úsek větve nejblíž středu slabého
  const ringFits = (weak: Road, start: string, branch: readonly Road[]): Road | null => {
    if (
      !staysNear(
        weak,
        branch.map((r) => r.points),
      )
    )
      return null;
    // okruh: slabý úsek z A do B a druhá větev z B zpět do A
    const way: RoadPoint[] = [];
    let node = start;
    for (const r of branch) {
      const forward = endKey(r.points[0]!) === node;
      way.push(...(forward ? r.points : [...r.points].reverse()));
      node = endKey((forward ? r.points[r.points.length - 1] : r.points[0])!);
    }
    const ring = [...weak.points, ...way.reverse()];
    let inside = 0;
    for (const building of buildings()) {
      if (building.some((p) => insideRing(ring, p)) && ++inside > ROAD_BRAID_RING.maxInside) {
        return null;
      }
    }
    const half = roadLengthM(weak) / 2;
    const mid = axisSlice(weak.points, half, half)[0]!;
    let best = branch[0]!;
    let bestD = Infinity;
    for (const r of branch) {
      const d = axisDistance([r.points])(mid.x, mid.z);
      if (d < bestD) {
        best = r;
        bestD = d;
      }
    }
    return best;
  };
  for (let i = order.length - 1; i > 1; i--) {
    const weak = order[i]!;
    if (building.has(weak.id) || weak.grade === 'wagon') continue;
    const [from, to] = ends[i]!;
    if (from === to || lengths[i]! >= ROAD_BRAID_RING.maxM) continue;
    if (entrances && soleAccess(order, weak, entrances())) continue;
    // druhá větev – úseky silnější než slabý (index < i), uzly se neopakují
    const walk = (node: string, path: number[], seen: string[], lengthM: number): Road | null => {
      for (const k of at.get(node) ?? []) {
        if (k >= i || path.includes(k)) continue;
        const [a, b] = ends[k]!;
        const next = a === node ? b : a;
        const total = lengthM + lengths[k]!;
        if (total > ROAD_BRAID_RING.maxM) continue;
        if (next === to) {
          // jeden úsek mezi týmiž uzly je obyčejný copánek (`removeBraids`)
          const strong =
            path.length > 0
              ? ringFits(
                  weak,
                  from,
                  [...path, k].map((n) => order[n]!),
                )
              : null;
          if (strong) return strong;
          continue;
        }
        if (path.length >= ROAD_BRAID_RING.maxNodes || seen.includes(next)) continue;
        const strong = walk(next, [...path, k], [...seen, next], total);
        if (strong) return strong;
      }
      return null;
    };
    const strong = walk(from, [], [from], lengths[i]!);
    if (strong) return { weak, strong };
  }
  return null;
}

/**
 * Copánky se rozpletou (mutuje): dva úseky mezi stejnými dvěma uzly (oba konce společné), slabší
 * (`braidOrder` – nižší stupeň, oklika) se od silnějšího nikde nevzdálí víc než BRAID_M (krátký
 * vzdálený kus se toleruje, BRAID_FAR_RUN_M) – slabší
 * zmizí jako vyříznutý souběžný kus (`cutRoad` – stromy u něj stojí dál, jabloně patří
 * silnějšímu). Se stavbami vsi (`buildings`) i copánek přes 1–2 mezilehlé uzly (`ringBraid`).
 * Cesty ve stavbě zůstanou. Vrátí, jestli něco odstranil.
 */
export function removeBraids(
  roads: VillageRoads,
  constructions: readonly Construction[],
  buildings?: () => readonly RingBuilding[],
  entrances?: () => readonly RoadPoint[],
): boolean {
  const building = roadsInWork(constructions);
  const endsOf = (r: Road): string =>
    [endKey(r.points[0]!), endKey(r.points[r.points.length - 1]!)].sort().join('|');
  let removed = false;
  for (let guard = roads.roads.length; guard > 0; guard--) {
    const order = braidOrderOf(roads);
    let braid: { weak: Road; strong: Road } | null = null;
    for (let i = order.length - 1; i > 0 && !braid; i--) {
      const weak = order[i]!;
      if (building.has(weak.id) || weak.grade === 'wagon') continue;
      const key = endsOf(weak);
      const [a, b] = key.split('|');
      if (a === b) continue;
      for (const strong of order.slice(0, i)) {
        if (endsOf(strong) !== key) continue;
        if (staysNear(weak, [strong.points])) {
          braid = { weak, strong };
          break;
        }
      }
    }
    if (!braid && buildings) braid = ringBraid(order, building, buildings, entrances);
    if (!braid) break;
    cutRoad(roads, braid.weak, 0, roadLengthM(braid.weak), braid.strong);
    removed = true;
  }
  return removed;
}

/**
 * Je v síti copánek přes křižovatku (`ringBraid`)? Měsíční kontrola tak uklidí i síť beze změny
 * (starší ves bez převodu).
 */
export function hasRingBraid(
  roads: VillageRoads,
  constructions: readonly Construction[],
  buildings: () => readonly RingBuilding[],
  entrances?: () => readonly RoadPoint[],
): boolean {
  return ringBraid(braidOrderOf(roads), roadsInWork(constructions), buildings, entrances) !== null;
}

/**
 * Skutečné konce tras pro úklid (`tidyRoads`): body (konec do TERMINUS_M), nebo vlastní kontrola
 * bodu (měsíční vznik – konec u kotvy, `nearAnchor`).
 */
export type RoadTermini = readonly RoadPoint[] | ((p: RoadPoint) => boolean);

/**
 * Úklid pevných cest (měsíční kontrola, převod starší vsi – mutuje; paths.md – Síť – kotvy, pahýly
 * a úklid): okruhy přes jeden uzel se rozdělí, souběžné cesty sloučí, díry zacelí, copánky
 * odstraní, falešná rozcestí spojí, pahýly uklidí (`network`) a určí se skutečné volné konce
 * (roads.md – Úseky a rozcestí). Cesty k vchodům přidá měsíční kontrola (`accessRoads`).
 */
export function tidyRoads(
  roads: VillageRoads,
  constructions: Construction[],
  termini: RoadTermini,
  context: SpotContext,
  /** Kotvy a čáry tras – s nimi se rozdělí okruhy a uklidí pahýly (`trimStubs`); bez nich ne. */
  network?: StubNetwork,
  /** Zemské stezky – po spojení úseků vedou po ponechaném úseku (`mergeRoadChains`). */
  trails?: readonly Trail[],
): void {
  // konce po zarostlém kusu jsou skutečné volné konce – díra se k nim nedoplní (roads.md)
  const cutEnds = roads.cutEnds ?? [];
  const ends = (p: RoadPoint): boolean =>
    isTerminus(p, cutEnds) || (typeof termini === 'function' ? termini(p) : isTerminus(p, termini));
  // po sloučení souběžných kusů a zacelení děr můžou vzniknout copánky – znovu, nejvýš pár kol
  for (let round = 0; round < TIDY_ROUNDS; round++) {
    // okruh přes jeden uzel – dva úseky, malý okruh pak zmizí jako copánek a pahýl
    const loops = network ? splitLoops(roads, constructions, context, network.trails) : false;
    const parallel = mergeParallelRoads(roads, constructions, trails);
    joinRoadGaps(roads, ends, context);
    // copánky před spojováním – kusy silnější cesty se po odstranění slabší trasy spojí zpět
    const braids = removeBraids(roads, constructions, context.buildings, context.entrances);
    mergeRoadChains(roads, constructions, trails);
    const more = removeBraids(roads, constructions, context.buildings, context.entrances);
    if (more) mergeRoadChains(roads, constructions, trails);
    if (!loops && !parallel && !braids && !more) break;
  }
  // pahýly po dělení a spojování – zmizí, uzel u nich se spojí
  if (network && trimStubs(roads, constructions, network)) {
    mergeRoadChains(roads, constructions, trails);
  }
  dropGoneTrailPieces(roads, trails);
  markRoadEnds(roads, ends);
  // konce po zarostlém kusu, kde už žádný úsek nekončí, zmizí
  if (roads.cutEnds) {
    const degrees = endDegrees(roads.roads);
    const kept = roads.cutEnds.filter((p) => degrees.has(endKey(p)));
    if (kept.length > 0) roads.cutEnds = kept;
    else delete roads.cutEnds;
  }
}

// --- díry mezi úseky ----------------------------------------------------------------------------

/**
 * Volný konec úseku se k jinému úseku napojí, když je od jeho osy nebo konce nejvýš tak daleko
 * (m – `ROAD_JOIN.gapM`) – díry po přimknutí trasy kus vedle nebo po úseku, kde provoz na chvíli
 * klesl pod práh (Vlkov: 5,3 m mezi úseky v polích, 11,6 m u brány domu, 6,2 m vozová u hřbitova).
 */
const JOIN_GAP_M = ROAD_JOIN.gapM;
/** Konec vozové cesty na ose rozestavěných zemních prací (do tolika m) – stavba ji tam vede dál. */
const BUILDING_END_M = 2;
/**
 * Konec úseku je skutečný volný konec (brána domu, cíl – pole, voda, les –, slepý konec), když
 * do tolika metrů (m) leží kotva nebo konec trasy – trasa tam nepokračuje. Jinde pokračuje (díra).
 */
export const TERMINUS_M = 6;

function isTerminus(p: RoadPoint, termini: readonly RoadPoint[]): boolean {
  return termini.some((t) => length2(t.x - p.x, t.z - p.z) <= TERMINUS_M);
}

/**
 * Konce tras měsíčního vzniku (paths.md – Síť – kotvy, pahýly a úklid): konec úseku je skutečný
 * konec, když leží u kotvy – v jejím dosahu nebo u kraje mapy (`nearAnchor`, stejně jako konec
 * nové cesty), nebo do TERMINUS_M od ní. Jinde je to díra, kterou úklid zacelí.
 */
export function anchorTermini(anchors: RoadAnchors): (p: RoadPoint) => boolean {
  return (p) => nearAnchor(anchors, p.x, p.z) || isTerminus(p, anchors.points);
}

/**
 * Má úklid co dělat, i když se cesty od posledního úklidu nezměnily (změnily se jen kotvy a čáry
 * tras)? Okruh přes uzel, díra k zacelení, nebo pahýl (`hasStubWork`). Nic nemění.
 */
export function tidyDue(
  roads: VillageRoads,
  constructions: readonly Construction[],
  termini: (p: RoadPoint) => boolean,
  network: StubNetwork,
  /** Stavby vsi – copánek přes křižovatku (`hasRingBraid`); bez nich se nehledá. */
  buildings?: () => readonly RingBuilding[],
  entrances?: () => readonly RoadPoint[],
): boolean {
  const cutEnds = roads.cutEnds ?? [];
  const ends = (p: RoadPoint): boolean => isTerminus(p, cutEnds) || termini(p);
  return (
    hasLoop(roads, constructions, network.trails) ||
    firstGap(roads, ends) !== null ||
    hasStubWork(roads, constructions, network) ||
    (buildings !== undefined && hasRingBraid(roads, constructions, buildings, entrances))
  );
}

/** Kolik konců úseků je v bodě (klíč na cm). */
function endDegrees(roads: readonly Road[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const road of roads) {
    if (road.points.length < 2 || road.abandoned) continue;
    for (const p of [road.points[0]!, road.points[road.points.length - 1]!]) {
      const key = endKey(p);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  return count;
}

/**
 * První díra (v pořadí úseků): volný konec úseku (žádný jiný úsek v něm nekončí), který není
 * skutečným koncem trasy (`isEnd`), a nejbližší bod jiného úseku do JOIN_GAP_M; jinak null.
 */
function firstGap(
  roads: VillageRoads,
  isEnd: (p: RoadPoint) => boolean,
): { road: Road; atStart: boolean; hit: RoadHit } | null {
  const degrees = endDegrees(roads.roads);
  let building: ((x: number, z: number) => number) | null = null;
  // rozestavěná vozová cesta končí, kde ji stavba vede (uprostřed trasy) – osa se neprodlouží;
  // hotová vozová se napojí jako každá jiná (paths.md – Síť, Martin 25. 10. 2026: „Žádná cesta
  // nemůže existovat jen tak sama v prostoru“)
  const underConstruction = (p: RoadPoint): boolean =>
    (building ??= axisDistance(
      (roads.earthworks ?? []).filter((e) => e.constructionId !== undefined).map((e) => e.profile),
    ))(p.x, p.z) <= BUILDING_END_M;
  for (const road of roads.roads) {
    if (road.points.length < 2 || road.abandoned) continue;
    for (const atStart of [true, false]) {
      const p = atStart ? road.points[0]! : road.points[road.points.length - 1]!;
      if ((degrees.get(endKey(p)) ?? 0) !== 1 || isEnd(p)) continue;
      if (road.grade === 'wagon' && underConstruction(p)) continue;
      // opuštěný kus (jen bledne) cílem napojení není – díra se zacelí k živé cestě za ním
      const others = roads.roads.map((r) => (r === road || r.abandoned ? { ...r, points: [] } : r));
      const hit = nearestOnRoads(others, p.x, p.z);
      // ne zpět do uzlu, ze kterého úsek vychází – vznikl by okruh (krátká odbočka tam a zpět)
      const own = atStart ? road.points[road.points.length - 1]! : road.points[0]!;
      if (hit && length2(hit.point.x - own.x, hit.point.z - own.z) <= END_SNAP_M) continue;
      if (hit && hit.distance <= JOIN_GAP_M) return { road, atStart, hit };
    }
  }
  return null;
}

/**
 * Díry mezi úseky se zacelí (mutuje – roads.md, Úseky a rozcestí): volný konec úseku, který není
 * u brány domu ani u cíle (trasa tudy pokračuje – `isEnd`) a leží do JOIN_GAP_M od
 * jiného úseku, se k němu napojí spojovacím kusem osy – do jeho konce (blíž než END_SNAP_M), jinak
 * do nejbližšího bodu osy, kde se ten úsek rozdělí (rozcestí). Uzel je pak společný – falešné
 * rozcestí spojí `mergeRoadChains`. Mokřina a brody napojeného úseku se určí znovu z terénu.
 * Vrátí, jestli něco napojil.
 */
function joinRoadGaps(
  roads: VillageRoads,
  isEnd: (p: RoadPoint) => boolean,
  context: SpotContext,
): boolean {
  let joined = false;
  for (let guard = roads.roads.length * 2; guard > 0; guard--) {
    const gap = firstGap(roads, isEnd);
    if (!gap) break;
    const other = roads.roads[gap.hit.road]!;
    const first = other.points[0]!;
    const last = other.points[other.points.length - 1]!;
    const near = (q: RoadPoint): boolean =>
      length2(gap.hit.point.x - q.x, gap.hit.point.z - q.z) <= END_SNAP_M;
    const at = near(first)
      ? { ...first }
      : near(last)
        ? { ...last }
        : splitRoad(roads, gap.hit, context);
    const { road } = gap;
    road.points = gap.atStart ? [at, ...road.points] : [...road.points, at];
    road.ground = roadGroundOf(road.points, context.terrain);
    delete road.lined;
    joined = true;
  }
  return joined;
}

/**
 * Které konce úseků jsou skutečné volné konce (`Road.openEnds` – pás cesty se tam ve scéně
 * vytrácí): konec, ve kterém nekončí jiný úsek, u brány domu nebo cíle (`termini`). Konec, kde
 * trasa pokračuje pěšinou dne, a rozcestí volné nejsou (mutuje).
 */
export function markRoadEnds(roads: VillageRoads, isEnd: (p: RoadPoint) => boolean): void {
  const degrees = endDegrees(roads.roads);
  const open = (p: RoadPoint): boolean => (degrees.get(endKey(p)) ?? 0) === 1 && isEnd(p);
  for (const road of roads.roads) {
    if (road.points.length < 2 || road.abandoned) continue;
    road.openEnds = [open(road.points[0]!), open(road.points[road.points.length - 1]!)];
  }
}

/**
 * Zacelí díry a spojí falešná rozcestí na samotných úsecích (vývojová ukázka a testy – bez stavu
 * vsi): `termini` – skutečné konce tras (brány, cíle), `terrain` – terén pro mokřinu a brody
 * napojených úseků. Vrátí nové úseky s volnými konci (`openEnds`), vstup nemění.
 */
export function joinedRoadsOf(
  list: readonly Road[],
  termini: readonly RoadPoint[],
  terrain: PathTerrain,
): Road[] {
  const roads: VillageRoads = {
    nextId: list.reduce((max, r) => Math.max(max, r.id), 0) + 1,
    roads: cloneState([...list]),
    trees: [],
    labor: { from: 0, days: 0, shares: [] },
  };
  tidyRoads(roads, [], termini, {
    terrain,
    blocked: () => false,
    layer: null,
    changes: { removed: [], stumps: [], saplings: [] },
    seed: 0,
    split: () => undefined,
  });
  return roads.roads;
}
