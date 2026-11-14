import { describe, expect, it } from 'vitest';
import { penChronicleNote } from '../oxen';
import type { Pen, VillageState } from '../../types';

// Ohrada v kronice (Martin 14. 11. 2026: „Byla postavena ohrada pro ovce.“).

const pen = (extra: Partial<Pen>): Pen =>
  ({ id: 7, cell: { x: 0, y: 0 }, x: 0, z: 0, builtDay: null, ...extra }) as Pen;

describe('kronika – ohrada', () => {
  it('druh zvířat, rozšíření o čtverce stavby, bez ohrady nic', () => {
    const state = (p: Pen): Pick<VillageState, 'pens'> => ({ pens: [p] });
    expect(penChronicleNote(state(pen({ species: 'sheep' })), { id: 50, penId: 7 })).toEqual({
      penSpecies: 'sheep',
    });
    const extended = pen({
      species: 'horse',
      builtDay: 10,
      extraSquares: [{ x: 1, y: 0, constructionId: 50 }] as unknown as Pen['extraSquares'],
    });
    expect(penChronicleNote(state(extended), { id: 50, penId: 7 })).toEqual({
      penSpecies: 'horse',
      penExtended: true,
    });
    // ohrada uložená bez druhu – výchozí druh jako jinde (`penSpecies`)
    expect(penChronicleNote(state(pen({})), { id: 50, penId: 7 }).penSpecies).toBe('cattle');
    expect(penChronicleNote(state(pen({})), { id: 50, penId: 8 })).toEqual({});
  });
});
