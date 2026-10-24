import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LINE_NAMES } from '@bohemia/game';
import { LineNamePanel, lineNameLabel, lineNameReason, rollLineName } from '../LineNamePanel';

// Panel jména muže rodu (lord.md – Kde se jméno zadává): popisek, důvod u kurzoru z téže kontroly
// jako na serveru, kostka ze seznamu jmen rodu. Psaní, kostku a Enter v prohlížeči ověřuje e2e.

const panel = (props: Partial<Parameters<typeof LineNamePanel>[0]> = {}): string =>
  renderToStaticMarkup(
    <LineNamePanel
      lord
      portrait="man"
      taken={[]}
      onConfirm={() => Promise.resolve(null)}
      {...props}
    />,
  );

describe('LineNamePanel', () => {
  it('popisek podle toho, koho hráč pojmenovává', () => {
    expect(lineNameLabel(true)).toBe('Jméno vojvody');
    expect(lineNameLabel(false)).toBe('Jméno syna');
    expect(panel()).toContain('aria-label="Jméno vojvody"');
    expect(panel({ lord: false, portrait: 'child' })).toContain('aria-label="Jméno syna"');
  });

  it('důvod u neplatného jména – stejný jako na serveru', () => {
    expect(lineNameReason('Bořivoj', true)).toBeNull();
    expect(lineNameReason('  Mrdomír ', false)).toBeNull();
    expect(lineNameReason('Bořivoj1', true)).toBe('Jen písmena.');
    expect(lineNameReason('', true)).toBe('Vojvoda potřebuje jméno.');
    expect(lineNameReason('', false)).toBe('Syn potřebuje jméno.');
    expect(lineNameReason('ř'.repeat(21), false)).toBe('Nejvýš 20 písmen.');
  });

  it('neplatné jméno – fajfka zašedlá s důvodem v popisku a pole označené', () => {
    const html = panel({ initialName: 'Bořivoj1' });
    expect(html).toMatch(/data-testid="line-name-confirm" disabled=""/);
    expect(html).toContain('Jen písmena.');
    expect(html).toContain('aria-invalid="true"');
    const ok = panel({ initialName: 'Bořivoj' });
    expect(ok).not.toMatch(/data-testid="line-name-confirm" disabled=""/);
    expect(ok).toContain('value="Bořivoj"');
  });

  it('kostka vyplní jméno ze seznamu rodu, přednostně nepoužité', () => {
    const name = rollLineName([], () => 0.42);
    expect(LINE_NAMES).toContain(name);
    expect(lineNameReason(name, true)).toBeNull();
    const taken = LINE_NAMES.filter((n) => n !== 'Bořivoj');
    expect(rollLineName(taken, () => 0.42)).toBe('Bořivoj');
  });
});
