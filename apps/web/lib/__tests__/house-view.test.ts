import { describe, expect, it } from 'vitest';
import type { HousePanelData, PublicHouse } from '@bohemia/game';
import { parseRevokeInviteInput } from '../house-input';
import { houseView } from '../house-view';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const house = (houseId: string, lordName: string | null, ages: number[]): PublicHouse => ({
  houseId,
  lordName,
  seat: { x: 1, y: 2 },
  distance: 3,
  men: ages.map((age, i) => ({
    name: i === 0 ? 'Boleslav' : null,
    age,
    villageName: 'Libice',
    villageId: 'v',
    personId: i,
  })),
  villages: 1,
});

describe('houseView', () => {
  it('převede data panelu na portréty, štíty a dny', () => {
    const data: HousePanelData = {
      hasHouse: true,
      negotiations: [],
      actions: {},
      stewardships: [],
      wars: [],
      protectedUntil: null,
      disputes: [],
      fellows: [],
      agreements: [],
      tree: [],
      status: {},
      own: {
        houseId: 'h0',
        men: [
          { name: 'Jan', age: 34, villageName: 'Ves', villageId: 'v-1', personId: 1 },
          { name: null, age: 62, villageName: 'Ves', villageId: 'v-2', personId: 2 },
        ],
        senior: { villageId: 'v-2', personId: 2 },
        lord: { villageId: 'v-1', personId: 1 },
        successionCredits: 3,
        hunger: null,
        shield: 2,
      },
      lords: [house('h1', 'Boleslav', [40, 17])],
      vassals: [],
      others: [house('h2', null, [])],
      invites: [
        { state: 'open', code: 'BH7KM2QX', validUntil: new Date(NOW + 4.2 * 86_400_000) },
        { state: 'used', code: 'AAAAAAAA', house: house('h3', 'Boleslav', [25]), played: true },
      ],
      freeInviteSlots: 2,
    };
    const view = houseView(data, NOW);
    // nejstarší první, stolec u seniora, praporec u hráčova muže, pečeť s počtem
    expect(view.own.map((m) => [m.icon, m.label])).toEqual([
      ['elder', '62 let – Ves'],
      ['man', 'Jan, 34 let – Ves'],
    ]);
    expect(view.own.map((m) => [m.villageId, m.senior, m.lord])).toEqual([
      ['v-2', true, false],
      ['v-1', false, true],
    ]);
    expect(view.successionCredits).toBe(3);
    expect(view.lords[0]).toMatchObject({ men: 2, label: 'Boleslav – 2 muži', icon: 'man' });
    expect(view.others[0]).toMatchObject({ men: 0, label: 'Rod bez jména – 0 mužů' });
    expect(view.invites[0]).toMatchObject({
      display: 'BH7K-M2QX',
      daysLeft: 5,
      label: 'Platí ještě 5 dní',
    });
    expect(view.invites[1]).toMatchObject({ played: true, invitee: { houseId: 'h3' } });
    expect(view.freeInviteSlots).toBe(2);
    expect(view.waiting).toBe(0);
  });

  it('platnost končící za chvíli ukáže jako 1 den', () => {
    const view = houseView(
      {
        hasHouse: true,
        negotiations: [],
        actions: {},
        stewardships: [],
        wars: [],
        protectedUntil: null,
        disputes: [],
        fellows: [],
        agreements: [],
        tree: [],
        status: {},
        own: null,
        lords: [],
        vassals: [],
        others: [],
        invites: [{ state: 'open', code: 'BH7KM2QX', validUntil: new Date(NOW + 1000) }],
        freeInviteSlots: 2,
      },
      NOW,
    );
    expect(view.invites[0]?.label).toBe('Platí ještě 1 den');
  });
});

describe('parseRevokeInviteInput', () => {
  it('chce text kódu', () => {
    expect(parseRevokeInviteInput({ code: 'BH7K-M2QX' })).toEqual({ code: 'BH7K-M2QX' });
    expect(parseRevokeInviteInput({ code: 5 })).toBeNull();
    expect(parseRevokeInviteInput(null)).toBeNull();
    expect(parseRevokeInviteInput({ code: 'x'.repeat(40) })).toBeNull();
  });
});
