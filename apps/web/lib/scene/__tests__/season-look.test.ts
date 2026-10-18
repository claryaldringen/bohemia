import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD, realTimeOf, type WorldClock } from '@bohemia/game';
import {
  REFERENCE_DAY,
  dateOfDayOfYear,
  seasonDayAt,
  seasonLook,
  seasonLookDistance,
  track,
} from '../season-look';

// Dny v roce (nepřestupném): 15. 1. = 15, 15. 4. = 105, 15. 7. = 196, 15. 10. = 288.
const MID_WINTER = 15;
const MID_SPRING = 105;
const MID_AUTUMN = 288;

describe('vzhled ročního období', () => {
  it('vrcholné léto je výchozí vzhled krajiny – beze sněhu, plné listí, letní světlo', () => {
    const summer = seasonLook(REFERENCE_DAY);
    expect(summer).toMatchObject({
      snow: 0,
      ice: 0,
      grassDry: 0,
      grassFresh: 0,
      leaves: 1,
      leafAutumn: 0,
      leafFresh: 0,
      blossom: 0,
    });
    // světlo, ke kterému je krajina laděná (dřív konstanty v landscape-scene.ts)
    expect(summer.light.sunIntensity).toBeCloseTo(1.05);
    expect(summer.light.skyIntensity).toBeCloseTo(0.5);
    expect(summer.light.fogDensity).toBeCloseTo(0.00032);
    expect(summer.light.clearColor.map((c) => c.toFixed(3))).toEqual(['0.630', '0.750', '0.850']);
    expect(summer.water.tint).toEqual([1, 1, 1]);
    expect(summer.sound).toEqual({ birds: 1, birdsong: 1, leaves: 1 });
    // celé léto (červenec a srpen) vypadá stejně
    for (let day = 170; day <= 230; day++) {
      expect(seasonLookDistance(seasonLook(day), summer)).toBeLessThan(1e-9);
    }
  });

  it('v zimě leží sníh, listnáče jsou holé, ptáci skoro mlčí', () => {
    const winter = seasonLook(MID_WINTER);
    expect(winter.snow).toBe(1);
    expect(winter.ice).toBe(1);
    expect(winter.leaves).toBe(0);
    expect(winter.grassDry).toBeGreaterThan(0.8);
    expect(winter.sound.birds).toBeLessThan(0.5);
    expect(winter.light.sunIntensity).toBeLessThan(seasonLook(REFERENCE_DAY).light.sunIntensity);
  });

  it('na jaře je tráva svěží, listí raší a keře kvetou; sníh roztál', () => {
    const spring = seasonLook(MID_SPRING);
    expect(spring.snow).toBe(0);
    expect(spring.ice).toBe(0);
    expect(spring.grassFresh).toBeGreaterThan(0.9);
    expect(spring.leafFresh).toBe(1);
    expect(spring.leaves).toBeGreaterThan(0.5);
    expect(spring.leaves).toBeLessThan(1);
    expect(spring.blossom).toBeGreaterThan(0.5);
  });

  it('na podzim je listí zbarvené a ještě na stromech, tráva usychá', () => {
    const autumn = seasonLook(MID_AUTUMN);
    expect(autumn.snow).toBe(0);
    expect(autumn.ice).toBe(0);
    expect(autumn.leafAutumn).toBeGreaterThan(0.95);
    expect(autumn.leaves).toBe(1);
    expect(autumn.grassDry).toBeGreaterThan(0.3);
    expect(autumn.sound.leaves).toBeGreaterThan(1);
  });

  it('mění se plynule – za den nejvýš o pár procent, i přes konec roku', () => {
    let maxStep = 0;
    for (let day = 1; day <= 366; day += 0.25) {
      const next = day + 0.25 > 366 ? 1 : day + 0.25;
      maxStep = Math.max(maxStep, seasonLookDistance(seasonLook(day), seasonLook(next)));
    }
    // přechody trvají 2–5 týdnů: smoothstep má největší sklon 1,5 / délka přechodu
    expect(maxStep * 4).toBeLessThan(0.1);
    expect(seasonLookDistance(seasonLook(365.99), seasonLook(1))).toBeLessThan(0.01);
    // 366. den přestupného roku navazuje na 1. 1.
    expect(seasonLookDistance(seasonLook(366), seasonLook(1))).toBeLessThan(1e-9);
  });

  it('parametry zůstávají v rozsahu 0–1 a podíly období dávají dohromady 1', () => {
    for (let day = 1; day <= 366; day += 0.5) {
      const look = seasonLook(day);
      for (const value of [
        look.snow,
        look.ice,
        look.grassDry,
        look.grassFresh,
        look.leaves,
        look.leafAutumn,
        look.leafFresh,
        look.blossom,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(look.light.fogDensity).toBeGreaterThan(0);
    }
  });

  it('voda zamrzá v prosinci za sněhem a roztaje v březnu, až sníh skoro zmizí', () => {
    // 1. 12. = 335, 25. 12. = 359, 1. 3. = 60, 31. 3. = 90 (nepřestupný rok)
    expect(seasonLook(334).ice).toBe(0);
    expect(seasonLook(359).ice).toBe(1);
    expect(seasonLook(60).ice).toBe(1);
    expect(seasonLook(90).ice).toBe(0);
    for (let day = 324; day <= 359; day += 0.5) {
      expect(seasonLook(day).ice).toBeLessThanOrEqual(seasonLook(day).snow);
    }
    for (let day = 51; day <= 84; day += 0.5) {
      expect(seasonLook(day).ice).toBeGreaterThanOrEqual(seasonLook(day).snow);
    }
    // změna ledu se pozná a překreslí
    expect(seasonLookDistance(seasonLook(345), seasonLook(346))).toBeGreaterThan(0.002);
  });

  it('neplatný den se kreslí jako léto', () => {
    expect(seasonLookDistance(seasonLook(Number.NaN), seasonLook(REFERENCE_DAY))).toBe(0);
  });
});

describe('stopa (track)', () => {
  const points = [
    [100, 0],
    [200, 1],
  ] as const;

  it('mezi body hladce, za posledním bodem přes konec roku zpět k prvnímu', () => {
    expect(track(points, 100)).toBe(0);
    expect(track(points, 150)).toBeCloseTo(0.5);
    expect(track(points, 200)).toBe(1);
    // úsek 200 → 100 dalšího roku (265 dní): polovina leží na 1. 1. + 67
    expect(track(points, 332.5)).toBeCloseTo(0.5);
    expect(track(points, 50)).toBeGreaterThan(0);
    expect(track(points, 50)).toBeLessThan(0.5);
  });
});

describe('den v roce podle herního data', () => {
  it('svět, který neběží, má léto', () => {
    expect(seasonDayAt(OFFICIAL_WORLD.startMs - 1, OFFICIAL_WORLD)).toBe(REFERENCE_DAY);
    expect(seasonDayAt(OFFICIAL_WORLD.endMs, OFFICIAL_WORLD)).toBe(REFERENCE_DAY);
  });

  it('běžící svět: den v roce z herního kalendáře, jednou za herní den', () => {
    const world: WorldClock = OFFICIAL_WORLD;
    const start = realTimeOf({ year: 501, month: 3, day: 1 }, world);
    expect(seasonDayAt(start, world)).toBe(60);
    expect(seasonDayAt(start + 1000, world)).toBe(60);
    const nextDay = realTimeOf({ year: 501, month: 3, day: 2 }, world);
    expect(seasonDayAt(nextDay, world)).toBe(61);
  });

  it('kalendářní datum dne v roce (vývojový přepínač)', () => {
    expect(dateOfDayOfYear(60)).toMatchObject({ month: 3, day: 1, season: 'spring' });
    expect(dateOfDayOfYear(1)).toMatchObject({ month: 1, day: 1, season: 'winter' });
    expect(dateOfDayOfYear(365.7)).toMatchObject({ month: 12, day: 31 });
  });
});
