import { describe, expect, it } from 'vitest';
import { dayLight } from '../day-light';
import {
  dropPosition,
  dropSeeds,
  overcast,
  puddleAmount,
  rainAmount,
  rainBox,
  RAIN_LOOK,
  rainOnDay,
  streakLength,
} from '../rain';
import { REFERENCE_DAY, seasonLook } from '../season-look';
import { partWeather } from '../field-look';

describe('dny deště (jen vzhled)', () => {
  it('bez mokra nikdy neprší, v deštivém létě zhruba každý druhý den', () => {
    let wetDays = 0;
    for (let day = 0; day < 2000; day++) {
      expect(rainOnDay(day, 0)).toBe(0);
      expect(rainAmount(day + 0.5, 0)).toBe(0);
      if (rainOnDay(day, 1) > 0) wetDays++;
    }
    expect(wetDays / 2000).toBeGreaterThan(0.45);
    expect(wetDays / 2000).toBeLessThan(0.65);
  });

  it('stejný den světa = stejný déšť (deterministicky), síla 0,6–1', () => {
    for (let day = -50; day < 50; day++) {
      const rain = rainOnDay(day, 1);
      expect(rainOnDay(day, 1)).toBe(rain);
      if (rain > 0) {
        expect(rain).toBeGreaterThanOrEqual(0.6);
        expect(rain).toBeLessThanOrEqual(1);
      }
    }
  });

  it('déšť začne a skončí plynule – za desetinu dne nejvýš o pár desetin', () => {
    for (let t = 100; t < 160; t += 0.01) {
      const step = Math.abs(rainAmount(t + 0.01, 1) - rainAmount(t, 1));
      expect(step).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });

  it('kaluže: v deštivém létě i mezi dešti, za deště víc; v normálním roce žádné', () => {
    expect(puddleAmount(0, 0)).toBe(0);
    expect(puddleAmount(1, 0)).toBeGreaterThan(0);
    expect(puddleAmount(1, 1)).toBe(1);
  });
});

describe('zataženo za deště', () => {
  it('bez deště světlo beze změny, za deště slabší slunce, hustší opar a skoro bez stínů', () => {
    const day = dayLight(seasonLook(REFERENCE_DAY), REFERENCE_DAY, null);
    expect(overcast(day, 0)).toBe(day);
    const rainy = overcast(day, 1);
    expect(rainy.light.sunIntensity).toBeLessThan(day.light.sunIntensity * 0.6);
    expect(rainy.light.fogDensity).toBeGreaterThan(day.light.fogDensity * 1.5);
    expect(rainy.shadowStrength).toBeLessThan(day.shadowStrength * 0.3);
  });
});

describe('délka čárky podle posunu', () => {
  it('při plném taktu základní, při řídkých snímcích delší, po pauze omezená', () => {
    const box = rainBox(100);
    expect(box.side).toBeGreaterThanOrEqual(30);
    expect(streakLength(box, RAIN_LOOK, 1 / 30)).toBe(box.streak);
    const slow = streakLength(box, RAIN_LOOK, 0.1);
    expect(slow).toBeGreaterThan(RAIN_LOOK.fallMps * 0.1);
    const capped = streakLength(box, RAIN_LOOK, 5);
    expect(capped).toBeLessThanOrEqual(box.height * 0.4);
    expect(capped).toBeGreaterThanOrEqual(slow);
    expect(streakLength(box, RAIN_LOOK, -3)).toBe(box.streak);
  });
});

describe('kapky', () => {
  it('padají dolů a dokola, zůstávají v kvádru kolem cíle kamery', () => {
    const seeds = dropSeeds(50);
    const box = rainBox(200);
    const center = { x: 1234, z: -567 };
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 50; i++) {
      dropPosition(seeds, i, 10, center, box, a);
      dropPosition(seeds, i, 10.05, center, box, b);
      expect(Math.abs(a[0] - center.x)).toBeLessThanOrEqual(box.side / 2 + box.height);
      expect(Math.abs(a[2] - center.z)).toBeLessThanOrEqual(box.side / 2 + box.height);
      // za 0,05 s kapka spadne, nebo se vrátí nahoru (dokola)
      expect(b[1] < a[1] || b[1] > a[1] + box.height * 0.5).toBe(true);
    }
  });
});

describe('obilí podle počasí roku', () => {
  it('normální rok beze změny; sucho nižší a řidší, chráněný díl méně', () => {
    expect(partWeather({ drought: 0, wet: 0, frost: 0 }, 0, true)).toBeNull();
    const open = partWeather({ drought: 1, wet: 0, frost: 0 }, 0, true)!;
    const sheltered = partWeather({ drought: 1, wet: 0, frost: 0 }, 4, true)!;
    expect(open.height).toBeLessThan(0.7);
    expect(open.density).toBeLessThan(0.7);
    expect(sheltered.height).toBeGreaterThan(open.height);
    expect(sheltered.density).toBeGreaterThan(open.density);
  });

  it('mokro: obilí polehne (luštěniny a len ne), na svahu méně než v nivě', () => {
    const niva = partWeather({ drought: 0, wet: 1, frost: 0 }, 0, true)!;
    const slope = partWeather({ drought: 0, wet: 1, frost: 0 }, 4, true)!;
    expect(niva.lodged).toBeGreaterThan(slope.lodged);
    expect(slope.lodged).toBeGreaterThan(0);
    expect(partWeather({ drought: 0, wet: 1, frost: 0 }, 0, false)).toBeNull();
  });

  it('vymrzlý ozim: řidší o třetinu, prosvítá hlína', () => {
    const frozen = partWeather({ drought: 0, wet: 0, frost: 1 }, 0, true)!;
    expect(frozen.density).toBeCloseTo(0.65);
    expect(frozen.bare).toBe(1);
    expect(frozen.height).toBe(1);
  });
});
