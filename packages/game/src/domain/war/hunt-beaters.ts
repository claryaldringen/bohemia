import { length2 } from '../landscape/det-math';
import { HUNT, HUNT_FIGHT } from '../village/rules/rules-wildlife';
import type { QuarryKind } from '../village/types';
import { nearestForestDoor } from './forest-doors';
import type { MarchGrid, Pos } from './march-grid';
import { WAR } from './rules-war';
import { TICKS_PER_SECOND } from './ticks';

// Honci lovu (hunting.md – Pravidla 3 a 7; plán 2026-11-22-hunting – Rozhodnutí 3, 4 a 6): šest
// mužů ze dvorce dojde tempem pochodu k dveřím nejbližšího hustého lesa – tam zvíře vyběhne – a po
// konci lovu jdou domů; zabité zvíře odnesou dva z nich na tyči (pomaleji). Honci jsou kulisa
// scény bez vlivu na souboj: stav jsou jen takty a body (JSON) a poloha je čistá funkce taktu –
// přímky mezi body. Jen det-math.

/** Rozestup honců v řadě napříč cestou (m) – jen poloha pro scénu. */
const SPACING_M = 1.5;
/** Honci 0 a 1 nesou zabité zvíře na tyči – jdou po obou stranách osy cesty. */
const CARRIERS = 2;
/** Metry za takt honce – tempo pochodu pěšky (`WAR.pace`). */
const STEP_M = WAR.pace.metersPerSecond / TICKS_PER_SECOND;

/** Vyhlášený lov – vstup výpravy (`NewJourney.hunt`, příkaz `hunt`). */
export interface HuntStart {
  quarry: QuarryKind;
  /** Herní den vyhlášení. */
  day: number;
  /** Dveře hustého lesa – sem dojdou honci a odtud vyběhne zvíře. */
  door: Pos;
  /** Kam zvíře vyběhne (`HUNT_FIGHT.emergeM` ode dveří ke dvorci). */
  out: Pos;
  /** Psi dvorce s honci – jen scéna. */
  dogs: number;
}

/** Honci jednoho lovu (JSON). */
export interface HuntBeaters {
  /** Dvorec – odtud vyjdou a sem se vrátí. */
  from: Pos;
  door: Pos;
  startTick: number;
  /** Honci u dveří lesa – zvíře vyběhne. */
  arriveTick: number;
  /** Konec lovu: dva honci nesou úlovek z `at` na tyči (`carry`), nebo jdou všichni domů. */
  end: { tick: number; at: Pos; carry: boolean } | null;
  /** Všichni honci doma – lov končí. */
  homeTick: number | null;
}

/** Úsek cesty honce: z `a` do `b` od taktu `from` do `to`. */
interface Leg {
  a: Pos;
  b: Pos;
  from: number;
  to: number;
  carrying: boolean;
}

/**
 * Začátek lovu z mřížky pochodu domovské mapy (Rozhodnutí 4): dveře hustého lesa nejbližší ke
 * dvorci (`nearestForestDoor`) a výběh zvířete `HUNT_FIGHT.emergeM` m od nich po přímce ke dvorci.
 * Mapa bez hustého lesa – null.
 */
export function huntStartOf(
  grid: MarchGrid,
  manor: Pos,
  input: { quarry: QuarryKind; day: number; dogs: number },
): HuntStart | null {
  const door = nearestForestDoor(grid, manor);
  if (door === null) return null;
  const dx = manor.x - door.x;
  const dz = manor.z - door.z;
  const d = length2(dx, dz);
  const k = d < 1e-9 ? 0 : HUNT_FIGHT.emergeM / d;
  return {
    quarry: input.quarry,
    day: input.day,
    door: { x: door.x, z: door.z },
    out: { x: door.x + dx * k, z: door.z + dz * k },
    dogs: input.dogs,
  };
}

/** Honci vyjdou v taktu `startTick` ze dvorce `from` k dveřím lesa `door` tempem pochodu. */
export function beatersPlan(from: Pos, door: Pos, startTick: number): HuntBeaters {
  return {
    from: { x: from.x, z: from.z },
    door: { x: door.x, z: door.z },
    startTick,
    arriveTick: startTick + walkTicks(from, door, 1),
    end: null,
    homeTick: null,
  };
}

/**
 * Konec lovu v taktu `tick` (zvíře padlo na `at`, nebo uteklo): honci se otočí, kde jsou (u dveří,
 * nebo ještě cestou k nim). S úlovkem (`carry`) jdou honci 0 a 1 k zvířeti a odtud ho nesou do
 * dvorce tempem × `HUNT_FIGHT.carryPaceShare`, ostatní jdou rovnou domů; bez úlovku všichni domů.
 * `homeTick` – takt, kdy je doma poslední. Druhý konec nic nezmění.
 */
export function endBeaters(b: HuntBeaters, tick: number, at: Pos, carry: boolean): void {
  if (b.end !== null) return;
  b.end = { tick, at: { x: at.x, z: at.z }, carry };
  let home = tick;
  for (let i = 0; i < HUNT.beaters.men; i++) {
    for (const leg of homeLegs(b, i)) home = Math.max(home, leg.to);
  }
  b.homeTick = home;
}

/**
 * Poloha honce `index` v taktu `tick` pro scénu: přímky mezi body (dvorec → dveře, stání u dveří,
 * po konci domů, nosiči přes `end.at`), řada napříč směrem ke dveřím po `SPACING_M` – honci 0 a 1
 * po obou stranách osy cesty, takže zvíře na tyči visí na ní. `carrying` – nese úlovek. Před
 * vyhlášením, po vlastním návratu a po `homeTick` null.
 */
export function beatersAt(
  b: HuntBeaters,
  tick: number,
  index: number,
): { pos: Pos; carrying: boolean } | null {
  if (tick < b.startTick || (b.homeTick !== null && tick >= b.homeTick)) return null;
  if (b.end === null || tick < b.end.tick) {
    return { pos: aside(b, outbound(b, tick), index), carrying: false };
  }
  for (const leg of homeLegs(b, index)) {
    if (tick >= leg.to) continue;
    const t = (tick - leg.from) / (leg.to - leg.from);
    const p = { x: leg.a.x + (leg.b.x - leg.a.x) * t, z: leg.a.z + (leg.b.z - leg.a.z) * t };
    return { pos: aside(b, p, index), carrying: leg.carrying };
  }
  return null;
}

/** Takty chůze z `a` do `b` dílem `share` tempa pochodu (nahoru). */
function walkTicks(a: Pos, b: Pos, share: number): number {
  return Math.ceil(length2(b.x - a.x, b.z - a.z) / (STEP_M * share));
}

/** Osa řady na cestě ke dveřím v taktu `tick` (před odchodem dvorec, po příchodu dveře). */
function outbound(b: HuntBeaters, tick: number): Pos {
  if (tick >= b.arriveTick) return { x: b.door.x, z: b.door.z };
  if (tick <= b.startTick) return { x: b.from.x, z: b.from.z };
  const t = (tick - b.startTick) / (b.arriveTick - b.startTick);
  return { x: b.from.x + (b.door.x - b.from.x) * t, z: b.from.z + (b.door.z - b.from.z) * t };
}

/** Úseky cesty honce `index` po konci lovu (osa řady); bez konce žádné. */
function homeLegs(b: HuntBeaters, index: number): Leg[] {
  const end = b.end;
  if (end === null) return [];
  const turn = outbound(b, end.tick);
  if (end.carry && index < CARRIERS) {
    const reach = end.tick + walkTicks(turn, end.at, 1);
    const home = reach + walkTicks(end.at, b.from, HUNT_FIGHT.carryPaceShare);
    return [
      { a: turn, b: end.at, from: end.tick, to: reach, carrying: false },
      { a: end.at, b: b.from, from: reach, to: home, carrying: true },
    ];
  }
  const home = end.tick + walkTicks(turn, b.from, 1);
  return [{ a: turn, b: b.from, from: end.tick, to: home, carrying: false }];
}

/**
 * Honec `index` v řadě vedle osy `p`: napříč směrem dvorec → dveře (stejně tam i zpět – každý jde
 * po své stopě), honci 0 a 1 po obou stranách osy.
 */
function aside(b: HuntBeaters, p: Pos, index: number): Pos {
  const dx = b.door.x - b.from.x;
  const dz = b.door.z - b.from.z;
  const d = length2(dx, dz);
  const [nx, nz] = d < 1e-9 ? [0, 1] : [-dz / d, dx / d];
  const off = (index - (CARRIERS - 1) / 2) * SPACING_M;
  return { x: p.x + nx * off, z: p.z + nz * off };
}
