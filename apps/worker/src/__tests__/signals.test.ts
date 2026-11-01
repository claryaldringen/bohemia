import { describe, expect, it } from 'vitest';
import { REPEATED_SIGNAL_MS, signalHandler } from '../signals';

function handler(): { onSignal: (name: string) => void; events: string[]; clock: { ms: number } } {
  const events: string[] = [];
  const clock = { ms: 1000 };
  const onSignal = signalHandler({
    now: () => clock.ms,
    log: { info: (m) => events.push(`info ${m}`), warn: (m) => events.push(`warn ${m}`) },
    stop: () => events.push('stop'),
    exitNow: () => events.push('exit'),
  });
  return { onSignal, events, clock };
}

describe('signalHandler', () => {
  it('první signál dokončí dávku, týž Ctrl + C doručený znovu (tsx, skupina procesů) nic', () => {
    const { onSignal, events, clock } = handler();
    onSignal('SIGINT');
    clock.ms += 5;
    onSignal('SIGINT');
    clock.ms += REPEATED_SIGNAL_MS - 10;
    onSignal('SIGTERM');
    expect(events).toEqual(['info SIGINT – dokončuji dávku a končím', 'stop']);
  });

  it('druhý stisk po chvíli ukončí proces hned', () => {
    const { onSignal, events, clock } = handler();
    onSignal('SIGTERM');
    clock.ms += REPEATED_SIGNAL_MS;
    onSignal('SIGINT');
    expect(events).toEqual([
      'info SIGTERM – dokončuji dávku a končím',
      'stop',
      'warn SIGINT podruhé – končím hned',
      'exit',
    ]);
  });
});
