import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  VILLAGER_CLIPS,
  MAN_ONLY_CLIPS,
  TOOL_WALK,
  isWalkClip,
  createVillagerPose,
  route,
  rowWork,
  shuttle,
  villagerSeconds,
  walkSpeed,
  type VillagerClip,
} from '../villager-motion';

const pose = createVillagerPose;

describe('villager-motion – pohyb jako funkce času', () => {
  it('práce v řadě: pracuje na místě, popojde, na konci řady se otočí zpět', () => {
    const lane = { ax: 0, az: 0, bx: 10, bz: 0 };
    const worker = rowWork(lane, 'hoe', 5, 1, 1, 0);
    const clips = new Set<string>();
    for (let t = 0; t < 130; t += 0.25) {
      const p = worker(t, [], pose());
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(10 + 1e-9);
      expect(p.z).toBe(0);
      clips.add(p.clip);
    }
    expect(clips).toEqual(new Set(['hoe', 'walk']));
    // 10 kroků po 6 s tam, pak zpět – v 60 s je na konci, v 120 s zase na začátku
    expect(worker(60.5, [], pose())).toMatchObject({ x: 10, headingX: -1, clip: 'hoe' });
    expect(worker(120.5, [], pose())).toMatchObject({ x: 0, headingX: 1, clip: 'hoe' });
  });

  it('stejný okamžik = stejná póza (nic se nepočítá postupně)', () => {
    const worker = rowWork({ ax: 0, az: 0, bx: 0, bz: 12 }, 'reap', 8, 1, 1.2, 0.37);
    expect(worker(98765.4, [], pose())).toEqual(worker(98765.4, [], pose()));
  });

  it('nosič: tam s prázdnou, u pole nakládá, zpět s nůší, doma chvíli stojí', () => {
    const r = route([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(r.length).toBe(20);
    const carrier = shuttle(r, {
      outClip: 'walk',
      outSpeed: 2,
      endClip: 'weed',
      endS: 3,
      backClip: 'carry',
      backSpeed: 1,
      restClip: 'idle',
      restS: 2,
      phase: 0,
    });
    expect(carrier(5, [], pose())).toMatchObject({ x: 10, z: 0, clip: 'walk' });
    expect(carrier(11, [], pose())).toMatchObject({ x: 10, z: 10, clip: 'weed' });
    const back = carrier(18, [], pose());
    expect(back).toMatchObject({ x: 10, z: 5, clip: 'carry' });
    expect(back.headingZ).toBe(-1);
    expect(carrier(34, [], pose())).toMatchObject({ x: 0, z: 0, clip: 'idle' });
  });

  it('menší postava chodí pomaleji; čas běží od stejného počátku jako zvířata', () => {
    expect(walkSpeed('man', 'walk', 0.7)).toBeCloseTo(0.7 * walkSpeed('man', 'walk', 1), 9);
    expect(villagerSeconds(Date.UTC(2026, 0, 1, 0, 0, 10))).toBe(10);
  });

  it('klipy postav sedí s people.json (GLB z people_from_0ad.py)', () => {
    const spec = JSON.parse(
      readFileSync(new URL('../../../../../tools/blender/people.json', import.meta.url), 'utf8'),
    ) as { name: string; clips: { name: string }[] }[];
    for (const figure of spec) {
      const expected =
        figure.name === 'man'
          ? VILLAGER_CLIPS
          : VILLAGER_CLIPS.filter((c) => !MAN_ONLY_CLIPS.includes(c));
      expect(figure.clips.map((c) => c.name).sort()).toEqual([...expected].sort());
    }
  });

  it('GLB postav mají klipy z people.json (přegenerované – úloha 10)', () => {
    for (const name of ['man', 'woman']) {
      const glb = readFileSync(
        new URL(`../../../public/models/people/${name}.glb`, import.meta.url),
      );
      // GLB: hlavička 12 B, pak blok JSON (délka, typ, data)
      const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as {
        animations: { name: string }[];
      };
      const expected =
        name === 'man' ? VILLAGER_CLIPS : VILLAGER_CLIPS.filter((c) => !MAN_ONLY_CLIPS.includes(c));
      expect(json.animations.map((a) => a.name).sort()).toEqual([...expected].sort());
    }
  });

  it('vlastní klipy (dojení, předení, tkaní, sezení, kruh, hudba) jsou z klíčových póz', () => {
    const spec = JSON.parse(
      readFileSync(new URL('../../../../../tools/blender/people.json', import.meta.url), 'utf8'),
    ) as { name: string; clips: { name: string; keys?: unknown; props: string[] }[] }[];
    for (const figure of spec) {
      const keyed = figure.clips.filter((c) => c.keys).map((c) => c.name);
      expect(keyed.sort()).toEqual(['drum', 'milk', 'pipe', 'sit', 'spin', 'weave', 'wheel']);
      // sedí na špalku
      for (const c of figure.clips.filter((c) => ['milk', 'sit', 'wheel'].includes(c.name))) {
        expect(c.props).toContain('stump');
      }
    }
  });

  it('cesta s nářadím a chůze vladaře mají rychlost chůze', () => {
    expect(TOOL_WALK.hoe).toBe('walk-hoe');
    expect(isWalkClip('walk-axe')).toBe(true);
    expect(isWalkClip('sit')).toBe(false);
    expect(walkSpeed('man', 'walk-lord', 1)).toBeGreaterThan(walkSpeed('man', 'walk', 1));
  });

  it('rekvizity fází (úloha 9): klip ukazuje svou rekvizitu v people.json i v GLB', () => {
    // klip → rekvizity, které v něm musí být vidět (villagers.md – Fáze činností)
    const expected: Partial<Record<VillagerClip, readonly string[]>> = {
      bind: ['sheaf'],
      rake: ['rake'],
      pitch: ['pitchfork'],
      forge: ['hammer', 'tongs'],
      split: ['split-axe', 'block'],
      sieve: ['sieve'],
      pots: ['pots'],
      'carry-tools': ['basket', 'tools-load'],
      'carry-pots': ['basket', 'pots-load'],
      'carry-fish': ['basket', 'fish-load'],
      snare: ['snare'],
      cook: ['ladle', 'cookpot'],
      milk: ['stump', 'pail'],
      spin: ['distaff'],
      weave: ['loom'],
      pipe: ['pipe'],
      drum: ['drum'],
      // mistři stavební huti (jen muž)
      measure: ['lath'],
      'break-stone': ['maul', 'rubble'],
      'carry-stone': ['basket', 'stone-load'],
      stoke: ['poker'],
      slake: ['paddle'],
      quarry: ['pickaxe'],
      dress: ['hammer', 'chisel', 'ashlar'],
      lay: ['stone-hand'],
      mortar: ['hoe', 'trough'],
      plaster: ['trowel', 'float'],
    };
    const spec = JSON.parse(
      readFileSync(new URL('../../../../../tools/blender/people.json', import.meta.url), 'utf8'),
    ) as { name: string; props: { name: string }[]; clips: { name: string; props: string[] }[] }[];
    for (const figure of spec) {
      const glb = readFileSync(
        new URL(`../../../public/models/people/${figure.name}.glb`, import.meta.url),
      );
      const jsonLength = glb.readUInt32LE(12);
      const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) as {
        nodes: { name: string }[];
        accessors: { bufferView: number; byteOffset?: number }[];
        bufferViews: { byteOffset?: number }[];
        animations: {
          name: string;
          channels: { sampler: number; target: { node: number; path: string } }[];
          samplers: { output: number }[];
        }[];
      };
      // blok BIN hned za JSON (délka, typ, data)
      const bin = 20 + jsonLength + 8;
      const firstFloat = (accessor: number): number => {
        const a = json.accessors[accessor]!;
        const view = json.bufferViews[a.bufferView]!;
        return glb.readFloatLE(bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0));
      };
      for (const [clip, props] of Object.entries(expected)) {
        if (figure.name === 'woman' && MAN_ONLY_CLIPS.includes(clip as VillagerClip)) continue;
        const clipSpec = figure.clips.find((c) => c.name === clip);
        const anim = json.animations.find((a) => a.name === clip);
        for (const prop of props) {
          expect(
            figure.props.map((p) => p.name),
            `${figure.name}: ${prop}`,
          ).toContain(prop);
          expect(clipSpec?.props, `${figure.name} ${clip}`).toContain(prop);
          // kloub rekvizity má v klipu nenulové měřítko (skrytá rekvizita má 0)
          const node = json.nodes.findIndex((n) => n.name === `prop_${prop}`);
          expect(node, `${figure.name}: uzel prop_${prop}`).toBeGreaterThanOrEqual(0);
          const scale = anim?.channels.find(
            (c) => c.target.node === node && c.target.path === 'scale',
          );
          expect(scale, `${figure.name} ${clip}: měřítko ${prop}`).toBeDefined();
          expect(firstFloat(anim!.samplers[scale!.sampler]!.output)).toBeGreaterThan(0.5);
        }
      }
    }
  });
});
