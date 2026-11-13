import { describe, expect, it } from 'vitest';
import type { Person, VillageState } from '@bohemia/game';
import { dynastyView } from '../dynasty-view';
import { foundVillage } from './departure-fixtures';

// Rod vojvody pro rozhraní jmen (lord.md – Jména): kdo čeká na jméno (vojvoda první, pak od
// nejstaršího), jména rodu pro kostku a ženatí synové v dvorci („Rodina čeká na dům“).

const DAY = 100 * 365;
const man = (id: number, years: number, extra: Partial<Person> = {}): Person => ({
  id,
  bornDay: DAY - years * 366,
  dwellingId: 1,
  sex: 'male',
  line: true,
  ...extra,
});

describe('dynastyView', () => {
  it('ves bez rodu null', () => {
    expect(
      dynastyView({ ...foundVillage(), people: [], dynasty: { lordId: null, lords: [] } }, DAY),
    ).toBeNull();
  });

  it('vojvoda bez jména první, synové od nejstaršího, jména a ženatí synové v dvorci', () => {
    const state: VillageState = {
      ...foundVillage(),
      people: [
        man(9, 2, { fatherId: 1 }),
        man(1, 40),
        man(5, 20, { fatherId: 1, name: 'Ctibor', spouseId: 6 }),
        man(7, 12, { fatherId: 1 }),
        man(8, 18, { fatherId: 1, name: 'Neklan', spouseId: 10, dwellingId: 2 }),
        { id: 6, bornDay: DAY - 19 * 365, dwellingId: 1, sex: 'female', spouseId: 5 },
      ],
      dynasty: { lordId: 1, lords: [{ id: 1, fromDay: 0 }] },
    };
    expect(dynastyView(state, DAY)).toMatchObject({
      lordId: 1,
      unnamed: [
        { id: 1, age: 40, lord: true },
        { id: 7, age: 12, lord: false },
        { id: 9, age: 2, lord: false },
      ],
      taken: ['Ctibor', 'Neklan'],
      waitingHome: ['Ctibor'],
    });
    state.people[1]!.name = 'Bořivoj';
    expect(dynastyView(state, DAY)).toMatchObject({ lordName: 'Bořivoj' });
  });
});

describe('dynastyView – výjezd vojvody (lord-control.md)', () => {
  it('journeyAway jen když je někdo pryč na výjezdu', () => {
    const state: VillageState = {
      ...foundVillage(),
      people: [man(1, 40, { name: 'Bořivoj' })],
      dynasty: { lordId: 1, lords: [{ id: 1, fromDay: 0 }] },
    };
    expect(dynastyView(state, DAY)?.journeyAway).toBeUndefined();
    state.people[0]!.away = { kind: 'journey', refId: 'j1' };
    expect(dynastyView(state, DAY)?.journeyAway).toBe(true);
  });
});

describe('dynastyView – synové pro odchod (lord.md – Dělení vsi)', () => {
  const state = (): VillageState => ({
    ...foundVillage(),
    people: [
      man(1, 50, { name: 'Přemysl' }),
      man(5, 28, { fatherId: 1, name: 'Ctibor', dwellingId: 2 }),
      man(7, 20, { fatherId: 1, name: 'Bořivoj', dwellingId: 3 }),
      man(8, 18, { fatherId: 1, dwellingId: 3 }),
      man(9, 12, { fatherId: 1 }),
    ],
    dynasty: { lordId: 1, lords: [{ id: 1, fromDay: 0 }] },
  });

  it('řada od 16 let: nástupce a syn bez jména nesmí s důvodem, mladší chybí', () => {
    const sons = dynastyView(state(), DAY)!.sons;
    expect(sons.map((s) => s.id)).toEqual([5, 7, 8]);
    expect(sons.find((s) => s.id === 5)).toMatchObject({ reason: 'Nástupce zůstává.', people: 0 });
    expect(sons.find((s) => s.id === 8)).toMatchObject({ reason: 'Syn potřebuje jméno.' });
    expect(sons.find((s) => s.id === 7)).toMatchObject({ name: 'Bořivoj', age: 20, reason: null });
  });

  it('syn, který smí vést, nese díl: obydlí a počet lidí z sonShare', () => {
    const son = dynastyView(state(), DAY)!.sons.find((s) => s.id === 7)!;
    expect(son.people).toBeGreaterThanOrEqual(1);
    expect(son.horse).toBe(false);
  });
});
