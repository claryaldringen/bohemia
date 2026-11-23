// @vitest-environment jsdom
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DefenseStance } from '@bohemia/game';
import type { VillageManor } from '@/lib/manor-view';
import { ManorUpgrades } from '../ManorPanel';

// Volba postoje vsi ve dvorci (war.md – Obránci – postoje a útěk): dvě ikony, zvolená svítí.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const manor = (stance: DefenseStance): VillageManor => ({
  dwellingId: 1,
  market: { stock: {}, homeCarts: [], oxenHome: 0, adults: 0, day: 0, trips: [] },
  stance,
  huntDenied: null,
});

async function mount(stance: DefenseStance, onSetStance: (s: DefenseStance) => Promise<null>) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ManorUpgrades manor={manor(stance)} onSetStance={onSetStance} />);
  });
  return { host, root };
}

const pick = (host: HTMLElement, stance: DefenseStance): HTMLButtonElement =>
  host.querySelector<HTMLButtonElement>(`[data-testid="stance-${stance}"]`)!;

describe('postoj vsi ve dvorci', () => {
  it('zvolený postoj je stisknutý; klik na jiný pošle volbu, na zvolený nic', async () => {
    const onSetStance = vi.fn(() => Promise.resolve(null));
    const { host, root } = await mount('flee', onSetStance);
    expect(pick(host, 'flee').getAttribute('aria-pressed')).toBe('true');
    expect(pick(host, 'defend').getAttribute('aria-pressed')).toBe('false');
    await act(async () => pick(host, 'flee').click());
    expect(onSetStance).not.toHaveBeenCalled();
    await act(async () => pick(host, 'defend').click());
    expect(onSetStance).toHaveBeenCalledWith('defend');
    expect(host.querySelector('[data-testid="stance-surrender"]')).toBeNull();
    await act(async () => root.unmount());
    host.remove();
  });

  it('bez obsluhy jsou ikony zašedlé', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<ManorUpgrades manor={manor('defend')} />);
    });
    expect(pick(host, 'flee').disabled).toBe(true);
    expect(pick(host, 'defend').getAttribute('aria-pressed')).toBe('true');
    await act(async () => root.unmount());
    host.remove();
  });
});
