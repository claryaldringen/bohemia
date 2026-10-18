import 'server-only';
import { randomInt } from 'node:crypto';
import { createVillageRepository } from '@bohemia/db';
import {
  foundVillageForSettlement,
  isVillageExtinct,
  loadVillage,
  placeCemetery,
  placeDwelling,
  placeField,
  placeOrchard,
  placePen,
  placeSacredBuilding,
  placeWorkshop,
  renameVillage,
  plantApplesAlongRoad,
  trainTeamInPen,
  upgradeRoad,
  type Craft,
  type DwellingPlot,
  type DwellingType,
  type EnterGameResult,
  type Landscape,
  type Position,
  type SacredBuildingKind,
  type TileCell,
  type TimeSkip,
  type VillageRepository,
  type VillageResult,
} from '@bohemia/game';
import { getDatabase } from './db';
import {
  enterGameForPlayer,
  isGameOverForPlayer,
  playerToday,
  skipTimeForPlayer,
  type PlayerToday,
} from './game';
import { buildVillageView, type VillageView } from './village-view';

// Composition root vsi: dnešní herní den hráče (světové hodiny + jeho posun času), Drizzle
// repozitář, use-casy a převod na VillageView.

export type { PartStage, SceneVillage, VillageView } from './village-view';

/** Výsledek akce nad vsí pro klienta – pohled na ves, nebo chyba česky. */
export type VillageActionResult = VillageView | { error: string };

type Failure = { ok: false; error: string };
type Context =
  { ok: true; playerId: string; settlementId: string; landscape: Landscape; day: number } | Failure;

function villages(): VillageRepository {
  return createVillageRepository(getDatabase());
}

/** Sídlo hráče s krajinou a jeho dnešní den – společný začátek všech akcí. */
async function context(playerId: string): Promise<Context> {
  const today = await playerToday(playerId);
  if (!today.ok) return today;
  const { settlement, landscape } = await enterGameForPlayer(playerId);
  return { ok: true, playerId, settlementId: settlement.id, landscape, day: today.day };
}

/**
 * Jako `context`, ale pro sídlo a dnešní den hráče, které už volající načetl (krajina se
 * negeneruje znovu).
 */
function seatContext({ settlement, landscape }: EnterGameResult, today: PlayerToday): Context {
  if (!today.ok) return today;
  return {
    ok: true,
    playerId: settlement.ownerId,
    settlementId: settlement.id,
    landscape,
    day: today.day,
  };
}

/**
 * Pohled na ves sídla. Konec hry (vymřely všechny vsi hráče) se zjišťuje, jen když vymřela tahle
 * ves – živá ves znamená, že hra pokračuje.
 */
async function villageView(ctx: Context): Promise<VillageView | null | { error: string }> {
  if (!ctx.ok) return { error: ctx.error };
  const record = await loadVillage(
    { villages: villages() },
    { settlementId: ctx.settlementId, today: ctx.day, landscape: ctx.landscape },
  );
  if (record === null) return null;
  const gameOver = isVillageExtinct(record.state)
    ? await isGameOverForPlayer(ctx.playerId, ctx.day)
    : false;
  return buildVillageView(record, ctx.landscape, ctx.day, gameOver);
}

function toActionResult(
  result: VillageResult,
  landscape: Landscape,
  day: number,
): VillageActionResult {
  return result.ok ? buildVillageView(result.village, landscape, day) : { error: result.reason };
}

/** Ves hráče dopočítaná do dneška; dokud ves není založená, null. */
export async function villageViewForPlayer(
  playerId: string,
): Promise<VillageView | null | { error: string }> {
  return villageView(await context(playerId));
}

/**
 * Ves už načteného sídla hráče k jeho dnešnímu dni (stránka /game má sídlo s krajinou
 * z `enterGameForPlayer` a den z `playerToday`).
 */
export function villageViewForSeat(
  seat: EnterGameResult,
  today: PlayerToday,
): Promise<VillageView | null | { error: string }> {
  return villageView(seatContext(seat, today));
}

/** Výsledek přeskočení času pro klienta – ves v novém dni (null = nezaložená) a nový posun. */
export type TimeSkipResult =
  { village: VillageView | null; timeOffsetDays: number } | { error: string };

/**
 * Vývojový režim: přeskočí čas hráče o měsíc, nebo rok (`devMode` z účtu – bez něj use-case
 * odmítne) a vrátí ves dopočítanou do nového dneška s novým posunem času.
 */
export async function skipTimeForPlayerView(
  playerId: string,
  devMode: boolean,
  skip: TimeSkip,
): Promise<TimeSkipResult> {
  const skipped = await skipTimeForPlayer(playerId, devMode, skip);
  if (!skipped.ok) return { error: skipped.error };
  const village = await villageViewForPlayer(playerId);
  if (village !== null && 'error' in village) return village;
  return { village, timeOffsetDays: skipped.offsetDays };
}

export async function foundVillageForPlayer(
  playerId: string,
  input: { name: string; dwelling: Position; fieldCells?: TileCell[] },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await foundVillageForSettlement(
    { villages: villages(), seeds: { nextSeed: () => randomInt(0, 2 ** 31) } },
    { settlementId: ctx.settlementId, landscape: ctx.landscape, today: ctx.day, ...input },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}

export async function placeDwellingForPlayer(
  playerId: string,
  input: { type: DwellingType; position: Position; plot?: DwellingPlot },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await placeDwelling(
    { villages: villages() },
    { settlementId: ctx.settlementId, landscape: ctx.landscape, today: ctx.day, ...input },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}

export async function placeFieldForPlayer(
  playerId: string,
  input: { cells: TileCell[] },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await placeField(
    { villages: villages() },
    { settlementId: ctx.settlementId, landscape: ctx.landscape, today: ctx.day, ...input },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}

export async function placeCemeteryForPlayer(
  playerId: string,
  input: { cells: TileCell[] },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await placeCemetery(
    { villages: villages() },
    { settlementId: ctx.settlementId, landscape: ctx.landscape, today: ctx.day, ...input },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}

export async function placeOrchardForPlayer(
  playerId: string,
  input: { cells: TileCell[] },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await placeOrchard(
    { villages: villages() },
    { settlementId: ctx.settlementId, landscape: ctx.landscape, today: ctx.day, ...input },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}

export async function placeSacredForPlayer(
  playerId: string,
  input: { kind: SacredBuildingKind; position: Position },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await placeSacredBuilding(
    { villages: villages() },
    { settlementId: ctx.settlementId, landscape: ctx.landscape, today: ctx.day, ...input },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}

export async function placeWorkshopForPlayer(
  playerId: string,
  input: { craft: Craft; position: Position },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await placeWorkshop(
    { villages: villages() },
    { settlementId: ctx.settlementId, landscape: ctx.landscape, today: ctx.day, ...input },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}

export async function renameVillageForPlayer(
  playerId: string,
  input: { name: string },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await renameVillage(
    { villages: villages() },
    { settlementId: ctx.settlementId, today: ctx.day, name: input.name, landscape: ctx.landscape },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}

/** Stavba ohrady s přístřeškem (oxen.md) – jeden čtverec louky. */
export async function placePenForPlayer(
  playerId: string,
  input: { cells: TileCell[] },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const [cell, ...rest] = input.cells;
  if (!cell || rest.length > 0) return { error: PEN_ONE_SQUARE };
  const result = await placePen(
    { villages: villages() },
    { settlementId: ctx.settlementId, landscape: ctx.landscape, today: ctx.day, cell },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}

/** Ohrada je jeden čtverec (oxen.md). */
export const PEN_ONE_SQUARE = 'Ohrada je jeden čtverec.';

/** Výcvik spřežení v ohradě (oxen.md – „Vycvičit spřežení“). */
export async function trainTeamForPlayer(
  playerId: string,
  input: { penId: number },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await trainTeamInPen(
    { villages: villages() },
    {
      settlementId: ctx.settlementId,
      landscape: ctx.landscape,
      today: ctx.day,
      penId: input.penId,
    },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}

/** Vylepšení pevné cesty (roads.md – Vylepšení cesty): upravená cesta, nebo hať a lávka. */
export async function upgradeRoadForPlayer(
  playerId: string,
  input: { roadId: number; upgrade: 'improved' | 'causeway' },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await upgradeRoad(
    { villages: villages() },
    {
      settlementId: ctx.settlementId,
      landscape: ctx.landscape,
      today: ctx.day,
      roadId: input.roadId,
      upgrade: input.upgrade,
    },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}

/** Výsadba jabloní podél pevné cesty (roads.md – Vysazení jabloní). */
export async function plantRoadApplesForPlayer(
  playerId: string,
  input: { roadId: number },
): Promise<VillageActionResult> {
  const ctx = await context(playerId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await plantApplesAlongRoad(
    { villages: villages() },
    {
      settlementId: ctx.settlementId,
      landscape: ctx.landscape,
      today: ctx.day,
      roadId: input.roadId,
    },
  );
  return toActionResult(result, ctx.landscape, ctx.day);
}
