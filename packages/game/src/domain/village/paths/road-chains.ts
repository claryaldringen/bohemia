import type { Road, RoadPoint } from '../types';

// Cesta pro hráče (roads.md – Cesta pro hráče; Martin, 19. 10. 2026, Vlkov: „tohle by rozhodně
// neměly být dvě cesty, ale měly by se spojit do jedné“): řetěz úseků mezi skutečnými rozcestími
// (aspoň tři konce v uzlu) a volnými konci – bez ohledu na stupeň a příznak vozová. Data zůstávají
// po úsecích (stupeň, mokřina, brody, vylepšení), řetěz je jen pohled: výběr, panel, vylepšení
// a jabloně celé cesty. Stejný stupeň se dál spojuje do jednoho úseku (`mergeRoadChains`). Čistá
// funkce os – stejně na serveru i v prohlížeči.

/**
 * Druh cesty pro hráče (roads.md – Druhy cest; wagons.md – Vyježděná cesta; Martin, 19. 10. 2026:
 * „pokud nějakou cestu vyjezdí vůz, bude to vyježděná cesta“): vyšlapaná, vyježděná (vyšlapaná
 * s příznakem vozová – `Road.cart`), upravená, hať a lávka. Upravená cesta a hať jsou víc než
 * vyježděná – vozy po nich jezdí (koleje ve scéně), ale druh zůstane. V datech zůstává stupeň
 * a příznak (stupeň řídí chůzi a vylepšení), druh je jen pohled. Vozová cesta (roads.md –
 * Vozová cesta) je vlastní druh i stupeň.
 */
export type RoadKind = 'trodden' | 'cart' | 'improved' | 'causeway' | 'wagon';

/** Pořadí druhů cest v panelu – od vyšlapané po vozovou cestu. */
export const ROAD_KIND_ORDER: readonly RoadKind[] = [
  'trodden',
  'cart',
  'improved',
  'causeway',
  'wagon',
];

/** Druh úseku pro hráče: vyšlapaný s vozy je vyježděný, jinak podle stupně. */
export function roadKind(road: Pick<Road, 'grade' | 'cart'>): RoadKind {
  return road.grade === 'trodden' && road.cart ? 'cart' : road.grade;
}

/** Úsek, jak ho řetěz potřebuje – id a osa. */
export interface ChainRoad {
  id: number;
  points: readonly RoadPoint[];
  /** Opuštěný kus (pod stavbou) není součástí řetězu. */
  abandoned?: true | undefined;
}

/** Úsek v řetězu a jestli jde proti směru své osy (`reversed`). */
export interface ChainLink<R extends ChainRoad = ChainRoad> {
  road: R;
  reversed: boolean;
}

function endKey(p: RoadPoint): string {
  return `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
}

/**
 * Řetěz úseku `roadId`: úseky navazující v uzlech, kde končí právě dva úseky, v pořadí podél
 * cesty. Začíná na tom konci řetězu (rozcestí nebo volný konec), kde je úsek s menším id – u okruhu
 * úsekem s nejmenším id po směru jeho osy –, takže je stejný, ať se vybere kterýkoli jeho úsek.
 * Bez úseku prázdný.
 */
export function roadChain<R extends ChainRoad>(
  roads: readonly R[],
  roadId: number,
): ChainLink<R>[] {
  const valid = roads.filter((r) => r.points.length >= 2 && !r.abandoned);
  const start = valid.find((r) => r.id === roadId);
  if (!start) return [];
  const ends = new Map<string, R[]>();
  for (const road of valid) {
    for (const p of [road.points[0]!, road.points[road.points.length - 1]!]) {
      const key = endKey(p);
      const list = ends.get(key);
      if (list) list.push(road);
      else ends.set(key, [road]);
    }
  }
  const first = (r: R): RoadPoint => r.points[0]!;
  const last = (r: R): RoadPoint => r.points[r.points.length - 1]!;
  /** Úsek, který navazuje na `road` v bodě `at` (uzel právě dvou konců), jinak null. */
  const next = (road: R, at: RoadPoint): R | null => {
    const list = ends.get(endKey(at)) ?? [];
    if (list.length !== 2) return null;
    const other = list[0] === road ? list[1]! : list[0]!;
    return other === road ? null : other;
  };
  // zpět ke kraji řetězu: konec, ve kterém nenavazuje jiný úsek (nebo kruh)
  let head = start;
  let headReversed = false;
  const seen = new Set<number>([start.id]);
  let loop = false;
  for (;;) {
    const at: RoadPoint = headReversed ? last(head) : first(head);
    const prev: R | null = next(head, at);
    if (!prev) break;
    if (seen.has(prev.id)) {
      loop = true;
      break;
    }
    seen.add(prev.id);
    // předchozí úsek končí v `at` – jde po své ose, když jeho konec je `at`
    headReversed = endKey(first(prev)) === endKey(at);
    head = prev;
  }
  if (loop) {
    // okruh: od úseku s nejmenším id po směru jeho osy
    const members = [...seen].map((id) => valid.find((r) => r.id === id)!);
    head = members.reduce((a, b) => (b.id < a.id ? b : a));
    headReversed = false;
  }
  const chain: ChainLink<R>[] = [];
  const used = new Set<number>();
  let road: R | null = head;
  let reversed = headReversed;
  while (road && !used.has(road.id)) {
    used.add(road.id);
    chain.push({ road, reversed });
    const at: RoadPoint = reversed ? first(road) : last(road);
    const after: R | null = next(road, at);
    if (!after) break;
    reversed = endKey(last(after)) === endKey(at);
    road = after;
  }
  // od kraje s menším id úseku – stejné pořadí, ať se vybere kterýkoli úsek
  if (!loop && chain.length > 1 && chain[chain.length - 1]!.road.id < chain[0]!.road.id) {
    return chain.reverse().map((link) => ({ road: link.road, reversed: !link.reversed }));
  }
  if (!loop && chain.length === 1) chain[0]!.reversed = false;
  return chain;
}

/** Všechny řetězy (každý úsek v právě jednom), v pořadí prvního úseku. */
export function roadChains<R extends ChainRoad>(roads: readonly R[]): ChainLink<R>[][] {
  const done = new Set<number>();
  const out: ChainLink<R>[][] = [];
  for (const road of roads) {
    if (done.has(road.id) || road.points.length < 2 || road.abandoned) continue;
    const chain = roadChain(roads, road.id);
    for (const link of chain) done.add(link.road.id);
    out.push(chain);
  }
  return out;
}

/** Id úseků řetězu úseku `roadId` v pořadí podél cesty. */
export function roadChainIds(roads: readonly ChainRoad[], roadId: number): number[] {
  return roadChain(roads, roadId).map((link) => link.road.id);
}
