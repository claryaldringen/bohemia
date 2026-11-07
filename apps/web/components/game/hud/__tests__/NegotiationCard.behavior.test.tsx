// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NegotiationView } from '@/lib/negotiation-view';
import { NegotiationCard } from '../NegotiationCard';
import { TermsForm } from '../TermsForm';

// Karta jednání a formulář podmínek: tlačítka podle role, protinávrh se vzkazem, mez vzkazu.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const view = (myTurn: boolean, newcomer = false): NegotiationView => ({
  id: 'n-1',
  other: {
    houseId: 'h-b',
    icon: 'man',
    lordName: 'Ctibor',
    men: 2,
    distance: 3,
    language: 'cs',
    label: 'Ctibor – 2 muži',
  },
  myTurn,
  rows: [
    {
      kind: 'oath',
      item: { kind: 'oath', lord: 'h-a', vassal: 'h-b' },
      label: 'Ctibor se stane tvým vazalem',
    },
  ],
  message: 'Pojď pod můj prapor',
  rounds: 1,
  newcomer,
  label: 'Ctibor – čeká na tvou odpověď',
});

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

const click = (testId: string): void => {
  const el = host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`chybí ${testId}`);
  act(() => el.click());
};
const has = (testId: string): boolean => host.querySelector(`[data-testid="${testId}"]`) !== null;

describe('NegotiationCard', () => {
  it('na tahu: přijmout, odmítnout, protinávrh; vzkaz je vidět', () => {
    const onReply = vi.fn();
    act(() =>
      root.render(
        <NegotiationCard
          negotiation={view(true)}
          portrait={<i />}
          busy={false}
          onReply={onReply}
        />,
      ),
    );
    expect(has('negotiation-withdraw')).toBe(false);
    expect(host.textContent).toContain('Pojď pod můj prapor');
    click('negotiation-accept');
    expect(onReply).toHaveBeenLastCalledWith('n-1', { answer: 'accept' });
    click('negotiation-reject');
    expect(onReply).toHaveBeenLastCalledWith('n-1', { answer: 'reject' });
  });

  it('žádost nováčka: jen Přijmout a Odmítnout, bez protinávrhu', () => {
    const onReply = vi.fn();
    act(() =>
      root.render(
        <NegotiationCard
          negotiation={view(true, true)}
          portrait={<i />}
          busy={false}
          onReply={onReply}
        />,
      ),
    );
    expect(has('negotiation-counter')).toBe(false);
    expect(has('negotiation-accept')).toBe(false);
    click('newcomer-accept');
    expect(onReply).toHaveBeenLastCalledWith('n-1', { answer: 'accept' });
    click('newcomer-reject');
    expect(onReply).toHaveBeenLastCalledWith('n-1', { answer: 'reject' });
  });

  it('protinávrh otevře formulář a pošle podmínky se vzkazem', () => {
    const onReply = vi.fn();
    act(() =>
      root.render(
        <NegotiationCard
          negotiation={view(true)}
          portrait={<i />}
          busy={false}
          onReply={onReply}
        />,
      ),
    );
    click('negotiation-counter');
    const area = host.querySelector<HTMLTextAreaElement>('[data-testid="terms-message"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(area, 'Radši jinak');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click('terms-submit');
    expect(onReply).toHaveBeenCalledWith('n-1', {
      answer: 'counter',
      items: [{ kind: 'oath', lord: 'h-a', vassal: 'h-b' }],
      message: 'Radši jinak',
    });
    expect(has('terms-form')).toBe(false);
  });

  it('autor posledního kola smí jen stáhnout', () => {
    const onReply = vi.fn();
    act(() =>
      root.render(
        <NegotiationCard
          negotiation={view(false)}
          portrait={<i />}
          busy={false}
          onReply={onReply}
        />,
      ),
    );
    expect(has('negotiation-accept')).toBe(false);
    click('negotiation-withdraw');
    expect(onReply).toHaveBeenCalledWith('n-1', { answer: 'withdraw' });
  });
});

describe('TermsForm', () => {
  it('prázdný vzkaz se pošle jako null, Zrušit formulář zavře', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    act(() =>
      root.render(
        <TermsForm
          rows={view(true).rows}
          submitLabel="Nabídnout vazalství"
          submitIcon="seal"
          busy={false}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />,
      ),
    );
    click('terms-submit');
    expect(onSubmit).toHaveBeenCalledWith([{ kind: 'oath', lord: 'h-a', vassal: 'h-b' }], null);
    click('terms-cancel');
    expect(onCancel).toHaveBeenCalled();
  });
});
