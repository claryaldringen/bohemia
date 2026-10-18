import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONSTRUCTION_BASE,
  CONSTRUCTION_PHASES,
  SACRED_KINDS,
  SHRINE_PETALS,
  constructionParts,
  constructionState,
  partSchedule,
} from '../village-construction';

interface GlbNode {
  name?: string;
  mesh?: number;
  translation?: [number, number, number];
}

/** Uzly GLB (JSON blok souboru). */
function glbNodes(file: string): GlbNode[] {
  const data = readFileSync(join(__dirname, '../../../public/models', file));
  const length = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as { nodes: GlbNode[] };
  return json.nodes;
}

function meshNames(file: string): Set<string> {
  return new Set(glbNodes(file).flatMap((n) => (n.mesh === undefined ? [] : [n.name ?? ''])));
}

describe('fáze stavby posvátných míst', () => {
  it('modla aspoň 6 fází, svatyně aspoň 8 – navazují na sebe a pokryjí průběh 0–1', () => {
    for (const kind of SACRED_KINDS) {
      const phases = CONSTRUCTION_PHASES[kind];
      expect(phases.length, kind).toBeGreaterThanOrEqual(kind === 'modla' ? 6 : 8);
      expect(phases[0]!.from).toBe(0);
      expect(phases[phases.length - 1]!.to).toBe(1);
      for (let i = 1; i < phases.length; i++) expect(phases[i]!.from).toBe(phases[i - 1]!.to);
      expect(new Set(phases.map((p) => p.id)).size).toBe(phases.length);
      expect(CONSTRUCTION_BASE[kind]).toBeNull();
    }
  });
});

describe('díly staveniště posvátných míst', () => {
  it('každý díl rozvrhu je v GLB staveniště (předpona druhu)', () => {
    const nodes = new Set([
      ...meshNames('sacred/idol-construction.glb'),
      ...meshNames('sacred/shrine-construction.glb'),
    ]);
    for (const kind of SACRED_KINDS) {
      for (const part of constructionParts(kind)) {
        expect(nodes.has(`${kind}-${part}`), `${kind}-${part}`).toBe(true);
      }
    }
  });

  it('dílů jen přibývá, kromě kolíků, kmene, vzpěr, stupňů řezby, třísek a hrubé navážky', () => {
    const replaced = new Set([
      'stakes',
      'log',
      'struts',
      'post',
      'hewn',
      'carved',
      'chips',
      'platform-1',
    ]);
    for (const kind of SACRED_KINDS) {
      for (const rule of partSchedule(kind)) {
        expect(rule.from).toBeGreaterThanOrEqual(0);
        expect(rule.from).toBeLessThan(1);
        if (rule.to !== undefined) expect(rule.to).toBeGreaterThan(rule.from);
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

  it('modla: kmen, vztyčení, řezba po stupních – vždy jen jeden stupeň kůlu', () => {
    const at = (p: number): string[] => constructionState('modla', p).parts;
    expect(at(0.04)).toContain('stakes');
    expect(at(0.25)).toContain('log');
    expect(at(0.4)).toContain('post');
    expect(at(0.4)).toContain('struts');
    expect(at(0.55)).toContain('hewn');
    expect(at(0.75)).toContain('carved');
    expect(at(0.9)).toContain('idol');
    expect(at(0.99)).toContain('offerings');
    for (let p = 0.3; p < 1; p += 0.01) {
      const stages = at(p).filter((part) =>
        ['log', 'post', 'hewn', 'carved', 'idol'].includes(part),
      );
      expect(stages.length, `modla v ${p}`).toBeLessThanOrEqual(1);
    }
    expect(constructionState('modla', 0.5).pitDepth).toBe(0);
  });

  it('svatyně: příkop výběžek po výběžku, navážka, ohniště, modla a dlažba', () => {
    const at = (p: number): string[] => constructionState('svatyne', p).parts;
    expect(at(0.03)).toContain('stakes');
    expect(at(0.1)).toContain('ditch-1');
    expect(at(0.1)).not.toContain('ditch-8');
    expect(at(0.39)).toContain('ditch-8');
    expect(at(0.45)).toContain('platform-1');
    expect(at(0.6)).toContain('platform-2');
    expect(at(0.6)).not.toContain('platform-1');
    expect(at(0.57)).not.toContain(`fire-1`);
    expect(at(0.675)).toContain(`fire-${SHRINE_PETALS}`);
    expect(at(0.9)).toContain('carved');
    expect(at(0.99)).toContain('paving');
    expect(at(0.99)).toContain('idol');
  });
});

describe('hotové modely posvátných míst', () => {
  it('svatyně je jedna síť a ohniště jsou prázdné uzly fire-1…8 ve výběžcích', () => {
    const nodes = glbNodes('sacred/shrine.glb');
    // jedna síť – loadMergedModel u více sítí otočí pořadí vrcholů a ořízne přední stěny
    expect(nodes.filter((n) => n.mesh !== undefined).map((n) => n.name)).toEqual(['shrine']);
    const fires = nodes.filter((n) => /^fire-\d$/.test(n.name ?? ''));
    expect(fires.map((n) => n.name).sort()).toEqual(
      Array.from({ length: SHRINE_PETALS }, (_, k) => `fire-${k + 1}`),
    );
    for (const fire of fires) {
      expect(fire.mesh).toBeUndefined();
      const [x, , z] = fire.translation ?? [0, 0, 0];
      // ohniště leží uprostřed výběžku příkopu (≈ 12,5 m od středu), uvnitř půdorysu 30 × 30 m
      expect(Math.hypot(x, z)).toBeGreaterThan(11.5);
      expect(Math.hypot(x, z)).toBeLessThan(13.5);
      expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThan(15);
    }
  });

  it('kameny háje jsou tři uzly pro instance', () => {
    expect(meshNames('sacred/grove-stones.glb')).toEqual(new Set(['stone-a', 'stone-b', 'altar']));
  });
});
