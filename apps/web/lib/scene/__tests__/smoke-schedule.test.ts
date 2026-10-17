import { describe, it, expect } from 'vitest';
import { OFFICIAL_WORLD } from '@bohemia/game';
import {
  PUFFS_PER_PLUME,
  PUFF_LIFE_S,
  dayFires,
  gameDayAt,
  gameDaySeconds,
  hash01,
  plumePuffs,
  smokeStrength,
} from '../smoke-schedule';

describe('herní den', () => {
  it('ostrý svět: den trvá ≈ 86 s a začíná 1. 1. roku 500 o půlnoci', () => {
    expect(gameDaySeconds(OFFICIAL_WORLD)).toBeCloseTo(86.34, 1);
    expect(gameDayAt(OFFICIAL_WORLD.startMs, OFFICIAL_WORLD)).toBe(0);
    const day = gameDayAt(OFFICIAL_WORLD.startMs + 43_170, OFFICIAL_WORLD);
    expect(day).toBeCloseTo(0.5, 2);
  });
});

describe('rozvrh ohně', () => {
  it('je deterministický – stejné obydlí a den, stejný oheň', () => {
    expect(dayFires(7, 123)).toEqual(dayFires(7, 123));
    expect(smokeStrength(7, 123.3)).toBe(smokeStrength(7, 123.3));
    expect(hash01(1, 2, 3)).toBe(hash01(1, 2, 3));
    expect(hash01(1, 2, 3)).not.toBe(hash01(1, 2, 4));
  });

  it('kouří se ráno a večer, v noci ne; některé dny se vynechá', () => {
    let morning = 0;
    let evening = 0;
    let night = 0;
    const days = 400;
    for (let day = 0; day < days; day++) {
      const fires = dayFires(42, day);
      if (fires.some((f) => f.from < 0.35)) morning++;
      if (fires.some((f) => f.from > 0.65)) evening++;
      if (smokeStrength(42, day + 0.05) > 0 || smokeStrength(42, day + 0.98) > 0) night++;
      for (const f of fires) {
        expect(f.to).toBeGreaterThan(f.from);
        expect(f.to).toBeLessThan(1);
        expect(f.strength).toBeGreaterThan(0);
        expect(f.strength).toBeLessThanOrEqual(1);
      }
    }
    expect(morning / days).toBeGreaterThan(0.75);
    expect(morning / days).toBeLessThan(0.95);
    expect(evening / days).toBeGreaterThan(0.8);
    expect(night).toBe(0);
  });

  it('dým „občas“ – za den kouří jen menší část času a obydlí nekouří všechna naráz', () => {
    let smoking = 0;
    let samples = 0;
    let together = 0;
    for (let day = 0; day < 50; day++) {
      for (let t = 0; t < 1; t += 0.01) {
        samples++;
        if (smokeStrength(1, day + t) > 0) smoking++;
        if ([1, 2, 3, 4, 5].every((seed) => smokeStrength(seed, day + t) > 0)) together++;
      }
    }
    expect(smoking / samples).toBeGreaterThan(0.1);
    expect(smoking / samples).toBeLessThan(0.45);
    expect(together / samples).toBeLessThan(0.1);
  });

  it('oheň se rozhoří a dohasne plynule', () => {
    const fire = dayFires(9, 3)[0]!;
    const start = smokeStrength(9, 3 + fire.from + 0.002);
    const full = smokeStrength(9, 3 + (fire.from + fire.to) / 2);
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(full);
  });
});

describe('obláčky dýmu', () => {
  it('stoupají, rostou a s věkem slábnou; bez ohně jsou neviditelné', () => {
    const puffs = plumePuffs(3, 1000, () => 1);
    expect(puffs).toHaveLength(PUFFS_PER_PLUME);
    const sorted = [...puffs].sort((a, b) => a.dy - b.dy);
    expect(sorted[sorted.length - 1]!.dy).toBeGreaterThan(sorted[0]!.dy + 4);
    expect(sorted[sorted.length - 1]!.size).toBeGreaterThan(sorted[0]!.size);
    for (const puff of puffs) {
      expect(puff.alpha).toBeGreaterThanOrEqual(0);
      expect(puff.alpha).toBeLessThanOrEqual(1);
    }
    expect(plumePuffs(3, 1000, () => 0).every((p) => p.alpha === 0)).toBe(true);
  });

  it('pohyb je plynulý – za třicetinu sekundy se obláček posune jen kousek', () => {
    const a = plumePuffs(5, 200, () => 1).map((p) => ({ ...p }));
    const b = plumePuffs(5, 200 + 1 / 30, () => 1);
    a.forEach((puff, i) => {
      const next = b[i]!;
      // obláček, který právě dožil, začne znovu dole (to je v pořádku)
      if (next.dy < puff.dy - 1) return;
      expect(Math.hypot(next.dx - puff.dx, next.dy - puff.dy, next.dz - puff.dz)).toBeLessThan(0.2);
    });
  });

  it('když oheň zhasne, poslední obláčky ještě doletí (síla podle doby vzniku)', () => {
    // hořelo před 3–6 s, teď už ne
    const puffs = plumePuffs(8, 500, (age) => (age > 3 && age < 6 ? 1 : 0));
    const visible = puffs.filter((p) => p.alpha > 0);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(PUFFS_PER_PLUME);
    // viditelné jsou starší (výš) obláčky, ne ty u dýmníku
    const youngest = Math.min(...visible.map((p) => p.dy));
    expect(youngest).toBeGreaterThan(1.5);
    expect(PUFF_LIFE_S).toBeGreaterThan(6);
  });
});
