import { describe, expect, it } from 'vitest';
import { cancelConstruction } from '../cancel-construction';
import {
  ALREADY_DEMOLISHING,
  DEMOLISHING,
  demolishStructure,
  demolitionCost,
  demolitionNeed,
  demolitionOf,
  finishDemolition,
  isDemolitionFinished,
} from '../demolition';
import { BUILD_COSTS } from '../costs';
import { PEN } from '../oxen';
import { advanceVillage } from '../simulate';
import { restoreStructure } from '../structure-use';
import { DEMOLITION } from '../rules';
import type { Dwelling, VillageState } from '../types';
import { Y1, idol, pen, village } from './abandonment-fixtures';

// Bourání jako stavba (demolition.md – Bourání).

function ok(r: ReturnType<typeof demolishStructure>): VillageState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const empty = (id: number, condition: number): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: Y1 - 20 * 365,
  condition,
  position: { x: 30, z: 30, rotation: 0 },
});

function fixture(): VillageState {
  const s = village(Y1);
  s.dwellings.push(empty(5, 0.6));
  s.pens = [pen(1)];
  s.sacredBuildings = [idol(7, 40, 40, Y1 - 365)];
  return s;
}

const REF5 = { structure: 'dwelling', id: 5 } as const;

describe('Zbourat – založení', () => {
  it('prázdná zemnice: opuštěná, stavba bourání za čtvrtinu práce, klády podle stavu', () => {
    const s = ok(demolishStructure(fixture(), Y1, REF5));
    const c = demolitionOf(s, REF5)!;
    expect(c.kind).toBe('demolition');
    expect(c.cost).toBeCloseTo(DEMOLITION.laborShare * BUILD_COSTS.zemnice.laborManDays, 9);
    expect(s.dwellings.find((d) => d.id === 5)!.disusedDay).toBe(Y1);
    expect(demolitionCost(s, REF5, Y1)).toEqual({ laborManDays: c.cost, logs: 2 });
  });

  it('po dokončení obydlí zmizí bez zříceniny, klády na hromadě u obydlí, kronika', () => {
    const s = ok(demolishStructure(fixture(), Y1, REF5));
    const c = demolitionOf(s, REF5)!;
    c.done = c.cost;
    expect(isDemolitionFinished(s, c)).toBe(true);
    const event = finishDemolition(s, Y1 + 1, c);
    expect(event).toEqual({
      day: Y1 + 1,
      kind: 'structure-demolished',
      structure: 'dwelling',
      id: 5,
      logs: 2,
    });
    expect(s.dwellings.some((d) => d.id === 5)).toBe(false);
    expect(s.ruins ?? []).toEqual([]);
    expect(s.logStacks!.reduce((n, x) => n + x.logs, 0)).toBe(2);
  });

  it('ohrada se stavem 1: 3 klády, rozestavěné rozšíření zmizí', () => {
    const s = fixture();
    const r = ok(demolishStructure(s, Y1, { structure: 'pen', id: 1 }));
    expect(demolitionCost(r, { structure: 'pen', id: 1 }, Y1)).toMatchObject({ logs: 3 });
    expect(demolitionOf(r, { structure: 'pen', id: 1 })!.cost).toBe(
      DEMOLITION.laborShare * PEN.laborManDays,
    );
    r.constructions.push({
      id: 900,
      kind: 'pen',
      startedDay: Y1,
      cost: 10,
      done: 0,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      penId: 1,
      extends: true,
    });
    const c = demolitionOf(r, { structure: 'pen', id: 1 })!;
    c.done = c.cost;
    const event = finishDemolition(r, Y1, c);
    expect(event).toMatchObject({ kind: 'structure-demolished', logs: 3 });
    expect(r.pens).toEqual([]);
    expect(r.constructions.some((x) => x.penId === 1)).toBe(false);
  });

  it('modla zmizí bez zříceniny', () => {
    const r = ok(demolishStructure(fixture(), Y1, { structure: 'idol', id: 7 }));
    const c = demolitionOf(r, { structure: 'idol', id: 7 })!;
    c.done = c.cost;
    finishDemolition(r, Y1, c);
    expect(r.sacredBuildings).toEqual([]);
    expect(r.sacredRuins ?? []).toEqual([]);
  });

  it('opuštěnou stavbu jde zbourat, bouranou znovu ne, Vrátit při bourání nejde', () => {
    const s = ok(demolishStructure(fixture(), Y1, REF5));
    const again = demolishStructure(s, Y1, REF5);
    expect(again).toEqual({ ok: false, reason: ALREADY_DEMOLISHING });
    const back = restoreStructure(s, Y1, REF5);
    expect(back).toEqual({ ok: false, reason: DEMOLISHING });
    // ruční Opustit a pak Zbourat projde
    const t = fixture();
    t.dwellings.find((d) => d.id === 5)!.disusedDay = Y1 - 5;
    expect(demolishStructure(t, Y1, REF5).ok).toBe(true);
  });
});

describe('Zbourat – průběh', () => {
  it('bourání bere společnou práci a dokončí se: obydlí zmizí, klády jsou na hromadě', () => {
    const s = ok(demolishStructure(fixture(), Y1, REF5));
    const after = advanceVillage(s, Y1 + 40, null);
    expect(after.constructions.filter((c) => c.kind === 'demolition')).toEqual([]);
    expect(after.dwellings.some((d) => d.id === 5)).toBe(false);
    const done = after.chronicle.filter((e) => e.kind === 'structure-demolished');
    expect(done).toHaveLength(1);
  });

  it('bourání bere společnou práci rovným dílem s ostatními stavbami', () => {
    const s = ok(demolishStructure(fixture(), Y1, REF5));
    s.constructions.push({
      id: 901,
      kind: 'idol',
      startedDay: Y1,
      cost: 1000,
      done: 0,
      dwellingType: null,
      position: { x: -40, z: 40, rotation: 0 },
      dwellingId: null,
      fieldId: null,
    });
    const after = advanceVillage(s, Y1 + 2, null);
    const idolWork = after.constructions.find((x) => x.id === 901)!;
    const gone = !after.constructions.some((x) => x.kind === 'demolition');
    const demo = after.constructions.find((x) => x.kind === 'demolition');
    expect(idolWork.done).toBeGreaterThan(0);
    expect(gone || demo!.done > 0).toBe(true);
  });

  it('zrušení: stavba zůstane opuštěná, kronika construction-cancelled', () => {
    const s = ok(demolishStructure(fixture(), Y1, REF5));
    const c = demolitionOf(s, REF5)!;
    const r = cancelConstruction(s, Y1, c.id);
    expect(demolitionOf(r, REF5)).toBeUndefined();
    expect(r.dwellings.find((d) => d.id === 5)!.disusedDay).toBe(Y1);
    expect(r.chronicle.at(-1)).toMatchObject({
      kind: 'construction-cancelled',
      constructionKind: 'demolition',
    });
  });

  it('stavba zanikne během bourání: bourání zmizí bez klád a bez kroniky', () => {
    const s = ok(demolishStructure(fixture(), Y1, REF5));
    const c = demolitionOf(s, REF5)!;
    s.dwellings = s.dwellings.filter((d) => d.id !== 5);
    expect(demolitionNeed(s, c)).toBe(0);
    expect(isDemolitionFinished(s, c)).toBe(true);
    expect(finishDemolition(s, Y1, c)).toBeNull();
    const after = advanceVillage(s, Y1 + 5, null);
    expect(after.constructions.filter((x) => x.kind === 'demolition')).toEqual([]);
    expect(after.chronicle.filter((e) => e.kind === 'structure-demolished')).toEqual([]);
    expect(after.logStacks ?? []).toEqual([]);
  });
});
