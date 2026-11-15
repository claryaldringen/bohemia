import { describe, expect, it } from 'vitest';
import { youngsterCount } from '../../livestock/herding';
import { foodNeedPerDay, laborPerDay } from '../people';
import { lineCandidates, villagerCandidates } from '../../../war/muster';
import { at, horseVillage, LORD_ID, SON_ID } from '../../__tests__/horse-fixtures';
import type { Person, VillageState } from '../../types';

// Lidé na výpravě (expeditions.md – Kdo smí jít): kdokoli od 12 let je pryč s `away` druhu
// `journey` – nepracuje (ani žena, ani výrostek, který by pásl), jí ale dál doma.

const DAY = at(601, 3, 1);

const byId = (s: VillageState, id: number): Person => s.people.find((p) => p.id === id)!;

describe('člen výpravy ve vsi', () => {
  it('žena 30 let a dítě 12 let pryč nepracují, jedí jako doma', () => {
    const s = horseVillage(null, 1, 4);
    const woman = byId(s, 21); // 27 let
    const child = { ...woman, id: 60, bornDay: DAY - 12 * 366, sex: 'male' as const };
    s.people.push(child);
    const home = { ...woman };
    const homeChild = { ...child };
    woman.away = { kind: 'journey', refId: 'j1' };
    child.away = { kind: 'journey', refId: 'j1' };
    expect(laborPerDay(woman, DAY)).toBe(0);
    expect(laborPerDay(child, DAY)).toBe(0);
    expect(laborPerDay(home, DAY)).toBeGreaterThan(0);
    expect(foodNeedPerDay(woman, DAY)).toBe(foodNeedPerDay(home, DAY));
    expect(foodNeedPerDay(child, DAY)).toBe(foodNeedPerDay(homeChild, DAY));
    expect(foodNeedPerDay(child, DAY)).toBeGreaterThan(0);
  });

  it('youngsterCount výrostka pryč nepočítá', () => {
    const s = horseVillage(null, 1, 0);
    const kid = byId(s, 14); // 11 let
    expect(youngsterCount(s, DAY)).toBe(1);
    kid.away = { kind: 'journey', refId: 'j1' };
    expect(youngsterCount(s, DAY)).toBe(0);
    kid.away.untilDay = DAY;
    expect(youngsterCount(s, DAY)).toBe(1);
  });

  it('lineCandidates a villagerCandidates člena výpravy nevrátí', () => {
    const s = horseVillage(null, 1, 4);
    byId(s, SON_ID).line = true;
    byId(s, LORD_ID).line = true;
    const lineBefore = lineCandidates(s, DAY).map((p) => p.id);
    expect(lineBefore).toContain(SON_ID);
    byId(s, SON_ID).away = { kind: 'journey', refId: 'j1' };
    byId(s, LORD_ID).away = { kind: 'journey', refId: 'j1' };
    expect(lineCandidates(s, DAY).map((p) => p.id)).not.toContain(SON_ID);
    expect(lineCandidates(s, DAY).map((p) => p.id)).not.toContain(LORD_ID);
    const villagerBefore = villagerCandidates(s, DAY).map((p) => p.id);
    expect(villagerBefore.length).toBeGreaterThan(0);
    byId(s, villagerBefore[0]!).away = { kind: 'journey', refId: 'j1' };
    expect(villagerCandidates(s, DAY).map((p) => p.id)).not.toContain(villagerBefore[0]);
  });
});
