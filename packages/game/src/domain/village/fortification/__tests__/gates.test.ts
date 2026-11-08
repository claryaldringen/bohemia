import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { FORTIFICATIONS } from '../../rules-fortifications';
import type { RoadPoint, TileCell } from '../../types';
import {
  addGate,
  autoGates,
  fortificationArea,
  fortificationCost,
  fortificationFullCost,
  wallAvailable,
  wallYearReason,
  areaOutline,
  type FortGate,
  type FortOutline,
} from '..';

// Brány opevnění (fortifications.md – Brány) a cena podle délky (Cena a stavba, Hradby a obrana –
// Cena).

const GEO = { size: 128, cellSizeM: 15 };

/** 4 × 4 čtverce kolem středu krajiny – svět x, z od −30 do 30 m. */
function square4(kind: 'fence' | 'palisade' | 'rampart' = 'fence'): FortOutline {
  const cells: TileCell[] = [];
  for (let y = 62; y < 66; y++) for (let x = 62; x < 66; x++) cells.push({ x, y });
  const area = fortificationArea(cells, null, GEO);
  if ('error' in area) throw new Error(area.error);
  return areaOutline(area, kind);
}

const line = (...points: [number, number][]): RoadPoint[] => points.map(([x, z]) => ({ x, z }));

function gates(result: FortGate[] | { error: string }): FortGate[] {
  if ('error' in result) throw new Error(result.error);
  return result;
}

describe('brány opevnění', () => {
  it('cesta přes obvod → brána na průsečíku', () => {
    // cesta, která obvod nedosáhne, se nepočítá – brána je pak u kotvy
    const short = autoGates(square4(), [line([-7, 100], [-7, 40])], { x: 100, z: 5 });
    expect(short.map((g) => g.segment)).toEqual([5]);
    const crossing = autoGates(square4(), [line([-7, 100], [-7, 10])], { x: 0, z: 0 });
    expect(crossing).toHaveLength(1);
    // sever: 16 stejných úseků od tečny rohu (x = −30 + r) po směru hodin – x = −7 je v úseku 1
    const o = square4();
    const each = o.lengthM / 16;
    const r = FORTIFICATIONS.cornerM.fence.outer;
    expect(crossing[0]).toMatchObject({ segment: 1 });
    expect(crossing[0]!.offsetM).toBeCloseTo(-7 + 30 - r - each, 1);
    expect(crossing[0]!.x).toBeCloseTo(-7, 6);
    expect(crossing[0]!.z).toBeCloseTo(30, 6);
  });

  it('dvě cesty v jednom úseku → jedna brána; cesta skrz → dvě', () => {
    const two = autoGates(square4(), [line([-3, 100], [-3, 10]), line([-12, 100], [-12, 10])], {
      x: 0,
      z: 0,
    });
    expect(two).toHaveLength(1);
    expect(two[0]).toMatchObject({ segment: 1 });
    // průsečík x = −12 je u začátku úseku – brána posunutá, ať je celá v úseku
    expect(two[0]!.x).toBeCloseTo(-12, 0);
    const through = autoGates(square4(), [line([5, 100], [5, -100])], { x: 0, z: 0 });
    // sever x 0…15 = úsek 2, jih (od východu k západu, úseky 8–11) x 0…15 = úsek 9
    expect(through.map((g) => g.segment)).toEqual([2, 9]);
  });

  it('brána u konce úseku zůstane celá v úseku', () => {
    const o = square4();
    const g = autoGates(o, [line([29.5, 100], [29.5, 0])], { x: 0, z: 0 });
    const half = FORTIFICATIONS.gate.widthM / 2;
    expect(g).toHaveLength(1);
    // průsečík leží v rohu na konci úseku 3 – brána končí s úsekem
    expect(g[0]).toMatchObject({ segment: 3 });
    expect(g[0]!.offsetM).toBeCloseTo(o.lengthM / 16 - half, 9);
  });

  it('bez cesty jedna brána v úseku nejblíž kotvě (dvorec, jinak střed obydlí)', () => {
    const g = autoGates(square4(), [], { x: 100, z: 5 });
    // východ: úseky 4–7 od severu k jihu, úsek 5 nejblíž kotvě – brána uprostřed
    const o = square4();
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ segment: 5 });
    expect(g[0]!.offsetM).toBeCloseTo(o.lengthM / 32, 9);
    expect(g[0]!.x).toBeCloseTo(30, 6);
  });

  it('hráč přidá bránu kliknutím, nejvýš jedna na úsek', () => {
    const o = square4();
    const first = gates(addGate(o, [], { x: 30.5, z: -7 }));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ segment: 6 });
    expect(first[0]!.x).toBeCloseTo(30, 6);
    expect(first[0]!.z).toBeCloseTo(-7, 6);
    expect(addGate(o, first, { x: 29, z: -10 })).toEqual({ error: 'segment-taken' });
    expect(addGate(o, first, { x: 50, z: 0 })).toEqual({ error: 'off-outline' });
    const second = gates(addGate(o, first, { x: -7, z: 30 }));
    expect(second.map((g) => g.segment)).toEqual([1, 6]);
  });
});

describe('cena opevnění', () => {
  // ceny komplet 8. 11. 2026 (Hradby a obrana – Cena): dřív plot 20 čd a palisáda 80 čd bez
  // kácení; teď komplet 35 a 300 čd, cena bez kácení a lámání = komplet − 1 čd za kládu a m³
  it('100 m z hromady = komplet − 1 čd za kládu a m³ kamene (Martin 8. 11. 2026)', () => {
    expect(fortificationCost('fence', 100)).toEqual({ laborManDays: 20, logs: 15, stoneM3: 0 });
    expect(fortificationCost('palisade', 100)).toEqual({ laborManDays: 230, logs: 70, stoneM3: 0 });
    expect(fortificationCost('rampart', 100)).toEqual({ laborManDays: 150, logs: 0, stoneM3: 0 });
    expect(fortificationCost('walkway', 100)).toEqual({ laborManDays: 370, logs: 80, stoneM3: 0 });
    expect(fortificationCost('crib', 100)).toEqual({ laborManDays: 620, logs: 330, stoneM3: 100 });
    expect(fortificationCost('chamber', 100)).toEqual({
      laborManDays: 780,
      logs: 350,
      stoneM3: 320,
    });
    // komplet – z ní počítá zboření
    expect(fortificationFullCost('palisade', 100)).toEqual({
      laborManDays: 300,
      logs: 70,
      stoneM3: 0,
    });
  });

  it('vylepšení stojí cenu cílového, ochoz jen přístavbu; nižší stupeň nic nevrací', () => {
    expect(fortificationCost('palisade', 100, 'fence')).toEqual(fortificationCost('palisade', 100));
    expect(fortificationCost('chamber', 100, 'palisade')).toEqual(
      fortificationCost('chamber', 100),
    );
    expect(fortificationCost('crib', 100, 'walkway')).toEqual(fortificationCost('crib', 100));
    expect(fortificationCost('walkway', 100, 'palisade')).toEqual({
      laborManDays: 140,
      logs: 10,
      stoneM3: 0,
    });
    // plot rovnou na palisádu s ochozem – cena celé palisády s ochozem
    expect(fortificationCost('walkway', 100, 'fence')).toEqual(fortificationCost('walkway', 100));
    expect(() => fortificationCost('fence', 100, 'palisade')).toThrow();
    expect(() => fortificationCost('palisade', 100, 'palisade')).toThrow();
  });

  it('cena roste s délkou úměrně – 4 × 4 plot ≈ 48 čd + 36 klád', () => {
    const o = square4('fence');
    const cost = fortificationCost('fence', o.lengthM);
    expect(cost.laborManDays).toBeCloseTo(47.57, 2);
    expect(cost.logs).toBeCloseTo(35.67, 2);
  });

  it('roštová od roku 790, komorová od 830 (Martin 8. 11. 2026)', () => {
    const last789 = dayIndexOf({ year: 789, month: 12, day: 31 });
    expect(wallAvailable('crib', last789)).toBe(false);
    expect(wallYearReason('crib', last789)).toBe('Roštová hradba až od roku 790.');
    expect(wallAvailable('crib', last789 + 1)).toBe(true);
    expect(wallYearReason('crib', last789 + 1)).toBeNull();
    const last829 = dayIndexOf({ year: 829, month: 12, day: 31 });
    expect(wallYearReason('chamber', last829)).toBe('Komorová hradba až od roku 830.');
    expect(wallAvailable('chamber', last829 + 1)).toBe(true);
    expect(wallYearReason('palisade', 0)).toBeNull();
    expect(wallYearReason('rampart', 0)).toBeNull();
  });
});
