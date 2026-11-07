import { describe, expect, it } from 'vitest';
import { InMemoryPlayerLock } from './in-memory-locks';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('InMemoryPlayerLock', () => {
  it('run řadí operace téhož hráče, jiný hráč běží souběžně', async () => {
    const lock = new InMemoryPlayerLock();
    const log: string[] = [];
    const job = (name: string) => async (): Promise<string> => {
      log.push(`start ${name}`);
      await tick();
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([
      lock.run('a', job('a1')),
      lock.run('a', job('a2')),
      lock.run('b', job('b1')),
    ]);
    expect(results).toEqual(['a1', 'a2', 'b1']);
    expect(log.indexOf('end a1')).toBeLessThan(log.indexOf('start a2'));
    expect(log.indexOf('start b1')).toBeLessThan(log.indexOf('end a1'));
  });

  it('tryRun nečeká: drží-li zámek někdo jiný, hned vrátí ran: false', async () => {
    const lock = new InMemoryPlayerLock();
    const held = lock.run('a', tick);
    expect(await lock.tryRun('a', () => Promise.resolve(1))).toEqual({ ran: false });
    expect(await lock.tryRun('b', () => Promise.resolve(2))).toEqual({ ran: true, value: 2 });
    await held;
    expect(await lock.tryRun('a', () => Promise.resolve(3))).toEqual({ ran: true, value: 3 });
  });

  it('chyba zámek pustí', async () => {
    const lock = new InMemoryPlayerLock();
    await expect(lock.run('a', () => Promise.reject(new Error('bum')))).rejects.toThrow('bum');
    expect(await lock.run('a', () => Promise.resolve('ok'))).toBe('ok');
    await expect(lock.tryRun('a', () => Promise.reject(new Error('bum2')))).rejects.toThrow('bum2');
    expect(await lock.tryRun('a', () => Promise.resolve(5))).toEqual({ ran: true, value: 5 });
  });
});
