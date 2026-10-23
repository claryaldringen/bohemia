import { describe, expect, it } from 'vitest';
import {
  gravePlaceCenter,
  graveRank,
  moundPlaces,
  moundSizeOf,
  oldGraves,
  placeMound,
  usedPlaces,
} from '../burials';
import { acceptsBurials, bury, cemeteryCapacity, freePlaces } from '../cemetery';
import { cemeteryEntrance } from '../paths/entrances';
import { CEMETERY, GRAVE_PLACES, GRAVE_RANKS, MOUND_SIZES } from '../rules';
import { advanceVillage } from '../simulate';
import { ROTATION_STEP, squareCenter } from '../square-grid';
import { summarizeVillage } from '../summary';
import type {
  Cemetery,
  CemeterySquare,
  GraveMound,
  Person,
  Position,
  SquareGrid,
  VillageState,
} from '../types';
import { NOV1, YEAR, json, village } from './abandonment-fixtures';
import { LANDSCAPE } from './paths-fixtures';

// Mohyly podle významu (cemetery.md – Martin 19. 10. 2026: „Významnější lidé budou mít větší
// mohyly a na prominentnějších místech… Největší mohyly bude mít vojvodova rodina.“).

const DAY = NOV1(620);
const square = (cx: number, cy: number, x: number, z: number): CemeterySquare => ({
  cell: { x: cx, y: cy },
  x,
  z,
  waterDistanceM: 100,
});
const cemetery = (squares: CemeterySquare[], extra: Partial<Cemetery> = {}): Cemetery => ({
  id: 20,
  squares,
  squareSizeM: 15,
  graves: 0,
  builtDay: 0,
  ...extra,
});
/** Obydlí jižně od hřbitova (z menší) – branka je na jižní straně čtverce. */
const SOUTH: Position[] = [{ x: 7.5, z: -60, rotation: 0 }];
const person = (id: number, years: number, dwellingId: number, extra: Partial<Person> = {}) => ({
  id,
  bornDay: DAY - Math.ceil(years * YEAR),
  dwellingId,
  ...extra,
});

/** Střed mohyly ve světě. */
function centerOf(c: Cemetery, m: GraveMound): { x: number; z: number } {
  const q = c.squares.find((s) => s.cell.x === m.cell.x && s.cell.y === m.cell.y)!;
  const { columns, rows } = MOUND_SIZES[m.size];
  return gravePlaceCenter(q, c.squareSizeM, c.grid?.rotation, m.column, m.row, columns, rows);
}

describe('místa na hroby a velikosti mohyl (rules.ts)', () => {
  it('mřížka 7 × 8 na čtverec; vojvoda 2 × 2, ostatní z dvorce a hlava rodiny 2, ostatní 1', () => {
    expect(GRAVE_PLACES.columns * GRAVE_PLACES.rows).toBe(CEMETERY.gravesPerSquare);
    expect(moundPlaces(moundSizeOf('voivode'))).toBe(4);
    expect(moundPlaces(moundSizeOf('manor-adult'))).toBe(2);
    expect(moundSizeOf('manor-child')).toBe('normal');
    // první pravidlo (celá vojvodova rodina 2 × 2) – jen mohyly uložené tehdy
    expect(moundPlaces(moundSizeOf('manor'))).toBe(4);
    expect(moundPlaces(moundSizeOf('head'))).toBe(2);
    expect(moundPlaces(moundSizeOf('adult'))).toBe(1);
    expect(moundPlaces(moundSizeOf('child'))).toBe(1);
    expect(moundSizeOf('child')).toBe('small');
    expect(GRAVE_RANKS.headMinAgeYears).toBe(35);
  });

  it('kapacita v místech: staré hroby po jednom místě, mohyly podle velikosti', () => {
    const c = cemetery([square(0, 0, 7.5, 7.5)], {
      graves: 12,
      mounds: [
        { cell: { x: 0, y: 0 }, column: 0, row: 6, size: 'great', rank: 'manor', day: 1 },
        { cell: { x: 0, y: 0 }, column: 6, row: 6, size: 'large', rank: 'head', day: 2 },
      ],
    });
    expect(oldGraves(c)).toBe(10);
    expect(usedPlaces(c)).toBe(10 + 4 + 2);
    expect(cemeteryCapacity(c)).toBe(56);
    expect(freePlaces(c)).toBe(40);
    // staré uložené hřbitovy (bez mohyl) – jako dřív
    expect(usedPlaces(cemetery([square(0, 0, 7.5, 7.5)], { graves: 30 }))).toBe(30);
  });

  it('střed místa sedí s mřížkou čtverce – i natočeného (fields.md – Natočené stavby)', () => {
    const q = { x: 7.5, z: 7.5 };
    // místo (0, 0) v rohu −x −z, krok 11/7 × 11/8 m po okraji 2 m (plot 1,5 m + 0,5 m)
    const first = gravePlaceCenter(q, 15, undefined, 0, 0);
    expect(first.x).toBeCloseTo(2 + 11 / 14, 9);
    expect(first.z).toBeCloseTo(2 + 11 / 16, 9);
    const block = gravePlaceCenter(q, 15, undefined, 2, 3, 2, 2);
    expect(block.x).toBeCloseTo(2 + (11 / 7) * 3, 9);
    expect(block.z).toBeCloseTo(2 + (11 / 8) * 4, 9);
    // natočený o 90°: sloupec jde po ose mřížky (−z ve světě), řada po +x
    const turned = gravePlaceCenter(q, 15, 6 * ROTATION_STEP, 0, 0);
    const straight = gravePlaceCenter(q, 15, undefined, 0, 0);
    expect(Math.hypot(turned.x - q.x, turned.z - q.z)).toBeCloseTo(
      Math.hypot(straight.x - q.x, straight.z - q.z),
      9,
    );
    const right = gravePlaceCenter(q, 15, 6 * ROTATION_STEP, 1, 0);
    expect(right.x - turned.x).toBeCloseTo(0, 9);
    expect(right.z - turned.z).toBeCloseTo(-11 / 7, 9);
  });
});

describe('druh pohřbeného (graveRank)', () => {
  /** Ves s dvorcem (domácnost 1) a domácností 2: dědeček, otec, matka, syn, vnuk. */
  function family(): VillageState {
    const s = village(DAY);
    s.manorId = 1;
    s.people = [
      person(10, 50, 1, { sex: 'male', spouseId: 11 }),
      person(11, 48, 1, { sex: 'female', spouseId: 10 }),
      person(12, 6, 1, { sex: 'male', motherId: 11, fatherId: 10 }),
      person(13, 20, 1, { sex: 'male', motherId: 11, fatherId: 10 }),
      person(20, 66, 2, { sex: 'male' }),
      person(21, 40, 2, { sex: 'male', spouseId: 22, fatherId: 20 }),
      person(22, 38, 2, { sex: 'female', spouseId: 21 }),
      person(23, 15, 2, { sex: 'male', motherId: 22, fatherId: 21 }),
      person(24, 3, 2, { sex: 'female', motherId: 22, fatherId: 21 }),
      person(30, 30, 3, { sex: 'male', spouseId: 31 }),
      person(31, 29, 3, { sex: 'female', spouseId: 30 }),
      person(32, 2, 3, { sex: 'female', motherId: 31, fatherId: 30 }),
      person(40, 52, 4, { sex: 'female' }),
    ];
    s.emigrants = [
      { id: 41, sex: 'female', bornDay: DAY - 25 * 365, direction: 'N', motherId: 40 },
    ];
    return s;
  }
  const rank = (s: VillageState, id: number) =>
    graveRank(
      s,
      s.people.find((p) => p.id === id)!,
      DAY,
    );

  it('vojvodova rodina odstupňovaná: vojvoda a jeho žena, ostatní dospělí z dvorce, děti z dvorce', () => {
    const s = family();
    expect([10, 11, 13, 12].map((id) => rank(s, id))).toEqual([
      'voivode',
      'voivode',
      'manor-adult',
      'manor-child',
    ]);
    // vojvoda zemřel – vojvodou je dospělý syn, vdova je jen z vojvodovy rodiny
    s.people = s.people.filter((p) => p.id !== 10);
    expect([13, 11].map((id) => rank(s, id))).toEqual(['voivode', 'manor-adult']);
    // dvorec bez muže – vojvodou je nejstarší žena
    s.people = s.people.filter((p) => p.id !== 13);
    expect(rank(s, 11)).toBe('voivode');
  });

  it('hlava rodiny: nejstarší muž domácnosti s dítětem od 35 let a jeho žena; děti v dětském věku', () => {
    const s = family();
    // dědeček má syna 21 – hlava; syn 40 s dětmi žije u otce – jen dospělý; jeho žena taky
    expect(rank(s, 20)).toBe('head');
    expect(rank(s, 21)).toBe('adult');
    expect(rank(s, 22)).toBe('adult');
    expect(rank(s, 23)).toBe('adult');
    expect(rank(s, 24)).toBe('child');
    // mladá hlava (30 let) ještě zasloužilá není
    expect(rank(s, 30)).toBe('adult');
    // vdova bez muže v domě s dcerou vdanou pryč
    expect(rank(s, 40)).toBe('head');
    // když dědeček zemře, hlavou je syn a jeho žena
    s.people = s.people.filter((p) => p.id !== 20);
    expect(rank(s, 21)).toBe('head');
    expect(rank(s, 22)).toBe('head');
  });
});

describe('místo mohyly (placeMound)', () => {
  const one = (): Cemetery => cemetery([square(0, 0, 7.5, 7.5)]);
  const gateOf = (c: Cemetery) =>
    cemeteryEntrance(
      { squares: c.squares.map((q) => ({ ...q, size: 15 })), built: true },
      SOUTH.map((position) => ({ position, built: true })),
    )!;

  it('vojvoda a hlava rodiny u branky na ose, dospělý mimo osu, dítě vzadu na okraji', () => {
    const c = one();
    const gate = gateOf(c);
    expect(gate.outZ).toBe(-1);
    const manor = placeMound(c, 'voivode', DAY, SOUTH)!;
    expect(manor).toMatchObject({ size: 'great', rank: 'voivode', row: 0 });
    const m = centerOf(c, manor);
    expect(Math.abs(m.x - gate.x)).toBeLessThanOrEqual(1);
    (c.mounds ??= []).push(manor);
    const head = placeMound(c, 'head', DAY, SOUTH)!;
    expect(head.size).toBe('large');
    const h = centerOf(c, head);
    expect(Math.abs(h.x - gate.x)).toBeLessThan(GRAVE_RANKS.laneHalfWidthM + 1);
    c.mounds.push(head);
    const adult = placeMound(c, 'adult', DAY, SOUTH)!;
    const a = centerOf(c, adult);
    expect(Math.abs(a.x - gate.x)).toBeGreaterThanOrEqual(GRAVE_RANKS.laneHalfWidthM);
    expect(adult.row).toBe(0);
    const child = placeMound(c, 'child', DAY, SOUTH)!;
    expect(child.size).toBe('small');
    // nejdál od branky – zadní řada, v rohu
    expect(child.row).toBe(GRAVE_PLACES.rows - 1);
    expect([0, GRAVE_PLACES.columns - 1]).toContain(child.column);
    expect(m.z).toBeLessThan(centerOf(c, child).z);
  });

  it('začátek osy u branky drží vojvodova rodina; dítě z dvorce leží líp než ostatní děti', () => {
    const front = (m: GraveMound, c: Cemetery): boolean => {
      const gate = gateOf(c);
      const p = centerOf(c, m);
      return (
        Math.abs(p.x - gate.x) < GRAVE_RANKS.laneHalfWidthM &&
        p.z - gate.z < GRAVE_RANKS.manorFrontM
      );
    };
    // hlava rodiny, která zemře první, začátek osy vynechá – dospělý z dvorce ho dostane
    const c = one();
    const head = placeMound(c, 'head', DAY, SOUTH)!;
    expect(front(head, c)).toBe(false);
    (c.mounds ??= []).push(head);
    const kin = placeMound(c, 'manor-adult', DAY, SOUTH)!;
    expect(kin.size).toBe('large');
    expect(front(kin, c)).toBe(true);
    expect(centerOf(c, kin).z).toBeLessThan(centerOf(c, head).z);
    // dítě z dvorce: běžná mohyla u branky mimo osu; ostatní dítě malá vzadu
    const heir = placeMound(c, 'manor-child', DAY, SOUTH)!;
    const child = placeMound(c, 'child', DAY, SOUTH)!;
    expect(heir).toMatchObject({ size: 'normal', row: 0 });
    expect(child.size).toBe('small');
    expect(centerOf(c, heir).z).toBeLessThan(centerOf(c, child).z);
  });

  it('velká mohyla, která se nevejde, se zmenší – prominentní místo zůstává', () => {
    // šachovnice běžných mohyl – žádný blok 2 míst není volný
    const mounds: GraveMound[] = [];
    for (let row = 0; row < GRAVE_PLACES.rows; row++) {
      for (let column = 0; column < GRAVE_PLACES.columns; column++) {
        if ((row + column) % 2 === 0) {
          mounds.push({ cell: { x: 0, y: 0 }, column, row, size: 'normal', rank: 'adult', day: 1 });
        }
      }
    }
    const c = cemetery([square(0, 0, 7.5, 7.5)], { graves: mounds.length, mounds });
    const manor = placeMound(c, 'voivode', DAY, SOUTH)!;
    expect(manor).toMatchObject({ size: 'normal', rank: 'voivode', row: 0 });
    const head = placeMound(c, 'head', DAY, SOUTH)!;
    expect(head.size).toBe('normal');
    // plný hřbitov místo nemá
    const full = cemetery([square(0, 0, 7.5, 7.5)], { graves: 56 });
    expect(placeMound(full, 'child', DAY, SOUTH)).toBeNull();
  });

  it('staré hroby leží na prvních místech po řadách – nové mohyly se jim vyhnou', () => {
    const c = cemetery([square(0, 0, 7.5, 7.5)], { graves: 10 });
    const taken = new Set(Array.from({ length: 10 }, (_, i) => `${i % 7},${Math.floor(i / 7)}`));
    for (let k = 0; k < 12; k++) {
      const m = placeMound(c, k % 3 === 0 ? 'voivode' : 'adult', DAY, SOUTH)!;
      const { columns, rows } = MOUND_SIZES[m.size];
      for (let r = m.row; r < m.row + rows; r++) {
        for (let col = m.column; col < m.column + columns; col++) {
          expect(taken.has(`${col},${r}`), `${col},${r}`).toBe(false);
          taken.add(`${col},${r}`);
        }
      }
      (c.mounds ??= []).push(m);
      c.graves += 1;
    }
    expect(oldGraves(c)).toBe(10);
    expect(usedPlaces(c)).toBe(taken.size);
  });

  it('natočený hřbitov o dvou čtvercích – mohyly v jeho mřížce, významní u branky', () => {
    const grid: SquareGrid = { x: 7.5, z: 7.5, rotation: 2 * ROTATION_STEP };
    const sq = (cx: number, cy: number): CemeterySquare => {
      const p = squareCenter(LANDSCAPE, grid, { x: cx, y: cy });
      return square(cx, cy, p.x, p.z);
    };
    const c = cemetery([sq(0, 0), sq(0, 1)], { grid });
    const manor = placeMound(c, 'voivode', DAY, SOUTH)!;
    const child = placeMound(c, 'child', DAY, SOUTH)!;
    const gate = cemeteryEntrance(
      {
        squares: c.squares.map((q) => ({ ...q, size: 15, rotation: grid.rotation })),
        built: true,
      },
      SOUTH.map((position) => ({ position, built: true })),
    )!;
    const d = (p: { x: number; z: number }): number => Math.hypot(p.x - gate.x, p.z - gate.z);
    expect(d(centerOf(c, manor))).toBeLessThan(d(centerOf(c, child)));
    // mohyla leží uvnitř svého natočeného čtverce
    const q = c.squares.find((s) => s.cell.y === manor.cell.y)!;
    const p = centerOf(c, manor);
    expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThan(7.5);
  });
});

describe('pohřeb (bury)', () => {
  it('mohyla podle druhu zemřelého; hřbitov se zaplní podle míst, ne lidí', () => {
    const s = village(DAY);
    s.manorId = 1;
    // 46 starých hrobů: řady 0–5 a začátek řady 6 – zbývá blok 2 × 2 vzadu
    s.cemeteries = [cemetery([square(4, -2, 67.5, -22.5)], { graves: 46 })];
    const lord = s.people.find((p) => p.dwellingId === 1)!;
    expect(bury(s, DAY, lord)).toBeNull();
    const c = s.cemeteries[0]!;
    expect(c.mounds).toEqual([
      expect.objectContaining({ rank: 'voivode', size: 'great', day: DAY, from: 1 }),
    ]);
    expect(c.graves).toBe(47);
    expect(freePlaces(c)).toBe(6);
    // šest běžných dospělých místa dobere – hřbitov je plný (žádné volné místo)
    const other = s.people.find((p) => p.dwellingId === 2)!;
    for (let k = 1; k <= 5; k++) expect(bury(s, DAY + k, other)).toBeNull();
    expect(bury(s, DAY + 6, other)).toEqual({
      day: DAY + 6,
      kind: 'cemetery-full',
      cemeteryId: 20,
      othersFree: false,
      othersBuilding: false,
    });
    expect(acceptsBurials(c)).toBe(false);
    expect(c.graves).toBe(53);
    expect(bury(s, DAY + 7, other)).toBeNull();
    expect(c.graves).toBe(53);
    // panel: obsazená místa a pohřbení
    const summary = summarizeVillage(s, DAY + 7).cemeteries[0]!;
    expect(summary).toMatchObject({ capacity: 56, usedPlaces: 56, freePlaces: 0, graves: 53 });
  });
});

describe('domácnost zemřelého – odkud vyjde průvod (cemetery.md – Pohřeb ve scéně)', () => {
  it('bury zapíše domácnost zemřelého; bez člověka (testy) ji nezná', () => {
    const s = village(DAY);
    s.cemeteries = [cemetery([square(4, -2, 67.5, -22.5)])];
    const other = s.people.find((p) => p.dwellingId === 2)!;
    bury(s, DAY, other);
    bury(s, DAY + 1);
    const [first, second] = s.cemeteries[0]!.mounds!;
    expect(first).toMatchObject({ day: DAY, from: 2 });
    expect(second).toMatchObject({ day: DAY + 1 });
    expect(second).not.toHaveProperty('from');
  });

  it('v simulaci má každá nová mohyla domácnost, ve které zemřelý bydlel', () => {
    const s = village(DAY);
    s.manorId = 1;
    s.foundedDay = DAY - Math.ceil(60 * YEAR);
    for (const p of s.people) p.bornDay -= Math.ceil(35 * YEAR);
    s.cemeteries = [cemetery([square(4, -2, 67.5, -22.5), square(4, -1, 67.5, -7.5)])];
    const homes = new Set(s.people.map((p) => p.dwellingId));
    const end = advanceVillage(s, DAY + Math.round(4 * YEAR), null);
    const mounds = end.cemeteries![0]!.mounds ?? [];
    expect(mounds.length).toBeGreaterThan(0);
    for (const m of mounds) expect(homes.has(m.from!)).toBe(true);
  }, 120_000);
});

describe('mohyly v simulaci', () => {
  /** Stará ves se hřbitovem a starými hroby – lidé umírají. */
  function aging(): VillageState {
    const s = village(DAY);
    s.manorId = 1;
    // po hájení (prvních 30 let) – staří lidé umírají
    s.foundedDay = DAY - Math.ceil(60 * YEAR);
    for (const p of s.people) p.bornDay -= Math.ceil(35 * YEAR);
    s.cemeteries = [
      cemetery([square(4, -2, 67.5, -22.5), square(4, -1, 67.5, -7.5)], { graves: 9 }),
    ];
    return s;
  }

  it('lidé dostanou mohyly podle významu; nezávisí na kouscích dopočtu', () => {
    const start = aging();
    // starší pracují jen na denním minimu (population.md – Práce) – za 8 let umře i někdo z dvorce
    const end = DAY + Math.round(8 * YEAR);
    const whole = advanceVillage(start, end, null);
    const c = whole.cemeteries![0]!;
    expect(oldGraves(c)).toBe(9);
    expect(c.mounds!.length).toBeGreaterThan(3);
    expect(c.graves).toBe(9 + c.mounds!.length);
    expect(new Set(c.mounds!.map((m) => m.rank)).size).toBeGreaterThan(1);
    const steps = [37, 91, 13, 200];
    let chunked = json(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = json(
        advanceVillage(chunked, Math.min(end, chunked.lastDay + steps[i % steps.length]!), null),
      );
    }
    expect(chunked).toEqual(json(whole));
  }, 120_000);

  it('hřbitov uložený dřív (jen počet hrobů) se načte beze změny', () => {
    const s = aging();
    s.people = [];
    s.extinctDay = DAY;
    const after = advanceVillage(json(s), DAY + 30, null);
    expect(after.cemeteries).toEqual(s.cemeteries);
    expect(after.cemeteries![0]).not.toHaveProperty('mounds');
  });
});
