import type { CampaignResult, JourneyResult } from '@bohemia/game';
import type { Logger } from './log';

// Smyčka tažení (plán 2026-11-03 – rozhodnutí 12): vedle smyčky vsí, perioda `WORKER_CAMPAIGN_MS`
// (1 s). Každé kolo dopočte aktivní tažení do teď (`stepCampaigns`) a po nich výjezdy vojvody
// (`stepJourneys` – plán 2026-11-13, Úloha 4) – chyba jednoho tažení či výjezdu ani celého kola
// smyčku nezastaví. Žádná herní logika – jen plánování.

export interface CampaignLoopDeps {
  /** `stepCampaigns` s připojenými porty. */
  step: (input: { nowMs: number }) => Promise<CampaignResult[]>;
  /** `stepJourneys` s připojenými porty – v témže kole po tažení; bez něj kolo jen tažení. */
  journeys?: (input: { nowMs: number }) => Promise<JourneyResult[]>;
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

/**
 * Hlášení s chybou; opakování se pozná podle zprávy chyby (stack se liší místem volání). Tažení
 * a výjezdy mají každé své – chyby obou kol by se jinak střídaly a hlásily v každém kole.
 */
function warnOnce(
  deps: Pick<CampaignLoopDeps, 'now' | 'log'>,
): (prefix: string, error: unknown) => void {
  let lastWarn = '';
  let lastWarnAt = -Infinity;
  return (prefix, error) => {
    const at = deps.now();
    const key = `${prefix}${error instanceof Error ? error.message : String(error)}`;
    if (key === lastWarn && at - lastWarnAt < REPEAT_WARN_MS) return;
    lastWarn = key;
    lastWarnAt = at;
    deps.log.warn(`${prefix}${errorText(error)}`);
  };
}

/** Smyčka tažení (a výjezdů) do signálu ukončení; vrací počet kol. */
export async function runCampaignLoop(
  deps: CampaignLoopDeps,
  options: { campaignMs: number },
  signal: AbortSignal,
): Promise<number> {
  let rounds = 0;
  const warnCampaign = warnOnce(deps);
  const warnJourney = warnOnce(deps);

  while (!signal.aborted) {
    const started = deps.now();
    try {
      const results = await deps.step({ nowMs: started });
      for (const r of results) {
        if (r.outcome === 'failed') {
          warnCampaign(`chyba tažení ${r.campaignId}: `, r.error);
        } else if (r.outcome !== 'idle') {
          deps.log.debug(`tažení ${r.campaignId}: ${r.outcome}`);
        }
      }
    } catch (error) {
      warnCampaign('kolo tažení selhalo: ', error);
    }
    // výjezdy v okamžiku téhož kola – i když kolo tažení selhalo
    if (deps.journeys) {
      try {
        const results = await deps.journeys({ nowMs: started });
        for (const r of results) {
          if (r.outcome === 'failed') {
            warnJourney(`chyba výjezdu ${r.journeyId}: `, r.error);
          } else if (r.outcome !== 'idle') {
            deps.log.debug(`výjezd ${r.journeyId}: ${r.outcome}`);
          }
        }
      } catch (error) {
        warnJourney('kolo výjezdů selhalo: ', error);
      }
    }
    rounds++;
    if (signal.aborted) break;
    await deps.sleep(Math.max(0, options.campaignMs - (deps.now() - started)), signal);
  }
  return rounds;
}
