import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DWELLING_FOOTPRINT_M } from '@bohemia/game';
import { decayModelType, dwellingDecayStage } from '../dwelling-decay';
import { PIT_SHAPES } from '../dwelling-pit';
import {
  MANOR_FENCE,
  homesteadLayout,
  insidePlot,
  plotFenceRect,
  plotHouse,
  plotStakingLine,
} from '../homestead-layout';
import {
  CONSTRUCTION_PHASES,
  constructionParts,
  constructionState,
  partSchedule,
} from '../village-construction';
import { fencePosts } from '../woven-fence';

// Dvorec vojvody ve scéně (trade.md – Dvorec vojvody): pozemek dvou políček s bránou, jáma a fáze
// staveniště podle modelu z tools/blender/dwellings.py („dvorec“).

/** Jména uzlů s meshem v GLB (JSON blok souboru). */
function glbNodes(file: string): string[] {
  const data = readFileSync(join(__dirname, '../../../public/models', file));
  const length = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
    nodes: { name?: string; mesh?: number }[];
  };
  return json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name ?? '');
}

// dům vzadu, dvůr vpředu (−z) – vchod ke dvoru
const square = { x: 7.5, z: 7.5, size: 15, yard: { x: 7.5, z: -7.5 } };

describe('pozemek dvorce – dům a dvůr', () => {
  it('plot obejde obě políčka, dům stojí uprostřed políčka domu vchodem ke dvoru', () => {
    const rect = plotFenceRect(square);
    expect(rect.maxZ - rect.minZ).toBeCloseTo(29);
    expect(rect.maxX - rect.minX).toBeCloseTo(14);
    expect(plotHouse(square, 'center')).toEqual({ x: 7.5, z: 7.5, rotation: Math.PI });
    expect(plotHouse({ ...square, yard: { x: 22.5, z: 7.5 } }, 'center').rotation).toBeCloseTo(
      Math.PI / 2,
    );
    expect(insidePlot(square, 7.5, -10)).toBe(true);
    expect(plotStakingLine(square)).toHaveLength(5);
  });

  it('brána na vzdálené straně dvora, záhony jen kolem domu', () => {
    const layout = homesteadLayout(square, 'center', 3);
    expect(layout.gate).not.toBeNull();
    const rect = plotFenceRect(square);
    expect(layout.gate!.z).toBeCloseTo(rect.minZ, 0);
    // brána je širší než branka (průchod mezi kůly brány)
    const gates = fencePosts(layout.fence).filter((p) => p.gate);
    expect(gates.length).toBeGreaterThanOrEqual(2);
    const width = Math.hypot(gates[0]!.x - gates.at(-1)!.x, gates[0]!.z - gates.at(-1)!.z);
    expect(width).toBeGreaterThan(MANOR_FENCE.gateWidth - 0.3);
    expect(layout.beds.length).toBeGreaterThan(0);
    for (const bed of layout.beds) expect(bed.z).toBeGreaterThan(0);
    // obyčejný pozemek bránu nemá
    expect(homesteadLayout({ x: 7.5, z: 7.5, size: 15 }, 'center').gate).toBeNull();
  });
});

describe('dvorec – jáma, staveniště a rozpad', () => {
  it('jáma sedí s půdorysem dvorce – delší než polozemnice', () => {
    const pit = PIT_SHAPES.dvorec;
    expect(pit.halfZ).toBeGreaterThan(PIT_SHAPES.polozemnice.halfZ * 1.8);
    expect(pit.halfX * 2).toBeLessThan(DWELLING_FOOTPRINT_M.dvorec.width);
    expect(pit.halfZ * 2).toBeLessThan(DWELLING_FOOTPRINT_M.dvorec.depth);
  });

  it('fáze navazují, řezby po hřebeni, nakonec plot a záhony', () => {
    const phases = CONSTRUCTION_PHASES.dvorec;
    expect(phases[0]!.from).toBe(0);
    expect(phases.at(-1)!.to).toBe(1);
    for (let i = 1; i < phases.length; i++) expect(phases[i]!.from).toBe(phases[i - 1]!.to);
    const ids = phases.map((p) => p.id);
    expect(ids.indexOf('carve')).toBeGreaterThan(ids.indexOf('finish'));
    expect(ids.indexOf('fence')).toBeGreaterThan(ids.indexOf('carve'));
    const carving = partSchedule('dvorec').find((r) => r.part === 'carving');
    expect(carving).toBeDefined();
    expect(constructionState('dvorec', 0.79).parts).not.toContain('carving');
    expect(constructionState('dvorec', 0.9).parts).toContain('carving');
  });

  it('každý díl rozvrhu je v dvorec-construction.glb, hotový model a brána existují', () => {
    const nodes = new Set(glbNodes('dwellings/dvorec-construction.glb'));
    for (const part of constructionParts('dvorec')) {
      expect(nodes.has(`dvorec-${part}`), `dvorec-${part}`).toBe(true);
    }
    expect(glbNodes('dwellings/dvorec.glb')).toEqual(['dvorec']);
    expect(glbNodes('dwellings/dvorec-gate.glb')).toEqual(['dvorec-gate']);
  });

  it('dvorec se zatím nerozpadá, zbytek jámy po něm je jako po polozemnici', () => {
    expect(dwellingDecayStage({ type: 'dvorec', inhabited: false, condition: 0.1 })).toBe(0);
    expect(dwellingDecayStage({ type: 'polozemnice', inhabited: false, condition: 0.1 })).toBe(3);
    expect(decayModelType('dvorec')).toBe('polozemnice');
    expect(decayModelType('zemnice')).toBe('zemnice');
  });
});
