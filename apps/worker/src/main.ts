// Worker: samostatný proces, který průběžně dopočítává svět (vsi hráčů), i když nikdo není online.
// Composition root jako web – spojí adaptéry s use-casem `advanceWorldStep`; žádná herní logika.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createAlarmOwners,
  createCampaignLock,
  createCampaignRepository,
  createDatabase,
  createLockPool,
  createVillageRepository,
} from '@bohemia/db';
import {
  advanceWorldStep,
  newCampaignMemory,
  loadVillage,
  runWorldTasks,
  settlementLandscape,
  type VillageRecord,
  stepCampaigns,
  villageWatchers,
} from '@bohemia/game';
import {
  WORKER_LOCK_POOL_SIZE,
  cachedLandscapes,
  computePause,
  createCampaignCells,
  createGameDeps,
  createPlayerLocks,
  currentWorld,
  worldDayOf,
} from '@bohemia/server';
import { readConfig, redactedUrl } from './config';
import { createLogger } from './log';
import { runCampaignLoop, type CampaignLoopDeps } from './campaign-loop';
import { abortableSleep, runLoop, type LoopDeps } from './loop';
import { signalHandler } from './signals';

/** Spojení v poolu zámků tažení – smyčka tažení počítá tažení po jednom. */
const CAMPAIGN_LOCK_POOL_SIZE = 2;

/** Svět a databáze musí být stejné jako ve webu – proměnné z prostředí mají přednost. */
function loadWebEnv(): void {
  const file = fileURLToPath(new URL('../../web/.env.local', import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main(): Promise<void> {
  loadWebEnv();
  const config = readConfig(process.env);
  const log = createLogger(config.logLevel);

  const db = createDatabase(config.databaseUrl);
  // restart Postgresu zahodí nečinná spojení – worker se nesmí shodit, pool se připojí znovu
  db.$client.on('error', (error: Error) => {
    log.warn(`spojení s databází spadlo, zkusí se znovu: ${error.message}`);
  });
  const { locks, close: closeLocks } = createPlayerLocks(config.databaseUrl, WORKER_LOCK_POOL_SIZE);
  const gameDeps = createGameDeps(db, {
    landscapes: cachedLandscapes(config.landscapes),
    pause: computePause(),
    locks,
  });
  const stepDeps = { ...gameDeps, now: () => performance.now() };

  // jídlo domény: dopočet vsi do dneška (uloží ji) a pokusy dárců, které nevyšly (1× za herní den)
  const domainFoodAttempts = new Map<string, number>();
  const loadDomainVillage = async (
    villageId: string,
    today: number,
  ): Promise<VillageRecord | null> => {
    const village = await gameDeps.villages.find(villageId);
    const settlement = village ? await gameDeps.settlements.find(village.settlementId) : null;
    if (!village || !settlement) return null;
    return loadVillage(
      { villages: gameDeps.villages, pause: gameDeps.pause },
      { villageId, today, landscape: settlementLandscape(settlement, gameDeps.landscapes) },
    );
  };

  // herní den okamžiku (tribut z míru, kola jednání)
  const dayOfAt = (at: Date): number => {
    const day = worldDayOf(at.getTime(), currentWorld());
    return day.ok ? day.day : 0;
  };
  const worldShipments = {
    shipments: gameDeps.shipments,
    villages: gameDeps.villages,
    settlements: gameDeps.settlements,
    locks,
    now: () => new Date(),
  };
  // správce za nepřítomného hráče (absence.md): Odvody a Svolání po lhůtě, vsi dopočítá do dneška
  const stewards = {
    levies: {
      dialogs: gameDeps.dialogs,
      vassalages: gameDeps.vassalages,
      houses: gameDeps.houses,
      notices: gameDeps.notices,
      villages: gameDeps.villages,
      loans: gameDeps.loans,
      shipments: worldShipments,
      prepareVillage: loadDomainVillage,
    },
    summons: {
      dialogs: gameDeps.dialogs,
      vassalages: gameDeps.vassalages,
      houses: gameDeps.houses,
      wars: gameDeps.wars,
      notices: gameDeps.notices,
      villages: gameDeps.villages,
      settlements: gameDeps.settlements,
      shipments: worldShipments,
      stewardships: gameDeps.stewardships,
      prepareVillage: loadDomainVillage,
    },
  };

  const loop: LoopDeps = {
    world: currentWorld,
    worldDay: (nowMs, world) => {
      const day = worldDayOf(nowMs, world);
      return day.ok ? day.day : null;
    },
    step: (input) => advanceWorldStep(stepDeps, input),
    worldTasks: (input) =>
      runWorldTasks(
        {
          invites: gameDeps.invites,
          activity: gameDeps.activity,
          credits: gameDeps.successionCredits,
          notices: gameDeps.notices,
          houses: gameDeps.houses,
          wars: {
            wars: gameDeps.wars,
            houses: gameDeps.houses,
            villages: gameDeps.villages,
            notices: gameDeps.notices,
          },
          summons: {
            dialogs: gameDeps.dialogs,
            wars: gameDeps.wars,
            vassalages: gameDeps.vassalages,
            houses: gameDeps.houses,
            notices: gameDeps.notices,
            villages: gameDeps.villages,
          },
          newcomers: {
            houses: gameDeps.houses,
            negotiations: gameDeps.negotiations,
            villages: gameDeps.villages,
            worldDirectory: gameDeps.worldDirectory,
            worldSeed: gameDeps.worldSeed,
            locks,
          },
          levies: {
            dialogs: gameDeps.dialogs,
            vassalages: gameDeps.vassalages,
            houses: gameDeps.houses,
            notices: gameDeps.notices,
            villages: gameDeps.villages,
            loans: gameDeps.loans,
            tributes: {
              peaceTributes: () => gameDeps.negotiations.peaceTributes(),
              dayOf: dayOfAt,
            },
          },
          stewards,
          negotiationExpiry: {
            negotiations: gameDeps.negotiations,
            houses: gameDeps.houses,
            villages: gameDeps.villages,
            dayOf: dayOfAt,
          },
          shipments: worldShipments,
          domainFood: {
            settlements: gameDeps.settlements,
            villages: gameDeps.villages,
            loadVillage: loadDomainVillage,
            shipments: {
              shipments: gameDeps.shipments,
              villages: gameDeps.villages,
              settlements: gameDeps.settlements,
              locks,
              now: () => new Date(),
            },
            rounds: gameDeps.domainFood,
            attempts: domainFoodAttempts,
            log: (message) => log.warn(message),
          },
        },
        input,
      ),
    now: () => Date.now(),
    sleep: abortableSleep,
    log,
  };

  // tažení: vlastní zámek (dva workery – tažení počítá jen jeden) a vsi bez paměti dávky
  const campaignLockPool = createLockPool(config.databaseUrl, CAMPAIGN_LOCK_POOL_SIZE);
  const campaignVillages = createVillageRepository(db);
  const campaignDeps = {
    campaigns: createCampaignRepository(db),
    campaignLock: createCampaignLock(campaignLockPool),
    cells: createCampaignCells({
      settlements: gameDeps.settlements,
      villages: campaignVillages,
      landscapes: gameDeps.landscapes,
      worldSeed: gameDeps.worldSeed,
    }),
    villages: campaignVillages,
    notices: gameDeps.notices,
    passages: gameDeps.passages,
    // upozornění „Cizí vojsko u …“ a neškodná vojska pána a vazalů (war.md – Obránci)
    watchers: villageWatchers({
      villages: campaignVillages,
      settlements: gameDeps.settlements,
      houses: gameDeps.houses,
      vassalages: gameDeps.vassalages,
      passages: gameDeps.passages,
    }),
    // kdo za varovanou ves rozhoduje, kandidáti hradišť a doména hradiště (war.md – Varování)
    alarmOwners: createAlarmOwners(db),
    // poslední spočtený stav tažení napříč koly (docs/code/worker.md – Výkon – Tažení)
    memory: newCampaignMemory(),
  };
  const campaignLoop: CampaignLoopDeps = {
    step: (input) => stepCampaigns({ ...campaignDeps, world: currentWorld() }, input),
    now: () => Date.now(),
    sleep: abortableSleep,
    log,
  };

  const stop = new AbortController();
  const onSignal = signalHandler({
    now: () => Date.now(),
    log,
    stop: () => stop.abort(),
    exitNow: () => process.exit(1),
  });
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  const world = currentWorld();
  const today = worldDayOf(Date.now(), world);
  log.info(
    `start – databáze ${redactedUrl(config.databaseUrl)}, ` +
      `svět ${today.ok ? `den ${today.day}` : today.state.status}, ` +
      `dávka ${config.stepDays} dní, ${config.limit} hráčů na kolo`,
  );

  try {
    await Promise.all([
      runLoop(loop, config, stop.signal),
      runCampaignLoop(campaignLoop, config, stop.signal),
    ]);
  } finally {
    await closeLocks();
    await campaignLockPool.end();
    await db.$client.end();
    log.info('worker skončil');
  }
}

main().catch((error: unknown) => {
  console.error(`[worker] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
