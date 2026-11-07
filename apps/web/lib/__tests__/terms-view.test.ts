import { describe, expect, it } from 'vitest';
import {
  breachLabel,
  bundleEntries,
  emptyBundle,
  formatAmount,
  hungerLabel,
  lineChips,
  serviceLabel,
  termChips,
  withBundleValue,
} from '../terms-view';
import { termRowLabel } from '../negotiation-view';

// Podmínky vazalství jako ikony s čísly (vassalage.md – Co hráč vidí).

describe('terms-view', () => {
  it('svazek ukáže jen nenulová políčka s ikonami a čísly', () => {
    let goods = withBundleValue(emptyBundle(), 'grainKg', 12500);
    goods = withBundleValue(goods, 'logs', 4);
    goods = withBundleValue(goods, 'cows', 2);
    goods = withBundleValue(goods, 'men', 1);
    const entries = bundleEntries(goods);
    expect(entries.map((e) => e.slot.key)).toEqual(['grainKg', 'cows', 'logs', 'men']);
    const chips = lineChips({ kind: 'tribute', goods });
    expect(chips[0]).toMatchObject({ icon: { name: 'grain' }, text: '12 500' });
    expect(chips[0]?.label).toBe('Dávka: obilí 12 500 kg');
    expect(chips[2]).toMatchObject({ icon: { name: 'log' }, text: '4' });
  });

  it('služba je meč s muži × dny, ves s klíčem nese jméno vsi', () => {
    expect(lineChips({ kind: 'service', men: 3, days: 30 })[0]).toMatchObject({
      icon: { set: 'house', name: 'sword' },
      text: '3 × 30',
      label: 'Vojenská služba: 3 muži na 30 dní',
    });
    expect(lineChips({ kind: 'target-village', villageId: 'v-1' }, 'Vlkov')[0]?.label).toBe(
      'Správa vsi Vlkov',
    );
    expect(serviceLabel(1, 1)).toBe('1 muž na 1 den');
  });

  it('podmínky dohody dají ikony v pevném pořadí; odměna je slabší', () => {
    const chips = termChips(
      {
        tribute: withBundleValue(emptyBundle(), 'grainKg', 500),
        service: { men: 2, days: 20 },
        targetVillageId: 'v-2',
        reward: withBundleValue(emptyBundle(), 'logs', 10),
      },
      (id) => (id === 'v-2' ? 'Dub' : null),
    );
    expect(chips.map((c) => c.key)).toEqual([
      'tribute-grainKg',
      'service',
      'target-village',
      'reward-logs',
    ]);
    expect(chips[2]?.label).toBe('Správa vsi Dub');
    expect(chips[3]?.reward).toBe(true);
    expect(termChips({})).toEqual([]);
  });

  it('hlad a neplnění: sytý rod a nula nemají ikonu', () => {
    expect(hungerLabel('fed')).toBeNull();
    expect(hungerLabel(null)).toBeNull();
    expect(hungerLabel('starving')).toBe('Lidé umírají hlady');
    expect(breachLabel(0)).toBeNull();
    expect(breachLabel(3)).toBe('Neplnění: 3 případy');
    expect(formatAmount(1234567)).toBe('1 234 567');
  });

  it('popisky řádků jednání nesou čísla služby', () => {
    expect(termRowLabel({ kind: 'service', men: 5, days: 40 }, 'a', { lordName: null })).toBe(
      'Vojenská služba: 5 mužů na 40 dní',
    );
  });
});
