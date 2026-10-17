import { describe, expect, it } from 'vitest';
import { selectionDetails } from '../selection-details';
import type { SceneVillage, VillageView } from '../village-view';

const scene: SceneVillage = {
  dwellings: [
    { id: 1, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
    {
      id: 9,
      type: 'polozemnice',
      position: { x: 20, z: 0, rotation: 0 },
      built: false,
      progress: 0.4,
    },
  ],
  fields: [{ id: 5, parts: [] }],
};

const view = {
  households: [
    {
      dwellingId: 1,
      type: 'zemnice',
      occupants: 4,
      capacity: 6,
      full: false,
      overcrowded: false,
      condition: 0.8,
      ages: [27, 26, 15, 3],
      ageYears: 2,
    },
  ],
  constructions: [
    {
      id: 9,
      kind: 'dwelling',
      label: 'Polozemnice',
      progress: 0.4,
      dwellingType: 'polozemnice',
      dwellingId: null,
      fieldId: null,
    },
    {
      id: 12,
      kind: 'field',
      label: 'Pole',
      progress: 0.25,
      dwellingType: null,
      dwellingId: null,
      fieldId: 5,
    },
  ],
  fields: [{ id: 5, areaM2: 2250, fertility: 61.4, stages: { sown: 6, founding: 4 } }],
  cemeteries: [
    {
      id: 30,
      squares: 2,
      built: true,
      progress: 1,
      capacity: 112,
      graves: 72,
      freeGraves: 40,
      yearsLeft: 12.2,
      spaceLabel: 'Zbývá 40 hrobů – asi na 12 let.',
    },
    {
      id: 31,
      squares: 1,
      built: false,
      progress: 0.5,
      capacity: 56,
      graves: 0,
      freeGraves: 56,
      yearsLeft: null,
      spaceLabel: 'Až bude ohrazené, vejde se sem 56 hrobů.',
    },
  ],
} as unknown as VillageView;

describe('selectionDetails', () => {
  it('bez výběru nic, zaniklý cíl nic', () => {
    expect(selectionDetails(view, scene, null)).toBeNull();
    expect(selectionDetails(view, scene, { kind: 'dwelling', id: 77 })).toBeNull();
    expect(selectionDetails(view, scene, { kind: 'field', id: 77 })).toBeNull();
  });

  it('hotové obydlí: obyvatelé s věkem, stav, stáří', () => {
    expect(selectionDetails(view, scene, { kind: 'dwelling', id: 1 })).toEqual({
      kind: 'dwelling',
      id: 1,
      type: 'zemnice',
      occupants: 4,
      capacity: 6,
      ages: [27, 26, 15, 3],
      condition: 0.8,
      ageYears: 2,
      full: false,
      overcrowded: false,
      rebuild: null,
    });
  });

  it('staveniště: typ a průběh (i před založením vsi, ze scény)', () => {
    expect(selectionDetails(view, scene, { kind: 'dwelling', id: 9 })).toEqual({
      kind: 'site',
      id: 9,
      type: 'polozemnice',
      progress: 0.4,
    });
    expect(selectionDetails(null, scene, { kind: 'dwelling', id: 9 })?.kind).toBe('site');
  });

  it('pole: výměra, úrodnost, díly podle stadia v pořadí a zakládání', () => {
    expect(selectionDetails(view, scene, { kind: 'field', id: 5 })).toEqual({
      kind: 'field',
      id: 5,
      areaM2: 2250,
      fertility: 61.4,
      stages: [
        { stage: 'founding', count: 4 },
        { stage: 'sown', count: 6 },
      ],
      founding: 0.25,
    });
  });
});

describe('selectionDetails – hřbitov', () => {
  it('hroby, místo a odhad v letech; zakládaný s průběhem založení', () => {
    expect(selectionDetails(view, scene, { kind: 'cemetery', id: 30 })).toEqual({
      kind: 'cemetery',
      id: 30,
      squares: 2,
      capacity: 112,
      graves: 72,
      freeGraves: 40,
      yearsLeft: 12.2,
      spaceLabel: 'Zbývá 40 hrobů – asi na 12 let.',
      founding: null,
    });
    expect(selectionDetails(view, scene, { kind: 'cemetery', id: 31 })).toMatchObject({
      founding: 0.5,
    });
    expect(selectionDetails(view, scene, { kind: 'cemetery', id: 99 })).toBeNull();
  });
});
