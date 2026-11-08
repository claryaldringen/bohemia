import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import { CursorReason } from '../CursorReason';
import { SelectionPanel } from '../SelectionPanel';

// Panel opevnění (fortifications.md – Rozhraní): údaje, vylepšení, brána a zboření úseku
// (demolition.md – Opevnění).

type Fort = Extract<SelectionDetails, { kind: 'fortification' }>;

const COST = { laborManDays: 63, logs: 56 };

const fort = (over: Partial<Omit<Fort, 'kind'>> = {}): Fort => ({
  kind: 'fortification',
  id: 7,
  fortKind: 'fence',
  lengthM: 238,
  weakest: 1,
  oldSegments: 0,
  builtSegments: 16,
  segments: 16,
  gates: 2,
  refugePeople: 336,
  refugeCattle: 168,
  multiplier: 1.25,
  sections: [],
  segment: 3,
  section: null,
  ...over,
});

/** Úsek s dílem 3 (brána na dílu 0) a jeho zboření. */
const section = (
  demolish: Partial<NonNullable<Fort['section']>['demolish']> = {},
): Fort['section'] => ({
  segments: [0, 1, 2, 3, 4],
  gateSegment: 0,
  demolish: { work: 'demolish', cost: { laborManDays: 16, logs: 6 }, blocked: null, ...demolish },
});

const render = (details: Fort, extra: { gateFort?: number } = {}): string =>
  renderToStaticMarkup(
    <SelectionPanel
      details={details}
      onFortWork={() => Promise.resolve()}
      onFortDemolish={() => Promise.resolve()}
      onGateMode={() => undefined}
      {...extra}
    />,
  );

const button = (html: string, id: string): string | undefined =>
  new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`).exec(html)?.[0];

describe('SelectionPanel – opevnění', () => {
  it('ukáže délku, stav, brány, útočiště a násobek jen ikonami s čísly', () => {
    const html = render(fort());
    expect(html).toMatch(/data-testid="selection-fort-length"[^>]*>238 m</);
    expect(html).toMatch(/data-testid="selection-fort-state"[^>]*>.*100 %/);
    expect(html).toMatch(/data-testid="selection-fort-gates"[^>]*>2</);
    expect(html).toMatch(/data-testid="selection-fort-refuge-people"[^>]*>336</);
    expect(html).toMatch(/data-testid="selection-fort-refuge-cattle"[^>]*>168</);
    expect(html).toMatch(/data-testid="selection-fort-multiplier"[^>]*>1,25</);
    expect(html).not.toContain('data-old');
  });

  it('plot nabízí vylepšení na palisádu, ne nástavbu na val', () => {
    const html = render(fort({ upgrade: { cost: COST, blocked: null } }));
    expect(button(html, 'fort-upgrade')).toBeDefined();
    expect(button(html, 'fort-upgrade')).not.toContain('disabled=""');
    expect(html).toContain('aria-label="Vylepšit na palisádu"');
    expect(button(html, 'fort-top-fence')).toBeUndefined();
  });

  it('val nabízí nástavbu plotu a palisády', () => {
    const html = render(
      fort({
        fortKind: 'rampart',
        multiplier: 1.5,
        tops: [
          { top: 'fence', option: { cost: COST, blocked: null } },
          { top: 'palisade', option: { cost: COST, blocked: null } },
        ],
      }),
    );
    expect(html).toContain('aria-label="Postavit na valu plot"');
    expect(html).toContain('aria-label="Postavit na valu palisádu"');
    expect(button(html, 'fort-upgrade')).toBeUndefined();
  });

  it('bez dřeva je vylepšení zašedlé s důvodem „Chybí 120 klád.“', () => {
    const html = render(fort({ upgrade: { cost: COST, blocked: 'Chybí 120 klád.' } }));
    expect(button(html, 'fort-upgrade')).toContain('disabled=""');
    expect(html).toMatch(/data-testid="fort-blocked"[^>]*>Chybí 120 klád\.</);
  });

  it('úseky za životností oranžově, stavba průběhem a brána tlačítkem', () => {
    const html = render(fort({ weakest: 0.6, oldSegments: 3, progress: 0.4, work: 'rebuild' }), {
      gateFort: 7,
    });
    expect(html).toMatch(/data-old="true"[^>]*>60 %/);
    expect(html).toContain('data-testid="selection-fort-progress"');
    expect(button(html, 'fort-gate')).toContain('aria-pressed="true"');
  });

  it('Zbořit úsek – práce a klády zpět v popisku; bez úseku tlačítko není', () => {
    const html = render(fort({ section: section() }));
    expect(button(html, 'fort-demolish')).toBeDefined();
    expect(button(html, 'fort-demolish')).not.toContain('disabled=""');
    expect(html).toContain('aria-label="Zbořit úsek"');
    expect(html).toMatch(/data-testid="fort-demolish-logs"[^>]*>.*\+6</);
    expect(button(render(fort()), 'fort-demolish')).toBeUndefined();
  });

  it('úsek jen s bránou – Zbořit zašedlé s důvodem', () => {
    const reason = 'V úseku stojí jen brána – brány zůstávají.';
    const html = render(fort({ section: section({ blocked: reason }) }));
    expect(button(html, 'fort-demolish')).toContain('disabled=""');
    expect(html).toContain(
      `data-testid="fort-blocked" class="font-semibold text-red-400">${reason}<`,
    );
    expect(html).not.toContain('data-testid="fort-demolish-logs"');
  });

  it('val: napřed zbořit nástavbu, pak srovnat val; bourání průběhem', () => {
    const top = render(fort({ fortKind: 'rampart', section: section() }));
    expect(top).toContain('aria-label="Zbořit nástavbu úseku"');
    const level = render(
      fort({
        fortKind: 'rampart',
        section: section({ work: 'level', cost: { laborManDays: 30, logs: 0 } }),
        progress: 0.5,
        work: 'level',
      }),
    );
    expect(level).toContain('aria-label="Srovnat val úseku"');
    expect(level).toContain('aria-label="Bourání"');
  });
});

describe('CursorReason – opevnění', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('u kurzoru práce, klády a útočiště; neprošlé umístění červený důvod', () => {
    // bublina u kurzoru zná velikost okna – test běží bez prohlížeče
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800 });
    const html = renderToStaticMarkup(
      <CursorReason
        preview={{
          check: { ok: true, reason: null },
          label: '',
          screen: { x: 100, y: 100 },
          cost: { laborManDays: 144, trees: 0, logs: 126, refuge: 336 },
        }}
      />,
    );
    expect(html).toMatch(/data-cost="labor"[^>]*>.*144/);
    expect(html).toMatch(/data-cost="logs"[^>]*>.*126/);
    expect(html).toMatch(/data-cost="refuge"[^>]*>.*336/);
    const bad = renderToStaticMarkup(
      <CursorReason
        preview={{
          check: { ok: false, reason: 'Chybí 40 klád.' },
          label: '',
          screen: { x: 100, y: 100 },
        }}
      />,
    );
    expect(bad).toMatch(/data-tone="error"[^>]*>Chybí 40 klád\./);
  });
});
