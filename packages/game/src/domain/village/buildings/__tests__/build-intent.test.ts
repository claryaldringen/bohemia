import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
  type Landscape,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import {
  applyBuildIntent,
  BAD_PLOT,
  NO_OAKS,
  NO_PLOT,
  NO_WOOD,
  UNKNOWN_CRAFT,
  REPLACEMENT_BLOCKED,
  NO_ROAD,
  NO_UPGRADE,
  SHRINE_EXISTS,
  UNKNOWN_DIRECTION,
  type BuildIntent,
} from '../build-intent';
import { availableSettlers } from '../../people/households';
import { TRAIL_BLOCKED } from '../../trade/trail';
import type { Direction8, Position, Road, RoadGrade, VillageState } from '../../types';
import { WAGON_LOOP } from '../../roads/wagon-road';
import { checkDwellingPlacement } from '../../placement/placement-dwellings';
import { checkSacredBuildingPlacement } from '../../placement/placement-sacred';
import { placementVillageOf } from '../../placement/placement-village';
import { LANDSCAPE as PATHS } from '../../__tests__/paths-fixtures';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

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

  it('bez lidí k osídlení zemnici postaví – po dostavění zůstane prázdná', () => {
    const state = settled();
    expect(availableSettlers(state, state.lastDay)).toBe(0);
    const result = apply(state, { kind: 'dwelling', type: 'zemnice', position: at(-80, -50) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const building = result.state.constructions.find((c) => c.kind === 'dwelling');
    expect(building).toMatchObject({ dwellingType: 'zemnice' });
    expect(building?.relocates).toBeUndefined();
    expect(building?.dwellingId).toBeNull();
    // nikdo k nastěhování: nová domácnost nevzniká, počet lidí se nemění
    expect(result.state.people).toEqual(state.people);
  });

  it('polozemnici bez pozemku odmítne', () => {
    const intent: BuildIntent = { kind: 'dwelling', type: 'zemnice', position: at(-80, -50) };
    expect(apply(withCouple(settled()), { ...intent, type: 'polozemnice' })).toEqual({
      ok: false,
      reason: NO_PLOT,
    });
  });
});

describe('applyBuildIntent – náhrada domu správcem', () => {
  it('nový dům domácnosti jde postavit i bez lidí k osídlení', () => {
    const state = settled();
    const dwellingId = state.dwellings[0]!.id;
    const result = apply(state, {
      kind: 'replacement',
      dwellingId,
      type: 'zemnice',
      position: at(60, 60),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.constructions).toContainEqual(
      expect.objectContaining({ kind: 'dwelling', relocates: dwellingId, replaces: true }),
    );
  });

  it('prázdné obydlí odmítne', () => {
    expect(
      apply(settled(), {
        kind: 'replacement',
        dwellingId: 999,
        type: 'zemnice',
        position: at(60, 60),
      }),
    ).toEqual({ ok: false, reason: REPLACEMENT_BLOCKED });
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

  it('bez mladého páru ji postaví taky – lidi k osídlení nechce (demolition.md)', () => {
    const result = apply(settled(), { kind: 'workshop', craft: 'potter', position: at(-80, -50) });
    expect(result.ok).toBe(true);
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

describe('applyBuildIntent – pole', () => {
  it('založí pole ze čtverců', () => {
    const result = apply(settled(), { kind: 'field', cells: block(11, 6, 3, 4) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fieldId = result.state.fields.at(-1)!.id;
    expect(result.state.parts.filter((p) => p.fieldId === fieldId)).toHaveLength(12);
  });

  it('pole ve vodě odmítne', () => {
    const result = apply(settled(), { kind: 'field', cells: block(14, 2, 2, 1) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/vod/);
  });
});

describe('applyBuildIntent – sad', () => {
  it('založí sad ze čtverců', () => {
    const result = apply(settled(), { kind: 'orchard', cells: block(10, 6, 2, 2) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.orchards?.at(-1)?.squares).toHaveLength(4);
  });

  it('sad ve vodě odmítne', () => {
    const result = apply(settled(), { kind: 'orchard', cells: block(14, 2, 2, 1) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/vod/);
  });
});

describe('applyBuildIntent – hřbitov', () => {
  it('založí hřbitov ze čtverců', () => {
    const result = apply(settled(), { kind: 'cemetery', cells: block(9, 9, 2, 1) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.constructions.at(-1)).toMatchObject({ kind: 'cemetery' });
  });

  it('hřbitov ve vodě odmítne', () => {
    expect(apply(settled(), { kind: 'cemetery', cells: block(14, 2, 2, 1) })).toEqual({
      ok: false,
      reason: 'Hřbitov nesmí zasahovat do vody.',
    });
  });
});

describe('applyBuildIntent – ohrada', () => {
  it('zahájí stavbu ohrady, dřevo vezme z hromady', () => {
    const result = apply(settled(), { kind: 'pen', species: 'pig', cells: block(10, 10, 1, 1) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pens?.at(-1)).toMatchObject({ species: 'pig' });
    expect(result.state.woodLogs).toBeLessThan(40);
  });

  it('ohradu ve vodě odmítne', () => {
    const result = apply(settled(), { kind: 'pen', species: 'pig', cells: block(15, 2, 1, 1) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/vod/);
  });
});

describe('applyBuildIntent – zemská stezka', () => {
  // krajina testu pěšin: louka se středem v počátku, na sever přes vodu stezka nevede
  const village = (): VillageState =>
    withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: DAY, dwellingPosition: at(0, 0, Math.PI) }),
    );

  it('stezka na jih se začne stavět', () => {
    const result = apply(village(), { kind: 'trail', direction: 'S' }, PATHS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.trails).toHaveLength(1);
  });

  it('na sever a neznámým směrem odmítne', () => {
    expect(apply(village(), { kind: 'trail', direction: 'N' }, PATHS)).toEqual({
      ok: false,
      reason: TRAIL_BLOCKED,
    });
    const up = 'up' as unknown as Direction8;
    expect(apply(village(), { kind: 'trail', direction: up }, PATHS)).toEqual({
      ok: false,
      reason: UNKNOWN_DIRECTION,
    });
  });
});

/** Ves v krajině pěšin s ručně položenými cestami: úsek 1 na jih, úsek 2 okruh (paths.md). */
function withRoads(grade: RoadGrade): VillageState {
  const state = withBuiltFirstDwelling(
    foundVillage({ seed: 77, day: DAY, dwellingPosition: at(0, 0, Math.PI) }),
  );
  state.woodLogs = 40;
  const road = (id: number, points: { x: number; z: number }[]): Road => ({
    id,
    points,
    bornDay: DAY - 800,
    grade,
    traffic: [],
    spots: [],
  });
  state.roads = {
    nextId: 3,
    roads: [
      road(1, [
        { x: 0, z: -10 },
        { x: 40, z: -60 },
        { x: 0, z: -120 },
      ]),
      road(2, [
        { x: 60, z: 0 },
        { x: 90, z: 0 },
        { x: 90, z: 30 },
        { x: 60, z: 0 },
      ]),
    ],
    trees: [],
    labor: { from: DAY - 100, days: 0, shares: [] },
    // ručně položené cesty – jednorázová přestavba sítě by je zahodila (paths.md)
    rebuilt: 2,
  };
  return state;
}

describe('applyBuildIntent – vozová cesta', () => {
  it('zahájí stavbu vozové cesty po upravené cestě', () => {
    const result = apply(withRoads('improved'), { kind: 'wagon-road', roadId: 1 }, PATHS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.roads!.earthworks).toHaveLength(1);
  });

  it('okruh odmítne', () => {
    expect(apply(withRoads('improved'), { kind: 'wagon-road', roadId: 2 }, PATHS)).toEqual({
      ok: false,
      reason: WAGON_LOOP,
    });
  });
});

describe('applyBuildIntent – vylepšení cesty', () => {
  it('zahájí úpravu vyšlapané cesty', () => {
    const intent: BuildIntent = { kind: 'road-upgrade', roadId: 1, upgrade: 'improved' };
    const result = apply(withRoads('trodden'), intent, PATHS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.constructions.at(-1)).toMatchObject({ kind: 'road' });
  });

  it('upravenou cestu bez mokřiny odmítne', () => {
    const intent: BuildIntent = { kind: 'road-upgrade', roadId: 1, upgrade: 'improved' };
    expect(apply(withRoads('improved'), intent, PATHS)).toEqual({
      ok: false,
      reason: NO_UPGRADE,
    });
  });
});

describe('applyBuildIntent – jabloně u cesty', () => {
  it('zahájí výsadbu jabloní podél upravené cesty', () => {
    const result = apply(withRoads('improved'), { kind: 'road-apples', roadId: 1 }, PATHS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.constructions.at(-1)).toMatchObject({ kind: 'road-apples', roadIds: [1] });
  });

  it('neexistující úsek odmítne', () => {
    expect(apply(withRoads('improved'), { kind: 'road-apples', roadId: 99 }, PATHS)).toEqual({
      ok: false,
      reason: NO_ROAD,
    });
  });
});

// Větve, které drží pořadí a rozlišení důvodů (recenze S1 – chybějící testy).
describe('applyBuildIntent – důvody odmítnutí', () => {
  it('neznámé řemeslo z klienta odmítne dřív než cokoli jiného', () => {
    const intent = { kind: 'workshop', craft: 'wizard', position: at(-80, -50) };
    expect(apply(withCouple(settled()), intent as unknown as BuildIntent)).toEqual({
      ok: false,
      reason: UNKNOWN_CRAFT,
    });
  });

  it('pozemek s neplatným natočením (dvorec natočený) odmítne jako BAD_PLOT', () => {
    const plot = {
      cell: { x: 10, y: 10 },
      variant: 'center',
      square: { x: 0, z: 0, rotation: 0 },
      yard: { x: 11, y: 10 },
    };
    const intent = { kind: 'dwelling', type: 'polozemnice', position: at(-80, -50), plot };
    expect(apply(withCouple(settled()), intent as unknown as BuildIntent)).toEqual({
      ok: false,
      reason: BAD_PLOT,
    });
  });

  it('náhrada domu bez dřeva odmítne důvodem NO_WOOD', () => {
    const state = settled();
    state.woodLogs = 0;
    const result = apply(state, {
      kind: 'replacement',
      dwellingId: state.dwellings[0]!.id,
      type: 'zemnice',
      position: at(60, 60),
    });
    expect(result).toEqual({ ok: false, reason: NO_WOOD });
  });

  it('ohradu bez dřeva odmítne důvodem NO_WOOD', () => {
    const state = settled();
    state.woodLogs = 0;
    expect(apply(state, { kind: 'pen', species: 'pig', cells: block(10, 10, 1, 1) })).toEqual({
      ok: false,
      reason: NO_WOOD,
    });
  });

  it('svatyni bez dospělých dubů odmítne důvodem NO_OAKS', () => {
    expect(
      apply(settled(), { kind: 'sacred', building: 'shrine', position: at(-80, -50) }),
    ).toEqual({ ok: false, reason: NO_OAKS });
  });
});
