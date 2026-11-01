// Dobytek v karavaně výpravy (docs/design/trade.md – Dobytek ve třech druzích, Ve scéně; Martin
// 20. 10. 2026: „s dobytkem by také mělo jít obchodovat. Představuju si tři kategorie - krávy,
// mladé voly (musí se vycvičit) a vycvičené voly“): krávy a voli jdou po zemské stezce po svých
// s karavanou – tam prodaní, zpátky koupení – na místech zástupu z caravan.ts (týž rozvrh ve
// skutečném čase jako lidé, tempem volů). Kreslí je stádo vsi (livestock.ts) modelem krávy – vůl je o kus větší.
// Čisté funkce bez Babylonu.
import type { SceneExpedition } from '../village-view';
import {
  caravanHead,
  caravanTimeline,
  caravanPlan,
  caravanPoints,
  memberSpot,
  waitingOffset,
  type CaravanAnimal,
  type DayWindow,
} from './caravan';
import { LIVESTOCK_EPOCH_MS, type LivestockClock, type LivestockPose } from './livestock-motion';
import { alongRoute, createVillagerPose, route, type Route } from './villager-motion';

/** Délka kroku krávy (m – jako chůze stáda, livestock-motion GAIT) – vůl kráčí s měřítkem. */
const STRIDE_M = 1.5;
/** Vůl je o kus větší než kráva (model krávy z 0 A.D.). */
export const CARAVAN_OX_SCALE = 1.15;
/** Okraj obalu stezky pro ořez (m). */
const AREA_MARGIN_M = 12;

/** Dobytek jedné výpravy: stezka, kdo jde tam a zpátky a obal stezky. */
export interface CaravanHerd {
  key: string;
  expedition: SceneExpedition;
  path: Route;
  start: { x: number; z: number };
  /** Směr prvního úseku stezky (jednotkový) – hlouček u začátku stezky stojí proti němu. */
  first: { x: number; z: number };
  columns: { out: number; back: number };
  animals: {
    leg: 'out' | 'back';
    animal: CaravanAnimal;
    /** Pořadí v hloučku u začátku stezky – za lidmi zástupu. */
    waitIndex: number;
  }[];
  area: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/**
 * Dobytek karavan výprav vsi (jen výpravy s dobytkem a stezkou nebo čárou krajinou). Bez výprav
 * prázdné.
 */
export function caravanHerds(village: {
  expeditions?: readonly SceneExpedition[];
  trails?: readonly { id: number; points: readonly { x: number; z: number }[] }[];
}): CaravanHerd[] {
  const out: CaravanHerd[] = [];
  for (const e of village.expeditions ?? []) {
    if (!e.cattle) continue;
    const points = caravanPoints(e, village.trails);
    if (points.length < 2) continue;
    const plan = caravanPlan(e);
    const animals = (['out', 'back'] as const).flatMap((leg) =>
      plan[leg].animals.map((animal, i) => ({
        leg,
        animal,
        waitIndex: plan[leg].members.length + i,
      })),
    );
    if (animals.length === 0) continue;
    const [x0, z0] = [points[0]!.x, points[0]!.z];
    const dx = points[1]!.x - x0;
    const dz = points[1]!.z - z0;
    const d = Math.max(1e-6, Math.hypot(dx, dz));
    const xs = points.map((p) => p.x);
    const zs = points.map((p) => p.z);
    out.push({
      key: `${e.id}:${e.startDay ?? e.day}`,
      expedition: e,
      path: route(points.map((p) => [p.x, p.z] as const)),
      start: { x: x0, z: z0 },
      first: { x: dx / d, z: dz / d },
      columns: { out: plan.out.length, back: plan.back.length },
      animals,
      area: {
        minX: Math.min(...xs) - AREA_MARGIN_M,
        maxX: Math.max(...xs) + AREA_MARGIN_M,
        minZ: Math.min(...zs) - AREA_MARGIN_M,
        maxZ: Math.max(...zs) + AREA_MARGIN_M,
      },
    });
  }
  return out;
}

const scratch = createVillagerPose();

/**
 * Kde je kus `index` dobytka výpravy v okamžiku `clock` (do `out`): na stezce za čelem karavany
 * (krok podle ušlé dráhy), v hloučku u začátku stezky (stojí), nebo není vidět (karavana jde
 * druhým směrem, je za krajem mapy) – pak vrátí false.
 */
export function caravanAnimalPose(
  herd: CaravanHerd,
  index: number,
  window: DayWindow | null,
  clock: LivestockClock,
  out: LivestockPose,
): boolean {
  const { leg, animal, waitIndex } = herd.animals[index]!;
  const e = herd.expedition;
  const L = herd.path.length;
  const nowMs = clock.seconds * 1000 + LIVESTOCK_EPOCH_MS;
  out.stride = 0;
  out.head = 0;
  out.x = herd.start.x;
  out.z = herd.start.z;
  out.forwardX = herd.first.x;
  out.forwardZ = herd.first.z;
  // ve skutečném čase od dne, kdy cesta začala (caravan.ts) – bez okna se nekreslí
  if (!window) return false;
  const head = caravanHead(caravanTimeline(e, window, L, herd.columns), nowMs, L, herd.columns);
  if (head.leg !== leg) return false;
  const spot = memberSpot(head, animal.behind, L, waitIndex);
  if (!spot.visible) return false;
  if (spot.waiting !== null) {
    const w = waitingOffset(spot.waiting);
    out.x = herd.start.x - herd.first.x * w.back - herd.first.z * w.side;
    out.z = herd.start.z - herd.first.z * w.back + herd.first.x * w.side;
    // dobytek u začátku stezky se pase
    out.head = 1;
    return true;
  }
  alongRoute(herd.path, spot.s, leg === 'back', scratch);
  out.x = scratch.x - scratch.headingZ * animal.side;
  out.z = scratch.z + scratch.headingX * animal.side;
  out.forwardX = scratch.headingX;
  out.forwardZ = scratch.headingZ;
  const scale = animal.kind === 'ox' ? CARAVAN_OX_SCALE : 1;
  out.stride = head.speed > 0 ? Math.sin((2 * Math.PI * spot.s) / (STRIDE_M * scale)) : 0;
  return true;
}

/** Klíč dobytka karavan – rozmístění se přepočítá, jen když se změní výpravy s dobytkem. */
export function caravanHerdsKey(herds: readonly CaravanHerd[]): string {
  return JSON.stringify(
    herds.map((h) => [
      h.key,
      h.expedition.cattle,
      h.expedition.startDay ?? h.expedition.day,
      h.expedition.onMap,
      h.expedition.trailId,
      h.path.length,
    ]),
  );
}
