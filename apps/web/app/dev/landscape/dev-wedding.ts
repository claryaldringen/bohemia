// VÝVOJOVÝ NÁSTROJ – ukázka svatby na /dev/landscape (bez databáze a simulace; kinship.md –
// Svatba ve scéně, scene/wedding-plan.ts): dům nevěsty u středu vsi, dům ženicha a soused vedle;
// průvod jde k nejbližšímu posvátnému dubu krajiny, ke svatyni ukázky na louce kus od vsi, nevěsta
// z okolí přijde se svými lidmi od kraje mapy, nebo se oddávají u ohniště na návsi (ves bez
// posvátného místa). Den ukázky je zkrácený (WEDDING_DEMO_DAY_MS); posuvník v ukázce posouvá
// okamžik obřadu (`weddingWindowAt`).
import {
  obstaclesOf,
  sacredSitesOf,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
} from '@bohemia/game';
import type { SceneWedding, SceneWeddingGuest } from '@/lib/wedding-view';
import type { SceneLabor, SceneSacred, SceneVillage } from '@/lib/village-view';

/** Den ukázky (ms) – zkrácený herní den. */
export const WEDDING_DEMO_DAY_MS = 30_000;
/** Herní den svatby v ukázce (rozdělení práce je téhož dne). */
const DEMO_DAY = 210_000;
/** Svatyně ukázky stojí tolik metrů od středu vsi (na louce). */
const SHRINE_M = 75;
/** Lidé z okolí přicházejí od kraje mapy ve směru (ukázka – východ). */
const OUTSIDE_DIRECTION = 'E' as const;
const IDS = {
  bride: 9_400_001,
  groom: 9_400_002,
  neighbour: 9_400_003,
  shrine: 9_400_010,
} as const;

export type WeddingDemoKind = 'oak' | 'shrine' | 'outside' | 'green';

export const WEDDING_DEMO_NAMES: Record<WeddingDemoKind, string> = {
  oak: 'u posvátného dubu',
  shrine: 've svatyni',
  outside: 'nevěsta z okolí',
  green: 'na návsi',
};

/** Další ukázka po stisku tlačítka (vypnuto → dub → svatyně → nevěsta z okolí → náves → vypnuto). */
export function nextWeddingDemo(kind: WeddingDemoKind | null): WeddingDemoKind | null {
  const order: (WeddingDemoKind | null)[] = [null, 'oak', 'shrine', 'outside', 'green'];
  return order[(order.indexOf(kind) + 1) % order.length] ?? null;
}

export interface WeddingDemo {
  kind: WeddingDemoKind;
  dwellings: SceneVillage['dwellings'];
  sacred: SceneSacred | null;
  wedding: SceneWedding;
  labor: SceneLabor;
  focus: { x: number; z: number };
}

/** Směr osy mřížky od středu vsi s nejvíc loukou do `reach` metrů. */
function meadowDirection(
  l: Landscape,
  center: { x: number; z: number },
  reach: number,
): { x: number; z: number } {
  const meadow = (x: number, z: number): boolean => {
    const tile = tileOfWorldPoint(l, x, z);
    return tile !== null && surfaceAt(l, tile.x, tile.y) === 'meadow';
  };
  let dir = { x: 1, z: 0 };
  let best = -1;
  for (const d of [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
  ]) {
    let score = 0;
    for (let m = 15; m <= reach + 20; m += 7.5) {
      if (meadow(center.x + d.x * m, center.z + d.z * m)) score++;
    }
    if (score > best) {
      best = score;
      dir = d;
    }
  }
  return dir;
}

/**
 * Ukázková svatba u středu vsi: dům nevěsty, ženicha a soused; místo obřadu podle `kind` (dub –
 * nejbližší posvátný dub krajiny, svatyně na louce, nevěsta z okolí – k dubu, náves – bez
 * posvátného místa).
 */
export function demoWedding(l: Landscape, kind: WeddingDemoKind): WeddingDemo {
  const center = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const dir = meadowDirection(l, center, SHRINE_M);
  const side = { x: -dir.z, z: dir.x };
  const facing = Math.atan2(dir.x, dir.z);
  const dwellings: WeddingDemo['dwellings'] = [
    {
      id: IDS.bride,
      type: 'zemnice',
      position: { x: center.x, z: center.z, rotation: facing },
      built: true,
      progress: 1,
      inhabited: true,
    },
    {
      id: IDS.groom,
      type: 'zemnice',
      position: { x: center.x + side.x * 14, z: center.z + side.z * 14, rotation: facing },
      built: true,
      progress: 1,
      inhabited: true,
    },
    {
      id: IDS.neighbour,
      type: 'zemnice',
      position: { x: center.x - side.x * 14, z: center.z - side.z * 14, rotation: facing },
      built: true,
      progress: 1,
      inhabited: true,
    },
  ];
  let sacred: SceneSacred | null = null;
  if (kind === 'oak' || kind === 'outside') {
    const sites = sacredSitesOf(obstaclesOf(l));
    const oak = [...sites.oaks].sort(
      (a, b) =>
        Math.hypot(a.x - center.x, a.z - center.z) - Math.hypot(b.x - center.x, b.z - center.z),
    )[0];
    if (oak) sacred = { oaks: [{ id: oak.id, x: oak.x, z: oak.z }], groves: [], buildings: [] };
  }
  if (kind === 'shrine' || (sacred === null && kind !== 'green')) {
    const x = center.x + dir.x * SHRINE_M;
    const z = center.z + dir.z * SHRINE_M;
    sacred = {
      oaks: [],
      groves: [],
      buildings: [
        {
          id: IDS.shrine,
          kind: 'shrine',
          // předek (vstup) ke vsi
          position: { x, z, rotation: Math.atan2(center.x - x, center.z - z) },
          built: true,
          progress: 1,
        },
      ],
    };
  }
  const outside = kind === 'outside';
  const half = (l.size * l.cellSizeM) / 2;
  const guests: SceneWeddingGuest[] = Array.from({ length: outside ? 10 : 16 }, (_, i) => ({
    sex: i % 3 === 1 ? 'male' : 'female',
    age: [44, 41, 12, 63, 22, 16, 48, 7, 38, 27][i % 10]!,
    home: i < 5 ? IDS.bride : i < 10 ? IDS.groom : IDS.neighbour,
  }));
  const wedding: SceneWedding = {
    key: `${DEMO_DAY}:0`,
    day: DEMO_DAY,
    bride: outside
      ? {
          age: 19,
          from: null,
          outside: {
            direction: OUTSIDE_DIRECTION,
            edge: { x: half - 12, z: Math.max(-half + 12, Math.min(half - 12, center.z)) },
          },
        }
      : { age: 19, from: IDS.bride },
    groom: { age: 23, from: IDS.groom },
    home: IDS.groom,
    guests: outside
      ? guests.map((g) => (g.home === IDS.bride ? { ...g, home: IDS.groom } : g))
      : guests,
    ...(outside
      ? {
          companions: [
            { sex: 'male' as const, age: 48 },
            { sex: 'female' as const, age: 44 },
            { sex: 'female' as const, age: 15 },
            { sex: 'male' as const, age: 21 },
          ],
        }
      : {}),
  };
  return {
    kind,
    dwellings,
    sacred,
    wedding,
    labor: {
      day: DEMO_DAY,
      month: 6,
      people: { children: 3, adults: 8, elders: 2 },
      shares: [{ activity: 'domestic', target: { kind: 'village' }, manDays: 2 }],
    },
    focus: { x: center.x, z: center.z },
  };
}

/**
 * Okna dnů ukázky tak, aby okamžik `nowMs` byl `offsetMs` po začátku dne svatby (posuvník
 * obřadu); den ukázky trvá WEDDING_DEMO_DAY_MS.
 */
export function weddingWindowAt(
  nowMs: number,
  offsetMs: number,
): (day: number) => { startMs: number; endMs: number } {
  const start = nowMs - offsetMs;
  return (day) => ({
    startMs: start + (day - DEMO_DAY) * WEDDING_DEMO_DAY_MS,
    endMs: start + (day - DEMO_DAY + 1) * WEDDING_DEMO_DAY_MS,
  });
}
