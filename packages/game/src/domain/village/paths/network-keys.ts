// Okno pěšin a otisky (klíče) vstupu sítě – kdy se síť musí přepočítat.
// Součást výpočtu sítě pěšin – rozcestník je network.ts (komentář k celku tam).

import { length2, type Landscape } from '../../landscape';
import { type Position } from '../types';
import { nearestWaterTiles } from './terrain';
import { partWalkSpeed, roadTreeSpeed } from './walk-speed';
import {
  DAYS_PER_YEAR,
  PASTURE,
  PATH_AGE_FULL_YEARS,
  PATH_TRAFFIC,
  type PathPoint,
  type PathSquare,
  type PathVillage,
  YEARS_KEY_MAX,
  YEARS_STEP,
  PATH_REACH_M,
  type Square,
} from './network-types';

/**
 * Okno sítě pěšin vsi v krajině sídla (`pathBounds` s nejbližší vodou k obydlím –
 * `nearestWaterTiles`): stejně na serveru (denní i roční síť) i ve scéně.
 */
export function villagePathBounds(
  village: PathVillage,
  landscape: Landscape,
): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
  return pathBounds(
    village,
    nearestWaterTiles(
      landscape,
      village.dwellings.map((d) => d.position),
    ),
  );
}

/**
 * Políčka přirozených luk, kde ves seče (práce `meadow` v rozdělení práce – v roční síti za rok),
 * podle `hayMeadows`; políčko, které ves nezná, vypadne.
 */
export function mowedMeadows(village: PathVillage): PathSquare[] {
  const meadows = village.hayMeadows ?? [];
  if (meadows.length === 0) return [];
  const byCell = new Map(meadows.map((m) => [`${m.cell.x},${m.cell.y}`, m]));
  const out = new Map<string, PathSquare>();
  for (const share of village.labor?.shares ?? []) {
    if (share.target.kind !== 'meadow' || share.manDays <= 0) continue;
    for (const c of share.target.cells) {
      const key = `${c.x},${c.y}`;
      const m = byCell.get(key);
      if (m) out.set(key, m);
    }
  }
  return [...out.values()];
}

/**
 * Klíč čtverce do klíče sítě: políčko, u natočeného čtverce (fields.md – Natočené stavby) i střed
 * a natočení (souřadnice v různých mřížkách se mohou shodovat).
 */
/** Čtverce ohrady v síti – první a další (oxen.md – Ohrady podle druhu). */
export function penPathSquares(
  pen: PathSquare & { readonly extra?: readonly PathSquare[] },
): PathSquare[] {
  return [pen, ...(pen.extra ?? [])];
}

function squareKeyOf(s: Square): string {
  return s.rotation === undefined
    ? `${s.cell.x},${s.cell.y}`
    : `${s.cell.x},${s.cell.y}@${s.x.toFixed(2)},${s.z.toFixed(2)},${s.rotation.toFixed(3)}`;
}

/** Síla pěšiny 0–1 z provozu (cest za den); pod prahem 0. */
export function pathStrength(trips: number): number {
  if (trips < PATH_TRAFFIC.min) return 0;
  return Math.min(1, Math.sqrt(trips / PATH_TRAFFIC.full));
}

/** Kolik spojení je vyšlapané podle stáří (roky) – za PATH_AGE_FULL_YEARS naplno. */
export function pathAgeFactor(years: number): number {
  return Math.min(1, Math.max(0, years / PATH_AGE_FULL_YEARS));
}

/**
 * Klíč všeho, na čem pěšiny závisí (rozložení vsi, práce dne po místech, stáří obydlí) – síť se
 * přepočítá, jen když se změní. Člověkodny po půlkách, stáří po desetinách – denní drobné změny
 * síť nepřestavují.
 */
export function pathNetworkKey(village: PathVillage): string {
  const day = village.labor?.day ?? null;
  const dwellings = village.dwellings.map((d) => {
    const age =
      d.since !== undefined && day !== null
        ? `${ageBucket(day - d.since)}/${Math.floor(Math.min(YEARS_KEY_MAX, (day - d.since) / DAYS_PER_YEAR) / YEARS_STEP)}`
        : '';
    const yard = d.plot?.yard ? `+${d.plot.yard.x},${d.plot.yard.z}` : '';
    const turned =
      d.plot?.rotation !== undefined
        ? `@${d.plot.x.toFixed(2)},${d.plot.z.toFixed(2)},${d.plot.rotation.toFixed(3)}`
        : '';
    const plot = d.plot ? `${d.plot.cell.x},${d.plot.cell.y}${yard}${turned}` : '';
    return `${d.id}:${d.type}${d.craft ? `/${d.craft}` : ''}:${d.built ? 1 : 0}:${d.inhabited === false ? 0 : 1}:${age}:${plot}:${d.position.x.toFixed(1)},${d.position.z.toFixed(1)},${d.position.rotation.toFixed(2)}`;
  });
  const fields = village.fields.map(
    (f) =>
      `${f.id}:${f.parts.map((p) => `${squareKeyOf(p)},${p.stage}/${partWalkSpeed(p)}${p.grazed === false ? ',-' : ''}`).join(';')}`,
  );
  const woods = (village.woods ?? []).map(
    (w) => `${squareKeyOf(w)}${w.surface === 'forest' ? 'f' : ''}`,
  );
  const orchards = (village.orchards ?? []).map(
    (o) => `${o.id}:${o.squares.map((s) => squareKeyOf(s)).join(';')}`,
  );
  const cemeteries = (village.cemeteries ?? []).map(
    (c) =>
      `${c.id}:${c.squares.map((s) => `${squareKeyOf(s)}${s.pending ? 'p' : ''}`).join(';')}${c.built === false ? ':-' : ''}`,
  );
  const sacred = village.sacred
    ? [
        village.sacred.oaks.map((o) => o.id).join(','),
        village.sacred.groves.map((g) => g.id).join(','),
        village.sacred.buildings.map((b) => `${b.id}:${b.kind}:${b.built ? 1 : 0}`).join(','),
      ].join('|')
    : '';
  const labor = village.labor
    ? `${village.labor.month}:${laborByTarget(village)
        .map(([key, manDays]) => `${key}=${manDays}`)
        .join(
          ',',
        )}:${village.labor.people.adults + village.labor.people.children + village.labor.people.elders}`
    : '';
  const obstacles = village.obstacles
    ? `${village.obstacles.removed.length},${village.obstacles.stumps.length}`
    : '';
  const pens = (village.pens ?? []).map(
    (p) =>
      `${p.id}:${penPathSquares(p).map(squareKeyOf).join(';')}:${p.built ? 1 : 0}${p.stocked === false ? ':-' : ''}`,
  );
  const lining = liningKey(village.roads);
  return JSON.stringify([
    dwellings,
    fields,
    orchards,
    cemeteries,
    sacred,
    labor,
    obstacles,
    roadsKey(village.roads),
    pens,
    pastureHerds(village.livestock),
    // bez lesa vsi prázdné – klíč starších vsí zůstane stejný
    ...(woods.length > 0 ? [woods] : []),
    // stromy u cest (roads.md – Stromy u cesty zrychlí chůzi) – bez nich klíč beze změny
    ...(lining ? [lining] : []),
    // milíře uhlířů (crafts.md – Milíř u skácených buků) – bez nich klíč beze změny
    ...((village.kilns?.length ?? 0) > 0 ? [kilnsKey(village.kilns!)] : []),
    // humna (production-chains.md – Humno) – bez nich klíč beze změny
    ...((village.threshingFloors?.length ?? 0) > 0
      ? [threshingFloorsKey(village.threshingFloors!)]
      : []),
    // otevřené obilné jámy (production-chains.md – Obilné jámy) – bez nich klíč beze změny
    ...((village.grainPits?.length ?? 0) > 0 ? [grainPitsKey(village.grainPits!)] : []),
    // zemní práce vozových cest (roads.md – Vozová cesta) – terén pěšin; bez nich beze změny
    ...(village.earthworks && village.earthworks.length > 0
      ? [
          village.earthworks
            .map((e) => `${e.profile.length}:${Math.round(e.reachedM * 10)}`)
            .join(';'),
        ]
      : []),
  ]);
}

/** Klíč humen pro síť pěšin – id, poloha na decimetry, natočení a jestli stojí. */
export function threshingFloorsKey(
  floors: readonly { id: number; position: Position; built: boolean }[],
): string {
  return floors
    .map(
      (f) =>
        `${f.id}:${f.position.x.toFixed(1)},${f.position.z.toFixed(1)},${f.position.rotation.toFixed(2)}:${f.built ? 1 : 0}`,
    )
    .join(';');
}

/** Klíč otevřených obilných jam pro síť pěšin – id a střed na decimetry. */
export function grainPitsKey(pits: readonly { id: number; x: number; z: number }[]): string {
  return pits.map((p) => `${p.id}:${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(';');
}

/** Klíč milířů pro síť pěšin – středy na decimetry. */
export function kilnsKey(kilns: readonly { x: number; z: number }[]): string {
  return kilns.map((k) => `${k.x.toFixed(1)},${k.z.toFixed(1)}`).join(';');
}

/** Bod v polovině lomené čáry. */
export function middleOf(points: readonly PathPoint[]): PathPoint {
  let total = 0;
  for (let k = 1; k < points.length; k++) {
    total += length2(points[k]!.x - points[k - 1]!.x, points[k]!.z - points[k - 1]!.z);
  }
  let along = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const length = length2(b.x - a.x, b.z - a.z);
    if (length > 0 && along + length >= total / 2) {
      const u = (total / 2 - along) / length;
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
    }
    along += length;
  }
  return points[0]!;
}

/** Kolik stád se pase (ovce s kozami, krávy – PASTURE); prasata ne. */
export function pastureHerds(livestock: PathVillage['livestock']): number {
  const whole = (n: number | undefined): number => Math.max(0, Math.round(n ?? 0));
  const flock = whole(livestock?.sheep) + whole(livestock?.goat);
  return (
    Math.ceil(flock / PASTURE.flockHeads) + Math.ceil(whole(livestock?.cow) / PASTURE.cattleHeads)
  );
}

/**
 * Klíč olemování pevných cest stromy (roads.md – Stromy u cesty zrychlí chůzi) – id úseku
 * a podíly; jen úseky se stromy, bez nich prázdný.
 */
export function liningKey(roads: PathVillage['roads']): string {
  return (roads ?? [])
    .flatMap((r, k) =>
      roadTreeSpeed(r.lined) > 0 ? [`${r.id ?? `#${k}`}:${r.lined!.trees}/${r.lined!.apples}`] : [],
    )
    .join(';');
}

/** Klíč pevných cest – počet bodů, konce každé osy (osa se jinak nemění) a stupeň. */
export function roadsKey(roads: PathVillage['roads']): string {
  return (roads ?? [])
    .map((r) => {
      const a = r.points[0];
      const b = r.points[r.points.length - 1];
      // vozová cesta s příznakem navíc – klíč pěších cest se nemění (wagons.md)
      return a && b
        ? `${r.points.length}:${a.x},${a.z}:${b.x},${b.z}:${r.grade ?? ''}${r.cart ? ':v' : ''}${r.unbridged ? ':u' : ''}`
        : '';
    })
    .join(';');
}

function ageBucket(days: number): number {
  return Math.round(pathAgeFactor(days / DAYS_PER_YEAR) * 10);
}

/** Člověkodny dne po místech (klíč místa), po půlkách – nulová místa vynechá. */
export function laborByTarget(village: PathVillage): [string, number][] {
  const sums = new Map<string, number>();
  for (const share of village.labor?.shares ?? []) {
    const t = share.target;
    if (t.kind === 'village') continue;
    const key =
      t.kind === 'trees'
        ? `trees:${t.ids.join('.')}`
        : t.kind === 'meadow'
          ? `meadow:${t.cells.map((c) => `${c.x}.${c.y}`).join('_')}`
          : t.kind === 'edge'
            ? `edge:${t.direction}`
            : t.kind === 'water'
              ? `water:${t.x},${t.z}`
              : `${t.kind}:${t.id}`;
    // na setiny jako ve scéně (village-view.ts) – server i prohlížeč pak sečtou totéž
    sums.set(key, (sums.get(key) ?? 0) + Math.round(share.manDays * 100) / 100);
  }
  return [...sums.entries()]
    .map(([key, manDays]): [string, number] => [key, Math.round(manDays * 2) / 2])
    .filter(([, manDays]) => manDays > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// --- mřížka -------------------------------------------------------------------------------

/**
 * Obdélník světa, který pěšiny vsi potřebují: stavby vsi a okolí pro vodu a dřevo, zaokrouhlený
 * ven (stabilní okno) a nejvýš MAX_WINDOW_HALF_M od středu obydlí. Voda `water` (nejbližší vodní
 * políčka k obydlím – `villagePathBounds`), která v tom okolí neleží, ho rozšíří jen k sobě
 * (± WATER_WINDOW_MARGIN_M, bez meze od středu) – pro vodu se chodí vždy (paths.md – Pochůzky pro
 * vodu). Ves bez obydlí null.
 */
export function pathBounds(
  village: PathVillage,
  water: readonly PathPoint[] = [],
): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
  if (village.dwellings.length === 0) return null;
  const xs: number[] = [];
  const zs: number[] = [];
  const add = (x: number, z: number): void => {
    xs.push(x);
    zs.push(z);
  };
  for (const d of village.dwellings) add(d.position.x, d.position.z);
  const cx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const cz = zs.reduce((s, z) => s + z, 0) / zs.length;
  for (const f of village.fields) for (const p of f.parts) add(p.x, p.z);
  for (const o of village.orchards ?? []) for (const s of o.squares) add(s.x, s.z);
  for (const c of village.cemeteries ?? []) for (const s of c.squares) add(s.x, s.z);
  for (const o of village.sacred?.oaks ?? []) add(o.x, o.z);
  for (const g of village.sacred?.groves ?? []) add(g.x, g.z);
  for (const b of village.sacred?.buildings ?? []) add(b.position.x, b.position.z);
  for (const p of village.pens ?? []) for (const q of penPathSquares(p)) add(q.x, q.z);
  for (const m of mowedMeadows(village)) add(m.x, m.z);
  const clampX = (x: number): number =>
    Math.min(cx + MAX_WINDOW_HALF_M, Math.max(cx - MAX_WINDOW_HALF_M, x));
  const clampZ = (z: number): number =>
    Math.min(cz + MAX_WINDOW_HALF_M, Math.max(cz - MAX_WINDOW_HALF_M, z));
  const down = (v: number): number => Math.floor(v / WINDOW_ROUND_M) * WINDOW_ROUND_M;
  const up = (v: number): number => Math.ceil(v / WINDOW_ROUND_M) * WINDOW_ROUND_M;
  let minX = down(clampX(Math.min(...xs) - PATH_REACH_M));
  let minZ = down(clampZ(Math.min(...zs) - PATH_REACH_M));
  let maxX = up(clampX(Math.max(...xs) + PATH_REACH_M));
  let maxZ = up(clampZ(Math.max(...zs) + PATH_REACH_M));
  // voda mimo okno staveb – okno jen k ní (voda v okně ho nemění)
  const outside = water.filter((w) => w.x < minX || w.x > maxX || w.z < minZ || w.z > maxZ);
  for (const w of outside) {
    minX = Math.min(minX, w.x - WATER_WINDOW_MARGIN_M);
    minZ = Math.min(minZ, w.z - WATER_WINDOW_MARGIN_M);
    maxX = Math.max(maxX, w.x + WATER_WINDOW_MARGIN_M);
    maxZ = Math.max(maxZ, w.z + WATER_WINDOW_MARGIN_M);
  }
  return { minX: down(minX), minZ: down(minZ), maxX: up(maxX), maxZ: up(maxZ) };
}

/** Okno pěšin nejvýš tolik od středu vsi (m) – výpočet zůstane krátký. */
const MAX_WINDOW_HALF_M = 650;

/** Okno se zaokrouhluje ven na tolik (m) – terén se nepřepočítá při každé nové stavbě. */
const WINDOW_ROUND_M = 90;

/**
 * Voda mimo okno: okno se rozšíří k ní o tolik kolem středu vodního políčka (m) – suchý břeh u něj
 * (políčko 15 m, voda i v sousedních políčkách podle osy potoka) bude v okně.
 */
const WATER_WINDOW_MARGIN_M = 45;
