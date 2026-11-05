// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HouseLinkView, HouseView } from '@/lib/house-view';
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
  label: 'Boleslav – 3 muži',
  ...over,
});
const VIEW: HouseView = {
  hasHouse: true,
  own: [
    { icon: 'man', name: 'Jan', age: 34, label: 'Jan, 34 roky' },
    { icon: 'elder', name: null, age: 62, label: '62 let' },
  ],
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
