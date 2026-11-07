import { describe, expect, it } from 'vitest';
import type { HousePanelData, PanelNegotiation, PublicHouse } from '@bohemia/game';
import { houseView } from '../house-view';
import { houseNameOf, negotiationView, openingTerms, termRowLabel } from '../negotiation-view';
import { parseNegotiationAnswerInput, parseOpenNegotiationInput } from '../house-input';

// Pohled na jednání: řádky podmínek, popisky podle role a kdo je na tahu.

const other: PublicHouse = {
  houseId: 'h-b',
  lordName: 'Ctibor',
  seat: { x: 1, y: 0 },
  distance: 2,
  men: [{ name: 'Ctibor', age: 30, villageName: 'Ves', villageId: 'v', personId: 1 }],
  villages: 1,
  language: 'cs',
};
const negotiation = (over: Partial<PanelNegotiation> = {}): PanelNegotiation => ({
  id: 'n-1',
  other,
  myTurn: true,
  items: [{ kind: 'oath', lord: 'h-a', vassal: 'h-b' }],
  message: 'Pojď',
  rounds: 1,
  newcomer: false,
  ...over,
});

describe('negotiationView', () => {
  it('řádek přísahy se čte z pohledu hráče', () => {
    const lordSide = negotiationView(negotiation(), 'h-a', {} as never);
    expect(lordSide.rows[0]?.label).toBe('Ctibor se stane tvým vazalem');
    const vassalSide = negotiationView(
      negotiation({ items: [{ kind: 'oath', lord: 'h-b', vassal: 'h-a' }] }),
      'h-a',
      {} as never,
    );
    expect(vassalSide.rows[0]?.label).toBe('Staneš se vazalem rodu Ctibor');
  });

  it('popisek říká, kdo je na tahu', () => {
    expect(negotiationView(negotiation(), 'h-a', {} as never).label).toContain('tvou odpověď');
    expect(negotiationView(negotiation({ myTurn: false }), 'h-a', {} as never).label).toBe(
      'Ctibor – čeká na odpověď',
    );
  });

  it('nabídka a žádost mají přísahu opačně; rod bez jména má náhradní jméno', () => {
    expect(openingTerms('offer', 'a', 'b')).toEqual([{ kind: 'oath', lord: 'a', vassal: 'b' }]);
    expect(openingTerms('request', 'a', 'b')).toEqual([{ kind: 'oath', lord: 'b', vassal: 'a' }]);
    expect(houseNameOf({ lordName: null })).toBe('Rod bez jména');
    expect(termRowLabel({ kind: 'oath', lord: 'a', vassal: 'b' }, 'a', { lordName: null })).toBe(
      'Rod bez jména se stane tvým vazalem',
    );
  });

  it('panel řadí jednání na tahu první a počítá je do čekajících věcí', () => {
    const data: HousePanelData = {
      hasHouse: true,
      isolated: false,
      inviteReason: null,
      stewardships: [],
      wars: [],
      protectedUntil: null,
      disputes: [],
      fellows: [],
      agreements: [],
      tree: [],
      status: {},
      own: {
        houseId: 'h-a',
        men: [],
        senior: null,
        lord: null,
        successionCredits: 0,
        hunger: null,
        shield: 0,
      },
      lords: [],
      vassals: [],
      others: [other],
      invites: [],
      freeInviteSlots: 3,
      negotiations: [negotiation({ id: 'n-2', myTurn: false }), negotiation({ id: 'n-1' })],
      actions: { 'h-b': { offer: 'Jednáte už.', request: null, blockedByMe: false, war: null } },
    };
    const view = houseView(data, 0);
    expect(view.negotiations.map((n) => n.id)).toEqual(['n-1', 'n-2']);
    expect(view.waiting).toBe(1);
    expect(view.ownHouseId).toBe('h-a');
    expect(view.others[0]?.actions).toEqual({
      offer: 'Jednáte už.',
      request: null,
      blocked: false,
      war: null,
    });
  });
});

describe('vstup jednání', () => {
  it('zpracuje nabídku, odmítne cizí tvar a příliš dlouhý vzkaz', () => {
    const item = { kind: 'oath', lord: 'a', vassal: 'b' };
    expect(parseOpenNegotiationInput({ to: 'b', items: [item], message: ' ahoj ' })).toEqual({
      to: 'b',
      items: [item],
      message: 'ahoj',
    });
    // prázdné podmínky = změna existující dohody na holou přísahu (use-case ověří, že dohoda je)
    expect(parseOpenNegotiationInput({ to: 'b', items: [], message: null })).toEqual({
      to: 'b',
      items: [],
      message: null,
    });
    const goods = {
      grainKg: 100,
      hayKg: 0,
      cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
      horses: 0,
      logs: 0,
      people: { families: 0, men: 0, women: 0 },
      laborDays: 0,
    };
    const lines = [
      { kind: 'tribute', goods },
      { kind: 'service', men: 4, days: 30 },
      { kind: 'target-village', villageId: 'v1' },
      { kind: 'reward', goods },
    ];
    expect(parseOpenNegotiationInput({ to: 'b', items: lines })?.items).toEqual(lines);
    expect(
      parseOpenNegotiationInput({ to: 'b', items: [{ kind: 'tribute', goods: { grainKg: 1 } }] }),
    ).toBeNull();
    expect(parseOpenNegotiationInput({ to: 'b', items: [{ kind: 'x' }] })).toBeNull();
    expect(
      parseOpenNegotiationInput({ to: 'b', items: [item], message: 'x'.repeat(501) }),
    ).toBeNull();
  });

  it('odpověď: protinávrh nese podmínky, ostatní jen id', () => {
    expect(parseNegotiationAnswerInput({ negotiationId: 'n', answer: 'accept' })).toEqual({
      negotiationId: 'n',
      answer: 'accept',
    });
    expect(parseNegotiationAnswerInput({ negotiationId: 'n', answer: 'counter' })).toBeNull();
    expect(parseNegotiationAnswerInput({ negotiationId: 'n', answer: 'smaž' })).toBeNull();
  });
});
