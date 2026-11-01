import { describe, expect, it } from 'vitest';
import { PLAYER_LOCK_NAMESPACE, playerLockHash } from '../player-lock';

// Otisk klíče se po spuštění nesmí změnit: web a worker různých verzí musí zamykat stejný klíč.
describe('playerLockHash', () => {
  it('je 32bitové FNV-1a (vzorové hodnoty) jako int4 se znaménkem', () => {
    expect(playerLockHash('')).toBe(0x811c9dc5 | 0);
    expect(playerLockHash('a')).toBe(0xe40c292c | 0);
    expect(playerLockHash('foobar')).toBe(0xbf9cf968 | 0);
  });

  it('pevné hodnoty pro id hráčů (UTF-8)', () => {
    expect(playerLockHash('hrac-1')).toBe(502_345_225);
    expect(playerLockHash('x7Kp2QmN9vR4tLs8wB3yZ6cH1jF5dG0a')).toBe(720_189_633);
    expect(playerLockHash('Vojvoda Čech')).toBe(-99_078_556);
  });

  it('obě čísla klíče se vejdou do int4', () => {
    for (const id of ['', 'a', 'hrac-1', 'Vojvoda Čech']) {
      const hash = playerLockHash(id);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(hash).toBeLessThan(2 ** 31);
    }
    expect(PLAYER_LOCK_NAMESPACE).toBe(0x426f6865);
    expect(PLAYER_LOCK_NAMESPACE).toBeLessThan(2 ** 31);
  });
});
