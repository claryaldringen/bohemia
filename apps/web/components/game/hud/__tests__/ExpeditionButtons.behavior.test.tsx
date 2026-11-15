// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpeditionCommand } from '@bohemia/game';
import {
  expeditionButtons,
  expeditionPersonState,
  type ExpeditionPersonState,
} from '@/lib/expedition-buttons';
import type { ScenePerson } from '@/lib/person-view';
import { ExpeditionButtons } from '../ExpeditionButtons';

// Osedlat, Sesednout a Domů v panelu vybraných (expeditions.md – Co hráč vidí): kdy se ukážou,
// kdy zašednou a s jakým důvodem, klik pošle příkaz.

const person = (o: Partial<ExpeditionPersonState> = {}): ExpeditionPersonState => ({
  personId: 1,
  rider: true,
  mounted: false,
  horse: null,
  inParty: false,
  atHomeMap: true,
  horseWork: false,
  ...o,
});

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
});

async function mount(
  people: ExpeditionPersonState[],
  command: (c: ExpeditionCommand) => void = vi.fn(),
): Promise<void> {
  await act(async () => {
    root.render(<ExpeditionButtons people={people} command={command} />);
  });
}

const q = (id: string): HTMLButtonElement | null => host.querySelector(`[data-testid="${id}"]`);
const tip = (id: string): string =>
  q(id)?.parentElement?.querySelector('[role="tooltip"]')?.textContent ?? '';

describe('expeditionButtons', () => {
  it('vojvoda doma bez koně u sebe – Osedlat povolené', () => {
    expect(expeditionButtons([person()]).saddle).toBe('enabled');
  });

  it('vojvoda na cizí mapě s koněm v ohradě – Osedlat zašedlé „Kůň je doma.“', () => {
    const away = person({ inParty: true, atHomeMap: false });
    expect(expeditionButtons([away]).saddle).toEqual({ disabled: 'Kůň je doma.' });
    // kůň vedle něj (vedený) – osedlat jde
    expect(expeditionButtons([{ ...away, horse: 'led' }]).saddle).toBe('enabled');
  });

  it('skupina právě sedlá – Osedlat zašedlé', () => {
    expect(expeditionButtons([person({ inParty: true, horseWork: true })]).saddle).toEqual({
      disabled: 'Skupina právě sedlá.',
    });
  });

  it('vesničan – Osedlat i Sesednout skryté', () => {
    const villager = person({ rider: false });
    expect(expeditionButtons([villager])).toEqual({
      saddle: 'hidden',
      dismount: 'hidden',
      home: 'hidden',
    });
  });

  it('jezdec na koni – Sesednout, Osedlat skryté; ve skupině Domů', () => {
    const states = expeditionButtons([person({ mounted: true, horse: 'ridden', inParty: true })]);
    expect(states).toEqual({ saddle: 'hidden', dismount: 'enabled', home: 'enabled' });
  });
});

describe('ExpeditionButtons', () => {
  it('ikony bez slov, název a důvod v popisku, klik pošle příkaz', async () => {
    const command = vi.fn();
    await mount([person()], command);
    expect(q('expedition-saddle')?.textContent).toBe('');
    expect(q('expedition-saddle')?.getAttribute('aria-label')).toBe('Osedlat');
    expect(q('expedition-dismount')).toBeNull();
    expect(q('expedition-home')).toBeNull();
    act(() => q('expedition-saddle')?.click());
    expect(command).toHaveBeenCalledWith(
      { kind: 'saddle' },
      expect.objectContaining({ x: 0, y: 0 }),
    );
  });

  it('ve skupině Domů pošle rozkaz domů, Sesednout dismount', async () => {
    const command = vi.fn();
    await mount([person({ mounted: true, horse: 'ridden', inParty: true })], command);
    act(() => q('expedition-home')?.click());
    expect(command).toHaveBeenLastCalledWith(
      { kind: 'order', order: { kind: 'home' } },
      expect.anything(),
    );
    act(() => q('expedition-dismount')?.click());
    expect(command).toHaveBeenLastCalledWith({ kind: 'dismount' }, expect.anything());
  });

  it('zašedlé Osedlat nese důvod a klik nic neposílá', async () => {
    const command = vi.fn();
    await mount([person({ inParty: true, atHomeMap: false })], command);
    expect(q('expedition-saddle')?.disabled).toBe(true);
    expect(tip('expedition-saddle')).toContain('Kůň je doma.');
    act(() => q('expedition-saddle')?.click());
    expect(command).not.toHaveBeenCalled();
  });

  it('nikdo nic nemůže – nic se nevykreslí', async () => {
    await mount([person({ rider: false })]);
    expect(q('expedition-buttons')).toBeNull();
  });
});

describe('expeditionPersonState', () => {
  const villager: ScenePerson = {
    id: 7,
    age: 30,
    sex: 'male',
    home: 1,
    role: 'smith',
    expedition: { strength: 1, rider: true },
  };

  it('doma: jezdec bez skupiny – Osedlat ano, Domů ne', () => {
    expect(expeditionPersonState(villager, 7, [], null)).toMatchObject({
      rider: true,
      inParty: false,
    });
  });

  it('ves ho má ještě pryč, ale ve skupině není (hlouček došel domů) – tlačítka nemá', () => {
    const back: ScenePerson = {
      ...villager,
      expedition: { strength: 1, rider: true, inParty: true },
    };
    expect(expeditionPersonState(back, 7, [], null)).toBeNull();
  });
});
