import 'server-only';
import { createVillageRepository } from '@bohemia/db';
import {
  NOT_PLAYER_VILLAGE,
  NO_VILLAGE,
  NO_WORLD_CELL,
  isFullVillage,
  leaveVillage,
  choosePlayerDeparture,
  settleJourney,
  cancelUnfinishedConstruction,
  foundVillageForSettlement,
  declareHuntInVillage,
  forceBadYear,
  forceDisaster,
  type BadYearKind,
  type ForcedDisasterKind,
  nameLineManInVillage,
  setSteward,
  placeCemetery,
  placeDwelling,
  placeField,
  placeOrchard,
  placePen,
  placeSacredBuilding,
  placeThreshingFloor,
  placeWorkshop,
  relocateHousehold,
  renameVillage,
  plantApplesAlongRoad,
  buildWagonRoad,
  upgradeRoad,
  buildTrail,
  sendExpedition,
  villageViewStamp,
  ACTION_RIGHTS,
  type VillageAction,
  type VillageRight,
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
  type DynastyVillage,
  type VillageRecord,
  type VillageRepository,
  type VillageResult,
  type PenSpecies,
} from '@bohemia/game';
import { getDatabase, getPlayerLock } from './db';
import { exclusivePlayer } from './exclusive';
import { cachedVillages, withVillageCache } from '@bohemia/server';
import {
  currentViewStampOfPlayer,
  dynastyOfPlayer,
  dynastyOfPlayerLocked,
  enterGameForPlayer,
  ownMapsOfPlayer,
  firstVillageOfPlayer,
  gameDeps,
  landscapeOfSettlement,
  playerToday,
  playerVillage,
  requireVillageRight,
  villageAccessForPlayer,
  skipTimeForPlayer,
  type GameEntry,
  type PlayerToday,
} from './game';
import { ownMapsAround } from './departure-view';
import type { LeaveVillageInput } from './village-input';
import { lineEndView } from './line-end-view';
import { panelOptionsOf, type PanelAsk, type PanelOptions } from './panel-options';
import { villageListItem } from './village-list';
import { buildVillageView, type VillageView } from './village-view';

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
  return cachedVillages(createVillageRepository(getDatabase()));
}

/** Ves `villageId` hráče s krajinou jejího sídla a jeho dnešní den – společný začátek akcí. */
async function context(
  playerId: string,
  villageId: string,
  /** Právo, které akce vyžaduje (rights.ts); bez něj jen pohled na ves – dívat se smí každý hráč rodu. */
  right?: VillageRight,
): Promise<Context> {
  const today = await playerToday(playerId);
  if (!today.ok) return today;
  const found =
    right === undefined
      ? await playerVillage(playerId, villageId)
      : await requireVillageRight(playerId, villageId, right, today.day);
  if (found === null || typeof found === 'string') {
    return { ok: false, error: found ?? NOT_PLAYER_VILLAGE };
  }
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
 * Akce, která mění stav, pod zámkem hráče (exclusive.ts – fronta v procesu, uvnitř zámek v DB,
 * platí i proti workeru). Den a kontext se načtou AŽ uvnitř
 * zámku – akce zařazená za skok v čase nebo za jinou akci tak dostane aktuální den, ne ten
 * z doby zařazení. Po konci hry (vymřely všechny vsi, nebo rod po meči) server akci nepřijme
 * a vrátí pohled s `gameOver` – klient ukáže obrazovku konce. Konec rodu se zjistí před akcí
 * (`dynastyForVillage` – ze smíšených dnů vsí ho ověří plný dopočet), takže platí hned, ne až
 * v pohledu po akci.
 */
async function guardedAction<T>(
  playerId: string,
  villageId: string,
  action: VillageAction,
  run: (ctx: Extract<Context, { ok: true }>) => Promise<T>,
): Promise<
  | { ok: true; ctx: Extract<Context, { ok: true }>; value: T }
  | { ok: false; result: VillageActionResult }
> {
  const inside = await exclusivePlayer(
    getPlayerLock(),
    playerId,
    async (): Promise<
      | { kind: 'done'; ctx: Extract<Context, { ok: true }>; value: T }
      | { kind: 'error'; error: string }
      | { kind: 'over'; ctx: Extract<Context, { ok: true }> }
    > => {
      const ctx = await context(playerId, villageId, ACTION_RIGHTS[action]);
      if (!ctx.ok) return { kind: 'error', error: ctx.error };
      // zámek už držíme (fronta i DB) – dopočet bez vnořeného zámku; zobrazená ves do dneška,
      // ostatní jen víc než WORKER_LAG_DAYS pozadu (akce sama dopočte každou ves, které se dotkne)
      const status = await dynastyOfPlayerLocked(playerId, ctx.day, ctx.villageId);
      if (status.gameOver) return { kind: 'over', ctx };
      return { kind: 'done', ctx, value: await run(ctx) };
    },
  );
  if (inside.kind === 'error') return { ok: false, result: { error: inside.error } };
  if (inside.kind === 'over') return { ok: false, result: await viewOf(inside.ctx) };
  return { ok: true, ctx: inside.ctx, value: inside.value };
}

/**
 * Pohled na ves z kontextu: ves kontextu se dopočte do dneška, ostatní vsi hráče (přepínač vsí) jsou,
 * jak je drží worker – web je dopočte, jen když jsou víc než `WORKER_LAG_DAYS` pozadu (`dynastyForVillage`; konec hry až po vymření všech). `record` – ves
 * právě uložená akcí (kdyby ji stav rodu nenašel).
 */
async function viewOf(
  ctx: Extract<Context, { ok: true }>,
  record?: VillageRecord,
): Promise<VillageActionResult> {
  const status = await dynastyOfPlayer(ctx.playerId, ctx.day, ctx.villageId);
  // práva v zobrazené vsi a ves seniora (stolec) – rozhoduje jádro, web jen posílá
  const access = await villageAccessForPlayer(ctx.playerId, ctx.villageId, ctx.day);
  // zobrazená ves je celá, vsi jiných map jen souhrnem (`dynastyForVillage`)
  const full = (status.villages as readonly DynastyVillage[]).filter(isFullVillage);
  const listed = full.find((v) => v.id === ctx.villageId);
  const current = listed ?? record;
  if (!current) return { error: NO_VILLAGE };
  const from = status.settlements.find((s) => s.id === current.settlementId);
  const view = buildVillageView(current, ctx.landscape, ctx.day, {
    gameOver: status.gameOver,
    lineEnded: status.gameOver ? lineEndView(status.villages) : null,
    villages: status.villages.map((v) =>
      villageListItem(v, ctx.day, status.playerLord?.villageId, access?.senior?.villageId),
    ),
    ...(access
      ? { rights: { allowed: [...access.rights.allowed], reason: access.rights.reason } }
      : {}),
    ...(access?.pendingDeparture ? { pendingDeparture: access.pendingDeparture } : {}),
    ownMaps: ownMapsAround(status.settlements, status.villages, current.settlementId),
    mapsBlocked: from && from.worldCell === null && !from.isSeat ? NO_WORLD_CELL : null,
  });
  // otisk z vsí hráče, jak je pohled vidí – stejný spočítá levný dotaz (currentViewStampOfPlayer),
  // když by pohled nic nepočítal
  return listed
    ? { ...view, stamp: villageViewStamp(ctx.villageId, ctx.day, status.villages) }
    : view;
}

/**
 * Nabídka panelu (kompas zemských stezek, výsadba jabloní u cesty) vsi `villageId` hráče
 * dopočítané do dneška – stejný stav jako pohled (`viewOf`), jen až na vyžádání panelu
 * (panel-options.ts).
 */
export function panelOptionsForPlayer(
  playerId: string,
  villageId: string,
  ask: PanelAsk,
): Promise<PanelOptions | { error: string }> {
  return withVillageCache(async () => {
    const ctx = await context(playerId, villageId);
    if (!ctx.ok) return { error: ctx.error };
    const status = await dynastyOfPlayer(ctx.playerId, ctx.day, ctx.villageId);
    // zobrazená ves je celá (`dynastyForVillage`)
    const full = (status.villages as readonly DynastyVillage[]).filter(isFullVillage);
    const current = full.find((v) => v.id === ctx.villageId);
    if (!current) return { error: NO_VILLAGE };
    return panelOptionsOf(current.state, ctx.landscape, ctx.day, ask);
  });
}

/** Výsledek use-case jako pohled na ves (s přepínačem vsí), nebo chyba česky. */
async function toActionResult(
  ctx: Extract<Context, { ok: true }>,
  result: VillageResult,
): Promise<VillageActionResult> {
  return result.ok ? viewOf(ctx, result.village) : { error: result.reason };
}

/**
 * Provede akci `name` nad vsí `villageId` hráče – ověří ves a právo akce (`ACTION_RIGHTS`),
 * spustí use-case a vrátí pohled.
 */
async function actOn(
  playerId: string,
  villageId: string,
  name: VillageAction,
  action: (ctx: Extract<Context, { ok: true }>) => Promise<VillageResult>,
): Promise<VillageActionResult> {
  const done = await guardedAction(playerId, villageId, name, action);
  if (!done.ok) return done.result;
  return toActionResult(done.ctx, done.value);
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
 * Dotazování na ves: klient pošle otisk pohledu, který má (`VillageView.stamp`). Když by pohled
 * nic nepočítal (zobrazená ves na dnešku, ostatní nejvýš `WORKER_LAG_DAYS` pozadu) a otisk sedí
 * (žádná ves nemá novou verzi ani jméno, den je stejný), vrátí `{ unchanged: true }` – bez
 * načtení stavů vsí (u velké vsi přes 1 MB JSON) a bez sestavení pohledu. Jinak celý pohled jako
 * `villageViewForPlayer`.
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
  const villageId = entry.villageId;
  if (villageId === null) return null;
  return withVillageCache(() =>
    viewOf({
      ok: true,
      playerId: entry.settlement.ownerId,
      villageId,
      settlementId: entry.settlement.id,
      landscape: entry.landscape,
      day: today.day,
    }),
  );
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
  input: { name: string; dwelling: Position; fieldCells?: TileCell[]; lordName?: string },
): Promise<VillageActionResult> {
  // den se načte až uvnitř zámku – akce za skokem v čase dostane den po skoku
  const inside = await exclusivePlayer(getPlayerLock(), playerId, async () => {
    const today = await playerToday(playerId);
    if (!today.ok) return { kind: 'failed' as const, error: today.error };
    const { settlement, landscape } = await enterGameForPlayer(playerId);
    const result = await foundVillageForSettlement(
      { villages: villages(), seeds: gameDeps().seeds },
      { settlementId: settlement.id, landscape, today: today.day, ...input },
    );
    return { kind: 'found' as const, result, today, settlement, landscape };
  });
  if (inside.kind === 'failed') return { error: inside.error };
  const { result, today, settlement, landscape } = inside;
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

export function placeDwellingForPlayer(
  playerId: string,
  villageId: string,
  input: { type: BuildableDwellingType; position: Position; plot?: DwellingPlot },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'placeDwelling', (ctx) =>
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
  return actOn(playerId, villageId, 'relocateHousehold', (ctx) =>
    relocateHousehold(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

/** Zrušení rozestavěné stavby `constructionId` (cancel-construction.ts). */
export function cancelConstructionForPlayer(
  playerId: string,
  villageId: string,
  input: { constructionId: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'cancelConstruction', (ctx) =>
    cancelUnfinishedConstruction(
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
  return actOn(playerId, villageId, 'placeField', (ctx) =>
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
  return actOn(playerId, villageId, 'placeCemetery', (ctx) =>
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
  return actOn(playerId, villageId, 'placeOrchard', (ctx) =>
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
  return actOn(playerId, villageId, 'placeSacred', (ctx) =>
    placeSacredBuilding(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

export function placeThreshingFloorForPlayer(
  playerId: string,
  villageId: string,
  input: { position: Position },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'placeThreshingFloor', (ctx) =>
    placeThreshingFloor(
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
  return actOn(playerId, villageId, 'placeWorkshop', (ctx) =>
    placeWorkshop(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

/** Hráč pojmenuje vojvodu nebo jeho syna (lord.md – Jména) – ves ověří `actOn`. */
export function nameLineManForPlayer(
  playerId: string,
  villageId: string,
  input: { personId: number; name: string },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'nameLineMan', (ctx) =>
    nameLineManInVillage(
      { villages: villages() },
      { villageId: ctx.villageId, today: ctx.day, landscape: ctx.landscape, ...input },
    ),
  );
}

/** Hráč zapne nebo vypne správce vsi (steward.md – Soužití s hráčem) – ves ověří `actOn`. */
export function setStewardForPlayer(
  playerId: string,
  villageId: string,
  input: { on: boolean },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'setSteward', (ctx) =>
    setSteward(
      { villages: villages() },
      { playerId, villageId: ctx.villageId, today: ctx.day, landscape: ctx.landscape, ...input },
    ),
  );
}

/** Hráč vyhlásí lov navíc na zítřek (wildlife.md – Lov rodu: Kdy) – důvod odepření řeší use-case. */
export function declareHuntForPlayer(
  playerId: string,
  villageId: string,
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'declareHunt', (ctx) =>
    declareHuntInVillage(
      { villages: villages() },
      { villageId: ctx.villageId, today: ctx.day, landscape: ctx.landscape },
    ),
  );
}

/**
 * Vývojový režim (disasters.md – plán P10): vynutí letošní zlý rok, nebo zítřejší pohromu vsi
 * (`disasters.override`). Bez `devMode` use-case odmítne.
 */
export function forceDevDisasterForPlayer(
  playerId: string,
  devMode: boolean,
  villageId: string,
  choice: { kind: 'year'; value: BadYearKind } | { kind: 'disaster'; value: ForcedDisasterKind },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'forceDevDisaster', (ctx) => {
    const input = { villageId: ctx.villageId, devMode, today: ctx.day, landscape: ctx.landscape };
    return choice.kind === 'year'
      ? forceBadYear({ villages: villages() }, { ...input, kind: choice.value })
      : forceDisaster({ villages: villages() }, { ...input, kind: choice.value });
  });
}

export function renameVillageForPlayer(
  playerId: string,
  villageId: string,
  input: { name: string },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'renameVillage', (ctx) =>
    renameVillage(
      { villages: villages() },
      { villageId: ctx.villageId, today: ctx.day, name: input.name, landscape: ctx.landscape },
    ),
  );
}

/**
 * Stavba ohrady s přístřeškem, nebo její rozšíření (oxen.md – Ohrady podle druhu): druh zvířat
 * a čtverce (nejvýš 4), i natočené (`grid`).
 */
export function placePenForPlayer(
  playerId: string,
  villageId: string,
  input: { cells: TileCell[]; species: PenSpecies; grid?: SquareGrid },
): Promise<VillageActionResult> {
  const grid = input.grid;
  return actOn(playerId, villageId, 'placePen', (ctx) =>
    placePen(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        species: input.species,
        cells: input.cells,
        ...(grid ? { grid } : {}),
      },
    ),
  );
}

/** Úprava pevné cesty (roads.md – Vylepšení cesty): úprava, hať přes mokřinu a lávka přes brod. */
export function upgradeRoadForPlayer(
  playerId: string,
  villageId: string,
  input: { roadId: number; upgrade: 'improved' },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'upgradeRoad', (ctx) =>
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

/** Vozová cesta – vlastní trasa mezi konci cesty hráče (roads.md – Vozová cesta). */
export function buildWagonRoadForPlayer(
  playerId: string,
  villageId: string,
  input: { roadId: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'buildWagonRoad', (ctx) =>
    buildWagonRoad(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, roadId: input.roadId },
    ),
  );
}

/** Výsadba jabloní podél pevné cesty (roads.md – Vysazení jabloní). */
export function plantRoadApplesForPlayer(
  playerId: string,
  villageId: string,
  input: { roadId: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'plantRoadApples', (ctx) =>
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
  return actOn(playerId, villageId, 'buildTrail', (ctx) =>
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
  return actOn(playerId, villageId, 'sendExpedition', async (ctx) =>
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
 * Odchod do nové vsi (migration.md – fáze 3 a 4): domácnosti obydlí `dwellingIds` (nebo syn vojvody
 * `sonId` s poměrnou částí vsi – lord.md) odejdou na novou mapu (vrátí pohled na starou ves – lidé
 * jsou na cestě; jedna ves, jedna mapa).
 */
export async function leaveVillageForPlayer(
  playerId: string,
  villageId: string,
  input: LeaveVillageInput,
): Promise<VillageActionResult> {
  const done = await guardedAction(
    playerId,
    villageId,
    'sonId' in input ? 'leaveWithSon' : 'leaveHouseholds',
    (ctx) =>
      leaveVillage(gameDeps(), {
        playerId,
        villageId,
        today: ctx.day,
        ...('sonId' in input ? { sonId: input.sonId } : { dwellingIds: input.dwellingIds }),
        destination: input.destination,
      }),
  );
  if (!done.ok) return done.result;
  const { ctx, value: result } = done;
  if (!result.ok) return { error: result.reason };
  return viewOf(ctx, result.from);
}

/**
 * Hráč v kůži mladšího syna zvolil směr odchodu po pohřbu (seniorate.md, bod 4): výprava vyrazí
 * hned se správcem na cestě vypnutým (vrátí pohled na mateřskou ves).
 */
export async function choosePlayerDepartureForPlayer(
  playerId: string,
  villageId: string,
  input: { direction: Direction8; sonName?: string },
): Promise<VillageActionResult> {
  const done = await guardedAction(playerId, villageId, 'choosePlayerDeparture', (ctx) =>
    choosePlayerDeparture(gameDeps(), {
      playerId,
      villageId: ctx.villageId,
      direction: input.direction,
      ...(input.sonName === undefined ? {} : { sonName: input.sonName }),
      today: ctx.day,
    }),
  );
  if (!done.ok) return done.result;
  const { ctx, value: result } = done;
  if (!result.ok) return { error: result.reason };
  return viewOf(ctx, result.from);
}

/** Lidé dorazili na novou mapu – první zemnice nové vsi (migration.md – fáze 4). */
export async function settleJourneyForPlayer(
  playerId: string,
  villageId: string,
  input: { dwelling: Position },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'settleJourney', (ctx) =>
    settleJourney(gameDeps(), {
      playerId,
      villageId,
      today: ctx.day,
      dwelling: input.dwelling,
    }),
  );
}
