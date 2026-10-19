// Pod cestou obilí neroste (fields.md – Co hráč vidí; Martin, 19. 10. 2026: „Vzrostlé obilí
// přerůstá cestu. Tam, kde je cesta, prostě obilí neroste.“). Maska polí pod pásy pevných cest
// a pěšin dne: v pásu 0 (bez trsů, panáků, plevele, koruny porostu i obtisku pole), za jeho
// okrajem do `softM` plynule zpět k 1 – koruna tam klesne k zemi svahem jako na okraji pole.
// Jako maska pod stavbami (building-clearings.ts), jen pro čáry. Pásy jsou ze stejných průřezů
// jako obtisk cesty (`ribbonTrack` v path-ribbon.ts). Čistý modul bez Babylonu, souřadnice světa
// scény v metrech.

/** Kus pásu mezi dvěma průřezy: osa a–b, poloviční šířka a hloubka masky 0–1 na koncích. */
export interface TrackSegment {
  /** Čára, ke které kus patří (podle ní klíče bloků). */
  line: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfA: number;
  halfB: number;
  depthA: number;
  depthB: number;
}

/** Plácek rozcestí – kruh s hloubkou masky. */
export interface TrackDisc {
  line: number;
  x: number;
  z: number;
  radius: number;
  depth: number;
}

/** Pásy jedné vrstvy (pevné cesty, nebo pěšiny dne). */
export interface Track {
  segments: TrackSegment[];
  discs: TrackDisc[];
}

/** Obdélník ve světě. */
export interface TrackBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Maska polí pod pásy – násobek krytí a klíče pro přestavbu bloků polí. */
export interface TrackMask {
  /** Násobek krytí pole v bodě: v pásu 0, do měkkého okraje vrstvy zpět k 1 (podle hloubky). */
  at(x: number, z: number): number;
  /** Zasahuje do obdélníku nějaký pás (i měkkým okrajem)? */
  near(bounds: TrackBounds): boolean;
  /**
   * Klíč pásů, které do obdélníku zasahují (celé čáry) – blok pole se přestaví, jen když se
   * změní; prázdný = žádný pás.
   */
  keyNear(bounds: TrackBounds): string;
}

/** Strana přihrádky prostorového rejstříku (m). */
const BIN_M = 8;

/** Kus masky v rejstříku – úsečka nebo kruh s měkkým okrajem své vrstvy. */
interface Item {
  group: string;
  soft: number;
  segment?: TrackSegment;
  disc?: TrackDisc;
  bounds: TrackBounds;
}

/** Klíč kusu na centimetry (šířka na 2 cm, hloubka na desetiny) – drobné změny bloky nepřestaví. */
function itemKey(item: Item): string {
  const cm = (v: number): number => Math.round(v * 100);
  const half = (v: number): number => Math.round(v * 50);
  const depth = (v: number): number => Math.round(v * 10);
  const s = item.segment;
  if (s) {
    return `${cm(s.ax)},${cm(s.az)},${cm(s.bx)},${cm(s.bz)},${half(s.halfA)},${half(s.halfB)},${depth(s.depthA)},${depth(s.depthB)}`;
  }
  const d = item.disc!;
  return `o${cm(d.x)},${cm(d.z)},${half(d.radius)},${depth(d.depth)}`;
}

/** Násobek krytí od jednoho kusu v bodě (1 = kus bod nezasahuje). */
function itemMask(item: Item, x: number, z: number): number {
  let distance: number;
  let half: number;
  let depth: number;
  if (item.segment) {
    const s = item.segment;
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - s.ax) * dx + (z - s.az) * dz) / l2)) : 0;
    distance = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
    half = s.halfA + (s.halfB - s.halfA) * t;
    depth = s.depthA + (s.depthB - s.depthA) * t;
  } else {
    const d = item.disc!;
    distance = Math.hypot(x - d.x, z - d.z);
    half = d.radius;
    depth = d.depth;
  }
  if (depth <= 0) return 1;
  const ramp = Math.min(1, Math.max(0, (distance - half) / item.soft));
  return 1 - depth * (1 - ramp);
}

function overlaps(a: TrackBounds, b: TrackBounds): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxZ >= b.minZ && a.minZ <= b.maxZ;
}

/**
 * Maska z vrstev pásů – každá s vlastním měkkým okrajem `softM` (m). Bez pásů null (pole se
 * nemaskuje).
 */
export function trackMask(layers: readonly { track: Track; softM: number }[]): TrackMask | null {
  const items: Item[] = [];
  layers.forEach(({ track, softM }, layer) => {
    for (const segment of track.segments) {
      const reach = Math.max(segment.halfA, segment.halfB) + softM;
      items.push({
        group: `${layer}:${segment.line}`,
        soft: softM,
        segment,
        bounds: {
          minX: Math.min(segment.ax, segment.bx) - reach,
          maxX: Math.max(segment.ax, segment.bx) + reach,
          minZ: Math.min(segment.az, segment.bz) - reach,
          maxZ: Math.max(segment.az, segment.bz) + reach,
        },
      });
    }
    for (const disc of track.discs) {
      const reach = disc.radius + softM;
      items.push({
        group: `${layer}:${disc.line}`,
        soft: softM,
        disc,
        bounds: {
          minX: disc.x - reach,
          maxX: disc.x + reach,
          minZ: disc.z - reach,
          maxZ: disc.z + reach,
        },
      });
    }
  });
  const live = items.filter((item) => (item.segment ? true : item.disc!.depth > 0));
  if (live.length === 0) return null;
  // prostorový rejstřík – bod se ptá jen na kusy své přihrádky
  const bins = new Map<string, number[]>();
  const binOf = (v: number): number => Math.floor(v / BIN_M);
  live.forEach((item, index) => {
    for (let i = binOf(item.bounds.minX); i <= binOf(item.bounds.maxX); i++) {
      for (let j = binOf(item.bounds.minZ); j <= binOf(item.bounds.maxZ); j++) {
        const key = `${i},${j}`;
        const list = bins.get(key);
        if (list) list.push(index);
        else bins.set(key, [index]);
      }
    }
  });
  const byGroup = new Map<string, Item[]>();
  for (const item of live) {
    const list = byGroup.get(item.group);
    if (list) list.push(item);
    else byGroup.set(item.group, [item]);
  }
  // klíč čáry podle jejích kusů (ne podle pořadí čar – síť pěšin je může přeházet)
  const groupKeys = new Map<string, string>();
  const groupKey = (group: string): string => {
    let key = groupKeys.get(group);
    if (key === undefined) {
      key = (byGroup.get(group) ?? []).map(itemKey).join(';');
      groupKeys.set(group, key);
    }
    return key;
  };
  const itemsIn = (bounds: TrackBounds): Set<number> => {
    const found = new Set<number>();
    for (let i = binOf(bounds.minX); i <= binOf(bounds.maxX); i++) {
      for (let j = binOf(bounds.minZ); j <= binOf(bounds.maxZ); j++) {
        for (const index of bins.get(`${i},${j}`) ?? []) {
          if (overlaps(live[index]!.bounds, bounds)) found.add(index);
        }
      }
    }
    return found;
  };
  return {
    at(x, z) {
      const list = bins.get(`${binOf(x)},${binOf(z)}`);
      if (!list) return 1;
      let mask = 1;
      for (const index of list) {
        const item = live[index]!;
        const b = item.bounds;
        if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
        mask = Math.min(mask, itemMask(item, x, z));
        if (mask <= 0) return 0;
      }
      return mask;
    },
    near(bounds) {
      return itemsIn(bounds).size > 0;
    },
    keyNear(bounds) {
      const groups = new Set([...itemsIn(bounds)].map((index) => live[index]!.group));
      return [...groups]
        .map((group) => `${group.split(':')[0]}=${groupKey(group)}`)
        .sort()
        .join('|');
    },
  };
}
