import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TimeSkip } from '@bohemia/game';
import { DevTimeButtons } from '../TopBar';

/** Tlačítka přeskočení času: popisek, zamčené a čekající (statický render bez DOMu). */
function buttons(pending: TimeSkip | null): { label: string; disabled: boolean; busy: boolean }[] {
  const html = renderToStaticMarkup(<DevTimeButtons pending={pending} onSkip={() => {}} />);
  return [...html.matchAll(/<button([^>]*)>/g)].map((m) => ({
    label: /aria-label="([^"]*)"/.exec(m[1]!)?.[1] ?? '',
    disabled: / disabled=""/.test(m[1]!),
    busy: /aria-busy="true"/.test(m[1]!),
  }));
}

describe('DevTimeButtons', () => {
  it('nabízí přeskočení o měsíc a o rok', () => {
    expect(buttons(null)).toEqual([
      { label: '+1 měsíc', disabled: false, busy: false },
      { label: '+1 rok', disabled: false, busy: false },
    ]);
  });

  it('dokud server přeskočení nedokončí, obě tlačítka čekají', () => {
    expect(buttons('year')).toEqual([
      { label: '+1 měsíc', disabled: true, busy: false },
      { label: '+1 rok', disabled: true, busy: true },
    ]);
  });
});
