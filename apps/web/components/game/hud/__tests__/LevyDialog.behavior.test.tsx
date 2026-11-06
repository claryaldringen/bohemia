// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LevyDialogView } from '@bohemia/game';
import { emptyBundle, withBundleValue } from '@/lib/terms-view';
import { LevyDialog, redistribute, splitTotal } from '../LevyDialog';

// Dialog Odvody: posuvník mění číslo a přerozdělí ves, součet hlídaný, Odeslat pošle lines i split.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const grain = (n: number) => withBundleValue(emptyBundle(), 'grainKg', n);
const DIALOG: LevyDialogView = {
  dialogId: 'd-1',
  kind: 'levy',
  vassalageId: 'va-1',
  lordHouseId: 'h-l',
  lordName: 'Boleslav',
  years: 1,
  agreed: grain(150),
  villages: [
    { villageId: 'v-a', name: 'Dub', suggested: grain(100) },
    { villageId: 'v-b', name: 'Lípa', suggested: grain(50) },
  ],
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

const el = <T extends HTMLElement>(testId: string): T => {
  const found = host.querySelector<T>(`[data-testid="${testId}"]`);
  if (!found) throw new Error(`chybí ${testId}`);
  return found;
};
/** React sleduje hodnotu přes nativní setter – bez něj by `change` nic nezměnil. */
const setValue = (input: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

type Answer = (
  input: AnswerInput,
) => Promise<{ ok: true; arrivesDay: number | null } | { error: string }>;
type AnswerInput = Parameters<Parameters<typeof LevyDialog>[0]['onAnswer']>[0];

const render = (onAnswer: Answer = async () => ({ ok: true, arrivesDay: 40 })) => {
  const spy = vi.fn(onAnswer);
  act(() => root.render(<LevyDialog dialogs={[DIALOG]} onAnswer={spy} onClose={() => {}} />));
  return spy;
};

describe('LevyDialog', () => {
  it('předvyplní domluvené číslo podle návrhu a posuvník přerozdělí vsi se zachovaným součtem', () => {
    render();
    expect(el('levy-d-1-total-grainKg').textContent).toContain('150');
    setValue(el<HTMLInputElement>('levy-d-1-slider-grainKg'), '90');
    expect(el('levy-d-1-total-grainKg').textContent).toContain('90');
    const a = Number(el<HTMLInputElement>('levy-d-1-grainKg-v-a').value);
    const b = Number(el<HTMLInputElement>('levy-d-1-grainKg-v-b').value);
    expect(a + b).toBe(90);
    expect(a).toBe(60);
  });

  it('úprava vsi změní součet u posuvníku', () => {
    render();
    setValue(el<HTMLInputElement>('levy-d-1-grainKg-v-b'), '10');
    expect(el('levy-d-1-total-grainKg').textContent).toContain('110');
  });

  it('Odeslat pošle řádky a rozdělení se stejným součtem, vzkaz a ukáže den příjezdu', async () => {
    const onAnswer = render();
    setValue(el<HTMLInputElement>('levy-d-1-slider-grainKg'), '100');
    const message = el<HTMLTextAreaElement>('levy-d-1-message');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(message, 'Špatná úroda');
      message.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => el('levy-d-1-send').click());
    expect(onAnswer).toHaveBeenCalledTimes(1);
    const call = onAnswer.mock.calls[0]![0];
    expect(call.dialogId).toBe('d-1');
    expect(call.lines).toEqual([{ good: 'grainKg', amount: 100 }]);
    expect(call.message).toBe('Špatná úroda');
    expect(call.split['v-a']!.grainKg + call.split['v-b']!.grainKg).toBe(100);
    expect(host.querySelector('[data-testid="levy-d-1-sent"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="levy-d-1-send"]')).toBeNull();
  });

  it('chybu serveru ukáže a dialog nechá otevřený', async () => {
    render(async () => ({ error: 'Nemáš dost obilí.' }));
    await act(async () => el('levy-d-1-send').click());
    expect(el('levy-d-1-error').textContent).toBe('Nemáš dost obilí.');
    expect(host.querySelector('[data-testid="levy-d-1-send"]')).not.toBeNull();
  });
});

describe('redistribute', () => {
  it('celá čísla, součet vždy sedí, nulové díly padnou na návrh', () => {
    const suggested = { a: grain(1), b: grain(1), c: grain(1) };
    const zero = { a: grain(0), b: grain(0), c: grain(0) };
    const out = redistribute(zero, suggested, 'grainKg', 10);
    expect(splitTotal(out, 'grainKg')).toBe(10);
    for (const bundle of Object.values(out)) {
      expect(Number.isInteger(bundle.grainKg)).toBe(true);
    }
  });
});
