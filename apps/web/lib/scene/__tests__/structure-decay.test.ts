import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DECAY_STAGES } from '../dwelling-decay';
import {
  fenceDecayAmount,
  leanPoint,
  penDecayParts,
  penDecayPlace,
  sacredDecayParts,
  sacredLean,
  sacredRuinParts,
  structureDecayStage,
} from '../structure-decay';
import { CEMETERY_FENCE } from '../cemetery-layout';
import { decayFence, fenceStage, wovenFence } from '../woven-fence';

// Rozpad opuštěných staveb ve scéně (abandonment.md – Co hráč vidí): stupně, díly modelů
// a jejich přítomnost v GLB, náklon modly, zarůstání zbytků a rozpad pleteného plotu.

/** Uzly s meshem v GLB (JSON blok souboru). */
function glbNodes(file: string): string[] {
  const data = readFileSync(join(__dirname, '../../../public/models', file));
  const length = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
    nodes: { name?: string; mesh?: number }[];
  };
  return json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name ?? '');
}

describe('stupně rozpadu staveb', () => {
  it('stejné hranice jako obydlí: ≥ 70 % celá, ≥ 45 sešlá, ≥ 20 nakloněná, pak rozpadlá', () => {
    expect(structureDecayStage(undefined)).toBe(0);
    expect(structureDecayStage(0.7)).toBe(0);
    expect(structureDecayStage(0.6)).toBe(1);
    expect(structureDecayStage(0.3)).toBe(2);
    expect(structureDecayStage(0.05)).toBe(3);
  });
});

describe('modla a svatyně – díly podle stupně', () => {
  const sacred = new Set([
    ...glbNodes('sacred/sacred-decay.glb'),
    ...glbNodes('sacred/idol-construction.glb'),
    ...glbNodes('sacred/shrine-construction.glb'),
    'idol',
    'shrine',
  ]);

  it('celá navštěvovaná je hotový model; opuštěná i opravovaná celá svatyně má studená ohniště', () => {
    expect(sacredDecayParts('idol', 0, false)).toEqual([{ key: 'idol' }]);
    expect(sacredDecayParts('idol', 0, true)).toEqual([{ key: 'idol' }]);
    expect(sacredDecayParts('shrine', 0, false)).toEqual([{ key: 'shrine' }]);
    const cold = sacredDecayParts('shrine', 0, true).map((p) => p.key);
    expect(cold).toContain('shrine-fires-cold');
    expect(cold).not.toContain('shrine');
    expect(cold.some((k) => k.startsWith('svatyne-fire'))).toBe(false);
  });

  it('sešlá bez obětin a stužky se zšedlou modlou; nakloněná se kloní a zarůstá', () => {
    const weathered = sacredDecayParts('idol', 1, true).map((p) => p.key);
    expect(weathered).toContain('idol-weathered');
    expect(weathered).not.toContain('modla-offerings');
    expect(weathered).not.toContain('modla-ribbon');
    const leaning = sacredDecayParts('idol', 2, true);
    expect(leaning.filter((p) => p.lean).map((p) => p.key)).toEqual([
      'idol-weathered',
      'idol-weathered-moss',
    ]);
    expect(leaning.map((p) => p.key)).toContain('idol-ground-overgrown');
    expect(sacredDecayParts('shrine', 3, true).map((p) => p.key)).toContain(
      'shrine-ground-overgrown',
    );
  });

  it('každý díl rozpadu i zbytku je v GLB (sacred-decay.glb a díly staveniště)', () => {
    for (const kind of ['idol', 'shrine'] as const) {
      for (const stage of DECAY_STAGES) {
        for (const cold of [false, true]) {
          for (const { key } of sacredDecayParts(kind, stage, cold)) {
            expect(sacred.has(key), key).toBe(true);
          }
        }
      }
      for (const t of [0, 0.3, 0.7, 1]) {
        for (const { key } of sacredRuinParts(kind, t)) expect(sacred.has(key), key).toBe(true);
      }
    }
  });

  it('náklon: sešlá stojí, nakloněná ≈ 12°, rozpadlá ≈ 28°, směr pevně podle id', () => {
    expect(sacredLean(5, 1).angle).toBe(0);
    const a = sacredLean(5, 2);
    expect(a.angle).toBeGreaterThan(0.17);
    expect(a.angle).toBeLessThan(0.25);
    expect(sacredLean(5, 3).angle).toBeGreaterThan(0.4);
    expect(sacredLean(5, 2)).toEqual(a);
    expect(sacredLean(6, 2).heading).not.toBe(a.heading);
    // pata zůstane, vršek se posune ve směru náklonu a sníží
    expect(leanPoint(0, 0, 0, a)).toEqual([0, 0, 0]);
    const [x, y, z] = leanPoint(0, 3, 0, a);
    expect(y).toBeCloseTo(3 * Math.cos(a.angle), 6);
    expect(Math.hypot(x, z)).toBeCloseTo(3 * Math.sin(a.angle), 6);
    expect(x / Math.hypot(x, z)).toBeCloseTo(Math.sin(a.heading), 6);
  });

  it('zbytek: padlá modla zapadá do trávy, příkop svatyně se srovná, modla v něm jen napřed', () => {
    const idol = (t: number): Record<string, number> =>
      Object.fromEntries(sacredRuinParts('idol', t).map((p) => [p.key, p.sinkM]));
    expect(idol(0)['idol-fallen']).toBe(0);
    expect(idol(1)['idol-fallen']).toBeGreaterThan(0.2);
    const shrine = (t: number): string[] => sacredRuinParts('shrine', t).map((p) => p.key);
    expect(shrine(0.2)).toContain('shrine-idol-fallen');
    expect(shrine(0.8)).not.toContain('shrine-idol-fallen');
    const ditch = sacredRuinParts('shrine', 1).find((p) => p.key === 'shrine-ground-overgrown')!;
    expect(ditch.heightScale).toBeLessThan(0.3);
  });
});

describe('ohrada – díly podle stupně', () => {
  it('celá z pen.glb, rozpad z pen-decay.glb – všechny díly existují a stojí na místě dílu', () => {
    const pen = new Set(glbNodes('pen/pen.glb'));
    const decay = new Set(glbNodes('pen/pen-decay.glb'));
    for (const stage of DECAY_STAGES) {
      for (const { from, part } of penDecayParts(stage)) {
        expect((from === 'pen' ? pen : decay).has(part), part).toBe(true);
      }
    }
    expect(penDecayParts(0).every((p) => p.from === 'pen')).toBe(true);
    expect(penDecayParts(3).map((p) => p.part)).toContain('gate-fallen');
    expect(penDecayPlace('rack-fallen')).toBe('hay-rack');
    expect(penDecayPlace('trough-dry')).toBe('trough');
    expect(penDecayPlace('gate-fallen')).toBe('gate');
    expect(penDecayPlace('shelter-2-thatch')).toBe('shelter');
  });
});

describe('pletený plot opuštěné stavby', () => {
  it('celý do 85 %, pak se rozpadá, pod 10 % zbudou pahýly', () => {
    expect(fenceDecayAmount(undefined)).toBe(0);
    expect(fenceDecayAmount(0.9)).toBe(0);
    expect(fenceDecayAmount(0.5)).toBeCloseTo(0.47, 2);
    expect(fenceDecayAmount(0.1)).toBe(1);
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const fence = fenceStage(
      wovenFence([{ points: square, closed: true }], CEMETERY_FENCE, null),
      CEMETERY_FENCE,
      { posts: 1, rails: 1 },
    );
    const half = decayFence(fence, fenceDecayAmount(0.5), 7);
    const gone = decayFence(fence, fenceDecayAmount(0.05), 7);
    expect(half.rails.length).toBeLessThan(fence.rails.length);
    expect(gone.rails.length).toBeLessThan(half.rails.length);
    expect(gone.posts.filter((p) => p.sink !== undefined).length).toBeGreaterThan(0);
  });
});
