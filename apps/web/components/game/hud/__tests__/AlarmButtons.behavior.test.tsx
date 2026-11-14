// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlarmCommand, AlarmViewOption } from '@bohemia/game';
import type { AlarmView } from '@/lib/alarm-view';
import type { VillageRightsView } from '@/lib/village-view-types';
import { AlarmButtons, ALARM_ICONS } from '../AlarmButtons';
import { RightsProvider } from '../rights';

// Ikony varování a útěku v panelu dvorce (war.md – Varování, poslové a útěk do hradiště; plán
// 2026-11-09 – Úloha 13): ikony podle pohledu, důvod u kurzoru s odhadem, klik volá akci jednou,
// výběr posla, po útěku stav a Vrátit se, hradiště varuje doménu, bez práva zašedlé.

const ok = (o: Partial<AlarmViewOption> = {}): AlarmViewOption => ({ blocked: null, ...o });

function alarmView(o: Partial<AlarmView> = {}): AlarmView {
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
      all: { blocked: 'too-late', etaDays: 3.4, leaveDays: 2.9 },
    },
    runners: [{ personId: 9, name: null, line: false, mounted: false, etaDays: 0.8 }],
    host: { villageId: 'h1', name: 'Hradec' },
    messenger: null,
    flight: null,
    ret: null,
    ...o,
  };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

type Command = (command: AlarmCommand) => Promise<string | null>;

async function mount(
  view: AlarmView | null,
  onCommand: Command = vi.fn(() => Promise.resolve(null)),
  onReturn: () => Promise<string | null> = vi.fn(() => Promise.resolve(null)),
  rights: VillageRightsView | null = null,
): Promise<void> {
  await act(async () => {
    root.render(
      <RightsProvider value={rights}>
        <AlarmButtons view={view} onCommand={onCommand} onReturn={onReturn} />
      </RightsProvider>,
    );
  });
}

const q = (id: string): HTMLElement | null => host.querySelector(`[data-testid="${id}"]`);
const button = (id: string): HTMLButtonElement => q(id) as HTMLButtonElement;
/** Popisek ikony (Tooltip – sourozenec tlačítka). */
const tip = (id: string): string =>
  q(id)?.parentElement?.querySelector('[role="tooltip"]')?.textContent ?? '';

describe('ikony varování v panelu dvorce', () => {
  it('nevarovaná ves bez lidí na útěku – žádný řádek', async () => {
    await mount(null);
    expect(q('alarm-buttons')).toBeNull();
    await mount(alarmView({ warned: false }));
    expect(q('alarm-buttons')).toBeNull();
  });

  it('čtyři ikony v pořadí specu, název jen v popisku, odhad a důvod „Nestihnou to“ s časem', async () => {
    await mount(alarmView());
    const icons = [...host.querySelectorAll('button')].map((b) => b.dataset.testid);
    expect(icons).toEqual(['alarm-messenger', 'alarm-forest', 'alarm-people', 'alarm-all']);
    expect(button('alarm-forest').querySelector('img')?.getAttribute('src')).toBe(
      ALARM_ICONS.forest,
    );
    // žádný text na ikonách – jen v popiscích
    expect(button('alarm-people').textContent).toBe('');
    expect(button('alarm-people').getAttribute('aria-label')).toBe('Do hradiště – jen lidé');
    expect(tip('alarm-people')).toContain(
      'Do hradiště Hradec ≈ 1 den – vojsko tu bude za ≈ 2 dny.',
    );
    expect(tip('alarm-messenger')).toContain('Vesničan pěšky ≈ 1 den.');
    expect(button('alarm-all').disabled).toBe(true);
    expect(q('alarm-denied-all')?.textContent).toBe(
      'Nestihnou to – vojsko tu bude za ≈ 2 dny, z mapy jim to potrvá ≈ 3 dny.',
    );
    expect(tip('alarm-all')).toContain('Do hradiště – se vším');
  });

  it('„Pán nemá hradiště“ – zašedlé s důvodem', async () => {
    await mount(
      alarmView({
        host: null,
        options: {
          messenger: { blocked: 'no-hillfort' },
          forest: ok({ etaDays: 0.1 }),
          people: { blocked: 'no-hillfort' },
          all: { blocked: 'no-hillfort' },
        },
      }),
    );
    expect(button('alarm-people').disabled).toBe(true);
    expect(q('alarm-denied-people')?.textContent).toBe('Pán nemá hradiště.');
    expect(button('alarm-forest').disabled).toBe(false);
  });

  it('klik volá akci jednou, pak skupina útěku zašedne do odpovědi serveru (nejdéle 10 s)', async () => {
    vi.useFakeTimers();
    let resolve: (v: string | null) => void = () => undefined;
    const onCommand = vi.fn<Command>(() => new Promise((r) => (resolve = r)));
    await mount(alarmView(), onCommand);
    await act(async () => button('alarm-forest').click());
    await act(async () => button('alarm-forest').click());
    await act(async () => button('alarm-people').click());
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith({ kind: 'flee', mode: 'forest' });
    await act(async () => resolve(null));
    expect(button('alarm-people').disabled).toBe(true);
    expect(tip('alarm-people')).toBe('Lidé už odešli.');
    // posel je jiná skupina – jde dál
    expect(button('alarm-messenger').disabled).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(button('alarm-people').disabled).toBe(false);
  });

  it('chyba serveru zůstane u kurzoru', async () => {
    const onCommand = vi.fn<Command>(() => Promise.resolve('Vojsko už odtáhlo.'));
    await mount(alarmView(), onCommand);
    await act(async () => button('alarm-messenger').click());
    expect(onCommand).toHaveBeenCalledWith({ kind: 'messenger' });
    expect(button('alarm-messenger').disabled).toBe(true);
    expect(tip('alarm-messenger')).toBe('Vojsko už odtáhlo.');
  });

  it('víc možných poslů – nabídka koho poslat; muž rodu s id, vesničan výchozí', async () => {
    const onCommand = vi.fn<Command>(() => Promise.resolve(null));
    const view = alarmView({
      runners: [
        { personId: 9, name: null, line: false, mounted: false, etaDays: 0.8 },
        { personId: 1, name: 'Bořek', line: true, mounted: true, etaDays: 0.3 },
      ],
    });
    await mount(view, onCommand);
    expect(q('alarm-runners')).toBeNull();
    await act(async () => button('alarm-messenger').click());
    expect(onCommand).not.toHaveBeenCalled();
    expect(q('alarm-runners')).not.toBeNull();
    expect(button('alarm-runner-1').getAttribute('aria-label')).toBe('Bořek na koni méně než den.');
    expect(button('alarm-runner-1').querySelector('img')?.getAttribute('src')).toBe(
      '/icons/resources/horse.png',
    );
    await act(async () => button('alarm-runner-1').click());
    expect(onCommand).toHaveBeenCalledWith({ kind: 'messenger', personId: 1 });
    expect(q('alarm-runners')).toBeNull();
    // nová odpověď serveru (posel běží) – nabídka znovu, vesničan bez id
    await mount({ ...view, messenger: { status: 'running', mounted: true } }, onCommand);
    expect(q('alarm-messenger-running')).not.toBeNull();
    await act(async () => button('alarm-messenger').click());
    await act(async () => button('alarm-runner-9').click());
    expect(onCommand).toHaveBeenLastCalledWith({ kind: 'messenger' });
  });

  it('po útěku stav skupiny s odhadem dnů a Vrátit se', async () => {
    const onReturn = vi.fn(() => Promise.resolve(null));
    const fled = alarmView({
      options: {
        messenger: { blocked: 'sent' },
        forest: { blocked: 'gone' },
        people: { blocked: 'gone' },
        all: { blocked: 'gone' },
      },
      flight: { mode: 'all', status: 'marching', etaDays: 2.4 },
      ret: { blocked: 'Lidé ještě nedorazili.' },
    });
    await mount(fled, undefined, onReturn);
    expect(q('alarm-forest')).toBeNull();
    expect(q('alarm-flight')?.dataset.status).toBe('marching');
    expect(q('alarm-flight')?.querySelector('img')?.getAttribute('src')).toBe(ALARM_ICONS.all);
    expect(q('alarm-flight')?.textContent).toBe('2');
    expect(tip('alarm-flight')).toContain('Lidé jdou do hradiště Hradec – ≈ 2 dny.');
    expect(button('alarm-return').disabled).toBe(true);
    expect(q('alarm-denied-return')?.textContent).toBe('Lidé ještě nedorazili.');
    // došli a vojsko odtáhlo – Vrátit se jde; tažení už skončilo (nevarovaná ves)
    await mount(
      alarmView({ warned: false, flight: null, ret: { blocked: null } }),
      undefined,
      onReturn,
    );
    expect([...host.querySelectorAll('button')].map((b) => b.dataset.testid)).toEqual([
      'alarm-return',
    ]);
    await act(async () => button('alarm-return').click());
    await act(async () => button('alarm-return').click());
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(tip('alarm-return')).toBe('Lidé se už vracejí.');
  });

  it('lidé došli – fajfka; dostiženi – křížek', async () => {
    await mount(alarmView({ flight: { mode: 'people', status: 'arrived', etaDays: null } }));
    expect(q('alarm-flight')?.innerHTML).toContain('/icons/war/alarm-done.png');
    await mount(alarmView({ flight: { mode: 'forest', status: 'caught', etaDays: null } }));
    expect(q('alarm-flight')?.innerHTML).toContain('/icons/house/cross.png');
  });

  it('hradiště hráče – výběr vsí domény, varované zaškrtnuté a zamčené, nejvýš domainLeft', async () => {
    const onCommand = vi.fn<Command>(() => Promise.resolve(null));
    await mount(
      alarmView({
        domain: [
          { villageId: 'd1', name: 'Kněžice', warned: true },
          { villageId: 'd2', name: 'Lhota', warned: false },
          { villageId: 'd3', name: 'Budeč', warned: false },
        ],
        domainLeft: 1,
      }),
      onCommand,
    );
    await act(async () => button('alarm-domain').click());
    const box = (id: string): HTMLInputElement =>
      q(`alarm-domain-${id}`)!.querySelector('input') as HTMLInputElement;
    expect(box('d1').checked).toBe(true);
    expect(box('d1').disabled).toBe(true);
    expect(button('alarm-domain-send').disabled).toBe(true);
    await act(async () => box('d2').click());
    // víc poslů hradiště nemá
    expect(box('d3').disabled).toBe(true);
    expect(button('alarm-domain-send').getAttribute('aria-label')).toBe(
      'Poslat posly (1) – smíš ještě 1.',
    );
    await act(async () => button('alarm-domain-send').click());
    expect(onCommand).toHaveBeenCalledWith({ kind: 'domain', to: ['d2'] });
    expect(q('alarm-domain-list')).toBeNull();
  });

  it('do domény není koho varovat – zašedlé', async () => {
    await mount(
      alarmView({ domain: [{ villageId: 'd1', name: 'Kněžice', warned: true }], domainLeft: 2 }),
    );
    expect(button('alarm-domain').disabled).toBe(true);
    expect(q('alarm-denied-domain')?.textContent).toBe('Do domény není koho varovat.');
  });

  it('lhůta hráče se nezobrazuje', async () => {
    await mount(alarmView({ yieldLord: { blocked: null } }));
    expect(q('alarm-grace')).toBeNull();
  });

  it('bílá vlajka – první stisk připraví, druhý vzdá; název jen v popisku', async () => {
    const onCommand = vi.fn<Command>(() => Promise.resolve(null));
    await mount(alarmView({ yieldLord: { blocked: null } }), onCommand);
    const flag = button('alarm-yield-lord');
    expect(flag.querySelector('img')?.getAttribute('src')).toBe('/icons/war/white-flag.png');
    expect(flag.textContent).toBe('');
    expect(tip('alarm-yield-lord')).toContain('Vzdát se – vojvoda půjde do zajetí, nájezd skončí.');
    expect(flag.dataset.armed).toBeUndefined();
    await act(async () => flag.click());
    expect(onCommand).not.toHaveBeenCalled();
    expect(button('alarm-yield-lord').dataset.armed).toBe('true');
    await act(async () => button('alarm-yield-lord').click());
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith({ kind: 'yield-lord' });
  });

  it('bílá vlajka zašedlá s důvodem v popisku; bez vojvody ikona není', async () => {
    const onCommand = vi.fn<Command>(() => Promise.resolve(null));
    await mount(alarmView({ yieldLord: { blocked: 'lordAway' } }), onCommand);
    expect(button('alarm-yield-lord').disabled).toBe(true);
    expect(q('alarm-denied-yield-lord')?.textContent).toBe('Vojvoda není doma.');
    await act(async () => button('alarm-yield-lord').click());
    expect(onCommand).not.toHaveBeenCalled();
    await mount(alarmView({ yieldLord: { blocked: 'notRaided' } }), onCommand);
    expect(q('alarm-denied-yield-lord')?.textContent).toBe('Vojsko ještě nepřišlo.');
    await mount(alarmView({ yieldLord: null }));
    expect(q('alarm-yield-lord')).toBeNull();
  });

  it('bez práva war – všechny ikony zašedlé s důvodem práva, klik nic', async () => {
    const onCommand = vi.fn<Command>(() => Promise.resolve(null));
    const onReturn = vi.fn(() => Promise.resolve(null));
    await mount(
      alarmView({ ret: { blocked: null }, domain: [], domainLeft: 2 }),
      onCommand,
      onReturn,
      { allowed: ['steward'], reason: 'Rozhoduje Bořivoj.' },
    );
    for (const id of ['alarm-messenger', 'alarm-forest', 'alarm-people', 'alarm-return']) {
      expect(button(id).disabled).toBe(true);
      expect(tip(id)).toBe('Rozhoduje Bořivoj.');
    }
    await act(async () => button('alarm-forest').click());
    await act(async () => button('alarm-return').click());
    expect(onCommand).not.toHaveBeenCalled();
    expect(onReturn).not.toHaveBeenCalled();
  });
});
