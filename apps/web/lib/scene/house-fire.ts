// Hořící domy v den požáru (disasters.md – Požár, Ve scéně) bez Babylonu: plameny jako oheň
// pálení paseky (clearing-fire-renderer.ts – jiný rozvrh a větší tvar), hustý dým jako dým vsi
// (village-smoke.ts – druh `house-fire`). Kdy dům hoří, určuje `houseFireState` podle herního
// dne – deterministicky, ne náhodou za snímku.
import type { SceneFire } from '../village-view';
import type { HeapFire } from './clearing-fire';
import type { FireKind } from './clearing-fire-renderer';
import type { FireShape } from './pyre-fire';
import { houseFireState } from './smoke-schedule';

/** Nejvýš tolik hořících staveb s plameny (ostatní jen kouří) – návrh Clauda. */
export const MAX_BURNING_HOUSES = 12;
/** Ohňů na stavbu – podél hřebene střechy. */
const FIRES_PER_HOUSE = 2;
/** Plamenů a jisker jednoho ohně – víc než hromada větví (10 a 5). */
const HOUSE_FLAMES = 14;
const HOUSE_SPARKS = 6;
const HOUSE_FIRE_SPRITES = HOUSE_FLAMES + HOUSE_SPARKS + 1;
/** Půl délky stavby podél hřebene (m) a velikost ohně – dvorec je větší. */
const HOUSE_HALF_M = {
  zemnice: 1.6,
  polozemnice: 1.9,
  srub: 1.9,
  dvorec: 3,
  'dvorec-srub': 3,
} as const;
const HOUSE_FIRE_SCALE = {
  zemnice: 1.7,
  polozemnice: 1.9,
  srub: 1.9,
  dvorec: 2.4,
  'dvorec-srub': 2.4,
} as const;
/** Semínko spritů – odliší ohně domů od hromad paseky. */
const SEED_BASE = 7_000_000;

/** Tvar ohně hořící stavby velikosti `scale`: plameny nad střechou, vyšší než lidé u ní. */
export function houseFireShape(scale: number): FireShape {
  return {
    lengthM: 2.2 * scale,
    widthM: 1.8 * scale,
    heightM: 1.2 * scale,
    flames: HOUSE_FLAMES,
    sparks: HOUSE_SPARKS,
    scale: 1.5 * scale,
  };
}

/**
 * Ohně hořících staveb dne požáru: po dvou podél hřebene; pořadí v šíření `order` (0 = tady
 * chytlo, ostatní podle pořadí v zápisu kroniky). Nejvýš MAX_BURNING_HOUSES staveb.
 */
export function houseFires(fire: SceneFire | undefined): HeapFire[] {
  if (!fire) return [];
  const houses = fire.burning.slice(0, MAX_BURNING_HOUSES);
  return houses.flatMap((house, i) => {
    const order = spreadOrder(fire, house, i);
    const half = HOUSE_HALF_M[house.type];
    // hřeben střechy míří podél osy z pozemku (vpředu −z) – natočený o `rotation`
    const ax = Math.sin(house.rotation);
    const az = Math.cos(house.rotation);
    return Array.from({ length: FIRES_PER_HOUSE }, (_, k): HeapFire => {
      // rovnoměrně podél hřebene, kousek od štítů
      const u = (k / (FIRES_PER_HOUSE - 1) - 0.5) * 2 * half * 0.6;
      return {
        x: house.x + ax * u,
        z: house.z + az * u,
        yaw: Math.atan2(az, ax),
        scale: HOUSE_FIRE_SCALE[house.type],
        square: `house:${house.id}`,
        seed: SEED_BASE + house.id * 4 + k,
        order,
        burn: { burnedDay: fire.day, order },
      };
    });
  });
}

/** Klíč ohňů požáru – mění se jen s dnem a hořícími stavbami. */
export function houseFireKey(fire: SceneFire | undefined): string {
  if (!fire) return '';
  return `${fire.day}|${fire.burning.map((b) => `${b.id}:${b.x}:${b.z}`).join(',')}`;
}

/** Hořící dům rendererem ohně paseky – vlastní rozvrh (`houseFireState`) a tvar. */
export function houseFireKind(dayAt?: (nowMs: number) => number): FireKind {
  return {
    name: 'house-fire',
    capacity: MAX_BURNING_HOUSES * FIRES_PER_HOUSE * HOUSE_FIRE_SPRITES,
    shape: houseFireShape,
    state: (heap, gameDay) =>
      houseFireState(heap.burn.burnedDay ?? Math.floor(gameDay), gameDay, heap.order),
    ...(dayAt ? { dayAt } : {}),
  };
}

/** Sloupce dýmu hořících staveb: ze středu stavby, po jednom na stavbu (všechny stavby). */
export function houseFirePlumes(
  fire: SceneFire | undefined,
): { id: number; x: number; z: number; order: number; day: number }[] {
  if (!fire) return [];
  return fire.burning.map((house, i) => ({
    id: house.id,
    x: house.x,
    z: house.z,
    order: spreadOrder(fire, house, i),
    day: fire.day,
  }));
}

/** Pořadí stavby v šíření 0–1: kde chytlo 0, ostatní podle pořadí v zápisu kroniky. */
function spreadOrder(fire: SceneFire, house: SceneFire['burning'][number], i: number): number {
  if (house.started) return 0;
  return Math.min(1, Math.max(1, i) / Math.max(1, fire.burning.length - 1));
}
