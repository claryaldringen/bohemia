import { obstaclesOf, surfaceAt, type Landscape, type ObstacleLayer } from '../../../landscape';
import { cloneState } from '../../core/clone';
import {
  busySegments,
  fortBlockingSegments,
  fortificationCost,
  fortSegments,
  layerBuilt,
  pincerArmKind,
  pincerArms,
  pincerSpace,
  pincerWallAllowed,
  gatePincerStands,
  gateTowerIsOld,
  segmentStands,
  segmentWall,
  type FortCost,
  type FortGate,
} from '..';
import {
  FORT_BUSY,
  FORT_UNKNOWN,
  outlineOf,
  pushWork,
  villageFortifications,
  type FortificationResult,
} from './fortifications';
import { giveWayToBuilding, type TakenLand } from '../../buildings/land-taken';
import { obstacleStatus, outcropUnder, squareObstacles } from '../../core/obstacles';
import type { Walk } from '../../paths/walking';
import { sacredInShape, unreservedTrees } from '../../placement/placement-dwellings';
import { freeShape } from '../../placement/placement-geometry';
import { checkFootprintFree, DWELLING_LAND, takenLandUnder } from '../../placement/placement-land';
import { placementVillageOf } from '../../placement/placement-village';
import type { Point } from '../../placement/polygon';
import { FORTIFICATIONS } from '../../rules/rules-fortifications';
import { sacredSitesOf } from '../../people/sacred';
import { tilesUnder } from '../../placement/squares';
import type { Construction, Fortification, VillageState } from '../../types';

// Vylepšení brány (fortifications.md – Hradby a obrana, Brány; Martin 8. 11. 2026: „Od palisády
// výše může hráč či NPC vylepšit bránu ve dvou úrovních 1. klešťová brána (za opevněním však musí
// být dost místa) 2. dřevěná věž nad samotnou branou.“). Klešťová brána = ramena hradby s ochozem
// podél uličky (`fortification/pincer.ts`), věž jen na klešťové bráně. Obojí jen u hradby s ochozem
// (Martin 9. 11. 2026: „Pokud budeme mít obyčejnou palisádu bez ochozu, nemůže tam stát klešťová
// brána, ale jen obyč“ – `pincerWallAllowed`). Správce ani jedno nestaví (Správce – návrh Clauda);
// dožilou věž obyvatelé přestaví sami (`decideTowerRebuilds`).

/** Důvody odmítnutí česky (u kurzoru a v odpovědi akce). */
export const FORT_GATE_LOW = 'Bránu jde vylepšit až u hradby s ochozem.';
export const FORT_GATE_NO_ROOM = 'Za branou není místo.';
const FORT_GATE_DOWN = 'Brána nestojí.';
export const FORT_PINCER_DONE = 'Brána už je klešťová.';
export const FORT_TOWER_NO_PINCER = 'Věž stojí jen na klešťové bráně.';
export const FORT_TOWER_DONE = 'Brána už věž má.';

/** Úroveň vylepšení brány: klešťová brána, nebo věž nad branou. */
export type GateLevel = 'pincer' | 'tower';

/** Vstup vylepšení brány – brána dílu `segment`. */
export interface GateUpgradeInput {
  fortificationId: number;
  segment: number;
  level: GateLevel;
}

/** Místo za branou pro ramena: překážky, které osadníci odstraní, a díly polí a sadů pod rameny. */
interface PincerRoom {
  obstacleIds: number[];
  clearedTrees: number;
  takenLand: TakenLand[];
}

/** Prošlá kontrola vylepšení brány: cena, brána, a u klešťové místo za branou. */
interface GateCheck {
  cost: FortCost;
  gate: FortGate;
  room: PincerRoom | null;
}

/** Cena věže nad branou: 120 čd komplet − kláda z hromady 1 čd, 30 klád (Brány, Cena). */
export function towerCost(): FortCost {
  const t = FORTIFICATIONS.tower;
  return {
    laborManDays: t.laborManDays - FORTIFICATIONS.pileSaves.logManDays * t.wood,
    logs: t.wood,
    stoneM3: 0,
  };
}

/** Leží mnohoúhelník celý v krajině sídla? */
function inside(landscape: Landscape, polygon: readonly Point[]): boolean {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  return polygon.every(([x, z]) => Math.abs(x) <= half + 1e-6 && Math.abs(z) <= half + 1e-6);
}

/**
 * Místo za branou pro klešťovou bránu (Brány – „za opevněním však musí být dost místa“): ulička
 * s rameny `pincerGate.clearM` dovnitř od vnitřního okraje pásu (`pincerSpace`) v krajině, bez vody,
 * staveb (pole, sad a les vsi smí – jako pás opevnění), skalního výchozu a posvátného dubu či háje.
 * Překážky pod rameny osadníci odstraní, ramena (s ochozem) vezmou díly polí a sadů. Nevejde se –
 * null.
 */
function pincerRoom(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  fort: Fortification,
  gate: FortGate,
): PincerRoom | null {
  const outline = outlineOf(landscape, fort);
  const shape = outline ? fortSegments(outline)[gate.segment] : undefined;
  const blocking = fortBlockingSegments(fort, null).find((s) => s.index === gate.segment);
  if (!outline || !shape || !blocking) return null;
  const band = blocking.outside?.inM ?? FORTIFICATIONS.bandM[blocking.kind];
  const space = pincerSpace(outline, shape, gate, band);
  const arms = pincerArms(outline, shape, gate, band);
  if (!space || arms.length === 0 || !inside(landscape, space)) return null;
  for (const t of tilesUnder(landscape, space)) {
    if (surfaceAt(landscape, t % landscape.size, Math.floor(t / landscape.size)) === 'water') {
      return null;
    }
  }
  const all = placementVillageOf(state, day);
  // vlastní pás opevnění se místa za branou dotýká – nepočítá se
  const village = {
    ...all,
    fortifications: villageFortifications(state).filter((f) => f !== fort),
  };
  if (!checkFootprintFree(landscape, village, [freeShape(space)], DWELLING_LAND).ok) return null;
  const status = obstacleStatus(village.obstacleChanges);
  if (outcropUnder(obstacles, status, space)) return null;
  const sites = sacredSitesOf(obstacles);
  const sacred = sacredInShape(landscape, obstacles, sites, freeShape(space));
  if (sacred.groveTiles.length > 0 || sacred.oaks.length > 0) return null;
  const ids = new Set<number>();
  const treeIds = new Set<number>();
  for (const arm of arms) {
    const tally = squareObstacles(obstacles, status, arm, sites.protectedTrees);
    for (const id of tally.ids) ids.add(id);
    for (const id of tally.treeIds) treeIds.add(id);
  }
  return {
    obstacleIds: [...ids].sort((a, b) => a - b),
    clearedTrees: unreservedTrees(village, [...treeIds]),
    takenLand: takenLandUnder(landscape, village, arms),
  };
}

/**
 * Kontrola vylepšení brány dílu `input.segment` ke dni `day`: brána je, hradba dílu je hradba
 * s ochozem (`pincerWallAllowed` – plot, palisáda bez ochozu ani holý val ne), díl stojí a nestaví
 * se na něm; klešťová jen jednou a s místem za branou, věž jen na hotové klešťové bráně a jednou.
 * Stojící (i rozestavěná) klešťová brána či věž starší vsi u palisády bez ochozu zůstane – dostane
 * „hotovo“, ne důvod (návrh Clauda), novou úroveň tam ale nepřidá. Cena klešťové =
 * `pincerGate.wallM` (24 m) hradby druhu dílu (`pincerArmKind`), věž `towerCost`.
 */
function checkGateUpgrade(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  input: GateUpgradeInput,
): GateCheck | { reason: string } {
  const fort = villageFortifications(state).find((f) => f.id === input.fortificationId);
  const gate = fort?.gates.find((g) => g.segment === input.segment);
  const seg = fort?.segments.find((s) => s.index === input.segment);
  if (!fort || !gate || !seg) return { reason: FORT_UNKNOWN };
  const wall = segmentWall(fort, seg);
  const upgraded = input.level === 'pincer' ? gate.pincerDay : gate.towerDay;
  if (!wall || (upgraded === undefined && !pincerWallAllowed(wall.kind))) {
    return { reason: FORT_GATE_LOW };
  }
  const busy = busySegments(
    state.constructions,
    fort.id,
    fort.segments.map((s) => s.index),
  );
  if (busy.has(seg.index)) return { reason: FORT_BUSY };
  if (!layerBuilt(wall) || !segmentStands(fort, seg)) return { reason: FORT_GATE_DOWN };
  if (input.level === 'tower') {
    if (gate.towerDay !== undefined) return { reason: FORT_TOWER_DONE };
    if (!gatePincerStands(gate, day)) return { reason: FORT_TOWER_NO_PINCER };
    return { cost: towerCost(), gate, room: null };
  }
  if (gate.pincerDay !== undefined) return { reason: FORT_PINCER_DONE };
  const room = pincerRoom(state, day, landscape, obstacles, fort, gate);
  if (!room) return { reason: FORT_GATE_NO_ROOM };
  const cost = fortificationCost(pincerArmKind(wall.kind), FORTIFICATIONS.pincerGate.wallM);
  return { cost, gate, room };
}

/**
 * Cena vylepšení brány pro rozhraní (Brány, Cena) ke dni vsi (`state.lastDay`), nebo důvod, proč
 * nejde (`checkGateUpgrade`). Práce bez kácení a lámání, klády a kámen předem. Stav nemění.
 */
export function gateUpgrade(
  state: VillageState,
  landscape: Landscape,
  input: GateUpgradeInput,
): FortCost | { reason: string } {
  const check = checkGateUpgrade(state, state.lastDay, landscape, obstaclesOf(landscape), input);
  return 'reason' in check ? check : check.cost;
}

/** Vstup práce na bráně pro `pushWork`: díl brány, cena a úroveň. */
function gateWork(
  fort: Fortification,
  gate: FortGate,
  level: GateLevel,
  cost: FortCost,
  room: PincerRoom | null,
): Parameters<typeof pushWork>[3] {
  return {
    fortificationId: fort.id,
    work: 'gate',
    plan: {
      segments: [{ index: gate.segment, cost: cost.laborManDays }],
      wood: cost.logs,
      ...(cost.stoneM3 > 0 ? { stoneM3: [cost.stoneM3] } : {}),
    },
    // klády a kámen se hledají od brány
    center: { x: gate.x, z: gate.z },
    clearedIds: room?.obstacleIds ?? [],
    clearedTrees: room?.clearedTrees ?? 0,
    fortGate: { segment: gate.segment, level },
  };
}

/**
 * Hráč vylepší bránu (fortifications.md – Hradby a obrana, Brány): klešťová brána, nebo věž nad
 * ní. Klešťová – ramena blokují pěšiny od zahájení (`pincerDay: null`), překážky pod nimi
 * osadníci odstraní a ramena vezmou díly polí a sadů; věž – `towerDay: null`. Klády a kámen
 * předem (`pushWork` – `FORT_NO_WOOD`, `FORT_NO_STONE`), stavba `fortWork: 'gate'` na dílu brány.
 * Vstupní stav nemění.
 */
export function startGateUpgrade(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  input: GateUpgradeInput,
  walk?: Walk,
): FortificationResult {
  const check = checkGateUpgrade(state, day, landscape, obstacles, input);
  if ('reason' in check) return { ok: false, reason: check.reason };
  const next = cloneState(state);
  if (check.room) giveWayToBuilding(next, day, check.room.takenLand, 'fortification');
  const fort = villageFortifications(next).find((f) => f.id === input.fortificationId)!;
  const gate = fort.gates.find((g) => g.segment === input.segment)!;
  if (input.level === 'pincer') gate.pincerDay = null;
  else gate.towerDay = null;
  const missing = pushWork(
    next,
    day,
    obstacles,
    gateWork(fort, gate, input.level, check.cost, check.room),
    walk,
  );
  if (missing) return { ok: false, reason: missing };
  return { ok: true, state: next };
}

/**
 * Přestavby dožilých věží nad branami (mutuje stav; Hradby a obrana – Životnost a údržba): věž za
 * životností (`gateTowerIsOld`), na jejímž dílu neběží stavba, obyvatelé přestaví plnou cenou
 * (`towerCost`) – jen když je dřevo, jinak věž chátrá a po `decayYears` spadne
 * (`gateTowerStands`). Stará věž stojí, dokud se nedostaví nová.
 */
export function decideTowerRebuilds(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
): Construction[] {
  const started: Construction[] = [];
  for (const fort of villageFortifications(state)) {
    for (const gate of fort.gates) {
      if (!gateTowerIsOld(gate, day)) continue;
      const busy = busySegments(
        state.constructions,
        fort.id,
        fort.segments.map((s) => s.index),
      );
      if (busy.has(gate.segment)) continue;
      const before = state.constructions.length;
      const missing = pushWork(
        state,
        day,
        obstacles,
        gateWork(fort, gate, 'tower', towerCost(), null),
        undefined,
      );
      if (missing === null && state.constructions.length > before) {
        started.push(state.constructions[state.constructions.length - 1]!);
      }
    }
  }
  return started;
}
