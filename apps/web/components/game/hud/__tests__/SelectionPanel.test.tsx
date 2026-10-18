import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import { SelectionPanel } from '../SelectionPanel';

// Panel ohrady (oxen.md – Co hráč vidí): zvířata, seno, stáda, spřežení a výcvik.

const pen = (over: Partial<Extract<SelectionDetails, { kind: 'pen' }>> = {}): SelectionDetails => ({
  kind: 'pen',
  id: 90,
  built: true,
  progress: 1,
  oxen: 2,
  cows: 4,
  herds: { sheep: 9, goat: 3, pig: 7, cow: 4 },
  chickens: 6,
  pastureHa: 41.5,
  grazingHa: 8.4,
  team: null,
  training: null,
  hayKg: 3200,
  trainBlocked: null,
  ...over,
});

const render = (details: SelectionDetails): string =>
  renderToStaticMarkup(<SelectionPanel details={details} onTrainTeam={() => Promise.resolve()} />);

/** Atributy tlačítka výcviku. */
const trainButton = (html: string): string | undefined =>
  /<button([^>]*data-testid="train-team"[^>]*)>/.exec(html)?.[1];

const text = (html: string, testId: string): string | undefined =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(html)?.[1];

describe('SelectionPanel – ohrada', () => {
  it('hotová ohrada: voli, krávy, seno v tunách, stáda vsi a pastva', () => {
    const html = render(pen());
    expect(html).toContain('data-kind="pen"');
    expect(text(html, 'selection-oxen')).toBe('2');
    expect(text(html, 'selection-penned-cows')).toBe('4');
    expect(text(html, 'selection-hay')).toBe('3,2 t');
    expect(text(html, 'selection-herd-sheep')).toBe('9');
    expect(text(html, 'selection-herd-chicken')).toBe('6');
    expect(text(html, 'selection-pasture')).toBe('8,4/41,5 ha');
  });

  it('výcvik jde – tlačítko „Vycvičit spřežení“ je aktivní', () => {
    const html = render(pen());
    expect(trainButton(html)).toBeDefined();
    expect(trainButton(html)).not.toContain(' disabled=""');
  });

  it('výcvik nejde – tlačítko zašedlé, důvod červeně', () => {
    const html = render(
      pen({ trainBlocked: 'Na výcvik chybí telata – stádo potřebuje aspoň 3 krávy.' }),
    );
    expect(trainButton(html)).toContain(' disabled=""');
    expect(text(html, 'train-blocked')).toBe(
      'Na výcvik chybí telata – stádo potřebuje aspoň 3 krávy.',
    );
  });

  it('výcvik běží – průběh a zbývající dny, bez tlačítka; spřežení stáří a zbývající roky', () => {
    const html = render(
      pen({ training: { progress: 0.4, daysLeft: 438 }, team: { ageYears: 8, yearsLeft: 2 } }),
    );
    expect(html).toContain('aria-valuenow="40"');
    expect(text(html, 'selection-training-days')).toBe('438');
    expect(html).not.toContain('data-testid="train-team"');
    expect(text(html, 'selection-team-age')).toBe('8');
    expect(text(html, 'selection-team-left')).toBe('2');
  });

  it('rozestavěná ohrada jen průběh stavby', () => {
    const html = render(pen({ built: false, progress: 0.45 }));
    expect(html).toContain('aria-valuenow="45"');
    expect(html).not.toContain('selection-oxen');
  });
});
