import { describe, expect, it } from 'vitest';
import type { Person, VillageState } from '@bohemia/game';
import { dynastyView } from '../dynasty-view';

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
    expect(dynastyView({ people: [], dynasty: { lordId: null, lords: [] } }, DAY)).toBeNull();
  });

  it('vojvoda bez jména první, synové od nejstaršího, jména a ženatí synové v dvorci', () => {
    const state: Pick<VillageState, 'people' | 'dynasty'> = {
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
    expect(dynastyView(state, DAY)).toEqual({
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
