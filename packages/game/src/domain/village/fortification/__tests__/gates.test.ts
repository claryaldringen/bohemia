import { describe, expect, it } from 'vitest';
import { FORTIFICATIONS } from '../../rules-fortifications';
import type { RoadPoint, TileCell } from '../../types';
import {
  addGate,
  autoGates,
  fortificationArea,
  fortificationCost,
  fortificationOutline,
  type FortGate,
  type FortOutline,
} from '..';

// Brány opevnění (fortifications.md – Brány) a cena podle délky (Cena a stavba).

const GEO = { size: 128, cellSizeM: 15 };

/** 4 × 4 čtverce kolem středu krajiny – svět x, z od −30 do 30 m. */
function square4(kind: 'fence' | 'palisade' | 'rampart' = 'fence'): FortOutline {
  const cells: TileCell[] = [];
  for (let y = 62; y < 66; y++) for (let x = 62; x < 66; x++) cells.push({ x, y });
  const area = fortificationArea(cells, null, GEO);
  if ('error' in area) throw new Error(area.error);
  return fortificationOutline(area, kind);
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
    // sever: úseky 0–3 od západu, x −15…0 je úsek 1 (bez rohů – rovná část od x = −15)
    expect(crossing[0]).toMatchObject({ segment: 1 });
    expect(crossing[0]!.offsetM).toBeCloseTo(8, 9);
    expect(crossing[0]!.x).toBeCloseTo(-7, 9);
    expect(crossing[0]!.z).toBeCloseTo(30, 9);
  });

  it('dvě cesty v jednom úseku → jedna brána; cesta skrz → dvě', () => {
    const two = autoGates(square4(), [line([-3, 100], [-3, 10]), line([-12, 100], [-12, 10])], {
      x: 0,
      z: 0,
    });
    expect(two).toHaveLength(1);
    expect(two[0]).toMatchObject({ segment: 1 });
    expect(two[0]!.x).toBeCloseTo(-12, 9);
    const through = autoGates(square4(), [line([5, 100], [5, -100])], { x: 0, z: 0 });
    // sever x 0…15 = úsek 2, jih (od východu k západu, úseky 8–11) x 0…15 = úsek 9
    expect(through.map((g) => g.segment)).toEqual([2, 9]);
  });

  it('brána u rohu zůstane celá na rovné části úseku', () => {
    const g = autoGates(square4(), [line([29.5, 100], [29.5, 0])], { x: 0, z: 0 });
    const r = FORTIFICATIONS.cornerM.fence.outer;
    const half = FORTIFICATIONS.gate.widthM / 2;
    expect(g).toHaveLength(1);
    // průsečík leží na oblouku rohu – brána na konci rovné části úseku 3 (x 15 … 30 − r)
    expect(g[0]).toMatchObject({ segment: 3 });
    expect(g[0]!.offsetM).toBeCloseTo(15 - r - half, 9);
    expect(g[0]!.x).toBeCloseTo(30 - r - half, 9);
  });

  it('bez cesty jedna brána v úseku nejblíž kotvě (dvorec, jinak střed obydlí)', () => {
    const g = autoGates(square4(), [], { x: 100, z: 5 });
    // východ: úseky 4–7 od severu k jihu, z 0…15 je úsek 5 – brána uprostřed
    expect(g).toEqual([{ segment: 5, offsetM: 7.5, x: 30, z: 7.5 }]);
  });

  it('hráč přidá bránu kliknutím, nejvýš jedna na úsek', () => {
    const o = square4();
    const first = gates(addGate(o, [], { x: 30.5, z: -7 }));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ segment: 6 });
    expect(first[0]!.x).toBeCloseTo(30, 9);
    expect(first[0]!.z).toBeCloseTo(-7, 9);
    expect(addGate(o, first, { x: 29, z: -10 })).toEqual({ error: 'segment-taken' });
    expect(addGate(o, first, { x: 50, z: 0 })).toEqual({ error: 'off-outline' });
    const second = gates(addGate(o, first, { x: -7, z: 30 }));
    expect(second.map((g) => g.segment)).toEqual([1, 6]);
  });
});

describe('cena opevnění', () => {
  it('100 m = čísla Martina (fortifications.md – Cena a stavba)', () => {
    expect(fortificationCost('fence', 100, 'new')).toEqual({
      laborManDays: 20,
      perHa: false,
      upfront: { wood: 15 },
    });
    expect(fortificationCost('palisade', 100, 'new')).toEqual({
      laborManDays: 80,
      perHa: false,
      upfront: { wood: 70 },
    });
    expect(fortificationCost('rampart', 100, 'new')).toEqual({
      laborManDays: 150,
      perHa: false,
      upfront: {},
    });
    // vylepšení plotu na palisádu jako nová palisáda, plot nebo palisáda na valu jako samotné
    expect(fortificationCost('palisade', 100, 'upgrade')).toEqual(
      fortificationCost('palisade', 100, 'new'),
    );
    expect(fortificationCost('fence', 100, 'top')).toEqual(fortificationCost('fence', 100, 'new'));
    expect(fortificationCost('palisade', 100, 'top')).toEqual(
      fortificationCost('palisade', 100, 'new'),
    );
  });

  it('cena roste s délkou úměrně – 4 × 4 plot ≈ 48 čd + 36 klád', () => {
    const o = square4('fence');
    const cost = fortificationCost('fence', o.lengthM, 'new');
    expect(cost.laborManDays).toBeCloseTo(47.57, 2);
    expect(cost.upfront.wood).toBeCloseTo(35.68, 2);
  });

  it('vylepšit jde jen na palisádu, nástavba jen plot nebo palisáda', () => {
    expect(() => fortificationCost('fence', 100, 'upgrade')).toThrow();
    expect(() => fortificationCost('rampart', 100, 'top')).toThrow();
  });
});
