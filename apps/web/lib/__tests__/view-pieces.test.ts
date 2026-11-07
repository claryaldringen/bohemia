import { describe, expect, it } from 'vitest';
import {
  PIECE_ITEMS,
  knownViewPieces,
  packViewPieces,
  pieceKey,
  unpackViewPieces,
} from '../view-pieces';
import type { VillageView } from '../village-view-types';

/** Pohled jen s částmi, které jdou po kusech (ostatní view-pieces nečte). */
function view(day: number, changed: readonly number[] = []): VillageView {
  const count = PIECE_ITEMS * 3 + 5;
  const parts = [...Array(count).keys()].map((id) => ({
    id,
    work: changed.includes(id) ? day : 0,
  }));
  return {
    dayIndex: day,
    fields: [{ id: 1, parts }],
    scene: {
      fields: [{ id: 1, parts: parts.map((p) => ({ id: p.id, x: p.id, z: 0, size: 15 })) }],
      obstacles: { removed: [1, 2, 3], stumps: [], saplings: [] },
      earthworks: [],
    },
  } as unknown as VillageView;
}

/** Pohled tak, jak dorazí klientovi (server action – bez funkcí, kopie). */
const sent = (v: VillageView): VillageView => JSON.parse(JSON.stringify(v)) as VillageView;

describe('kusy pohledu jen při změně (view-pieces)', () => {
  it('bez otisků celý pohled s otisky; se všemi otisky nic z velkých částí, klient doplní', () => {
    const first = sent(packViewPieces(view(1), null));
    expect(first.fields[0]!.parts).toHaveLength(PIECE_ITEMS * 3 + 5);
    expect(first.pieces?.omitted).toBeUndefined();
    expect(first.pieces?.keys.f0).toHaveLength(4);
    const client = unpackViewPieces(first, null);
    expect(client.lost).toBe(false);

    const again = sent(packViewPieces(view(2), knownViewPieces(client.view)));
    expect(again.fields[0]!.parts).toHaveLength(0);
    expect(again.scene.fields[0]!.parts).toHaveLength(0);
    expect(again.scene.obstacles).toBeUndefined();
    const restored = unpackViewPieces(again, client.view);
    expect(restored.lost).toBe(false);
    const { pieces, ...rest } = restored.view;
    expect(pieces?.omitted).toBeUndefined();
    expect(rest).toEqual({ ...view(2), fields: view(2).fields });
  });

  it('změněný díl – pošle se jen jeho kus (i poslední kratší), zbytek z pohledu klienta', () => {
    const client = unpackViewPieces(sent(packViewPieces(view(1), null)), null).view;
    const next = view(2, [PIECE_ITEMS + 3, PIECE_ITEMS * 3 + 1]);
    const packed = sent(packViewPieces(next, knownViewPieces(client)));
    expect(packed.fields[0]!.parts.map((p) => p.id)).toEqual([
      ...[...Array(PIECE_ITEMS).keys()].map((k) => PIECE_ITEMS + k),
      ...[...Array(5).keys()].map((k) => PIECE_ITEMS * 3 + k),
    ]);
    expect(packed.pieces?.omitted?.f0).toEqual([0, 2]);
    const { view: got, lost } = unpackViewPieces(packed, client);
    expect(lost).toBe(false);
    expect(got.fields).toEqual(next.fields);
    expect(got.scene).toEqual(next.scene);
  });

  it('klient kus nemá (jiný pohled) – lost, a pak neposílá otisky', () => {
    const client = unpackViewPieces(sent(packViewPieces(view(1), null)), null).view;
    const packed = sent(packViewPieces(view(2), knownViewPieces(client)));
    expect(unpackViewPieces(packed, null).lost).toBe(true);
    expect(knownViewPieces(packed)).toEqual({});
  });

  it('otisk kusu – jiný obsah jiný otisk, stejný stejný', () => {
    expect(pieceKey([{ a: 1 }])).toBe(pieceKey([{ a: 1 }]));
    expect(pieceKey([{ a: 1 }])).not.toBe(pieceKey([{ a: 2 }]));
    expect(pieceKey([{ a: 12 }])).not.toBe(pieceKey([{ a: 1, b: 2 }]));
  });
});
