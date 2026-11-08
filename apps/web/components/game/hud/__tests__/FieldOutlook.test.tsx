import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import type { FieldOutlookView, PartOutlookView } from '@/lib/village-view-types';
import { SelectionPanel } from '../SelectionPanel';

// Očekávaná úroda a jestli práce stačí (fields.md – Co hráč vidí; návrh Clauda): panel dílu a pole
// ukazují úrodu ikonou snopů s číslem (kg), z čeho je a varování v popisku u kurzoru.

const render = (details: SelectionDetails): string =>
  renderToStaticMarkup(
    <SelectionPanel
      details={details}
      onRelocate={() => undefined}
      onCancelConstruction={() => Promise.resolve()}
    />,
  );

const text = (html: string, testId: string): string | undefined =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(html)?.[1];

const part = (outlook: PartOutlookView | undefined): SelectionDetails => ({
  kind: 'field-part',
  id: 5,
  cell: { x: 2, y: 0 },
  partId: 105,
  abandoned: false,
  abandonBlock: null,
  look: 'green',
  stage: 'sown',
  legume: false,
  flax: false,
  bloom: false,
  ploughed: false,
  areaM2: 225,
  fertility: 70,
  naturalFertility: 70,
  ashBonus: 0,
  surface: 'meadow',
  walkM: 120,
  holding: null,
  sownYears: 0,
  fallowYears: null,
  overgrowthYears: 0,
  grazed: null,
  crop: { crop: 'spring', prep: { task: 'dig', share: 1 }, sow: 0.4, harvest: 0 },
  mow: null,
  next: null,
  rest: null,
  surplus: false,
  founding: null,
  ...(outlook ? { outlook } : {}),
});

const field = (outlook: FieldOutlookView | undefined): SelectionDetails => ({
  kind: 'field',
  id: 5,
  areaM2: 2250,
  fertility: 70,
  stages: [{ stage: 'sown', count: 6 }],
  surfaces: [],
  crops: [
    { crop: 'winter', count: 3 },
    { crop: 'flax', count: 1 },
  ],
  turn: [],
  resting: 0,
  ashParts: 0,
  ashBonus: 0,
  overgrowingM2: 0,
  founding: null,
  ...(outlook ? { outlook } : {}),
});

describe('panel dílu – očekávaná úroda', () => {
  it('ikona snopů s kg, v popisku úroda z úrodnosti a co ji mění', () => {
    const html = render(
      part({ crop: 'spring', kg: 1234, fullKg: 1800, weather: 20, wildlife: 5, work: -10 }),
    );
    expect(html).toMatch(/sheaves\.png.*data-testid="selection-outlook"[^>]*>1 234</);
    expect(html).toContain(
      'Očekávaná úroda – jař (kg): z úrodnosti 1 800; počasí −20 %; zvěř −5 %; nedodělaná práce +10 %',
    );
    // práce stačí – varování chybí
    expect(html).not.toContain('selection-work-short');
  });

  it('práce nestačí: ikona práce s chybějícími člověkodny červeně, okna v popisku', () => {
    const html = render(
      part({
        crop: 'spring',
        kg: 900,
        fullKg: 900,
        short: [
          { steps: ['prep', 'sow'], endMonth: 4, manDays: 40, ploughManDays: 3 },
          { steps: ['harvest'], endMonth: 8, manDays: 12 },
        ],
      }),
    );
    expect(text(html, 'selection-work-short')).toBe('−43');
    expect(html).toMatch(/data-testid="selection-work-short" data-alert="true"/);
    expect(html).toContain(
      'Práce nestačí: příprava a setí do konce dubna – chybí 40 člověkodnů, orba 3 člověkodny; sklizeň do konce srpna – chybí 12 člověkodnů',
    );
  });

  it('díl bez výhledu (sklizený, mimo osev) úrodu neukazuje', () => {
    expect(render(part(undefined))).not.toContain('selection-outlook');
  });
});

describe('panel pole – očekávaná úroda', () => {
  it('součet jídla z pole, len zvlášť v popisku; varování z oken', () => {
    const html = render(
      field({
        crops: [
          { crop: 'winter', kg: 2000 },
          { crop: 'legume', kg: 300 },
          { crop: 'flax', kg: 25 },
        ],
        short: [{ steps: ['harvest'], endMonth: 7, manDays: 8 }],
      }),
    );
    expect(text(html, 'selection-outlook')).toBe('2 300');
    expect(html).toContain('Očekávaná úroda pole (kg): ozim 2 000, luštěniny 300; len 25 třeného');
    expect(text(html, 'selection-work-short')).toBe('−8');
    expect(html).toContain('Práce nestačí: sklizeň do konce července – chybí 8 člověkodnů');
  });

  it('pole bez osevu výhled nemá', () => {
    expect(render(field(undefined))).not.toContain('selection-outlook');
  });
});
