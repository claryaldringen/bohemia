import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import { ploughingToday } from '../plough-front';
import { penHerds, scenePenViews } from '../village-pens';

// Ohrady ve vsi (oxen.md): pohled na ohrady a zvířata v nich (kde se orá – plough-front.test.ts).

const CELL = 15;
const part = (
  id: number,
  x: number,
  z: number,
): SceneVillage['fields'][number]['parts'][number] => ({
  id,
  cell: { x: Math.floor(x / CELL), y: Math.floor(z / CELL) },
  x,
  z,
  size: CELL,
  stage: 'sown',
});

const village: SceneVillage = {
  dwellings: [
    { id: 1, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
  ],
  fields: [{ id: 5, parts: [part(51, 37.5, 7.5), part(52, 52.5, 7.5), part(53, 67.5, 7.5)] }],
  pens: [
    {
      id: 9,
      cell: { x: 0, y: 3 },
      x: 7.5,
      z: 52.5,
      size: CELL,
      built: true,
      progress: 1,
      oxen: 2,
      trainees: 2,
      cows: 1,
    },
    {
      id: 10,
      cell: { x: 4, y: 3 },
      x: 67.5,
      z: 52.5,
      size: CELL,
      built: false,
      progress: 0.4,
      oxen: 0,
      trainees: 0,
      cows: 0,
    },
  ],
};

const ploughing: SceneVillage = {
  ...village,
  labor: {
    day: 100,
    month: 9,
    people: { children: 2, adults: 4, elders: 0 },
    shares: [
      {
        activity: 'plough',
        target: { kind: 'field', id: 5 },
        manDays: 2,
        parts: [52, 53],
      },
    ],
  },
};

describe('ohrady ve vsi', () => {
  it('branka k nejbližšímu obydlí, průběh stavby (hotová 1)', () => {
    const views = scenePenViews(village);
    expect(views.map((v) => v.id)).toEqual([9, 10]);
    expect(views[0]!.progress).toBe(1);
    expect(views[1]!.progress).toBeCloseTo(0.4, 9);
    // obydlí leží na −z od ohrady
    expect(views[0]!.facing.z).toBeLessThan(0);
  });

  it('zvířata jen v hotových ohradách; v den orby jsou voli spřežení na poli', () => {
    expect(penHerds(village)).toEqual(new Map([[9, { oxen: 2, trainees: 2, cows: 1 }]]));
    expect(ploughingToday(village)).toBe(false);
    expect(ploughingToday(ploughing)).toBe(true);
    expect(penHerds(ploughing).get(9)).toEqual({ oxen: 0, trainees: 2, cows: 1 });
  });

  it('voli, kteří se na čelo orby nevešli, zůstanou v ohradě (spřežení po ohradách podle id)', () => {
    const pens = [
      { ...village.pens![0]!, id: 12 },
      { ...village.pens![0]!, id: 7, oxen: 2 },
      { ...village.pens![0]!, id: 3, oxen: 0 },
    ];
    const two: SceneVillage = { ...ploughing, pens };
    // na poli jedno spřežení – voli první ohrady s voly (id 7)
    const herds = penHerds(two, 1);
    expect(herds.get(7)!.oxen).toBe(0);
    expect(herds.get(12)!.oxen).toBe(2);
    expect(herds.get(3)!.oxen).toBe(0);
    // bez orby jsou všichni doma, bez údaje v den orby všichni na poli
    expect(penHerds(two, 0).get(7)!.oxen).toBe(2);
    expect([...penHerds(two).values()].map((h) => h.oxen)).toEqual([0, 0, 0]);
    expect([...penHerds(two).keys()]).toEqual([12, 7, 3]);
  });
});
