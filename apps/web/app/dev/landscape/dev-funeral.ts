// VÝVOJOVÝ NÁSTROJ – ukázka pohřbu na /dev/landscape (bez databáze a simulace; cemetery.md –
// Pohřeb ve scéně, scene/funeral-plan.ts): obydlí zemřelého u středu vsi a hřbitov o jednom
// čtverci kus od něj na louce; průvod vyjde od vchodu, jde k brance a k hranici, hranice hoří, lidé
// stojí v kruhu, druhý den uhlíky dohasínají a nasype se mohyla. Den ukázky je zkrácený
// (FUNERAL_DEMO_DAY_MS); posuvník v ukázce posouvá okamžik obřadu (`windowAt`).
import {
  MOUND_SIZES,
  gravePlaceCenter,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
} from '@bohemia/game';
import type { SceneFuneral, SceneMourner } from '@/lib/funeral-view';
import type { SceneLabor, SceneVillage } from '@/lib/village-view';

/** Den ukázky (ms) – zkrácený herní den, ať je obřad celý za ≈ 2 minuty. */
export const FUNERAL_DEMO_DAY_MS = 30_000;
/** Herní den pohřbu v ukázce (rozdělení práce je téhož dne). */
const DEMO_DAY = 200_000;
/** Hřbitov ukázky leží tolik políček od středu vsi (≈ 45 m). */
const CEMETERY_TILES = 3;
const IDS = { dwelling: 9_300_001, neighbour: 9_300_002, cemetery: 9_300_003 } as const;

export interface FuneralDemo {
  /** Za vojvodu jde celá ves (nejvíc lidí). */
  voivode: boolean;
  dwellings: SceneVillage['dwellings'];
  cemetery: NonNullable<SceneVillage['cemeteries']>[number];
  funeral: SceneFuneral;
  labor: SceneLabor;
  focus: { x: number; z: number };
}

/**
 * Ukázkový pohřeb u středu vsi: obydlí zemřelého a soused, hřbitov na louce tři políčka daleko
 * (směr s nejvíc loukou). `voivode` – pohřeb vojvody (celá ves), jinak hlava rodiny.
 */
export function demoFuneral(l: Landscape, voivode: boolean): FuneralDemo {
  const center = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const meadow = (x: number, z: number): boolean => {
    const tile = tileOfWorldPoint(l, x, z);
    return tile !== null && surfaceAt(l, tile.x, tile.y) === 'meadow';
  };
  // směr k hřbitovu: osa mřížky, kde je políčko hřbitova i cesta k němu na louce
  const size = l.cellSizeM;
  let dir = { x: 1, y: 0 };
  let best = -1;
  for (const d of [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ]) {
    let score = 0;
    for (let k = 1; k <= CEMETERY_TILES + 1; k++) {
      if (meadow(center.x + d.x * k * size, center.z + d.y * k * size)) score++;
    }
    if (score > best) {
      best = score;
      dir = d;
    }
  }
  const cell = {
    x: l.villageSite.x + dir.x * CEMETERY_TILES,
    y: l.villageSite.y + dir.y * CEMETERY_TILES,
  };
  const square = tileCenterWorld(l, cell.x, cell.y);
  const cemetery: FuneralDemo['cemetery'] = {
    id: IDS.cemetery,
    squares: [{ cell, x: square.x, z: square.z, size }],
    built: true,
    progress: 1,
    graves: 6,
  };
  // obydlí zemřelého vchodem k hřbitovu, soused vedle
  const toCemetery = Math.atan2(square.x - center.x, square.z - center.z);
  const side = { x: -dir.y, z: dir.x };
  const dwellings: FuneralDemo['dwellings'] = [
    {
      id: IDS.dwelling,
      type: 'zemnice',
      position: { x: center.x, z: center.z, rotation: toCemetery },
      built: true,
      progress: 1,
      inhabited: true,
    },
    {
      id: IDS.neighbour,
      type: 'zemnice',
      position: { x: center.x + side.x * 14, z: center.z + side.z * 14, rotation: toCemetery },
      built: true,
      progress: 1,
      inhabited: true,
    },
  ];
  const sizeOf = voivode ? 'great' : 'large';
  const { columns, rows } = MOUND_SIZES[sizeOf];
  const place = gravePlaceCenter(square, size, undefined, 2, 3, columns, rows);
  const count = voivode ? 30 : 14;
  const mourners: SceneMourner[] = Array.from({ length: count }, (_, i) => ({
    sex: i % 3 === 1 ? 'male' : 'female',
    age: [36, 33, 9, 62, 21, 15, 47, 6, 40, 27][i % 10]!,
    home: i < 5 ? IDS.dwelling : IDS.neighbour,
  }));
  const funeral: SceneFuneral = {
    key: `${IDS.cemetery}:${cell.x}:${cell.y}:2:3`,
    cemeteryId: IDS.cemetery,
    cell,
    column: 2,
    row: 3,
    size: sizeOf,
    rank: voivode ? 'voivode' : 'head',
    day: DEMO_DAY,
    x: place.x,
    z: place.z,
    from: IDS.dwelling,
    mourners,
  };
  return {
    voivode,
    dwellings,
    cemetery: { ...cemetery, mounds: [{ cell, column: 2, row: 3, size: sizeOf, fresh: true }] },
    funeral,
    labor: {
      day: DEMO_DAY,
      month: 7,
      people: { children: 3, adults: 8, elders: 2 },
      shares: [{ activity: 'domestic', target: { kind: 'village' }, manDays: 2 }],
    },
    focus: { x: center.x, z: center.z },
  };
}

/**
 * Okna dnů ukázky tak, aby okamžik `nowMs` byl `offsetMs` po začátku dne pohřbu (posuvník
 * obřadu); den ukázky trvá FUNERAL_DEMO_DAY_MS.
 */
export function windowAt(
  nowMs: number,
  offsetMs: number,
): (day: number) => { startMs: number; endMs: number } {
  const start = nowMs - offsetMs;
  return (day) => ({
    startMs: start + (day - DEMO_DAY) * FUNERAL_DEMO_DAY_MS,
    endMs: start + (day - DEMO_DAY + 1) * FUNERAL_DEMO_DAY_MS,
  });
}
