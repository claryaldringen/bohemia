import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstaclesOf } from '../../landscape';
import { foundVillage } from '../actions';
import { applyBuildIntent } from '../build-intent';
import { settlersOf, travellingVillage } from '../departure';
import { advanceVillage } from '../simulate';
import { finishConstructions } from '../simulate-build';
import {
  isStewardBuilt,
  isStewardOn,
  markStewardBuilt,
  setStewardOn,
  withSteward,
} from '../steward-state';
import type { Construction, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Stav správce vsi (steward.md – Stav správce): převod, přepínač, značka „postavil správce“.

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const landscape = makeLandscape();
const HOME = { x: -50, z: -50, rotation: 0 };

function settled(): VillageState {
  const state = withBuiltFirstDwelling(
    foundVillage({ seed: 4242, day: DAY, dwellingPosition: HOME }),
  );
  state.woodLogs = 40;
  return state;
}

describe('withSteward – převod', () => {
  it('ves bez stavu má správce vypnutého, jednou a idempotentně', () => {
    const old = settled();
    delete old.steward;
    expect(isStewardOn(old)).toBe(false);
    const once = withSteward(old);
    expect(once.steward).toEqual({ on: false, sinceDay: old.lastDay, built: [] });
    expect(old.steward).toBeUndefined();
    expect(withSteward(once)).toBe(once);
  });

  it('dopočet starší vsi syna (bez stavu) správce nezapne', () => {
    const old = settled();
    delete old.steward;
    const later = advanceVillage(old, old.lastDay + 3, obstaclesOf(landscape), landscape);
    expect(later.steward?.on).toBe(false);
    const again = advanceVillage(later, later.lastDay + 2, obstaclesOf(landscape), landscape);
    expect(again.steward).toEqual(later.steward);
  });
});

describe('ves syna a první ves', () => {
  it('první ves hráče má správce vypnutého', () => {
    expect(settled().steward).toMatchObject({ on: false, built: [] });
  });

  it('ves z osadníků s vůdcem (i na cestě) má správce zapnutého od založení', () => {
    // osadníci s vůdcem odchodu (syn vojvody) – `departWithSon` ho nese v `Settlers.lordId`
    const settlers = { ...settlersOf(settled()), lordId: 1 };
    const founded = foundVillage({ seed: 3, day: DAY, dwellingPosition: HOME, settlers });
    expect(founded.steward).toEqual({ on: true, sinceDay: DAY, built: [] });
    const travelling = travellingVillage(settlers, 9, DAY, {
      direction: 'N',
      departedDay: DAY,
      arrivalDay: DAY + 2,
    });
    expect(travelling.steward).toEqual({ on: true, sinceDay: DAY, built: [] });
    expect(withSteward(travelling)).toBe(travelling);
    // osadníci bez vůdce
    const plain = foundVillage({
      seed: 3,
      day: DAY,
      dwellingPosition: HOME,
      settlers: { ...settlersOf(travelling), lordId: undefined },
    });
    expect(plain.steward?.on).toBe(false);
  });
});

describe('setStewardOn', () => {
  it('přepne ke dni, stejná hodnota den nemění', () => {
    const s = settled();
    setStewardOn(s, DAY + 5, true);
    expect(s.steward).toMatchObject({ on: true, sinceDay: DAY + 5 });
    setStewardOn(s, DAY + 9, true);
    expect(s.steward?.sinceDay).toBe(DAY + 5);
    setStewardOn(s, DAY + 9, false);
    expect(s.steward).toMatchObject({ on: false, sinceDay: DAY + 9 });
  });
});

describe('značka „postavil správce“ při dostavění', () => {
  it('obydlí', () => {
    const s = settled();
    const c: Construction = {
      id: 700,
      kind: 'dwelling',
      startedDay: DAY,
      cost: 1,
      done: 1,
      dwellingType: 'zemnice',
      position: { x: -80, z: -50, rotation: 0 },
      dwellingId: null,
      fieldId: null,
    };
    s.constructions.push(c);
    markStewardBuilt(s, 700);
    finishConstructions(s, DAY);
    const dwelling = s.dwellings.at(-1)!;
    expect(isStewardBuilt(s, dwelling.id)).toBe(true);
    // cizí stavba značku nedostane
    const other = settled();
    other.constructions.push({ ...c, id: 701 });
    finishConstructions(other, DAY);
    expect(other.steward?.built).toEqual([]);
  });

  it('pole a ohrada', () => {
    const s = settled();
    const field = applyBuildIntent(s, s.lastDay, landscape, obstaclesOf(landscape), {
      kind: 'field',
      cells: block(11, 6, 3, 4),
    });
    if (!field.ok) throw new Error(field.reason);
    const withField = field.state;
    const fc = withField.constructions.find((c) => c.kind === 'field')!;
    const fieldId = fc.fieldId!;
    for (const p of withField.parts) p.state = 'ready';
    markStewardBuilt(withField, fc.id);
    const pen = applyBuildIntent(withField, withField.lastDay, landscape, obstaclesOf(landscape), {
      kind: 'pen',
      species: 'pig',
      cells: block(10, 10, 1, 1),
    });
    if (!pen.ok) throw new Error(pen.reason);
    const state = pen.state;
    const pc = state.constructions.find((c) => c.kind === 'pen')!;
    markStewardBuilt(state, pc.id);
    pc.done = pc.cost;
    finishConstructions(state, state.lastDay);
    expect(isStewardBuilt(state, fieldId)).toBe(true);
    expect(isStewardBuilt(state, pc.penId!)).toBe(true);
  });
});
