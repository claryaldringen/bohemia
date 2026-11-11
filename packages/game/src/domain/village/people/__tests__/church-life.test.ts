import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../../core/simulate';
import {
  churchCapacity,
  churchyardGraves,
  defaultChurchDims,
} from '../../buildings/church-geometry';
import { bury } from '../../buildings/cemetery';
import { CHURCH } from '../../rules';
import type { Church, Person, VillageState } from '../../types';
import { DAY, YEAR, dwelling, kin, trackedVillage } from '../../__tests__/kin-fixtures';
import {
  buryAtChurch,
  churchCoverage,
  churchHappiness,
  conversionBase,
  priestDay,
} from '../church-life';
import { arriveFromAbroad } from '../lodge';
import { createRandom } from '../../../landscape/random';
import { happinessFactors } from '../happiness';
import { conversionDay } from '../conversion';
import { isSingle } from '../marriage';

// Kostel ve vsi – kněz, pokrytí, štěstí, obrácení, hřbitůvek (churches.md – Co kostel dává).

const TYPE = 'chancel' as const;
const DIMS = defaultChurchDims(TYPE);
const CAPACITY = churchCapacity(TYPE, DIMS);

function church(extra: Partial<Church> = {}, id = 50, x = 0): Church {
  return {
    id,
    type: TYPE,
    dims: DIMS,
    position: { x, z: 0, rotation: 0 },
    finishedDay: DAY,
    ...extra,
  };
}

/** `n` křesťanů (id od 100) v obydlích 1–3 a vojvoda 10; kostely podle zadání. */
function villageWith(
  n: number,
  churches: Church[] | undefined,
  extra: Partial<VillageState> = {},
): VillageState {
  const state = trackedVillage([{ id: 10, age: 40, sex: 'male' }], undefined, {
    faith: { rodBaptizedDay: DAY - 100 },
    storesKg: 1e6,
    ...(churches === undefined ? {} : { churches }),
    ...extra,
  });
  for (let i = 0; i < n; i++) {
    state.people.push({
      ...kin({ id: 100 + i, age: 30, sex: 'male', home: 2 + (i % 2) }),
      faith: 'christian',
    });
  }
  return state;
}

function withPriest(state: VillageState, churchId = 50): VillageState {
  const next = arriveFromAbroad(state, 'priest', DAY, createRandom(1));
  const priest = next.people.find((p) => p.priest)!;
  next.churches = next.churches!.map((c) =>
    c.id === churchId ? { ...c, priestId: priest.id } : c,
  );
  return next;
}

describe('churchCoverage', () => {
  it('bez kostelů 0; kostel bez kněze se nepočítá', () => {
    expect(churchCoverage(villageWith(10, undefined))).toEqual({ coverage: 0, decorated: 0 });
    expect(churchCoverage(villageWith(10, [church()])).coverage).toBe(0);
  });

  it('kostel s knězem pro polovinu vsi dá křesťanům +20, vyzdobený +2,5 navíc', () => {
    // vojvoda + 2 × kapacita − 1 lidí + kněz → (kapacita / lidí) ≈ polovina; upravíme přesně
    const base = villageWith(2 * CAPACITY - 2, [church()]);
    const state = withPriest(base);
    expect(state.people).toHaveLength(2 * CAPACITY);
    expect(churchCoverage(state).coverage).toBeCloseTo(0.5, 10);
    expect(churchHappiness(state)).toBeCloseTo(CHURCH.happinessPerCoverage * 0.5, 10);
    expect(happinessFactors(state, DAY, 1).church).toBeCloseTo(20, 10);
    const decorated = { ...state, churches: [{ ...state.churches![0]!, decoratedDay: DAY }] };
    expect(churchHappiness(decorated)).toBeCloseTo(20 + CHURCH.decorHappinessPerCoverage * 0.5, 10);
  });

  it('dva kostely se sčítají a pokrytí se ořízne na 1', () => {
    const a = withPriest(villageWith(2 * CAPACITY - 3, [church(), church({}, 51)]));
    const b = withPriest(a, 51);
    expect(b.people).toHaveLength(2 * CAPACITY);
    expect(churchCoverage(b).coverage).toBeCloseTo(1, 10);
    const small = withPriest(withPriest(villageWith(5, [church(), church({}, 51)]), 50), 51);
    expect(churchCoverage(small).coverage).toBe(1);
    expect(churchHappiness(small)).toBe(CHURCH.happinessPerCoverage);
  });

  it('obrácení: bez pokrytí základ 0,005, s plným 0,03', () => {
    expect(conversionBase(villageWith(10, undefined))).toBe(0.005);
    const full = withPriest(villageWith(3, [church()]));
    expect(conversionBase(full)).toBeCloseTo(0.03, 10);
    // roční los běží přes conversionDay beze změny rozhraní
    expect(conversionDay(villageWith(3, undefined), DAY + 1)).toEqual([]);
  });
});

describe('priestDay', () => {
  it('kněz přijde hned v den dostavění a zapíše se do kostela', () => {
    const state = villageWith(5, [church({ finishedDay: DAY })]);
    priestDay(state, DAY);
    const priest = state.people.find((p) => p.priest)!;
    expect(priest).toBeDefined();
    expect(state.churches![0]!.priestId).toBe(priest.id);
    expect(state.churches![0]!.priestArrivalDay).toBeUndefined();
    expect(state.lodge).toBeUndefined();
  });

  it('po smrti kněze přijde nový za 60 dní, a to i bez huti', () => {
    const state = withPriest(villageWith(5, [church()]));
    const priest = state.people.find((p) => p.priest)!;
    state.people = state.people.filter((p) => p !== priest);
    priestDay(state, DAY + 10);
    expect(state.churches![0]!.priestId).toBeUndefined();
    expect(state.churches![0]!.priestArrivalDay).toBe(DAY + 10 + CHURCH.newPriestAfterDays);
    priestDay(state, DAY + 10 + CHURCH.newPriestAfterDays - 1);
    expect(state.people.some((p) => p.priest)).toBe(false);
    priestDay(state, DAY + 10 + CHURCH.newPriestAfterDays);
    expect(state.people.some((p) => p.priest)).toBe(true);
    expect(state.churches![0]!.priestId).toBeDefined();
  });

  it('kněz se nežení a nepracuje', () => {
    const state = withPriest(villageWith(5, [church()]));
    const priest: Person = state.people.find((p) => p.priest)!;
    expect(isSingle(state, priest, DAY)).toBe(false);
  });

  it('ves bez kostelů se nezmění', () => {
    const state = villageWith(5, undefined);
    const before = structuredClone(state);
    priestDay(state, DAY);
    expect(state).toEqual(before);
  });
});

describe('buryAtChurch', () => {
  const GRAVES = churchyardGraves(TYPE, DIMS);

  function dead(state: VillageState, id: number): Person {
    return state.people.find((p) => p.id === id)!;
  }

  it('křesťan se pohřbí u nejbližšího kostela s knězem', () => {
    const base = villageWith(3, [church({}, 50, 0), church({}, 51, 500)]);
    const state = withPriest(base, 51);
    // bližší kostel 50 je bez kněze, hroby jdou do vzdálenějšího 51
    expect(buryAtChurch(state, DAY, dead(state, 100))).toBe(true);
    expect(state.churches![1]!.graves).toEqual([{ personId: 100, day: DAY }]);
    expect(state.churches![0]!.graves).toBeUndefined();
  });

  it('bez kněze nebo bez kostela nic; bury() pak dělá, co dělal dřív', () => {
    const state = villageWith(3, [church()]);
    expect(buryAtChurch(state, DAY, dead(state, 100))).toBe(false);
    expect(bury(state, DAY, dead(state, 100))).toBeNull();
    expect(state.churches![0]!.graves).toBeUndefined();
  });

  it('plný hřbitůvek nepřijme, po 30 letech se hroby uvolní', () => {
    const graves = Array.from({ length: GRAVES }, (_, i) => ({
      personId: 900 + i,
      day: DAY - 10 * YEAR,
    }));
    const state = withPriest(villageWith(3, [church({ graves })]));
    expect(buryAtChurch(state, DAY, dead(state, 100))).toBe(false);
    const later = DAY + 21 * YEAR;
    expect(buryAtChurch(state, later, dead(state, 100))).toBe(true);
    expect(state.churches![0]!.graves).toEqual([{ personId: 100, day: later }]);
  });

  it('pohan se u kostela nepohřbívá', () => {
    const state = withPriest(villageWith(3, [church()]));
    const pagan = { ...dead(state, 100) };
    delete pagan.faith;
    bury(state, DAY, pagan);
    expect(state.churches![0]!.graves).toBeUndefined();
    bury(state, DAY, dead(state, 101));
    expect(state.churches![0]!.graves).toHaveLength(1);
  });
});

describe('simulace s kostelem', () => {
  const state = villageWith(8, [church({ finishedDay: DAY })]);
  const TO = DAY + 120;

  it('kněz přijde první den a vcelku = po kouscích', () => {
    const whole = advanceVillage(state, TO, null, null);
    expect(whole.churches![0]!.priestId).toBeDefined();
    let chunked = state;
    for (const end of [DAY + 1, DAY + 30, DAY + 31, TO])
      chunked = advanceVillage(chunked, end, null, null);
    expect(chunked).toEqual(whole);
  });

  it('ves bez kostela nemá kněze ani nové části stavu', () => {
    const plain = advanceVillage(villageWith(8, undefined), TO, null, null);
    expect(plain.churches).toBeUndefined();
    expect(plain.people.some((p) => p.priest)).toBe(false);
    void dwelling;
  });
});
