// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LodgeView } from '@/lib/person-view';
import type { VillageRightsView } from '@/lib/village-view-types';
import { LodgeActions, MasonBadge, PriestBadge } from '../LodgeButtons';
import { RightsProvider } from '../rights';

// Stavební huť u vojvody (stone-masonry.md): pozvání huti výběrem okruhu, huť na cestě, pozvání
// chybějícího mistra; zašedlé s důvodem u kurzoru; ikony oboru mistra a kněze.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(node: ReactElement): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, root };
}

const byTestId = <T extends HTMLElement>(id: string): T | null =>
  document.body.querySelector<T>(`[data-testid="${id}"]`);
const all = (id: string): HTMLButtonElement[] => [
  ...document.body.querySelectorAll<HTMLButtonElement>(`[data-testid="${id}"]`),
];
const reason = (host: HTMLElement): string | null =>
  host.querySelector('[data-testid="rights-reason"]')?.textContent ?? null;

async function unmount(host: HTMLElement, root: Root): Promise<void> {
  await act(async () => root.unmount());
  host.remove();
}

const ok = (): Promise<string | null> => Promise.resolve(null);
const fresh: LodgeView = { invite: null, missing: [] };

describe('pozvání stavební huti', () => {
  it('klik otevře výběr okruhů; okruh zavolá server s okruhem', async () => {
    const onInviteLodge = vi.fn(ok);
    const { host, root } = await mount(
      <LodgeActions lodge={fresh} onInviteLodge={onInviteLodge} onInviteMaster={ok} />,
    );
    const invite = byTestId<HTMLButtonElement>('selection-person-invite-lodge')!;
    expect(invite.getAttribute('aria-label')).toBe('Pozvat stavební huť');
    expect(invite.querySelector('img')?.getAttribute('src')).toBe('/icons/house/lodge.png');
    expect(byTestId('lodge-dialog')).toBeNull();
    await act(async () => invite.click());
    const circles = all('lodge-circle');
    expect(circles.map((c) => c.dataset.circle)).toEqual(['adriatic', 'carolingian']);
    expect(circles.map((c) => c.querySelector('img')?.getAttribute('src'))).toEqual([
      '/icons/house/circle-adriatic.png',
      '/icons/house/circle-carolingian.png',
    ]);
    expect(onInviteLodge).not.toHaveBeenCalled();
    await act(async () => circles[1]!.click());
    expect(onInviteLodge).toHaveBeenCalledWith('carolingian');
    expect(byTestId('lodge-dialog')).toBeNull();
    await unmount(host, root);
  });

  it('Zrušit okno zavře bez volání serveru', async () => {
    const onInviteLodge = vi.fn(ok);
    const { host, root } = await mount(
      <LodgeActions lodge={fresh} onInviteLodge={onInviteLodge} onInviteMaster={ok} />,
    );
    await act(async () => byTestId<HTMLButtonElement>('selection-person-invite-lodge')!.click());
    await act(async () => byTestId<HTMLButtonElement>('lodge-cancel')!.click());
    expect(byTestId('lodge-dialog')).toBeNull();
    expect(onInviteLodge).not.toHaveBeenCalled();
    await unmount(host, root);
  });

  it('nepokřtěný rod: zašedlé s důvodem, okno se neotevře', async () => {
    const { host, root } = await mount(
      <LodgeActions
        lodge={{ invite: 'not-baptized', missing: [] }}
        onInviteLodge={ok}
        onInviteMaster={ok}
      />,
    );
    const invite = byTestId<HTMLButtonElement>('selection-person-invite-lodge')!;
    expect(invite.getAttribute('aria-disabled')).toBe('true');
    expect(reason(host)).toBe('Stavební huť pozve jen pokřtěný rod.');
    await act(async () => invite.click());
    expect(byTestId('lodge-dialog')).toBeNull();
    await unmount(host, root);
  });

  it('bez práva rozhodnutí rodu zašedne s důvodem práva', async () => {
    const rights: VillageRightsView = { allowed: ['build'], reason: 'Rozhoduje Bořivoj.' };
    const { host, root } = await mount(
      <RightsProvider value={rights}>
        <LodgeActions lodge={fresh} onInviteLodge={ok} onInviteMaster={ok} />
      </RightsProvider>,
    );
    expect(byTestId('selection-person-invite-lodge')!.getAttribute('aria-disabled')).toBe('true');
    expect(reason(host)).toBe('Rozhoduje Bořivoj.');
    await unmount(host, root);
  });

  it('odmítnutí serveru je u kurzoru', async () => {
    const { host, root } = await mount(
      <LodgeActions
        lodge={fresh}
        onInviteLodge={() => Promise.resolve('Stavební huť už je pozvaná.')}
        onInviteMaster={ok}
      />,
    );
    await act(async () => byTestId<HTMLButtonElement>('selection-person-invite-lodge')!.click());
    await act(async () => all('lodge-circle')[0]!.click());
    expect(reason(host)).toBe('Stavební huť už je pozvaná.');
    await unmount(host, root);
  });

  it('huť na cestě: ikona huti s dny a bez tlačítka pozvání', async () => {
    const { host, root } = await mount(
      <LodgeActions
        lodge={{ invite: 'already', circle: 'adriatic', daysToArrival: 42, missing: [] }}
        onInviteLodge={ok}
        onInviteMaster={ok}
      />,
    );
    expect(byTestId('selection-person-invite-lodge')).toBeNull();
    expect(byTestId('selection-person-lodge')?.dataset.circle).toBe('adriatic');
    expect(byTestId('selection-person-lodge-days')?.textContent).toBe('42');
    expect(byTestId('selection-person-invite-master')).toBeNull();
    await unmount(host, root);
  });

  it('chybějící mistr: tlačítko u každého oboru, klik zavolá server s oborem', async () => {
    const onInviteMaster = vi.fn(ok);
    const { host, root } = await mount(
      <LodgeActions
        lodge={{ invite: 'already', circle: 'carolingian', missing: ['mason', 'plasterer'] }}
        onInviteLodge={ok}
        onInviteMaster={onInviteMaster}
      />,
    );
    const masters = all('selection-person-invite-master');
    expect(masters.map((m) => m.dataset.craft)).toEqual(['mason', 'plasterer']);
    expect(masters[1]!.getAttribute('aria-label')).toBe('Pozvat mistra: Štukatér a malíř');
    await act(async () => masters[0]!.click());
    expect(onInviteMaster).toHaveBeenCalledWith('mason');
    await unmount(host, root);
  });
});

describe('ikony mistra a kněze', () => {
  it('mistr: ikona oboru, kněz: ikona kněze', async () => {
    const { host, root } = await mount(
      <>
        <MasonBadge craft="stonemason" circle="adriatic" />
        <PriestBadge />
      </>,
    );
    const mason = byTestId('selection-person-mason')!;
    expect(mason.dataset.craft).toBe('stonemason');
    expect(mason.querySelector('img')?.getAttribute('src')).toBe(
      '/icons/house/mason-stonemason.png',
    );
    expect(byTestId('selection-person-priest')?.querySelector('img')?.getAttribute('src')).toBe(
      '/icons/house/priest.png',
    );
    await unmount(host, root);
  });
});
