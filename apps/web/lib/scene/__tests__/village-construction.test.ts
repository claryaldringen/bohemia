import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PLOT_HOUSE_OFFSET_M, PLOT_VARIANTS, type DwellingType } from '@bohemia/game';
import { plotInward } from '../homestead-layout';
import {
  CONSTRUCTION_PHASES,
  PLOT_BUILT,
  SITE_PROPS,
  SITE_PROP_PLACES,
  THATCH_COURSES,
  constructionParts,
  constructionPhase,
  constructionState,
  partSchedule,
  sitePropPlace,
  type LogHouseKind,
} from '../village-construction';
import { DWELLING_CLEARANCE_M } from '../village-layout';

const TYPES: readonly DwellingType[] = ['zemnice', 'polozemnice'];
const LOG_HOUSES: readonly LogHouseKind[] = ['srub', 'dvorec-srub'];

/** Jména uzlů s meshem v GLB (JSON blok souboru). */
function glbNodes(file: string): string[] {
  const data = readFileSync(join(__dirname, '../../../public/models', file));
  const length = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
    nodes: { name?: string; mesh?: number }[];
  };
  return json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name ?? '');
}

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
    // polozemnice místo zahloubených sloupů roubí srub a nakonec ohradí pozemek a udělá záhony
    expect(CONSTRUCTION_PHASES.polozemnice.map((p) => p.id)).toContain('logs');
    expect(CONSTRUCTION_PHASES.polozemnice.at(-1)!.id).toBe('beds');
    expect(CONSTRUCTION_PHASES.zemnice.map((p) => p.id)).not.toContain('fence');
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

describe('pozemek polozemnice', () => {
  it('každý díl rozvrhu obydlí je v construction.glb obydlí (předpona druhu)', () => {
    const nodes = new Set(glbNodes('dwellings/construction.glb'));
    for (const type of TYPES) {
      for (const part of constructionParts(type)) {
        expect(nodes.has(`${type}-${part}`), `${type}-${part}`).toBe(true);
      }
    }
  });

  it('díly pozemku (homestead.glb): záhon a čtyři druhy zeleniny', () => {
    expect(new Set(glbNodes('dwellings/homestead.glb'))).toEqual(
      new Set(['bed', 'plant-cabbage', 'plant-turnip', 'plant-onion', 'plant-dill']),
    );
  });

  it('díly pleteného plotu (woven-fence.glb, pozemek i hřbitov): kůly a větev', () => {
    expect(new Set(glbNodes('dwellings/woven-fence.glb'))).toEqual(
      new Set(['fence-post', 'fence-post-gate', 'fence-rail']),
    );
  });

  it('po hřebeni plot (nejdřív kůly, pak větve zdola), nakonec záhony; zemnice ani dílny ne', () => {
    const ids = CONSTRUCTION_PHASES.polozemnice.map((p) => p.id);
    expect(ids.slice(-3)).toEqual(['finish', 'fence', 'beds']);
    const plot = (p: number) => constructionState('polozemnice', p).plot;
    const fence = CONSTRUCTION_PHASES.polozemnice.find((p) => p.id === 'fence')!;
    const beds = CONSTRUCTION_PHASES.polozemnice.find((p) => p.id === 'beds')!;
    expect(plot(fence.from - 0.01)).toEqual({ posts: 0, rails: 0, beds: 0 });
    const early = plot(fence.from + (fence.to - fence.from) * 0.25);
    expect(early.posts).toBeGreaterThan(0);
    expect(early.rails).toBe(0);
    const late = plot(fence.from + (fence.to - fence.from) * 0.75);
    expect(late.posts).toBe(1);
    expect(late.rails).toBeGreaterThan(0);
    expect(late.beds).toBe(0);
    expect(plot((beds.from + beds.to) / 2).beds).toBeGreaterThan(0);
    expect(plot(1)).toEqual(PLOT_BUILT);
    expect(constructionPhase('polozemnice', fence.from + 0.01).label).toMatch(/plot/);
    for (const kind of ['zemnice', 'hrncir', 'kovar', 'uhlir'] as const) {
      expect(CONSTRUCTION_PHASES[kind].map((p) => p.id)).not.toContain('fence');
      expect(constructionState(kind, 0.99).plot).toEqual({ posts: 0, rails: 0, beds: 0 });
    }
  });

  it('hromada hlíny z jámy zmizí do začátku plotu – na pozemku pak rostou záhony', () => {
    const fence = CONSTRUCTION_PHASES.polozemnice.find((p) => p.id === 'fence')!;
    const spoil = (p: number): number =>
      constructionState('polozemnice', p).props.find((x) => x.prop === 'spoil')?.scale ?? 0;
    expect(spoil(fence.from - 0.04)).toBeGreaterThan(0);
    expect(spoil(fence.from)).toBe(0);
    expect(spoil(0.99)).toBe(0);
  });

  it('rekvizity rohového domu se zrcadlí dovnitř pozemku, u domu uprostřed zůstanou', () => {
    for (const variant of PLOT_VARIANTS) {
      const inward = plotInward(variant);
      for (const prop of SITE_PROPS) {
        const place = sitePropPlace('polozemnice', prop, inward);
        const original = SITE_PROP_PLACES.polozemnice[prop];
        if (inward.x !== 0 && original.x !== 0) expect(Math.sign(place.x)).toBe(inward.x);
        if (inward.z !== 0 && original.z !== 0) expect(Math.sign(place.z)).toBe(inward.z);
        if (variant === 'center') expect(place).toEqual(original);
        // rekvizita leží uvnitř políčka pozemku (dům natočený o π: svět = −model)
        const offset = PLOT_HOUSE_OFFSET_M[variant];
        expect(Math.abs(offset.x - place.x), `${variant} ${prop}`).toBeLessThan(7.5);
        expect(Math.abs(offset.z - place.z), `${variant} ${prop}`).toBeLessThan(7.5);
      }
    }
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

describe('nadzemní srub (log-house.md – Scéna)', () => {
  it('fáze navazují: drn, kameny, roubení, krov, prkenné štíty, došky – bez jámy a mazanice', () => {
    for (const kind of LOG_HOUSES) {
      const phases = CONSTRUCTION_PHASES[kind];
      expect(phases[0]!.from).toBe(0);
      expect(phases[phases.length - 1]!.to).toBe(1);
      for (let i = 1; i < phases.length; i++) expect(phases[i]!.from).toBe(phases[i - 1]!.to);
      const ids = phases.map((p) => p.id);
      for (const id of ['dig', 'wattle', 'daub'] as const) expect(ids).not.toContain(id);
      const order = ['layout', 'turf', 'stones', 'logs', 'frame', 'boards', 'thatch', 'finish'];
      expect(order.map((id) => ids.indexOf(id as never))).toEqual(
        [...order.map((id) => ids.indexOf(id as never))].sort((a, b) => a - b),
      );
      expect(ids.slice(-2)).toEqual(['fence', 'beds']);
    }
    expect(CONSTRUCTION_PHASES['dvorec-srub'].map((p) => p.id)).toContain('carve');
  });

  it('každý díl rozvrhu je v <typ>-construction.glb a žádný díl modelu nechybí v rozvrhu', () => {
    for (const kind of LOG_HOUSES) {
      const nodes = glbNodes(`dwellings/${kind}-construction.glb`);
      const parts = constructionParts(kind).map((part) => `${kind}-${part}`);
      expect([...parts].sort()).toEqual([...nodes].sort());
    }
  });

  it('nikdy se nekope: jáma 0, bez hromady hlíny a proutí; kameny před věnci, došky po krovu', () => {
    for (const kind of LOG_HOUSES) {
      for (let p = 0; p <= 1; p += 0.05) {
        const state = constructionState(kind, p);
        expect(state.pitDepth).toBe(0);
        expect(state.props.map((x) => x.prop)).not.toContain('spoil');
        expect(state.props.map((x) => x.prop)).not.toContain('rods');
      }
      const from = (part: string): number =>
        partSchedule(kind).find((rule) => rule.part === part)!.from;
      expect(from('stones')).toBeLessThan(from('logs-1'));
      expect(from('logs-9')).toBeLessThan(from('rafters-1'));
      expect(from('rafters-1')).toBeLessThan(from('thatch-1'));
      expect(constructionState(kind, 0.02).outline).toBe(1);
      expect(constructionState(kind, 1).parts).toContain('ridge');
      // věnce kmenů zůstanou – srub se neomazává
      expect(constructionState(kind, 1).parts).toContain('logs-1');
    }
  });

  it('rekvizity leží mimo srub i střechu a uvnitř místa, kde se skrývají stromy', () => {
    // vnější okraj střechy (x_eave) a konce kmenů / střechy podél hřebene (dwellings.py)
    const roof = { srub: { x: 2.75, z: 3.55 }, 'dvorec-srub': { x: 3.75, z: 6.1 } };
    for (const kind of LOG_HOUSES) {
      const c = DWELLING_CLEARANCE_M[kind];
      for (const { prop } of constructionState(kind, 0.5).props) {
        const { x, z } = SITE_PROP_PLACES[kind][prop];
        expect(x).toBeGreaterThan(c.minX + 0.5);
        expect(x).toBeLessThan(c.maxX - 0.5);
        expect(z).toBeGreaterThan(c.minZ + 0.5);
        expect(z).toBeLessThan(c.maxZ - 0.5);
        expect(Math.abs(x) > roof[kind].x || Math.abs(z) > roof[kind].z, `${kind} ${prop}`).toBe(
          true,
        );
      }
    }
  });
});
