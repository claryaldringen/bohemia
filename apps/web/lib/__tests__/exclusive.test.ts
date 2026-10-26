import { describe, expect, it } from 'vitest';
import { exclusive, pendingExclusiveKeys, playerLockKey } from '../exclusive';

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
