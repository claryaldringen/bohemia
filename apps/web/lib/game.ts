import 'server-only';
import {
  createAccountLanguages,
  createAccountProviders,
  createActivityRepository,
  createHouseRepository,
  createInviteRepository,
  createNoticeRepository,
  createVassalageRepository,
  createSettlementRepository,
  createStewardshipRepository,
  createTimeOffsetRepository,
  createVillageRepository,
} from '@bohemia/db';
import {
  LANDSCAPE_CACHE_SIZE,
  cachedLandscapes,
  cachedVillages,
  computePause,
  createGameDeps,
  currentWorld,
  playerTodayOf,
  worldDayOf,
  worldSeed,
  type GameDeps,
} from '@bohemia/server';
import {
  chooseLanguage,
  currentStewardViewStamp,
  currentVillageViewStamp,
  dynastyForVillage,
  enterGame,
  findPlayerVillage,
  firstPlayerVillage,
  lockOwnerOf as lockOwnerOfVillage,
  recordActiveDay,
  requireRight,
  restartGame,
  settlementLandscape,
  skipTime,
  type ChooseLanguageResult,
  type Direction8,
  type DynastyView,
  type EnterGameResult,
  type Landscape,
  type PlayerVillage,
  type Settlement,
  type TimeOffsetRepository,
  type TimeSkip,
  type VillageAccess,
  type VillageRecord,
  type VillageRight,
  villageAccess,
} from '@bohemia/game';
import { ownMapsAround } from './departure-view';
import { getDatabase, getPlayerLock } from './db';
import { exclusivePlayer, exclusivePlayerShared } from './exclusive';
import { formatWorldState } from './game-date';
import { clearSkipProgress, reportSkipProgress } from './skip-progress';

const landscapes = cachedLandscapes(LANDSCAPE_CACHE_SIZE);

/**
 * Composition root: use-case vstupu do hry s Drizzle repozitářem, kryptografickými seedy
 * a mezipamětí krajin (každá akce vsi i celý dotaz na ves potřebuje krajinu sídla).
 */
export function enterGameForPlayer(playerId: string): Promise<EnterGameResult> {
  const db = getDatabase();
  const accounts = createAccountLanguages(db);
  return enterGame(
    {
      settlements: createSettlementRepository(db),
      houses: createHouseRepository(db),
      invitation: {
        invites: createInviteRepository(db),
        vassalages: createVassalageRepository(db),
        notices: createNoticeRepository(db),
        gameDay: () => {
          const day = worldDayOf(Date.now(), currentWorld());
          return day.ok ? day.day : 0;
        },
      },
      accountLanguage: (id) => accounts.languageOf(id),
      now: () => new Date(),
      worldSeed: worldSeed(),
      landscapes,
    },
    playerId,
  );
}

/** Volba jazyka skupiny (Google účty při prvním vstupu); chyba česky pro hráče. */
export function chooseLanguageForPlayer(
  playerId: string,
  language: unknown,
): Promise<ChooseLanguageResult> {
  const db = getDatabase();
  return chooseLanguage(
    {
      accounts: createAccountLanguages(db),
      houses: createHouseRepository(db),
      settlements: createSettlementRepository(db),
    },
    { playerId, language },
  );
}

/**
 * Nabídnout hráči volbu jazyka v úvodu hry: účet přes Google (registrace jazyk nevolila) a ještě
 * nezaložená ves (newcomers.md – Jazyková skupina).
 */
export async function languageChoiceForPlayer(
  playerId: string,
  founded: boolean,
): Promise<boolean> {
  if (founded) return false;
  return createAccountProviders(getDatabase()).hasProvider(playerId, 'google');
}

/** Krajina sídla (mapy) z mezipaměti serveru. */
export function landscapeOfSettlement(settlement: Settlement): Landscape {
  return settlementLandscape(settlement, landscapes);
}

/** Hra, jak ji hráč uvidí: sídlo (mapa) s krajinou a vybraná ves (null = zakládá ves). */
export interface GameEntry {
  settlement: Settlement;
  landscape: Landscape;
  villageId: string | null;
}

/**
 * Kam hráč vstoupí do hry (stránka /game): vybraná ves `preferredVillageId` (zapamatovaná
 * v cookie), když patří hráči; jinak jeho první ves (sídelní sídlo první – `firstPlayerVillage`);
 * bez vsí sídelní sídlo k založení vsi (hráči bez sídla ho `enterGame` založí).
 */
export async function gameEntryForPlayer(
  playerId: string,
  preferredVillageId: string | null,
): Promise<GameEntry> {
  const seat = await enterGameForPlayer(playerId);
  // Aktivní den (datum v Europe/Prague) – podle nich se pozvaný počítá jako „začal hrát“.
  await recordActiveDay(
    { activity: createActivityRepository(getDatabase()) },
    playerId,
    new Date(),
  );
  const deps = playerVillagesDeps();
  const preferred =
    preferredVillageId === null
      ? null
      : ((await findPlayerVillage(deps, { playerId, villageId: preferredVillageId })) ??
        // ves cizího držitele, kterou hráč spravuje (vassalage.md – Hráč jako správce cizí vsi)
        (await stewardedVillage(playerId, preferredVillageId)));
  const chosen = preferred ?? (await firstPlayerVillage(deps, playerId));
  if (chosen === null) return { ...seat, villageId: null };
  return {
    settlement: chosen.settlement,
    landscape:
      chosen.settlement.id === seat.settlement.id
        ? seat.landscape
        : landscapeOfSettlement(chosen.settlement),
    villageId: chosen.village.id,
  };
}

function playerVillagesDeps(): Parameters<typeof findPlayerVillage>[0] {
  const db = getDatabase();
  return {
    settlements: createSettlementRepository(db),
    villages: cachedVillages(createVillageRepository(db)),
  };
}

/**
 * Ves `villageId`, když patří hráči (její sídlo je mezi jeho aktivními sídly), nebo ji spravuje
 * (živá správa jeho rodu); jinak null – i pro odvolaného správce, nic se neprozradí.
 */
export async function playerVillage(
  playerId: string,
  villageId: string,
): Promise<PlayerVillage | null> {
  return (
    (await findPlayerVillage(playerVillagesDeps(), { playerId, villageId })) ??
    (await stewardedVillage(playerId, villageId))
  );
}

/** Ves cizího držitele, kterou hráč spravuje (živá správa jeho rodu); jinak null. */
export async function stewardedVillage(
  playerId: string,
  villageId: string,
): Promise<PlayerVillage | null> {
  const access = await villageAccessForPlayer(playerId, villageId, 0);
  return access && access.found.settlement.ownerId !== playerId ? access.found : null;
}

/**
 * Hráč, jehož zámek platí pro akci hráče `actorId` ve vsi `villageId` (use-case `lockOwnerOf`):
 * u vlastní vsi on sám, u spravované cizí vsi její držitel.
 */
export function lockOwnerOf(actorId: string, villageId: string): Promise<string> {
  return lockOwnerOfVillage(
    {
      ...playerVillagesDeps(),
      houses: createHouseRepository(getDatabase()),
      stewardships: stewardships(),
    },
    { playerId: actorId, villageId },
  );
}

/** Správy cizích vsí (repozitář nad databází). */
export function stewardships(): ReturnType<typeof createStewardshipRepository> {
  return createStewardshipRepository(getDatabase());
}

/** Vsi cizích držitelů, které hráč právě spravuje (do přepínače vsí); bez rodu nic. */
export async function stewardedVillagesOf(playerId: string): Promise<VillageRecord[]> {
  const house = await createHouseRepository(getDatabase()).activeOf(playerId);
  if (!house) return [];
  const records: VillageRecord[] = [];
  for (const s of await stewardships().listByStewardHouse(house.id)) {
    if (s.kind !== 'player') continue;
    const record = await playerVillagesDeps().villages.find(s.villageId);
    if (record) records.push(record);
  }
  return records;
}

/**
 * Ves `villageId` hráče, když v ní smí vykonat `right` v den `today` (seniorát a práva –
 * rights.ts); jinak důvod česky.
 */
export function requireVillageRight(
  playerId: string,
  villageId: string,
  right: VillageRight,
  today: number,
): Promise<PlayerVillage | string> {
  const db = getDatabase();
  return requireRight(
    { ...playerVillagesDeps(), houses: createHouseRepository(db), stewardships: stewardships() },
    { playerId, villageId, right, today },
  );
}

/** Práva hráče ve vsi `villageId` a senior rodu (rights.ts); null, když ves hráči nepatří. */
export function villageAccessForPlayer(
  playerId: string,
  villageId: string,
  today: number,
): Promise<VillageAccess | null> {
  const db = getDatabase();
  return villageAccess(
    { ...playerVillagesDeps(), houses: createHouseRepository(db), stewardships: stewardships() },
    { playerId, villageId, today },
  );
}

/**
 * Otisk pohledu na ves `villageId` hráče v den `today` bez načtení stavů vsí (levné dotazy na
 * sídla a verze vsí); null, když by dotaz na ves musel některou ves dopočítat (zobrazenou, nebo
 * jinou víc než `WORKER_LAG_DAYS` pozadu) nebo ves hráči nepatří.
 */
export function currentViewStampOfPlayer(
  playerId: string,
  villageId: string,
  today: number,
): Promise<string | null> {
  return currentVillageViewStamp(playerVillagesDeps(), { playerId, villageId, today });
}

/**
 * Otisk pohledu správce na spravovanou cizí ves (`currentStewardViewStamp`); null, když ves
 * správce nespravuje nebo by dotaz musel počítat.
 */
export async function currentStewardViewStampOfPlayer(
  actorId: string,
  villageId: string,
): Promise<string | null> {
  const house = await createHouseRepository(getDatabase()).activeOf(actorId);
  if (!house) return null;
  const stewarded = (await stewardships().listByStewardHouse(house.id))
    .filter((s) => s.kind === 'player')
    .map((s) => s.villageId);
  if (!stewarded.includes(villageId)) return null;
  const holderId = await lockOwnerOf(actorId, villageId);
  if (holderId === actorId) return null;
  const [holderToday, actorToday] = await Promise.all([
    playerToday(holderId),
    playerToday(actorId),
  ]);
  if (!holderToday.ok || !actorToday.ok) return null;
  return currentStewardViewStamp(playerVillagesDeps(), {
    actorId,
    holderId,
    villageId,
    holderToday: holderToday.day,
    actorToday: actorToday.day,
    stewardedVillageIds: stewarded,
  });
}

/** První ves hráče (sídelní sídlo první); bez vsí null. */
export function firstVillageOfPlayer(playerId: string): Promise<PlayerVillage | null> {
  return firstPlayerVillage(playerVillagesDeps(), playerId);
}

function timeOffsets(): TimeOffsetRepository {
  return createTimeOffsetRepository(getDatabase());
}

/** Dnešní herní den hráče s jeho posunem času, nebo chyba pro hráče (svět neběží). */
export type PlayerToday =
  { ok: true; day: number; offsetDays: number } | { ok: false; error: string };

/**
 * Dnešní herní den hráče – den světa + posun času hráče (vývojový režim, jinak 0). Podle něj se
 * dopočítávají vsi hráče a provádějí jeho akce.
 */
export async function playerToday(playerId: string): Promise<PlayerToday> {
  const world = currentWorld();
  const today = await playerTodayOf(timeOffsets(), playerId, Date.now(), world);
  return today.ok ? today : { ok: false, error: `${formatWorldState(today.state, world)}.` };
}

function dynastyDeps(): GameDeps {
  // dlouhý dopočet vsí (přeskok času, restart po dlouhé době) neblokuje ostatní požadavky
  return createGameDeps(getDatabase(), {
    landscapes,
    pause: computePause(),
    locks: getPlayerLock(),
  });
}

/**
 * Vsi hráče pro pohled nebo akci na ves `villageId` (přepínač vsí) a jestli mu vymřely všechny –
 * konec hry. Ves `villageId` se dopočte do dneška `today`, ostatní vsi drží worker – web je
 * dopočte, jen když jsou víc než `WORKER_LAG_DAYS` pozadu (use-case `dynastyForVillage`).
 */
export function dynastyOfPlayer(
  playerId: string,
  today: number,
  villageId: string,
): Promise<DynastyView> {
  // dotazy se stejným dnem a vsí sdílejí jeden dopočet; uvnitř fronty zámek hráče v DB
  // (exclusive.ts)
  return exclusivePlayerShared(getPlayerLock(), playerId, `${today}:${villageId}`, () =>
    dynastyOfPlayerLocked(playerId, today, villageId),
  );
}

/**
 * Totéž bez zámku – jen pro volající, kteří už zámek hráče drží (frontu v procesu i zámek v DB –
 * `exclusivePlayer` se nevnořuje). Za dopočtem se vybaví odchozí schránky správce dopočtených vsí
 * (steward.md – Kde správce běží) – nové vsi synů se v přepínači objeví hned. Plný dopočet všech
 * vsí (`dynastyStatus` / `advanceDynasty`) zůstává skoku v čase, restartu a ověření konce rodu.
 */
export async function dynastyOfPlayerLocked(
  playerId: string,
  today: number,
  villageId: string,
): Promise<DynastyView> {
  return dynastyForVillage(dynastyDeps(), { playerId, today, villageId });
}

/**
 * Vlastní vsi na sousedních mapách sídla `settlementId` po směrech (migration.md) – levně, bez
 * načtení stavů vsí (jména z otisků).
 */
export async function ownMapsOfPlayer(
  playerId: string,
  settlementId: string,
): Promise<Partial<Record<Direction8, string>>> {
  const db = getDatabase();
  const settlements = await createSettlementRepository(db).listActive(playerId);
  const stamps = await createVillageRepository(db).stampsOf(settlements.map((s) => s.id));
  return ownMapsAround(settlements, stamps, settlementId);
}

/** Závislosti use-casů nad vsemi hráče (sídla, vsi, mezipaměť krajin, seedy). */
export function gameDeps(): GameDeps {
  return dynastyDeps();
}

/**
 * Začít znovu (use-case `restartGame`): staré sídlo jde do archivu, hráč dostane nové s novou
 * krajinou a zakládá ves od první zemnice. Bez `abandon` jen po konci hry (obrazovka porážky),
 * s `abandon` i se živou vsí (potvrzení v nabídce hry). Chyba česky pro hráče.
 */
export async function restartGameForPlayer(
  playerId: string,
  options: { abandon: boolean } = { abandon: false },
): Promise<{ ok: true } | { ok: false; error: string }> {
  // den se načte až uvnitř zámku – akce za skokem v čase dostane den po skoku
  const result = await exclusivePlayer(getPlayerLock(), playerId, async () => {
    const today = await playerToday(playerId);
    if (!today.ok) return today;
    const restarted = await restartGame(dynastyDeps(), {
      playerId,
      today: today.day,
      abandon: options.abandon,
    });
    return restarted.ok ? { ok: true as const } : { ok: false as const, error: restarted.reason };
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * Vývojový režim: přeskočí čas hráče o měsíc, nebo rok (use-case `skipTime` – bez `devMode`
 * odmítne) a dopočítá jeho vsi do nového dneška. Vrátí nový posun času, nebo chybu česky.
 * Průběh dopočtu je mezitím k přečtení přes `skipProgressOf` (po konci zmizí).
 */
export async function skipTimeForPlayer(
  playerId: string,
  devMode: boolean,
  skip: TimeSkip,
): Promise<{ ok: true; offsetDays: number } | { ok: false; error: string }> {
  const clock = currentWorld();
  const world = worldDayOf(Date.now(), clock);
  if (!world.ok) return { ok: false, error: `${formatWorldState(world.state, clock)}.` };
  // průběh se zapisuje a maže uvnitř fronty hráče – druhý přeskok (jiný panel) čeká za prvním
  // a jeho průběh nesmaže
  const result = await exclusivePlayer(getPlayerLock(), playerId, async () => {
    try {
      return await skipTime(
        {
          ...dynastyDeps(),
          offsets: timeOffsets(),
          onProgress: (progress) => reportSkipProgress(playerId, progress),
        },
        { playerId, devMode, worldDay: world.day, skip },
      );
    } finally {
      clearSkipProgress(playerId);
    }
  });
  return result.ok
    ? { ok: true, offsetDays: result.offsetDays }
    : { ok: false, error: result.reason };
}
