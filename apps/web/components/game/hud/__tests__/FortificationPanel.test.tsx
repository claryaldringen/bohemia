import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import { CursorReason } from '../CursorReason';
import { SelectionPanel } from '../SelectionPanel';

// Panel opevnění (fortifications.md – Rozhraní): celé opevnění s údaji a vylepšeními (dvojklik),
// úsek mezi branami s délkou, díly a zbořením (demolition.md – Opevnění), brána se stavem dílu
// a cestou.

type Fort = Extract<SelectionDetails, { kind: 'fortification' }>;
type Section = Extract<SelectionDetails, { kind: 'fortification-section' }>;
type Gate = Extract<SelectionDetails, { kind: 'fortification-gate' }>;

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
  sections: [],
  gateViews: [],
  ...over,
});

/** Úsek s dílem 3 (brána na dílu 0) a jeho zboření. */
const section = (
  demolish: Partial<Section['section']['demolish']> = {},
  over: Partial<Omit<Section, 'kind' | 'section'>> = {},
): Section => ({
  kind: 'fortification-section',
  id: 7,
  fortKind: 'fence',
  section: {
    segments: [0, 1, 2, 3, 4],
    gateSegment: 0,
    lengthM: 71,
    parts: 6,
    builtParts: 6,
    weakest: 0.8,
    oldParts: 1,
    ageYears: 12,
    demolish: { work: 'demolish', cost: { laborManDays: 16, logs: 6 }, blocked: null, ...demolish },
  },
  ...over,
});

const render = (details: Fort | Section | Gate, extra: { gateFort?: number } = {}): string =>
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
  // násobek obrany zrušen 8. 11. 2026 – panel ho už neukazuje (dřív „… a násobek“ s 1,25)
  it('ukáže délku, stav, brány a útočiště jen ikonami s čísly, násobek ne', () => {
    const html = render(fort());
    expect(html).toMatch(/data-testid="selection-fort-length"[^>]*>238 m</);
    expect(html).toMatch(/data-testid="selection-fort-state"[^>]*>.*100 %/);
    expect(html).toMatch(/data-testid="selection-fort-gates"[^>]*>2</);
    expect(html).toMatch(/data-testid="selection-fort-refuge-people"[^>]*>336</);
    expect(html).toMatch(/data-testid="selection-fort-refuge-cattle"[^>]*>168</);
    expect(html).not.toContain('selection-fort-multiplier');
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

  it('celé opevnění Zbořit nemá – boří se po úsecích', () => {
    expect(button(render(fort()), 'fort-demolish')).toBeUndefined();
  });

  it('úsek: délka úseku, díly, stav nejslabšího dílu a stáří – ne parametry celé hradby', () => {
    const html = render(section());
    expect(html).toMatch(/data-testid="selection-fort-section-length"[^>]*>71 m</);
    expect(html).toMatch(/data-testid="selection-fort-section-parts"[^>]*>6</);
    expect(html).toMatch(/data-testid="selection-fort-section-state"[^>]*>.*80 %/);
    expect(html).toContain('data-old="true"');
    expect(html).toMatch(/data-testid="selection-fort-section-age"[^>]*>12</);
    expect(html).not.toContain('selection-fort-length');
    expect(html).not.toContain('selection-fort-gates');
    expect(html).not.toContain('selection-fort-refuge-people');
    expect(button(html, 'fort-upgrade')).toBeUndefined();
    expect(html).toContain('Polský plot – úsek');
  });

  it('Zbořit úsek – práce a klády zpět v popisku', () => {
    const html = render(section());
    expect(button(html, 'fort-demolish')).toBeDefined();
    expect(button(html, 'fort-demolish')).not.toContain('disabled=""');
    expect(html).toContain('aria-label="Zbořit úsek"');
    expect(html).toMatch(/data-testid="fort-demolish-logs"[^>]*>.*\+6</);
  });

  it('úsek jen s bránou – Zbořit zašedlé s důvodem', () => {
    const reason = 'V úseku stojí jen brána – brány zůstávají.';
    const html = render(section({ blocked: reason }));
    expect(button(html, 'fort-demolish')).toContain('disabled=""');
    expect(html).toContain(
      `data-testid="fort-blocked" class="font-semibold text-red-400">${reason}<`,
    );
    expect(html).not.toContain('data-testid="fort-demolish-logs"');
  });

  it('val: napřed zbořit nástavbu, pak srovnat val; bourání průběhem', () => {
    const top = render(section({}, { fortKind: 'rampart' }));
    expect(top).toContain('aria-label="Zbořit nástavbu úseku"');
    const level = render(
      section(
        { work: 'level', cost: { laborManDays: 30, logs: 0 } },
        { fortKind: 'rampart', progress: 0.5, work: 'level' },
      ),
    );
    expect(level).toContain('aria-label="Srovnat val úseku"');
    expect(level).toContain('aria-label="Bourání"');
  });

  it('brána: druh podle opevnění, stav a stáří dílu, cesta branou', () => {
    const gate: Gate = {
      kind: 'fortification-gate',
      id: 7,
      fortKind: 'palisade',
      gate: { segment: 2, state: 0.7, old: true, ageYears: 30 },
      road: { id: 40, segment: 41, roadKind: 'improved' },
    };
    const html = render(gate);
    expect(html).toContain('Brána palisády');
    expect(html).toMatch(/data-testid="selection-fort-gate-state"[^>]*>.*70 %/);
    expect(html).toMatch(/data-testid="selection-fort-gate-age"[^>]*>30</);
    expect(html).toContain('data-testid="selection-fort-gate-road"');
    expect(html).toContain('Upravená cesta');
    expect(button(html, 'fort-demolish')).toBeUndefined();
    const lonely = render({ ...gate, road: null, gate: { ...gate.gate, ageYears: null } });
    expect(lonely).not.toContain('selection-fort-gate-road');
    expect(lonely).not.toContain('selection-fort-gate-age');
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
