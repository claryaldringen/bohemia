import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { advanceVillage } from '../../core/simulate';
import { LIME, MASON_CRAFTS } from '../../rules';
import type { Construction, MasonCraft, Person, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import {
  CHURCH_EAST_ROTATION,
  CHURCH_NO_LODGE,
  CHURCH_NO_QUARRY,
  CHURCH_WRONG_TYPE,
  churchBlocked,
  churchMaterials,
  churchProgress,
  churchMorning,
  churchSeason,
  churchWorkDay,
  gainMasonryXp,
  snapChurchRotation,
  startChurch,
} from '../church-build';
import { defaultChurchDims } from '../church-geometry';

// Stavba kostela (churches.md – Stavba; stone-masonry.md – Vápno a malta, Zkušenost a noví mistři).

const DAY = dayIndexOf({ year: 600, month: 3, day: 1 });
const YEAR = 365;
const ROTUNDA = { type: 'rotunda' as const, dims: defaultChurchDims('rotunda') };

/** Ves s karolinskou hutí (mistři `crafts`), lomem 300 m od kostela a dospělými muži navíc. */
function churchVillage(crafts: readonly MasonCraft[] = MASON_CRAFTS, men = 0): VillageState {
  const base = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: -90, z: -90, rotation: 0 } }),
  );
  const home = base.dwellings[0]!.id;
  let id = base.nextId;
  const person = (extra: Partial<Person>): Person => ({
    id: id++,
    bornDay: DAY - 30 * YEAR,
    dwellingId: home,
    sex: 'male',
    faith: 'christian',
    ...extra,
  });
  const masters = crafts.map((mason) => person({ mason }));
  const helpers = Array.from({ length: men }, () => person({}));
  return {
    ...base,
    nextId: id,
    people: [...base.people, ...masters, ...helpers],
    // maso a luštěniny: čistě obilná strava má nasycení pod 0,8 a mistři by do 30 dnů odešli (lodge-life.ts)
    storesKg: base.storesKg + 200000,
    meatKg: 20000,
    legumesKg: 20000,
    lodge: { circle: 'carolingian', invitedDay: DAY - 60 },
    quarries: [{ outcropId: 7, x: 300, z: 0, rotation: 0, builtDay: DAY - 10 }],
  };
}

function started(state: VillageState): VillageState {
  const r = startChurch(state, state.lastDay, null, null, {
    ...ROTUNDA,
    position: { x: 0, z: 0, rotation: 0 },
  });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const site = (s: VillageState): Construction | undefined =>
  s.constructions.find((c) => c.kind === 'church');

describe('natočení a zahájení', () => {
  it('výchozí natočení je kněžištěm na východ (+x), krok 15°', () => {
    expect(CHURCH_EAST_ROTATION).toBe(0);
    expect(snapChurchRotation(0.1)).toBe(0);
    expect(snapChurchRotation(0.2)).toBeCloseTo(Math.PI / 12);
    expect(snapChurchRotation(-Math.PI / 2 + 0.01)).toBeCloseTo(-Math.PI / 2);
  });

  it('bez stavbyvedoucího, mimo okruh nebo bez lomu kostel nezačne; jinak bez ceny předem', () => {
    const at = { x: 0, z: 0, rotation: 0 };
    const noBuilder = churchVillage(['mason']);
    expect(startChurch(noBuilder, DAY, null, null, { ...ROTUNDA, position: at })).toEqual({
      ok: false,
      reason: CHURCH_NO_LODGE,
    });
    const wrong = startChurch(churchVillage(), DAY, null, null, {
      type: 'basilica',
      dims: defaultChurchDims('basilica'),
      position: at,
    });
    expect(wrong).toEqual({ ok: false, reason: CHURCH_WRONG_TYPE });
    const noQuarry = { ...churchVillage(), quarries: [] };
    expect(startChurch(noQuarry, DAY, null, null, { ...ROTUNDA, position: at })).toEqual({
      ok: false,
      reason: CHURCH_NO_QUARRY,
    });
    const state = churchVillage();
    const next = started(state);
    expect(next.storesKg).toBe(state.storesKg);
    const c = site(next)!;
    expect(c.church?.quarryId).toBe(7);
    expect(c.church?.quarryManDaysPerM3).toBeGreaterThan(1);
    expect(c.wood?.trees).toBeGreaterThan(100);
    expect(site(state)).toBeUndefined();
  });
});

describe('stavba v simulaci', () => {
  const state = started(churchVillage());

  it('malá rotunda se dostaví za 1–3 roky, vyzdobí a staveniště skončí', () => {
    let s = state;
    let roofDay: number | null = null;
    for (let d = 0; d < 3 * YEAR && site(s); d += 10) {
      s = advanceVillage(s, s.lastDay + 10, null, null);
      if (roofDay === null && s.churches?.length) roofDay = s.lastDay;
    }
    expect(site(s)).toBeUndefined();
    const church = s.churches?.[0];
    expect(church?.type).toBe('rotunda');
    expect(church?.finishedDay).toBeGreaterThan(DAY + YEAR / 2);
    expect(church?.decoratedDay).toBeGreaterThanOrEqual(church!.finishedDay);
    expect(church!.decoratedDay! - DAY).toBeLessThan(3 * YEAR);
    // zkušenost pomocníků roste (ne mistrů)
    const helpers = s.people.filter((p) => !p.mason && (p.masonryXp?.mason ?? 0) > 0);
    expect(helpers.length).toBeGreaterThan(0);
    expect(s.people.filter((p) => p.mason).every((p) => p.masonryXp === undefined)).toBe(true);
  });

  it('v zimě zdi, základy a pálení stojí, lámání, písek a pec běží; v dubnu se pálí', () => {
    const s = structuredClone(state);
    const c = site(s)!;
    c.done = c.church!.prepManDays;
    const winter = dayIndexOf({ year: 600, month: 12, day: 1 });
    expect(churchSeason(winter)).toBe(false);
    const r = churchWorkDay(s, c, 1000, winter);
    expect(r.byWork.quarry).toBeGreaterThan(0);
    expect(r.byWork.sand).toBeGreaterThan(0);
    expect(r.byWork.lime).toBe(LIME.kilnBuildManDays);
    expect(r.byWork.foundation ?? 0).toBe(0);
    expect(r.byWork.walls ?? 0).toBe(0);
    expect(c.church!.burnT).toBeUndefined();
    // v dubnu se naloží první dávka a pálí se; zdi čekají na vápno
    const spring = dayIndexOf({ year: 601, month: 4, day: 1 });
    expect(churchSeason(spring)).toBe(true);
    const r2 = churchWorkDay(s, c, 1000, spring);
    expect(r2.byWork.lime).toBeCloseTo(LIME.kilnBatchLimeT * LIME.manDaysPerLimeT);
    expect(c.church!.burnT).toBe(LIME.kilnBatchLimeT);
    expect(c.church!.burnUntilDay).toBe(spring + LIME.kilnBurnDays);
    expect(r2.byWork.foundation ?? 0).toBe(0);
    churchMorning(s, spring + LIME.kilnBurnDays);
    expect(c.church!.limeT).toBe(LIME.kilnBatchLimeT);
    const r3 = churchWorkDay(s, c, 1000, spring + LIME.kilnBurnDays);
    expect(r3.byWork.foundation).toBeGreaterThan(0);
    expect(churchProgress(c.church!).walls).toBeLessThan(1);
  });

  it('rozdělení práce dne ukáže, na čem se na kostele pracovalo (mistři ve scéně)', () => {
    const s = advanceVillage(state, state.lastDay + 120, null, null);
    const c = site(s)!;
    const share = s.labor?.shares.find(
      (x) => x.activity === 'build' && x.target.kind === 'site' && x.target.id === c.id,
    );
    expect(share?.churchWork).toContain('quarry');
    // jen druhy, na které dnes došlo – bez zdí (vápno ještě není)
    expect(share?.churchWork).not.toContain('walls');
  });

  it('vcelku = po kouscích přes 1. 11. a 1. 4.', () => {
    const to = dayIndexOf({ year: 601, month: 5, day: 15 });
    const whole = advanceVillage(state, to, null, null);
    let chunked = state;
    for (const end of [
      dayIndexOf({ year: 600, month: 10, day: 31 }),
      dayIndexOf({ year: 600, month: 11, day: 1 }),
      dayIndexOf({ year: 601, month: 3, day: 31 }),
      dayIndexOf({ year: 601, month: 4, day: 1 }),
      to,
    ]) {
      chunked = advanceVillage(chunked, end, null, null);
    }
    expect(chunked).toEqual(whole);
  });
});

describe('mistři', () => {
  it('bez stavbyvedoucího stojí vše', () => {
    const s0 = started(churchVillage());
    const noBuilder = { ...s0, people: s0.people.filter((p) => p.mason !== 'builder') };
    const s = advanceVillage(noBuilder, DAY + 120, null, null);
    expect(site(s)!.done).toBe(0);
    expect(churchBlocked(s, site(s)!.church!)).toBe('builder');
  });

  it('bez vápeníka nevznikne vápno a zdi se zastaví', () => {
    const s0 = started(churchVillage());
    const noLime = { ...s0, people: s0.people.filter((p) => p.mason !== 'limeBurner') };
    const s = advanceVillage(noLime, DAY + YEAR, null, null);
    const c = site(s)!.church!;
    expect(c.limeT).toBe(0);
    expect(churchMaterials(c).builtM3).toBe(0);
    expect(churchProgress(c).walls).toBe(0);
    expect(churchBlocked(s, c)).toBe('limeBurner');
  });
});

describe('gainMasonryXp', () => {
  it('po 1 čd od nejzkušenějších, ne mistři; syn mistra od 12 let 1 čd', () => {
    const s = churchVillage(['mason'], 3);
    const master = s.people.find((p) => p.mason === 'mason')!;
    const helpers = s.people.filter((p) => !p.mason && p.bornDay === DAY - 30 * YEAR);
    helpers[1]!.masonryXp = { mason: 5 };
    const son: Person = {
      id: 999,
      bornDay: DAY - 13 * YEAR,
      dwellingId: master.dwellingId,
      fatherId: master.id,
      sex: 'male',
    };
    s.people.push(son);
    gainMasonryXp(s, { mason: 1.5 }, DAY, [...helpers, master, son]);
    expect(helpers[1]!.masonryXp).toEqual({ mason: 6 });
    expect(helpers[0]!.masonryXp).toEqual({ mason: 0.5 });
    expect(helpers[2]!.masonryXp).toBeUndefined();
    expect(master.masonryXp).toBeUndefined();
    expect(son.masonryXp).toEqual({ mason: 1 });
  });
});
