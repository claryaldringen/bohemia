import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VillageView } from '@/lib/village-view';
import {
  FieldCapacityTooltip,
  LaborTooltip,
  SatiationTooltip,
  cartsLabel,
  fieldCapacityShort,
  dairyName,
  satiationState,
  sheavesName,
  showsDairy,
  showsHay,
  showsLegumes,
  showsWoodTools,
} from '../TopBar';

// Horní lišta (diet.md, oxen.md): barva nasycení podle energie, podíly stravy v tooltipu, seno,
// luštěniny.

const diet = (energy: number): VillageView['diet'] => ({
  energy,
  protein: 0.85,
  diversity: 0.89,
  shares: { grain: 0.6, legumes: 0.1, meat: 0.15, dairy: 0.1, eggs: 0.05, fruit: 0 },
});

describe('satiationState – barva ikony podle energie, ne nasycení', () => {
  it('ves jen s obilím (nasycení ≈ 80 %) je sytá, když má dost energie', () => {
    expect(satiationState({ diet: diet(1), hungry: false, starving: false })).toBe('fed');
  });

  it('hlad: energie pod plným přídělem nebo ves hladoví podle výhledu', () => {
    expect(satiationState({ diet: diet(0.9), hungry: false, starving: false })).toBe('hungry');
    expect(satiationState({ diet: diet(1), hungry: true, starving: false })).toBe('hungry');
  });

  it('velký hlad: energie pod 60 % nebo lidé umírají hlady', () => {
    expect(satiationState({ diet: diet(0.5), hungry: true, starving: false })).toBe('starving');
    expect(satiationState({ diet: diet(0.8), hungry: true, starving: true })).toBe('starving');
  });
});

describe('SatiationTooltip', () => {
  it('nasycení, energie a bílkoviny, podíly zdrojů na energii (ikony a procenta)', () => {
    const view = { satiation: 0.89, diet: diet(1) } as VillageView;
    const html = renderToStaticMarkup(<SatiationTooltip view={view} />);
    expect(html).toContain('Nasycení 89 %');
    expect(html).toContain('energie 100 % · bílkoviny 85 %');
    expect(html).toMatch(/data-share="grain".*food\.png.*60 %/);
    expect(html).toMatch(/data-share="legumes".*legumes\.png.*10 %/);
    // pořadí: obilí, luštěniny, maso, mléko a sýr, vejce, ovoce
    const order = [...html.matchAll(/data-share="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['grain', 'legumes', 'meat', 'dairy', 'eggs', 'fruit']);
    expect(html).toMatch(/data-share="meat".*meat\.png.*15 %/);
    expect(html).toMatch(/data-share="dairy".*cheese\.png.*10 %/);
    expect(html).toMatch(/data-share="eggs".*eggs\.png.*5 %/);
    expect(html).toMatch(/data-share="fruit".*apples\.png.*0 %/);
  });
});

describe('LaborTooltip – vojvodova rodina', () => {
  it('řádek s ikonou dvorce: cvičí, při hladu na poli; bez rodiny jen název', () => {
    const train = renderToStaticMarkup(
      <LaborTooltip lord={{ training: 5, field: 0, household: 3 }} />,
    );
    expect(train).toContain('manor.png');
    expect(train).toContain('Vojvodova rodina: 5 cvičí');
    const field = renderToStaticMarkup(
      <LaborTooltip lord={{ training: 0, field: 5, household: 3 }} />,
    );
    expect(field).toContain('Vojvodova rodina: 5 na poli');
    expect(renderToStaticMarkup(<LaborTooltip lord={null} />)).not.toContain('village-labor-lord');
  });
});

describe('SatiationTooltip – jídlo uložené před luštěninami', () => {
  it('podíl luštěnin chybí → 0 %', () => {
    const old = diet(1);
    const view = {
      satiation: 0.8,
      diet: { ...old, shares: { grain: 1, meat: 0, dairy: 0, eggs: 0, fruit: 0 } },
    } as VillageView;
    const html = renderToStaticMarkup(<SatiationTooltip view={view} />);
    expect(html).toMatch(/data-share="legumes".*legumes\.png.*0 %/);
    expect(html).not.toContain('NaN');
  });
});

describe('luštěniny v liště', () => {
  const field = (legume: number): VillageView['fields'][number] => ({
    id: 1,
    areaM2: 10_000,
    fertility: 70,
    stages: {},
    surfaces: {},
    crops: legume > 0 ? { spring: 3, legume } : { spring: 3 },
    ashParts: 0,
    ashBonus: 0,
    overgrowingM2: 0,
    parts: [],
  });
  const noLegumes = diet(1);
  const shares = { grain: 1, meat: 0, dairy: 0, eggs: 0, fruit: 0 };

  it('bez zásoby, osevu i jídla luštěnin se neukáže', () => {
    expect(
      showsLegumes({ legumesKg: 0.4, fields: [field(0)], diet: { ...noLegumes, shares } }),
    ).toBe(false);
  });

  it('ukáže se se zásobou, s oseným dílem nebo když se luštěniny jí', () => {
    expect(showsLegumes({ legumesKg: 120, fields: [], diet: { ...noLegumes, shares } })).toBe(true);
    expect(showsLegumes({ legumesKg: 0, fields: [field(2)], diet: { ...noLegumes, shares } })).toBe(
      true,
    );
    expect(showsLegumes({ legumesKg: 0, fields: [], diet: noLegumes })).toBe(true);
  });
});

describe('showsHay', () => {
  const pen = (built: boolean): VillageView['pens'][number] => ({
    id: 1,
    species: 'cattle',
    squares: 1,
    places: 45,
    animals: 0,
    herdPlaces: null,
    extension: null,
    built,
    progress: built ? 1 : 0.3,
    team: null,
    training: null,
    cows: 0,
    oxen: 0,
    condition: 1,
    abandoned: false,
    repair: null,
  });

  it('seno v liště, když ves má hotovou ohradu nebo seno v zásobě', () => {
    expect(showsHay({ hayKg: 0, pens: [] })).toBe(false);
    expect(showsHay({ hayKg: 0, pens: [pen(false)] })).toBe(false);
    expect(showsHay({ hayKg: 0, pens: [pen(true)] })).toBe(true);
    expect(showsHay({ hayKg: 1500, pens: [] })).toBe(true);
  });
});

describe('mléko a sýr v liště', () => {
  it('ukáže se se sýrem v zásobě nebo v době dojení, v popisku mléko za den', () => {
    expect(showsDairy({ cheeseKg: 0, milkLPerDay: 0 })).toBe(false);
    expect(showsDairy({ cheeseKg: 12, milkLPerDay: 0 })).toBe(true);
    expect(showsDairy({ cheeseKg: 0, milkLPerDay: 3.2 })).toBe(true);
    expect(dairyName({ milkLPerDay: 12.4 })).toBe('Sýr (kg) – mléko 12 l/den');
    expect(dairyName({ milkLPerDay: 0 })).toBe('Sýr (kg)');
  });
});

describe('vozy a dřevěné nářadí v liště (wagons.md)', () => {
  const crafts = (over: Partial<VillageView['crafts']> = {}): VillageView['crafts'] => ({
    present: true,
    stocks: { charcoalKg: 0, potteryKg: 0 },
    needs: { toolsKg: 6, potteryKg: 20, woodToolsKg: 8 },
    coverage: { tools: 0, pottery: 0 },
    workshops: [],
    carts: [],
    cartTargets: { 'two-wheel': 0, 'four-wheel': 0 },
    ...over,
  });

  it('dřevěné nářadí jen s tesařem nebo zásobou', () => {
    expect(showsWoodTools(crafts())).toBe(false);
    expect(showsWoodTools(crafts({ stocks: { ...crafts().stocks, woodToolsKg: 5 } }))).toBe(true);
  });

  it('popisek vozů – druhy a kolik je na cestě', () => {
    expect(cartsLabel([{ id: 1, kind: 'two-wheel', condition: 1, away: false }])).toBe(
      'Vozy – dvoukoláky 1',
    );
    expect(
      cartsLabel([
        { id: 1, kind: 'two-wheel', condition: 1, away: false },
        { id: 2, kind: 'four-wheel', condition: 1, away: true },
      ]),
    ).toBe('Vozy – dvoukoláky 1, čtyřkoláky 1 (na cestě 1)');
  });
});

describe('snopy v liště (production-chains.md – Humno)', () => {
  it('popisek: nevymláceno (i bez humna se mlátí nouzově)', () => {
    expect(sheavesName()).toBe('Snopy – nevymláceno (kg zrna)');
  });
});

describe('Pole uživí (fields.md – Co hráč vidí)', () => {
  const field = (people: number, capacity: number): VillageView =>
    ({
      people: { children: 0, adults: people, elders: 0 },
      fieldCapacity: { people: capacity, rotationHa: 47.9, fertility: 52 },
    }) as VillageView;

  it('lidí je víc, než pole uživí: červeně', () => {
    expect(fieldCapacityShort(field(31, 21.9))).toBe(true);
    const html = renderToStaticMarkup(<FieldCapacityTooltip view={field(31, 21.9)} />);
    expect(html).toContain('Pole uživí ≈ 22 lidí');
    expect(html).toMatch(/data-testid="field-capacity-people"[^>]*text-red-400/);
    expect(html).toContain('people.png');
    expect(html).toContain('47,9 ha');
  });

  it('pole stačí: bez červené', () => {
    expect(fieldCapacityShort(field(20, 21.9))).toBe(false);
    expect(fieldCapacityShort(field(22, 21.9))).toBe(false);
    const html = renderToStaticMarkup(<FieldCapacityTooltip view={field(20, 21.9)} />);
    expect(html).not.toContain('text-red-400');
  });

  it('bez pole nic nehlásí', () => {
    expect(
      fieldCapacityShort({ people: { children: 1, adults: 2, elders: 0 }, fieldCapacity: null }),
    ).toBe(false);
  });
});
