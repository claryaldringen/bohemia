import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD } from '../../calendar';
import { armyApproaching, armyOnCell, refugeReturnDays, stewardMayReturn } from '../refuge-return';
import { campaign } from './campaign-fixtures';

// Návrat uprchlíků (plán 2026-11-09 – Úloha 10, Otevřené 11): vojsko na mapě, cesta zpět ve
// dnech, kdy vrací správce.

const NO_HERD = { sheep: 0, goat: 0, pig: 0, cow: 0 };
const HERE = { x: 1, y: 0 };

describe('armyOnCell', () => {
  it('skupina s aktivním mužem na políčku – ano; jinde nebo bez aktivních – ne', () => {
    const base = campaign();
    const on = { ...base, groups: base.groups.map((g) => ({ ...g, cell: { ...HERE } })) };
    expect(armyOnCell(on, HERE)).toBe(true);
    expect(armyOnCell(on, { x: 2, y: 0 })).toBe(false);
    const fled = { ...on, members: on.members.map((m) => ({ ...m, status: 'fallen' as const })) };
    expect(armyOnCell(fled, HERE)).toBe(false);
  });
});

describe('armyApproaching', () => {
  it('cíl na pochodu – ano; vojsko na zpáteční cestě nebo jiný cíl – ne', () => {
    const s = { ...campaign(), phase: 'marching' as const };
    expect(armyApproaching(s, 'knezice')).toBe(true);
    expect(armyApproaching(s, 'lhota')).toBe(false);
    expect(armyApproaching({ ...s, phase: 'returning' }, 'knezice')).toBe(false);
  });
});

describe('refugeReturnDays', () => {
  const from = { cell: { x: 0, y: 0 }, pos: { x: 0, z: 0 } };
  const to = { cell: { x: 3, y: 0 }, pos: { x: 0, z: 0 } };
  it('aspoň den cesty, se stádem déle; na místě 0', () => {
    const people = refugeReturnDays(from, to, NO_HERD, 1000, OFFICIAL_WORLD);
    const herd = refugeReturnDays(from, to, { ...NO_HERD, cow: 2 }, 1000, OFFICIAL_WORLD);
    expect(people).toBeGreaterThanOrEqual(1);
    expect(herd).toBeGreaterThanOrEqual(people);
    expect(refugeReturnDays(from, from, NO_HERD, 1000, OFFICIAL_WORLD)).toBe(0);
  });
});

describe('stewardMayReturn', () => {
  const base = { departedDay: 100, today: 105, armyOnMap: false, approaching: false };
  it('den po posledním dni nájezdu, ne dřív', () => {
    expect(stewardMayReturn({ ...base, raidDay: 104 })).toBe(true);
    expect(stewardMayReturn({ ...base, raidDay: 105 })).toBe(false);
  });
  it('vojsko na mapě nebo teprve na cestě – ne', () => {
    expect(stewardMayReturn({ ...base, armyOnMap: true })).toBe(false);
    expect(stewardMayReturn({ ...base, approaching: true })).toBe(false);
  });
  it('vojsko na mapě nestálo – den po odchodu; starý nájezd před odchodem se nepočítá', () => {
    expect(stewardMayReturn({ ...base, today: 100 })).toBe(false);
    expect(stewardMayReturn({ ...base, today: 101 })).toBe(true);
    expect(stewardMayReturn({ ...base, today: 100, raidDay: 50 })).toBe(false);
  });
});
