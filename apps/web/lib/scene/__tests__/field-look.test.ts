import { describe, expect, it } from 'vitest';
import type { PartStage } from '@bohemia/game';
import type { SceneFieldPart, SceneVillage } from '../../village-view';
import {
  FIELD_LOOKS,
  dayOfYearFromDate,
  estimatePart,
  fieldPartViews,
  grazeablePart,
  villageCenter,
  workAt,
  workFrame,
  workedParts,
  type PartView,
} from '../field-look';

const part = (
  cx: number,
  cy: number,
  stage: PartStage = 'sown',
  extra: Partial<SceneFieldPart> = {},
): SceneFieldPart => ({
  id: cx * 100 + cy,
  cell: { x: cx, y: cy },
  x: cx * 15 + 7.5,
  z: cy * 15 + 7.5,
  size: 15,
  stage,
  ...extra,
});

/** Ves s obydlím u počátku – díly dál od něj přijdou na řadu později. */
const VILLAGE: Pick<SceneVillage, 'dwellings'> = {
  dwellings: [
    {
      id: 1,
      type: 'zemnice',
      position: { x: 0, z: 0, rotation: 0 },
      built: true,
      progress: 1,
    },
  ],
};

/** Pole 4 × 2 čtverce kus od vsi. */
const FIELD = {
  parts: Array.from({ length: 8 }, (_, i) => part(2 + (i % 4), Math.floor(i / 4))),
};

const views = (day: number, field = FIELD): PartView[] =>
  fieldPartViews(field, { dayOfYear: day, village: VILLAGE });

describe('vzhled dílů – odhad ze stadia a data', () => {
  it('zakládaný díl: bez práce jen vytyčený, rozpracovaný rozrytý napůl', () => {
    expect(estimatePart(part(0, 0, 'founding', { work: 0 }), 100, 0, 1)).toEqual({
      look: null,
      work: null,
      before: null,
      staked: true,
    });
    const half = estimatePart(part(0, 0, 'founding', { work: 0.5 }), 100, 0, 1);
    expect(half).toMatchObject({ look: 'bare', work: 0.5, before: null, staked: true });
    expect(estimatePart(part(0, 0, 'ready'), 100, 0, 1).look).toBe('bare');
  });

  it('mladý úhor se pase, starší je louka na seno – nikdy křoví ani les', () => {
    expect(estimatePart(part(0, 0, 'young-fallow'), 100, 0, 1).look).toBe('young-fallow');
    // stadia nálet, křoviny a les příloh nemá (jádro – na přílohu se pase)
    expect(estimatePart(part(0, 0, 'meadow'), 100, 0, 1).look).toBe('meadow');
    expect(estimatePart(part(0, 0, 'meadow'), dayOfYearFromDate(8, 1), 0, 1).look).toBe(
      'haystacks',
    );
  });

  it('louka na seno: tráva, seč po dílech od vsi, stohy přes zimu', () => {
    const hay = { parts: Array.from({ length: 6 }, (_, i) => part(2 + i, 0, 'meadow')) };
    const looks = (month: number, day: number): string[] =>
      views(dayOfYearFromDate(month, day), hay).map((v) => v.look ?? '-');
    expect(new Set(looks(5, 1))).toEqual(new Set(['meadow']));
    const mid = views(dayOfYearFromDate(6, 15), hay);
    expect(mid.some((v) => v.look === 'mown')).toBe(true);
    expect(mid.some((v) => v.look === 'meadow')).toBe(true);
    expect(mid.filter((v) => v.work !== null).length).toBeLessThanOrEqual(1);
    expect(new Set(looks(7, 5))).toEqual(new Set(['mown']));
    expect(new Set(looks(12, 1))).toEqual(new Set(['haystacks']));
  });

  it('osetý díl projde rokem: orba, setí, vzcházení, zelené a zralé obilí, žeň, strniště', () => {
    const at = (month: number, day: number): Set<string> =>
      new Set(views(dayOfYearFromDate(month, day)).map((v) => v.look ?? '-'));
    expect(at(10, 15)).toEqual(new Set(['plowed', 'stubble']));
    expect(at(1, 15)).toEqual(new Set(['plowed', 'stubble']));
    expect(at(4, 15)).toContain('sown');
    expect(at(4, 28)).toContain('sprouted');
    expect(at(6, 20)).toEqual(new Set(['green']));
    expect(at(7, 2)).toContain('ripe');
    expect(at(7, 25)).toContain('harvesting');
    expect(at(8, 30)).toEqual(new Set(['stubble', 'harvesting']));
    expect(at(8, 31).has('ripe')).toBe(false);
  });

  it('práce jde po dílech – v každý den nejvýš jeden rozpracovaný na úlohu, od obydlí', () => {
    for (let day = 1; day <= 365; day++) {
      const working = views(day).filter((v) => v.work !== null);
      const tasks = new Set(working.map((v) => v.look));
      expect(working.length, `den ${day}`).toBe(tasks.size);
    }
    // v polovině žně: díly blíž vsi sklizené, dál zralé
    const mid = views(dayOfYearFromDate(7, 31));
    const reaped = mid.filter((v) => v.look === 'harvesting' || v.look === 'stubble');
    const ripe = mid.filter((v) => v.look === 'ripe');
    expect(reaped.length).toBeGreaterThan(0);
    expect(ripe.length).toBeGreaterThan(0);
    expect(Math.max(...reaped.map((v) => v.order))).toBeLessThan(
      Math.max(...ripe.map((v) => v.order)),
    );
  });

  it('vzhled od herního jádra má přednost; díl s nulovou prací ukáže stav před ní', () => {
    const field = {
      parts: [
        part(2, 0, 'sown', { look: 'harvesting', work: 0.25, before: 'ripe' }),
        part(3, 0, 'sown', { look: 'harvesting', work: 0, before: 'ripe' }),
        part(4, 0, 'founding', { look: 'bare', work: 0 }),
      ],
    };
    const [a, b, c] = views(dayOfYearFromDate(1, 10), field);
    expect(a).toMatchObject({ look: 'harvesting', work: 0.25, before: 'ripe' });
    expect(b).toMatchObject({ look: 'ripe', work: null });
    expect(c).toMatchObject({ look: null, staked: true });
  });

  it('všechny vzhledy mají jméno a jsou různé', () => {
    expect(new Set(FIELD_LOOKS).size).toBe(13);
  });
});

describe('směr práce na dílu', () => {
  it('práce začíná na straně blíž vsi a jde od ní pryč', () => {
    const p = part(3, 0);
    const center = villageCenter(VILLAGE);
    const frame = workFrame(p, [0, 1], center);
    // řádky podél z, ves leží na −x → práce postupuje k +x
    expect(workAt(frame, p, p.x - 7, p.z)).toBeCloseTo(0.0333, 3);
    expect(workAt(frame, p, p.x + 7, p.z)).toBeCloseTo(0.9667, 3);
  });

  it('střed vsi: obydlí, kde se bydlí, jinak všechna, bez obydlí střed pole', () => {
    expect(villageCenter({ dwellings: [] }, [{ x: 10, z: 20 }])).toEqual({ x: 10, z: 20 });
    expect(villageCenter(VILLAGE)).toEqual({ x: 0, z: 0 });
  });
});

describe('na kterých dílech se pracuje', () => {
  it('díly z fronty práce od herního jádra v jejich pořadí', () => {
    const list = workedParts(views(200), 'harvest', [501, 201, 999]);
    expect(list.map((v) => v.part.id)).toEqual([501, 201]);
  });

  it('bez fronty: rozpracovaný díl první, pak díly, na které práce přijde', () => {
    const list = workedParts(views(dayOfYearFromDate(7, 31)), 'harvest');
    expect(list[0]!.work).not.toBeNull();
    expect(list.slice(1).every((v) => v.look === 'ripe')).toBe(true);
    const founding = {
      parts: [
        part(2, 0, 'founding', { work: 0 }),
        part(3, 0, 'founding', { work: 0.4 }),
        part(4, 0, 'ready'),
      ],
    };
    const found = workedParts(views(100, founding), 'found-field');
    expect(found.map((v) => v.part.id)).toEqual([300, 200]);
  });

  it('na mladém úhoru se pase, na louce na seno až po seči, na osetém dílu nikdy', () => {
    const aug = dayOfYearFromDate(8, 15);
    const may = dayOfYearFromDate(5, 15);
    expect(grazeablePart({ stage: 'young-fallow' })).toBe(true);
    expect(grazeablePart({ stage: 'meadow' }, may)).toBe(false);
    expect(grazeablePart({ stage: 'meadow' }, aug)).toBe(true);
    expect(grazeablePart({ stage: 'meadow' })).toBe(false);
    expect(grazeablePart({ stage: 'sown' }, aug)).toBe(false);
    expect(grazeablePart({ stage: 'sown', look: 'pasture' })).toBe(true);
    expect(grazeablePart({ stage: 'meadow', look: 'haystacks' }, aug)).toBe(true);
    expect(grazeablePart({ stage: 'meadow', look: 'mown' }, aug)).toBe(false);
    expect(grazeablePart({ stage: 'young-fallow', look: 'plowed' })).toBe(false);
    // kam stáda nedojdou (nejbližší příloh napřed), ani křoviny a mladý les (fields.md – Zarůstání)
    expect(grazeablePart({ stage: 'young-fallow', grazed: false })).toBe(false);
    expect(grazeablePart({ stage: 'young-fallow', grazed: true })).toBe(true);
    expect(grazeablePart({ stage: 'shrubs', look: 'shrubs' }, aug)).toBe(false);
    expect(grazeablePart({ stage: 'young-forest' }, aug)).toBe(false);
  });
});
