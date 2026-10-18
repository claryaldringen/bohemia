import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VillageView } from '@/lib/village-view';
import {
  ForeignStocks,
  SatiationTooltip,
  dairyName,
  satiationState,
  showsDairy,
  showsHay,
  showsLegumes,
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
    built,
    progress: built ? 1 : 0.3,
    team: null,
    training: null,
    trainBlocked: null,
    cows: 0,
    oxen: 0,
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

describe('zboží zvenku v horní liště (trade.md)', () => {
  it('sůl, železo, med a kožešiny – jen to, co ves má', () => {
    const html = renderToStaticMarkup(
      <ForeignStocks goods={{ saltKg: 12.4, ironKg: 0, honeyKg: 3, furs: 0.2 }} />,
    );
    expect(html).toContain('data-testid="village-salt"');
    expect(html).toContain('data-testid="village-honey"');
    expect(html).not.toContain('village-iron');
    expect(html).not.toContain('village-furs');
    expect(
      renderToStaticMarkup(<ForeignStocks goods={{ saltKg: 0, ironKg: 0, honeyKg: 0, furs: 0 }} />),
    ).toBe('');
  });
});
