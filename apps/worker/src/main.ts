// Worker: samostatný proces, který průběžně dopočítává svět (vsi hráčů), i když nikdo není online.
// Composition root jako web – spojí adaptéry s use-casem `advanceWorldStep`; žádná herní logika.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@bohemia/db';
import { advanceWorldStep } from '@bohemia/game';
import {
  WORKER_LOCK_POOL_SIZE,
  cachedLandscapes,
  computePause,
  createGameDeps,
  createPlayerLocks,
  currentWorld,
  worldDayOf,
} from '@bohemia/server';
import { readConfig, redactedUrl } from './config';
import { createLogger } from './log';
import { abortableSleep, runLoop, type LoopDeps } from './loop';

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
  const { locks, close: closeLocks } = createPlayerLocks(config.databaseUrl, WORKER_LOCK_POOL_SIZE);
  const gameDeps = createGameDeps(db, {
    landscapes: cachedLandscapes(config.landscapes),
    pause: computePause(),
    locks,
  });
  const stepDeps = { ...gameDeps, now: () => performance.now() };

  const loop: LoopDeps = {
    world: currentWorld,
    worldDay: (nowMs, world) => {
      const day = worldDayOf(nowMs, world);
      return day.ok ? day.day : null;
    },
    step: (input) => advanceWorldStep(stepDeps, input),
    now: () => Date.now(),
    sleep: abortableSleep,
    log,
  };

  const stop = new AbortController();
  let signals = 0;
  const onSignal = (name: string): void => {
    signals++;
    if (signals > 1) {
      log.warn(`${name} podruhé – končím hned`);
      process.exit(1);
    }
    log.info(`${name} – dokončuji dávku a končím`);
    stop.abort();
  };
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
    await runLoop(loop, config, stop.signal);
  } finally {
    await closeLocks();
    await db.$client.end();
    log.info('worker skončil');
  }
}

main().catch((error: unknown) => {
  console.error(`[worker] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
