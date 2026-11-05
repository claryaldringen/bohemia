import type { PlayerStep, WorldClock, WorldStep } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import { runLoop, type LoopDeps } from '../loop';

const world: WorldClock = { startMs: 0, endMs: 365 * 24 * 3600 * 1000 };
const options = { stepDays: 10, limit: 50, idleMs: 5000, pauseMs: 20 };

function player(id: string, outcome: PlayerStep['outcome'], days = 10): PlayerStep {
  return {
    playerId: id,
    outcome,
    targetDay: 0,
    villages: outcome === 'done' ? 1 : 0,
    days: outcome === 'done' ? days : 0,
    founded: 0,
    gameOver: false,
    ms: 5,
    ...(outcome === 'failed' ? { error: { villageId: 'v1', cause: new Error('rozbito') } } : {}),
  };
}

function step(players: PlayerStep[], idle: boolean): WorldStep {
  return {
    players,
    villages: players.reduce((s, p) => s + p.villages, 0),
    days: players.reduce((s, p) => s + p.days, 0),
    idle,
  };
}

function harness(steps: (WorldStep | Error)[], stop: AbortController) {
  const sleeps: number[] = [];
  const skips: string[][] = [];
  const logs: string[] = [];
  let clock = 1_000_000;
  let index = 0;
  const deps: LoopDeps = {
    world: () => world,
    worldDay: () => 10,
    step: async (input) => {
      skips.push([...input.skip]);
      const next = steps[index++];
      if (!next) {
        stop.abort();
        return step([], true);
      }
      if (next instanceof Error) throw next;
      return next;
    },
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    log: {
      info: (m) => logs.push(`info ${m}`),
      warn: (m) => logs.push(`warn ${m}`),
      debug: () => undefined,
    },
  };
  return { deps, sleeps, skips, logs };
}

describe('runLoop', () => {
  it('dávka, pauza, pak spánek, když není nic pozadu', async () => {
    const stop = new AbortController();
    const h = harness([step([player('a', 'done')], false), step([], true)], stop);
    const total = await runLoop(h.deps, options, stop.signal);
    expect(total).toMatchObject({ rounds: 3, players: 1, villages: 1, days: 10 });
    expect(h.sleeps[0]).toBe(20);
    expect(h.sleeps[1]).toBeGreaterThanOrEqual(0);
    expect(h.sleeps[1]).toBeLessThanOrEqual(5000);
  });

  it('signál ukončí smyčku po dokončené dávce, bez dalšího spánku', async () => {
    const stop = new AbortController();
    const h = harness([step([player('a', 'done')], false)], stop);
    const original = h.deps.step;
    h.deps.step = async (input) => {
      const result = await original(input);
      stop.abort();
      return result;
    };
    const total = await runLoop(h.deps, options, stop.signal);
    expect(total.players).toBe(1);
    expect(h.sleeps).toEqual([]);
    expect(h.logs.at(-1)).toContain('1 hráčů');
  });

  it('chyba hráče smyčku nezastaví a hráč dostane odklad; obsazený krátký', async () => {
    const stop = new AbortController();
    const h = harness(
      [step([player('a', 'failed'), player('b', 'busy'), player('c', 'done')], false)],
      stop,
    );
    const total = await runLoop(h.deps, options, stop.signal);
    expect(total.failures).toBe(1);
    expect(h.skips[0]).toEqual([]);
    expect(h.skips[1]?.sort()).toEqual(['a', 'b']);
    expect(h.logs.some((l) => l.startsWith('warn chyba u hráče a') && l.includes('rozbito'))).toBe(
      true,
    );
  });

  it('selhání celého kola (databáze) se zaloguje a smyčka běží dál', async () => {
    const stop = new AbortController();
    const h = harness([new Error('spojení spadlo'), step([player('a', 'done')], false)], stop);
    const total = await runLoop(h.deps, options, stop.signal);
    expect(total.failures).toBe(1);
    expect(total.players).toBe(1);
    expect(h.logs.some((l) => l.includes('kolo selhalo: Error: spojení spadlo'))).toBe(true);
  });

  it('když svět neběží, jen spí', async () => {
    const stop = new AbortController();
    const h = harness([], stop);
    h.deps.worldDay = () => null;
    let sleeps = 0;
    const sleep = h.deps.sleep;
    h.deps.sleep = async (ms, signal) => {
      await sleep(ms, signal);
      if (++sleeps === 2) stop.abort();
    };
    const total = await runLoop(h.deps, options, stop.signal);
    expect(total.rounds).toBe(0);
    expect(h.sleeps).toEqual([5000, 5000]);
  });

  it('úlohy světa pouští nejvýš jednou za minutu podle hodin', async () => {
    const stop = new AbortController();
    // kola po 20 ms (pauza), 40 kol = 800 ms; hodiny se posouvají jen spánkem
    const steps = Array.from({ length: 40 }, () => step([player('a', 'done')], false));
    const h = harness(steps, stop);
    const calls: number[] = [];
    h.deps.worldTasks = async (input) => {
      calls.push(input.today);
    };
    await runLoop(h.deps, options, stop.signal);
    expect(calls).toEqual([10]);

    // s hodinami po 30 s na kolo: úlohy se pustí v každém druhém kole
    const stop2 = new AbortController();
    const h2 = harness(
      Array.from({ length: 6 }, () => step([player('a', 'done')], false)),
      stop2,
    );
    const times: number[] = [];
    h2.deps.worldTasks = async (input) => {
      times.push(input.now.getTime());
    };
    await runLoop(h2.deps, { ...options, pauseMs: 30_000 }, stop2.signal);
    expect(times).toEqual([1_000_000, 1_060_000, 1_120_000, 1_180_000]);
  });
});
