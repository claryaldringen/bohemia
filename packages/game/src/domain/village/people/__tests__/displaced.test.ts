import { describe, expect, it } from 'vitest';
import {
  displacedCount,
  freePlaces,
  lodgingShortfall,
  noRoomReason,
  rehouseDisplaced,
  vacateDwelling,
} from '../displaced';
import { availableSettlers, occupyEmptyDwellings } from '../households';
import { occupants } from '../people';
import { abandonStructure, disuseBlock } from '../../buildings/structure-use';
import type { Dwelling, DwellingType, Person, VillageState } from '../../types';
import { Y1, YEAR, village } from '../../__tests__/abandonment-fixtures';

// Dočasné ubytování vystěhovaných obyvatel (demolition.md – Obydlí s obyvateli).

function ok(r: ReturnType<typeof abandonStructure>): VillageState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const dwelling = (id: number, type: DwellingType, x: number, z: number): Dwelling => ({
  id,
  type,
  builtDay: Y1 - 30 * 365,
  condition: 1,
  position: { x, z, rotation: 0 },
});

const adult = (id: number, dwellingId: number, extra: Partial<Person> = {}): Person => ({
  id,
  bornDay: Y1 - Math.ceil(25 * YEAR),
  dwellingId,
  ...extra,
});

/** Ves s dvorcem 4 (hostí nikoho) a obydlími 1–3 s daným typem a počtem lidí. */
function setup(spec: [DwellingType, number][]): VillageState {
  const s = village(Y1);
  const pos: [number, number][] = [
    [0, 0],
    [18, -4],
    [-18, -4],
  ];
  s.dwellings = [
    ...spec.map(([t], i) => dwelling(i + 1, t, pos[i]![0], pos[i]![1])),
    dwelling(4, 'zemnice', 0, -22),
  ];
  s.manorId = 4;
  s.people = [adult(40, 4), adult(41, 4)];
  let id = 100;
  spec.forEach(([, n], i) => {
    for (let k = 0; k < n; k++) s.people.push(adult(id++, i + 1));
  });
  s.nextId = 1000;
  return s;
}

describe('Vystěhování obydlí', () => {
  it('vejdou se → projde, nevejdou se → hláška s počtem chybějících míst', () => {
    // A zemnice 5 lidí, B polozemnice 6, C zemnice 3: volno 2 + 3 = 5
    const s = setup([
      ['zemnice', 5],
      ['polozemnice', 6],
      ['zemnice', 3],
    ]);
    expect(disuseBlock(s, { structure: 'dwelling', id: 1 })).toBeNull();
    const next = ok(abandonStructure(s, Y1, { structure: 'dwelling', id: 1 }));
    expect(occupants(next, 1)).toHaveLength(0);
    expect(next.dwellings.find((d) => d.id === 1)!.disusedDay).toBe(Y1);
    expect(displacedCount(next)).toBe(1);
    // C o 4 lidech: volno jen 4
    const full = setup([
      ['zemnice', 5],
      ['polozemnice', 6],
      ['zemnice', 4],
    ]);
    expect(lodgingShortfall(full, 1, Y1)).toBe(1);
    expect(disuseBlock(full, { structure: 'dwelling', id: 1 })).toBe(noRoomReason(1));
    expect(abandonStructure(full, Y1, { structure: 'dwelling', id: 1 })).toEqual({
      ok: false,
      reason: noRoomReason(1),
    });
    expect(full.people.filter((p) => p.dwellingId === 1)).toHaveLength(5);
  });

  it('noRoomReason skloňuje místa', () => {
    expect(noRoomReason(1)).toContain('1 místo');
    expect(noRoomReason(3)).toContain('3 místa');
    expect(noRoomReason(7)).toContain('7 míst');
  });

  it('dvorec nikoho nehostí', () => {
    const s = setup([
      ['zemnice', 2],
      ['zemnice', 6],
      ['zemnice', 6],
    ]);
    expect(freePlaces(s, 1)).toBe(0);
    expect(lodgingShortfall(s, 1, Y1)).toBe(2);
  });

  it('rodina zůstane pohromadě, kam se vejde, zbytek jde jinam', () => {
    const s = setup([
      ['zemnice', 0],
      ['zemnice', 1],
      ['zemnice', 3],
    ]);
    const m = (id: number, extra: Partial<Person>): Person => adult(id, 1, extra);
    const kid = (id: number, father: number, mother: number): Person => ({
      ...m(id, { fatherId: father, motherId: mother }),
      bornDay: Y1 - 800,
    });
    // bratři: starší 12 drží dům, mladší 16 je odchozí rodina
    s.people.push(
      { ...m(12, { sex: 'male' as const, spouseId: 13 }), bornDay: Y1 - Math.ceil(30 * YEAR) },
      m(13, { sex: 'female' as const, spouseId: 12 }),
      kid(14, 12, 13),
      m(16, { sex: 'male' as const, spouseId: 17 }),
      m(17, { sex: 'female' as const, spouseId: 16 }),
      kid(18, 16, 17),
    );
    const next = ok(abandonStructure(s, Y1, { structure: 'dwelling', id: 1 }));
    const hostOf = (id: number): number => next.people.find((p) => p.id === id)!.dwellingId;
    expect(new Set([16, 17, 18].map(hostOf)).size).toBe(1);
    expect(new Set([12, 13, 14].map(hostOf)).size).toBe(1);
    expect(hostOf(16)).not.toBe(hostOf(12));
    expect(next.displaced).toHaveLength(1);
    expect(next.displaced![0]!.household).toBe(1);
  });

  it('nevejde-li se skupina celá, rozdělí se po lidech', () => {
    const s = setup([
      ['zemnice', 4],
      ['zemnice', 4],
      ['zemnice', 4],
    ]);
    const next = ok(abandonStructure(s, Y1, { structure: 'dwelling', id: 1 }));
    expect(occupants(next, 2)).toHaveLength(6);
    expect(occupants(next, 3)).toHaveLength(6);
    expect(next.displaced![0]!.people).toHaveLength(4);
  });

  it('s prázdným obydlím v provozu se celá domácnost přestěhuje, záznam nevznikne', () => {
    const s = setup([
      ['zemnice', 5],
      ['zemnice', 6],
      ['zemnice', 0],
    ]);
    const next = ok(abandonStructure(s, Y1, { structure: 'dwelling', id: 1 }));
    expect(occupants(next, 3)).toHaveLength(5);
    expect(next.displaced).toBeUndefined();
    expect(next.chronicle.some((e) => e.kind === 'household-relocated')).toBe(true);
  });

  it('nové obydlí osídlí napřed vystěhovaná domácnost a záznam zmizí', () => {
    const s = setup([
      ['zemnice', 3],
      ['zemnice', 2],
      ['zemnice', 2],
    ]);
    const next = ok(abandonStructure(s, Y1, { structure: 'dwelling', id: 1 }));
    expect(displacedCount(next)).toBe(1);
    next.dwellings.push(dwelling(6, 'zemnice', 40, 40));
    occupyEmptyDwellings(next, Y1);
    expect(occupants(next, 6).map((p) => p.id)).toEqual([100, 101, 102]);
    expect(next.displaced).toBeUndefined();
  });

  it('kdo se mezitím oženil jinam nebo zemřel, se zpět nestěhuje', () => {
    const s = setup([
      ['zemnice', 3],
      ['zemnice', 2],
      ['zemnice', 2],
    ]);
    const next = ok(abandonStructure(s, Y1, { structure: 'dwelling', id: 1 }));
    next.people.find((p) => p.id === 100)!.dwellingId = 99; // oženil se do vlastního domu
    next.people = next.people.filter((p) => p.id !== 101); // zemřel
    expect(displacedCount(next)).toBe(1);
    next.dwellings.push(dwelling(6, 'zemnice', 40, 40));
    expect(rehouseDisplaced(next, Y1, 6)).toBe(true);
    expect(occupants(next, 6).map((p) => p.id)).toEqual([102]);
    expect(next.people.find((p) => p.id === 100)!.dwellingId).toBe(99);
  });

  it('vystěhovaná domácnost se počítá do lidí k osídlení', () => {
    const s = setup([
      ['zemnice', 3],
      ['zemnice', 2],
      ['zemnice', 2],
    ]);
    const next = ok(abandonStructure(s, Y1, { structure: 'dwelling', id: 1 }));
    // stejná ves bez záznamu: hosté se počítají jako členové domů, domácnost nikde nečeká
    const without = { ...next };
    delete without.displaced;
    expect(availableSettlers(next, Y1)).toBeGreaterThanOrEqual(1);
    expect(availableSettlers(next, Y1)).toBeGreaterThan(availableSettlers(without, Y1) - 1);
  });

  it('opuštění hostitele s cizími ubytovanými: vejdou se všichni, cizí si drží záznam', () => {
    const s = setup([
      ['zemnice', 3],
      ['zemnice', 2],
      ['zemnice', 0],
    ]);
    s.dwellings.push(dwelling(5, 'zemnice', 30, 30));
    s.people.push(adult(200, 5), adult(201, 5));
    // 1 → rozejde se do 2 a 3? 3 je prázdné → celá domácnost 1 jde do 3
    let next = ok(abandonStructure(s, Y1, { structure: 'dwelling', id: 1 }));
    expect(next.displaced).toBeUndefined();
    // dům 5 vystěhujeme do 2 (volno 4); pak z 2 odejde hostitel s cizími
    next = ok(abandonStructure(next, Y1, { structure: 'dwelling', id: 5 }));
    expect(occupants(next, 2).map((p) => p.id)).toEqual(expect.arrayContaining([200, 201]));
    const before = next.displaced!;
    expect(before.some((r) => r.household === 5)).toBe(true);
    next.dwellings.push(dwelling(7, 'zemnice', 50, 50), dwelling(8, 'zemnice', 52, 50));
    next.people.push(adult(300, 7), adult(301, 8));
    const moved = ok(abandonStructure(next, Y1, { structure: 'dwelling', id: 2 }));
    expect(occupants(moved, 2)).toHaveLength(0);
    const rec = moved.displaced!.find((r) => r.household === 5)!;
    expect(rec.people.every((m) => m.host !== 2)).toBe(true);
    for (const m of rec.people) {
      expect(moved.people.find((p) => p.id === m.id)!.dwellingId).toBe(m.host);
    }
    // vstupní stav se nemění
    expect(occupants(next, 2).length).toBeGreaterThan(0);
  });

  it('vacateDwelling bez místa vrací počet chybějících', () => {
    const s = setup([
      ['zemnice', 3],
      ['zemnice', 6],
      ['zemnice', 6],
    ]);
    expect(vacateDwelling(s, Y1, 1)).toBe(3);
  });
});
