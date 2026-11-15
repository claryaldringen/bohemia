import 'server-only';
import {
  createHouseRepository,
  createSettlementRepository,
  createStewardshipRepository,
  createVassalageRepository,
  createVillageRepository,
} from '@bohemia/db';
import {
  baptizeLord,
  ennobleVillager,
  NOT_PLAYER_VILLAGE,
  NO_VILLAGE,
  NO_WORLD_CELL,
  isFullVillage,
  leaveVillage,
  choosePlayerDeparture,
  settleJourney,
  abandonVillageFieldParts,
  cancelUnfinishedConstruction,
  abandonVillageStructure,
  demolishVillageStructure,
  restoreVillageStructure,
  type UsableStructure,
  foundVillageForSettlement,
  newcomerFoundingReason,
  declareHuntInVillage,
  setDefenseStanceInVillage,
  forceBadYear,
  forceDisaster,
  type BadYearKind,
  type DefenseStance,
  type ForcedDisasterKind,
  nameLineManInVillage,
  setSteward,
  placeCemetery,
  placeDwelling,
  placeField,
  placeOrchard,
  placePen,
  placeFortification,
  upgradeFortification,
  addFortificationGate,
  demolishFortificationSection,
  demolishFortificationGate,
  abandonFortificationGate,
  rerouteFortificationSection,
  fillFortificationGateGap,
  addFortificationRampart,
  fillFortificationMoat,
  upgradeFortificationGate,
  placeSacredBuilding,
  placeThreshingFloor,
  placeQuarry,
  placeChurchForVillage,
  orderStoneQuarrying,
  inviteLodgeForVillage,
  inviteMasterForVillage,
  placeWorkshop,
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
  type HouseType,
  type ChurchDims,
  type ChurchType,
  type MasonCraft,
  type MasonryCircle,
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
  type FortKind,
  type FortTop,
  type WallKind,
} from '@bohemia/game';
import { getDatabase, getPlayerLock } from './db';
import { exclusivePlayer } from './exclusive';
import { cachedVillages, withVillageCache } from '@bohemia/server';
import {
  currentStewardViewStampOfPlayer,
  currentViewStampOfPlayer,
  dynastyOfPlayer,
  dynastyOfPlayerLocked,
  enterGameForPlayer,
  ownMapsOfPlayer,
  firstVillageOfPlayer,
  gameDeps,
  landscapeOfSettlement,
  playerToday,
  lockOwnerOf,
  playerVillage,
  requireVillageRight,
  stewardedVillagesOf,
  stewardships,
  villageAccessForPlayer,
  skipTimeForPlayer,
  type GameEntry,
  type PlayerToday,
} from './game';
import { ownMapsAround } from './departure-view';
import type { LeaveVillageInput } from './village-input';
import { lineEndView } from './line-end-view';
import { panelOptionsOf, type PanelAsk, type PanelOptions } from './panel-options';
import { chroniclePage, type ChronicleAsk, type ChroniclePage } from './chronicle-view';
import { villageListItem, type VillageListItem } from './village-list';
import { buildVillageView, type VillageView } from './village-view';

// Composition root vsi: dnešní herní den hráče (světové hodiny + jeho posun času), Drizzle
// repozitář, use-casy a převod na VillageView. Hráč může mít víc vsí (migration.md – Víc vsí
// jednoho hráče) – každá akce jde podle id vsi a nejdřív se ověří, že ves patří hráči.

export type { PartStage, SceneVillage, VillageView } from './village-view';

/** Výsledek akce nad vsí pro klienta – pohled na ves, nebo chyba česky. */
export type VillageActionResult = VillageView | { error: string };

type Failure = { ok: false; error: string };
/**
 * Ves hráče (ověřená), krajina jejího sídla a dnešní den. `playerId` je **držitel vsi** (vlastník
 * sídla) – za něj běží use-casy, dopočet i zámek; `actorId` je hráč, který jedná (u vlastní vsi
 * tentýž, u spravované cizí vsi správce). Den je den držitele (jeho posun času).
 */
type Context =
  | {
      ok: true;
      playerId: string;
      actorId: string;
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
  actorId: string,
  villageId: string,
  /** Právo, které akce vyžaduje (rights.ts); bez něj jen pohled na ves – dívat se smí každý hráč rodu. */
  right?: VillageRight,
  /** Držitel vsi, pokud ho volající už zjistil (`lockOwnerOf`); jinak se zjistí tady. */
  holderId?: string,
): Promise<Context> {
  const holder = holderId ?? (await lockOwnerOf(actorId, villageId));
  const today = await playerToday(holder);
  if (!today.ok) return today;
  const found =
    right === undefined
      ? await playerVillage(actorId, villageId)
      : await requireVillageRight(actorId, villageId, right, today.day);
  // správa mezitím skončila / ves změnila držitele: den a zámek patřily jinému hráči
  if (found === null || typeof found === 'string' || found.settlement.ownerId !== holder) {
    return { ok: false, error: typeof found === 'string' ? found : NOT_PLAYER_VILLAGE };
  }
  return {
    ok: true,
    playerId: holder,
    actorId,
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
  // zámek vsi je zámek jejího držitele: správce cizí vsi jede pod zámkem držitele, ne pod vlastním
  // (jeden zámek, nikdy vnořený); den a práva se čtou až uvnitř
  const holderId = await lockOwnerOf(playerId, villageId);
  const inside = await exclusivePlayer(
    getPlayerLock(),
    holderId,
    async (): Promise<
      | { kind: 'done'; ctx: Extract<Context, { ok: true }>; value: T }
      | { kind: 'error'; error: string }
      | { kind: 'over'; ctx: Extract<Context, { ok: true }> }
    > => {
      const ctx = await context(playerId, villageId, ACTION_RIGHTS[action], holderId);
      if (!ctx.ok) return { kind: 'error', error: ctx.error };
      // zámek už držíme (fronta i DB) – dopočet bez vnořeného zámku; zobrazená ves do dneška,
      // ostatní jen víc než WORKER_LAG_DAYS pozadu (akce sama dopočte každou ves, které se dotkne)
      const status = await dynastyOfPlayerLocked(ctx.playerId, ctx.day, ctx.villageId);
      if (status.gameOver) {
        // konec rodu držitele správci nic neprozradí
        return ctx.actorId === ctx.playerId
          ? { kind: 'over', ctx }
          : { kind: 'error', error: NOT_PLAYER_VILLAGE };
      }
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
  const stewarding = ctx.actorId !== ctx.playerId;
  const status = await dynastyOfPlayer(ctx.playerId, ctx.day, ctx.villageId);
  // práva hráče, který jedná (u spravované cizí vsi správce), v zobrazené vsi a ves seniora (stolec)
  // – rozhoduje jádro, web jen posílá
  const access = await villageAccessForPlayer(ctx.actorId, ctx.villageId, ctx.day);
  // zobrazená ves je celá, vsi jiných map jen souhrnem (`dynastyForVillage`)
  const full = (status.villages as readonly DynastyVillage[]).filter(isFullVillage);
  const listed = full.find((v) => v.id === ctx.villageId);
  const current = listed ?? record;
  if (!current) return { error: NO_VILLAGE };
  const from = status.settlements.find((s) => s.id === current.settlementId);
  // správce vidí jen zobrazenou ves: konec rodu, mapy a ostatní vsi držitele mu nepatří
  const view = buildVillageView(current, ctx.landscape, ctx.day, {
    gameOver: stewarding ? false : status.gameOver,
    lineEnded: !stewarding && status.gameOver ? lineEndView(status.villages) : null,
    villages: await switcherItems(ctx, status, access?.senior?.villageId),
    ...(access
      ? { rights: { allowed: [...access.rights.allowed], reason: access.rights.reason } }
      : {}),
    ...(access?.pendingDeparture ? { pendingDeparture: access.pendingDeparture } : {}),
    ...(access?.baptizable ? { baptizable: true } : {}),
    ownMaps: stewarding
      ? {}
      : ownMapsAround(status.settlements, status.villages, current.settlementId),
    mapsBlocked:
      !stewarding && from && from.worldCell === null && !from.isSeat && !from.localCell
        ? NO_WORLD_CELL
        : null,
  });
  // rod zajatců (výkupné jen rodu protistrany): ves původu → majitel → jeho živý rod
  const prisoners = view.manor?.prisoners;
  if (view.manor && prisoners) {
    const deps = gameDeps();
    const owners = new Map<string, string | undefined>();
    for (const p of prisoners) {
      if (!owners.has(p.homeVillageId)) {
        const home = await deps.villages.find(p.homeVillageId);
        const settlement = home ? await deps.settlements.find(home.settlementId) : null;
        const house = settlement?.ownerId ? await deps.houses.activeOf(settlement.ownerId) : null;
        owners.set(p.homeVillageId, house?.id);
      }
    }
    view.manor.prisoners = prisoners.map((p) => {
      const houseId = owners.get(p.homeVillageId);
      return houseId ? { ...p, houseId } : p;
    });
  }
  // otisk z vsí hráče, jak je pohled vidí – stejný spočítá levný dotaz (currentViewStampOfPlayer),
  // když by pohled nic nepočítal; u spravované vsi otisk správce (jen to, co správce vidí)
  if (!listed) return view;
  if (!stewarding)
    return { ...view, stamp: villageViewStamp(ctx.villageId, ctx.day, status.villages) };
  const stamp = await currentStewardViewStampOfPlayer(ctx.actorId, ctx.villageId);
  return stamp === null ? view : { ...view, stamp };
}

/**
 * Přepínač vsí hráče, který jedná: jeho vlastní vsi (u správce cizí vsi z pohledu jeho rodu, ne
 * držitelova) a vsi cizích držitelů, které spravuje (ikona klíče). Řádky držitele se správci nikdy
 * nedostanou – ani jména jeho ostatních vsí.
 */
async function switcherItems(
  ctx: Extract<Context, { ok: true }>,
  status: Awaited<ReturnType<typeof dynastyOfPlayer>>,
  seniorVillageId: string | undefined,
): Promise<VillageListItem[]> {
  let own: VillageListItem[] = [];
  if (ctx.actorId === ctx.playerId) {
    const house = await createHouseRepository(getDatabase()).activeOf(ctx.playerId);
    const npcStewarded = new Set(
      house
        ? (await stewardships().listByHolderHouse(house.id))
            .filter((s) => s.kind === 'npc')
            .map((s) => s.villageId)
        : [],
    );
    own = status.villages.map((v) => ({
      ...villageListItem(v, ctx.day, status.playerLord?.villageId, seniorVillageId),
      ...(npcStewarded.has(v.id) ? { npcSteward: true as const } : {}),
    }));
  } else {
    const first = await firstVillageOfPlayer(ctx.actorId);
    const today = first ? await playerToday(ctx.actorId) : null;
    if (first && today?.ok) {
      const mine = await dynastyOfPlayer(ctx.actorId, today.day, first.village.id);
      own = mine.villages.map((v) => villageListItem(v, today.day, mine.playerLord?.villageId));
    }
  }
  const stewarded = (await stewardedVillagesOf(ctx.actorId)).map((record): VillageListItem => ({
    ...villageListItem(record, ctx.day),
    stewarded: true,
  }));
  return [...own, ...stewarded];
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

/**
 * Stránka kroniky vsi `villageId` (panel Kronika – chronicle-view.ts): vidět ji smí, kdo smí vidět
 * pohled na ves (`context` bez práva), ze stavu dopočítaného do dneška jako pohled.
 */
export function chronicleForPlayer(
  playerId: string,
  villageId: string,
  ask: ChronicleAsk,
): Promise<ChroniclePage | { error: string }> {
  return withVillageCache(async () => {
    const ctx = await context(playerId, villageId);
    if (!ctx.ok) return { error: ctx.error };
    const status = await dynastyOfPlayer(ctx.playerId, ctx.day, ctx.villageId);
    const full = (status.villages as readonly DynastyVillage[]).filter(isFullVillage);
    const current = full.find((v) => v.id === ctx.villageId);
    if (!current) return { error: NO_VILLAGE };
    return chroniclePage(current.state.chronicle, current.name, ask, current.state.seed);
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
  if (today.ok) {
    // vlastní ves podle otisku držitele, spravovaná cizí ves podle otisku správce
    const stamp =
      (await currentViewStampOfPlayer(playerId, villageId, today.day)) ??
      (await currentStewardViewStampOfPlayer(playerId, villageId));
    if (stamp === known) return { unchanged: true };
  }
  return villageViewForPlayer(playerId, villageId);
}

/**
 * Ves, do které hráč vstoupil (stránka /game má sídlo s krajinou z `gameEntryForPlayer` a den
 * z `playerToday`); bez vybrané vsi null (zakládá ves).
 */
export async function villageViewForEntry(
  entry: GameEntry,
  todayOfActor: PlayerToday,
  /** Hráč, který hru otevřel (u spravované cizí vsi jiný než držitel sídla). */
  actorId: string = entry.settlement.ownerId,
): Promise<VillageView | null | { error: string }> {
  if (!todayOfActor.ok) return { error: todayOfActor.error };
  const villageId = entry.villageId;
  if (villageId === null) return null;
  // ves cizího držitele jde podle dne držitele (jeho posun času), ne správcova
  const today =
    actorId === entry.settlement.ownerId
      ? todayOfActor
      : await playerToday(entry.settlement.ownerId);
  if (!today.ok) return { error: today.error };
  return withVillageCache(() =>
    viewOf({
      ok: true,
      playerId: entry.settlement.ownerId,
      actorId,
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
    // odříznutý nováček zakládá ves až po volbě cesty (newcomers.md) – klient to jen předchází
    const choose = await newcomerFoundingReason(gameDeps().houses, playerId);
    if (choose !== null) return { kind: 'failed' as const, error: choose };
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
      actorId: playerId,
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

/** Opuštění dílů pole, nebo jejich vrácení do osevu (abandon-field-parts.ts). */
export function abandonFieldPartsForPlayer(
  playerId: string,
  villageId: string,
  input: { partIds: number[]; abandon: boolean },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'abandonFieldParts', (ctx) =>
    abandonVillageFieldParts(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

/** Opuštění stavby (structure-use.ts – demolition.md, Opustit a zbourat). */
export function abandonStructureForPlayer(
  playerId: string,
  villageId: string,
  input: { structure: UsableStructure; id: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'abandonStructure', (ctx) =>
    abandonVillageStructure(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

/** Zbourání stavby – bourání ze společné práce vsi (structure-use.ts). */
export function demolishStructureForPlayer(
  playerId: string,
  villageId: string,
  input: { structure: UsableStructure; id: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'demolishStructure', (ctx) =>
    demolishVillageStructure(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

/** Vrácení opuštěné stavby do užívání (structure-use.ts). */
export function restoreStructureForPlayer(
  playerId: string,
  villageId: string,
  input: { structure: UsableStructure; id: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'restoreStructure', (ctx) =>
    restoreVillageStructure(
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

/** Lom na skalním výchozu (fortifications.md – Kámen). */
export function placeQuarryForPlayer(
  playerId: string,
  villageId: string,
  input: { position: Position },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'placeQuarry', (ctx) =>
    placeQuarry(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

/**
 * Kostel (churches.md – Stavba): typ okruhu huti, rozměry lodi, střed a natočení osy vstup →
 * kněžiště – bez ceny předem; huť, lom a místo ověří use-case.
 */
export function placeChurchForPlayer(
  playerId: string,
  villageId: string,
  input: { type: ChurchType; dims: ChurchDims; position: Position },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'placeChurch', (ctx) =>
    placeChurchForVillage(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

/** Nalámat do zásoby `m3` kamene v lomu `outcropId` (fortifications.md – Kámen). */
export function orderStoneQuarryingForPlayer(
  playerId: string,
  villageId: string,
  input: { outcropId: number; m3: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'orderStoneQuarrying', (ctx) =>
    orderStoneQuarrying(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

/** Vojvoda pozve stavební huť okruhu `circle` (stone-masonry.md – Stavební huť). */
export function inviteLodgeForPlayer(
  playerId: string,
  villageId: string,
  input: { circle: MasonryCircle },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'inviteLodge', (ctx) =>
    inviteLodgeForVillage(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

/** Vojvoda pozve mistra chybějícího oboru stejného okruhu (stone-masonry.md). */
export function inviteMasterForPlayer(
  playerId: string,
  villageId: string,
  input: { craft: MasonCraft },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'inviteMaster', (ctx) =>
    inviteMasterForVillage(
      { villages: villages() },
      { villageId: ctx.villageId, landscape: ctx.landscape, today: ctx.day, ...input },
    ),
  );
}

export function placeWorkshopForPlayer(
  playerId: string,
  villageId: string,
  input: { craft: Craft; position: Position; type?: HouseType },
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

/**
 * Hráč povýší vesničana vsi `villageId` do šlechtického stavu pro svou ves bez vojvody
 * (vassalage.md – Povýšení vesničana) – právo `ennoble` ověří `actOn` ve vsi, odkud muž jde.
 */
export function ennobleVillagerForPlayer(
  playerId: string,
  villageId: string,
  input: { personId: number; targetVillageId: string },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'ennobleVillager', async (ctx): Promise<VillageResult> => {
    const db = getDatabase();
    const done = await ennobleVillager(
      {
        settlements: createSettlementRepository(db),
        villages: villages(),
        houses: createHouseRepository(db),
        vassalages: createVassalageRepository(db),
        stewardships: createStewardshipRepository(db),
      },
      {
        playerId: ctx.playerId,
        fromVillageId: ctx.villageId,
        personId: input.personId,
        targetVillageId: input.targetVillageId,
        today: ctx.day,
        at: new Date(),
      },
    );
    if (!done.ok) return done;
    const village = await villages().find(ctx.villageId);
    return village ? { ok: true, village } : { ok: false, reason: NO_VILLAGE };
  });
}

/**
 * Hráč nechá pokřtít vojvodu svého rodu (christianity.md – Křest rodu) – právo `ennoble` ověří
 * `actOn`, zbytek (rod zná, není pokřtěný, vojvoda tu žije) use-case. Vsi rodu se to dozvědí
 * schránkou, ves vojvody se pokřtí hned (D76).
 */
export function baptizeLordForPlayer(
  playerId: string,
  villageId: string,
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'baptizeLord', async (ctx): Promise<VillageResult> => {
    const db = getDatabase();
    const done = await baptizeLord(
      {
        settlements: createSettlementRepository(db),
        villages: villages(),
        houses: createHouseRepository(db),
        stewardships: createStewardshipRepository(db),
      },
      {
        playerId: ctx.playerId,
        villageId: ctx.villageId,
        today: ctx.day,
        landscape: ctx.landscape,
      },
    );
    if (!done.ok) return done;
    const village = await villages().find(ctx.villageId);
    return village ? { ok: true, village } : { ok: false, reason: NO_VILLAGE };
  });
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
      {
        playerId: ctx.playerId,
        villageId: ctx.villageId,
        today: ctx.day,
        landscape: ctx.landscape,
        ...input,
      },
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

/** Hráč nastaví postoj vsi před cizím vojskem (war.md – Obránci); právo `war`. */
export function setDefenseStanceForPlayer(
  playerId: string,
  villageId: string,
  stance: DefenseStance,
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'setDefenseStance', (ctx) =>
    setDefenseStanceInVillage(
      { villages: villages() },
      { villageId: ctx.villageId, stance, today: ctx.day, landscape: ctx.landscape },
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

/**
 * Stavba opevnění (fortifications.md – Obvod, Cena a stavba): body obvodu a druh. Server tvar
 * a umístění spočítá a ověří znovu (`checkFortificationPlacement`).
 */
export function placeFortificationForPlayer(
  playerId: string,
  villageId: string,
  input: { points: [number, number][]; kind: FortKind },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'placeFortification', (ctx) =>
    placeFortification(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        points: input.points,
        kind: input.kind,
      },
    ),
  );
}

/**
 * Vylepšení opevnění (fortifications.md – Druhy): plot na palisádu, nebo nástavba na valu; s cílovou
 * hradbou úsek s dílem `segment` (null – „Vylepšit vše“) na vyšší stupeň (`startSectionUpgrade`).
 */
export function upgradeFortificationForPlayer(
  playerId: string,
  villageId: string,
  input: {
    fortificationId: number;
    work: 'upgrade' | 'top';
    top?: FortTop;
    target?: WallKind;
    segment?: number | null;
  },
): Promise<VillageActionResult> {
  const { top, target } = input;
  return actOn(playerId, villageId, 'upgradeFortification', (ctx) =>
    upgradeFortification(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        fortificationId: input.fortificationId,
        work: input.work,
        ...(top ? { top } : {}),
        ...(target ? { target, segment: input.segment ?? null } : {}),
      },
    ),
  );
}

/**
 * Doplnění valu s příkopem pod stojící hradbu úseku s dílem `segment` (null – celé opevnění;
 * fortifications.md – Hradby a obrana, Druhy) – server úsek, pás a cenu spočítá znovu.
 */
export function addFortificationRampartForPlayer(
  playerId: string,
  villageId: string,
  input: { fortificationId: number; segment: number | null },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'addFortificationRampart', (ctx) =>
    addFortificationRampart(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        fortificationId: input.fortificationId,
        segment: input.segment,
      },
    ),
  );
}

/** Napuštění příkopu úseku s dílem `segment` (fortifications.md – Hradby a obrana, Druhy). */
export function fillFortificationMoatForPlayer(
  playerId: string,
  villageId: string,
  input: { fortificationId: number; segment: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'fillFortificationMoat', (ctx) =>
    fillFortificationMoat(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        fortificationId: input.fortificationId,
        segment: input.segment,
      },
    ),
  );
}

/** Klešťová brána, nebo věž nad branou v dílu `segment` (fortifications.md – Hradby a obrana, Brány). */
export function upgradeFortificationGateForPlayer(
  playerId: string,
  villageId: string,
  input: { fortificationId: number; segment: number; level: 'pincer' | 'tower' },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'upgradeFortificationGate', (ctx) =>
    upgradeFortificationGate(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        fortificationId: input.fortificationId,
        segment: input.segment,
        level: input.level,
      },
    ),
  );
}

/** Brána opevnění kliknutím na obvod (fortifications.md – Brány). */
export function addFortificationGateForPlayer(
  playerId: string,
  villageId: string,
  input: { fortificationId: number; position: { x: number; z: number } },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'addFortificationGate', (ctx) =>
    addFortificationGate(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        fortificationId: input.fortificationId,
        position: { x: input.position.x, z: input.position.z },
      },
    ),
  );
}

/**
 * Zboření úseku opevnění mezi branami (demolition.md – Opevnění): díl, na který hráč klikl – úsek,
 * práci a klády spočítá server znovu (`sectionDemolition`).
 */
export function demolishFortificationSectionForPlayer(
  playerId: string,
  villageId: string,
  input: { fortificationId: number; segment: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'demolishFortificationSection', (ctx) =>
    demolishFortificationSection(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        fortificationId: input.fortificationId,
        segment: input.segment,
      },
    ),
  );
}

/**
 * Zboření brány (demolition.md – Rozhodnutí): brána dílu `segment` – práci a klády spočítá server
 * znovu (`gateDemolition`).
 */
export function demolishFortificationGateForPlayer(
  playerId: string,
  villageId: string,
  input: { fortificationId: number; segment: number },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'demolishFortificationGate', (ctx) =>
    demolishFortificationGate(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        fortificationId: input.fortificationId,
        segment: input.segment,
      },
    ),
  );
}

/** Opustit (`abandoned` true) nebo Vrátit bránu dílu `segment` (demolition.md – Rozhodnutí). */
export function abandonFortificationGateForPlayer(
  playerId: string,
  villageId: string,
  input: { fortificationId: number; segment: number; abandoned: boolean },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'abandonFortificationGate', (ctx) =>
    abandonFortificationGate(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        fortificationId: input.fortificationId,
        segment: input.segment,
        abandoned: input.abandoned,
      },
    ),
  );
}

/**
 * Úsek od brány k bráně jinudy (demolition.md – Rozhodnutí): zbořený úsek s dílem `segment` po nové
 * trase z bodů – tvar, umístění a cenu spočítá server znovu (`startSectionReroute`).
 */
export function rerouteFortificationSectionForPlayer(
  playerId: string,
  villageId: string,
  input: { fortificationId: number; segment: number; points: [number, number][]; target: WallKind },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'rerouteFortificationSection', (ctx) =>
    rerouteFortificationSection(
      { villages: villages(), campaigns: gameDeps().campaigns },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        fortificationId: input.fortificationId,
        segment: input.segment,
        points: input.points,
        target: input.target,
      },
    ),
  );
}

/**
 * Otvor po zbořené bráně mezi stojící hradbou zastaví hradba dílu (demolition.md – Rozhodnutí, D45)
 * – druh z rozcestníku, cenu a kusy po stranách ověří server (`startGateGapFill`).
 */
export function fillFortificationGateGapForPlayer(
  playerId: string,
  villageId: string,
  input: { fortificationId: number; segment: number; target: FortKind },
): Promise<VillageActionResult> {
  return actOn(playerId, villageId, 'fillFortificationGateGap', (ctx) =>
    fillFortificationGateGap(
      { villages: villages() },
      {
        villageId: ctx.villageId,
        landscape: ctx.landscape,
        today: ctx.day,
        fortificationId: input.fortificationId,
        segment: input.segment,
        target: input.target,
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
          await ownMapsOfPlayer(ctx.playerId, ctx.settlementId),
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
        playerId: ctx.playerId,
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
      playerId: ctx.playerId,
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
      playerId: ctx.playerId,
      villageId,
      today: ctx.day,
      dwelling: input.dwelling,
    }),
  );
}

/** Kontext akce války: držitel (hráč), shromaždiště a dnešní den – bez krajiny a pohledu. */
export interface WarContext {
  playerId: string;
  villageId: string;
  day: number;
}

/** Výsledek `guardedAction` akce války: hodnota, nebo chyba česky (konec hry = chyba). */
function warResult<T>(done: Awaited<ReturnType<typeof guardedAction<T>>>): T | { error: string } {
  if (done.ok) return done.value;
  return 'error' in done.result ? { error: done.result.error } : { error: 'Hra skončila.' };
}

/**
 * Odhad tažení (war.md) nad shromaždištěm `villageId`, kterou smí hráč řídit s právem `war` – pod
 * zámkem hráče jako ostatní akce. Chyba (cizí ves, správce, konec hry) jako `{ error }` česky.
 */
export async function planCampaignActionForPlayer<T>(
  playerId: string,
  villageId: string,
  run: (ctx: WarContext) => Promise<T>,
): Promise<T | { error: string }> {
  const done = await guardedAction(playerId, villageId, 'planCampaign', (ctx) =>
    run({ playerId: ctx.playerId, villageId: ctx.villageId, day: ctx.day }),
  );
  return warResult(done);
}

/** Vyslání tažení (war.md) ze shromaždiště `villageId` – stejně jako odhad, s vlastním právem. */
/** Svolání vazalů do cílové vsi `villageId` – právo `war` (vassalage.md – Svolání). */
export async function summonVassalsActionForPlayer<T>(
  playerId: string,
  villageId: string,
  run: (ctx: WarContext) => Promise<T>,
): Promise<T | { error: string }> {
  const done = await guardedAction(playerId, villageId, 'summonVassals', (ctx) =>
    run({ playerId: ctx.playerId, villageId: ctx.villageId, day: ctx.day }),
  );
  return warResult(done);
}

/** Výprava (expeditions.md) z vlastní vsi `villageId` – právo `war`, zámek hráče. */
export async function journeyActionForPlayer<T>(
  playerId: string,
  villageId: string,
  run: (ctx: WarContext) => Promise<T>,
): Promise<T | { error: string }> {
  const done = await guardedAction(playerId, villageId, 'launchExpedition', (ctx) =>
    run({ playerId: ctx.playerId, villageId: ctx.villageId, day: ctx.day }),
  );
  return warResult(done);
}

export async function requestProtectionActionForPlayer<T>(
  playerId: string,
  villageId: string,
  run: (ctx: WarContext) => Promise<T>,
): Promise<T | { error: string }> {
  const done = await guardedAction(playerId, villageId, 'requestProtection', (ctx) =>
    run({ playerId: ctx.playerId, villageId: ctx.villageId, day: ctx.day }),
  );
  return warResult(done);
}

export async function launchCampaignActionForPlayer<T>(
  playerId: string,
  villageId: string,
  run: (ctx: WarContext) => Promise<T>,
): Promise<T | { error: string }> {
  const done = await guardedAction(playerId, villageId, 'launchCampaign', (ctx) =>
    run({ playerId: ctx.playerId, villageId: ctx.villageId, day: ctx.day }),
  );
  return warResult(done);
}

/**
 * Akce s právem (`ACTION_RIGHTS`), ale bez zámku hráče (plán 2026-11-09 – Úloha 12): stav vsi
 * nemění (příkaz při varování je záměr do tažení – nesmí čekat na dopočet vsi), nebo si zámek
 * bere use-case sám (návrat z útěku – zámek držitele hradiště; jeden zámek, nikdy vnořený). Ves
 * a právo ověří jako `guardedAction`, use-case běží za držitele vsi s jeho dnem.
 */
async function unlockedAction<T>(
  playerId: string,
  villageId: string,
  action: VillageAction,
  run: (ctx: WarContext) => Promise<T>,
): Promise<T | { error: string }> {
  const ctx = await context(playerId, villageId, ACTION_RIGHTS[action]);
  if (!ctx.ok) return { error: ctx.error };
  return run({ playerId: ctx.playerId, villageId: ctx.villageId, day: ctx.day });
}

/** Příkaz obránce varované vsi (war.md – Varování, poslové a útěk do hradiště) – právo `war`. */
export function commandAlarmActionForPlayer<T>(
  playerId: string,
  villageId: string,
  run: (ctx: WarContext) => Promise<T>,
): Promise<T | { error: string }> {
  return unlockedAction(playerId, villageId, 'commandAlarm', run);
}

/** Vrátit se – uprchlíci vsi domů (war.md – Varování, poslové a útěk do hradiště) – právo `war`. */
export function returnFromRefugeActionForPlayer<T>(
  playerId: string,
  villageId: string,
  run: (ctx: WarContext) => Promise<T>,
): Promise<T | { error: string }> {
  return unlockedAction(playerId, villageId, 'returnFromRefuge', run);
}
