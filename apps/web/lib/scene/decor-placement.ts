import { DECOR_OBSTACLE_LOOKS, type DecorObstacleLook, type Landscape } from '@bohemia/game';
import { createNoise2D } from 'simplex-noise';
import {
  streamStations,
  type StreamCenterline,
  type StreamSample,
  type StreamStation,
} from './stream-geometry';
import type { DecorGroup } from './premium-sites-layout';
import { tileAt } from './tile-at';

/**
 * Drobné modely krajiny: překážky z vrstvy překážek (keře, kameny, skály, souše, padlé stromy,
 * pařezy, vrby – `obstacle-scenery.ts`) a ozdoby vody bez herní funkce (rákos, orobinec,
 * lekníny, kmeny v potoce – tady).
 */
export type DecorModel = DecorObstacleLook | 'reeds' | 'cattails' | 'lilies' | 'log-water';
export const DECOR_MODELS: readonly DecorModel[] = [
  'reeds',
  'cattails',
  'lilies',
  'log-water',
  ...DECOR_OBSTACLE_LOOKS,
];

export interface DecorPlacement {
  model: DecorModel;
  worldX: number;
  worldZ: number;
  rotationY: number;
  scale: number;
  /** Hladina (m, bez převýšení) pro to, co plave na vodě; jinak stojí na terénu. */
  waterLevel?: number;
  /** Id překážky ve vrstvě překážek (ozdoby vody ho nemají). */
  id?: number;
  /**
   * Vlastní skupina (mesh) prémiové krajiny (premium-sites-layout.ts): odstín skály naleziště
   * (`ore` rudný výchoz, `limestone` vápenec lomu – `premiumRockTint`), nebo ozdoba prvku bez id
   * (`site` – mohyla, kamenný kruh, rákosí mokřadu; s překážkami stejného modelu se nemíchá,
   * jinak by mesh přišel o id instancí). Bez údaje mesh modelu jako dřív.
   */
  group?: DecorGroup;
}

/** Krok podél osy potoka (m) pro shluky rákosí a leknínů. */
const REED_STEP_M = 2.5;
const LILY_STEP_M = 6;
/** Pod touto rychlostí proudu je voda „klidná“ – lekníny, hustý rákos a orobinec. */
const CALM_SPEED = 0.35;
/** Kmeny v potoce: krok podél osy (m). */
const LOG_STEP_M = 35;
/** Balvany v korytě u skalní stěny (terén 2): krok podél osy (m) a od jaké výšky stěny (m). */
const BOULDER_STEP_M = 8;
const BOULDER_WALL_M = 3;

/** Hash celočíselných souřadnic a pořadí → číslo v [0, 1). */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Stanice podél řek mají vlastní čísla (hash) – shluky nesdílí vzor se stanicemi potoka ani
 * mezi sebou: k-tá řeka (`riverCenterlines`) začíná na (k + 1) × RIVER_STATION_BASE.
 */
const RIVER_STATION_BASE = 1_000_000;

/**
 * Ozdoby vody jako v generátoru 0 A.D.: rákos a orobinec ve shlucích na kraji koryta, lekníny
 * na hladině, kmeny spadlé do klidné vody a balvany v korytě pod skalní stěnou (terén 2) –
 * deterministicky. Jen vzhled, žádné překážky. `stream` = dotazy na vodu (potok i řeky – osa
 * vod), stanice jdou po ose potoka a po ose každé řeky (`rivers` – hlavní tok kostry, přítoky,
 * řeka prémie). Jediná řeka (prémie 1) má stanice jako dřív.
 */
export function decorPlacements(
  l: Landscape,
  stream: StreamCenterline,
  rivers: readonly StreamCenterline[] = [],
): DecorPlacement[] {
  const placements = axisDecor(l, stream, stream, 0);
  rivers.forEach((river, k) => {
    placements.push(...axisDecor(l, stream, river, (k + 1) * RIVER_STATION_BASE));
  });
  return placements;
}

/** Ozdoby vody podél jedné osy (`axis` – stanice), dotazy na vodu přes `stream`. */
function axisDecor(
  l: Landscape,
  stream: StreamCenterline,
  axis: StreamCenterline,
  stationBase: number,
): DecorPlacement[] {
  const placements: DecorPlacement[] = [];
  const reedClumps = createNoise2D(seededRandom(0xdec0 + stationBase));
  const inMap = (x: number, z: number): boolean => tileAt(l, x, z) !== null;
  const stations = (step: number): StreamStation[] =>
    streamStations(axis, step).map((station) =>
      stationBase === 0 ? station : { ...station, index: station.index + stationBase },
    );

  // Stav potoka u břehu na dané straně stanice: šířka, proud, tůň, strana oblouku.
  const bank = (station: StreamStation, side: number): StreamSample =>
    stream.nearest(station.x + station.nx * side * 0.5, station.z + station.nz * side * 0.5);

  // Rákos a orobinec: shluky na kraji vody. V klidné vodě, v tůních a na vnitřních obloucích
  // hustě (orobinec hlavně ve stojaté vodě), v rychlém proudu nad štěrkem řídce.
  for (const station of stations(REED_STEP_M)) {
    for (const side of [-1, 1]) {
      const k = station.index * 2 + (side > 0 ? 1 : 0);
      const here = bank(station, side);
      const calm = 1 - here.speed;
      const shelter = calm * calm + 0.5 * here.pool + 0.3 * Math.max(0, here.innerBend) * calm;
      const density =
        (0.5 + 0.5 * reedClumps(station.s / 60, side * 10)) * Math.min(1.2, 0.08 + shelter);
      if (hash(k, 1, 11) >= 0.85 * density) continue;
      const offset = here.halfWidth + (hash(k, 2, 11) - 0.5) * 3;
      const cx = station.x + station.nx * side * offset;
      const cz = station.z + station.nz * side * offset;
      const count = 5 + Math.floor(hash(k, 3, 11) * 5);
      const cattailShare = 0.1 + 0.5 * calm * calm + 0.3 * here.pool;
      for (let i = 0; i < count; i++) {
        const angle = hash(k, 10 + i, 12) * Math.PI * 2;
        const radius = Math.sqrt(hash(k, 20 + i, 12)) * 2.4;
        const x = cx + Math.cos(angle) * radius;
        const z = cz + Math.sin(angle) * radius;
        const d = stream.nearest(x, z).bankDistance;
        if (!inMap(x, z) || d < -2.5 || d > 3) continue;
        placements.push({
          model: hash(k, 30 + i, 12) < cattailShare ? 'cattails' : 'reeds',
          worldX: x,
          worldZ: z,
          rotationY: hash(k, 40 + i, 12) * Math.PI * 2,
          scale: 1 + hash(k, 50 + i, 12) * 0.6,
        });
      }
    }
  }

  // Lekníny jen v klidné vodě – hlavně v tůních, kde jich je víc.
  for (const station of stations(LILY_STEP_M)) {
    const k = station.index;
    const side = hash(k, 2, 21) < 0.5 ? -1 : 1;
    const here = bank(station, side);
    if (here.speed >= CALM_SPEED) continue;
    if (hash(k, 1, 21) >= 0.12 + 0.6 * here.pool) continue;
    const count = 1 + Math.floor(hash(k, 4, 21) * (2 + 3 * here.pool));
    for (let i = 0; i < count; i++) {
      // Spíš ke břehu než doprostřed proudu.
      const offset = here.halfWidth * (0.35 + 0.5 * hash(k, 3 + i * 7, 21));
      const x = station.x + station.nx * side * offset + (hash(k, 10 + i, 22) - 0.5) * 3;
      const z = station.z + station.nz * side * offset + (hash(k, 20 + i, 22) - 0.5) * 3;
      const near = stream.nearest(x, z);
      if (!inMap(x, z) || near.bankDistance >= -1.5 || near.speed >= CALM_SPEED) continue;
      placements.push({
        model: 'lilies',
        worldX: x,
        worldZ: z,
        rotationY: hash(k, 30 + i, 22) * Math.PI * 2,
        scale: 0.8 + hash(k, 40 + i, 22) * 0.6,
        waterLevel: near.level,
      });
    }
  }

  // Kmeny v potoce: v klidné vodě u břehu, v tůních častěji, natočené zhruba po proudu.
  for (const station of stations(LOG_STEP_M)) {
    const k = station.index;
    const side = hash(k, 1, 431) < 0.5 ? -1 : 1;
    const here = bank(station, side);
    if (here.speed >= 0.45 || hash(k, 2, 431) >= 0.2 + 0.4 * here.pool) continue;
    const offset = Math.max(0, here.halfWidth - 1.5 - hash(k, 3, 431));
    const x = station.x + station.nx * side * offset;
    const z = station.z + station.nz * side * offset;
    const near = stream.nearest(x, z);
    if (!inMap(x, z) || near.bankDistance >= -0.5 || near.speed >= 0.5) continue;
    placements.push({
      model: 'log-water',
      worldX: x,
      worldZ: z,
      rotationY: Math.atan2(near.flowX, near.flowZ) + (hash(k, 4, 431) - 0.5) * 1.2,
      scale: 0.8 + hash(k, 5, 431) * 0.4,
      waterLevel: near.level,
    });
  }

  // Balvany v korytě u paty skalní stěny (terén 2) – spadly ze stěny, voda je obtéká.
  for (const station of stations(BOULDER_STEP_M)) {
    for (const side of [-1, 1]) {
      const k = station.index * 2 + (side > 0 ? 1 : 0);
      const here = bank(station, side);
      if (here.bank < BOULDER_WALL_M) continue;
      const rock = Math.min(1, (here.bank - BOULDER_WALL_M) / 3);
      if (hash(k, 1, 531) >= 0.3 + 0.35 * rock) continue;
      const count = 1 + Math.floor(hash(k, 2, 531) * 2.5);
      for (let i = 0; i < count; i++) {
        const offset = here.halfWidth - 0.6 - hash(k, 10 + i, 531) * 2.2;
        const along = (hash(k, 20 + i, 531) - 0.5) * BOULDER_STEP_M;
        const x = station.x + station.nx * side * offset - station.nz * along;
        const z = station.z + station.nz * side * offset + station.nx * along;
        const d = stream.nearest(x, z).bankDistance;
        if (!inMap(x, z) || d < -3 || d > -0.3) continue;
        const pick = hash(k, 30 + i, 531);
        placements.push({
          model: pick < 0.45 ? 'rock-boulder' : pick < 0.75 ? 'rock-moss-1' : 'boulder',
          worldX: x,
          worldZ: z,
          rotationY: hash(k, 40 + i, 531) * Math.PI * 2,
          scale: 0.9 + hash(k, 50 + i, 531) * 0.9,
        });
      }
    }
  }
  return placements;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return state / 4294967296;
  };
}
