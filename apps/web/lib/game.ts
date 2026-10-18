import 'server-only';
import { randomInt } from 'node:crypto';
import {
  createSettlementRepository,
  createTimeOffsetRepository,
  createVillageRepository,
} from '@bohemia/db';
import {
  currentVillageViewStamp,
  dynastyStatus,
  enterGame,
  findPlayerVillage,
  firstPlayerVillage,
  playerTime,
  restartGame,
  settlementLandscape,
  skipTime,
  type Direction8,
  type DynastyStatus,
  type EnterGameResult,
  type Landscape,
  type PlayerVillage,
  type Settlement,
  type TimeOffsetRepository,
  type TimeSkip,
} from '@bohemia/game';
import { computePause } from './compute-pause';
import { ownMapsAround } from './departure-view';
import { getDatabase } from './db';
import { cachedLandscapes } from './landscape-cache';
import { currentWorld, gameDayIndex } from './world';

/**
 * Kolik krajin sídel držet v paměti serveru. Krajina sama má ≈ 0,1 MB, s vrstvou překážek
 * (generuje se až pro stavby) ještě 1,8–2,0 MB – změřeno na 20 krajinách; plná mezipaměť
 * tak drží nejvýš ≈ 65 MB.
 */
const LANDSCAPE_CACHE_SIZE = 32;
const landscapes = cachedLandscapes(LANDSCAPE_CACHE_SIZE);

function seeds(): { nextSeed: () => number } {
  return { nextSeed: () => randomInt(0, 2 ** 31) };
}

/**
 * Composition root: use-case vstupu do hry s Drizzle repozitářem, kryptografickými seedy
 * a mezipamětí krajin (každá akce vsi i celý dotaz na ves potřebuje krajinu sídla).
 */
export function enterGameForPlayer(playerId: string): Promise<EnterGameResult> {
  return enterGame(
    { settlements: createSettlementRepository(getDatabase()), seeds: seeds(), landscapes },
    playerId,
  );
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
  const deps = playerVillagesDeps();
  const preferred =
    preferredVillageId === null
      ? null
      : await findPlayerVillage(deps, { playerId, villageId: preferredVillageId });
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
  return { settlements: createSettlementRepository(db), villages: createVillageRepository(db) };
}

/** Ves `villageId`, když patří hráči (její sídlo je mezi jeho aktivními sídly); jinak null. */
export function playerVillage(playerId: string, villageId: string): Promise<PlayerVillage | null> {
  return findPlayerVillage(playerVillagesDeps(), { playerId, villageId });
}

/**
 * Otisk pohledu na ves `villageId` hráče v den `today` bez načtení stavů vsí (levné dotazy na
 * sídla a verze vsí); null, když by dotaz na ves musel vsi dopočítat nebo ves hráči nepatří.
 */
export function currentViewStampOfPlayer(
  playerId: string,
  villageId: string,
  today: number,
): Promise<string | null> {
  return currentVillageViewStamp(playerVillagesDeps(), { playerId, villageId, today });
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
  const world = gameDayIndex(Date.now(), currentWorld());
  if (!world.ok) return world;
  const time = await playerTime({ offsets: timeOffsets() }, { playerId, worldDay: world.day });
  return { ok: true, day: time.today, offsetDays: time.offsetDays };
}

function dynastyDeps(): Parameters<typeof dynastyStatus>[0] {
  const db = getDatabase();
  return {
    settlements: createSettlementRepository(db),
    villages: createVillageRepository(db),
    landscapes,
    // dlouhý dopočet vsí (přeskok času, restart po dlouhé době) neblokuje ostatní požadavky
    pause: computePause(),
  };
}

/**
 * Všechny vsi hráče dopočítané do dneška `today` (přepínač vsí) a jestli mu vymřely všechny –
 * konec hry.
 */
export function dynastyOfPlayer(playerId: string, today: number): Promise<DynastyStatus> {
  return dynastyStatus(dynastyDeps(), { playerId, today });
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
export function gameDeps(): ReturnType<typeof dynastyDeps> & { seeds: { nextSeed: () => number } } {
  return { ...dynastyDeps(), seeds: seeds() };
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
  const today = await playerToday(playerId);
  if (!today.ok) return today;
  const result = await restartGame(
    { ...dynastyDeps(), seeds: seeds() },
    { playerId, today: today.day, abandon: options.abandon },
  );
  return result.ok ? { ok: true } : { ok: false, error: result.reason };
}

/**
 * Vývojový režim: přeskočí čas hráče o měsíc, nebo rok (use-case `skipTime` – bez `devMode`
 * odmítne) a dopočítá jeho vsi do nového dneška. Vrátí nový posun času, nebo chybu česky.
 */
export async function skipTimeForPlayer(
  playerId: string,
  devMode: boolean,
  skip: TimeSkip,
): Promise<{ ok: true; offsetDays: number } | { ok: false; error: string }> {
  const world = gameDayIndex(Date.now(), currentWorld());
  if (!world.ok) return world;
  const result = await skipTime(
    { ...dynastyDeps(), offsets: timeOffsets() },
    { playerId, devMode, worldDay: world.day, skip },
  );
  return result.ok
    ? { ok: true, offsetDays: result.offsetDays }
    : { ok: false, error: result.reason };
}
