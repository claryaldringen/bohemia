import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import {
  fieldFrontiers,
  fieldPartLooks,
  frontierPart,
  partYearWork,
  partsWorked,
  taskPosition,
  taskSpans,
  type FieldPartLook,
} from '../field-progress';
import { laborReport } from '../labor-report';
import { advanceVillage } from '../simulate';
import type { FieldPart, VillageState } from '../types';
import { PLOUGH_SOD_FACTOR } from '../plough';
import { neededTaskRemaining, partWeight, planPartIds } from '../year-plan';
import { herdingDay } from '../herding';
import { villageOxen } from '../oxen';
import { withRoomyPens } from './village-fixtures';

// Postup práce po čtvercích (fields.md; Martin, 18. 10. 2026): kopání, setí a sklizeň mění díl, až
// k němu práce dojde – díly plodiny v pořadí plánu (nejblíž obydlím první), čelo práce je díl,
// na kterém se právě pracuje; vzejití a zrání jdou podle kalendáře.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const field = (count: number): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 150 + ((i * 37) % 200), // různé vzdálenosti – pořadí podle nich
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
const village = (): VillageState =>
  foundVillage({
    seed: 42,
    day: at(600, 3, 15),
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: { parts: field(75) },
  });
/**
 * Ves s ohradami všech druhů – stáda (a práce u nich) jako před ohradami podle druhu, žeň ozimu
 * 10. 7. 602 tak běží (oxen.md – Ohrady podle druhu).
 */
const penned = (): VillageState => withRoomyPens(village());
const byId = (s: VillageState): Map<number, FieldPart> => new Map(s.parts.map((p) => [p.id, p]));
/** Vzhled dílů plodiny v pořadí postupu (u rozpracovaného dílu hotová část). */
const statesInOrder = (s: VillageState, partIds: number[]): FieldPartLook[] => {
  const looks = fieldPartLooks(s, s.lastDay);
  return partIds.map((id) => looks.get(id)!.look);
};
/** Jak daleko práce na dílu je – v jednom období (podzim, nebo léto). */
const AUTUMN: Partial<Record<FieldPartLook, number>> = { stubble: 0, plowed: 1, sown: 2 };
const SUMMER: Partial<Record<FieldPartLook, number>> = { ripe: 0, harvesting: 1 };

describe('pořadí a úseky dílů', () => {
  it('díly plodiny jdou od obydlí, úseky pokryjí celou práci, čelo je první nedokončený', () => {
    const s = advanceVillage(village(), at(601, 9, 1), null);
    const winter = s.plan!.winter!;
    const distances = winter.partIds.map((id) => s.parts.find((p) => p.id === id)!.distanceM);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    const spans = taskSpans(winter, byId(s), 'dig', s.lastDay);
    expect(spans.map((x) => x.id)).toEqual(winter.partIds);
    expect(spans[0]!.start).toBe(0);
    expect(spans.at(-1)!.end).toBeCloseTo(1, 9);
    const position = taskPosition(winter, 'dig');
    const frontier = frontierPart(winter, byId(s), 'dig', s.lastDay);
    expect(spans.find((x) => x.id === frontier)!.end).toBeGreaterThan(position);
    expect(spans.find((x) => x.id === frontier)!.start).toBeLessThanOrEqual(position + 1e-9);
  });
});

describe('postup po čtvercích', () => {
  it('kopání a setí ozimu: hotové díly v pořadí, zbytek čeká; čelo dne mezi nimi', () => {
    const s = advanceVillage(village(), at(601, 9, 20), null);
    const winter = s.plan!.winter!;
    const states = statesInOrder(s, winter.partIds);
    // od obydlí: nejdřív zasetí, pak zkopaní, pak loňské strniště – nikdy naopak
    const levels = states.map((x) => AUTUMN[x]!);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    expect(states).toContain('plowed');
    expect(states).toContain('stubble');
    const dug = states.filter((x) => x !== 'stubble').length / states.length;
    expect(dug).toBeCloseTo(taskPosition(winter, 'dig'), 1);
    // čelo kopání: fieldFrontiers a rozpracovaný díl s podílem práce a vzhledem zbytku
    const frontier = frontierPart(winter, byId(s), 'dig', s.lastDay)!;
    expect(fieldFrontiers(s, s.lastDay).get(frontier)).toContain('dig');
    const view = fieldPartLooks(s, s.lastDay).get(frontier)!;
    expect(view).toMatchObject({ look: 'plowed', before: 'stubble' });
    expect(view.work).toBeGreaterThanOrEqual(0);
    expect(view.work).toBeLessThan(1);
  });

  it('rozdělení práce dne míří na díly, přes které dnes práce postoupila', () => {
    const before = advanceVillage(village(), at(601, 9, 19), null);
    const s = advanceVillage(before, at(601, 9, 20), null);
    const winter = s.plan!.winter!;
    const shares = laborReport(s)!.shares.filter(
      (x) => (x.activity === 'dig' || x.activity === 'sow') && x.target.kind === 'field',
    );
    expect(shares.length).toBeGreaterThan(0);
    for (const share of shares) {
      const parts = share.target.kind === 'field' ? (share.target.parts ?? []) : [];
      expect(parts.length).toBeGreaterThan(0);
      const task = share.activity as 'dig' | 'sow';
      const worked = partsWorked(
        winter,
        byId(s),
        task,
        s.lastDay,
        before.plan!.winter!.done[task],
        winter.done[task],
      ).map((x) => x.id);
      expect(parts).toEqual(worked);
    }
    // jen díly plánu, v pořadí postupu
    const inPlan = planPartIds(s.plan!);
    for (const share of shares) {
      if (share.target.kind !== 'field') continue;
      for (const id of share.target.parts ?? []) expect(inPlan).toContain(id);
    }
  });

  it('děti 7–13 let, které nepasou, plejí – malé postavy (fields.md – Pletí – děti)', () => {
    const start = penned();
    const nextId = Math.max(...start.people.map((p) => p.id)) + 1;
    // šest dětí 7–12 let – část pase, ostatní plejí
    const home = start.people[0]!.dwellingId;
    for (let k = 0; k < 6; k++) {
      start.people.push({ id: nextId + k, bornDay: at(590 + k, 3, 1), dwellingId: home });
    }
    let s = advanceVillage(start, at(602, 4, 30), null);
    let kidsDays = 0;
    for (let day = at(602, 5, 1); day <= at(602, 6, 30); day++) {
      s = advanceVillage(s, day, null);
      const kids = s.labor!.shares.filter((x) => x.activity === 'weed' && x.ages !== undefined);
      if (kids.length === 0) continue;
      kidsDays++;
      expect(kids.every((x) => x.ages!.every((age) => age >= 7 && age <= 13))).toBe(true);
      // pasáci mají přednost – plejí jen ti, kdo nepasou
      if (herdingDay(s, day, villageOxen(s)).demand > 0) {
        expect(kids[0]!.ages!.length).toBeLessThan(6);
      }
    }
    expect(kidsDays).toBeGreaterThan(0);
  });

  it('nutná seč dostane práci mužů i v okně pletí – plejí napřed ženy a děti (fields.md – Pletí jednou a rychle)', () => {
    let s = advanceVillage(penned(), at(602, 5, 25), null);
    // pletí jaře znovu od začátku – vydrží do konce května
    s.plan!.done.weed = 0;
    // 1. seč s velkou nutnou prací – ves by sekala celý den
    s.hay = {
      kg: 0,
      mowing: {
        partIds: [],
        squares: [{ cell: { x: 0, y: 0 }, areaM2: 1_000_000, distanceM: 0 }],
        required: 10_000,
        done: 0,
        yieldKg: 150_000,
        needed: 10_000,
      },
    };
    let busyDays = 0;
    for (let day = at(602, 5, 26); day <= at(602, 5, 31); day++) {
      const weedBefore = neededTaskRemaining(s.plan!, 'weed');
      s = advanceVillage(s, day, null);
      // pletí, které ten den ves nedokončila – plely ženy a děti, muži sekali
      if (weedBefore > 1e-6 && neededTaskRemaining(s.plan!, 'weed') > 1e-6) {
        busyDays++;
        expect(s.labor!.shares.some((x) => x.activity === 'weed')).toBe(true);
        expect(s.labor!.shares.some((x) => x.activity === 'mow')).toBe(true);
      }
    }
    expect(busyDays).toBeGreaterThan(0);
  });

  it('sklizeň ozimu v červenci: sklizené díly s panáky, nesklizené zůstanou zralé', () => {
    const s = advanceVillage(penned(), at(602, 7, 5), null);
    const states = statesInOrder(s, s.plan!.winter!.partIds);
    expect(states).toContain('harvesting');
    expect(states).toContain('ripe');
    const levels = states.map((x) => SUMMER[x]!);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    // po konci sklizně (31. 7.) je celý ozim strniště
    const after = advanceVillage(s, at(602, 8, 1), null);
    expect(new Set(statesInOrder(after, after.plan!.winter!.partIds))).toEqual(
      new Set(['stubble']),
    );
  });

  it('zakládání po dílech: rozrytý drn, rozpracovaný s podílem založení, nezačatý vytyčený', () => {
    const s = advanceVillage(village(), at(600, 4, 1), null);
    const looks = fieldPartLooks(s, s.lastDay);
    const founding = s.parts.filter((p) => p.state === 'founding');
    expect(founding.length).toBeGreaterThan(0);
    for (const p of founding) {
      const view = looks.get(p.id)!;
      expect(view.look).toBe('bare');
      expect(view.work).toBeCloseTo(Math.round((p.foundingDone / p.foundingCost) * 20) / 20, 9);
    }
    expect(founding.filter((p) => (looks.get(p.id)!.work ?? 0) > 0).length).toBeLessThanOrEqual(1);
  });
});

describe('orba rádlem (oxen.md – Jen rádlo)', () => {
  it('díl s drnem má v orbě větší váhu a před orbou je pastvinou; zoraný nese vzhled před orbou', () => {
    const s = advanceVillage(village(), at(601, 9, 20), null);
    const winter = s.plan!.winter!;
    const ids = winter.partIds;
    const sod = ids[1]!;
    // ves orá celou plodinu, druhý díl je drn (louka založená rádlem)
    winter.done = { reclaim: 0, dig: 0, sow: 0, weed: 0, harvest: 0, thresh: 0 };
    winter.plough = { partIds: [...ids], required: 10, done: 0, weight: 1, sodIds: [sod] };
    const parts = byId(s);
    const spans = taskSpans(winter, parts, 'plough', s.lastDay);
    const width = (id: number): number => {
      const span = spans.find((x) => x.id === id)!;
      return span.end - span.start;
    };
    const ratio = partWeight(parts.get(sod)!) / partWeight(parts.get(ids[0]!)!);
    expect(width(sod) / width(ids[0]!)).toBeCloseTo(PLOUGH_SOD_FACTOR * ratio, 9);
    // kopání plodina nemá – všechno orá spřežení
    expect(taskSpans(winter, parts, 'dig', s.lastDay)).toEqual([]);
    const before = fieldPartLooks(s, s.lastDay);
    expect(before.get(sod)!.look).toBe('pasture');
    for (const id of ids.filter((x) => x !== sod)) expect(before.get(id)!.look).not.toBe('pasture');
    // zoraná celá plodina – díly zoraného pole s vzhledem před orbou
    winter.plough.done = 10;
    const after = fieldPartLooks(s, s.lastDay);
    for (const id of ids) {
      expect(after.get(id)!.look).toBe('plowed');
      expect(after.get(id)!.before).toBe(before.get(id)!.look);
    }
  });

  it('dnešní orba po dílech: kolik bylo na dílu hotovo ráno a večer', () => {
    const s = advanceVillage(village(), at(601, 9, 20), null);
    const winter = s.plan!.winter!;
    winter.plough = {
      partIds: winter.partIds.slice(0, 6),
      required: 12,
      done: 0,
      weight: 1,
    };
    const spans = taskSpans(winter, byId(s), 'plough', s.lastDay);
    const worked = partsWorked(winter, byId(s), 'plough', s.lastDay, 3, 7);
    expect(worked.length).toBeGreaterThan(1);
    // první díl dnes dokončený z rozpracovaného, poslední rozpracovaný, mezi nimi celé
    for (const [k, part] of worked.entries()) {
      const span = spans.find((x) => x.id === part.id)!;
      expect(part.from).toBeCloseTo(
        Math.max(0, (3 / 12 - span.start) / (span.end - span.start)),
        9,
      );
      expect(part.to).toBeCloseTo(Math.min(1, (7 / 12 - span.start) / (span.end - span.start)), 9);
      if (k > 0) expect(part.from).toBe(0);
      if (k < worked.length - 1) expect(part.to).toBe(1);
    }
  });
});

describe('přirozená stadia podle kalendáře', () => {
  it('ozim: v září zasetý, přes zimu vzešlý, na jaře zelený, v červenci zralý; jař v srpnu', () => {
    let s = advanceVillage(village(), at(601, 9, 1), null);
    const winter = s.plan!.winter!.partIds;
    const spring = s.plan!.partIds;
    // 1. 9. se už začíná kopat – nic není zasetého
    for (const state of statesInOrder(s, winter)) expect(['stubble', 'plowed']).toContain(state);
    s = advanceVillage(s, at(601, 9, 30), null);
    expect(statesInOrder(s, winter)).toContain('sown');
    s = advanceVillage(s, at(601, 11, 15), null);
    expect(new Set(statesInOrder(s, winter))).toEqual(new Set(['sprouted']));
    if (spring.length > 0) expect(statesInOrder(s, spring)).not.toContain('sprouted');
    s = advanceVillage(s, at(602, 5, 15), null);
    expect(new Set(statesInOrder(s, winter))).toEqual(new Set(['green']));
    s = advanceVillage(s, at(602, 7, 1), null);
    // 1. 7. zraje a hned se začíná žnout od obydlí
    expect(statesInOrder(s, winter)).toContain('ripe');
    for (const state of statesInOrder(s, winter)) expect(['ripe', 'harvesting']).toContain(state);
    s = advanceVillage(s, at(602, 8, 1), null);
    expect(new Set(statesInOrder(s, winter))).toEqual(new Set(['stubble']));
    if (spring.length > 0) expect(statesInOrder(s, spring)).toContain('ripe');
  });

  it('připravený díl rozrytý drn (louka založená rádlem drn), mladý příloh, starší příloh bez seče pastvina', () => {
    const s = village();
    const sept = at(602, 9, 1);
    s.parts[0]!.state = 'ready';
    s.parts[3]!.state = 'ready';
    s.parts[3]!.sod = true;
    s.parts[1]!.state = 'fallow';
    s.parts[1]!.fallowSinceDay = at(601, 9, 1);
    s.parts[2]!.state = 'fallow';
    s.parts[2]!.fallowSinceDay = at(590, 9, 1);
    const looks = fieldPartLooks(s, sept);
    expect(looks.get(s.parts[0]!.id)).toEqual({ look: 'bare' });
    expect(looks.get(s.parts[3]!.id)).toEqual({ look: 'pasture' });
    expect(looks.get(s.parts[1]!.id)).toEqual({ look: 'young-fallow' });
    // starší příloh (louka) se letos neseče – pase se (oxen.md – Seno)
    expect(looks.get(s.parts[2]!.id)).toEqual({ look: 'pasture' });
  });
});

describe('letošní práce na dílu (panel dílu – fields.md, Co hráč vidí)', () => {
  it('podzim: kopání, pak setí ozimu po dílech od obydlí; vzhled dílu odpovídá práci', () => {
    const s = advanceVillage(village(), at(601, 9, 20), null);
    const winter = s.plan!.winter!;
    const work = partYearWork(s, s.lastDay);
    const looks = fieldPartLooks(s, s.lastDay);
    const seen = new Set(winter.partIds.map((id) => looks.get(id)!.look));
    expect([...seen]).toEqual(expect.arrayContaining(['sown', 'plowed', 'stubble']));
    for (const id of winter.partIds) {
      const crop = work.get(id)!.crop!;
      expect(crop.crop).toBe('winter');
      expect(crop.harvest).toBe(0);
      const look = looks.get(id)!;
      // zasetý díl má hotovou přípravu, zkopaný kopání, nezačatý (strniště) nic
      if (look.look === 'sown' && look.work === undefined) {
        expect(crop.sow).toBeGreaterThan(1 - 1e-6);
        expect(crop.prep).toEqual({ task: 'dig', share: 1 });
      }
      if (look.look === 'stubble') expect(crop.prep).toEqual({ task: 'dig', share: 0 });
      if (look.look === 'plowed' && look.work === undefined) {
        expect(crop.prep!.share).toBeCloseTo(1, 6);
        expect(crop.sow).toBeLessThan(1);
      }
    }
    // díly mimo plán (připravené, příloh) letošní osevní práci nemají
    for (const part of s.parts.filter((p) => !planPartIds(s.plan!).includes(p.id))) {
      expect(work.get(part.id)?.crop).toBeUndefined();
    }
  });

  it('orba rádlem: příprava je orba, díl mimo orbu (starší plán) se kope; po sklizni vše hotové', () => {
    const s = advanceVillage(village(), at(601, 9, 20), null);
    const winter = s.plan!.winter!;
    const [first, second] = winter.partIds;
    winter.plough = {
      partIds: [first!],
      required: 10,
      done: 0,
      weight: 1,
      digWeight: 1,
    };
    const work = partYearWork(s, s.lastDay);
    expect(work.get(first!)!.crop!.prep).toEqual({ task: 'plough', share: 0 });
    expect(work.get(second!)!.crop!.prep!.task).toBe('dig');
    winter.harvestedKg = 1000;
    for (const id of winter.partIds) {
      expect(partYearWork(s, s.lastDay).get(id)!.crop).toMatchObject({
        prep: { share: 1 },
        sow: 1,
        harvest: 1,
      });
    }
  });

  it('sklizeň ozimu v červenci po dílech: sklizené díly 1, nezačaté 0', () => {
    const s = advanceVillage(penned(), at(602, 7, 5), null);
    const looks = fieldPartLooks(s, s.lastDay);
    const work = partYearWork(s, s.lastDay);
    const harvests = s.plan!.winter!.partIds.map((id) => work.get(id)!.crop!.harvest);
    expect(harvests).toContain(0);
    expect(harvests).toContain(1);
    for (const id of s.plan!.winter!.partIds) {
      const { harvest, sow } = work.get(id)!.crop!;
      // setí hotové – podíl z odvedené a potřebné práce (desetinná čísla)
      expect(sow).toBeCloseTo(1, 9);
      const look = looks.get(id)!;
      if (look.look === 'ripe') expect(harvest).toBe(0);
      if (look.look === 'harvesting' && look.work === undefined) expect(harvest).toBe(1);
    }
  });
});
