import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import type { BuildOption } from '@/lib/village-view';
import { JourneyBanner, LeaveCompass } from '../RelocationControls';
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
  condition: 1,
  abandoned: false,
  repair: null,
  ...over,
});

const render = (details: SelectionDetails): string =>
  renderToStaticMarkup(
    <SelectionPanel
      details={details}
      onRelocate={() => undefined}
      onCancelRelocation={() => Promise.resolve()}
    />,
  );

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

  it('spřežení se cvičí samo – tlačítko výcviku v panelu není (Martin 19. 10. 2026)', () => {
    expect(render(pen())).not.toContain('Vycvičit spřežení');
    expect(render(pen({ team: { ageYears: 1, yearsLeft: 9 } }))).not.toContain('<button');
  });

  it('výcvik běží – průběh a zbývající dny; spřežení stáří a zbývající roky', () => {
    const html = render(
      pen({ training: { progress: 0.4, daysLeft: 438 }, team: { ageYears: 8, yearsLeft: 2 } }),
    );
    expect(html).toContain('aria-valuenow="40"');
    expect(text(html, 'selection-training-days')).toBe('438');
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

// Panel obydlí (kinship.md – Co hráč vidí): muži, ženy, děti, starší a manželské páry.
describe('SelectionPanel – rodiny v obydlí', () => {
  it('muži, ženy, děti, starší a páry ikonami s čísly', () => {
    const html = render({
      kind: 'dwelling',
      id: 1,
      type: 'polozemnice',
      occupants: 8,
      family: { men: 2, women: 2, boys: 1, girls: 2, elderMen: 0, elderWomen: 1, couples: 2 },
      capacity: 8,
      ages: [52, 30, 27, 24, 22, 9, 6, 2],
      condition: 1,
      ageYears: 3,
      full: true,
      overcrowded: false,
      rebuild: null,
      workshop: null,
      relocation: null,
      relocate: null,
      manor: null,
      leave: null,
    });
    expect(text(html, 'selection-family-man')).toBe('2');
    expect(text(html, 'selection-family-woman')).toBe('2');
    expect(text(html, 'selection-family-child')).toBe('3');
    expect(text(html, 'selection-family-elder')).toBe('1');
    expect(text(html, 'selection-family-ring')).toBe('2');
    expect(html).toContain('/icons/resources/ring.png');
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
  family: { men: 1, women: 1, boys: 1, girls: 1, elderMen: 0, elderWomen: 0, couples: 1 },
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
  manor: null,
  leave: null,
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
      leave: null,
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
      leave: null,
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

describe('SelectionPanel – díl pole a čtverec sadu (klik – fields.md, Co hráč vidí)', () => {
  const part = (
    over: Partial<Extract<SelectionDetails, { kind: 'field-part' }>> = {},
  ): SelectionDetails => ({
    kind: 'field-part',
    id: 5,
    cell: { x: 2, y: 0 },
    look: 'ripe',
    stage: 'sown',
    legume: false,
    ploughed: true,
    areaM2: 225,
    fertility: 48,
    naturalFertility: 64,
    ashBonus: 0,
    surface: 'meadow',
    walkM: 1240,
    holding: { dwellingId: 3, type: 'polozemnice' },
    sownYears: 1,
    fallowYears: null,
    overgrowthYears: 0,
    grazed: null,
    crop: { crop: 'winter', prep: { task: 'plough', share: 1 }, sow: 1, harvest: 0.4 },
    mow: null,
    founding: null,
    ...over,
  });

  it('osetý díl: název podle vzhledu, výměra, úrodnost, cesta, dům, letošní práce', () => {
    const html = render(part());
    expect(html).toContain('data-kind="field-part"');
    expect(html).toContain('/icons/build/pole.png');
    expect(html).toContain('>Zralé obilí</h2>');
    expect(text(html, 'selection-area')).toBe('225 m²');
    expect(text(html, 'selection-fertility')).toBe('48');
    expect(html).toContain('Úrodnost – přirozená 64');
    expect(text(html, 'selection-walk')).toBe('1 240 m');
    expect(html).toMatch(
      /data-testid="selection-holding"[^>]*><img src="\/icons\/build\/polozemnice\.png"/,
    );
    // příprava půdy orbou (vůl), setí s ikonou plodiny, sklizeň
    expect(html).toMatch(/ox\.png.*data-testid="selection-prep"[^>]*>100 %</);
    expect(html).toContain('Orba rádlem');
    expect(html).toMatch(/ozim\.png.*data-testid="selection-sow-winter"[^>]*>100 %</);
    expect(html).toMatch(/harvest\.png.*data-testid="selection-harvest"[^>]*>40 %</);
    expect(text(html, 'selection-sown-years')).toBe('2.');
    // příloh ani zakládání se neukazují
    expect(html).not.toContain('selection-fallow-years');
    expect(html).not.toContain('selection-progress');
  });

  it('příloh: roky ladem, zarůstání, pastva a seč; bez hospodářství bez domu', () => {
    const html = render(
      part({
        look: 'meadow',
        stage: 'meadow',
        holding: null,
        sownYears: null,
        fallowYears: 6,
        overgrowthYears: 2,
        grazed: true,
        crop: null,
        mow: 0.25,
      }),
    );
    expect(html).toContain('>Louka na seno</h2>');
    expect(text(html, 'selection-fallow-years')).toBe('6');
    expect(text(html, 'selection-overgrowth')).toBe('2');
    expect(html).toContain('data-testid="selection-grazed"');
    expect(text(html, 'selection-mow')).toBe('25 %');
    expect(html).not.toContain('selection-holding');
    expect(html).not.toContain('selection-sow-');
  });

  it('zakládaný díl v lese: průběh, zbývající práce, stromy na klády a povrch', () => {
    const html = render(
      part({
        look: 'bare',
        stage: 'founding',
        surface: 'forest',
        sownYears: null,
        crop: null,
        founding: { progress: 0.3, laborLeft: 4.25, trees: 3 },
      }),
    );
    expect(html).toContain('>Zakládá se</h2>');
    expect(html).toContain('aria-valuenow="30"');
    expect(text(html, 'selection-labor-left')).toBe('4,3');
    expect(text(html, 'selection-trees')).toBe('3');
    expect(html).toContain('data-surface="forest"');
  });

  it('čtverec sadu: stáří, úroda čtverce, cesta; obnova čeká, výsadba s průběhem', () => {
    const square = (
      over: Partial<Extract<SelectionDetails, { kind: 'orchard-square' }>> = {},
    ): SelectionDetails => ({
      kind: 'orchard-square',
      id: 60,
      cell: { x: 0, y: 4 },
      areaM2: 225,
      ageYears: 53,
      expectedYieldKg: 40,
      planting: null,
      plantingWaits: false,
      renewal: true,
      walkM: 40,
      ...over,
    });
    const old = render(square());
    expect(old).toContain('data-kind="orchard-square"');
    expect(old).toContain('/icons/build/sad.png');
    expect(old).toContain('>Staré jabloně</h2>');
    expect(text(old, 'selection-age')).toBe('53');
    expect(text(old, 'selection-yield')).toBe('40');
    expect(old).toContain('data-testid="selection-renewal"');
    const planting = render(
      square({ ageYears: null, expectedYieldKg: 0, planting: 0.5, plantingWaits: true }),
    );
    expect(planting).toContain('>Obnova jabloní</h2>');
    expect(planting).toContain('aria-valuenow="50"');
    expect(planting).toContain('data-testid="selection-planting-waits"');
    expect(planting).not.toContain('selection-age');
  });
});

describe('SelectionPanel – opuštěné stavby (abandonment.md)', () => {
  const sacred = (
    over: Partial<Extract<SelectionDetails, { kind: 'sacred' }>> = {},
  ): SelectionDetails => ({
    kind: 'sacred',
    id: 40,
    type: 'idol',
    happiness: 8,
    building: null,
    oaksToFell: 0,
    condition: 1,
    abandoned: false,
    repair: null,
    ...over,
  });

  it('hotová modla: stav ikonou s procenty, opuštěná navíc ikona „Opuštěno“', () => {
    const visited = render(sacred());
    expect(visited).toContain('/icons/resources/condition.png');
    expect(visited).toMatch(/data-testid="selection-wear"[^>]*>(<span[^>]*>)?100 %/);
    expect(visited).not.toContain('selection-abandoned');
    const left = render(sacred({ condition: 0.38, abandoned: true }));
    expect(left).toContain('/icons/resources/abandoned.png');
    expect(left).toContain('data-testid="selection-abandoned"');
    // nízký stav červeně
    expect(left).toMatch(/text-red-400[^>]*>38 %/);
  });

  it('rozestavěná modla stav neukazuje; ohrada a hřbitov ano', () => {
    expect(render(sacred({ building: 0.4 }))).not.toContain('selection-wear');
    const penHtml = render(pen({ condition: 0.6, abandoned: true }));
    expect(penHtml).toContain('data-testid="selection-wear"');
    expect(penHtml).toContain('data-testid="selection-abandoned"');
    const cemetery: SelectionDetails = {
      kind: 'cemetery',
      id: 30,
      squares: 1,
      capacity: 56,
      graves: 20,
      usedPlaces: 26,
      freePlaces: 30,
      yearsLeft: 9,
      built: true,
      building: null,
      condition: 0,
      abandoned: false,
      repair: null,
    };
    const html = render(cemetery);
    expect(html).toContain('Plot – stav');
    // místa na hroby – mohyly významných zabírají víc míst (cemetery.md)
    expect(html).toMatch(/data-testid="selection-graves"[^>]*>26\/56</);
    expect(html).toContain('pohřbených 20');
    expect(html).toMatch(/text-red-400[^>]*>0 %/);
    expect(html).not.toContain('selection-repair');
  });

  it('oprava (abandonment.md – Oprava): průběh jako stavba u modly, ohrady i plotu hřbitova', () => {
    const idol = render(sacred({ condition: 0.62, repair: 0.4 }));
    expect(idol).toContain('data-testid="selection-repair"');
    expect(idol).toContain('aria-valuenow="40"');
    expect(idol).toContain('Oprava 40 %');
    expect(idol).not.toContain('selection-abandoned');
    expect(render(sacred())).not.toContain('selection-repair');
    expect(render(pen({ condition: 0.8, repair: 0.5 }))).toContain(
      'data-testid="selection-repair"',
    );
    const fence = render({
      kind: 'cemetery',
      id: 30,
      squares: 2,
      capacity: 112,
      graves: 20,
      usedPlaces: 20,
      freePlaces: 92,
      yearsLeft: 9,
      built: true,
      building: null,
      condition: 0.25,
      abandoned: false,
      repair: 0.25,
    });
    expect(fence).toContain('Oprava plotu 25 %');
  });
});

// Odchod do nové vsi (migration.md – fáze 3 a 4): tlačítko Odejít a růžice odchodu.
describe('SelectionPanel – odchod do nové vsi', () => {
  const leave = {
    households: [3],
    people: 4,
    foodKg: 50,
    directions: [
      { direction: 'N' as const, days: 2, blocked: null },
      { direction: 'E' as const, days: 1, blocked: 'Tím směrem leží tvoje ves Budeč.' },
    ],
  };

  it('domácnost může odejít – Odejít je aktivní (růžice se otevře klikem)', () => {
    const html = render(dwelling({ leave }));
    expect(button(html, 'leave-village')).toBeDefined();
    expect(button(html, 'leave-village')).not.toContain(' disabled=""');
    expect(html).not.toContain('data-testid="leave-compass"');
  });

  it('růžice: na téže mapě a na novou mapu, tam, kde leží vlastní ves, zašedlé s důvodem', () => {
    const html = renderToStaticMarkup(<LeaveCompass leave={leave} onLeave={() => undefined} />);
    expect(button(html, 'leave-here')).not.toContain(' disabled=""');
    expect(button(html, 'leave-N')).not.toContain(' disabled=""');
    expect(button(html, 'leave-E')).toContain(' disabled=""');
    expect(html).toContain('Tím směrem leží tvoje ves Budeč.');
    // v popisku lidé, jídlo s sebou a dny cesty
    expect(html).toMatch(/Odejít na sever – nová mapa.*>4<.*50 kg.*2 dny/);
    // směry bez údaje (jen hotové v pohledu) se nekreslí
    expect(html).not.toContain('data-testid="leave-W"');
  });

  it('řádek lidí na cestě – kam a kdy dorazí, po příjezdu výzva k zemnici', () => {
    const travelling = renderToStaticMarkup(
      <JourneyBanner journey={{ direction: 'S', arrivalDay: 10, arrived: false, daysLeft: 2 }} />,
    );
    expect(travelling).toContain('Lidé jsou na cestě na jih – dorazí za 2 dny');
    const arrived = renderToStaticMarkup(
      <JourneyBanner journey={{ direction: 'S', arrivalDay: 10, arrived: true, daysLeft: 0 }} />,
    );
    expect(arrived).toContain('data-arrived="true"');
    expect(arrived).toContain('umísti první zemnici');
  });
});

// Rozvržení panelu (Martin 19. 10. 2026 – „panely s hodně informacemi musí být větší, text se
// nesmí zalamovat ani být nahňácaný“): panel roste s obsahem do mezí `hud-selection`, text se
// nezalamuje, příkazy jsou vpravo za čarou a rozbalené nabídky nad panelem.
describe('SelectionPanel – rozvržení', () => {
  /** Atributy panelu výběru. */
  const section = (html: string): string =>
    /<section([^>]*data-testid="selection-panel"[^>]*)>/.exec(html)?.[1] ?? '';
  const classes = (attrs: string): string[] => /class="([^"]*)"/.exec(attrs)?.[1]?.split(' ') ?? [];

  it('panel roste s obsahem do mezí hud-selection a text v něm se nezalamuje', () => {
    const panel = classes(section(render(pen())));
    expect(panel).toEqual(
      expect.arrayContaining(['hud-selection', 'w-max', 'min-w-[20rem]', 'whitespace-nowrap']),
    );
    // žádná pevná šířka jako dřív (22rem)
    expect(panel.some((c) => /^w-\[/.test(c))).toBe(false);
  });

  it('popisky v panelu se zalomit smí – delší důvod, proč akce nejde', () => {
    const html = render(pen());
    const tooltip = /<span role="tooltip" class="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(tooltip.split(' ')).toContain('whitespace-normal');
  });

  it('dlouhý název pod portrétem zůstane na jednom řádku', () => {
    const html = render(
      dwelling({ type: 'dvorec', manor: { dwellingId: 3, trails: [], neighbours: [] } }),
    );
    expect(html).toMatch(/<h2 class="[^"]*whitespace-nowrap[^"]*">Dvorec vojvody<\/h2>/);
  });

  it('obydlí: údaje vlevo, příkazy (dvorec, přestěhovat, odejít) vpravo za čarou', () => {
    const html = render(
      dwelling({
        type: 'dvorec',
        manor: { dwellingId: 3, trails: [], neighbours: [] },
        leave: { households: [3], people: 4, foodKg: 50, directions: [] },
      }),
    );
    const commands = html.indexOf('data-testid="selection-commands"');
    expect(commands).toBeGreaterThan(-1);
    expect(html).toContain('class="hud-commands"');
    // údaje před příkazy, tlačítka v nich
    expect(html.indexOf('selection-occupants')).toBeLessThan(commands);
    expect(html.indexOf('selection-ages')).toBeLessThan(commands);
    for (const id of ['manor-upgrades', 'relocate-zemnice', 'leave-village']) {
      expect(html.indexOf(`data-testid="${id}"`)).toBeGreaterThan(commands);
    }
    expect(html).toContain('class="hud-split"');
  });

  it('obydlí bez příkazů (nejde přestěhovat ani odejít) sloupec příkazů nemá', () => {
    const html = render(dwelling({ relocate: null, leave: null }));
    expect(html).not.toContain('selection-commands');
  });

  it('věk obyvatel nejvýš po 8 v řádku – další řádek pod nimi', () => {
    const html = render(dwelling({ ages: [63, 41, 38, 35, 33, 29, 26, 14, 11, 8, 5, 1] }));
    const list = /<ul data-testid="selection-ages"[^>]*class="([^"]*)"/.exec(html)?.[1] ?? '';
    // 8 × 1,75rem + 7 mezer po 0,25rem
    expect(list.split(' ')).toEqual(expect.arrayContaining(['flex-wrap', 'max-w-[15.75rem]']));
  });

  it('víc obydlí: počty vlevo, přestěhovat a odejít vpravo', () => {
    const html = render({
      kind: 'dwellings',
      ids: [1, 2],
      households: 2,
      people: 9,
      relocatable: [1],
      relocate,
      leave: null,
    });
    const commands = html.indexOf('data-testid="selection-commands"');
    expect(html.indexOf('selection-people')).toBeLessThan(commands);
    expect(html.indexOf('data-testid="leave-village"')).toBeGreaterThan(commands);
  });

  it('řádky ikon s čísly se při nedostatku místa zalomí po celých položkách', () => {
    const html = render({
      kind: 'field',
      id: 5,
      areaM2: 312_500,
      fertility: 64,
      stages: [{ stage: 'sown', count: 418 }],
      surfaces: [],
      crops: [{ crop: 'winter', count: 204 }],
      ashParts: 0,
      ashBonus: 0,
      overgrowingM2: 13_050,
      founding: null,
    });
    // řádek s výměrou je flex-wrap; položka (ikona + číslo) se sama nezalomí ani nezúží
    expect(html).toMatch(/<div class="flex flex-wrap items-center gap-x-3 gap-y-1">/);
    expect(html).toMatch(/class="flex shrink-0 items-center gap-1 whitespace-nowrap"/);
  });
});

describe('SelectionPanel – dílna tesaře (wagons.md – Tesař)', () => {
  const carpenter = (
    activity: 'producing' | 'helping',
    making: { kind: 'two-wheel'; progress: number } | null,
  ): SelectionDetails =>
    dwelling({
      type: 'polozemnice',
      workshop: {
        craft: 'carpenter',
        activity,
        laborPerDay: 1.6,
        outputPerDayKg: 3.2,
        stockKg: 46,
        coverage: 0.72,
        kiln: null,
        toPlant: 0,
        carpenter: {
          carts: [{ id: 1, kind: 'two-wheel', condition: 0.6, away: true }],
          cartTargets: { 'two-wheel': 2, 'four-wheel': 0 },
          making,
          woodworkCoverage: 0.45,
        },
      },
    });

  it('vyrábí vůz – průběh, vozy proti potřebě, dřevěné nářadí a pokrytí staveb', () => {
    const html = render(carpenter('producing', { kind: 'two-wheel', progress: 0.35 }));
    expect(html).toContain('/icons/build/tesar.png');
    expect(html).toMatch(/data-testid="selection-workshop-activity"[^>]*>[^<]*<span[^>]*>35/);
    expect(html).toMatch(/data-testid="selection-workshop-carts-two-wheel"[^>]*>1\/2</);
    expect(html).not.toContain('selection-workshop-carts-four-wheel');
    expect(html).toMatch(/data-testid="selection-workshop-woodwork"[^>]*>45/);
    expect(html).toMatch(/data-testid="selection-workshop-stock"[^>]*>46</);
  });

  it('pomáhá se stavbami – pokrytí dřevěné práce', () => {
    const html = render(carpenter('helping', null));
    expect(html).toContain('data-activity="helping"');
    expect(html).toContain('Pomáhá se stavbami');
  });
});
