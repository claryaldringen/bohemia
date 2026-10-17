import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { daysUntilHarvest, eatDay } from '../food';

const day = (year: number, month: number, d: number): number => dayIndexOf({ year, month, day: d });

describe('eatDay', () => {
  it('při dostatku zásob nasytí všechny a ubude potřeba plus ztráta', () => {
    const r = eatDay(10_000, 10, 100);
    expect(r.satiation).toBe(1);
    expect(r.storesKg).toBeLessThan(10_000 - 10);
    expect(r.storesKg).toBeGreaterThan(10_000 - 10 - 3);
  });

  it('při nedostatku zásob je nasycení poměrem zásob a potřeby do sklizně', () => {
    const r = eatDay(100, 2, 100);
    expect(r.satiation).toBeCloseTo(0.5, 2);
    expect(r.storesKg).toBeGreaterThanOrEqual(0);
  });

  it('nulová potřeba dává nasycení 1 bez NaN', () => {
    const r = eatDay(500, 0, 100);
    expect(r.satiation).toBe(1);
    expect(Number.isNaN(r.storesKg)).toBe(false);
  });

  it('prázdné zásoby dávají nasycení 0 a zásoby 0', () => {
    expect(eatDay(0, 5, 100)).toEqual({ storesKg: 0, satiation: 0 });
  });

  it('bez lidí zásoby za rok ubudou o 10 %', () => {
    let stores = 1000;
    for (let i = 0; i < 365; i++) stores = eatDay(stores, 0, 365).storesKg;
    expect(stores).toBeCloseTo(900, 0);
  });
});

describe('daysUntilHarvest', () => {
  it('31. 8. je poslední den, tedy 1', () => {
    expect(daysUntilHarvest(day(600, 8, 31))).toBe(1);
  });

  it('1. 9. je celý rok dopředu', () => {
    expect(daysUntilHarvest(day(600, 9, 1))).toBe(365);
  });

  it('počítá přestupný únor před sklizní', () => {
    expect(daysUntilHarvest(day(599, 9, 1))).toBe(366);
  });
});
