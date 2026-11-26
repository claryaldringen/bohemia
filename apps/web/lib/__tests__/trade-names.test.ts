import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MERCHANTS, TRADE_GOODS, isPieceGood } from '@bohemia/game';
import {
  NEWCOMER_TEXTS,
  TRADE_GOOD_NAMES,
  coinsText,
  goodsNames,
  goodsText,
  tradeAmountText,
} from '../trade-names';

describe('jednotky zboží obchodu', () => {
  it('kámen je v m³, ne v kusech (trade.md – Kámen)', () => {
    expect(tradeAmountText(3, 'm³')).toBe('3 m³');
    expect(goodsText({ stone: 3 })).toBe('3 m³ kamene');
  });

  it('kronika píše celá kg a zbytek gramů vynechá – žádné „0 kg keramiky“', () => {
    expect(goodsText({ pottery: 2.2e-8, grain: 875.0000000167 })).toBe('875 kg obilí');
    expect(goodsText({ pottery: 0.4 })).toBe('nic');
  });

  it('zlato je v gramech (plán 6)', () => {
    expect(TRADE_GOOD_NAMES.gold).toMatchObject({ name: 'Zlato', unit: 'g' });
    expect(tradeAmountText(50, 'g')).toBe('50 g');
    expect(goodsText({ gold: 50 })).toBe('50 g zlata');
  });

  it('mince: 1 minci, 2–4 mince, jinak mincí – žádné „ks mincí“ (plán 4)', () => {
    expect(coinsText(1)).toBe('1 minci');
    expect(coinsText(4)).toBe('4 mince');
    expect(coinsText(16)).toBe('16 mincí');
    expect(coinsText(1, 'nominative')).toBe('1 mince');
    expect(coinsText(20, 'nominative')).toBe('20 mincí');
    expect(goodsText({ coins: 20 })).toBe('20 mincí');
    expect(goodsText({ honey: 2, coins: 1 })).toBe('2 kg medu, 1 minci');
  });

  it('jména zboží ve výčtu malými písmeny, bez počtů a bez nul (kupci, plán 4)', () => {
    // od plánu 6 kupci kupují i zlato – první v pořadí
    expect(goodsNames(MERCHANTS.wants)).toBe('zlato, med, vosk, kožešiny a otroky');
    expect(goodsNames(MERCHANTS.goods)).toBe('meče, kroužkové košile a helmy');
    expect(goodsNames({ honey: 2, wax: 0 })).toBe('med');
    expect(goodsNames({})).toBe('');
    // otroci ve 4. pádě (plán 5, bod 6)
    expect(goodsNames({ honey: 100, wax: 24, furs: 60, slaves: 10 })).toBe(
      'med, vosk, kožešiny a otroky',
    );
    expect(goodsText({ slaves: 2 })).toBe('2 ks otroků');
  });

  it('kg a kusy zůstávají', () => {
    expect(tradeAmountText(1500, 'kg')).toMatch(/^1\s500 kg$/);
    expect(tradeAmountText(4, 'ks')).toBe('4 kusy');
  });

  it('otroci: zboží po kusech s ikonou otroka a věta příchodu (plán 5)', () => {
    expect(TRADE_GOODS).toContain('slaves');
    expect(TRADE_GOOD_NAMES.slaves).toEqual({
      name: 'Otroci',
      genitive: 'otroků',
      accusative: 'otroky',
      unit: 'ks',
      icon: 'slave',
    });
    expect(NEWCOMER_TEXTS.slave).toEqual({
      notice: 'Přišel otrok',
      chronicle: 'přišel otrok',
      back: 'se vrátil prodaný otrok',
      backNotice: 'Vrátil se prodaný otrok',
      female: {
        notice: 'Přišla otrokyně',
        chronicle: 'přišla otrokyně',
        back: 'se vrátila prodaná otrokyně',
        backNotice: 'Vrátila se prodaná otrokyně',
      },
    });
  });

  it('kusové zboží jádra (`isPieceGood`) je právě to, co web nemá v kg', () => {
    for (const good of TRADE_GOODS) {
      expect(isPieceGood(good), good).toBe(TRADE_GOOD_NAMES[good].unit !== 'kg');
    }
  });
});

describe('ikony zboží obchodu', () => {
  const iconsDir = join(__dirname, '..', '..', 'public', 'icons');
  const licenses = readFileSync(join(iconsDir, 'LICENSES.md'), 'utf8');

  it('ke každému zboží existuje ikona 64 × 64 a ikona kupců', () => {
    for (const good of TRADE_GOODS) {
      // soubor gold.png přibude z větve ikon (plán 6, Úloha 2) – tady se neověřuje
      if (good === 'gold') continue;
      const icon = TRADE_GOOD_NAMES[good].icon;
      expect(existsSync(join(iconsDir, 'resources', `${icon}.png`)), good).toBe(true);
    }
    expect(existsSync(join(iconsDir, 'resources', 'merchants.png'))).toBe(true);
  });

  it('nové ikony mají v LICENSES.md řádek', () => {
    for (const icon of ['coin', 'sword', 'mail-shirt', 'helmet', 'merchants']) {
      expect(licenses, icon).toContain(`\`resources/${icon}.png\``);
    }
  });

  it('ikona otroka 64 × 64 a v LICENSES.md jako render modelu 0 A.D. pod CC BY-SA 3.0 (plán 5)', () => {
    const png = readFileSync(join(iconsDir, 'resources', 'slave.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([64, 64]);
    expect(licenses).toMatch(/`resources\/slave\.png`[^\n]*CC BY-SA 3\.0/);
  });
});
