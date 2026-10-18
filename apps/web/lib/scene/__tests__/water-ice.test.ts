import { describe, expect, it } from 'vitest';
import {
  BANK_ICE_M,
  FREEZE_SPEED,
  frozenFrom,
  frozenShare,
  iceCover,
  iceCoverOfFlow,
  iceFlowSpeed,
} from '../water-ice';

/** Rychlosti proudu (0–1 jako osa potoka): tůň, klidný úsek, mírný proud, peřej. */
const POOL = 0.08;
const CALM = 0.12;
const MEDIUM = 0.35;
const RIFFLE = 0.9;
/** Uprostřed potoka, daleko od břehu (m od okraje vody, ve vodě záporně). */
const MIDSTREAM = -8;
const JITTERS = [-1, -0.5, 0, 0.5, 1];

describe('led na vodě', () => {
  it('bez zimy nezamrzne nic, ani stojatá voda u břehu', () => {
    for (const speed of [0, POOL, MEDIUM, RIFFLE]) {
      for (const bank of [0, -0.5, MIDSTREAM]) {
        for (const jitter of JITTERS) expect(iceCover(speed, bank, 0, jitter)).toBe(0);
      }
    }
    expect(iceCover(POOL, MIDSTREAM, Number.NaN)).toBe(0);
  });

  it('v plné zimě zamrzne tůň i klidný úsek, peřej uprostřed zůstane otevřená', () => {
    for (const jitter of JITTERS) {
      expect(iceCover(POOL, MIDSTREAM, 1, jitter)).toBe(1);
      expect(iceCover(CALM, MIDSTREAM, 1, jitter)).toBe(1);
      expect(iceCover(RIFFLE, MIDSTREAM, 1, jitter)).toBe(0);
    }
  });

  it('i u peřeje se tvoří led podél břehu, kde proud slábne', () => {
    expect(iceCover(RIFFLE, -0.5, 1)).toBe(1);
    expect(iceCover(RIFFLE, -BANK_ICE_M, 1)).toBe(0);
    // okraj vody zamrzne první – už na začátku zimy
    expect(iceCover(RIFFLE, 0, 0.2)).toBe(1);
  });

  it('se zimou přibývá, s rychlejším proudem a dál od břehu ubývá', () => {
    for (const jitter of JITTERS) {
      let previous = 0;
      for (let ice = 0; ice <= 1.0001; ice += 0.05) {
        const cover = iceCover(MEDIUM, -3, ice, jitter);
        expect(cover).toBeGreaterThanOrEqual(previous - 1e-12);
        previous = cover;
      }
      previous = 1;
      for (let speed = 0; speed <= 1.0001; speed += 0.05) {
        const cover = iceCover(speed, MIDSTREAM, 0.7, jitter);
        expect(cover).toBeLessThanOrEqual(previous + 1e-12);
        previous = cover;
      }
      previous = 1;
      for (let bank = 0; bank >= -10; bank -= 0.25) {
        const cover = iceCover(MEDIUM, bank, 0.7, jitter);
        expect(cover).toBeLessThanOrEqual(previous + 1e-12);
        previous = cover;
      }
    }
  });

  it('zamrzá nejdřív tůň, pak klidný úsek, mírný proud až v plné zimě', () => {
    const firstFull = (speed: number): number => {
      for (let ice = 0; ice <= 1; ice += 0.01)
        if (iceCover(speed, MIDSTREAM, ice) === 1) return ice;
      return Infinity;
    };
    expect(firstFull(POOL)).toBeLessThan(firstFull(CALM));
    expect(firstFull(CALM)).toBeLessThan(firstFull(MEDIUM));
    expect(firstFull(MEDIUM)).toBeLessThanOrEqual(1);
    expect(firstFull(RIFFLE)).toBe(Infinity);
    expect(FREEZE_SPEED).toBeGreaterThan(MEDIUM);
  });

  it('rychlost proudu u břehu klesá k nule, uprostřed se nemění', () => {
    expect(iceFlowSpeed(RIFFLE, 0)).toBe(0);
    expect(iceFlowSpeed(RIFFLE, 1)).toBe(0);
    expect(iceFlowSpeed(RIFFLE, MIDSTREAM)).toBe(RIFFLE);
    expect(iceFlowSpeed(-1, MIDSTREAM)).toBe(0);
    expect(iceCover(MEDIUM, -2, 0.8, 0.3)).toBe(iceCoverOfFlow(iceFlowSpeed(MEDIUM, -2), 0.8, 0.3));
  });
});

describe('zamrzlá voda celá (frozenFrom)', () => {
  it('od vrácené zimy je místo zamrzlé, ať šum vyjde jakkoli; těsně před ní ne vždy', () => {
    for (const flow of [0, POOL, CALM, 0.3]) {
      const from = frozenFrom(flow);
      expect(from).toBeLessThanOrEqual(1);
      for (const jitter of JITTERS) expect(iceCoverOfFlow(flow, from, jitter)).toBe(1);
      expect(Math.min(...JITTERS.map((j) => iceCoverOfFlow(flow, from - 0.02, j)))).toBeLessThan(1);
    }
  });

  it('peřej nezamrzne nikdy', () => {
    expect(frozenFrom(RIFFLE)).toBeGreaterThan(1);
    expect(frozenFrom(MEDIUM + 0.05)).toBeGreaterThan(1);
  });
});

describe('podíl zamrzlé šířky potoka (zvuk)', () => {
  it('bez zimy nic, v plné zimě tůň celá a peřej jen u břehů', () => {
    expect(frozenShare(RIFFLE, 8, 0)).toBe(0);
    expect(frozenShare(POOL, 8, 1)).toBe(1);
    const riffle = frozenShare(RIFFLE, 8, 1);
    expect(riffle).toBeGreaterThan(0.05);
    expect(riffle).toBeLessThan(0.4);
    // úzká peřej má břehy blíž – zamrzlá je větší část šířky
    expect(frozenShare(RIFFLE, 3, 1)).toBeGreaterThan(riffle);
  });

  it('se zimou přibývá', () => {
    let previous = 0;
    for (let ice = 0; ice <= 1.0001; ice += 0.05) {
      const share = frozenShare(MEDIUM, 8, ice);
      expect(share).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(share).toBeLessThanOrEqual(1);
      previous = share;
    }
  });
});
