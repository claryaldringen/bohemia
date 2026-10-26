import { describe, expect, it, vi } from 'vitest';
import {
  EXCLUSIVE_WARN_MS,
  exclusive,
  exclusiveShared,
  pendingExclusiveKeys,
  playerLockKey,
} from '../exclusive';

/**
 * Model dopočtu vsi: záznam s verzí a dnem, `advance` načte, po přestávce (jako `computePause`)
 * uloží s kontrolou verze – stejně jako `updateVillage` s `villages.save(…, expectedVersion)`.
 */
class FakeVillage {
  version = 1;
  lastDay = 0;
  computes = 0;
  conflicts = 0;
  failNext = false;

  async advance(today: number): Promise<number> {
    for (;;) {
      const { version, lastDay } = this;
      if (lastDay >= today) return this.lastDay;
      this.computes++;
      await new Promise((resolve) => setImmediate(resolve)); // přestávka – ke slovu přijdou ostatní
      if (this.failNext) {
        this.failNext = false;
        throw new Error('dopočet selhal');
      }
      if (this.version !== version) {
        this.conflicts++;
        continue;
      }
      this.lastDay = today;
      this.version++;
    }
  }
}

describe('exclusive', () => {
  it('bez zámku se souběžný dopočet počítá dvakrát a naráží na konflikt verze', async () => {
    const village = new FakeVillage();
    await Promise.all([village.advance(365), village.advance(365)]);
    expect(village.computes).toBe(2);
    expect(village.conflicts).toBe(1);
  });

  it('dvě souběžná volání: jeden dopočet a žádný konflikt verze', async () => {
    const village = new FakeVillage();
    const key = playerLockKey('hrac');
    const [a, b] = await Promise.all([
      exclusive(key, () => village.advance(365)),
      exclusive(key, () => village.advance(365)),
    ]);
    expect([a, b]).toEqual([365, 365]);
    expect(village.computes).toBe(1);
    expect(village.conflicts).toBe(0);
    expect(village.version).toBe(2);
  });

  it('skok v čase během dopočtu: druhé volání dopočte jen zbytek do svého dne', async () => {
    const village = new FakeVillage();
    const key = playerLockKey('hrac');
    const first = exclusive(key, () => village.advance(365));
    const second = exclusive(key, () => village.advance(730));
    expect(await first).toBe(365);
    expect(await second).toBe(730);
    expect(village.computes).toBe(2);
    expect(village.conflicts).toBe(0);
    expect(village.lastDay).toBe(730);
  });

  it('chyba prvního volání se nepřilepí: druhé zkusí znovu', async () => {
    const village = new FakeVillage();
    village.failNext = true;
    const key = playerLockKey('hrac');
    const first = exclusive(key, () => village.advance(365));
    const second = exclusive(key, () => village.advance(365));
    await expect(first).rejects.toThrow('dopočet selhal');
    expect(await second).toBe(365);
    expect(village.computes).toBe(2);
  });

  it('různí hráči se neblokují', async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const slow = exclusive('player:a', () => new Promise<void>((r) => (release = r)));
    await exclusive('player:b', async () => void order.push('b'));
    expect(order).toEqual(['b']);
    release();
    await slow;
  });

  it('mapa se po dokončení (i po chybě) uklidí', async () => {
    await expect(exclusive('player:x', () => Promise.reject(new Error('x')))).rejects.toThrow();
    await exclusive('player:y', () => Promise.resolve(1));
    await new Promise((resolve) => setImmediate(resolve));
    expect(pendingExclusiveKeys()).toBe(0);
  });
});

describe('exclusive – pořadí, úklid a varování', () => {
  it('čtyři čekatelé běží v pořadí zařazení (FIFO)', async () => {
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        exclusive('player:fifo', async () => {
          await new Promise((resolve) => setImmediate(resolve));
          order.push(n);
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('rychlé navázání dalšího volání mapu neuklidí předčasně a nakonec ji uklidí', async () => {
    const first = exclusive('player:chain', () => Promise.resolve(1));
    await first;
    const second = exclusive('player:chain', () => Promise.resolve(2)); // dřív než doběhl úklid prvního
    expect(pendingExclusiveKeys()).toBeGreaterThan(0);
    await second;
    await new Promise((resolve) => setImmediate(resolve));
    expect(pendingExclusiveKeys()).toBe(0);
  });

  it('po 120 s čekání i běhu se jen zapíše varování, fronta se neuvolní', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      let release: () => void = () => undefined;
      const slow = exclusive('player:warn', () => new Promise<void>((r) => (release = r)));
      const order: string[] = [];
      const waiting = exclusive('player:warn', async () => void order.push('druhé'));
      await vi.advanceTimersByTimeAsync(EXCLUSIVE_WARN_MS + 1000);
      expect(warn).toHaveBeenCalledTimes(2); // běh prvního i čekání druhého
      expect(order).toEqual([]); // nic se neuvolnilo
      release();
      await slow;
      await waiting;
      expect(order).toEqual(['druhé']);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('exclusiveShared', () => {
  it('pět souběžných dotazů se stejným dnem: jeden dopočet', async () => {
    const village = new FakeVillage();
    const key = playerLockKey('hrac');
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => exclusiveShared(key, '365', () => village.advance(365))),
    );
    expect(results).toEqual([365, 365, 365, 365, 365]);
    expect(village.computes).toBe(1);
    await new Promise((resolve) => setImmediate(resolve));
    expect(pendingExclusiveKeys()).toBe(0);
  });

  it('jiný den se nesdílí', async () => {
    const village = new FakeVillage();
    const key = playerLockKey('hrac');
    const [a, b] = await Promise.all([
      exclusiveShared(key, '365', () => village.advance(365)),
      exclusiveShared(key, '730', () => village.advance(730)),
    ]);
    expect([a, b]).toEqual([365, 730]);
    expect(village.computes).toBe(2);
  });

  it('akce mezi dotazy: dotaz po akci se nesdílí s dotazem před ní a akce nedopočítává navíc', async () => {
    const village = new FakeVillage();
    const key = playerLockKey('hrac');
    const log: string[] = [];
    const q1 = exclusiveShared(key, '365', async () => {
      log.push('dotaz');
      return village.advance(365);
    });
    const q2 = exclusiveShared(key, '365', () => village.advance(365)); // sdílí q1
    const act = exclusive(key, async () => {
      log.push('akce');
      return village.advance(365);
    });
    const q3 = exclusiveShared(key, '365', async () => {
      log.push('dotaz po akci');
      return village.advance(365);
    });
    await Promise.all([q1, q2, act, q3]);
    expect(log).toEqual(['dotaz', 'akce', 'dotaz po akci']);
    expect(village.computes).toBe(1); // akce i druhý dotaz jen zjistily, že je hotovo
    expect(village.conflicts).toBe(0);
  });
});

describe('exclusiveShared – chyby a úklid', () => {
  it('chyba sdíleného dotazu se nepřilepí na další dotaz po ní', async () => {
    const key = playerLockKey('hrac');
    const failing = exclusiveShared(key, '5', () => Promise.reject(new Error('selhal')));
    await expect(failing).rejects.toThrow('selhal');
    await new Promise((resolve) => setImmediate(resolve));
    await expect(exclusiveShared(key, '5', () => Promise.resolve(7))).resolves.toBe(7);
  });

  it('mapa sdílených položek se po dokončení i po chybě uklidí', async () => {
    const key = playerLockKey('hrac');
    await expect(exclusiveShared(key, '1', () => Promise.reject(new Error('x')))).rejects.toThrow();
    await exclusiveShared(key, '2', () => Promise.resolve(1));
    await new Promise((resolve) => setImmediate(resolve));
    expect(pendingExclusiveKeys()).toBe(0);
    const shared = (globalThis as unknown as Record<symbol, Map<string, unknown> | undefined>)[
      Symbol.for('bohemia.exclusive-shared')
    ];
    expect(shared?.size ?? 0).toBe(0);
  });
});
