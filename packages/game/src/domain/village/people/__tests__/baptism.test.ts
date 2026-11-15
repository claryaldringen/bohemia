import { describe, expect, it } from 'vitest';
import { endNobleHouse } from '../../../vassalage/escheat';
import { foundVillage } from '../../core/actions';
import { baptizeVillage } from '../baptism';
import { departWithSon } from '../son-departure';
import { travellingVillage, settlersOf } from '../departure';
import { currentLord, isElite, isLineMan, wivesOf } from '../dynasty';
import { secondaryWifeFamilies } from '../dynasty-housing';
import { extraWivesDay } from '../dynasty-wives';
import { isChristian, rodBaptized } from '../faith';
import { applyInboxDay, type VillageEvent } from '../../core/inbox';
import { lordFamily } from '../lord';
import { isSingle } from '../marriage';
import { advanceVillage } from '../../core/simulate';
import type { Person, VillageState } from '../../types';
import {
  DAY,
  LINE_LORD_ID,
  YEAR,
  couple,
  dwelling,
  trackedVillage,
} from '../../__tests__/kin-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Křest rodu ve vsi (christianity.md – Křest rodu; plán 2026-11-10 – K4, Review Focus 1, 2, 5):
// vojvoda křesťan, jediná manželka, pokřtěné děti, příznak ve vsích rodu.

const LORD_ID = LINE_LORD_ID;
const byId = (s: VillageState, id: number): Person => s.people.find((p) => p.id === id)!;
const ids = (people: readonly Person[]): number[] => people.map((p) => p.id);

/**
 * Vojvoda s hlavní manželkou 11 a vedlejšími 12 (ve dvorci) a 13 (ve vlastním domě 2); syn 20
 * vedlejší manželky 12, dcera 21 vedlejší manželky 13, syn 22 hlavní manželky.
 */
function lordWithWives(): VillageState {
  return trackedVillage(
    [
      ...couple({ id: LORD_ID, age: 40 }, { id: 11, age: 35 }),
      { id: 12, age: 26, sex: 'female', spouse: LORD_ID },
      { id: 13, age: 24, sex: 'female', spouse: LORD_ID, home: 2 },
      { id: 20, age: 8, sex: 'male', mother: 12, father: LORD_ID },
      { id: 21, age: 5, sex: 'female', mother: 13, father: LORD_ID, home: 2 },
      { id: 22, age: 12, sex: 'male', mother: 11, father: LORD_ID },
    ],
    [dwelling(1), dwelling(2)],
  );
}

const LORD_ESTATE = { title: 'voivode', kin: 'head' } as const;

describe('baptizeVillage – ves vojvody (christianity.md – Křest rodu)', () => {
  it('vojvoda křesťan, jediná manželka, propuštěné zůstávají doma a mohou se vdát', () => {
    const s = lordWithWives();
    const chronicle = baptizeVillage(s, DAY + 1, { houseId: 'h1', lord: true });
    expect(chronicle).toEqual([
      { day: DAY + 1, kind: 'lord-baptized', estate: LORD_ESTATE },
      { day: DAY + 1, kind: 'wives-released', count: 2, estate: LORD_ESTATE },
    ]);
    const lord = byId(s, LORD_ID);
    expect(isChristian(lord)).toBe(true);
    expect(s.faith?.rodBaptizedDay).toBe(DAY + 1);
    expect(rodBaptized(s)).toBe(true);
    expect(ids(wivesOf(s, lord))).toEqual([11]);
    expect(byId(s, 12).spouseId).toBeUndefined();
    expect(byId(s, 13).spouseId).toBeUndefined();
    expect(byId(s, 12).dwellingId).toBe(1);
    expect(byId(s, 13).dwellingId).toBe(2);
    expect(isSingle(s, byId(s, 12), DAY + 1)).toBe(true);
    // manželky ani děti se nekřtí – obracejí se jako vesničané (K5)
    expect(isChristian(byId(s, 11))).toBe(false);
    expect(isChristian(byId(s, 20))).toBe(false);
  });

  it('propuštěné nejsou v rodině vojvody, syn vedlejší manželky zůstává mužem rodu', () => {
    const s = lordWithWives();
    const before = lordFamily(s, DAY + 1);
    expect(ids(before.household)).toContain(12);
    expect(ids(before.wivesApart)).toEqual([13]);
    baptizeVillage(s, DAY + 1, { houseId: 'h1', lord: true });
    const after = lordFamily(s, DAY + 1);
    expect(ids(after.household)).not.toContain(12);
    expect(ids(after.household)).toContain(11);
    expect(after.wivesApart).toEqual([]);
    expect(ids(after.trainees)).toEqual(expect.arrayContaining([LORD_ID, 20, 22]));
    for (const id of [12, 13]) expect(isElite(s, byId(s, id))).toBe(false);
    expect(isLineMan(byId(s, 20))).toBe(true);
    expect(byId(s, 21).fatherId).toBe(LORD_ID);
  });

  it('z přeplněného dvorce odchází propuštěná se svými dětmi jako vdova (návrh Clauda)', () => {
    const s = lordWithWives();
    // dvorec (zemnice pro 6) přeplní další dcery hlavní manželky
    for (const id of [23, 24]) {
      s.people.push({ ...byId(s, 22), id, sex: 'female', bornDay: DAY - 3 * 365 });
    }
    const manor = s.dwellings.find((d) => d.id === 1)!;
    const before = secondaryWifeFamilies(s, manor, DAY + 1);
    expect(before.map((f) => f.people[0]!.id)).toEqual([12]);
    baptizeVillage(s, DAY + 1, { houseId: 'h1', lord: true });
    const after = secondaryWifeFamilies(s, manor, DAY + 1);
    expect(after.map((f) => ids(f.people))).toEqual([[12, 20]]);
  });

  it('idempotence: událost dvakrát = jednou', () => {
    const once = lordWithWives();
    baptizeVillage(once, DAY + 1, { houseId: 'h1', lord: true });
    const twice = structuredClone(once);
    expect(baptizeVillage(twice, DAY + 2, { houseId: 'h1', lord: true })).toEqual([]);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('jiná ves rodu: jen den křtu – její vojvoda zůstává, jak je', () => {
    const s = lordWithWives();
    expect(baptizeVillage(s, DAY + 1, { houseId: 'h1' })).toEqual([]);
    expect(rodBaptized(s)).toBe(true);
    expect(isChristian(byId(s, LORD_ID))).toBe(false);
    expect(wivesOf(s, byId(s, LORD_ID))).toHaveLength(3);
  });

  it('zemřela-li hlavní manželka, zůstane nová hlavní a ostatní jsou propuštěné', () => {
    const s = lordWithWives();
    s.people = s.people.filter((p) => p.id !== 11);
    delete byId(s, LORD_ID).spouseId;
    const chronicle = baptizeVillage(s, DAY + 1, { houseId: 'h1', lord: true });
    const lord = byId(s, LORD_ID);
    expect(wivesOf(s, lord)).toHaveLength(1);
    expect(lord.spouseId).toBe(wivesOf(s, lord)[0]!.id);
    expect(chronicle).toContainEqual({
      day: DAY + 1,
      kind: 'wives-released',
      count: 1,
      estate: LORD_ESTATE,
    });
  });
});

describe('baptizeVillage – ves, kterou řídí NPC rod', () => {
  /** Ves řídí NPC rod `npc-1` – hlava vsi je vojvoda vsi (`settleNoble`). */
  function nobleVillage(): VillageState {
    const s = lordWithWives();
    s.nobles = { houseId: 'npc-1', headId: LORD_ID };
    for (const p of s.people) p.noble = { houseId: 'npc-1' };
    return s;
  }

  it('křest rodu hráče platí až po konci NPC rodu, jeho hlavu nekřtí', () => {
    const s = nobleVillage();
    expect(baptizeVillage(s, DAY + 1, { houseId: 'h1', lord: true })).toEqual([]);
    expect(s.faith?.rodBaptizedDay).toBe(DAY + 1);
    expect(rodBaptized(s)).toBe(false);
    expect(isChristian(byId(s, LORD_ID))).toBe(false);
    expect(rodBaptized(endNobleHouse(s, 'npc-1'))).toBe(true);
  });

  it('křest NPC rodu pokřtí hlavu vsi bez kroniky; po konci NPC rodu ves pohanská', () => {
    const s = nobleVillage();
    expect(baptizeVillage(s, DAY + 1, { houseId: 'npc-2', npc: true })).toEqual([]);
    expect(rodBaptized(s)).toBe(false);
    expect(baptizeVillage(s, DAY + 1, { houseId: 'npc-1', npc: true })).toEqual([]);
    expect(rodBaptized(s)).toBe(true);
    expect(isChristian(byId(s, LORD_ID))).toBe(true);
    expect(ids(wivesOf(s, byId(s, LORD_ID)))).toEqual([11]);
    // NPC rod vymřel, ves se vrací pohanskému rodu hráče
    expect(rodBaptized(endNobleHouse(s, 'npc-1'))).toBe(false);
  });
});

describe('extraWivesDay v pokřtěné vsi (Review Focus 2)', () => {
  /** Ves po smrti pokřtěného vojvody: vojvodou je syn 30 (pohan narozený před křtem) s ženou. */
  function successorVillage(baptized: boolean): VillageState {
    const s = trackedVillage(couple({ id: LORD_ID, age: 22 }, { id: 11, age: 20 }), [dwelling(1)], {
      ...(baptized ? { faith: { rodBaptizedDay: DAY - 400 } } : {}),
    });
    return s;
  }

  it('nové vedlejší manželky nepřibudou ani za pohanského nástupce', () => {
    const count = (s: VillageState): number => {
      let n = 0;
      for (let d = DAY + 1; d < DAY + 1 + Math.round(10 * YEAR); d++) {
        n += extraWivesDay(s, d).filter((e) => e.kind === 'extra-wife').length;
      }
      return n;
    };
    expect(count(successorVillage(false))).toBeGreaterThan(0);
    const baptized = successorVillage(true);
    expect(isChristian(currentLord(baptized)!)).toBe(false);
    expect(count(baptized)).toBe(0);
  });
});

describe('křest ve dni simulace (schránka, porody, vcelku = po kouscích)', () => {
  const FOUNDED = 200;
  const start = withBuiltFirstDwelling(
    foundVillage({
      seed: 21,
      day: FOUNDED,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      lord: { name: 'Bořivoj' },
    }),
  );
  // druhá manželka se syny ve vlastní zemnici, jak ji tam po stavbě druhého obydlí pošle přeplněný
  // dvorec (lord.md – Zakladatelé, Manželky – Bydlení): test měří děti po křtu a v přeplněném
  // dvorci (9 zakladatelů v zemnici o 6 místech) se rodí málo
  const secondWifeHome = start.nextId++;
  start.dwellings.push({
    id: secondWifeHome,
    type: 'zemnice',
    builtDay: FOUNDED,
    condition: 1,
    position: { x: 30, z: 0, rotation: 0 },
  });
  const secondWife = wivesOf(start, currentLord(start)!)[1]!;
  for (const p of start.people) {
    if (p.id === secondWife.id || p.motherId === secondWife.id) p.dwellingId = secondWifeHome;
  }
  const baptismDay = FOUNDED + Math.round(1.5 * YEAR);
  const end = FOUNDED + Math.round(4 * YEAR);
  const events: VillageEvent[] = [
    {
      id: 'b1',
      villageId: 'v1',
      day: baptismDay,
      seq: 1,
      body: { kind: 'rod-baptized', houseId: 'h1', lord: true },
    },
    // druhá zpráva téhož rodu (opakování) nic nezmění
    {
      id: 'b2',
      villageId: 'v1',
      day: baptismDay + 3,
      seq: 2,
      body: { kind: 'rod-baptized', houseId: 'h1', lord: true },
    },
  ];
  const whole = advanceVillage(start, end, null, null, events);

  it('vojvoda pokřtěný v den události, děti po křtu pokřtěné, další ženy nepřibudou', () => {
    const lord = currentLord(whole)!;
    expect(isChristian(lord)).toBe(true);
    expect(whole.faith?.rodBaptizedDay).toBe(baptismDay);
    const kinds = whole.chronicle.filter((e) => e.day >= baptismDay).map((e) => e.kind);
    expect(kinds.filter((k) => k === 'lord-baptized')).toHaveLength(1);
    expect(kinds).toContain('wives-released');
    expect(kinds).not.toContain('extra-wife');
    expect(wivesOf(whole, lord)).toHaveLength(1);
    const children = whole.people.filter((p) => p.fatherId === lord.id);
    const after = children.filter((c) => c.bornDay >= baptismDay);
    expect(after.length).toBeGreaterThan(0);
    for (const c of after) expect(isChristian(c)).toBe(true);
    for (const c of children.filter((c) => c.bornDay < baptismDay)) {
      expect(isChristian(c)).toBe(false);
    }
  });

  it.each([30, 365])('po kouscích po %i dnech přes JSON = vcelku', (size) => {
    let chunked = start;
    while (chunked.lastDay < end) {
      const to = Math.min(end, chunked.lastDay + size);
      chunked = JSON.parse(JSON.stringify(advanceVillage(chunked, to, null, null, events)));
    }
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
  });
});

describe('nová ves rodu po křtu (Review Focus 1)', () => {
  /** Synové dospělí: nástupce 22 zůstává, mladší 20 smí vést odchod. */
  function grownSons(s: VillageState): VillageState {
    byId(s, 22).bornDay = DAY - Math.ceil(19 * YEAR);
    byId(s, 20).bornDay = DAY - Math.ceil(17 * YEAR);
    byId(s, 20).name = 'Bořivoj';
    return s;
  }

  it('osadníci nesou den křtu – ves na cestě i založená ves ho mají', () => {
    const s = lordWithWives();
    s.faith = { rodBaptizedDay: DAY - 10, desecrated: { oaksOrGroves: 1, cemeteries: 0 } };
    const departed = departWithSon(grownSons(s), DAY + 1, 20);
    expect(departed.settlers.rodBaptizedDay).toBe(DAY - 10);
    const journey = travellingVillage(departed.settlers, 5, DAY + 1, {
      direction: 'N',
      departedDay: DAY + 1,
      arrivalDay: DAY + 5,
    });
    // zničená posvátná místa patří staré vsi
    expect(journey.faith).toEqual({ rodBaptizedDay: DAY - 10 });
    const founded = foundVillage({
      seed: 5,
      day: DAY + 5,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      settlers: settlersOf(journey),
    });
    expect(founded.faith).toEqual({ rodBaptizedDay: DAY - 10 });
  });

  it('křest zastihne ves na cestě (schránka ji jinak nepoužívá)', () => {
    const s = lordWithWives();
    const { settlers } = departWithSon(grownSons(s), DAY + 1, 20);
    const journey = travellingVillage(settlers, 5, DAY + 1, {
      direction: 'N',
      departedDay: DAY + 1,
      arrivalDay: DAY + 50,
    });
    const event: VillageEvent = {
      id: 'b1',
      villageId: 'v2',
      day: DAY + 3,
      seq: 1,
      body: { kind: 'rod-baptized', houseId: 'h1' },
    };
    const later = advanceVillage(journey, DAY + 10, null, null, [event]);
    expect(later.faith?.rodBaptizedDay).toBe(DAY + 3);
    expect(applyInboxDay(structuredClone(later), DAY + 11, [{ ...event, day: DAY + 11 }])).toEqual(
      [],
    );
  });
});
