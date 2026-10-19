// VÝVOJOVÝ NÁSTROJ – ukázka karavany výpravy k sousedovi na /dev/landscape (bez databáze
// a simulace; trade.md – Ve scéně, scene/caravan.ts). Od vsi vede zemská stezka (zkrácená na
// ≈ 260 m, ať je celá v záběru – jejím koncem je „kraj mapy“); karavana jde tam se zbožím
// a s rodinou, která se stěhuje k sousedovi, za koncem stezky zmizí a vrátí se se zbožím a dvěma
// lidmi od souseda (muž a žena). Bez vozu nesou zboží nosiči, s vozem jede náklad na čtyřkoláku
// a vedle jdou jen dva lidé (honák u spřežení a pomocník). Celá výprava trvá „den“ ukázky (90 s).
import { surfaceAt, tileCenterWorld, tileOfWorldPoint, type Landscape } from '@bohemia/game';
import type {
  SceneCart,
  SceneExpedition,
  SceneLabor,
  SceneRoad,
  SceneTrail,
  SceneVillage,
} from '@/lib/village-view';

/** Stezka ukázky: body po 12 m, délka ≈ 260 m, začíná kus od středu vsi. */
const STEP_M = 12;
const POINTS = 23;
const START_M = 14;
/** Jak dlouho ukázková výprava trvá (ms – „den“ ukázky). */
export const CARAVAN_DEMO_MS = 90_000;

export interface CaravanDemo {
  cart: boolean;
  trail: SceneTrail;
  /** Stezka jako upravená pevná cesta (ať je ve scéně vidět, kudy karavana jde). */
  road: SceneRoad;
  expedition: SceneExpedition;
  carts: SceneCart[];
  dwellings: SceneVillage['dwellings'];
  labor: SceneLabor;
  focus: { x: number; z: number };
  /** Okno „dne“ ukázky – výprava projde celá. */
  window: { startMs: number; endMs: number };
}

/**
 * Ukázková karavana od vsi po stezce směrem, kde vede nejvíc po louce; `cart` – náklad na
 * čtyřkoláku, jinak nosiči. Výprava vyrazí v `startMs` a vrátí se za CARAVAN_DEMO_MS.
 */
export function demoCaravan(l: Landscape, cart: boolean, startMs: number): CaravanDemo {
  const center = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const meadow = (x: number, z: number): boolean => {
    const tile = tileOfWorldPoint(l, x, z);
    return tile !== null && surfaceAt(l, tile.x, tile.y) === 'meadow';
  };
  const along = (angle: number): { x: number; z: number }[] =>
    Array.from({ length: POINTS }, (_, k) => {
      const d = START_M + k * STEP_M;
      const bend = 10 * Math.sin((k / (POINTS - 1)) * Math.PI);
      return {
        x: Math.round((center.x + Math.cos(angle) * d - Math.sin(angle) * bend) * 100) / 100,
        z: Math.round((center.z + Math.sin(angle) * d + Math.cos(angle) * bend) * 100) / 100,
      };
    });
  let points = along(0);
  let best = -1;
  for (let k = 0; k < 16; k++) {
    const candidate = along((k / 16) * Math.PI * 2);
    const score = candidate.filter((p) => meadow(p.x, p.z)).length;
    if (score > best) {
      best = score;
      points = candidate;
    }
  }
  const trail: SceneTrail = { id: 9_100_001, direction: 'E', points, built: true };
  const cartId = 9_100_010;
  const expedition: SceneExpedition = {
    id: 1,
    trailId: trail.id,
    // bez vozu 6 nosičů, s vozem jen honák a pomocník (wagons.md – Obchod)
    porters: cart ? 2 : 6,
    carts: cart ? [cartId] : [],
    cartCrew: 2,
    leaving: [
      { sex: 'male', age: 31 },
      { sex: 'female', age: 27 },
      { sex: 'female', age: 6 },
      { sex: 'male', age: 3 },
    ],
    coming: [
      { sex: 'male', age: 22 },
      { sex: 'female', age: 19 },
    ],
    carriesOut: true,
    carriesBack: true,
    progress: 0,
    rate: 1,
    day: 0,
    onMap: 0.8,
  };
  const first = points[0]!;
  const second = points[1]!;
  return {
    cart,
    trail,
    road: { id: 9_100_003, points, grade: 'improved' },
    expedition,
    carts: cart
      ? [
          {
            id: cartId,
            kind: 'four-wheel',
            x: first.x,
            z: first.z,
            condition: 1,
            job: { activity: 'trade', target: { kind: 'trail', id: trail.id }, load: 'goods' },
            route: points,
          },
        ]
      : [],
    dwellings: [
      {
        id: 9_100_002,
        type: 'dvorec',
        position: {
          x: center.x - (second.x - first.x) * 0.4,
          z: center.z - (second.z - first.z) * 0.4,
          rotation: Math.atan2(second.x - first.x, second.z - first.z),
        },
        built: true,
        progress: 1,
        inhabited: true,
      },
    ],
    labor: {
      day: 0,
      month: 7,
      people: { children: 2, adults: 6, elders: 0 },
      shares: [{ activity: 'domestic', target: { kind: 'village' }, manDays: 2 }],
    },
    focus: points[Math.floor(POINTS / 2)]!,
    window: { startMs, endMs: startMs + CARAVAN_DEMO_MS },
  };
}
