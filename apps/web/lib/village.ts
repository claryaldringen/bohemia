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
  placeSacredBuilding,
  renameVillage,
  type DwellingType,
  type EnterGameResult,
  type Landscape,
  type Position,
  type SacredBuildingKind,
  type TileCell,
  type VillageRepository,
  type VillageResult,
} from '@bohemia/game';
import { getDatabase } from './db';
import { enterGameForPlayer, isGameOverForPlayer } from './game';
import { buildVillageView, type VillageView } from './village-view';
import { currentWorld, gameDayIndex } from './world';

// Composition root vsi: dnešní herní den ze světových hodin, Drizzle repozitář, use-casy
// a převod na VillageView.

export type { PartStage, SceneVillage, VillageView } from './village-view';

/** Výsledek akce nad vsí pro klienta – pohled na ves, nebo chyba česky. */
export type VillageActionResult = VillageView | { error: string };

type Failure = { ok: false; error: string };
type Context =
  { ok: true; playerId: string; settlementId: string; landscape: Landscape; day: number } | Failure;

function villages(): VillageRepository {
  return createVillageRepository(getDatabase());
}

/** Sídlo hráče s krajinou a dnešní den – společný začátek všech akcí. */
async function context(playerId: string): Promise<Context> {
  const today = gameDayIndex(Date.now(), currentWorld());
  if (!today.ok) return today;
  const { settlement, landscape } = await enterGameForPlayer(playerId);
  return { ok: true, playerId, settlementId: settlement.id, landscape, day: today.day };
}

/** Jako `context`, ale pro sídlo, které už volající načetl (krajina se negeneruje znovu). */
function seatContext({ settlement, landscape }: EnterGameResult): Context {
  const today = gameDayIndex(Date.now(), currentWorld());
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

/** Ves už načteného sídla hráče (stránka /game má sídlo s krajinou z `enterGameForPlayer`). */
export function villageViewForSeat(
  seat: EnterGameResult,
): Promise<VillageView | null | { error: string }> {
  return villageView(seatContext(seat));
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
  input: { type: DwellingType; position: Position },
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
