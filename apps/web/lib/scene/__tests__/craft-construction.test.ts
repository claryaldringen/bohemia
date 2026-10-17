import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONSTRUCTION_PHASES,
  CRAFT_KINDS,
  constructionParts,
  constructionPhase,
  constructionState,
  partSchedule,
  type ConstructionKind,
} from '../village-construction';

/** Jména uzlů s meshem v GLB (JSON blok souboru). */
function glbNodes(file: string): string[] {
  const data = readFileSync(join(__dirname, '../../../public/models', file));
  const length = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
    nodes: { name?: string; mesh?: number }[];
  };
  return json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name ?? '');
}

describe('fáze stavby řemeslných staveb', () => {
  it('aspoň 8 fází, navazují na sebe a pokryjí průběh 0–1', () => {
    for (const kind of CRAFT_KINDS) {
      const phases = CONSTRUCTION_PHASES[kind];
      expect(phases.length, kind).toBeGreaterThanOrEqual(8);
      expect(phases[0]!.from).toBe(0);
      expect(phases[phases.length - 1]!.to).toBe(1);
      for (let i = 1; i < phases.length; i++) expect(phases[i]!.from).toBe(phases[i - 1]!.to);
      expect(new Set(phases.map((p) => p.id)).size).toBe(phases.length);
    }
  });

  it('dílny stojí na fázích obydlí, pak přístřešek, pec / výheň a dílna; uhlíř kryje mechem', () => {
    const ids = (kind: ConstructionKind): string[] => CONSTRUCTION_PHASES[kind].map((p) => p.id);
    expect(ids('hrncir')).toEqual([
      'layout',
      'turf',
      'dig',
      'logs',
      'frame',
      'porch',
      'wattle',
      'daub',
      'thatch',
      'finish',
      'kiln',
      'workshop',
    ]);
    expect(ids('kovar')).toContain('forge');
    expect(ids('kovar')).not.toContain('kiln');
    expect(ids('uhlir')).toContain('moss');
    expect(ids('uhlir')).not.toContain('thatch');
    expect(ids('milir')).toEqual([
      'layout',
      'ground',
      'ring',
      'stack',
      'cover',
      'top',
      'vents',
      'finish',
    ]);
    expect(constructionPhase('hrncir', 0.8).id).toBe('kiln');
    expect(constructionPhase('milir', 0.4).id).toBe('stack');
  });
});

describe('díly staveniště řemesel', () => {
  it('každý díl rozvrhu je v construction.glb řemesel (předpona druhu)', () => {
    const nodes = new Set([
      ...glbNodes('crafts/construction.glb'),
      ...glbNodes('crafts/construction-moss.glb'),
    ]);
    for (const kind of CRAFT_KINDS) {
      for (const part of constructionParts(kind)) {
        expect(nodes.has(`${kind}-${part}`), `${kind}-${part}`).toBe(true);
      }
    }
    expect(nodes.has('site-stones')).toBe(true);
    expect(nodes.has('site-clay')).toBe(true);
  });

  it('dílů jen přibývá, kromě kolíků, výpletu, trámů pod mazanicí a fíry milíře', () => {
    const replaced = new Set([
      'stakes',
      'wattle',
      'pole',
      ...Array.from({ length: 6 }, (_, k) => `logs-${k + 1}`),
    ]);
    for (const kind of CRAFT_KINDS) {
      for (const rule of partSchedule(kind)) {
        expect(rule.from).toBeGreaterThanOrEqual(0);
        expect(rule.from).toBeLessThan(1);
      }
      let previous = new Set<string>();
      for (let p = 0; p <= 1.0001; p += 0.01) {
        const parts = new Set(constructionState(kind, p).parts);
        for (const part of previous) {
          if (!replaced.has(part)) expect(parts.has(part), `${kind} ${part} v ${p}`).toBe(true);
        }
        previous = parts;
      }
    }
  });

  it('přístřešek po krovu, došky až po něm; pec zdola nahoru až pod hotovou střechou', () => {
    const at = (p: number): string[] => constructionState('hrncir', p).parts;
    expect(at(0.38)).not.toContain('porch-posts');
    expect(at(0.42)).toContain('porch-posts');
    expect(at(0.56)).not.toContain('thatch-1');
    expect(at(0.6)).toContain('thatch-1');
    expect(at(0.76)).not.toContain('kiln-base');
    expect(at(0.8)).toContain('kiln-base');
    expect(at(0.8)).not.toContain('kiln-dome-1');
    expect(at(0.86)).toContain('kiln-dome-2');
    expect(at(0.86)).not.toContain('kiln-mouth');
    expect(at(0.92)).toContain('kiln-mouth');
    const forge = (p: number): string[] => constructionState('kovar', p).parts;
    expect(forge(0.8)).toContain('forge-hearth');
    expect(forge(0.8)).not.toContain('forge-bellows');
    expect(forge(0.92)).toContain('anvil');
  });

  it('uhlíř: řady mechu ve fázi mechu, dílna nakonec', () => {
    const at = (p: number): string[] => constructionState('uhlir', p).parts;
    expect(at(0.6)).not.toContain('thatch-1');
    expect(at(0.64)).toContain('thatch-1');
    expect(at(0.84)).toContain('thatch-8');
    expect(at(0.9)).not.toContain('coal');
    expect(at(0.99)).toContain('coal');
    expect(constructionState('uhlir', 0.99).roofCover).toBe(1);
  });

  it('milíř: věnec, polena po vrstvách, kryt zdola, komín, průduchy – bez jámy', () => {
    const at = (p: number): string[] => constructionState('milir', p).parts;
    expect(at(0.03)).toContain('stakes');
    expect(at(0.2)).toContain('ring');
    expect(at(0.3)).toContain('stack-1');
    expect(at(0.3)).not.toContain('stack-4');
    expect(at(0.5)).toContain('stack-4');
    expect(at(0.5)).not.toContain('cover-1');
    expect(at(0.7)).toContain('cover-2');
    expect(at(0.82)).toContain('top');
    expect(at(0.82)).not.toContain('pole');
    expect(at(0.95)).toContain('vents');
    expect(constructionState('milir', 0.5).pitDepth).toBe(0);
  });

  it('dílny kopou jámu svého obydlí; kameny a hlína pro pec / výheň a pak ubývají', () => {
    expect(constructionState('hrncir', 0.3).pitDepth).toBeCloseTo(0.5);
    expect(constructionState('uhlir', 0.4).pitDepth).toBeCloseTo(1);
    const scale = (kind: ConstructionKind, p: number, prop: string): number =>
      constructionState(kind, p).props.find((x) => x.prop === prop)?.scale ?? 0;
    expect(scale('hrncir', 0.3, 'stones')).toBe(0);
    expect(scale('hrncir', 0.75, 'stones')).toBeGreaterThan(scale('hrncir', 0.9, 'stones'));
    expect(scale('kovar', 0.6, 'clay')).toBeGreaterThan(0);
    expect(scale('kovar', 0.95, 'clay')).toBe(0);
    expect(scale('uhlir', 0.5, 'stones')).toBe(0);
  });
});
