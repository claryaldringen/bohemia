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
  createPresenceRepository,
  createTimeOffsetRepository,
  createTrailExitSource,
  createVillageRepository,
} from '@bohemia/db';
import {
  advanceWorldStep,
  newCampaignMemory,
  cellsInNeed,
  loadVillage,
  runWorldTasks,
  settlementLandscape,
  type ChristianityMemory,
  type JourneyState,
  type VillageRecord,
  stepCampaigns,
  stepJourneys,
  villageWatchers,
} from '@bohemia/game';
import {
  WORKER_LOCK_POOL_SIZE,
  acceptanceDeps,
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

  // los křesťanství padá 1. 1. – po rodech rok jejich dne, za který už úloha proběhla (christianity.md – Objev)
  const christianityMemory: ChristianityMemory = { houseYears: new Map(), npcYear: null };
  // herní den okamžiku (tribut z míru, kola jednání)
  const dayOfAt = (at: Date): number => {
    const day = worldDayOf(at.getTime(), currentWorld());
    return day.ok ? day.day : 0;
  };
  // posun času hráčů: co patří hráči (ves, dialog, lhůta), jde v úlohách světa v jeho dni (accounts.md)
  const offsets = createTimeOffsetRepository(db);
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
      offsets,
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
      offsets,
    },
  };

  // účinky přijatých jednání po pádu webu (audit A2): závislosti skládá `acceptanceDeps` stejně
  // jako přijetí ve webu; schránku, která vyčerpala pokusy, zapíše do logu
  const acceptances = { ...acceptanceDeps(gameDeps), log: (message: string) => log.warn(message) };

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
          offsets,
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
            offsets,
          },
          stewards,
          negotiationExpiry: {
            negotiations: gameDeps.negotiations,
            houses: gameDeps.houses,
            villages: gameDeps.villages,
            dayOf: dayOfAt,
            offsets,
          },
          shipments: { ...worldShipments, offsets },
          // lidé z výsledků trhu pro zaniklé vsi zpět k hostiteli (markets.md – Rozhodnutí plánu 3)
          villageMail: { villages: gameDeps.villages, settlements: gameDeps.settlements },
          // návrat uprchlíků za správce a NPC rody, obnova návratu po pádu (war.md – Varování)
          refugees: {
            refugees: gameDeps.refugees,
            settlements: gameDeps.settlements,
            villages: gameDeps.villages,
            houses: gameDeps.houses,
            stewardships: gameDeps.stewardships,
            campaigns: gameDeps.campaigns,
            locks,
            landscapes: gameDeps.landscapes,
            world: currentWorld(),
            pause: gameDeps.pause,
            offsets,
          },
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
            offsets,
          },
          christianity: {
            houses: gameDeps.houses,
            vassalages: gameDeps.vassalages,
            notices: gameDeps.notices,
            settlements: gameDeps.settlements,
            villages: gameDeps.villages,
            stewardships: gameDeps.stewardships,
            worldSeed: gameDeps.worldSeed,
            dayOf: dayOfAt,
            offsets,
            done: christianityMemory,
          },
          acceptances,
        },
        input,
      ),
    now: () => Date.now(),
    sleep: abortableSleep,
    log,
  };

  // tažení: vlastní zámek (dva workery – tažení počítá jen jeden) a vsi bez paměti dávky
  const campaignLockPool = createLockPool(config.databaseUrl, CAMPAIGN_LOCK_POOL_SIZE);
  const campaignVillages = createVillageRepository(db, gameDeps.worldSeed);
  const campaignDeps = {
    campaigns: createCampaignRepository(db),
    campaignLock: createCampaignLock(campaignLockPool),
    cells: createCampaignCells({
      settlements: gameDeps.settlements,
      villages: campaignVillages,
      landscapes: gameDeps.landscapes,
      worldSeed: gameDeps.worldSeed,
      // vstupy zemských stezek sousedních vsí ze souhrnů (trade.md – Pokračování na sousední mapě)
      trailExits: createTrailExitSource(db),
    }),
    villages: campaignVillages,
    notices: gameDeps.notices,
    passages: gameDeps.passages,
    // znalost z tažení dostane rod vůdce (docs/code/journey.md – Znalost rodu)
    knowledge: gameDeps.knowledge,
    houses: gameDeps.houses,
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
    // přítomnost hráčů u hry – odpověď varované vsi s vojvodou doma (war.md – Hráč ve vsi a mimo ni)
    presence: createPresenceRepository(db),
    // poslední spočtený stav tažení napříč koly (docs/code/worker.md – Výkon – Tažení)
    memory: newCampaignMemory(),
  };
  // výjezdy vojvody: zámek, mapy políček a vsi jako tažení, ale vlastní paměť – konec kola zapomene,
  // co mezi jeho id není, sdílená paměť by zahodila záznamy druhé smyčky (docs/code/journey.md)
  const journeyDeps = {
    journeys: gameDeps.journeys,
    campaignLock: campaignDeps.campaignLock,
    cells: campaignDeps.cells,
    villages: campaignVillages,
    notices: gameDeps.notices,
    knowledge: gameDeps.knowledge,
    atWar: gameDeps.atWar,
    memory: newCampaignMemory<JourneyState>(),
  };
  const campaignLoop: CampaignLoopDeps = {
    step: (input) => {
      // mezipaměť prázdných map pojme všechny mapy, které tažení a výjezdy čtou (docs/code/worker.md
      // – Výkon) – krajina mapy se skupinou se mezi koly negeneruje znovu, ať je skupin kolik chce
      campaignDeps.cells.reserve(cellsInNeed(campaignDeps.memory, journeyDeps.memory));
      return stepCampaigns({ ...campaignDeps, world: currentWorld() }, input);
    },
    journeys: (input) => stepJourneys({ ...journeyDeps, world: currentWorld() }, input),
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
