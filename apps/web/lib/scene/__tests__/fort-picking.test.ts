import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import { pickVillageTarget, targetExists, wholeTarget } from '../village-picking';
import { nextSelection } from '../village-selection';

// Opevnění ve výběru (fortifications.md – Rozhraní): klik na pás nebo těsně u okraje obvodu
// vybere úsek mezi branami, ve kterém bod leží po obvodu (`segment` – první díl úseku jádra),
// klik do dosahu brány bránu, dvojklik celé opevnění; zbořený díl je mezera (demolition.md –
// Opevnění).

const OUTLINE: [number, number][] = [
  [0, 0],
  [45, 0],
  [45, 45],
  [0, 45],
  [0, 0],
];

const village: SceneVillage = {
  dwellings: [],
  fields: [],
  forts: [
    {
      id: 4,
      grid: null,
      cells: [],
      kind: 'palisade',
      segments: [],
      gates: [],
      building: false,
      // díly po stranách čtverce: 0 jih, 1 východ, 2 sever, 3 západ
      shapes: [
        { index: 0, lengthM: 45, path: [OUTLINE[0]!, OUTLINE[1]!] },
        { index: 1, lengthM: 45, path: [OUTLINE[1]!, OUTLINE[2]!] },
        { index: 2, lengthM: 45, path: [OUTLINE[2]!, OUTLINE[3]!] },
        { index: 3, lengthM: 45, path: [OUTLINE[3]!, OUTLINE[4]!] },
      ],
      corners: { outer: 3, inner: 1.5 },
      looks: [],
      outline: OUTLINE,
      // pás u jižní strany: 1,5 m dovnitř plochy
      band: [
        [
          [0, 0],
          [45, 0],
          [45, 1.5],
          [0, 1.5],
        ],
      ],
      bandSegments: [0],
    },
  ],
};

const pick = (x: number, z: number): ReturnType<typeof pickVillageTarget> =>
  pickVillageTarget(
    village,
    { origin: { x, y: 50, z }, direction: { x: 0, y: -1, z: 0 } },
    { ground: { x, z }, groundHeight: () => 0, cellOf: () => null },
  );

describe('výběr opevnění', () => {
  it('pás i těsně vedle okraje vybere úsek (bez brány celý obvod – díl 0), střed plochy ne', () => {
    expect(pick(20, 0.7)).toEqual({ kind: 'fortification-section', id: 4, segment: 0 });
    expect(pick(20, -1.5)).toEqual({ kind: 'fortification-section', id: 4, segment: 0 });
    expect(pick(45, 20)).toEqual({ kind: 'fortification-section', id: 4, segment: 0 });
    expect(pick(1, 30)).toEqual({ kind: 'fortification-section', id: 4, segment: 0 });
    expect(pick(22, 22)).toBeNull();
  });

  it('zbořený díl je mezera – klik na něj opevnění nevybere', () => {
    const fort = village.forts![0]!;
    const gap: SceneVillage = {
      ...village,
      forts: [
        {
          ...fort,
          segments: [0, 1, 2, 3].map((index) => ({
            index,
            builtDay: 0,
            state: index === 0 ? 0 : 1,
            ...(index === 0 ? { demolishedDay: 10 } : {}),
          })),
        },
      ],
    };
    const at = (x: number, z: number): ReturnType<typeof pickVillageTarget> =>
      pickVillageTarget(
        gap,
        { origin: { x, y: 50, z }, direction: { x: 0, y: -1, z: 0 } },
        { ground: { x, z }, groundHeight: () => 0, cellOf: () => null },
      );
    expect(at(20, 0.7)).toBeNull();
    expect(at(45, 20)).toEqual({ kind: 'fortification-section', id: 4, segment: 0 });
  });

  describe('brány uprostřed dílů – východ (díl 1, 20 m) a západ (díl 3, 25 m)', () => {
    // obvod 180 m: brána 1 v 65 m, brána 3 ve 160 m; úsek brány 1 od 67 m do 158 m, úsek
    // brány 3 od 162 m přes začátek dílu 0 do 63 m
    const fort = village.forts![0]!;
    const gated: SceneVillage = {
      ...village,
      forts: [
        {
          ...fort,
          gates: [
            { segment: 1, offsetM: 20, x: 45, z: 20 },
            { segment: 3, offsetM: 25, x: 0, z: 20 },
          ],
        },
      ],
    };
    const at = (x: number, z: number): ReturnType<typeof pickVillageTarget> =>
      pickVillageTarget(
        gated,
        { origin: { x, y: 50, z }, direction: { x: 0, y: -1, z: 0 } },
        { ground: { x, z }, groundHeight: () => 0, cellOf: () => null },
      );

    it('klik do dosahu brány vybere bránu – má přednost před úsekem', () => {
      expect(at(45, 20)).toEqual({ kind: 'fortification-gate', id: 4, segment: 1 });
      expect(at(44.5, 22.5)).toEqual({ kind: 'fortification-gate', id: 4, segment: 1 });
      expect(at(0.5, 18)).toEqual({ kind: 'fortification-gate', id: 4, segment: 3 });
      expect(at(45, 23)).toEqual({ kind: 'fortification-section', id: 4, segment: 1 });
    });

    it('úsek podle polohy po obvodu, ne podle dílu: díl 1 před branou patří úseku brány 3', () => {
      expect(at(45, 10)).toEqual({ kind: 'fortification-section', id: 4, segment: 3 });
      expect(at(45, 30)).toEqual({ kind: 'fortification-section', id: 4, segment: 1 });
      expect(at(20, 0.7)).toEqual({ kind: 'fortification-section', id: 4, segment: 3 });
      expect(at(20, 44)).toEqual({ kind: 'fortification-section', id: 4, segment: 1 });
      expect(at(0.5, 30)).toEqual({ kind: 'fortification-section', id: 4, segment: 1 });
    });

    it('dvojklik na úsek i bránu vybere celé opevnění včetně bran', () => {
      const section = at(45, 30)!;
      const gate = at(45, 20)!;
      expect(nextSelection(null, section, false, true)).toEqual({ kind: 'fortification', id: 4 });
      expect(nextSelection(section, gate, false, true)).toEqual({ kind: 'fortification', id: 4 });
      expect(wholeTarget({ kind: 'fortification', id: 4 })).toEqual({
        kind: 'fortification',
        id: 4,
      });
      // jednoduchý klik zůstane u úseku
      expect(nextSelection(null, section, false)).toBe(section);
    });

    it('výběr brány zanikne s branou', () => {
      expect(targetExists(gated, { kind: 'fortification-gate', id: 4, segment: 1 })).toBe(true);
      expect(targetExists(gated, { kind: 'fortification-gate', id: 4, segment: 2 })).toBe(false);
    });
  });

  it('výběr zanikne s opevněním', () => {
    expect(targetExists(village, { kind: 'fortification', id: 4 })).toBe(true);
    expect(targetExists(village, { kind: 'fortification-section', id: 4, segment: 0 })).toBe(true);
    expect(targetExists(village, { kind: 'fortification-section', id: 5, segment: 0 })).toBe(false);
  });
});
