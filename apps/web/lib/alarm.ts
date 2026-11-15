import 'server-only';
import {
  commandAlarm,
  MarchGridMemo,
  returnFromRefuge,
  villageAlarmView,
  type AlarmCommand,
  type AlarmView,
  type CommandAlarmDeps,
  type RefugeReturnDeps,
} from '@bohemia/game';
import { createAlarmOwners } from '@bohemia/db';
import { currentWorld, VillageMemory, withVillageMemory } from '@bohemia/server';
import { campaignCells } from './campaign';
import { getDatabase, getPlayerLock } from './db';
import { exclusivePlayer } from './exclusive';
import { gameDeps, playerToday, villageRightsDeps } from './game';
import { commandAlarmActionForPlayer, returnFromRefugeActionForPlayer } from './village';

// Varování, poslové a útěk do hradiště (war.md; plán 2026-11-09 – Úloha 12): composition root
// pohledu na varování a příkazů obránce. Herní logika je v `packages/game/src/application/
// alarm-view.ts` (volby, odhady, záměry do tažení) a `refuge-return.ts` (Vrátit se).

/**
 * Paměť dotazování na varování (docs/code/worker.md – Výkon – Pohled na varování): panel se ptá
 * při každé změně vsi (událost `alarm` / `village`) nad týmž stavem vsi a hradiště. Stavy vsí přežijí dotaz (platnost hlídá otisk verze –
 * jinak 2 × 3 MB JSON velké vsi a hradiště v každém dotazu), mřížky pochodu podle identity stavu
 * a dne. Nejvýš 8 vsí – varovaná ves a její hradiště pro pár hráčů najednou.
 */
const ALARM_VILLAGES = new VillageMemory(8);
const ALARM_GRIDS = new MarchGridMemo();

function alarmDeps(): CommandAlarmDeps {
  return {
    ...villageRightsDeps(),
    campaigns: gameDeps().campaigns,
    cells: campaignCells(),
    world: currentWorld(),
    alarmOwners: createAlarmOwners(getDatabase()),
    grids: ALARM_GRIDS,
  };
}

function returnDeps(): RefugeReturnDeps {
  const deps = gameDeps();
  const locks = getPlayerLock();
  return {
    ...villageRightsDeps(),
    campaigns: deps.campaigns,
    // zámek držitele hradiště i s frontou v procesu (jako akce nad vsí) – volající ho nedrží
    locks: {
      run: (playerId, run) => exclusivePlayer(locks, playerId, run),
      tryRun: (playerId, run) => locks.tryRun(playerId, run),
    },
    landscapes: deps.landscapes,
    world: currentWorld(),
    pause: deps.pause,
  };
}

/**
 * Pohled hráče na varování vsi `villageId`; null = ves nevidí (cizí). Stavy vsí z paměti dotazování
 * (`ALARM_VILLAGES`), dokud se v úložišti nezmění.
 */
export async function alarmViewForPlayer(
  playerId: string,
  villageId: string,
): Promise<AlarmView | null | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  return withVillageMemory(ALARM_VILLAGES, () =>
    villageAlarmView(alarmDeps(), { playerId, villageId, today: today.day }),
  );
}

/**
 * Příkaz obránce varované vsi (Poslat posla, Ukrýt v lese, Do hradiště, posly do domény): právo
 * `war`, záměr do tažení na takt teď + 2. Bez zámku vsi – příkaz nesmí čekat na dopočet.
 */
export async function commandAlarmForPlayer(
  playerId: string,
  villageId: string,
  command: AlarmCommand,
): Promise<{ ok: true } | { error: string }> {
  const result = await commandAlarmActionForPlayer(playerId, villageId, (ctx) =>
    commandAlarm(alarmDeps(), {
      playerId: ctx.playerId,
      villageId: ctx.villageId,
      command,
      today: ctx.day,
      nowMs: Date.now(),
    }),
  );
  if ('error' in result) return result;
  return result.ok ? { ok: true } : { error: result.reason };
}

/**
 * Vrátit se – uprchlíci vsi domů (`returnFromRefuge`): právo `war`; use-case bere zámek držitele
 * hradiště sám, proto bez zámku hráče. Vrací den příchodu domů.
 */
export async function returnFromRefugeForPlayer(
  playerId: string,
  villageId: string,
): Promise<{ ok: true; arrivesDay: number } | { error: string }> {
  const result = await returnFromRefugeActionForPlayer(playerId, villageId, (ctx) =>
    returnFromRefuge(returnDeps(), {
      playerId: ctx.playerId,
      villageId: ctx.villageId,
      today: ctx.day,
    }),
  );
  if ('error' in result) return result;
  return result.ok ? { ok: true, arrivesDay: result.arrivesDay } : { error: result.reason };
}
