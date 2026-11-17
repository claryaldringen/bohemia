import { surfaceAt, type Landscape } from '../domain/landscape';
import type { GridCell } from '../domain/village/people/world-grid';
import type { TrailExit } from '../domain/village/trade/trail-exits';
import type { RoadPoint, VillageState } from '../domain/village/types';
import { VASSALAGE } from '../domain/vassalage/rules-vassalage';
import { treeBelow } from '../domain/vassalage/tree';
import {
  continuationsOf,
  NO_CONTINUATIONS,
  WAR,
  type CampaignMap,
  type SeenCell,
} from '../domain/war';
import { cellKey } from '../domain/war/campaign-tick';
import type { AlarmOwnerPort, CampaignCells } from './campaigns';
import type { HouseRepository } from './houses';
import type { KnowledgeRepository } from './knowledge';
import type { VassalageRepository } from './vassalages';
import type { VillageRepository } from './villages';

// Pokračování zemských stezek sousedních vsí (trade.md – Zemská stezka, Pokračování na sousední
// mapě; plán 2026-11-16-dense-forest – Rozhodnutí 13): mapa čte výstupy stezek ze souhrnů vsí na
// 8 sousedních políčkách (port `TrailExitSource` – jeden dotaz), vstupy z nich skládá
// `createCampaignCells` (`CampaignMap.trailEntries`) a osy pokračování odvodí jádro. Na cizí mapě
// (výjezd, tažení) rozhoduje `foreignMapTrails`, co z os prohlížeč dostane.

/**
 * Výstupy stezek vsi aktivního sídla na sousedním políčku: `exits` ze souhrnu vsi
 * (`VillageDigest.trailExits`); null = souhrn bez nich (uložený dřív, jiné verze tvaru nebo
 * starší verze stavu) – volající ves načte celou (`trailExitsOf`).
 */
export interface NeighbourTrailExits {
  villageId: string;
  /** Verze uložené vsi – klíč paměti výstupů načtených ze stavu. */
  version: number;
  cell: GridCell;
  exits: TrailExit[] | null;
}

/** Port: výstupy stezek vsí aktivních sídel na 8 sousedních políčkách políčka (bez něj samého). */
export interface TrailExitSource {
  trailExitsAround(cell: GridCell): Promise<NeighbourTrailExits[]>;
}

type Axes = readonly (readonly RoadPoint[])[];

/**
 * Osy pokračování stezek sousedních vsí na mapě políčka `cell` v den `day` (`continuationsOf`):
 * branka dvorce ze stavu `state` (pohled vlastní vsi), jinak ze stavu první vsi mapy; mapa bez vsi
 * null. Pro scénu a pohledy – prohlížeč osy dostane jako data.
 */
export async function mapTrailContinuations(
  deps: { cells: CampaignCells; villages: Pick<VillageRepository, 'find'> },
  cell: GridCell,
  day: number,
  state?: VillageState | null,
): Promise<Axes> {
  return continuationsOnMap(deps.villages, await deps.cells.mapOf(cell), day, state);
}

/** Osy pokračování na už načtené mapě – jako `mapTrailContinuations`. */
async function continuationsOnMap(
  villages: Pick<VillageRepository, 'find'>,
  map: CampaignMap,
  day: number,
  state?: VillageState | null,
): Promise<Axes> {
  // bez vstupu dostavěného před dnem se ves nenačítá – výsledek je týž (`NO_CONTINUATIONS`)
  if (!(map.trailEntries ?? []).some((e) => e.builtDay < day)) return NO_CONTINUATIONS;
  const villageId = map.villageIds[0];
  const village =
    state ?? (villageId === undefined ? null : ((await villages.find(villageId))?.state ?? null));
  return continuationsOf(map, village, day);
}

export interface ForeignMapTrailsDeps {
  villages: Pick<VillageRepository, 'find'>;
  alarmOwners: Pick<AlarmOwnerPort, 'ownerOf'>;
  houses: Pick<HouseRepository, 'activeOf'>;
  vassalages: Pick<VassalageRepository, 'edgesNear'>;
  knowledge: Pick<KnowledgeRepository, 'of'>;
}

/** Pokračování stezek na cizí mapě pro prohlížeč. */
export interface ForeignMapTrails {
  /** Osy (na mapě, která není `friendly`, jen objevené části – `axesInSight`). */
  axes: Axes;
  /** Mapa vsi rodu hráče nebo jeho vazala – osy celé a nad mlhou (scéna `setFriendlyMap`). */
  friendly: boolean;
}

/**
 * Pokračování stezek sousedů na cizí mapě `map` políčka `cell` v den `day` (výjezd, tažení):
 * mapa vsi rodu hráče nebo vazala (Martin 16. 11. 2026: „Když je to mapa rodu nebo vazala, ať je
 * vidět celá, stejným způsobem jako mapa vlastní. Pokud to bude mapa nepřítele nebo neutrála, ať
 * je tam fog of war“) dostane osy celé; jinak jen části, které rod objevil (návrh Clauda podle D62
 * – server cizí stavby mimo dohled neposílá): v dohledu stopy znalosti rodu o mapě
 * (`KnowledgeRepository.of`) a stop `seen` – co o mapě vědí muži hráče teď (pohled na výjezd či
 * tažení na serveru, nikdy z prohlížeče). Pochod se nemění – server počítá s celou osou.
 */
export async function foreignMapTrails(
  deps: ForeignMapTrailsDeps,
  input: {
    playerId: string;
    cell: GridCell;
    map: CampaignMap;
    day: number;
    seen?: readonly SeenCell[];
  },
): Promise<ForeignMapTrails> {
  const axes = await continuationsOnMap(deps.villages, input.map, input.day);
  if (axes.length === 0) return { axes, friendly: false };
  const house = await deps.houses.activeOf(input.playerId);
  const houseId = house?.id ?? null;
  if (await isFriendlyMap(deps, input.playerId, houseId, input.map.villageIds[0])) {
    return { axes, friendly: true };
  }
  const known = houseId === null ? null : await deps.knowledge.of(houseId, input.cell);
  const trail = [...(known?.trail ?? []), ...(input.seen ?? []).flatMap((s) => s.trail)];
  return { axes: axesInSight(axes, trail, forestOf(input.map.landscape)), friendly: false };
}

/**
 * Patří ves `villageId` rodu hráče, nebo jeho vazalovi (i vazalu vazala)? Mapa bez vsi ne, ves NPC
 * ne. Hloubka sítě vazalství jako u ostatních průchodů stromem vazalů (`VASSALAGE.noticeDepth`);
 * na mapě se bere první ves (jedna ves na mapu).
 */
async function isFriendlyMap(
  deps: Pick<ForeignMapTrailsDeps, 'alarmOwners' | 'vassalages'>,
  playerId: string,
  houseId: string | null,
  villageId: string | undefined,
): Promise<boolean> {
  if (villageId === undefined) return false;
  const owner = await deps.alarmOwners.ownerOf(villageId);
  if (!owner || owner.npc) return false;
  if (owner.playerId === playerId) return true;
  if (owner.houseId === null || houseId === null) return false;
  const edges = await deps.vassalages.edgesNear(houseId, VASSALAGE.noticeDepth);
  return treeBelow(edges, houseId).includes(owner.houseId);
}

/** Co o mapě `cell` vědí skupiny výprav hráče (`ExpeditionView.seen`). */
export function seenOnCell(
  views: readonly { seen: Readonly<Record<string, SeenCell>> }[],
  cell: GridCell,
): SeenCell[] {
  const key = cellKey(cell);
  return views.flatMap((v) => {
    const seen = v.seen[key];
    return seen ? [seen] : [];
  });
}

/** Je políčko krajiny pod bodem les? Mimo mapu ne (jako mlha prohlížeče – scene-war.ts). */
function forestOf(landscape: Landscape): (x: number, z: number) => boolean {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  return (x, z) => {
    const tx = Math.floor((x + half) / landscape.cellSizeM);
    const ty = Math.floor((z + half) / landscape.cellSizeM);
    if (tx < 0 || ty < 0 || tx >= landscape.size || ty >= landscape.size) return false;
    return surfaceAt(landscape, tx, ty) === 'forest';
  };
}

/** Krok vzorků osy (m) – polovina buňky mlhy prohlížeče (fog-of-war.ts, 10 m). */
const SIGHT_SAMPLE_M = 5;

/**
 * Části os v dohledu některého bodu stopy `trail` (jako mlha prohlížeče – `revealFog`: dohled
 * `WAR.sight`, les u kteréhokoli z obou bodů – lesní). Osy se vzorkují po `SIGHT_SAMPLE_M`
 * a souvislé běhy vzorků v dohledu (aspoň 2 body) jsou nové osy; bez stopy nic.
 */
export function axesInSight(
  axes: Axes,
  trail: readonly (readonly [number, number])[],
  forestAt: (x: number, z: number) => boolean,
): RoadPoint[][] {
  if (axes.length === 0 || trail.length === 0) return [];
  const eyes = trail.map(([x, z]) => ({ x, z, forest: forestAt(x, z) }));
  const sees = (p: RoadPoint): boolean => {
    const forest = forestAt(p.x, p.z);
    return eyes.some((e) => {
      const r = e.forest || forest ? WAR.sight.forestM : WAR.sight.openM;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      return dx * dx + dz * dz <= r * r;
    });
  };
  const result: RoadPoint[][] = [];
  for (const axis of axes) {
    let run: RoadPoint[] = [];
    for (const p of sampled(axis)) {
      if (sees(p)) {
        run.push(p);
        continue;
      }
      if (run.length >= 2) result.push(run);
      run = [];
    }
    if (run.length >= 2) result.push(run);
  }
  return result;
}

/** Body osy s vloženými body tak, aby úsek nebyl delší než `SIGHT_SAMPLE_M`. */
function sampled(axis: readonly RoadPoint[]): RoadPoint[] {
  const points: RoadPoint[] = [];
  for (let k = 0; k < axis.length; k++) {
    const b = axis[k]!;
    const a = k > 0 ? axis[k - 1]! : null;
    if (a) {
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SIGHT_SAMPLE_M);
      for (let s = 1; s < n; s++) {
        points.push({ x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n });
      }
    }
    points.push({ x: b.x, z: b.z });
  }
  return points;
}
