import {
  MOUND_SIZES,
  gravePlaceCenter,
  type Cemetery,
  type GraveMound,
  type Person,
} from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import {
  FUNERAL_BEARERS,
  FUNERAL_VIEW_DAYS,
  MAX_FUNERAL_FIGURES,
  MAX_VOIVODE_FIGURES,
  funeralMourners,
  sceneFunerals,
} from '../funeral-view';

// Pohřeb ve scéně (cemetery.md – Pohřeb ve scéně; Martin 20. 10. 2026: „Když je pohřeb, chtěl bych
// vidět průvod lidí na hřbitov a pak na hřbitově hranici.“).

const DAY = 120_000;
/** Věk v celých letech po 365,25 dne (people.ts). */
const DAYS_PER_YEAR = 365.25;
const person = (id: number, years: number, dwellingId: number, sex: Person['sex']): Person => ({
  id,
  bornDay: DAY - Math.ceil(years * DAYS_PER_YEAR),
  dwellingId,
  sex,
});
/** Ves: domácnost 1 (5 lidí), 2 (3 lidé), 3 (2 lidé), 4 (1 člověk). */
const PEOPLE: Person[] = [
  person(1, 52, 1, 'male'),
  person(2, 48, 1, 'female'),
  person(3, 20, 1, 'male'),
  person(4, 10, 1, 'female'),
  person(5, 3, 1, 'male'),
  person(6, 30, 2, 'male'),
  person(7, 28, 2, 'female'),
  person(8, 5, 2, 'female'),
  person(9, 66, 3, 'female'),
  person(10, 40, 3, 'male'),
  person(11, 25, 4, 'male'),
];
const mound = (column: number, day: number, extra: Partial<GraveMound> = {}): GraveMound => ({
  cell: { x: 4, y: -2 },
  column,
  row: 0,
  size: 'normal',
  rank: 'adult',
  day,
  ...extra,
});
const cemetery = (mounds: GraveMound[]): Cemetery => ({
  id: 20,
  squares: [{ cell: { x: 4, y: -2 }, x: 67.5, z: -22.5, waterDistanceM: 100 }],
  squareSizeM: 15,
  graves: mounds.length,
  builtDay: 0,
  mounds,
});

describe('pohřby do scény (sceneFunerals)', () => {
  it('jen pohřby posledních dnů – starší mohyly už pohřeb nemají', () => {
    const mounds = [
      mound(0, DAY - FUNERAL_VIEW_DAYS, { from: 2 }),
      mound(1, DAY - FUNERAL_VIEW_DAYS + 1, { from: 2 }),
      mound(2, DAY - 1, { from: 3 }),
      mound(3, DAY, { from: 1 }),
    ];
    const funerals = sceneFunerals({ people: PEOPLE, cemeteries: [cemetery(mounds)] }, DAY);
    expect(funerals.map((f) => f.day)).toEqual([DAY - FUNERAL_VIEW_DAYS + 1, DAY - 1, DAY]);
    // mohyly do budoucna (jiný den pohledu) se nepočítají
    expect(sceneFunerals({ people: PEOPLE, cemeteries: [cemetery(mounds)] }, DAY - 2)).toHaveLength(
      2,
    );
  });

  it('místo hranice = střed mohyly z jádra; domácnost zemřelého a klíč mohyly', () => {
    const m = mound(3, DAY, { from: 2, size: 'large', rank: 'head', row: 2 });
    const [funeral] = sceneFunerals({ people: PEOPLE, cemeteries: [cemetery([m])] }, DAY);
    const { columns, rows } = MOUND_SIZES.large;
    const center = gravePlaceCenter({ x: 67.5, z: -22.5 }, 15, undefined, 3, 2, columns, rows);
    expect(funeral).toMatchObject({
      key: '20:4:-2:3:2',
      cemeteryId: 20,
      cell: { x: 4, y: -2 },
      column: 3,
      row: 2,
      size: 'large',
      rank: 'head',
      day: DAY,
      from: 2,
    });
    expect(funeral!.x).toBeCloseTo(center.x, 2);
    expect(funeral!.z).toBeCloseTo(center.z, 2);
  });

  it('mohyla uložená dřív (bez domácnosti) – průvod bez domácnosti zemřelého', () => {
    const [funeral] = sceneFunerals(
      { people: PEOPLE, cemeteries: [cemetery([mound(0, DAY)])] },
      DAY,
    );
    expect(funeral).not.toHaveProperty('from');
    // z každé domácnosti 1–2 lidé
    const perHome = new Map<number, number>();
    for (const m of funeral!.mourners) perHome.set(m.home, (perHome.get(m.home) ?? 0) + 1);
    expect([...perHome.keys()].sort()).toEqual([1, 2, 3, 4]);
    for (const n of perHome.values()) expect(n).toBeGreaterThanOrEqual(1);
    for (const n of perHome.values()) expect(n).toBeLessThanOrEqual(2);
  });
});

describe('kdo jde v průvodu (funeralMourners)', () => {
  it('celá domácnost zemřelého a z každé další domácnosti 1–2 lidé, napřed dospělí', () => {
    const mourners = funeralMourners(PEOPLE, { from: 1, rank: 'adult', day: DAY }, DAY, 7);
    const own = mourners.filter((m) => m.home === 1);
    expect(own).toHaveLength(5);
    for (const home of [2, 3, 4]) {
      const list = mourners.filter((m) => m.home === home);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.length).toBeLessThanOrEqual(2);
    }
    // z domácnosti 2 napřed dospělý, ne dítě
    expect(mourners.find((m) => m.home === 2)!.age).toBeGreaterThanOrEqual(14);
    // pohlaví a věk ze stavu vsi
    expect(own.map((m) => [m.sex, m.age])).toContainEqual(['female', 48]);
    // stejný pohřeb = stejný průvod
    expect(funeralMourners(PEOPLE, { from: 1, rank: 'adult', day: DAY }, DAY, 7)).toEqual(mourners);
  });

  it('nejvýš 24 postav i s nosiči; každá domácnost má v průvodu někoho', () => {
    // velká ves: 30 domácností po 3 lidech
    const many: Person[] = [];
    for (let home = 1; home <= 30; home++) {
      for (let k = 0; k < 3; k++)
        many.push(person(home * 10 + k, 20 + k * 10, home, k % 2 ? 'female' : 'male'));
    }
    const mourners = funeralMourners(many, { from: 5, rank: 'adult', day: DAY }, DAY, 3);
    expect(mourners).toHaveLength(MAX_FUNERAL_FIGURES - FUNERAL_BEARERS);
    expect(mourners.filter((m) => m.home === 5)).toHaveLength(3);
    // 17 dalších míst – 17 různých domácností (po kolech, ne dva z jedné)
    expect(new Set(mourners.map((m) => m.home)).size).toBe(18);
  });

  it('za vojvodu a jeho ženu jde celá ves (nejvýš 40 postav)', () => {
    const mourners = funeralMourners(PEOPLE, { from: 1, rank: 'voivode', day: DAY }, DAY, 7);
    expect(mourners).toHaveLength(PEOPLE.length);
    const many: Person[] = [];
    for (let id = 1; id <= 60; id++) many.push(person(id, 30, 1 + (id % 12), 'male'));
    expect(funeralMourners(many, { from: 1, rank: 'voivode', day: DAY }, DAY, 7)).toHaveLength(
      MAX_VOIVODE_FIGURES - FUNERAL_BEARERS,
    );
  });
});
