import { describe, expect, it } from 'vitest';
import { foundVillage, type VillageState } from '@bohemia/game';
import { maskVillageNames } from '../mask-village-names';
import { chronicle } from '../village-view';
import { horsesView } from '../horse-view';
import { productOrder } from '../village-view-crafts';
import { marketTripViews } from '../market-view';

// Cizí správce nevidí jména ostatních vsí držitele (plán 3, Úloha 11).

const DAY = 700;

function village(): VillageState {
  const s = foundVillage({ seed: 4, day: 0, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  s.lastDay = DAY;
  s.chronicle.push(
    {
      day: DAY,
      kind: 'market-departed',
      villageName: 'Dolní',
      villageId: 'own-2',
      give: {},
      wants: {},
      returnDay: DAY + 4,
      by: 'villagers',
    },
    {
      day: DAY,
      kind: 'market-departed',
      villageName: 'Lhota',
      villageId: 'v-2',
      give: {},
      wants: {},
      returnDay: DAY + 4,
      by: 'steward',
    },
    { day: DAY, kind: 'order-ready', villageName: 'Dolní', villageId: 'own-2', good: 'tools' },
  );
  s.orders = [
    { villageId: 'own-2', name: 'Dolní', good: 'tools', amount: 5, day: DAY, status: 'open' },
    { villageId: 'v-2', name: 'Lhota', good: 'pottery', amount: 5, day: DAY, status: 'ready' },
  ];
  s.shoeing = {
    lastDay: DAY,
    asked: { key: 'smith:own-2:1:ask', villageId: 'own-2', name: 'Dolní', untilDay: DAY + 5 },
  };
  return s;
}

describe('maskVillageNames – cizí správce', () => {
  const allowed = new Set(['v-2']);

  it('jména vsí mimo povolené jsou prázdná v kronice, zakázkách i dotazu na kováře', () => {
    const state = village();
    const masked = maskVillageNames(state, allowed);
    expect(chronicle(masked, 'Vlkov').map((e) => e.text)).toEqual([
      'Zakázka v sousední vsi je hotová.',
      'Správce poslal výpravu do Lhoty.',
      'Vesničané jeli na trh do sousední vsi.',
      ...chronicle(state, 'Vlkov')
        .map((e) => e.text)
        .slice(3),
    ]);
    expect(productOrder(masked, 'toolsKg')).toEqual({ name: '', ready: false });
    expect(productOrder(masked, 'potteryKg')).toEqual({ name: 'Lhota', ready: true });
    expect(masked.shoeing!.asked!.name).toBe('');
    // vstup se nezměnil
    expect(state.orders![0]!.name).toBe('Dolní');
  });

  it('povolená ves: beze změny a týž stav', () => {
    const state = village();
    expect(maskVillageNames(state, new Set(['own-2', 'v-2']))).toBe(state);
  });

  it('starší záznam jména bez id se maskuje; cíl výpravy na trh také', () => {
    const state = village();
    state.chronicle = [
      {
        day: DAY,
        kind: 'market-departed',
        villageName: 'Dolní',
        give: {},
        wants: {},
        returnDay: DAY + 4,
      },
    ];
    state.trade = {
      nextId: 2,
      expeditions: [
        {
          id: 1,
          kind: 'market',
          direction: 'E',
          trailId: -1,
          startedDay: DAY,
          give: {},
          get: {},
          porters: 1,
          days: 3,
          cost: 3,
          done: 0,
          market: {
            key: 'market:h:1',
            villageId: 'own-2',
            name: 'Dolní',
            wants: {},
            stayDays: 1,
            travelDays: 1,
            arriveDay: DAY + 1,
            returnDay: DAY + 3,
          },
        },
      ],
    };
    const masked = maskVillageNames(state, allowed);
    expect(chronicle(masked, 'Vlkov')[0]!.text).toContain('do sousední vsi');
    expect(marketTripViews(masked, DAY)[0]!.villageName).toBe('');
    expect(horsesView(masked, DAY)).toBeNull();
  });
});
