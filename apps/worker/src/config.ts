import { databaseUrl } from '@bohemia/db';
import { WORLD_STEP_DAYS } from '@bohemia/game';

export type LogLevel = 'info' | 'debug';

export interface WorkerConfig {
  databaseUrl: string;
  stepDays: number;
  limit: number;
  idleMs: number;
  pauseMs: number;
  landscapes: number;
  /** Perioda smyčky tažení (ms) – tažení se počítají po taktech (4 za sekundu). */
  campaignMs: number;
  logLevel: LogLevel;
}

export type WorkerEnv = Readonly<Record<string, string | undefined>>;

function integer(env: WorkerEnv, name: string, fallback: number, min: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} musí být celé číslo od ${min}, je „${raw}“.`);
  }
  return value;
}

/** Konfigurace workeru z prostředí; chyby česky. Svět (`WORLD_*`) čte `currentWorld` při každém kole. */
export function readConfig(env: WorkerEnv): WorkerConfig {
  const level = env.WORKER_LOG?.trim() || 'info';
  if (level !== 'info' && level !== 'debug') {
    throw new Error(`WORKER_LOG musí být „info“ nebo „debug“, je „${level}“.`);
  }
  return {
    databaseUrl: databaseUrl(env),
    stepDays: integer(env, 'WORKER_STEP_DAYS', WORLD_STEP_DAYS, 1),
    limit: integer(env, 'WORKER_LIMIT', 50, 1),
    idleMs: integer(env, 'WORKER_IDLE_MS', 5000, 100),
    pauseMs: integer(env, 'WORKER_PAUSE_MS', 20, 0),
    landscapes: integer(env, 'WORKER_LANDSCAPES', 128, 1),
    campaignMs: integer(env, 'WORKER_CAMPAIGN_MS', 1000, 100),
    logLevel: level,
  };
}

/** Adresa databáze bez hesla – do logu. */
export function redactedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = '';
    return parsed.toString();
  } catch {
    return '(neplatná adresa)';
  }
}
