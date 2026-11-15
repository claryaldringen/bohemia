import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoalescer } from '../coalesce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Úloha, která běží `ms` a počítá běhy. */
function counted(ms: number): { task: () => Promise<void>; runs: () => number } {
  let runs = 0;
  return {
    task: async (): Promise<void> => {
      runs++;
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
    runs: () => runs,
  };
}

describe('slučovač nárazů', () => {
  it('10 volání za 50 ms dá nejvýš 2 běhy', async () => {
    const onError = vi.fn();
    const coalescer = createCoalescer({ delayMs: 50, onError });
    const { task, runs } = counted(30);
    for (let i = 0; i < 10; i++) {
      coalescer.run('journeys:p', task);
      await vi.advanceTimersByTimeAsync(5);
    }
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runs()).toBeGreaterThanOrEqual(1);
    expect(runs()).toBeLessThanOrEqual(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it('začne až po delayMs, jeden běh na klíč naráz, během běhu nejvýš jeden další', async () => {
    const coalescer = createCoalescer({ delayMs: 50, onError: vi.fn() });
    const { task, runs } = counted(200);
    coalescer.run('k', task);
    await vi.advanceTimersByTimeAsync(49);
    expect(runs()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs()).toBe(1);
    // běh trvá 200 ms – další volání čekají na jeho konec a dají jediný další běh
    for (let i = 0; i < 5; i++) {
      coalescer.run('k', task);
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(runs()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runs()).toBe(2);
    // jiný klíč běží nezávisle
    const other = counted(10);
    coalescer.run('k', task);
    coalescer.run('jiny', other.task);
    await vi.advanceTimersByTimeAsync(50);
    expect(runs()).toBe(3);
    expect(other.runs()).toBe(1);
  });

  it('chyba běhu zavolá onError a další volání běží', async () => {
    const onError = vi.fn();
    const coalescer = createCoalescer({ delayMs: 50, onError });
    coalescer.run('k', async () => {
      throw new Error('výpadek');
    });
    await vi.advanceTimersByTimeAsync(60);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0]?.[1]).toBe('k');
    // i úloha, která vyhodí hned (ne až v Promise)
    coalescer.run('k', () => {
      throw new Error('hned');
    });
    await vi.advanceTimersByTimeAsync(60);
    expect(onError).toHaveBeenCalledTimes(2);
    const { task, runs } = counted(1);
    coalescer.run('k', task);
    await vi.advanceTimersByTimeAsync(60);
    expect(runs()).toBe(1);
  });
});
