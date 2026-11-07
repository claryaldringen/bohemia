import type { CampaignResult } from '@bohemia/game';
import type { Logger } from './log';

// Smyčka tažení (plán 2026-11-03 – rozhodnutí 12): vedle smyčky vsí, perioda `WORKER_CAMPAIGN_MS`
// (1 s). Každé kolo dopočte aktivní tažení do teď (`stepCampaigns`) – chyba jednoho tažení ani
// celého kola smyčku nezastaví. Žádná herní logika – jen plánování.

export interface CampaignLoopDeps {
  /** `stepCampaigns` s připojenými porty. */
  step: (input: { nowMs: number }) => Promise<CampaignResult[]>;
  now: () => number;
  /** Spánek, který signál ukončení přeruší. */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  log: Logger;
}

/** Stejné hlášení chyby kola se do logu opakuje nejvýš jednou za minutu. */
const REPEAT_WARN_MS = 60_000;

function errorText(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

/** Smyčka tažení do signálu ukončení; vrací počet kol. */
export async function runCampaignLoop(
  deps: CampaignLoopDeps,
  options: { campaignMs: number },
  signal: AbortSignal,
): Promise<number> {
  let rounds = 0;
  let lastWarn = '';
  let lastWarnAt = -Infinity;
  /** Hlášení s chybou; opakování se pozná podle zprávy chyby (stack se liší místem volání). */
  const warnOnce = (prefix: string, error: unknown): void => {
    const at = deps.now();
    const key = `${prefix}${error instanceof Error ? error.message : String(error)}`;
    if (key === lastWarn && at - lastWarnAt < REPEAT_WARN_MS) return;
    lastWarn = key;
    lastWarnAt = at;
    deps.log.warn(`${prefix}${errorText(error)}`);
  };

  while (!signal.aborted) {
    const started = deps.now();
    try {
      const results = await deps.step({ nowMs: started });
      for (const r of results) {
        if (r.outcome === 'failed') {
          warnOnce(`chyba tažení ${r.campaignId}: `, r.error);
        } else if (r.outcome !== 'idle') {
          deps.log.debug(`tažení ${r.campaignId}: ${r.outcome}`);
        }
      }
    } catch (error) {
      warnOnce('kolo tažení selhalo: ', error);
    }
    rounds++;
    if (signal.aborted) break;
    await deps.sleep(Math.max(0, options.campaignMs - (deps.now() - started)), signal);
  }
  return rounds;
}
