import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { dwelling, kin, village } from '../../village/__tests__/kin-fixtures';
import type { FieldPart, Orchard, Pen, VillageState, Workshop } from '../../village/types';
import { villageLookouts } from '../lookouts';

// Oči vsi (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 – Otevřené 3): kde
// vesničané jsou – domy vždy, díly polí mimo zimu, milíře, lomy, hromady klád, sady, ohrady.

const JULY = dayIndexOf({ year: 501, month: 7, day: 15 });
const JANUARY = dayIndexOf({ year: 502, month: 1, day: 15 });

function busy(day: number, extra: Partial<VillageState> = {}): VillageState {
  const burner = { ...dwelling(2), position: { x: 20, z: 0, rotation: 0 } };
  burner.workshop = {
    craft: 'burner',
    kilns: [
      { id: 41, site: { x: 600, z: 0 } },
      { id: 40, site: null },
    ],
  } as unknown as Workshop;
  const part = { id: 7, fieldId: 3, cell: { x: 70, y: 64 } } as unknown as FieldPart;
  const abandoned = { id: 8, fieldId: 3, cell: { x: 71, y: 64 }, abandoned: true };
  return village([kin({ id: 1, age: 30, sex: 'male', home: 1 }, day)], [dwelling(1), burner], {
    lastDay: day - 1,
    fields: [{ id: 3 }] as unknown as VillageState['fields'],
    parts: [part, abandoned as unknown as FieldPart],
    quarries: [{ outcropId: 5, x: -300, z: 100, rotation: 0, builtDay: 0 }],
    logStacks: [
      { id: 12, fieldId: 0, x: 50, z: 50, logs: 4 },
      { id: 11, fieldId: 0, x: 60, z: 50, logs: 0 },
    ] as unknown as VillageState['logStacks'],
    orchards: [{ id: 20, squares: [{ cell: { x: 60, y: 60 } }] }] as unknown as Orchard[],
    pens: [{ id: 30, x: -40, z: 10 }] as unknown as Pen[],
    ...extra,
  });
}

describe('villageLookouts', () => {
  it('ves s milířem, lomem, polem a ohradou – oko u každého, pevné pořadí', () => {
    const eyes = villageLookouts(busy(JULY), JULY);
    expect(eyes.map((e) => `${e.kind}:${e.id}`)).toEqual([
      'home:1',
      'home:2',
      'field:7',
      'kiln:41',
      'quarry:5',
      'logs:12',
      'orchard:20',
      'pen:30',
    ]);
    expect(eyes.find((e) => e.kind === 'kiln')?.pos).toEqual({ x: 600, z: 0 });
    expect(eyes.find((e) => e.kind === 'home' && e.id === 2)?.pos).toEqual({ x: 20, z: 0 });
    // díl 70, 64 na rovné krajině 128 × 15 m se středem v počátku
    const field = eyes.find((e) => e.kind === 'field')!;
    expect(field.pos.x).toBeGreaterThan(0);
  });

  it('v lednu se na polích nepracuje', () => {
    const kinds = villageLookouts(busy(JANUARY), JANUARY).map((e) => e.kind);
    expect(kinds).not.toContain('field');
    expect(kinds).toContain('kiln');
  });

  it('ves, která se dnes skrývá před vojskem (raid-day), má oči jen v domech', () => {
    const eyes = villageLookouts(busy(JULY, { raidDay: JULY }), JULY);
    expect(eyes.map((e) => e.kind)).toEqual(['home', 'home']);
    // včerejší den nájezdu dnes neplatí
    expect(villageLookouts(busy(JULY, { raidDay: JULY - 1 }), JULY)).toHaveLength(8);
  });

  it('zakladatelé bez obydlí vidí ze staveniště', () => {
    const site = {
      id: 90,
      kind: 'dwelling',
      dwellingId: 1,
      position: { x: -50, z: -50, rotation: 0 },
    } as unknown as VillageState['constructions'][number];
    const founders = busy(JULY, { dwellings: [], constructions: [site] });
    const homes = villageLookouts(founders, JULY).filter((e) => e.kind === 'home');
    expect(homes).toEqual([{ kind: 'home', id: 1, pos: { x: -50, z: -50 } }]);
  });

  it('dvakrát totéž a ves bez lidí nevidí nic', () => {
    expect(villageLookouts(busy(JULY), JULY)).toEqual(villageLookouts(busy(JULY), JULY));
    expect(villageLookouts(busy(JULY, { people: [] }), JULY)).toEqual([]);
  });
});
