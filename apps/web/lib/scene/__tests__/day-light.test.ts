import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD, realTimeOf, type WorldClock } from '@bohemia/game';
import { SUN_DIRECTION } from '../constants';
import {
  GAME_DAY_MS,
  NOON_HOUR,
  NO_GRADE,
  dayHourAt,
  dayLight,
  dayLightDistance,
  raysAngleDeg,
  solarDeclinationDeg,
  sunElevationDeg,
} from '../day-light';
import { REFERENCE_DAY, seasonLook } from '../season-look';

// Dny v roce (nepřestupném): 15. 1. = 15, 21. 3. = 80, 21. 6. = 172, 21. 12. = 355.
const MID_WINTER = 15;
const SOLSTICE_SUMMER = 172;
const SOLSTICE_WINTER = 355;
const EQUINOX = 80;

/** Jas barvy (Rec. 709). */
function luma(c: readonly [number, number, number]): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Délka světla (h) – kolik hodin dne je slunce nad obzorem (po minutách). */
function daylightHours(day: number): number {
  let minutes = 0;
  for (let m = 0; m < 24 * 60; m++) if (sunElevationDeg(day, m / 60) > 0) minutes++;
  return minutes / 60;
}

describe('den a noc – poloha slunce', () => {
  it('deklinace slunce sedí na slunovraty a rovnodennost', () => {
    expect(solarDeclinationDeg(SOLSTICE_SUMMER)).toBeCloseTo(23.4, 0);
    expect(solarDeclinationDeg(SOLSTICE_WINTER)).toBeCloseTo(-23.4, 0);
    expect(Math.abs(solarDeclinationDeg(EQUINOX))).toBeLessThan(1.5);
  });

  it('v Čechách je v létě světlo ≈ 16 h, v zimě ≈ 8 h', () => {
    expect(daylightHours(SOLSTICE_SUMMER)).toBeGreaterThan(15.5);
    expect(daylightHours(SOLSTICE_SUMMER)).toBeLessThan(16.6);
    expect(daylightHours(SOLSTICE_WINTER)).toBeGreaterThan(7.5);
    expect(daylightHours(SOLSTICE_WINTER)).toBeLessThan(8.5);
    expect(daylightHours(EQUINOX)).toBeCloseTo(12, 0);
  });

  it('v poledne je slunce nejvýš – v létě ≈ 63°, v zimě ≈ 16,5°', () => {
    expect(sunElevationDeg(SOLSTICE_SUMMER, NOON_HOUR)).toBeCloseTo(63.4, 0);
    expect(sunElevationDeg(SOLSTICE_WINTER, NOON_HOUR)).toBeCloseTo(16.6, 0);
    for (const hour of [6, 9, 11, 13, 15, 18]) {
      expect(sunElevationDeg(SOLSTICE_SUMMER, hour)).toBeLessThan(
        sunElevationDeg(SOLSTICE_SUMMER, NOON_HOUR),
      );
    }
  });
});

describe('den a noc – světlo scény', () => {
  it('léto v poledne vypadá přesně jako dnes (světlo, směr slunce, opar, tón)', () => {
    const season = seasonLook(REFERENCE_DAY);
    const noon = dayLight(season, REFERENCE_DAY, NOON_HOUR);
    expect(noon.light).toEqual(season.light);
    expect(noon.source).toBe('sun');
    expect(noon.direction.x).toBeCloseTo(SUN_DIRECTION.x, 12);
    expect(noon.direction.y).toBeCloseTo(SUN_DIRECTION.y, 12);
    expect(noon.direction.z).toBeCloseTo(SUN_DIRECTION.z, 12);
    expect(noon.ambient).toEqual([1, 1, 1]);
    expect(noon.specular).toEqual([1, 1, 1]);
    expect(noon.tone).toEqual([1, 1, 1]);
    expect(noon.grade).toEqual(NO_GRADE);
    expect(noon.waterSky).toEqual(season.water.sky);
    expect(noon.shadowStrength).toBe(1);
    expect(noon.night).toBe(0);
  });

  it('bez denní doby (hra zatím) zůstane pevné odpolední slunce a světlo období', () => {
    for (const day of [MID_WINTER, REFERENCE_DAY, 288]) {
      const season = seasonLook(day);
      const fixed = dayLight(season, day, null);
      expect(fixed.light).toBe(season.light);
      expect(fixed.direction).toEqual(SUN_DIRECTION);
      expect(fixed.tone).toEqual([1, 1, 1]);
      expect(fixed.ambient).toEqual([1, 1, 1]);
      expect(fixed.waterSky).toEqual(season.water.sky);
    }
  });

  it('přes den platí světlo ročního období beze změny – i v zimě v poledne', () => {
    for (const day of [MID_WINTER, EQUINOX, REFERENCE_DAY, 288]) {
      const season = seasonLook(day);
      const noon = dayLight(season, day, NOON_HOUR);
      expect(noon.light).toEqual(season.light);
      expect(noon.grade).toEqual(NO_GRADE);
      // nižší polední slunce (zima) osvětlí rovinu méně – okolní světlo a tón o něco slabší
      for (const c of [...noon.ambient, ...noon.tone]) {
        expect(c).toBeGreaterThan(0.75);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it('slunce jde po obloze: dopoledne a odpoledne jinudy, v poledne nejvýš', () => {
    const season = seasonLook(REFERENCE_DAY);
    const morning = dayLight(season, REFERENCE_DAY, 8);
    const noon = dayLight(season, REFERENCE_DAY, NOON_HOUR);
    const evening = dayLight(season, REFERENCE_DAY, 16);
    // paprsky míří dolů; v poledne nejstrměji
    expect(noon.direction.y).toBeLessThan(morning.direction.y);
    expect(noon.direction.y).toBeLessThan(evening.direction.y);
    // dopoledne a odpoledne souměrně kolem poledne, ale z opačných stran
    expect(morning.direction.y).toBeCloseTo(evening.direction.y, 9);
    expect(raysAngleDeg(morning.direction, evening.direction)).toBeGreaterThan(60);
    // výška světla ve scéně nepřesáhne referenční poledne (krajina je na něj laděná)
    for (let hour = 0; hour < 24; hour += 0.5) {
      const light = dayLight(season, REFERENCE_DAY, hour);
      expect(light.direction.y).toBeGreaterThanOrEqual(SUN_DIRECTION.y - 1e-9);
    }
  });

  it('v zimě je polední slunce níž než v létě', () => {
    const winter = dayLight(seasonLook(SOLSTICE_WINTER), SOLSTICE_WINTER, NOON_HOUR);
    const summer = dayLight(seasonLook(SOLSTICE_SUMMER), SOLSTICE_SUMMER, NOON_HOUR);
    expect(winter.direction.y).toBeGreaterThan(summer.direction.y + 0.2);
  });

  it('při západu je slunce oranžové, obloha teplá; noc je modrá a čitelná, ne černá', () => {
    const season = seasonLook(REFERENCE_DAY);
    const noon = dayLight(season, REFERENCE_DAY, NOON_HOUR);
    // hodina, kdy je slunce těsně nad obzorem (večer)
    let sunset = 18;
    while (sunElevationDeg(REFERENCE_DAY, sunset) > 1) sunset += 1 / 60;
    const dusk = dayLight(season, REFERENCE_DAY, sunset);
    expect(dusk.source).toBe('sun');
    expect(dusk.light.sunColor[2]).toBeLessThan(dusk.light.sunColor[0] * 0.6);
    expect(dusk.light.clearColor[0]).toBeGreaterThan(dusk.light.clearColor[2]);

    const night = dayLight(season, REFERENCE_DAY, 0);
    expect(night.source).toBe('moon');
    expect(night.night).toBe(1);
    // modrá: modrá složka převládá všude
    for (const color of [night.light.sunColor, night.light.skyColor, night.light.clearColor]) {
      expect(color[2]).toBeGreaterThan(color[0]);
    }
    expect(night.tone[2]).toBeGreaterThan(night.tone[0]);
    // čitelná, ale tmavší než den: jas tónu (materiály bez světla) mezi třetinou a třemi čtvrtinami
    expect(luma(night.tone)).toBeGreaterThan(0.3);
    expect(luma(night.tone)).toBeLessThan(0.75);
    expect(Math.max(...night.light.clearColor)).toBeGreaterThan(0.25);
    expect(night.light.sunIntensity).toBeGreaterThan(0.2);
    expect(night.light.sunIntensity).toBeLessThan(noon.light.sunIntensity);
    expect(luma(night.ambient)).toBeLessThan(0.8);
  });

  it('letní soumrak: šero se studeným světlem, u obzoru teplý opar, zem méně sytá a čitelná', () => {
    const season = seasonLook(REFERENCE_DAY);
    const dusk = dayLight(season, REFERENCE_DAY, 20.25);
    expect(dusk.sunElevationDeg).toBeLessThan(-2);
    // obloha a opar u obzoru oranžovorůžové
    for (const color of [dusk.light.clearColor, dusk.light.fogColor]) {
      expect(color[0]).toBeGreaterThan(color[2] * 1.05);
    }
    expect(dusk.light.fogDensity).toBeGreaterThan(season.light.fogDensity * 1.4);
    // stíny a nasvícená strana (světlo oblohy) do modra, obraz méně sytý a do modra
    expect(dusk.light.skyColor[2]).toBeGreaterThan(dusk.light.skyColor[0] * 1.3);
    expect(dusk.grade.saturation).toBeLessThan(-40);
    expect(dusk.grade.hue).toBeGreaterThan(200);
    expect(dusk.grade.hue).toBeLessThan(240);
    // o něco světlejší než soumrak první verze (obloha × 1,3): ves je čitelná
    expect(dusk.light.skyIntensity).toBeGreaterThan(season.light.skyIntensity * 1.3);
  });

  it('zimní západ: broskvové až zlaté slunce na sněhu, modrofialové stíny – ne růžový', () => {
    const season = seasonLook(MID_WINTER);
    let sunset = 15;
    while (sunElevationDeg(MID_WINTER, sunset) > 0.5) sunset += 1 / 60;
    const light = dayLight(season, MID_WINTER, sunset);
    expect(light.source).toBe('sun');
    const [r, g, b] = light.light.sunColor;
    // zlatavé: zelená drží blízko červené (růžové / oranžové slunce by ji ztratilo)
    expect(g).toBeGreaterThan(r * 0.78);
    expect(b).toBeLessThan(g * 0.7);
    // stíny (jen světlo oblohy) modrofialové
    const [sr, sg, sb] = light.light.skyColor;
    expect(sb).toBeGreaterThan(sr * 1.25);
    expect(sb).toBeGreaterThan(sg * 1.2);
    // filtr obrazu zlatavý, ne růžový
    expect(light.grade.hue).toBeGreaterThan(30);
    expect(light.grade.hue).toBeLessThan(55);
  });

  it('letní noc je studeně modrá jako zimní, ne tyrkysová', () => {
    for (const day of [REFERENCE_DAY, MID_WINTER]) {
      const night = dayLight(seasonLook(day), day, 23);
      for (const color of [night.light.sunColor, night.light.skyColor]) {
        // modrá převládá i nad zelenou – tyrkysová by měla zelenou skoro jako modrou
        expect(color[2]).toBeGreaterThan(color[1] * 1.35);
      }
      expect(night.grade.hue).toBeGreaterThan(220);
      expect(night.grade.hue).toBeLessThan(240);
    }
  });

  it('svítání a soumrak trvají jen pár sekund skutečného času', () => {
    const season = seasonLook(REFERENCE_DAY);
    // od plného dne po plnou noc (večer): výška slunce 10° → −12°
    let from = 15;
    while (sunElevationDeg(REFERENCE_DAY, from) > 10) from += 1 / 60;
    let to = from;
    while (sunElevationDeg(REFERENCE_DAY, to) > -12) to += 1 / 60;
    const seconds = ((to - from) / 24) * (GAME_DAY_MS / 1000);
    expect(seconds).toBeGreaterThan(5);
    expect(seconds).toBeLessThan(20);
    // těsně před soumrakem ještě plné denní světlo
    expect(dayLight(season, REFERENCE_DAY, from - 1 / 60).light).toEqual(season.light);
  });

  it('mění se plynule – mezi sousedními minutami jen málo; slunce se na měsíc přepne potmě', () => {
    for (const day of [MID_WINTER, REFERENCE_DAY]) {
      const season = seasonLook(day);
      let previous = dayLight(season, day, 0);
      for (let minute = 1; minute <= 24 * 60; minute++) {
        const current = dayLight(season, day, minute / 60);
        if (current.source !== previous.source) {
          // přepnutí směru jen když hlavní světlo nesvítí
          expect(current.light.sunIntensity).toBeLessThan(1e-6);
          expect(previous.light.sunIntensity).toBeLessThan(1e-6);
        } else {
          // herní minuta je 0,06 s – nejrychleji se mění síla slunce při západu (≈ 2 s)
          expect(dayLightDistance(current, previous)).toBeLessThan(0.15);
        }
        previous = current;
      }
    }
  });

  it('ranní opar je hustší než večerní', () => {
    const season = seasonLook(REFERENCE_DAY);
    let sunrise = 2;
    while (sunElevationDeg(REFERENCE_DAY, sunrise) < 1) sunrise += 1 / 60;
    const evening = 24 - sunrise;
    expect(dayLight(season, REFERENCE_DAY, sunrise).light.fogDensity).toBeGreaterThan(
      dayLight(season, REFERENCE_DAY, evening).light.fogDensity * 1.3,
    );
  });

  it('nízké slunce vrhá slabší stíny, měsíc taky', () => {
    const season = seasonLook(REFERENCE_DAY);
    let low = 15;
    while (sunElevationDeg(REFERENCE_DAY, low) > 1) low += 1 / 60;
    expect(dayLight(season, REFERENCE_DAY, low).shadowStrength).toBeLessThan(0.6);
    expect(dayLight(season, MID_WINTER, 0).shadowStrength).toBeLessThan(1);
  });
});

describe('den a noc – hodina dne ve světě', () => {
  const world: WorldClock = OFFICIAL_WORLD;
  const date = { year: 640, month: 7, day: 15 };

  it('začátek herního dne je půlnoc, polovina dne poledne', () => {
    const start = realTimeOf(date, world);
    const end = realTimeOf({ ...date, day: 16 }, world);
    expect(dayHourAt(start, world)).toBe(0);
    expect(dayHourAt((start + end) / 2, world)).toBeCloseTo(12, 3);
    expect(dayHourAt(end - 1, world)).toBeGreaterThan(23.99);
  });

  it('svět, který neběží, denní dobu nemá', () => {
    expect(dayHourAt(world.startMs - 1, world)).toBeNull();
    expect(dayHourAt(world.endMs, world)).toBeNull();
  });

  it('herní den trvá ≈ 86 s', () => {
    expect(GAME_DAY_MS / 1000).toBeGreaterThan(86);
    expect(GAME_DAY_MS / 1000).toBeLessThan(87);
  });
});
