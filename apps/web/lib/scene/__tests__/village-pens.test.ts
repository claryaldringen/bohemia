import { describe, expect, it } from 'vitest';
import { HAY_WINTER_MONTHS, dateOfDayIndex } from '@bohemia/game';
import type { SceneVillage } from '../../village-view';
import { ploughingToday } from '../plough-front';
import { grazingHorses } from '../livestock-placement';
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

  it('voli, kteří dnes neorají ani nevozí, zůstanou v ohradě (venku po ohradách podle id)', () => {
    const pens = [
      { ...village.pens![0]!, id: 12 },
      { ...village.pens![0]!, id: 7, oxen: 2 },
      { ...village.pens![0]!, id: 3, oxen: 0 },
    ];
    const two: SceneVillage = { ...ploughing, pens };
    // na poli jeden pár – voli první ohrady s voly (id 7)
    const herds = penHerds(two, 2);
    expect(herds.get(7)!.oxen).toBe(0);
    expect(herds.get(12)!.oxen).toBe(2);
    expect(herds.get(3)!.oxen).toBe(0);
    // pár a vůl u dvoukoláku – z druhé ohrady jeden
    expect(penHerds(two, 3).get(12)!.oxen).toBe(1);
    // bez orby jsou všichni doma, bez údaje v den orby všichni na poli
    expect(penHerds(two, 0).get(7)!.oxen).toBe(2);
    expect([...penHerds(two).values()].map((h) => h.oxen)).toEqual([0, 0, 0]);
    expect([...penHerds(two).keys()]).toEqual([12, 7, 3]);
  });
});

describe('ohrada o víc čtvercích (oxen.md – Ohrady podle druhu)', () => {
  const pen = {
    id: 11,
    species: 'sheep' as const,
    cell: { x: 0, y: 6 },
    x: 7.5,
    z: 97.5,
    size: CELL,
    built: true,
    progress: 1,
    oxen: 0,
    trainees: 0,
    cows: 0,
    extraSquares: [
      { cell: { x: 1, y: 6 }, x: 22.5, z: 97.5 },
      { cell: { x: 0, y: 7 }, x: 7.5, z: 112.5, pending: true as const },
    ],
  };

  it('plot kolem hotových čtverců, rozšíření ve stavbě jen vytyčené; branka k obydlí', () => {
    const [view] = scenePenViews({ ...village, pens: [pen] });
    expect(view!.extra).toEqual([{ x: 22.5, z: 97.5 }]);
    expect(view!.pending?.map((q) => q.cell)).toEqual([{ x: 0, y: 7 }]);
    // nejbližší obydlí (0, 0) leží pod ohradou – branka míří dolů
    expect(view!.facing.z).toBeLessThan(0);
  });

  it('rozestavěná ohrada se vytyčí kolem všech čtverců', () => {
    const [view] = scenePenViews({
      ...village,
      pens: [{ ...pen, built: false, progress: 0.3 }],
    });
    expect(view!.extra).toHaveLength(2);
    expect(view!.pending).toBeUndefined();
  });
});

describe('ohrada koní ve vsi (horses.md – Ve scéně)', () => {
  const days = Array.from({ length: 365 }, (_, d) => d);
  const summer = days.find((d) => !HAY_WINTER_MONTHS.includes(dateOfDayIndex(d).month))!;
  const winter = days.find((d) => HAY_WINTER_MONTHS.includes(dateOfDayIndex(d).month))!;
  const horses = [
    { id: 1, kind: 'mare' as const },
    { id: 2, kind: 'foal' as const },
    { id: 3, kind: 'riding' as const, riderId: 7 },
  ];
  const withHorses = (day: number): SceneVillage => ({
    ...village,
    labor: { day, month: 1, people: { children: 2, adults: 4, elders: 0 }, shares: [] },
    pens: [
      {
        id: 20,
        species: 'horse',
        cell: { x: 2, y: 3 },
        x: 37.5,
        z: 52.5,
        size: CELL,
        built: true,
        progress: 1,
        oxen: 0,
        trainees: 0,
        cows: 0,
        horses,
      },
    ],
  });

  it('pohled ohrady nese druh (vyšší plot)', () => {
    expect(scenePenViews(withHorses(winter))[0]!.species).toBe('horse');
    expect(scenePenViews(village)[0]!.species).toBeUndefined();
  });

  it('v zimě všichni koně v ohradě', () => {
    expect(penHerds(withHorses(winter)).get(20)!.horses).toEqual(['mare', 'foal', 'riding']);
  });

  it('kůň jezdce dne je s jezdcem, ne v ohradě (riders.ts)', () => {
    const v = withHorses(winter);
    const riding: SceneVillage = {
      ...v,
      labor: {
        ...v.labor!,
        lord: {
          home: 1,
          trainees: [],
          household: [],
          riders: [{ id: 7, horseId: 3, training: 20, hours: 2 }],
        },
      },
    };
    expect(penHerds(riding).get(20)!.horses).toEqual(['mare', 'foal']);
  });

  it('v létě s pasáky jsou koně na pastvě, v ohradě zůstane jen kůň pod jezdcem', () => {
    const v = withHorses(summer);
    // jedna domácnost = stádo ovcí s kozami, krav a prasat; koně potřebují pasáka navíc
    const herders = { ...v, labor: { ...v.labor!, herders: { children: 4 } } };
    expect(penHerds(herders).get(20)!.horses).toEqual(['riding']);
    // bez údaje o pasácích jdou všechna stáda na pastvu
    expect(penHerds(v).get(20)!.horses).toEqual(['riding']);
  });

  it('stádo nikdy samo: bez pasáka navíc zůstávají koně v ohradě (stejně jako ve stádech)', () => {
    const v = withHorses(summer);
    for (const children of [1, 3]) {
      const few = { ...v, labor: { ...v.labor!, herders: { children } } };
      expect(grazingHorses(few)).toEqual([]);
      expect(penHerds(few).get(20)!.horses).toEqual(['mare', 'foal', 'riding']);
    }
    const enough = { ...v, labor: { ...v.labor!, herders: { children: 4 } } };
    expect(grazingHorses(enough).map((h) => h.kind)).toEqual(['mare', 'foal']);
  });
});
