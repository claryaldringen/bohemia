import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { fieldPartLooks, taskPosition } from '../field-progress';
import { legumeNeedPerYear } from '../livestock';
import { planEnergyKg, trimPlanToTarget } from '../plan-trim';
import { NO_CRAFTS } from '../productivity';
import { FIELD_STORES } from '../rules';
import { sowingTargets } from '../field-food';
import { advanceVillage } from '../simulate';
import type { VillageState } from '../types';
import { createPlan, springCrop } from '../year-plan';

// Zkrácení rozjetého plánu podle zásob (fields.md – Kolik ves oseje, Osev podle zásob).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

/** Pole 3 ha (133 dílů po 225 m², úrodnost 70) – plán víc, než ves potřebuje. */
const field = (count = 133): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

/**
 * Ves s plánem na celé pole z doby před osevem podle zásob (plán k 1. 9. 600, nic zkopané)
 * a s danými zásobami obilí, dopočítaná do konce února 601; dvacet posledních dílů se vrací
 * z přílohu.
 */
function withOldPlan(storesKg: number): VillageState {
  const s = foundVillage({
    seed: 42,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts: field() },
  });
  s.constructions = [];
  s.lastDay = at(601, 2, 28);
  s.storesKg = storesKg;
  s.meatKg = 300;
  s.parts.forEach((p, i) => {
    p.foundingDone = p.foundingCost;
    p.state = 'sown';
    if (i >= 113) {
      p.fallowBeforePlan = { sinceDay: at(590, 9, 1), overgrowthYears: 2 };
    }
  });
  s.season = createPlan(s.parts, at(600, 9, 1), NO_CRAFTS.tools);
  return s;
}

const targetOf = (s: VillageState, day: number): ReturnType<typeof sowingTargets> =>
  sowingTargets(s, day, legumeNeedPerYear(s, day), NO_CRAFTS.pottery);

describe('zkrácení plánu podle zásob', () => {
  it('velký plán ves zkrátí hned první den – od konce pořadí, ubrané díly leží ladem', () => {
    const s0 = withOldPlan(600);
    const day = at(601, 3, 1);
    const target = targetOf(s0, day);
    expect(planEnergyKg(s0, s0.season!, day)).toBeGreaterThan(target.targetKg * 1.3);
    const s = advanceVillage(s0, day, null);
    const kept = springCrop(s.season!).partIds;
    expect(kept.length).toBeLessThan(springCrop(s0.season!).partIds.length);
    // ubírá se od konce pořadí práce – zbylé díly jsou začátek původního pořadí
    expect(kept).toEqual(springCrop(s0.season!).partIds.slice(0, kept.length));
    // úroda plánu pokryje cíl, s dalším ubraným dílem už ne
    const energy = planEnergyKg(s, s.season!, day);
    expect(energy).toBeGreaterThanOrEqual(target.targetKg - 1e-6);
    const removed = s.parts.filter((p) => !kept.includes(p.id));
    for (const part of removed) {
      expect(part.state).toBe('fallow');
      expect(part.crop).toBeUndefined();
      expect(part.fallowBeforePlan).toBeUndefined();
    }
    // díl, který se vracel z přílohu, leží ladem jako předtím; ostatní od plánu (1. 9.)
    const returned = removed.find((p) => p.id === s0.parts[120]!.id)!;
    expect(returned.fallowSinceDay).toBe(at(590, 9, 1));
    expect(returned.overgrowthYears).toBe(2);
    const plain = removed.find((p) => p.id === s0.parts[110]!.id);
    if (plain) expect(plain.fallowSinceDay).toBe(at(600, 9, 1));
    // práce ubyla úměrně – plán zkopaný ani zasetý není
    expect(springCrop(s.season!).required.dig).toBeLessThan(springCrop(s0.season!).required.dig);
    expect(springCrop(s.season!).done.sow).toBe(0);
  });

  it('rozpracovaný a zasetý díl zůstane, čelo práce i vzhled dílů se nepohnou', () => {
    const dug = advanceVillage(withOldPlan(300), at(601, 3, 25), null);
    const plan = dug.season!;
    expect(springCrop(plan).done.dig).toBeGreaterThan(0);
    expect(springCrop(plan).done.sow).toBeGreaterThan(0);
    // ves přišla k velké zásobě – plán podle zásob je skoro nulový
    const rich: VillageState = structuredClone(dug);
    rich.storesKg = 20_000;
    const day = at(601, 3, 26);
    const looksBefore = fieldPartLooks(rich, day);
    const trimmed = structuredClone(rich);
    const removed = trimPlanToTarget(trimmed, day, 0, 0);
    expect(removed.length).toBeGreaterThan(0);
    const after = trimmed.season!;
    // zůstaly díly, na kterých práce začala; hotová práce se nezměnila
    expect(springCrop(after).done.dig).toBe(springCrop(plan).done.dig);
    expect(springCrop(after).done.sow).toBe(springCrop(plan).done.sow);
    const looksAfter = fieldPartLooks(trimmed, day);
    for (const id of springCrop(after).partIds)
      expect(looksAfter.get(id)).toEqual(looksBefore.get(id));
    // čelo kopání je teď na konci zbylých dílů nebo uvnitř posledního – ubrané díly práci neměly
    expect(taskPosition(springCrop(after), 'dig')).toBeGreaterThan(
      taskPosition(springCrop(plan), 'dig'),
    );
    for (const id of removed) {
      expect(looksBefore.get(id)?.work ?? 0).toBe(0);
      expect(trimmed.parts.find((p) => p.id === id)!.state).toBe('fallow');
    }
    expect(springCrop(after).partIds).toEqual(
      springCrop(plan).partIds.filter((id) => !removed.includes(id)),
    );
  });

  it('ubrané díly čekají v osevu navíc – nejblíž domu první, osévané s léty v řadě', () => {
    const s = withOldPlan(600);
    s.parts.forEach((p) => {
      if (!p.fallowBeforePlan) p.sownYears = 1;
    });
    const day = at(601, 3, 1);
    const removed = trimPlanToTarget(s, day, targetOf(s, day).targetKg, 0);
    expect(removed.length).toBeGreaterThan(20);
    // ubírá se od konce – v osevu navíc v opačném pořadí (ve výběru byly před ostatními)
    expect(s.season!.extra!.map((e) => e.id)).toEqual([...removed].reverse());
    for (const entry of s.season!.extra!) {
      const part = s.parts.find((p) => p.id === entry.id)!;
      expect(part.state).toBe('fallow');
      // díl, který se vracel z přílohu, se z něj vrátí znovu; osévaný se osévá dál
      if (part.fallowSinceDay === at(590, 9, 1)) expect(entry.sownYears).toBeUndefined();
      else expect(entry.sownYears).toBe(1);
    }
  });

  it('ubraný příloh 70–95 % se do osevu navíc nevrací (Martin 24. 10. 2026)', () => {
    const s = withOldPlan(600);
    s.parts.forEach((p) => {
      if (!p.fallowBeforePlan) p.sownYears = 1;
      else {
        p.state = 'fallow';
        p.fertilityShare = 0.8;
      }
    });
    const tired = new Set(s.parts.filter((p) => p.fallowBeforePlan).map((p) => p.id));
    const day = at(601, 3, 1);
    const removed = trimPlanToTarget(s, day, targetOf(s, day).targetKg, 0);
    expect(removed.some((id) => tired.has(id))).toBe(true);
    expect(s.season!.extra!.length).toBeGreaterThan(0);
    for (const entry of s.season!.extra!) expect(tired.has(entry.id)).toBe(false);
  });

  it('plán do cíle s rezervou se nezkrátí', () => {
    const s = withOldPlan(300);
    const day = at(601, 3, 1);
    const energy = planEnergyKg(s, s.season!, day);
    expect(trimPlanToTarget(s, day, energy - 1, 2)).toEqual([]);
    expect(trimPlanToTarget(s, day, energy, 0)).toEqual([]);
    expect(springCrop(s.season!).partIds).toHaveLength(133);
    const margin = FIELD_STORES.trimMarginYears * targetOf(s, day).needKg;
    expect(margin).toBeGreaterThan(0);
  });

  it('zkrácení nezávisí na kouscích dopočtu', () => {
    const s0 = withOldPlan(300);
    s0.lastDay = at(600, 12, 31);
    const end = at(601, 9, 5);
    const whole = advanceVillage(s0, end, null);
    let pieces = s0;
    const steps = [1, 59, 1, 30, 7, 100, 3];
    for (let i = 0; pieces.lastDay < end; i++) {
      pieces = advanceVillage(
        pieces,
        Math.min(end, pieces.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(pieces).toEqual(whole);
  });
});
