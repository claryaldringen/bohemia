import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { generateLandscape, obstaclesOf, tileCenterWorld, type Landscape } from '../../landscape';
import { foundVillage } from '../actions';
import {
  applyBuildIntent,
  NO_PLOT,
  NO_SETTLERS,
  RELOCATION_BLOCKED,
  SHRINE_EXISTS,
  type BuildIntent,
} from '../build-intent';
import type { Position, VillageState } from '../types';
import { checkDwellingPlacement } from '../placement-dwellings';
import { checkSacredBuildingPlacement } from '../placement-sacred';
import { placementVillageOf } from '../placement-village';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Doménový příkaz stavby (steward.md – Kde správce běží): stejné pravidlo pro hráče i správce –
// cena předem, kontrola místa a akce domény; vstupní stav se nemění.

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const landscape = makeLandscape({ surface: (x) => (x === 15 ? 'water' : 'meadow') });
const at = (x: number, z: number, rotation = 0): Position => ({ x, z, rotation });
const HOME = at(-50, -50);
const YEAR = 365.25;

/** Ves s dostavěnou zemnicí zakladatelů (4 lidé – nikdo k osídlení) a 40 kládami. */
function settled(): VillageState {
  const state = withBuiltFirstDwelling(
    foundVillage({ seed: 4242, day: DAY, dwellingPosition: HOME }),
  );
  state.woodLogs = 40;
  return state;
}

/** Ves s nepříbuzným manželským párem navíc – rodina, která se může oddělit (kinship.md). */
function withCouple(base: VillageState): VillageState {
  const state = structuredClone(base);
  const day = state.lastDay;
  state.people.forEach((p) => (p.bornDay = Math.min(p.bornDay, day - Math.ceil(16 * YEAR))));
  for (const [i, age] of [22, 20].entries()) {
    state.people.push({
      id: 900 + i,
      bornDay: day - Math.ceil(age * YEAR),
      dwellingId: 1,
      sex: i === 0 ? 'male' : 'female',
      spouseId: i === 0 ? 901 : 900,
    });
  }
  for (const p of state.people) if (p.id !== 901 && p.spouseId === undefined) p.sex = 'male';
  return state;
}

/** Příkaz nad kopií stavu – a kontrola, že vstupní stav zůstal, jak byl. */
function apply(
  state: VillageState,
  intent: BuildIntent,
  l: Landscape = landscape,
): ReturnType<typeof applyBuildIntent> {
  const before = structuredClone(state);
  const result = applyBuildIntent(state, state.lastDay, l, obstaclesOf(l), intent);
  expect(state).toEqual(before);
  return result;
}

describe('applyBuildIntent – obydlí', () => {
  it('zahájí stavbu zemnice, když je kým ji osadit', () => {
    const result = apply(withCouple(settled()), {
      kind: 'dwelling',
      type: 'zemnice',
      position: at(-80, -50),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.constructions).toContainEqual(
      expect.objectContaining({ kind: 'dwelling', dwellingType: 'zemnice' }),
    );
  });

  it('bez lidí k osídlení a polozemnici bez pozemku odmítne', () => {
    const intent: BuildIntent = { kind: 'dwelling', type: 'zemnice', position: at(-80, -50) };
    expect(apply(settled(), intent)).toEqual({ ok: false, reason: NO_SETTLERS });
    expect(apply(withCouple(settled()), { ...intent, type: 'polozemnice' })).toEqual({
      ok: false,
      reason: NO_PLOT,
    });
  });
});

describe('applyBuildIntent – přestěhování domácnosti', () => {
  it('nový dům domácnosti jde postavit i bez lidí k osídlení', () => {
    const state = settled();
    const dwellingId = state.dwellings[0]!.id;
    const result = apply(state, {
      kind: 'relocation',
      dwellingId,
      type: 'zemnice',
      position: at(60, 60),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.constructions).toContainEqual(
      expect.objectContaining({ kind: 'dwelling', relocates: dwellingId }),
    );
  });

  it('prázdné obydlí odmítne', () => {
    expect(
      apply(settled(), {
        kind: 'relocation',
        dwellingId: 999,
        type: 'zemnice',
        position: at(60, 60),
      }),
    ).toEqual({ ok: false, reason: RELOCATION_BLOCKED['no-household'] });
  });
});

describe('applyBuildIntent – dílna', () => {
  it('zahájí stavbu dílny, když se do ní má kdo nastěhovat', () => {
    const result = apply(withCouple(settled()), {
      kind: 'workshop',
      craft: 'potter',
      position: at(-80, -50),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.constructions).toContainEqual(
      expect.objectContaining({ kind: 'dwelling', craft: 'potter' }),
    );
  });

  it('bez mladého páru odmítne', () => {
    expect(apply(settled(), { kind: 'workshop', craft: 'potter', position: at(-80, -50) })).toEqual(
      { ok: false, reason: NO_SETTLERS },
    );
  });
});

describe('applyBuildIntent – posvátná místa', () => {
  it('svatyně vyhradí duby ke kácení a druhou svatyni odmítne', () => {
    // skutečná krajina – duby jsou jen v ní (happiness.md)
    const real = generateLandscape(3);
    const site = tileCenterWorld(real, real.villageSite.x, real.villageSite.y);
    const spotFor = (check: (p: Position) => boolean, from: number): Position => {
      for (let r = from; r < 600; r += 5) {
        for (let a = 0; a < 64; a++) {
          const p = at(site.x + r * Math.cos(a / 10), site.z + r * Math.sin(a / 10));
          if (check(p)) return p;
        }
      }
      throw new Error('Žádné vhodné místo.');
    };
    const home = spotFor((p) => checkDwellingPlacement(real, null, 'zemnice', p).ok, 20);
    const state = foundVillage({ seed: 4242, day: DAY, dwellingPosition: home });
    const village = placementVillageOf(state, DAY);
    const position = spotFor(
      (p) => checkSacredBuildingPlacement(real, village, 'shrine', p, obstaclesOf(real)).ok,
      60,
    );
    const shrine: BuildIntent = { kind: 'sacred', building: 'shrine', position };
    const result = apply(state, shrine, real);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.constructions.at(-1)!.kind).toBe('shrine');
    expect(apply(result.state, shrine, real)).toEqual({ ok: false, reason: SHRINE_EXISTS });
  });
});

describe('applyBuildIntent – humno', () => {
  it('zahájí stavbu humna bez dřeva z hromady', () => {
    const result = apply(settled(), { kind: 'threshing-floor', position: at(0, 7.5) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.constructions.at(-1)).toMatchObject({ kind: 'threshing-floor' });
    expect(result.state.woodLogs).toBe(40);
  });

  it('do vody odmítne', () => {
    expect(apply(settled(), { kind: 'threshing-floor', position: at(112, 0) })).toEqual({
      ok: false,
      reason: 'Humno nemůže stát ve vodě.',
    });
  });
});
