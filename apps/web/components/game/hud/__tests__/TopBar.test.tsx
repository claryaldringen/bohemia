import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VillageView } from '@/lib/village-view';
import { SatiationTooltip, satiationState, showsHay } from '../TopBar';

// Horní lišta (diet.md, oxen.md): barva nasycení podle energie, podíly stravy v tooltipu, seno.

const diet = (energy: number): VillageView['diet'] => ({
  energy,
  diversity: 0.94,
  shares: { grain: 0.8, meat: 0.2, fruit: 0 },
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
  it('nasycení, podíly obilí, masa a ovoce (ikony a procenta), energie a pestrost', () => {
    const view = { satiation: 0.94, diet: diet(1) } as VillageView;
    const html = renderToStaticMarkup(<SatiationTooltip view={view} />);
    expect(html).toContain('Nasycení 94 %');
    expect(html).toMatch(/data-share="grain".*food\.png.*80 %/);
    expect(html).toMatch(/data-share="meat".*meat\.png.*20 %/);
    expect(html).toMatch(/data-share="fruit".*apples\.png.*0 %/);
    expect(html).toContain('energie 100 % · pestrost 94 %');
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
