import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SelectionDetails, SelectionWorkshop } from '@/lib/selection-details';
import type { VillageHorses } from '@/lib/horse-view';
import type { BuildOption } from '@/lib/village-view';
import { JourneyBanner, LeaveCompass } from '../RelocationControls';
import { SelectionPanel } from '../SelectionPanel';

// Panel ohrady (oxen.md – Co hráč vidí): zvířata, seno, stáda, spřežení a výcvik. Posvátný dub
// a háj (happiness.md – Co hráč vidí): štěstí a stáří dubu.

const pen = (over: Partial<Extract<SelectionDetails, { kind: 'pen' }>> = {}): SelectionDetails => ({
  kind: 'pen',
  id: 90,
  species: 'cattle',
  squares: 2,
  places: 90,
  animals: 4,
  herdPlaces: { pens: 90, home: 0, needed: 6 },
  extension: null,
  built: true,
  progress: 1,
  oxen: 2,
  oxenVillage: null,
  cows: 4,
  herd: { species: 'cow', count: 4 },
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
      onCancelConstruction={() => Promise.resolve()}
    />,
  );

const text = (html: string, testId: string): string | undefined =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(html)?.[1];

const HORSES: VillageHorses = {
  count: 3,
  kinds: { riding: 2, mares: 1, foals: 0 },
  places: 8,
  wanted: { riding: 3, mares: 2, foals: 1 },
  overRoom: false,
  fed: true,
  grainKgPerDay: 3,
  hayWinterKg: 2718,
  horses: [
    { id: 1, kind: 'riding', ageYears: 8, training: 0.5, stallion: true, penId: 90 },
    { id: 2, kind: 'riding', ageYears: 12, training: 1, stallion: false, penId: 90 },
    { id: 3, kind: 'mare', ageYears: 6, training: 0, stallion: false, penId: 90 },
    { id: 4, kind: 'foal', ageYears: 0, training: 0, stallion: false, penId: 91 },
  ],
};

describe('SelectionPanel – ohrada koní (horses.md – Co hráč vidí)', () => {
  const horsePen = (horses: Partial<VillageHorses> = {}): string =>
    render(
      pen({
        species: 'horse',
        places: 8,
        animals: 3,
        herdPlaces: null,
        herd: null,
        horses: { ...HORSES, ...horses },
      }),
    );

  it('koně / místa, kolik ves chce, obilí a seno na zimu, seznam koní jen z této ohrady', () => {
    const html = horsePen();
    expect(text(html, 'selection-pen-animals')).toBe('3/8');
    expect(text(html, 'selection-horses-need')).toBe('8/6');
    expect(html).not.toContain('data-alert');
    expect(text(html, 'selection-horses-grain')).toBe('3');
    expect(text(html, 'selection-horses-hay')).toBe('2,7 t');
    expect(html).toContain('/icons/resources/horse.png');
    expect(html).toContain('/icons/resources/mare.png');
    // hříbě z jiné ohrady v seznamu není
    expect(html).not.toContain('data-testid="selection-horse-4"');
    expect(text(html, 'selection-horse-1')).toBe('8');
    // výcvik jen pod 12 let (přesýpací hodiny s procenty), hřebec s podkovou
    expect(text(html, 'selection-horse-1-training')).toBe('50 %');
    expect(html).not.toContain('data-testid="selection-horse-2-training"');
    expect(html).toContain('data-testid="selection-horse-1-stallion"');
    expect(html).not.toContain('data-testid="selection-horse-2-stallion"');
  });

  it('červeně: ves chce víc koní, než je míst; koně bez obilí', () => {
    const html = horsePen({ overRoom: true, fed: false, places: 4 });
    expect(html).toMatch(
      /data-testid="selection-horses-need"[^>]*data-alert|data-alert[^>]*selection-horses-need/,
    );
    expect(html).toMatch(
      /data-testid="selection-horses-grain"[^>]*data-alert|data-alert[^>]*selection-horses-grain/,
    );
  });
});

describe('SelectionPanel – ohrada', () => {
  it('hotová ohrada: zvířata svého druhu a místa, čtverce, seno v tunách, stádo jen druhu ohrady', () => {
    const html = render(pen());
    expect(html).toContain('data-kind="pen"');
    // ohrada skotu (oxen.md – Ohrady podle druhu): krávy v ohradě na noc / místa, čtverce
    expect(html).toContain('Ohrada skotu');
    expect(text(html, 'selection-pen-animals')).toBe('4/90');
    expect(text(html, 'selection-pen-squares')).toBe('2/4');
    expect(text(html, 'selection-oxen')).toBeUndefined();
    // ohrada volů ukazuje voly
    const team = render(
      pen({ species: 'team', places: 6, animals: 2, herdPlaces: null, herd: null }),
    );
    expect(team).toContain('Ohrada volů');
    expect(text(team, 'selection-oxen')).toBe('2');
    expect(text(team, 'selection-pen-animals')).toBeUndefined();
    expect(text(html, 'selection-hay')).toBe('3,2 t');
    // jen stádo druhu ohrady (issue #3) – ostatní druhy, slepice, pastva ani mléko ne
    expect(text(html, 'selection-herd-cow')).toBe('4');
    for (const other of ['sheep', 'goat', 'pig', 'chicken']) {
      expect(text(html, `selection-herd-${other}`)).toBeUndefined();
    }
    expect(text(html, 'selection-pasture')).toBeUndefined();
    expect(text(html, 'selection-milk')).toBeUndefined();
    // ohrada ovcí ukáže ovce, ohrada volů žádné stádo
    const sheep = render(pen({ species: 'sheep', herd: { species: 'sheep', count: 9 } }));
    expect(text(sheep, 'selection-herd-sheep')).toBe('9');
    expect(text(sheep, 'selection-herd-cow')).toBeUndefined();
    expect(text(team, 'selection-herd-cow')).toBeUndefined();
  });

  it('ohrada volů: místa / kolik volů ves chce, páry s rádlem a vozy (Martin 20. 10. 2026)', () => {
    const oxenVillage = {
      trained: 2,
      training: 1,
      places: 6,
      wanted: 8,
      overRoom: true,
      ploughPairs: 2,
      teams: 1,
      ards: 1,
      carts: { 'two-wheel': 2, 'four-wheel': 0 },
      cartTargets: { 'two-wheel': 4, 'four-wheel': 0 },
    };
    const html = render(
      pen({ species: 'team', places: 6, animals: 3, oxen: 3, herdPlaces: null, oxenVillage }),
    );
    expect(text(html, 'selection-oxen-need')).toBe('6/8');
    expect(html).toContain('data-testid="selection-oxen-need" data-alert="true"');
    expect(html).toContain('vycvičení 2, ve výcviku 1');
    expect(text(html, 'selection-oxen-ploughs')).toBe('1/2');
    expect(text(html, 'selection-oxen-carts-two-wheel')).toBe('2/4');
    // čtyřkolák ves nemá ani nechce – neukazuje se
    expect(text(html, 'selection-oxen-carts-four-wheel')).toBeUndefined();
    expect(html).toContain('/icons/resources/ard.png');
    const roomy = render(
      pen({
        species: 'team',
        herdPlaces: null,
        oxenVillage: { ...oxenVillage, places: 12, overRoom: false, teams: 2 },
      }),
    );
    expect(roomy).not.toContain('data-alert');
  });

  it('místa všech ohrad druhu / potřeba stáda – červeně, když chybí (Martin 20. 10. 2026)', () => {
    const html = render(pen());
    expect(text(html, 'selection-pen-need')).toBe('90/6');
    expect(html).not.toContain('data-alert');
    const short = render(
      pen({ species: 'sheep', places: 130, herdPlaces: { pens: 130, home: 12, needed: 168 } }),
    );
    expect(text(short, 'selection-pen-need')).toBe('130/168');
    expect(short).toContain('data-alert');
    expect(short).toContain('u domů 12');
    // ohrada spřežení stádo nemá
    expect(text(render(pen({ species: 'team', herdPlaces: null })), 'selection-pen-need')).toBe(
      undefined,
    );
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
    expect(button(html, 'cancel-construction')).toBeDefined();
    expect(html).not.toContain('data-testid="relocate-zemnice"');
  });

  it('rozestavěná stavba s cancelConstructionId má tlačítko jen s ikonou, bez něj ne', () => {
    const site = (cancelConstructionId?: number): SelectionDetails => ({
      kind: 'site',
      id: 12,
      type: 'zemnice',
      craft: null,
      progress: 0.2,
      treesToFell: 0,
      relocates: null,
      ...(cancelConstructionId === undefined ? {} : { cancelConstructionId }),
    });
    const html = render(site(12));
    const cancel = button(html, 'cancel-construction');
    expect(cancel).toBeDefined();
    expect(cancel).toContain('aria-label="Zrušit stavbu"');
    // bez textu na tlačítku – slovo jen v popisku a popisce
    expect(html).not.toMatch(/data-testid="cancel-construction"[^>]*>[^<]*Zrušit/);
    expect(button(render(site()), 'cancel-construction')).toBeUndefined();
    const field = render({
      kind: 'field',
      id: 4,
      areaM2: 2000,
      fertility: 60,
      stages: [],
      surfaces: [],
      crops: [],
      ashParts: 0,
      ashBonus: 0,
      overgrowingM2: 0,
      founding: 0.3,
      cancelConstructionId: 9,
    });
    expect(button(field, 'cancel-construction')).toBeDefined();
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
        { crop: 'flax', count: 1 },
      ],
      ashParts: 0,
      ashBonus: 0,
      overgrowingM2: 0,
      founding: null,
    });
    expect(html).toMatch(/legumes\.png.*data-testid="selection-crop-legume"[^>]*>2</);
    expect(html).toContain('Luštěniny – hrách a čočka');
    // len na plátno (fields.md – Len)
    expect(html).toMatch(/flax\.png.*data-testid="selection-crop-flax"[^>]*>1</);
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
    flax: false,
    bloom: false,
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
    cart: null,
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
    expect(html).not.toContain('data-testid="leave-cart"');
    // s vozem s voly (migration.md – Vůz při odchodu)
    const withCart = renderToStaticMarkup(
      <LeaveCompass leave={{ ...leave, cart: 'four-wheel' }} onLeave={() => undefined} />,
    );
    expect(withCart).toMatch(/data-testid="leave-cart"[^>]*>.*Čtyřkolák/);
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
        leave: { households: [3], people: 4, foodKg: 50, cart: null, directions: [] },
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
  type Iron = NonNullable<NonNullable<SelectionWorkshop['carpenter']>['iron']>;
  const carpenter = (
    activity: 'producing' | 'helping',
    making: { kind: 'two-wheel'; progress: number } | null,
    iron: Iron | null = null,
    skill: SelectionWorkshop['skill'] = { share: 1, years: 5, apprentices: [] },
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
        kilns: [],
        toPlant: 0,
        skill,
        carpenter: {
          carts: [{ id: 1, kind: 'two-wheel', condition: 0.6, away: true }],
          cartTargets: { 'two-wheel': 2, 'four-wheel': 0 },
          making,
          woodworkCoverage: 0.45,
          iron,
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

  it('vůz čeká na kování – tesař mezitím dělá nářadí (wagons.md – Kování vozů)', () => {
    const html = render(
      carpenter('producing', { kind: 'two-wheel', progress: 1 }, { kg: 3, trip: null }),
    );
    expect(html).toContain('Čeká na kování k vozu (3 kg)');
    expect(html).toMatch(/data-testid="selection-workshop-iron"[^>]*data-alert[^>]*>3 kg</);
    // aktivita ukazuje nářadí, ne hotový vůz
    expect(html).not.toContain('Vyrábí vůz');
  });

  it('syn tesaře jde se 6 nosiči pro kování do vsi souseda – dny do návratu', () => {
    const trip = { to: 'Lhota', direction: 'N' as const, daysLeft: 3, son: true, age: 15 };
    const html = render(
      carpenter(
        'producing',
        { kind: 'two-wheel', progress: 1 },
        { kg: 3, trip: { ...trip, porters: 6, cart: null } },
      ),
    );
    expect(html).toContain(
      'Syn tesaře (15 let) jde se 6 nosiči (nesou obilí na platbu) pro kování k vozu do vsi Lhota (sever)',
    );
    expect(html).toContain('zpět za 3 dny');
    expect(html).toMatch(/data-testid="selection-workshop-iron"[^>]*>[^<]*3 d</);
  });

  it('s volným vozem jede tesař s vozem a sedlákem', () => {
    const html = render(
      carpenter(
        'producing',
        { kind: 'two-wheel', progress: 1 },
        {
          kg: 3,
          trip: {
            to: 'Lhota',
            direction: 'N',
            daysLeft: 2,
            son: false,
            age: 30,
            porters: 0,
            cart: 'two-wheel',
          },
        },
      ),
    );
    expect(html).toContain('Tesař jede s vozem a sedlákem (dvoukolák veze obilí na platbu)');
    expect(html).toContain('/icons/resources/cart.png');
  });

  it('nový tesař – zkušenost v % červeně, syn, který se učí', () => {
    const html = render(
      carpenter('producing', null, null, {
        share: 0.55,
        years: 0.5,
        apprentices: [{ age: 11, years: 1.4 }],
      }),
    );
    expect(html).toContain('/icons/resources/skill.png');
    expect(html).toMatch(/data-testid="selection-workshop-skill"[^>]*data-alert[^>]*>55 %</);
    expect(html).toContain('tesař se teprve učí (praxe 0,5 roku z 5 let)');
    expect(html).toMatch(/data-testid="selection-workshop-apprentices"[^>]*>11</);
    expect(html).toContain('Řemeslu se učí syn (věk) – 11 let, praxe 1,4 roku');
  });

  it('vyučený tesař – 100 % bez učňů', () => {
    const html = render(carpenter('producing', null));
    expect(html).toMatch(/data-testid="selection-workshop-skill"[^>]*>100 %</);
    expect(html).not.toContain('selection-workshop-apprentices');
  });
});

describe('SelectionPanel – hrnčíř a hlína (crafts.md – Hlína hrnčíře)', () => {
  const potter = (
    activity: 'digging' | 'no-clay',
    clay: { site: { walkM: number; leftKg: number } | null; cart: boolean },
  ): SelectionDetails =>
    dwelling({
      type: 'polozemnice',
      workshop: {
        craft: 'potter',
        activity,
        laborPerDay: 1.6,
        outputPerDayKg: 1.6,
        stockKg: 46,
        coverage: 0.9,
        kiln: null,
        kilns: [],
        toPlant: 0,
        skill: { share: 1, years: 5, apprentices: [] },
        carpenter: null,
        clay: { stockKg: 18, heapKg: 0, ...clay },
      },
    });

  it('zásoba hlíny, cesta na hliniště a vůz se sedlákem; bez hlíny stojí', () => {
    const html = render(potter('digging', { site: { walkM: 420, leftKg: 19_350 }, cart: true }));
    expect(html).toMatch(/data-testid="selection-workshop-clay"[^>]*>18</);
    expect(html).toMatch(/data-testid="selection-workshop-clay-site"[^>]*>420 m</);
    expect(html).toContain('selection-workshop-clay-cart');
    expect(html).toContain('Kope hlínu na hliništi');
    const none = render(potter('no-clay', { site: null, cart: false }));
    expect(none).toContain('Nemá hlínu');
    expect(none).not.toContain('selection-workshop-clay-site');
    expect(none).not.toContain('selection-workshop-clay-cart');
  });
});

describe('SelectionPanel – kovárna (crafts.md – Uhlí a ruda kováře)', () => {
  const smith = (
    activity: 'producing' | 'digging',
    ore: { sons: number[]; cart: boolean },
  ): SelectionDetails =>
    dwelling({
      type: 'polozemnice',
      workshop: {
        craft: 'smith',
        activity,
        laborPerDay: 1.7,
        outputPerDayKg: 0.17,
        stockKg: 42,
        coverage: 0.6,
        kiln: null,
        kilns: [],
        toPlant: 0,
        skill: { share: 1, years: 5, apprentices: [] },
        carpenter: null,
        ore: { stockKg: 18, site: { walkM: 423, leftKg: 2200 }, heapKg: 0, ...ore },
      },
    });

  it('zásoba rudy, cesta na rudiště a kdo nosí uhlí – syn, kovář, vůz', () => {
    const son = render(smith('producing', { sons: [11], cart: false }));
    expect(son).toMatch(/data-testid="selection-workshop-ore"[^>]*>18</);
    expect(son).toMatch(/data-testid="selection-workshop-ore-site"[^>]*>423 m</);
    expect(son).toContain('/icons/resources/ore.png');
    expect(son).toMatch(/data-testid="selection-workshop-carrier"[^>]*>11</);
    expect(son).toContain('/icons/resources/child.png');
    const alone = render(smith('producing', { sons: [], cart: false }));
    expect(alone).toContain('/icons/resources/man.png');
    const cart = render(smith('digging', { sons: [11], cart: true }));
    expect(cart).toContain('/icons/resources/cart.png');
    expect(cart).toContain('data-activity="digging"');
    expect(cart).toContain('Kope rudu');
  });

  it('řetěz kovárny – houba, hřivny, vybavení domácností a měchař (production-chains.md)', () => {
    const iron = (bellows: NonNullable<SelectionWorkshop['iron']>['bellows']): SelectionDetails =>
      dwelling({
        type: 'polozemnice',
        workshop: {
          craft: 'smith',
          activity: 'smelting',
          laborPerDay: 1.7,
          outputPerDayKg: 0.17,
          stockKg: 42,
          coverage: null,
          kiln: null,
          kilns: [],
          toPlant: 0,
          skill: { share: 1, years: 5, apprentices: [] },
          carpenter: null,
          iron: {
            bloomKg: 3.2,
            barsKg: 42,
            barsTargetKg: 25.9,
            equipmentKg: 61,
            needKg: 72,
            coverage: 0.85,
            bellows,
          },
        },
      });
    const son = render(iron({ personId: 41, age: 11, sex: 'male', kind: 'son' }));
    expect(son).toContain('data-activity="smelting"');
    expect(son).toContain('Taví železnou houbu');
    expect(son).toMatch(/data-testid="selection-workshop-bloom"[^>]*>3,2</);
    expect(son).toMatch(/data-testid="selection-workshop-equipment"[^>]*>61</);
    expect(son).toContain('pokrytí potřeby 85');
    expect(son).toMatch(/data-testid="selection-workshop-bellows"[^>]*>11</);
    expect(son).toContain('/icons/resources/iron-bars.png');
    const alone = render(iron(null));
    expect(alone).toContain('polovičním tempem');
  });
});

describe('SelectionPanel – nákup u sousedů (crafts.md)', () => {
  it('dvorec ukáže, kde ves bere výrobky, a nákup na cestě – jen ikony', () => {
    const html = render(
      dwelling({
        buying: {
          sources: [
            { product: 'toolsKg', own: false, direction: 'N', days: 6, trail: true },
            { product: 'potteryKg', own: true, direction: null, days: null, trail: false },
            { product: 'woodToolsKg', own: false, direction: null, days: null, trail: false },
          ],
          purchases: [
            {
              direction: 'N',
              get: { toolsKg: 9 },
              payKg: 520,
              group: 3,
              daysLeft: 4,
              progress: 0.5,
            },
          ],
        },
      }),
    );
    expect(html).toMatch(/data-testid="selection-buying-toolsKg"[^>]*>↑</);
    expect(html).toMatch(/data-testid="selection-buying-potteryKg"[^>]*>✓</);
    expect(html).toMatch(/data-testid="selection-buying-trip"[^>]*>↑ 4</);
    expect(html).toContain('/icons/resources/wood-tools.png');
  });
});

describe('SelectionPanel – rudiště (crafts.md – Uhlí a ruda kováře)', () => {
  const ore = (
    over: Partial<Extract<SelectionDetails, { kind: 'ore-site' }>> = {},
  ): SelectionDetails => ({
    kind: 'ore-site',
    workshopId: 12,
    leftKg: 2140,
    depositKg: 3000,
    heapKg: 35,
    stockKg: 96,
    walkM: 1186,
    pits: 5,
    workers: [
      { age: 41, craftsman: true, digs: true, carries: true, rides: false },
      { age: 15, craftsman: false, digs: true, carries: false, rides: false },
    ],
    cart: false,
    ...over,
  });

  it('portrét Rudiště, ložisko zbývá / celkem, hromada, jámy, kovárna, cesta a zásoba v ní', () => {
    const html = render(ore());
    expect(html).toContain('data-kind="ore-site"');
    expect(html).toContain('src="/icons/build/rudiste.png"');
    expect(html).toContain('>Rudiště</h2>');
    expect(text(html, 'selection-ore-deposit')).toBe('2 140 / 3 000');
    expect(html).not.toMatch(/data-testid="selection-ore-deposit"[^>]*data-alert/);
    expect(text(html, 'selection-ore-heap')).toBe('35');
    expect(text(html, 'selection-ore-pits')).toBe('5');
    expect(html).toMatch(
      /data-testid="selection-ore-workshop"[^>]*><img src="\/icons\/build\/kovar\.png"/,
    );
    expect(text(html, 'selection-ore-walk')).toBe('1 186 m');
    expect(text(html, 'selection-ore-stock')).toBe('96');
  });

  it('kdo tu dnes pracuje: kovář a syn s věkem, co dělají v popisku; vůz se sedlákem', () => {
    const html = render(ore());
    expect(html.match(/data-testid="selection-ore-worker"[^>]*>(\d+)</g)).toHaveLength(2);
    expect(html).toMatch(/man\.png.*data-testid="selection-ore-worker"[^>]*>41</);
    expect(html).toContain('Kovář (věk) dnes kope rudu a nosí ji v koších do kovárny');
    expect(html).toContain('Syn kováře (věk) dnes kope rudu');
    expect(html).not.toContain('selection-ore-cart');
    const cart = render(
      ore({
        workers: [{ age: 41, craftsman: true, digs: false, carries: false, rides: true }],
        cart: true,
      }),
    );
    expect(cart).toContain('Kovář (věk) dnes jede s vozem pro rudu');
    expect(cart).toContain('data-testid="selection-ore-cart"');
  });

  it('dnes tu nikdo nepracuje – řádek chybí; vyčerpané ložisko červeně', () => {
    const html = render(ore({ workers: [], leftKg: 0 }));
    expect(html).not.toContain('selection-ore-today');
    expect(html).toMatch(/data-testid="selection-ore-deposit"[^>]*data-alert/);
  });
});

describe('SelectionPanel – humno (production-chains.md – Humno)', () => {
  it('hotové: portrét Humno, snopy v kg a značka, že se dnes mlátí', () => {
    const html = render({
      kind: 'threshing-floor',
      id: 2609,
      built: true,
      progress: 1,
      sheavesKg: 5200,
      threshingToday: true,
    });
    expect(html).toContain('data-kind="threshing-floor"');
    expect(html).toContain('src="/icons/build/humno.png"');
    expect(html).toContain('>Humno</h2>');
    expect(text(html, 'selection-threshing-sheaves')).toBe('5 200 kg');
    expect(html).toContain('selection-threshing-today');
    expect(html).not.toContain('selection-threshing-progress');
  });

  it('staveniště: průběh stavby, žádné snopy', () => {
    const html = render({
      kind: 'threshing-floor',
      id: 2609,
      built: false,
      progress: 0.4,
      sheavesKg: 0,
      threshingToday: false,
    });
    expect(html).toContain('selection-threshing-progress');
    expect(html).not.toContain('selection-threshing-sheaves');
  });
});

describe('SelectionPanel – obilná jáma (production-chains.md – Obilné jámy)', () => {
  it('portrét Obilná jáma, zrno v jámě v kg, stáří a plnost', () => {
    const html = render({
      kind: 'grain-pit',
      id: 820,
      grainKg: 1264,
      capacityKg: 1500,
      ageYears: 3,
    });
    expect(html).toContain('data-kind="grain-pit"');
    expect(html).toContain('src="/icons/build/obilna-jama.png"');
    expect(html).toContain('>Obilná jáma</h2>');
    expect(text(html, 'selection-grain-pit-kg')).toBe('1 264 kg');
    expect(text(html, 'selection-grain-pit-age')).toBe('3');
    expect(html).toMatch(/data-testid="selection-grain-pit-fill"[^>]*/);
    expect(html).toContain('aria-valuenow="84"');
  });
});

describe('SelectionPanel – milíř (crafts.md – Milíř u skácených buků)', () => {
  const kiln = (
    over: Partial<Extract<SelectionDetails, { kind: 'kiln' }>> = {},
  ): SelectionDetails => ({
    kind: 'kiln',
    id: 800,
    burnerId: 9,
    stage: 'draw',
    progress: 0.62,
    prepared: 15,
    trees: 15,
    charcoalKg: 684,
    yieldKg: 1800,
    burnerWalkM: 96,
    smithWalkM: 1183,
    fetchers: [{ age: 11, smith: false }],
    cart: false,
    burnerHere: true,
    ...over,
  });

  it('portrét Milíř, uhlí v milíři / z celého, uhlíř, cesta ze zemnice a z kovárny', () => {
    const html = render(kiln());
    expect(html).toContain('data-kind="kiln"');
    expect(html).toContain('src="/icons/build/milir.png"');
    expect(html).toContain('>Milíř</h2>');
    expect(text(html, 'selection-kiln-stage')).toBe('684 / 1 800');
    expect(html).toContain('data-testid="selection-kiln-progress"');
    expect(html).toMatch(
      /data-testid="selection-kiln-burner"[^>]*><img src="\/icons\/build\/uhlir\.png"/,
    );
    expect(text(html, 'selection-kiln-walk')).toBe('96 m');
    expect(text(html, 'selection-kiln-smith-walk')).toBe('1 183 m');
  });

  it('kdo sem dnes chodí pro uhlí – syn s věkem, vůz; uhlíř tu pracuje', () => {
    const html = render(kiln());
    expect(html).toMatch(/child\.png.*data-testid="selection-kiln-fetcher"[^>]*>11</);
    expect(html).toContain('Syn kováře (věk) dnes nosí uhlí od milíře do kovárny');
    expect(html).toContain('data-testid="selection-kiln-burner-here"');
    expect(html).not.toContain('selection-kiln-cart');
    const cart = render(kiln({ fetchers: [], cart: true, burnerHere: false }));
    expect(cart).toContain('data-testid="selection-kiln-cart"');
    const nobody = render(kiln({ fetchers: [], burnerHere: false }));
    expect(nobody).not.toContain('selection-kiln-today');
  });

  it('fáze: kácení buků (připravené / všechny), stavba, pálení; milířiště zarůstá', () => {
    expect(text(render(kiln({ stage: 'wood', prepared: 6 })), 'selection-kiln-stage')).toBe('6/15');
    expect(text(render(kiln({ stage: 'build', progress: 0.35 })), 'selection-kiln-stage')).toBe(
      '35 %',
    );
    const remnant = render(kiln({ stage: 'remnant', progress: 0.3, smithWalkM: null }));
    expect(remnant).toContain('>Milířiště</h2>');
    expect(text(remnant, 'selection-kiln-stage')).toBe('30 %');
    expect(remnant).not.toContain('selection-kiln-smith-walk');
  });
});

describe('SelectionPanel – dílna uhlíře a její milíře', () => {
  it('milíře jako tlačítka – fáze a cesta ze zemnice v popisku', async () => {
    const { DEV_PANELS } = await import('@/app/dev/panels/dev-panels');
    const burner = DEV_PANELS.find((p) => p.key === 'uhlir')!.details;
    const html = render(burner);
    expect(html.match(/data-testid="selection-workshop-kiln"/g)).toHaveLength(2);
    expect(html).toMatch(/data-testid="selection-workshop-kiln" data-stage="draw"/);
    expect(html).toMatch(/data-testid="selection-workshop-kiln" data-stage="wood"/);
    expect(html).toContain('src="/icons/build/milir.png"');
    // kácí buky na rozdělaný milíř – připravené / v dávce
    expect(html).toMatch(/data-testid="selection-workshop-activity".*?>6\/15</);
  });
});

describe('SelectionPanel – hliniště (crafts.md – Hlína hrnčíře)', () => {
  const clay: SelectionDetails = {
    kind: 'clay-site',
    workshopId: 14,
    leftKg: 17_460,
    depositKg: 20_000,
    heapKg: 260,
    stockKg: 142,
    walkM: 238,
    pits: 4,
    workers: [
      { age: 38, craftsman: true, digs: false, carries: false, rides: true },
      { age: 16, craftsman: false, digs: true, carries: true, rides: false },
    ],
    cart: true,
  };

  it('portrét Hliniště, hlína v hliništi, hromada, jámy, dílna hrnčíře, cesta a zásoba', () => {
    const html = render(clay);
    expect(html).toContain('data-kind="clay-site"');
    expect(html).toContain('src="/icons/build/hliniste.png"');
    expect(html).toContain('>Hliniště</h2>');
    expect(html).toContain('/icons/resources/clay.png');
    expect(text(html, 'selection-clay-deposit')).toBe('17 460 / 20 000');
    expect(text(html, 'selection-clay-heap')).toBe('260');
    expect(text(html, 'selection-clay-pits')).toBe('4');
    expect(html).toMatch(
      /data-testid="selection-clay-workshop"[^>]*><img src="\/icons\/build\/hrncir\.png"/,
    );
    expect(text(html, 'selection-clay-walk')).toBe('238 m');
    expect(text(html, 'selection-clay-stock')).toBe('142');
    expect(html).toContain('Hrnčíř (věk) dnes jede s vozem pro hlínu');
    expect(html).toContain('Syn hrnčíře (věk) dnes kope hlínu a nosí ji v koších k dílně');
    expect(html).toContain('data-testid="selection-clay-cart"');
    expect(html).not.toContain('selection-ore-');
  });
});

describe('SelectionPanel – postava (villagers.md – Výběr postavy)', () => {
  const person = (
    over: Partial<Extract<SelectionDetails, { kind: 'person' }>> = {},
  ): SelectionDetails => ({
    kind: 'person',
    id: 202,
    portrait: 'woman',
    role: 'Žena rolníka',
    activity: 'jde pro vodu',
    age: 28,
    home: 2,
    homeIcon: 'zemnice',
    herd: null,
    ...over,
  });

  it('portrét podle pohlaví, role, činnost, věk a dům', () => {
    const html = render(person());
    expect(html).toContain('data-kind="person"');
    expect(html).toContain('src="/icons/resources/woman.png"');
    expect(html).toContain('>Žena rolníka</h2>');
    expect(text(html, 'selection-person-activity')).toBe('jde pro vodu');
    expect(text(html, 'selection-person-age')).toBe('28');
    expect(html).toMatch(
      /data-testid="selection-person-home"[^>]*><img src="\/icons\/build\/zemnice\.png"/,
    );
    expect(html).not.toContain('selection-person-herd');
  });

  it('muž rodiny – dovednosti s čísly a jízda jen u toho, kdo má koně', () => {
    const arms = { bow: 64, combat: 51, riding: 38 };
    const html = render(person({ portrait: 'man', role: 'Syn vojvody', arms, horse: true }));
    expect(text(html, 'selection-person-arms-bow')).toBe('64');
    expect(text(html, 'selection-person-arms-combat')).toBe('51');
    expect(text(html, 'selection-person-arms-riding')).toBe('38');
    expect(html).toContain('Lukostřelba 64 / 100');
    const foot = render(person({ arms: { bow: 5, combat: 0, riding: 0 }, horse: false }));
    expect(foot).toContain('selection-person-arms-bow');
    expect(foot).not.toContain('selection-person-arms-riding');
    expect(render(person())).not.toContain('selection-person-arms');
  });

  it('jezdec – kůň pod ním: věk, výcvik do 12 let a obilí (červeně, když chybí)', () => {
    const arms = { bow: 64, combat: 51, riding: 38 };
    const mount = { ageYears: 8, training: 0.5, fed: true, grainKgPerDay: 1.5 };
    const html = render(person({ arms, horse: true, mount }));
    expect(text(html, 'selection-person-mount-age')).toBe('8');
    expect(text(html, 'selection-person-mount-training')).toBe('50 %');
    expect(text(html, 'selection-person-mount-grain')).toBe('1,5');
    expect(html).not.toContain('data-alert');
    const done = render(
      person({ arms, horse: true, mount: { ...mount, training: 1, fed: false } }),
    );
    expect(done).not.toContain('selection-person-mount-training');
    expect(done).toMatch(
      /data-testid="selection-person-mount-grain"[^>]*data-alert|data-alert[^>]*selection-person-mount-grain/,
    );
    expect(render(person({ arms, horse: true }))).not.toContain('selection-person-mount');
  });

  it('pasáček u stáda – ikona zvířete; bez domu ve scéně bez tlačítka', () => {
    const html = render(
      person({
        portrait: 'child',
        role: 'Pasáček',
        activity: 'pase ovce',
        age: 10,
        home: null,
        homeIcon: null,
        herd: 'sheep',
      }),
    );
    expect(html).toContain('src="/icons/resources/child.png"');
    expect(html).toContain('>Pasáček</h2>');
    expect(html).toContain('data-herd="sheep"');
    expect(html).toContain('src="/icons/resources/sheep.png"');
    expect(html).not.toContain('selection-person-home');
  });
});

describe('SelectionPanel – spřežení, vůz a lidé u nich (oxen.md, wagons.md – Výběr)', () => {
  const team = (
    over: Partial<Extract<SelectionDetails, { kind: 'plough-team' }>> = {},
  ): SelectionDetails => ({
    kind: 'plough-team',
    team: 0,
    activity: 'orá díl pole',
    part: { fieldId: 7, cell: { x: 4, y: 2 } },
    oxen: 2,
    pen: 12,
    ploughman: { id: 201, portrait: 'man' },
    leader: { id: 203, portrait: 'child' },
    ...over,
  });
  const cart = (
    over: Partial<Extract<SelectionDetails, { kind: 'cart' }>> = {},
  ): SelectionDetails => ({
    kind: 'cart',
    id: 3,
    cartKind: 'two-wheel',
    activity: 'veze uhlí ke kováři',
    cargo: 'charcoal',
    capacityKg: 400,
    loadKg: null,
    condition: 0.8,
    oxen: 1,
    pen: 12,
    drover: { id: 301, portrait: 'man' },
    ...over,
  });

  it('spřežení: portrét vola, co dělá, voli a tlačítka dílu, ohrady, oráče a honáka', () => {
    const html = render(team());
    expect(html).toContain('data-kind="plough-team"');
    expect(html).toContain('src="/icons/resources/ox.png"');
    expect(html).toContain('>Spřežení</h2>');
    expect(text(html, 'selection-team-activity')).toBe('orá díl pole');
    expect(text(html, 'selection-team-oxen')).toBe('2');
    expect(html).toMatch(
      /data-testid="selection-team-part"[^>]*><img src="\/icons\/build\/pole\.png"/,
    );
    expect(html).toMatch(
      /data-testid="selection-team-pen"[^>]*><img src="\/icons\/build\/ohrada\.png"/,
    );
    expect(html).toMatch(
      /data-testid="selection-team-ploughman"[^>]*><img src="\/icons\/resources\/man\.png"/,
    );
    expect(html).toMatch(
      /data-testid="selection-team-leader"[^>]*><img src="\/icons\/resources\/child\.png"/,
    );
  });

  it('spřežení na cestě do ohrady bez lidí ve scéně – jen voli a ohrada', () => {
    const html = render(
      team({ activity: 'vrací se do ohrady', part: null, ploughman: null, leader: null }),
    );
    expect(text(html, 'selection-team-activity')).toBe('vrací se do ohrady');
    expect(html).not.toContain('selection-team-part');
    expect(html).not.toContain('selection-team-ploughman');
    expect(html).not.toContain('selection-team-leader');
    expect(html).toContain('data-testid="selection-team-pen"');
  });

  it('vůz: druh pod portrétem, co dělá, stav, voli, náklad, ohrada a vozka', () => {
    const html = render(cart());
    expect(html).toContain('data-kind="cart"');
    expect(html).toContain('src="/icons/resources/cart.png"');
    expect(html).toContain('>Dvoukolák</h2>');
    expect(text(html, 'selection-cart-activity')).toBe('veze uhlí ke kováři');
    expect(text(html, 'selection-cart-condition')).toBe('80 %');
    // nosnost bez známého nákladu, s ním „náklad / nosnost“ (wagons.md – Výběr vozu)
    expect(text(html, 'selection-cart-load')).toBe('400');
    expect(text(render(cart({ loadKg: 250 })), 'selection-cart-load')).toBe('250 / 400');
    expect(text(html, 'selection-cart-oxen')).toBe('1');
    expect(html).toMatch(
      /src="\/icons\/resources\/charcoal\.png"[^>]*data-testid="selection-cart-cargo"/,
    );
    expect(html).toContain('data-testid="selection-cart-pen"');
    expect(html).toContain('data-testid="selection-cart-drover"');
  });

  it('vůz u ohrady: bez volů, nákladu a vozky', () => {
    const html = render(
      cart({
        cartKind: 'four-wheel',
        activity: 'stojí u ohrady',
        cargo: null,
        oxen: 0,
        drover: null,
      }),
    );
    expect(html).toContain('>Čtyřkolák</h2>');
    expect(text(html, 'selection-cart-activity')).toBe('stojí u ohrady');
    expect(html).not.toContain('selection-cart-oxen');
    expect(html).not.toContain('selection-cart-cargo');
    expect(html).not.toContain('selection-cart-drover');
  });

  it('oráč a vozka – tlačítko vybere spřežení či vůz; jiný člověk ho nemá', () => {
    const base = {
      kind: 'person' as const,
      id: 201,
      portrait: 'man' as const,
      role: 'Rolník',
      activity: 'orá',
      age: 31,
      home: 2,
      homeIcon: 'zemnice',
      herd: null,
    };
    const ploughman = render({ ...base, draft: { kind: 'plough-team', team: 0 } });
    expect(text(ploughman, 'selection-person-activity')).toBe('orá');
    expect(ploughman).toMatch(
      /data-testid="selection-person-draft"[^>]*><img src="\/icons\/resources\/ox\.png"/,
    );
    const drover = render({ ...base, activity: 'veze seno', draft: { kind: 'cart', id: 3 } });
    expect(drover).toMatch(
      /data-testid="selection-person-draft"[^>]*><img src="\/icons\/resources\/cart\.png"/,
    );
    expect(render({ ...base, draft: null })).not.toContain('selection-person-draft');
  });
});
