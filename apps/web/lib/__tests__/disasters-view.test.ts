import { describe, expect, it } from 'vitest';
import { dayIndexOf, type VillageState } from '@bohemia/game';
import {
  dearthLabel,
  disasterNotices,
  floodLabel,
  partLossesView,
  partLossRows,
  partProtectionView,
  protectionLabel,
  summerLabel,
  tradeDearth,
  weatherNotices,
  weatherView,
  winterLabel,
} from '../disasters-view';

// Počasí a pohromy v rozhraní (disasters.md – Co hráč vidí).

type WeatherState = Pick<VillageState, 'weatherSeed' | 'disasters'>;

const forced: WeatherState = {
  disasters: {
    override: {
      weather: { 503: { summer: 'drought', winter: 'blackFrost' }, 504: { summer: 'wet' } },
    },
  },
};
const APRIL_30 = dayIndexOf({ year: 503, month: 4, day: 30 });
const MAY_2 = dayIndexOf({ year: 503, month: 5, day: 2 });

describe('weatherView – jen co už je vidět', () => {
  it('30. 4. holomráz ano, sucho ještě ne; 2. 5. i sucho; budoucí rok nikdy', () => {
    expect(weatherView(forced, APRIL_30)).toEqual({ year: 503, winter: 'blackFrost' });
    expect(weatherView(forced, MAY_2)).toEqual({
      year: 503,
      summer: 'drought',
      winter: 'blackFrost',
    });
    expect(JSON.stringify(weatherView(forced, APRIL_30))).not.toContain('wet');
  });

  it('ves bez počasí kraje lištu nemá', () => {
    expect(weatherView({}, MAY_2)).toBeUndefined();
  });

  it('povodeň s výškou vody, dokud ve vsi leží voda a bahno', () => {
    const state: WeatherState = {
      ...forced,
      disasters: { ...forced.disasters, flood: { day: MAY_2, level: 'hundred', heightM: 2 } },
    };
    expect(weatherView(state, MAY_2 + 3)?.flood).toEqual({ level: 'hundred', heightM: 2 });
    expect(weatherView(state, MAY_2 + 40)?.flood).toBeUndefined();
    expect(floodLabel({ level: 'hundred', heightM: 2 })).toBe('Stoletá voda – 2 m nad hladinou');
    expect(floodLabel({ level: 'twenty', heightM: 1.2 })).toBe(
      'Dvacetiletá voda – 1,2 m nad hladinou',
    );
  });

  it('popisky z pravidel', () => {
    expect(summerLabel('drought')).toBe(
      'Kruté sucho – ozim −25 %, jař −50 %, seno −55 % – nejvíc trpí pole bez stromů',
    );
    expect(summerLabel('good')).toBe('Dobré léto – ozim +15 %, jař +15 %, seno +10 %');
    expect(winterLabel('blackFrost')).toBe('Holomráz – mráz bez sněhu, ozim −35 %');
  });
});

describe('ochrana a ztráty dílu', () => {
  const state: WeatherState = {
    disasters: {
      ...forced.disasters,
      protection: { year: 503, parts: { '1': { green: 0.8, nearWater: true, lowland: true } } },
      losses: { year: 503, hail: { '1': 0.6 } },
    },
  };

  it('zeleň po stupních 0–4 a vlhkost; díl bez údaje typická ves; ves bez počasí nic', () => {
    expect(partProtectionView(state, 1)).toEqual({ level: 3, water: true, lowland: true });
    expect(partProtectionView(state, 2)).toEqual({ level: 1 });
    expect(partProtectionView({}, 1)).toBeUndefined();
    expect(protectionLabel({ level: 3, water: true })).toBe(
      'Stromy chrání před suchem, holomrazem a kroupami; voda blízko – sucho méně',
    );
    expect(protectionLabel({ level: 0 })).toMatch(/^Bez stromů/);
  });

  it('kruté sucho podle ochrany a kroupy, které už padly', () => {
    // díl bez údaje: zeleň 0,25 → jař 1 − 0,5 × (1 − 0,125) = 0,5625
    expect(partLossesView(state, MAY_2, 2, 'spring')).toEqual({ weather: 44 });
    const losses = partLossesView(state, MAY_2, 1, 'spring');
    expect(losses?.hail).toBe(60);
    expect(losses?.weather).toBeLessThan(44);
    // 30. 4. sucho ještě vidět není
    expect(partLossesView(state, APRIL_30, 2, 'spring')).toBeUndefined();
    const rows = partLossRows({ weather: 44, hail: 60 }, { year: 503, summer: 'drought' });
    expect(rows.map((r) => [r.icon, r.text, r.alert])).toEqual([
      ['drought', '−44 %', true],
      ['hail', '−60 %', true],
    ]);
  });
});

describe('sousedé po zlém roce', () => {
  it('rok obchodu od 1. 11. – v březnu platí loňské kruté sucho', () => {
    const state: WeatherState = {
      disasters: { override: { weather: { 502: { summer: 'drought' } } } },
    };
    expect(tradeDearth(state, dayIndexOf({ year: 503, month: 3, day: 1 }))).toBe('cruel');
    expect(tradeDearth(state, dayIndexOf({ year: 503, month: 11, day: 2 }))).toBeUndefined();
    expect(tradeDearth({}, MAY_2)).toBeUndefined();
    expect(dearthLabel('bad')).toBe(
      'Kraj po zlém roce – obilí zdražilo: zboží za obilí −33 %, obilí sousedů −50 %',
    );
  });
});

describe('upozornění na počasí a pohromy', () => {
  it('sucho, mokré žně a holomráz z počasí, které je vidět', () => {
    expect(weatherNotices({ year: 503, summer: 'dry', winter: 'blackFrost' })).toEqual([
      { kind: 'drought', tone: 'warn', text: 'Sucho – nejvíc trpí pole bez stromů' },
      { kind: 'black-frost', tone: 'warn', text: 'Holomráz – ozim vymrzá' },
    ]);
    expect(weatherNotices({ year: 503, summer: 'wetHarvest' })[0]?.text).toBe('Mokré žně');
    expect(weatherNotices({ year: 503, summer: 'good' })).toEqual([]);
  });

  it('požár v jeho den „Hoří!“, den po něm „Vyhořel dům“; kroupy, voda, smršť', () => {
    const chronicle = [
      { day: 100, kind: 'fire' as const, dwellings: 1 },
      { day: 100, kind: 'hail' as const, parts: 3 },
      { day: 100, kind: 'flood' as const, level: 'hundred' as const },
      { day: 100, kind: 'tornado' as const, strength: 'F3' as const },
    ];
    expect(disasterNotices(chronicle, 99, 100).map((n) => n.text)).toEqual([
      'Silná smršť',
      'Povodeň – stoletá voda',
      'Kroupy potloukly obilí',
      'Hoří!',
    ]);
    expect(disasterNotices(chronicle, 100, 101)).toEqual([
      { kind: 'fire-out', tone: 'warn', text: 'Vyhořel dům' },
    ]);
    // požár celý mezi pohledy (skok v čase) – jen fakt
    expect(
      disasterNotices([{ day: 100, kind: 'fire', dwellings: 3 }], 90, 120).map((n) => n.text),
    ).toEqual(['Vyhořely 3 domy']);
    expect(disasterNotices(chronicle, 100, 100)).toEqual([]);
  });
});
