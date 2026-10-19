// VÝVOJOVÝ NÁSTROJ – ukázka vozové sítě na svahu vedle pěšin na /dev/landscape (bez databáze
// a simulace; wagons.md – Vozová síť a vyjeté cesty). Kousek od vsi se najde svah, který pěšák
// vyjde rovně a vůz ne (sklon 14–30 %): dole obydlí a ohrada se spřežením (tam stojí vůz),
// nahoře díl pole na úhoru, kam se chodí pracovat. Trasu vozu spočítá herní jádro (`cartRoutes` –
// stejná funkce jako vozová síť vsi) a ukáže se jako vozová cesta (dvě koleje); pěšinu na pole
// počítá scéna jako vždy – ve svahu jde rovně, vozová cesta serpentinami.
import {
  CART_ROUTES,
  cartObstacleMask,
  cartRoutes,
  pathTerrainOf,
  pathWindowFor,
  surfaceAt,
  tileCenterWorld,
  type CartKind,
  type Landscape,
  type ObstacleLayer,
  type PathVillage,
} from '@bohemia/game';
import type { SceneRoad, SceneVillage } from '@/lib/village-view';

/**
 * Svah, který se hledá: sklon přímo (pěšák) aspoň o desetinu nad mezí vozu a převýšení (m).
 * Krajiny hry jsou mírné (scéna terén převyšuje 3×) – nejprudší louky bývají 700–1400 m od místa
 * vsi, proto se hledá po celé mapě nejprudší louka (při shodě nejblíž vsi).
 */
const SLOPE = { over: 1.1, riseM: 5 } as const;

export interface CartDemo {
  /** Vůz ukázky; `none` – jen pěšina (vozová cesta ještě není). */
  kind: CartKind | 'none';
  dwellings: SceneVillage['dwellings'];
  pens: NonNullable<SceneVillage['pens']>;
  field: SceneVillage['fields'][number];
  roads: SceneRoad[];
  labor: NonNullable<SceneVillage['labor']>;
  focus: { x: number; z: number };
  /** Popis pro lištu – délka trasy vozu a pěšky. */
  note: string;
}

/**
 * Ukázka: nejprudší louka mapy (dole obydlí a ohrada, nahoře díl pole),
 * trasa vozu `kind` ze stejné funkce jádra jako vozová síť vsi. Bez vhodného svahu null.
 */
export function demoCartSlope(
  l: Landscape,
  layer: ObstacleLayer,
  kind: CartKind | 'none',
  ids: { dwelling: number; pen: number; field: number; road: number },
): CartDemo | null {
  const height = (x: number, y: number): number => l.heights[y * l.size + x]!;
  const meadow = (x: number, y: number): boolean =>
    x >= 1 && y >= 1 && x < l.size - 1 && y < l.size - 1 && surfaceAt(l, x, y) === 'meadow';
  const site = l.villageSite;
  let best: {
    bottom: [number, number];
    top: [number, number];
    grade: number;
    distance: number;
  } | null = null;
  // dvojice políček 3–5 políček od sebe (45–75 m) ve 4 směrech, louka po celé délce
  for (let by = 1; by < l.size - 1; by++) {
    for (let bx = 1; bx < l.size - 1; bx++) {
      if (!meadow(bx, by)) continue;
      for (const [sx, sy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        for (const span of [3, 4, 5]) {
          const tx = bx + sx * span;
          const ty = by + sy * span;
          if (!meadow(tx, ty)) continue;
          let clear = true;
          for (let k = 1; k < span; k++) {
            if (!meadow(bx + sx * k, by + sy * k)) clear = false;
          }
          // dole i nahoře kus roviny na stavby
          if (!clear || !meadow(bx - sx, by - sy)) continue;
          const rise = height(tx, ty) - height(bx, by);
          const grade = rise / (span * l.cellSizeM);
          if (grade < CART_ROUTES.maxGrade * SLOPE.over || rise < SLOPE.riseM) continue;
          const distance = Math.abs(bx - site.x) + Math.abs(by - site.y);
          if (
            !best ||
            grade > best.grade + 1e-9 ||
            (grade > best.grade - 1e-9 && distance < best.distance)
          ) {
            best = { bottom: [bx, by], top: [tx, ty], grade, distance };
          }
        }
      }
    }
  }
  if (!best) return null;
  const [bx, by] = best.bottom;
  const [tx, ty] = best.top;
  const sx = Math.sign(tx - bx);
  const sy = Math.sign(ty - by);
  const bottom = tileCenterWorld(l, bx, by);
  // pod svahem obydlí a vedle něj ohrada se spřežením, nahoře díl na úhoru
  const houseAt = tileCenterWorld(l, bx - sx, by - sy);
  const penCell = { x: bx - sx + sy, y: by - sy + sx };
  const penAt = tileCenterWorld(l, penCell.x, penCell.y);
  const top = tileCenterWorld(l, tx, ty);
  const dwellings: SceneVillage['dwellings'] = [
    {
      id: ids.dwelling,
      type: 'zemnice',
      position: { x: houseAt.x, z: houseAt.z, rotation: Math.atan2(sx, sy) },
      built: true,
      progress: 1,
      inhabited: true,
    },
  ];
  const pens: NonNullable<SceneVillage['pens']> = [
    {
      id: ids.pen,
      cell: penCell,
      x: penAt.x,
      z: penAt.z,
      size: l.cellSizeM,
      built: true,
      progress: 1,
      oxen: 2,
      trainees: 0,
      cows: 0,
    },
  ];
  const field: SceneVillage['fields'][number] = {
    id: ids.field,
    parts: [
      {
        cell: { x: tx, y: ty },
        x: top.x,
        z: top.z,
        size: l.cellSizeM,
        stage: 'young-fallow',
      },
    ],
  };
  const village: PathVillage = { dwellings, fields: [field], pens };
  const margin = 150;
  const terrain = pathTerrainOf(
    l,
    pathWindowFor(l, {
      minX: Math.min(bottom.x, top.x) - margin,
      minZ: Math.min(bottom.z, top.z) - margin,
      maxX: Math.max(bottom.x, top.x) + margin,
      maxZ: Math.max(bottom.z, top.z) + margin,
    }),
  );
  const blocked = cartObstacleMask(terrain, layer);
  const { routes } = cartRoutes({
    village,
    terrain,
    blocked,
    kind: kind === 'none' ? 'two-wheel' : kind,
    depots: [{ x: penAt.x, z: penAt.z }],
    targets: [{ x: top.x, z: top.z, reachM: 9 }],
  });
  const route = routes[0]!;
  const direct = Math.hypot(top.x - penAt.x, top.z - penAt.z);
  const roads: SceneRoad[] =
    route.reached && kind !== 'none'
      ? [
          {
            id: ids.road,
            points: route.points.map((p) => ({ x: p.x, z: p.z })),
            grade: 'trodden',
            cart: true,
            openEnds: [true, true],
          },
        ]
      : [];
  return {
    kind,
    dwellings,
    pens,
    field,
    roads,
    labor: {
      day: 0,
      month: 7,
      people: { children: 0, adults: 6, elders: 0 },
      shares: [{ activity: 'weed', target: { kind: 'field', id: ids.field }, manDays: 6 }],
    },
    focus: { x: (bottom.x + top.x) / 2, z: (bottom.z + top.z) / 2 },
    note:
      kind === 'none'
        ? `jen pěšina (přímo ${Math.round(direct)} m)`
        : route.reached
          ? `${kind === 'two-wheel' ? 'dvoukolák' : 'čtyřkolák'} ${Math.round(route.lengthM)} m (přímo ${Math.round(direct)} m)`
          : 'vůz nevyjede',
  };
}
