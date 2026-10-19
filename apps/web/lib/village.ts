import 'server-only';
import { createVillageRepository } from '@bohemia/db';
import {
  NOT_PLAYER_VILLAGE,
  NO_VILLAGE,
  NO_WORLD_CELL,
  isVillageTravelling,
  leaveVillage,
  neighbourSnapshot,
  settleJourney,
  type LeaveDestination,
  cancelHouseholdRelocation,
  foundDevVillage,
  foundVillageForSettlement,
  placeCemetery,
  placeDwelling,
  placeField,
  placeOrchard,
  placePen,
  placeSacredBuilding,
  placeWorkshop,
  relocateHousehold,
  renameVillage,
  plantApplesAlongRoad,
  trainTeamInPen,
  upgradeRoad,
  buildTrail,
  sendExpedition,
  villageViewStamp,
  type Craft,
  type DwellingPlot,
  type BuildableDwellingType,
  type Direction8,
  type TradeGoods,
  type TradePeople,
  type Landscape,
  type Position,
  type SacredBuildingKind,
  type SquareGrid,
  type TileCell,
  type TimeSkip,
  type VillageRecord,
  type VillageRepository,
  type VillageResult,
} from '@bohemia/game';
import { getDatabase } from './db';
import {
  currentViewStampOfPlayer,
  dynastyOfPlayer,
  enterGameForPlayer,
  ownMapsOfPlayer,
  firstVillageOfPlayer,
  gameDeps,
  landscapeOfSettlement,
  playerToday,
  playerVillage,
  skipTimeForPlayer,
  type GameEntry,
  type PlayerToday,
} from './game';
import { neighbourScene, ownMapsAround } from './departure-view';
import { villageListItem } from './village-list';
import { buildVillageView, sceneOfVillage, type VillageView } from './village-view';

// Composition root vsi: dnešní herní den hráče (světové hodiny + jeho posun času), Drizzle
// repozitář, use-casy a převod na VillageView. Hráč může mít víc vsí (migration.md – Víc vsí
// jednoho hráče) – každá akce jde podle id vsi a nejdřív se ověří, že ves patří hráči.

export type { PartStage, SceneVillage, VillageView } from './village-view';

/** Výsledek akce nad vsí pro klienta – pohled na ves, nebo chyba česky. */
export type VillageActionResult = VillageView | { error: string };

type Failure = { ok: false; error: string };
/** Ves hráče (ověřená), krajina jejího sídla a dnešní den hráče. */
type Context =
  | {
      ok: true;
      playerId: string;
      villageId: string;
      settlementId: string;
      landscape: Landscape;
      day: number;
    }
  | Failure;

function villages(): VillageRepository {
  return createVillageRepository(getDatabase());
}

/** Ves `villageId` hráče s krajinou jejího sídla a jeho dnešní den – společný začátek akcí. */
async function context(playerId: string, villageId: string): Promise<Context> {
  const today = await playerToday(playerId);
  if (!today.ok) return today;
  const found = await playerVillage(playerId, villageId);
  if (!found) return { ok: false, error: NOT_PLAYER_VILLAGE };
  return {
    ok: true,
    playerId,
    villageId: found.village.id,
    settlementId: found.settlement.id,
    landscape: landscapeOfSettlement(found.settlement),
    day: today.day,
  };
}

/**
 * Pohled na ves z kontextu: všechny vsi hráče se dopočítají do dneška (přepínač vsí, konec hry
 * až po vymření všech) a vrátí se pohled na ves kontextu. `record` – ves právě uložená akcí
 * (kdyby ji dopočet všech vsí nenašel).
 */
async function viewOf(
  ctx: Extract<Context, { ok: true }>,
  record?: VillageRecord,
): Promise<VillageActionResult> {
  const status = await dynastyOfPlayer(ctx.playerId, ctx.day);
  const listed = status.villages.find((v) => v.id === ctx.villageId);
  const current = listed ?? record;
  if (!current) return { error: NO_VILLAGE };
  // jiné vsi na téže mapě (migration.md) – jejich stavby a paseky, a vlastní vsi na sousedních
  // mapách
  const sameMap = status.villages.filter(
    (v) => v.settlementId === current.settlementId && v.id !== current.id,
  );
  const from = status.settlements.find((s) => s.id === current.settlementId);
  const view = buildVillageView(current, ctx.landscape, ctx.day, {
    gameOver: status.gameOver,
    villages: status.villages.map((v) => villageListItem(v, ctx.day)),
    neighbours: neighbourSnapshot(
      sameMap.map((v) => v.state),
      ctx.day,
    ),
    neighbourScenes: sameMap
      .filter((v) => !isVillageTravelling(v.state))
      .map((v) => neighbourScene(sceneOfVillage(v.state, ctx.landscape, ctx.day))),
    ownMaps: ownMapsAround(status.settlements, status.villages, current.settlementId),
    mapsBlocked: from && from.worldCell === null && !from.isSeat ? NO_WORLD_CELL : null,
  });
  // otisk jen z dopočítaných vsí hráče – stejný spočítá levný dotaz (currentViewStampOfPlayer)
  return listed
    ? { ...view, stamp: villageViewStamp(ctx.villageId, ctx.day, status.villages) }
    : view;
}

/** Výsledek use-case jako pohled na ves (s přepínačem vsí), nebo chyba česky. */
async function toActionResult(
  ctx: Extract<Context, { ok: true }>,
  result: VillageResult,
): Promise<VillageActionResult> {
  return result.ok ? viewOf(ctx, result.village) : { error: result.reason };
}

/** Provede akci nad vsí `villageId` hráče – ověří ves, spustí use-case a vrátí pohled. */
async function actOn(
  playerId: string,
  villageId: string,
  action: (ctx: Extract<Context, { ok: true }>) => Promise<VillageResult>,
): Promise<VillageActionResult> {
  const ctx = await context(playerId, villageId);
  if (!ctx.ok) return { error: ctx.error };
  return toActionResult(ctx, await action(ctx));
}

/**
 * Ves hráče dopočítaná do dneška: `villageId` (ověří se, že patří hráči), bez něj jeho první ves;
 * dokud žádnou ves nemá, null.
 */
export async function villageViewForPlayer(
  playerId: string,
  villageId: string | null,
): Promise<VillageView | null | { error: string }> {
  const id = villageId ?? (await firstVillageOfPlayer(playerId))?.village.id ?? null;
  if (id === null) {
    const today = await playerToday(playerId);
    return today.ok ? null : { error: today.error };
  }
  const ctx = await context(playerId, id);
  if (!ctx.ok) return { error: ctx.error };
  return viewOf(ctx);
}

/** Odpověď dotazu na ves, když se od pohledu, který klient má, nic nezměnilo. */
export interface VillageUnchanged {
  unchanged: true;
}

/**
 * Dotazování na ves: klient pošle otisk pohledu, který má (`VillageView.stamp`). Když jsou vsi
 * hráče dopočítané do dneška a otisk sedí (žádná ves nemá novou verzi ani jméno, den je stejný),
 * vrátí `{ unchanged: true }` – bez načtení stavů vsí (u velké vsi přes 1 MB JSON) a bez
 * sestavení pohledu. Jinak celý pohled jako `villageViewForPlayer`.
 */
export async function villageViewIfChanged(
  playerId: string,
  villageId: string,
  known: string,
): Promise<VillageView | VillageUnchanged | null | { error: string }> {
  const today = await playerToday(playerId);
  if (today.ok && (await currentViewStampOfPlayer(playerId, villageId, today.day)) === known) {
    return { unchanged: true };
  }
  return villageViewForPlayer(playerId, villageId);
}

/**
 * Ves, do které hráč vstoupil (stránka /game má sídlo s krajinou z `gameEntryForPlayer` a den
 * z `playerToday`); bez vybrané vsi null (zakládá ves).
 */
export async function villageViewForEntry(
  entry: GameEntry,
  today: PlayerToday,
): Promise<VillageView | null | { error: string }> {
  if (!today.ok) return { error: today.error };
  if (entry.villageId === null) return null;
  return viewOf({
    ok: true,
    playerId: entry.settlement.ownerId,
    villageId: entry.villageId,
    settlementId: entry.settlement.id,
    landscape: entry.landscape,
    day: today.day,
  });
}

/** Výsledek přeskočení času pro klienta – ves v novém dni (null = nezaložená) a nový posun. */
export type TimeSkipResult =
  { village: VillageView | null; timeOffsetDays: number } | { error: string };

/**
 * Vývojový režim: přeskočí čas hráče o měsíc, rok nebo 10 let (`devMode` z účtu – bez něj
 * use-case odmítne) a vrátí ves `villageId` dopočítanou do nového dneška s novým posunem času.
 */
export async function skipTimeForPlayerView(
  playerId: string,
  devMode: boolean,
  skip: TimeSkip,
  villageId: string | null,
): Promise<TimeSkipResult> {
  const skipped = await skipTimeForPlayer(playerId, devMode, skip);
  if (!skipped.ok) return { error: skipped.error };
  const village = await villageViewForPlayer(playerId, villageId);
  if (village !== null && 'error' in village) return village;
  return { village, timeOffsetDays: skipped.offsetDays };
}

/** Založení první vsi na sídelním sídle hráče (první zemnice). */
export async function foundVillageForPlayer(
  playerId: string,
  input: { name: string; dwelling: Position; fieldCells?: TileCell[] },
): Promise<VillageActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const { settlement, landscape } = await enterGameForPlayer(playerId);
  const result = await foundVillageForSettlement(
    { villages: villages(), seeds: gameDeps().seeds },
    { settlementId: settlement.id, landscape, today: today.day, ...input },
  );
  if (!result.ok) return { error: result.reason };
  return viewOf(
    {
      ok: true,
      playerId,
      villageId: result.village.id,
      settlementId: settlement.id,
      landscape,
      day: today.day,
    },
    result.village,
  );
}

/**
 * Vývojový režim: druhá ves na mapě vsi `villageId` (jen pro vyzkoušení přepínače – lidé ze
 * staré vsi neodcházejí). Vrátí pohled na novou ves.
 */
export async function foundDevVillageForPlayer(
  playerId: string,
  devMode: boolean,
  villageId: string,
): Promise<VillageActionResult> {
  const ctx = await context(playerId, villageId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await foundDevVillage(gameDeps(), {
    playerId,
    devMode,
    villageId,
    today: ctx.day,
  });
  if (!result.ok) return { error: result.reason };
  return viewOf({ ...ctx, villageId: result.village.id }, result.village);
}

export function placeDwellingForPlayer(
  playerId: string,
  villageId: string,
  input: { type: BuildableDwellingType; position: Position; plot?: DwellingPlot },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    placeDwelling(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

/** Přestěhování domácnosti obydlí `dwellingId` do nového domu (migration.md). */
export function relocateHouseholdForPlayer(
  playerId: string,
  villageId: string,
  input: {
    dwellingId: number;
    type: BuildableDwellingType;
    position: Position;
    plot?: DwellingPlot;
  },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    relocateHousehold(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

/** Zrušení rozestavěného přestěhování (stavba `constructionId`). */
export function cancelRelocationForPlayer(
  playerId: string,
  villageId: string,
  input: { constructionId: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    cancelHouseholdRelocation(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

export function placeFieldForPlayer(
  playerId: string,
  villageId: string,
  input: { cells: TileCell[]; grid?: SquareGrid },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    placeField(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

export function placeCemeteryForPlayer(
  playerId: string,
  villageId: string,
  input: { cells: TileCell[]; grid?: SquareGrid },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    placeCemetery(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

export function placeOrchardForPlayer(
  playerId: string,
  villageId: string,
  input: { cells: TileCell[]; grid?: SquareGrid },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    placeOrchard(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

export function placeSacredForPlayer(
  playerId: string,
  villageId: string,
  input: { kind: SacredBuildingKind; position: Position },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    placeSacredBuilding(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

export function placeWorkshopForPlayer(
  playerId: string,
  villageId: string,
  input: { craft: Craft; position: Position },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    placeWorkshop(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

export function renameVillageForPlayer(
  playerId: string,
  villageId: string,
  input: { name: string },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    renameVillage(
      { villages: villages() },
      { villageId: ctx.villageId, today: ctx.day, name: input.name, landscape: ctx.landscape },
    ),
  );
}

/** Ohrada je jeden čtverec (oxen.md). */
export const PEN_ONE_SQUARE = 'Ohrada je jeden čtverec.';

/** Stavba ohrady s přístřeškem (oxen.md) – jeden čtverec louky, i natočený (`grid`). */
export function placePenForPlayer(
  playerId: string,
  villageId: string,
  input: { cells: TileCell[]; grid?: SquareGrid },
): Promise<VillageActionResult> {
  const [cell, ...rest] = input.cells;
  if (!cell || rest.length > 0) return Promise.resolve({ error: PEN_ONE_SQUARE });
  const grid = input.grid;
  return actOn(playerId, villageId, (ctx) =>
    placePen(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        cell,
        ...(grid ? { grid } : {}),
      },
    ),
  );
}

/** Výcvik spřežení v ohradě (oxen.md – „Vycvičit spřežení“). */
export function trainTeamForPlayer(
  playerId: string,
  villageId: string,
  input: { penId: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    trainTeamInPen(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        penId: input.penId,
      },
    ),
  );
}

/** Vylepšení pevné cesty (roads.md – Vylepšení cesty): upravená cesta, nebo hať a lávka. */
export function upgradeRoadForPlayer(
  playerId: string,
  villageId: string,
  input: { roadId: number; upgrade: 'improved' | 'causeway' },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    upgradeRoad(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        roadId: input.roadId,
        upgrade: input.upgrade,
      },
    ),
  );
}

/** Výsadba jabloní podél pevné cesty (roads.md – Vysazení jabloní). */
export function plantRoadApplesForPlayer(
  playerId: string,
  villageId: string,
  input: { roadId: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    plantApplesAlongRoad(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, roadId: input.roadId },
    ),
  );
}

/** Zemská stezka ke kraji mapy z dvorce vojvody (trade.md – Zemská stezka). */
export function buildTrailForPlayer(
  playerId: string,
  villageId: string,
  input: { direction: Direction8 },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, (ctx) =>
    buildTrail(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        direction: input.direction,
      },
    ),
  );
}

/** Výprava nosičů k sousedovi po hotové stezce (trade.md – Obchod), i s lidmi (Výměna lidí). */
export function sendExpeditionForPlayer(
  playerId: string,
  villageId: string,
  input: {
    direction: Direction8;
    give: TradeGoods;
    get: TradeGoods;
    givePeople?: TradePeople;
    getPeople?: TradePeople;
  },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, async (ctx) =>
    sendExpedition(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        direction: input.direction,
        give: input.give,
        get: input.get,
        ...(input.givePeople ? { givePeople: input.givePeople } : {}),
        ...(input.getPeople ? { getPeople: input.getPeople } : {}),
        // tím směrem, kde leží vlastní ves, soused bez simulace není (migration.md)
        ownDirections: Object.keys(
          await ownMapsOfPlayer(playerId, ctx.settlementId),
        ) as Direction8[],
      },
    ),
  );
}

/**
 * Odchod do nové vsi (migration.md – fáze 3 a 4): domácnosti obydlí `dwellingIds` odejdou na
 * téže mapě (vrátí pohled na novou ves) nebo na novou mapu (vrátí pohled na starou ves – lidé
 * jsou na cestě).
 */
export async function leaveVillageForPlayer(
  playerId: string,
  villageId: string,
  input: { dwellingIds: number[]; destination: LeaveDestination },
): Promise<VillageActionResult> {
  const ctx = await context(playerId, villageId);
  if (!ctx.ok) return { error: ctx.error };
  const result = await leaveVillage(gameDeps(), {
    playerId,
    villageId,
    today: ctx.day,
    dwellingIds: input.dwellingIds,
    destination: input.destination,
  });
  if (!result.ok) return { error: result.reason };
  return input.destination.kind === 'here'
    ? viewOf({ ...ctx, villageId: result.to.id }, result.to)
    : viewOf(ctx, result.from);
}

/** Lidé dorazili na novou mapu – první zemnice nové vsi (migration.md – fáze 4). */
export async function settleJourneyForPlayer(
  playerId: string,
  villageId: string,
  input: { dwelling: Position },
): Promise<VillageActionResult> {
  const ctx = await context(playerId, villageId);
  if (!ctx.ok) return { error: ctx.error };
  return toActionResult(
    ctx,
    await settleJourney(gameDeps(), {
      playerId,
      villageId,
      today: ctx.day,
      dwelling: input.dwelling,
    }),
  );
}
