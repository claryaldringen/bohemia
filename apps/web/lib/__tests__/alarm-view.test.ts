import type { AlarmView, AlarmViewOption } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import { parseAlarmCommand, parseAlarmVillage } from '../alarm-input';
import {
  ALARM_LABELS,
  alarmOptionText,
  daysBadge,
  daysText,
  domainSendText,
  flightText,
  messengerText,
  returnText,
  runnerText,
  YIELD_LORD_LABEL,
} from '../alarm-view';

// Varování a útěk v rozhraní (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 –
// Úloha 12): odhad ve dnech, důvody u kurzoru („Pán nemá hradiště“, „Nestihnou to“ s odhadem),
// popisky a tvar vstupu server actions.

const ok = (o: Partial<AlarmViewOption> = {}): AlarmViewOption => ({ blocked: null, ...o });

function view(o: Partial<AlarmView> = {}): AlarmView {
  return {
    campaignId: 'c1',
    villageId: 'v1',
    warned: true,
    decided: null,
    yieldLord: null,
    armyEtaDays: 2.2,
    options: {
      messenger: ok({ etaDays: 0.8 }),
      forest: ok({ etaDays: 0.1 }),
      people: ok({ etaDays: 1.4, leaveDays: 0.3 }),
      all: ok({ etaDays: 2.6, leaveDays: 0.7 }),
    },
    runners: [],
    host: { villageId: 'h1', name: 'Hradec' },
    messenger: null,
    flight: null,
    ret: null,
    ...o,
  };
}

describe('daysText', () => {
  it('méně než den, 1 den, 2–4 dny, 5 dní a víc', () => {
    expect(daysText(0.2)).toBe('méně než den');
    expect(daysText(0.6)).toBe('≈ 1 den');
    expect(daysText(2.2)).toBe('≈ 2 dny');
    expect(daysText(4.4)).toBe('≈ 4 dny');
    expect(daysText(5)).toBe('≈ 5 dní');
    expect(daysText(12.4)).toBe('≈ 12 dní');
  });
});

describe('alarmOptionText', () => {
  it('názvy ikon doslovně ze specu', () => {
    expect(ALARM_LABELS).toEqual({
      messenger: 'Poslat posla',
      forest: 'Ukrýt v lese',
      people: 'Do hradiště – jen lidé',
      all: 'Do hradiště – se vším',
      return: 'Vrátit se',
    });
  });

  it('volba jde – odhad cesty a kdy tu bude vojsko', () => {
    expect(alarmOptionText(view(), 'all')).toEqual({
      label: 'Do hradiště – se vším',
      denied: null,
      detail: 'Do hradiště Hradec ≈ 3 dny – vojsko tu bude za ≈ 2 dny.',
    });
    expect(alarmOptionText(view(), 'forest').detail).toBe(
      'Do lesa méně než den – vojsko tu bude za ≈ 2 dny.',
    );
    expect(alarmOptionText(view(), 'messenger').detail).toBe('Do hradiště Hradec ≈ 1 den.');
  });

  it('„Pán nemá hradiště“ a „Nestihnou to“ s odhadem času', () => {
    const v = view({
      armyEtaDays: 2,
      host: null,
      options: {
        messenger: { blocked: 'no-hillfort' },
        forest: { blocked: 'no-forest' },
        people: { blocked: 'too-late', etaDays: 4, leaveDays: 3.1 },
        all: { blocked: 'no-hillfort' },
      },
    });
    expect(alarmOptionText(v, 'messenger').denied).toBe('Pán nemá hradiště.');
    expect(alarmOptionText(v, 'forest').denied).toBe('Na mapě není les.');
    expect(alarmOptionText(v, 'people')).toEqual({
      label: 'Do hradiště – jen lidé',
      denied: 'Nestihnou to – vojsko tu bude za ≈ 2 dny, z mapy jim to potrvá ≈ 3 dny.',
      detail: null,
    });
    expect(
      alarmOptionText(
        view({ armyEtaDays: 0, options: { ...v.options, all: { blocked: 'too-late' } } }),
        'all',
      ).denied,
    ).toBe('Nestihnou to – vojsko už je tu.');
  });

  it('nevarovaná ves, boj u vsi, posel už běží', () => {
    const v = view({
      options: {
        messenger: { blocked: 'sent' },
        forest: { blocked: 'battle' },
        people: { blocked: 'gone' },
        all: { blocked: 'unwarned' },
      },
    });
    expect(alarmOptionText(v, 'messenger').denied).toBe('Posel už běží.');
    expect(alarmOptionText(v, 'forest').denied).toBe('U vsi se už bojuje.');
    expect(alarmOptionText(v, 'people').denied).toBe('Lidé už odešli.');
    expect(alarmOptionText(v, 'all').denied).toBe('Ves o vojsku neví.');
  });
});

describe('posel, skupina a návrat', () => {
  it('kdo poběží', () => {
    const base = { personId: 1, name: null, line: false, mounted: false, etaDays: 1.2 };
    expect(runnerText(base)).toBe('Vesničan pěšky ≈ 1 den.');
    expect(runnerText({ ...base, name: 'Bořek', line: true, mounted: true, etaDays: 0.3 })).toBe(
      'Bořek na koni méně než den.',
    );
    expect(runnerText({ ...base, etaDays: null })).toBe('Vesničan pěšky.');
  });

  it('stav skupiny', () => {
    expect(flightText(view())).toBeNull();
    const flight = { mode: 'people' as const, status: 'marching' as const, etaDays: 2.4 };
    expect(flightText(view({ flight }))).toBe('Lidé jdou do hradiště Hradec – ≈ 2 dny.');
    expect(flightText(view({ flight: { ...flight, status: 'arrived', etaDays: null } }))).toBe(
      'Lidé došli do hradiště Hradec.',
    );
    expect(flightText(view({ flight: { mode: 'forest', status: 'hidden', etaDays: null } }))).toBe(
      'Lidé se ukryli v lese.',
    );
  });

  it('Vrátit se – důvod, nebo kdy budou doma', () => {
    expect(returnText({ blocked: 'Vojsko je ještě na mapě.' })).toEqual({
      label: 'Vrátit se',
      denied: 'Vojsko je ještě na mapě.',
      detail: null,
    });
    expect(returnText({ blocked: 'Lidé se už vracejí.', backInDays: 3 }).detail).toBe(
      'Lidé budou doma za ≈ 3 dny.',
    );
    expect(returnText({ blocked: null, backInDays: 0 }).detail).toBe('Lidé budou doma dnes.');
  });
});

describe('vstup server actions', () => {
  it('ves a příkazy', () => {
    expect(parseAlarmVillage({ villageId: 'v1' })).toEqual({ villageId: 'v1' });
    expect(parseAlarmVillage({ villageId: '' })).toBeNull();
    expect(parseAlarmCommand({ villageId: 'v1', command: { kind: 'yield-lord' } })).toEqual({
      villageId: 'v1',
      command: { kind: 'yield-lord' },
    });
    expect(parseAlarmCommand({ villageId: 'v1', command: { kind: 'messenger' } })).toEqual({
      villageId: 'v1',
      command: { kind: 'messenger' },
    });
    expect(
      parseAlarmCommand({ villageId: 'v1', command: { kind: 'messenger', personId: 7 } }),
    ).toEqual({ villageId: 'v1', command: { kind: 'messenger', personId: 7 } });
    expect(
      parseAlarmCommand({ villageId: 'v1', command: { kind: 'messenger', personId: 1.5 } }),
    ).toBeNull();
    expect(parseAlarmCommand({ villageId: 'v1', command: { kind: 'flee', mode: 'all' } })).toEqual({
      villageId: 'v1',
      command: { kind: 'flee', mode: 'all' },
    });
    expect(parseAlarmCommand({ villageId: 'v1', command: { kind: 'flee', mode: 'x' } })).toBeNull();
    expect(
      parseAlarmCommand({ villageId: 'v1', command: { kind: 'domain', to: ['a', 'b', 'a'] } }),
    ).toEqual({ villageId: 'v1', command: { kind: 'domain', to: ['a', 'b'] } });
    expect(parseAlarmCommand({ villageId: 'v1', command: { kind: 'domain', to: [1] } })).toBeNull();
    expect(parseAlarmCommand({ villageId: 'v1', command: { kind: 'return' } })).toBeNull();
  });
});

describe('texty ikon v panelu dvorce (Úloha 13)', () => {
  it('číslo na ikoně stavu – pod půl dne „<1“, jinak zaokrouhlené dny', () => {
    expect(daysBadge(0.2)).toBe('<1');
    expect(daysBadge(0.6)).toBe('1');
    expect(daysBadge(2.4)).toBe('2');
  });

  it('stav posla podle hradiště a koně', () => {
    expect(messengerText(view())).toBeNull();
    expect(messengerText(view({ messenger: { status: 'running', mounted: false } }))).toBe(
      'Posel běží do hradiště Hradec.',
    );
    expect(messengerText(view({ messenger: { status: 'running', mounted: true } }))).toBe(
      'Posel jede na koni do hradiště Hradec.',
    );
    expect(messengerText(view({ messenger: { status: 'arrived', mounted: false } }))).toBe(
      'Posel doběhl do hradiště Hradec.',
    );
    expect(messengerText(view({ messenger: { status: 'caught', mounted: false } }))).toBe(
      'Posla chytili.',
    );
  });

  it('odeslání poslů do domény a popisek bílé vlajky', () => {
    expect(YIELD_LORD_LABEL).toBe('Vzdát se – vojvoda půjde do zajetí, nájezd skončí.');
    expect(domainSendText(0, 3)).toBe('Vyber vsi – smíš ještě 3.');
    expect(domainSendText(2, 3)).toBe('Poslat posly (2) – smíš ještě 3.');
  });
});
