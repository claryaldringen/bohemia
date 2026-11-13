import type { CampaignResult, JourneyResult } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import { runCampaignLoop, type CampaignLoopDeps } from '../campaign-loop';

// Smyčka tažení: kolo po periodě, chyba tažení ani kola smyčku nezastaví, signál ji ukončí.

function harness(steps: (() => Promise<CampaignResult[]>)[]): {
  deps: CampaignLoopDeps;
  stop: AbortController;
  warnings: string[];
  sleeps: number[];
  calls: number[];
} {
  let clock = 1_000;
  const stop = new AbortController();
  const warnings: string[] = [];
  const sleeps: number[] = [];
  const calls: number[] = [];
  const deps: CampaignLoopDeps = {
    step: ({ nowMs }) => {
      calls.push(nowMs);
      const next = steps[calls.length - 1];
      clock += 300; // výpočet kola trvá 300 ms
      if (calls.length >= steps.length) stop.abort();
      return next ? next() : Promise.resolve([]);
    },
    now: () => clock,
    sleep: (ms) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    log: { info: () => undefined, warn: (m) => warnings.push(m), debug: () => undefined },
  };
  return { deps, stop, warnings, sleeps, calls };
}

describe('runCampaignLoop', () => {
  it('chyba jednoho tažení i celého kola smyčku nezastaví; perioda 1 s od začátku kola', async () => {
    const { deps, stop, warnings, sleeps, calls } = harness([
      () =>
        Promise.resolve([
          { campaignId: 'a', outcome: 'failed', error: new Error('rozbité tažení') },
          { campaignId: 'b', outcome: 'saved' },
        ]),
      () => Promise.reject(new Error('relation "campaign" does not exist')),
      () => Promise.reject(new Error('relation "campaign" does not exist')),
      () => Promise.resolve([{ campaignId: 'b', outcome: 'computed' }]),
    ]);
    const rounds = await runCampaignLoop(deps, { campaignMs: 1000 }, stop.signal);
    expect(rounds).toBe(4);
    expect(calls).toEqual([1_000, 2_000, 3_000, 4_000]);
    expect(sleeps).toEqual([700, 700, 700]);
    // stejná chyba kola se v minutě hlásí jen jednou
    expect(warnings.map((w) => w.split('\n')[0])).toEqual([
      'chyba tažení a: Error: rozbité tažení',
      'kolo tažení selhalo: Error: relation "campaign" does not exist',
    ]);
  });

  it('po tažení v témže kole výjezdy; chyby výjezdů smyčku nezastaví a hlásí se zvlášť', async () => {
    const noTable = (name: string) => (): Promise<never> =>
      Promise.reject(new Error(`relation "${name}" does not exist`));
    const { deps, stop, warnings, calls } = harness([
      () => Promise.resolve([]),
      noTable('campaign'),
      noTable('campaign'),
    ]);
    const journeySteps: (() => Promise<JourneyResult[]>)[] = [
      () =>
        Promise.resolve([
          { journeyId: 'j1', outcome: 'failed', error: new Error('rozbitý výjezd') },
          { journeyId: 'j2', outcome: 'saved' },
        ]),
      noTable('journey'),
      noTable('journey'),
    ];
    const journeyCalls: number[] = [];
    deps.journeys = ({ nowMs }) => {
      journeyCalls.push(nowMs);
      return journeySteps[journeyCalls.length - 1]!();
    };
    expect(await runCampaignLoop(deps, { campaignMs: 1000 }, stop.signal)).toBe(3);
    // okamžik kola jako tažení; poslední kolo se po signálu dokončí i s výjezdy
    expect(journeyCalls).toEqual(calls);
    // chyby kol tažení a výjezdů se střídají – každá se v minutě hlásí jen jednou
    expect(warnings.map((w) => w.split('\n')[0])).toEqual([
      'chyba výjezdu j1: Error: rozbitý výjezd',
      'kolo tažení selhalo: Error: relation "campaign" does not exist',
      'kolo výjezdů selhalo: Error: relation "journey" does not exist',
    ]);
  });

  it('signál ukončení před kolem – žádné kolo', async () => {
    const { deps, stop, calls } = harness([]);
    stop.abort();
    expect(await runCampaignLoop(deps, { campaignMs: 1000 }, stop.signal)).toBe(0);
    expect(calls).toEqual([]);
  });
});
