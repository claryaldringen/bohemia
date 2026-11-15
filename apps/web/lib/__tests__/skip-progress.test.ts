import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbChange } from '@bohemia/db';
import {
  clearSkipProgress,
  reportSkipProgress,
  skipProgressOf,
  SKIP_ANNOUNCE_MS,
} from '../skip-progress';

// Průběh přeskoku času se oznamuje prohlížeči (server-events.md – Přeskok času): nejvýš jednou za
// SKIP_ANNOUNCE_MS na hráče, konec vždy.

let sent: DbChange[];
const send = vi.fn(async (change: DbChange): Promise<void> => {
  sent.push(change);
});

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  send.mockClear();
});

afterEach(() => {
  clearSkipProgress('p1');
  clearSkipProgress('p2');
  vi.useRealTimers();
});

describe('oznamování průběhu přeskoku', () => {
  it('10 hlášení za 100 ms dá nejvýš 2 oznámení, konec vždy jedno', () => {
    for (let i = 1; i <= 10; i += 1) {
      reportSkipProgress('p1', { doneDays: i, totalDays: 10 }, send);
      vi.advanceTimersByTime(10);
    }
    expect(sent.length).toBeLessThanOrEqual(2);
    expect(sent[0]).toEqual({ k: 'x', p: 'p1', progress: { doneDays: 1, totalDays: 10 } });
    sent = [];
    clearSkipProgress('p1', send);
    expect(sent).toEqual([{ k: 'x', p: 'p1', progress: null }]);
  });

  it('po odstupu se oznámí znovu a hráči se neovlivňují', () => {
    reportSkipProgress('p1', { doneDays: 1, totalDays: 10 }, send);
    reportSkipProgress('p2', { doneDays: 1, totalDays: 10 }, send);
    vi.advanceTimersByTime(SKIP_ANNOUNCE_MS);
    reportSkipProgress('p1', { doneDays: 2, totalDays: 10 }, send);
    expect(sent.map((change) => change.k === 'x' && change.p)).toEqual(['p1', 'p2', 'p1']);
  });

  it('chyba oznámení nepoloží přeskok a průběh zůstane k přečtení', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reportSkipProgress('p1', { doneDays: 3, totalDays: 10 }, () => Promise.reject(new Error('x')));
    await vi.advanceTimersByTimeAsync(0);
    expect(skipProgressOf('p1')).toEqual({ doneDays: 3, totalDays: 10 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('první hlášení po konci se oznámí hned (odstup se po konci nuluje)', () => {
    reportSkipProgress('p1', { doneDays: 1, totalDays: 10 }, send);
    clearSkipProgress('p1', send);
    sent = [];
    reportSkipProgress('p1', { doneDays: 1, totalDays: 5 }, send);
    expect(sent).toHaveLength(1);
  });
});
