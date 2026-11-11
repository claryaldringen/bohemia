import { describe, expect, it } from 'vitest';

import { CARTS } from '../../rules/rules-crafts';
import { TRADE } from '../../rules/rules-trade';
import { expeditionTransport } from '../trade';

// wagons.md – Obchod, Opakované jízdy vozu (Martin 22. 10. 2026, issue #3)
describe('výprava – jízdy vozu a nosiči na doplnění', () => {
  it('vůz jede tolikrát, kolikrát se naplní celý', () => {
    // 1 600 kg = dvě plné jízdy čtyřkoláku, nikdo navíc nejde
    expect(expeditionTransport({ grain: 1600 }, {}, ['four-wheel'])).toMatchObject({
      porters: CARTS.tradeCrew,
      carts: 1,
      trips: 2,
    });
  });

  it('zbytek nad plné jízdy nesou lidé rovnoměrně mezi jízdy', () => {
    // 1 800 kg: 2 plné jízdy, zbývá 200 kg = 8 nosičů, po 4 při každé jízdě (+ posádka vozu)
    expect(expeditionTransport({ grain: 1800 }, {}, ['four-wheel'])).toMatchObject({
      porters: CARTS.tradeCrew + 4,
      carts: 1,
      trips: 2,
    });
    // 5 nosičů na dvě jízdy = 3 + 2, práce 5 člověkojízd (ne 6) + posádka obou jízd
    const t = expeditionTransport({ grain: 1600 + 125 }, {}, ['four-wheel']);
    expect(t.porters).toBe(CARTS.tradeCrew + 3);
    expect(t.work).toBe(5 + 2 * CARTS.tradeCrew);
  });

  it('zbytek aspoň půl vozu = vůz jede ještě jednou', () => {
    // 790 kg na dvoukolák (400 kg): zbytek 390 kg ≈ 97 % vozu -> 2 jízdy
    expect(expeditionTransport({ grain: 790 }, {}, ['two-wheel']).trips).toBe(2);
    // přesně půl vozu (200 kg) jede také, o kousek méně ne
    expect(expeditionTransport({ grain: 600 }, {}, ['two-wheel']).trips).toBe(2);
    const less = expeditionTransport({ grain: 575 }, {}, ['two-wheel']);
    expect(less.trips).toBe(1);
    expect(less.porters).toBe(CARTS.tradeCrew + 7);
  });

  it('méně než plný vůz jede jednou a bere všechno', () => {
    expect(expeditionTransport({ grain: 300 }, {}, ['two-wheel'])).toMatchObject({
      porters: CARTS.tradeCrew,
      carts: 1,
      trips: 1,
    });
  });

  it('bez vozu je jedna cesta a nesou všichni', () => {
    expect(expeditionTransport({ grain: 400 }, {}, [])).toMatchObject({
      porters: 16,
      carts: 0,
      trips: 1,
    });
  });

  it('klády bez vozu nesou dva lidé na kládu', () => {
    expect(TRADE.logCarriers).toBe(2);
    expect(expeditionTransport({ logs: 3 }, {}, [])).toMatchObject({
      porters: 6,
      carts: 0,
      trips: 1,
    });
  });

  it('klády s vozem vždy na voze, i když by lidé nesli levněji', () => {
    // 1 kláda (100 kg): dva lidé by ji nesli, ale s vozem jede na voze
    const t = expeditionTransport({ logs: 1 }, {}, ['two-wheel']);
    expect(t.carts).toBe(1);
    expect(t.porters).toBe(CARTS.tradeCrew);
  });

  it('klády se nevejdou na jednu jízdu – vůz jede víckrát', () => {
    // 10 klád = 1 000 kg na dvoukolák (400 kg) = 3 jízdy
    expect(expeditionTransport({ logs: 10 }, {}, ['two-wheel'])).toMatchObject({
      porters: CARTS.tradeCrew,
      carts: 1,
      trips: 3,
    });
  });

  it('počítá se větší z cest tam a zpět', () => {
    expect(expeditionTransport({ grain: 800 }, { grain: 1600 }, ['four-wheel']).trips).toBe(2);
  });
});
