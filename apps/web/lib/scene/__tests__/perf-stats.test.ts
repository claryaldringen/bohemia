import { describe, expect, it } from 'vitest';
import { AverageMeter, RateMeter } from '../perf-stats';

describe('RateMeter – události za sekundu (klouzavé okno)', () => {
  it('počítá jen události z poslední sekundy', () => {
    const meter = new RateMeter();
    // každých 10 ms – v okně (1000, 2000] je jich 100
    for (let t = 0; t <= 2000; t += 10) meter.tick(t);
    expect(meter.rate(2000)).toBe(100);
    // po sekundě bez událostí nula
    expect(meter.rate(3100)).toBe(0);
  });
});

describe('AverageMeter – průměr posledních vzorků', () => {
  it('bez vzorku null, jinak průměr nejvýš `size` posledních', () => {
    const meter = new AverageMeter(2);
    expect(meter.average()).toBeNull();
    meter.add(1);
    meter.add(3);
    meter.add(5);
    expect(meter.average()).toBe(4);
  });
});
