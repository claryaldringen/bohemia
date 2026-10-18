import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import type { BuildOption } from '@/lib/village-view';
import { SelectionPanel } from '../SelectionPanel';

// Panel ohrady (oxen.md – Co hráč vidí): zvířata, seno, stáda, spřežení a výcvik. Posvátný dub
// a háj (happiness.md – Co hráč vidí): štěstí a stáří dubu.

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
  milkLPerDay: 0,
  team: null,
  training: null,
  hayKg: 3200,
  trainBlocked: null,
  condition: 1,
  abandoned: false,
  ...over,
});

const render = (details: SelectionDetails): string =>
  renderToStaticMarkup(
    <SelectionPanel
      details={details}
      onTrainTeam={() => Promise.resolve()}
      onRelocate={() => undefined}
      onCancelRelocation={() => Promise.resolve()}
    />,
  );

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
    // mimo dobu dojení se mléko neukazuje
    expect(text(html, 'selection-milk')).toBeUndefined();
    expect(text(render(pen({ milkLPerDay: 14.2 })), 'selection-milk')).toBe('14');
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

  it('zbývající služba spřežení a dny výcviku mají ikonu přesýpacích hodin', () => {
    const html = render(
      pen({ training: { progress: 0.4, daysLeft: 438 }, team: { ageYears: 8, yearsLeft: 2 } }),
    );
    const icons = html.match(/src="\/icons\/resources\/hourglass\.png"/g) ?? [];
    expect(icons).toHaveLength(2);
  });

  it('spřežení slouží dlouho – výcvik náhrady zašedlý s důvodem', () => {
    const html = render(
      pen({ team: { ageYears: 1, yearsLeft: 9 }, trainBlocked: 'Spřežení slouží ještě 9 let.' }),
    );
    expect(trainButton(html)).toContain(' disabled=""');
    expect(text(html, 'train-blocked')).toBe('Spřežení slouží ještě 9 let.');
  });

  it('rozestavěná ohrada jen průběh stavby', () => {
    const html = render(pen({ built: false, progress: 0.45 }));
    expect(html).toContain('aria-valuenow="45"');
    expect(html).not.toContain('selection-oxen');
  });
});

describe('SelectionPanel – posvátný dub a háj', () => {
  it('posvátný dub: štěstí a stáří ikonou s číslem, popisek jen „Stáří (roky)“', () => {
    const html = render({ kind: 'sacred-oak', id: 7, happiness: 5, ageYears: 1203, snag: false });
    expect(html).toContain('>+5<');
    expect(text(html, 'selection-age')).toBe('1 203');
    expect(html).toContain('src="/icons/resources/date.png"');
    expect(html).toContain('Stáří (roky)');
  });

  it('posvátný dub má portrét dubu, souš portrét souše – jinak stejné stáří a štěstí', () => {
    const oak = render({ kind: 'sacred-oak', id: 7, happiness: 5, ageYears: 450, snag: false });
    expect(oak).toContain('src="/icons/build/dub.png"');
    expect(oak).toContain('Posvátný dub');
    const snag = render({ kind: 'sacred-oak', id: 7, happiness: 1, ageYears: 1180, snag: true });
    expect(snag).toContain('src="/icons/build/sous.png"');
    expect(snag).toContain('Posvátná souš');
    expect(snag).not.toContain('dub.png');
    expect(snag).toContain('>+1<');
    expect(text(snag, 'selection-age')).toBe('1 180');
  });

  it('háj: stáří nejstaršího dubu vedle počtu dubů', () => {
    const html = render({ kind: 'grove', id: 8, oaks: 14, happiness: 14, ageYears: 287 });
    expect(text(html, 'selection-grove-oaks')).toBe('14');
    expect(text(html, 'selection-age')).toBe('287');
  });

  it('neznámé stáří se neukáže', () => {
    const html = render({ kind: 'sacred-oak', id: 7, happiness: 5, ageYears: null, snag: false });
    expect(html).not.toContain('selection-age');
    expect(html).not.toContain('Stáří');
  });
});

// Přestěhování domácnosti a výběr víc obydlí (migration.md – Co hráč vidí).
const option = (affordable: boolean, missing = 0): BuildOption => ({
  laborManDays: 60,
  perHa: false,
  perSquare: false,
  upfront: [{ resource: 'wood', amount: 7, missing }],
  blocked: null,
  affordable,
});
const relocate = { zemnice: option(true), polozemnice: option(false, 4) };

const dwelling = (
  over: Partial<Extract<SelectionDetails, { kind: 'dwelling' }>> = {},
): SelectionDetails => ({
  kind: 'dwelling',
  id: 3,
  type: 'zemnice',
  occupants: 4,
  capacity: 6,
  ages: [30, 28, 6, 2],
  condition: 0.9,
  ageYears: 4,
  full: false,
  overcrowded: false,
  rebuild: null,
  workshop: null,
  relocation: null,
  relocate,
  ...over,
});

/** Atributy tlačítka s `data-testid`. */
const button = (html: string, testId: string): string | undefined =>
  new RegExp(`<button([^>]*data-testid="${testId}"[^>]*)>`).exec(html)?.[1];

describe('SelectionPanel – přestěhování domácnosti', () => {
  it('obydlí: Přestěhovat do zemnice jde, do polozemnice chybí dřevo, Odejít zašedlé', () => {
    const html = render(dwelling());
    expect(html).toContain('aria-label="Přestěhovat"');
    expect(button(html, 'relocate-zemnice')).not.toContain('disabled');
    expect(button(html, 'relocate-polozemnice')).toContain('disabled');
    expect(html).toMatch(/data-resource="wood" data-missing="true"/);
    expect(button(html, 'leave-village')).toContain('disabled');
    expect(html).not.toContain('data-testid="selection-relocation"');
  });

  it('domácnost se stěhuje: průběh nového domu a Zrušit, přestěhovat znovu nejde', () => {
    const html = render(
      dwelling({
        relocate: null,
        relocation: { constructionId: 12, type: 'polozemnice', progress: 0.35, treesToFell: 3 },
      }),
    );
    expect(html).toContain('data-testid="selection-relocation"');
    expect(html).toMatch(/aria-label="Stěhování"[^>]*aria-valuenow="35"/);
    expect(button(html, 'cancel-relocation')).toBeDefined();
    expect(html).not.toContain('data-testid="relocate-zemnice"');
  });

  it('staveniště nového domu stěhující se domácnosti jde zrušit, běžné staveniště ne', () => {
    const site = (relocates: number | null): SelectionDetails => ({
      kind: 'site',
      id: 12,
      type: 'zemnice',
      craft: null,
      progress: 0.2,
      treesToFell: 0,
      relocates,
    });
    expect(button(render(site(3)), 'cancel-relocation')).toBeDefined();
    expect(button(render(site(null)), 'cancel-relocation')).toBeUndefined();
  });

  it('víc obydlí: počet domácností a lidí, Přestěhovat pro každou, Odejít zašedlé', () => {
    const html = render({
      kind: 'dwellings',
      ids: [1, 2, 3],
      households: 3,
      people: 14,
      relocatable: [1, 3],
      relocate,
    });
    expect(html).toContain('data-kind="dwellings"');
    expect(html).toContain('Obydlí (3)');
    expect(text(html, 'selection-households')).toBe('3');
    expect(text(html, 'selection-people')).toBe('14');
    expect(button(html, 'relocate-zemnice')).not.toContain('disabled');
    // u víc domácností popisek ukáže, kolikrát se dům staví
    expect(html).toContain('×2');
    expect(button(html, 'leave-village')).toContain('disabled');
  });

  it('víc obydlí, žádné se stěhovat nemůže: Přestěhovat chybí', () => {
    const html = render({
      kind: 'dwellings',
      ids: [1, 2],
      households: 2,
      people: 9,
      relocatable: [],
      relocate: null,
    });
    expect(html).not.toContain('data-testid="relocate-zemnice"');
    expect(button(html, 'leave-village')).toContain('disabled');
  });
});

describe('panel pole – plodiny (fields.md – Luštěniny)', () => {
  it('oseté díly luštěninami mají vlastní ikonu a počet vedle ozimu a jaře', () => {
    const html = render({
      kind: 'field',
      id: 5,
      areaM2: 2250,
      fertility: 70,
      stages: [{ stage: 'sown', count: 6 }],
      surfaces: [],
      crops: [
        { crop: 'winter', count: 3 },
        { crop: 'spring', count: 1 },
        { crop: 'legume', count: 2 },
      ],
      ashParts: 0,
      ashBonus: 0,
      overgrowingM2: 0,
      founding: null,
    });
    expect(html).toMatch(/legumes\.png.*data-testid="selection-crop-legume"[^>]*>2</);
    expect(html).toContain('Luštěniny – hrách a čočka');
    expect(html).toContain('data-testid="selection-crop-winter"');
  });
});
