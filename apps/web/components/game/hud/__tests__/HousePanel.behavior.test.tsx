// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelAgreement, PanelTreeNode, PublicHouse, VassalTerms } from '@bohemia/game';
import type { HouseLinkView, HouseView } from '@/lib/house-view';
import { emptyBundle, withBundleValue } from '@/lib/terms-view';
import { HousePanel, inviteLink } from '../HousePanel';
import { TopBar } from '../TopBar';

// Panel „Rod a vazalové“ (vassalage.md – Co hráč vidí): řady ikon s popisky, pozvánky s kódem,
// odkazem a křížkem.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const link = (houseId: string, over: Partial<HouseLinkView> = {}): HouseLinkView => ({
  houseId,
  icon: 'man',
  lordName: 'Boleslav',
  men: 3,
  distance: 4,
  language: 'cs',
  label: 'Boleslav – 3 muži',
  ...over,
});
const VIEW: HouseView = {
  hasHouse: true,
  ownHouseId: 'h-me',
  isolated: false,
  inviteReason: null,
  stewardships: [],
  wars: [],
  protectionDaysLeft: null,
  disputes: [],
  fellows: [],
  agreements: [],
  tree: [],
  status: {},
  negotiations: [],
  own: [
    {
      icon: 'elder',
      name: null,
      age: 62,
      label: '62 let',
      villageId: 'v-1',
      senior: true,
      lord: false,
    },
    {
      icon: 'man',
      name: 'Jan',
      age: 34,
      label: 'Jan, 34 roky',
      villageId: 'v-2',
      senior: false,
      lord: true,
    },
  ],
  successionCredits: 2,
  lords: [],
  vassals: [link('h-v')],
  others: [link('h-o')],
  invites: [
    {
      code: 'BH7KM2QX',
      display: 'BH7K-M2QX',
      state: 'open',
      daysLeft: 5,
      invitee: null,
      played: false,
      label: 'Platí ještě 5 dní',
    },
    {
      code: 'AAAAAAAA',
      display: 'AAAA-AAAA',
      state: 'used',
      daysLeft: null,
      invitee: link('h-i'),
      played: true,
      label: 'Pozvaný se rozehrál',
    },
  ],
  freeInviteSlots: 2,
  waiting: 0,
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (over: Partial<Parameters<typeof HousePanel>[0]> = {}): void => {
  act(() =>
    root.render(
      <HousePanel
        view={VIEW}
        error={null}
        origin="http://localhost:3011"
        onIssue={async () => undefined}
        onRevoke={async () => undefined}
        onClose={() => {}}
        {...over}
      />,
    ),
  );
};

describe('HousePanel', () => {
  it('ukáže rod, nezávislého bez pánů, vazaly, hráče se štítem a pozvánky', () => {
    render();
    expect(host.querySelectorAll('[data-testid="house-own-man"]')).toHaveLength(2);
    expect(
      host.querySelector('[data-testid="house-independent"]')?.getAttribute('aria-label'),
    ).toBe('Nezávislý');
    expect(host.querySelectorAll('[data-testid="house-vassal"]')).toHaveLength(1);
    expect(host.querySelector('[data-testid="house-other"]')?.textContent).toContain('3');
    expect(host.querySelector('[data-testid="house-invite-slots"]')?.textContent).toBe('2');
    expect(host.querySelector('[data-testid="house-invite-code"]')?.textContent).toBe('BH7K-M2QX');
    expect(host.querySelector('[data-testid="house-invite-played"]')).not.toBeNull();
  });

  it('vydání a zrušení volá akce, kopírování dá odkaz s kódem', async () => {
    const onIssue = vi.fn(async () => undefined);
    const onRevoke = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render({ onIssue, onRevoke });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="house-invite-issue"]')!.click();
    });
    expect(onIssue).toHaveBeenCalledOnce();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="house-invite-revoke"]')!.click();
    });
    expect(onRevoke).toHaveBeenCalledWith('BH7KM2QX');
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="house-invite-copy"]')!.click();
    });
    expect(writeText).toHaveBeenCalledWith('http://localhost:3011/register?pozvanka=BH7KM2QX');
    expect(inviteLink('https://x.cz', 'ABC')).toBe('https://x.cz/register?pozvanka=ABC');
  });

  it('bez volných míst vydání zašedne, chyba je vidět, Esc zavře', () => {
    const onClose = vi.fn();
    render({
      view: { ...VIEW, freeInviteSlots: 0 },
      error: 'Nevyužité pozvánky mohou být nejvýš 3.',
      onClose,
    });
    expect(
      host.querySelector<HTMLButtonElement>('[data-testid="house-invite-issue"]')!.disabled,
    ).toBe(true);
    expect(host.querySelector('[data-testid="house-error"]')?.textContent).toContain('nejvýš 3');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('odblokování rodu', () => {
  it('zablokovaný rod má místo Blokovat tlačítko Odblokovat, které zavolá akci', async () => {
    const onUnblock = vi.fn(async () => undefined);
    const onBlock = vi.fn(async () => undefined);
    const other = link('h-o', {
      actions: { offer: null, request: null, blocked: true, war: null },
    });
    render({ view: { ...VIEW, others: [other] }, onBlock, onUnblock });
    await act(async () => {
      host.querySelector<HTMLElement>('[data-testid="house-other"][data-house-id="h-o"]')!.click();
    });
    expect(host.querySelector('[data-testid="house-block"]')).toBeNull();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="house-unblock"]')!.click();
    });
    expect(onUnblock).toHaveBeenCalledWith('h-o');
    expect(onBlock).not.toHaveBeenCalled();
  });
});

describe('prapor v liště', () => {
  const bar = (waiting: number): string =>
    renderToStaticMarkup(
      <TopBar
        view={null}
        world={{ startMs: 0, endMs: 1e12 }}
        initialNowMs={1}
        soundOn
        onToggleSound={() => {}}
        menuOpen={false}
        onToggleMenu={() => {}}
        onRename={async () => null}
        devTime={null}
        house={{ vassals: 2, waiting, open: false, onToggle: () => {} }}
      />,
    );
  it('ukáže počet vazalů a pečeť jen když něco čeká', () => {
    expect(bar(0)).toContain('data-testid="house-vassal-count"');
    expect(bar(0)).not.toContain('house-waiting');
    expect(bar(3)).toContain('data-testid="house-waiting"');
  });
});

describe('podmínky vazalství v panelu', () => {
  const house = (houseId: string, name: string): PublicHouse =>
    ({
      houseId,
      lordName: name,
      men: [{ name, age: 30 }],
      distance: 2,
    }) as unknown as PublicHouse;
  const terms: VassalTerms = {
    tribute: withBundleValue(emptyBundle(), 'grainKg', 500),
    service: { men: 3, days: 30 },
    targetVillageId: 'v-own',
  };
  const agreement = (id: string, other: string, side: 'lord' | 'vassal'): PanelAgreement => ({
    vassalageId: id,
    lordHouseId: side === 'vassal' ? 'h-me' : other,
    vassalHouseId: side === 'vassal' ? other : 'h-me',
    otherHouseId: other,
    other: side,
    terms,
    breaches: 0,
    sinceDay: 1,
    levyYears: null,
  });
  const node = (id: string, h: string, parent: string, depth: number): PanelTreeNode => ({
    house: house(h, h),
    depth,
    parentHouseId: parent,
    vassalageId: id,
    terms: depth === 1 ? terms : {},
    breaches: depth === 1 ? 2 : 0,
    hunger: depth === 1 ? 'hungry' : 'fed',
    shield: 1,
  });
  const WITH_TREE: HouseView = {
    ...VIEW,
    agreements: [agreement('va-1', 'h-v', 'vassal')],
    tree: [node('va-2', 'h-w', 'h-v', 2), node('va-1', 'h-v', 'h-me', 1)],
  };
  const click = (id: string): void => {
    act(() => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click());
  };

  it('vazal má ikony podmínek, zlomenou pečeť s počtem a hlad; vazal vazala je odsazen pod ním', () => {
    render({ view: WITH_TREE, villages: [{ id: 'v-own', name: 'Dub' }] });
    const entries = [...host.querySelectorAll('[data-depth]')];
    expect(entries.map((e) => e.getAttribute('data-depth'))).toEqual(['1', '2']);
    const first = entries[0]!;
    const chips = [...first.querySelectorAll('[data-chip]')].map((c) =>
      c.getAttribute('data-chip'),
    );
    expect(chips).toEqual(['tribute-grainKg', 'service', 'target-village']);
    expect(first.querySelector('[data-testid="house-breaches"]')?.textContent).toBe('2');
    expect(first.querySelector('[data-testid="house-hunger"]')).not.toBeNull();
    expect(first.querySelector('[aria-label="Správa vsi Dub"]')).not.toBeNull();
    // sytý vazal vazala nemá ikonu hladu ani pečeť
    expect(entries[1]!.querySelector('[data-testid="house-hunger"]')).toBeNull();
    expect(entries[1]!.querySelector('[data-testid="house-breaches"]')).toBeNull();
    expect(host.querySelectorAll('[data-testid="house-vassal"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-testid="house-subvassal"]')).toHaveLength(1);
  });

  it('čekající Odvody: pán vidí přesýpací hodiny u vazala, vazal pečeť, která otevře dialog', () => {
    render({
      view: {
        ...WITH_TREE,
        agreements: [{ ...agreement('va-1', 'h-v', 'vassal'), levyYears: 1 }],
      },
    });
    expect(host.querySelector('[data-testid="house-levy-wait"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="house-levy-open"]')).toBeNull();
    const onOpenLevy = vi.fn();
    render({
      view: {
        ...VIEW,
        lords: [link('h-l')],
        agreements: [{ ...agreement('va-3', 'h-l', 'lord'), levyYears: 2 }],
      },
      onOpenLevy,
    });
    click('house-levy-open');
    expect(onOpenLevy).toHaveBeenCalledTimes(1);
  });

  it('klik na vazala ukáže Nové podmínky a Vypovědět; vazal vazala akce nemá', () => {
    render({ view: WITH_TREE });
    expect(host.querySelector('[data-testid="agreement-actions"]')).toBeNull();
    click('house-subvassal');
    expect(host.querySelector('[data-testid="agreement-actions"]')).toBeNull();
    click('house-vassal');
    expect(host.querySelector('[data-testid="agreement-new-terms"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="agreement-renounce"]')).not.toBeNull();
  });

  it('Nové podmínky otevřou formulář s podmínkami dohody bez přísahy a pošlou je jako jednání', () => {
    const onOpenNegotiation = vi.fn(async () => undefined);
    render({ view: WITH_TREE, onOpenNegotiation });
    click('house-vassal');
    click('agreement-new-terms');
    expect(host.querySelector('[data-testid="term-row-oath"]')).toBeNull();
    expect(host.querySelector('[data-testid="term-row-tribute"]')).not.toBeNull();
    click('terms-submit');
    const [to, items, message] = onOpenNegotiation.mock.calls[0] as unknown as [
      string,
      { kind: string }[],
      null,
    ];
    expect(to).toBe('h-v');
    expect(items.map((i) => i.kind)).toEqual(['tribute', 'service', 'target-village']);
    expect(message).toBeNull();
  });

  it('Vypovědět vyžaduje druhé tlačítko, vzkaz se pošle, pán se vypovídá stejně', async () => {
    const onRenounce = vi.fn(async () => undefined);
    render({
      view: {
        ...WITH_TREE,
        lords: [link('h-l')],
        agreements: [...WITH_TREE.agreements, agreement('va-3', 'h-l', 'lord')],
      },
      onRenounce,
    });
    click('house-vassal');
    click('agreement-renounce');
    expect(onRenounce).not.toHaveBeenCalled();
    const area = host.querySelector<HTMLTextAreaElement>('[data-testid="renounce-message"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(area, 'Nesplnil jsi dávku');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click('renounce-confirm');
    await act(async () => {});
    expect(onRenounce).toHaveBeenCalledWith('va-1', 'Nesplnil jsi dávku');
    click('house-lord');
    click('agreement-renounce');
    click('renounce-confirm');
    expect(onRenounce).toHaveBeenLastCalledWith('va-3', null);
  });
});

describe('výkupné zajatců', () => {
  it('tlačítko je jen u rodu, jemuž zajatec patří', async () => {
    const other = link('h-o', {
      actions: { offer: null, request: null, blocked: false, war: null },
    });
    const captives = [{ id: 'z-1', name: 'Bořivoj', noble: true, houseId: 'h-o' }];
    const open = async (): Promise<void> => {
      await act(async () => {
        host
          .querySelector<HTMLElement>('[data-testid="house-other"][data-house-id="h-o"]')!
          .click();
      });
    };
    render({ view: { ...VIEW, others: [other] }, captives });
    await open();
    expect(host.querySelector('[data-testid="house-ransom"]')).not.toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    render({
      view: { ...VIEW, others: [other] },
      captives: [{ ...captives[0]!, houseId: 'h-jiny' }],
    });
    await open();
    expect(host.querySelector('[data-testid="house-ransom"]')).toBeNull();
  });
});
