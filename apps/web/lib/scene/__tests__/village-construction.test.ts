import { describe, it, expect } from 'vitest';
import {
  CONSTRUCTION_PHASES,
  SITE_PROPS,
  SITE_PROP_PLACES,
  THATCH_COURSES,
  constructionParts,
  constructionPhase,
  constructionState,
  partSchedule,
} from '../village-construction';
import { DWELLING_CLEARANCE_M } from '../village-layout';
import type { DwellingType } from '../village-types';

const TYPES: DwellingType[] = ['zemnice', 'polozemnice'];

describe('fáze stavby', () => {
  it('aspoň 8 fází, navazují na sebe a pokryjí průběh 0–1', () => {
    for (const type of TYPES) {
      const phases = CONSTRUCTION_PHASES[type];
      expect(phases.length).toBeGreaterThanOrEqual(8);
      expect(phases[0]!.from).toBe(0);
      expect(phases[phases.length - 1]!.to).toBe(1);
      for (let i = 1; i < phases.length; i++) expect(phases[i]!.from).toBe(phases[i - 1]!.to);
      expect(new Set(phases.map((p) => p.id)).size).toBe(phases.length);
    }
  });

  it('pořadí: vytyčení, drn, jáma, konstrukce, mazanice, došky, hřeben', () => {
    expect(CONSTRUCTION_PHASES.zemnice.map((p) => p.id)).toEqual([
      'layout',
      'turf',
      'dig',
      'posts',
      'frame',
      'wattle',
      'daub',
      'thatch',
      'finish',
    ]);
    // polozemnice místo zahloubených sloupů roubí srub
    expect(CONSTRUCTION_PHASES.polozemnice.map((p) => p.id)).toContain('logs');
    expect(constructionPhase('zemnice', 0).id).toBe('layout');
    expect(constructionPhase('zemnice', 0.2).id).toBe('dig');
    expect(constructionPhase('zemnice', 1).id).toBe('finish');
  });
});

describe('díly staveniště', () => {
  it('každý díl patří k modelu a objeví se v rozsahu 0–1', () => {
    for (const type of TYPES) {
      for (const rule of partSchedule(type)) {
        expect(rule.from).toBeGreaterThanOrEqual(0);
        expect(rule.from).toBeLessThan(1);
        if (rule.to !== undefined) expect(rule.to).toBeGreaterThan(rule.from);
      }
      const parts = constructionParts(type);
      expect(new Set(parts).size).toBe(parts.length);
      expect(parts.filter((p) => p.startsWith('thatch-'))).toHaveLength(THATCH_COURSES[type]);
    }
  });

  it('s průběhem dílů jen přibývá, kromě kolíků, výpletu a trámů pod mazanicí', () => {
    const replaced = new Set([
      'stakes',
      'wattle',
      ...Array.from({ length: 6 }, (_, k) => `logs-${k + 1}`),
    ]);
    for (const type of TYPES) {
      let previous = new Set<string>();
      for (let p = 0; p <= 1.0001; p += 0.01) {
        const parts = new Set(constructionState(type, p).parts);
        for (const part of previous) {
          if (!replaced.has(part)) expect(parts.has(part), `${type} ${part} v ${p}`).toBe(true);
        }
        previous = parts;
      }
    }
  });

  it('došky se kladou zdola nahoru, hřeben s kozami až nakonec', () => {
    const at = (p: number): string[] => constructionState('zemnice', p).parts;
    expect(at(0.7)).not.toContain('thatch-1');
    expect(at(0.75)).toContain('thatch-1');
    expect(at(0.75)).not.toContain('thatch-8');
    expect(at(0.93)).toContain('thatch-8');
    expect(at(0.93)).not.toContain('ridge');
    expect(at(0.99)).toContain('ridge');
    // omítka překryje výplet
    expect(at(0.6)).toContain('wattle');
    expect(at(0.7)).toContain('daub');
    expect(at(0.7)).not.toContain('wattle');
  });
});

describe('jáma, obtisky a rekvizity podle průběhu', () => {
  it('jáma se kope až po sejmutí drnu a prohlubuje se plynule do plné hloubky', () => {
    expect(constructionState('zemnice', 0.1).pitDepth).toBe(0);
    const a = constructionState('zemnice', 0.2).pitDepth;
    const b = constructionState('zemnice', 0.3).pitDepth;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(constructionState('zemnice', 0.5).pitDepth).toBeCloseTo(1);
    expect(constructionState('polozemnice', 0.5).pitDepth).toBeCloseTo(0.5);
  });

  it('vytyčení na začátku, drn se snímá postupně, střecha kryje jámu s došky', () => {
    expect(constructionState('zemnice', 0.02).outline).toBe(1);
    expect(constructionState('zemnice', 0.4).outline).toBe(0);
    expect(constructionState('zemnice', 0.1).turf).toBeGreaterThan(0);
    expect(constructionState('zemnice', 0.1).turf).toBeLessThan(1);
    expect(constructionState('zemnice', 0.6).roofCover).toBe(0);
    expect(constructionState('zemnice', 0.99).roofCover).toBe(1);
  });

  it('hromada hlíny roste s kopáním, hráň dřeva ubývá s krovem, snopy s došky', () => {
    const scale = (type: DwellingType, p: number, prop: string): number =>
      constructionState(type, p).props.find((x) => x.prop === prop)?.scale ?? 0;
    expect(scale('zemnice', 0.1, 'spoil')).toBe(0);
    expect(scale('zemnice', 0.3, 'spoil')).toBeGreaterThan(scale('zemnice', 0.2, 'spoil'));
    expect(scale('zemnice', 0.38, 'timber')).toBeGreaterThan(scale('zemnice', 0.5, 'timber'));
    expect(scale('zemnice', 0.6, 'timber')).toBe(0);
    expect(scale('zemnice', 0.8, 'straw')).toBeGreaterThan(scale('zemnice', 0.9, 'straw'));
    expect(scale('zemnice', 0.96, 'straw')).toBe(0);
  });

  it('rekvizity leží mimo jámu a uvnitř místa, kde se skrývají stromy', () => {
    for (const type of TYPES) {
      const c = DWELLING_CLEARANCE_M[type];
      for (const prop of SITE_PROPS) {
        const { x, z } = SITE_PROP_PLACES[type][prop];
        expect(x).toBeGreaterThan(c.minX + 0.5);
        expect(x).toBeLessThan(c.maxX - 0.5);
        expect(z).toBeGreaterThan(c.minZ + 0.5);
        expect(z).toBeLessThan(c.maxZ - 0.5);
        expect(Math.abs(x) > 2.3 || Math.abs(z) > 2.5).toBe(true);
      }
    }
  });
});
