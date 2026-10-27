import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD, realTimeOf, type WorldClock } from '@bohemia/game';
import {
  REFERENCE_DAY,
  dateOfDayOfYear,
  seasonDayAt,
  seasonLook,
  seasonLookDistance,
  track,
  weatherAmounts,
  type LookWeather,
} from '../season-look';
import { dayLight } from '../day-light';
import { droughtPartTint } from '../field-look';

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

// Počasí roku (disasters.md – Ve scéně): 1. 5. = 121, 13. 3. = 72, 10. 4. = 100.
const DROUGHT: LookWeather = { summer: 'drought', strength: 1 };
const DRY: LookWeather = { summer: 'dry', strength: 0.6 };
const WET: LookWeather = { summer: 'wet', strength: 0.6 };

describe('vzhled roku podle počasí', () => {
  it('bez počasí (normální rok, dobré léto) přesně vzhled ročního období', () => {
    for (let day = 1; day <= 366; day += 0.5) {
      const base = seasonLook(day);
      expect(seasonLook(day, undefined)).toEqual(base);
      expect(seasonLook(day, {})).toEqual(base);
      expect(seasonLook(day, { summer: 'good' })).toEqual(base);
      expect(base).toMatchObject({ drought: 0, wet: 0, frost: 0 });
    }
    // léto, ke kterému je krajina laděná, se nezměnilo
    expect(seasonLook(REFERENCE_DAY).light.sunIntensity).toBeCloseTo(1.05);
    expect(dayLight(seasonLook(REFERENCE_DAY), REFERENCE_DAY, null)).toMatchObject({
      shadowStrength: 1,
      contrast: 1,
    });
  });

  it('1. 1. jsou všechny složky počasí nulové – zahození počasí po Novém roce nic neskokne', () => {
    // `weatherNow` v landscape-scene.ts po přelomu roku počasí zahodí (do odpovědi serveru
    // normální rok) – vzhled se tím nesmí změnit, žádná dráha nesmí přes Nový rok přesahovat
    const all: LookWeather[] = [
      { summer: 'dry', strength: 1 },
      { summer: 'drought', strength: 1 },
      { summer: 'wet', strength: 1 },
      { summer: 'wetHarvest', strength: 1 },
      { winter: 'blackFrost' },
      { winter: 'long' },
    ];
    for (const weather of all) {
      for (const day of [366, 1]) {
        expect(weatherAmounts(day, weather)).toEqual({ drought: 0, wet: 0, frost: 0, delay: 0 });
        expect(seasonLook(day, weather)).toEqual(seasonLook(day));
      }
    }
  });

  it('sucho – slunce praží: jasnější a žlutější slunce, ostřejší stíny, vybledlá obloha', () => {
    const normal = seasonLook(REFERENCE_DAY);
    const hot = seasonLook(REFERENCE_DAY, DROUGHT);
    expect(hot.drought).toBe(1);
    expect(hot.light.sunIntensity).toBeCloseTo(1.05 * 1.16);
    // žlutější – modrá složka slunce klesne víc než červená
    expect(hot.light.sunColor[2] / hot.light.sunColor[0]).toBeLessThan(
      normal.light.sunColor[2] / normal.light.sunColor[0] - 0.1,
    );
    // vyšší kontrast – slabší rozptýlené světlo oblohy
    expect(hot.light.skyIntensity).toBeLessThan(normal.light.skyIntensity * 0.9);
    // vybledlá obloha – méně modrá, světlejší; hustší opar
    const blue = (c: readonly number[]): number => c[2]! - c[0]!;
    expect(blue(hot.light.clearColor)).toBeLessThan(blue(normal.light.clearColor) / 2);
    expect(hot.light.fogDensity).toBeCloseTo(normal.light.fogDensity * 1.3);
    const light = dayLight(hot, REFERENCE_DAY, null);
    expect(light.shadowStrength).toBeCloseTo(1.35);
    expect(light.contrast).toBeCloseTo(1.12);
    // mírné sucho slaběji než kruté
    const dry = seasonLook(REFERENCE_DAY, DRY);
    expect(dry.drought).toBeCloseTo(0.6);
    expect(dry.light.sunIntensity).toBeGreaterThan(normal.light.sunIntensity);
    expect(dry.light.sunIntensity).toBeLessThan(hot.light.sunIntensity);
  });

  it('sucho nastupuje od 1. 5. plynule a s podzimem odezní – vzhled nikdy neskočí', () => {
    expect(seasonLook(120, DROUGHT)).toEqual(seasonLook(120));
    expect(seasonLook(300, DROUGHT)).toEqual(seasonLook(300));
    for (const weather of [DROUGHT, WET, { winter: 'blackFrost' }, { winter: 'long' }] as const) {
      for (let day = 1; day < 366; day++) {
        const step = seasonLookDistance(seasonLook(day, weather), seasonLook(day + 1, weather));
        // holomráz a dlouhá zima přinesou změnu sněhu za 5–6 dní
        expect(step).toBeLessThan(0.36);
      }
    }
  });

  it('mokro – šedé světlo, víc oparu, slabší stíny', () => {
    const normal = seasonLook(REFERENCE_DAY);
    const wet = seasonLook(REFERENCE_DAY, WET);
    expect(wet.wet).toBeCloseTo(0.6);
    expect(wet.light.sunIntensity).toBeLessThan(normal.light.sunIntensity * 0.85);
    expect(wet.light.fogDensity).toBeGreaterThan(normal.light.fogDensity * 1.3);
    const grey = (c: readonly number[]): number => Math.max(...c) - Math.min(...c);
    expect(grey(wet.light.clearColor)).toBeLessThan(grey(normal.light.clearColor));
    expect(dayLight(wet, REFERENCE_DAY, null).shadowStrength).toBeLessThan(0.75);
  });

  it('holomráz – od 1. 2. jinovatka bez sněhu', () => {
    const frost: LookWeather = { winter: 'blackFrost' };
    expect(seasonLook(MID_WINTER, frost)).toEqual(seasonLook(MID_WINTER));
    const feb = seasonLook(45, frost);
    expect(feb.snow).toBe(0);
    expect(feb.frost).toBe(1);
    expect(seasonLook(45).snow).toBe(1);
  });

  it('dlouhá zima – sníh do dubna, jaro o 3 týdny později, v létě normální rok', () => {
    const long: LookWeather = { winter: 'long' };
    // 13. 3. ještě plný sníh (normálně roztál), do dubna taje
    expect(seasonLook(72, long).snow).toBeGreaterThan(0.95);
    expect(seasonLook(72).snow).toBe(0);
    expect(seasonLook(88, long).snow).toBeGreaterThan(0.05);
    expect(seasonLook(100, long).leaves).toBeLessThan(seasonLook(100).leaves - 0.2);
    expect(weatherAmounts(100, long).delay).toBe(21);
    expect(seasonLook(REFERENCE_DAY, long)).toEqual(seasonLook(REFERENCE_DAY));
    // po návratu sněhu jaro jen postupuje – den vzhledu neklesá
    for (let day = 66; day < 210; day += 0.5) {
      const now = day - weatherAmounts(day, long).delay;
      const next = day + 0.5 - weatherAmounts(day + 0.5, long).delay;
      expect(next).toBeGreaterThan(now);
    }
  });

  it('díl za stromy je v suchu zelenější, nechráněný žloutne', () => {
    expect(droughtPartTint(0, 0)).toBeNull();
    expect(droughtPartTint(0.1, 4)).toBeNull();
    const open = droughtPartTint(1, 0)!;
    const sheltered = droughtPartTint(1, 4)!;
    expect(open[2]).toBeLessThan(0.7);
    expect(sheltered[1]).toBeGreaterThan(1);
    expect(sheltered[1] / sheltered[0]).toBeGreaterThan(open[1] / open[0] + 0.2);
    // po čtvrtinách – den náběhu sucha díly nepřestaví
    expect(droughtPartTint(0.52, 2)).toEqual(droughtPartTint(0.48, 2));
  });
});
