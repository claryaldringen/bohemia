import { describe, expect, it } from 'vitest';
import { abandonmentCheck, structureCondition, visitKey } from '../abandonment';
import { decayEmptyDwelling } from '../dwellings';
import { availableSettlers, occupyEmptyDwellings } from '../households';
import { penOccupancy } from '../pens';
import { repairOf } from '../repair';
import { sacredHappiness } from '../sacred';
import { decayEmptyDwellings } from '../simulate-build';
import {
  ALREADY_DISUSED,
  MANOR_STAYS,
  NOT_DISUSED,
  STRUCTURE_BUSY,
  STRUCTURE_MISSING,
  STRUCTURE_UNFINISHED,
  abandonStructure,
  isDisused,
  restoreStructure,
  disuseBlock,
} from '../structure-use';
import type { Construction, VillageState } from '../types';
import { Y1, idol, json, pen, village } from './abandonment-fixtures';
import { horse } from './horse-fixtures';

// Opuštění a vrácení stavby (demolition.md – Opuštění).

function ok(r: ReturnType<typeof abandonStructure>): VillageState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Ves s volným obydlím 5 (bez lidí), ohradou koní se dvěma koňmi a modlou. */
function fixture(): VillageState {
  const s = village();
  s.dwellings.push({
    id: 5,
    type: 'zemnice',
    builtDay: Y1 - 365,
    condition: 1,
    position: { x: 30, z: 30, rotation: 0 },
  });
  return s;
}

describe('Opustit', () => {
  it('ohrada: disusedDay, chátrání od dne pokynu, bez stáda; koně jsou bez ohrady; kronika', () => {
    const s = fixture();
    s.pens = [
      pen(1, {
        species: 'horse',
        horses: [horse(50, 8, 'male', 0, Y1), horse(51, 6, 'female', 0, Y1)],
      }),
      pen(2, { species: 'sheep' }),
    ];
    expect(penOccupancy(s).get(2)).toBeGreaterThan(0);
    const before = json(s);
    const next = ok(abandonStructure(s, Y1, { structure: 'pen', id: 1 }));
    expect(json(s)).toEqual(before); // vstup se nemění
    const p = next.pens![0]!;
    expect(p.disusedDay).toBe(Y1);
    expect(p.wear).toEqual({
      condition: structureCondition(undefined, 'pen', Y1),
      abandonedDay: Y1,
    });
    expect(p.horses).toBeUndefined();
    expect(next.looseHorses!.map((h) => h.id)).toEqual([50, 51]);
    expect(next.chronicle).toContainEqual({
      day: Y1,
      kind: 'structure-abandoned',
      structure: 'pen',
      id: 1,
    });
    // opuštěná ohrada stádo nedrží – ovce přejdou do druhé ohrady
    const two = ok(abandonStructure(s, Y1, { structure: 'pen', id: 2 }));
    expect(penOccupancy(two).has(2)).toBe(false);
  });

  it('modla opuštěná nedává štěstí', () => {
    const s = fixture();
    s.sacredBuildings = [idol(7, 20, -30, Y1 - 5 * 365)];
    expect(sacredHappiness(s, Y1, null)).toBe(8);
    const next = ok(abandonStructure(s, Y1, { structure: 'idol', id: 7 }));
    expect(sacredHappiness(next, Y1, null)).toBe(0);
    expect(next.sacredBuildings![0]!.wear?.abandonedDay).toBe(Y1);
  });

  it('roční kontrola s návštěvou opuštěnou modlu neopraví, chátrá dál', () => {
    const s = fixture();
    s.sacredBuildings = [idol(7, 20, -30, Y1 - 5 * 365)];
    const next = ok(abandonStructure(s, Y1, { structure: 'idol', id: 7 }));
    const later = Y1 + 365;
    abandonmentCheck(next, later, new Map([[visitKey('idol', 7), 3]]));
    expect(next.sacredBuildings![0]!.wear).toEqual({ condition: 1, abandonedDay: Y1 });
    expect(repairOf(next, { structure: 'idol', id: 7 })).toBeUndefined();
  });

  it('opuštěné obydlí: neosídlí se, nepočítá se mezi prázdná, chátrá a zanikne', () => {
    const s = fixture();
    const next = ok(abandonStructure(s, Y1, { structure: 'dwelling', id: 5 }));
    expect(availableSettlers(next, Y1)).toBe(availableSettlers(s, Y1) + 1);
    occupyEmptyDwellings(next, Y1);
    expect(next.people.some((p) => p.dwellingId === 5)).toBe(false);
    // chátrá a na nule zanikne se zříceninou (dnešní pravidlo prázdného obydlí)
    const occupied = new Set(next.people.map((p) => p.dwellingId));
    const d = next.dwellings.find((x) => x.id === 5)!;
    decayEmptyDwelling(d, Y1);
    expect(d.condition).toBeLessThan(1);
    d.condition = 0.0001;
    decayEmptyDwellings(next, Y1 + 1, occupied);
    expect(next.dwellings.some((x) => x.id === 5)).toBe(false);
    expect(next.ruins?.some((r) => r.id === 5)).toBe(true);
  });

  it('opuštění zruší rozestavěnou přestavbu obydlí', () => {
    const s = fixture();
    const rebuild: Construction = {
      id: 90,
      kind: 'rebuild',
      startedDay: Y1,
      cost: 50,
      done: 0,
      dwellingType: 'zemnice',
      position: null,
      dwellingId: 5,
      fieldId: null,
    };
    s.constructions = [rebuild];
    const next = ok(abandonStructure(s, Y1, { structure: 'dwelling', id: 5 }));
    expect(next.constructions).toEqual([]);
  });

  it('důvody odmítnutí', () => {
    const s = fixture();
    s.dwellings[1]!.type = 'dvorec';
    s.pens = [pen(1), pen(2, { builtDay: null }), pen(3)];
    s.constructions = [
      {
        id: 91,
        kind: 'pen',
        startedDay: Y1,
        cost: 10,
        done: 0,
        dwellingType: null,
        position: null,
        dwellingId: null,
        fieldId: null,
        penId: 3,
        extends: true,
      },
    ];
    const reason = (structure: 'dwelling' | 'pen', id: number): string | null =>
      disuseBlock(s, { structure, id });
    // obydlí s lidmi jde opustit, když se obyvatelé vejdou jinam (displaced.test.ts)
    expect(reason('dwelling', 1)).toBeNull();
    expect(reason('dwelling', 2)).toBe(MANOR_STAYS);
    expect(reason('dwelling', 99)).toBe(STRUCTURE_MISSING);
    expect(reason('pen', 2)).toBe(STRUCTURE_UNFINISHED);
    expect(reason('pen', 3)).toBe(STRUCTURE_BUSY);
    expect(reason('pen', 1)).toBeNull();
    const once = ok(abandonStructure(s, Y1, { structure: 'pen', id: 1 }));
    const again = abandonStructure(once, Y1, { structure: 'pen', id: 1 });
    expect(again).toEqual({ ok: false, reason: ALREADY_DISUSED });
    expect(restoreStructure(s, Y1, { structure: 'pen', id: 1 })).toEqual({
      ok: false,
      reason: NOT_DISUSED,
    });
  });
});

describe('Vrátit', () => {
  it('modla se stavem 0,8: bez disusedDay, chátrání zastaveno, stavba repair z 0,8', () => {
    const s = fixture();
    s.sacredBuildings = [idol(7, 20, -30, Y1 - 5 * 365)];
    const gone = ok(abandonStructure(s, Y1, { structure: 'idol', id: 7 }));
    // 20 let pádu × 0,2 = 4 roky chátrání
    const day = Y1 + Math.round(0.2 * 20 * 365.25);
    const back = ok(restoreStructure(gone, day, { structure: 'idol', id: 7 }));
    const b = back.sacredBuildings![0]!;
    expect(isDisused(b)).toBe(false);
    expect(b.wear?.abandonedDay).toBeUndefined();
    expect(b.wear?.condition).toBeCloseTo(0.8, 2);
    expect(repairOf(back, { structure: 'idol', id: 7 })?.repair?.from).toBeCloseTo(0.8, 2);
    expect(back.chronicle).toContainEqual({
      day,
      kind: 'structure-restored',
      structure: 'idol',
      id: 7,
    });
  });

  it('obydlí se vrátí, znovu se osídlí a stav nezvedá', () => {
    const s = fixture();
    s.dwellings.find((d) => d.id === 5)!.condition = 0.6;
    const gone = ok(abandonStructure(s, Y1, { structure: 'dwelling', id: 5 }));
    const back = ok(restoreStructure(gone, Y1 + 10, { structure: 'dwelling', id: 5 }));
    const d = back.dwellings.find((x) => x.id === 5)!;
    expect(isDisused(d)).toBe(false);
    expect(d.condition).toBe(0.6);
  });
});
