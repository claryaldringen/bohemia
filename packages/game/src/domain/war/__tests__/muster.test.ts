import { describe, expect, it } from 'vitest';
import { horseVillage, START } from '../../village/__tests__/horse-fixtures';
import type { Person, VillageState } from '../../village/types';
import { WAR } from '../rules-war';
import { musterOf, volunteerShare } from '../muster';
import { campaignSupplies, foodDays } from '../supplies';
import { stepCampaign } from '../campaign';
import type { CampaignMember } from '../campaign-types';
import { deserters } from '../desertion';
import { campaign, member, SET_OUT, LAUNCH, worldOf } from './campaign-fixtures';

// Nábor, zásoby a dezerce tažení (Úloha 6.6; war.md – Vojsko).

const YEAR = 365.25;

/** Ves s `n` vesničany 20–39 let (muži) a vojvodou. */
function villageOf(n: number): VillageState {
  const s = horseVillage(null, 1, 0);
  for (const p of s.people) if (p.id === 10 || p.id === 12) p.line = true;
  s.people.push(
    ...Array.from({ length: n }, (_, i): Person => ({
      id: 100 + i,
      bornDay: START - Math.ceil((20 + (i % 20)) * YEAR),
      dwellingId: 500,
      sex: 'male',
    })),
  );
  return s;
}

describe('nábor dobrovolníků (musterOf)', () => {
  it('při štěstí 50 se přihlásí ≈ 30 % a bod štěstí nad 50 přidá 0,5 %', () => {
    const s = villageOf(2000);
    const a = musterOf(s, START, () => false, 7);
    expect(a.volunteers.length / a.willing).toBeGreaterThan(0.27);
    expect(a.volunteers.length / a.willing).toBeLessThan(0.33);
    s.happiness = { value: 70, deaths: [], toil: [] };
    const b = musterOf(s, START, () => false, 7);
    expect(volunteerShare(s, s.people.at(-1)!, START)).toBeCloseTo(0.4);
    expect(b.volunteers.length).toBeGreaterThan(a.volunteers.length);
  });

  it('muž s příbuznými v cíli nechce – neochotný, nikdy dobrovolník', () => {
    const s = villageOf(200);
    const m = musterOf(s, START, (p) => p.id % 2 === 0, 7);
    expect(m.unwilling).toBe(100);
    expect(m.willing).toBe(100);
    expect(m.volunteers.every((id) => id % 2 === 1)).toBe(true);
    expect(m.others.length + m.volunteers.length).toBe(200);
  });

  it('hladová ves se hlásí víc, čerstvě vdovská domácnost méně', () => {
    const s = villageOf(10);
    const p = s.people.at(-1)!;
    const base = volunteerShare(s, p, START);
    s.starvationDays = 3;
    expect(volunteerShare(s, p, START)).toBeCloseTo(base + WAR.muster.hungryBonus);
    s.starvationDays = 0;
    // vdova s dítětem, bez dalšího dospělého muže v domácnosti
    s.people.push({ id: 300, bornDay: START - 40 * YEAR, dwellingId: 600, sex: 'female' });
    s.people.push({
      id: 301,
      bornDay: START - 17 * YEAR,
      dwellingId: 600,
      sex: 'male',
      motherId: 300,
    });
    const son = s.people.at(-1)!;
    expect(volunteerShare(s, son, START)).toBeCloseTo(base * WAR.muster.widowFactor);
  });

  it('los je stálý – stejný seed, stejní dobrovolníci', () => {
    const s = villageOf(300);
    expect(musterOf(s, START, () => false, 3)).toEqual(musterOf(s, START, () => false, 3));
  });

  it('zraněný, pryč a mladší 16 let na tažení nejde', () => {
    const s = villageOf(3);
    s.people.find((p) => p.id === 100)!.away = { kind: 'labor' };
    s.people.find((p) => p.id === 101)!.injuredUntilDay = START + 10;
    s.people.push({ id: 400, bornDay: START - 15 * YEAR, dwellingId: 500, sex: 'male' });
    const m = musterOf(s, START, () => false, 1);
    expect(m.willing).toBe(1);
  });
});

describe('zásoby tažení (campaignSupplies)', () => {
  it('1 kg obilí na muže a den, nosnost muž 25, kůň 80, dvoukolák 400', () => {
    const plan = campaignSupplies(10, 2, 1, 6);
    expect(plan.needKg).toBe(60);
    expect(plan.carryKg).toBe(10 * 25 + 2 * 80 + 400);
    expect(plan.enough).toBe(true);
    expect(campaignSupplies(10, 0, 0, 30).enough).toBe(false);
    expect(foodDays(100, 10)).toBe(10);
  });
});

/** Tažení s `count` nucenými (a s příbuznými v cíli, je-li `kin`) a velkou zásobou jídla. */
function forcedCampaign(count: number, kin: boolean): ReturnType<typeof campaign> {
  const members: CampaignMember[] = [member(1, 0, true)];
  for (let i = 0; i < count; i++) {
    members.push({
      ...member(100 + i, 0, false),
      forced: true,
      ...(kin ? { kin: true as const } : {}),
    });
  }
  return campaign({
    members,
    foodKg: 1_000_000,
    // vzdálený cíl: vojsko je na cestě několik dní a nestihne se obrátit
    target: { villageId: 'knezice', cell: { x: 6, y: 0 }, pos: { x: -880, z: 30 } },
  });
}

describe('dezerce nucených v taktu tažení', () => {
  it('nucený uteče ≈ 5 % denně, s příbuznými v cíli ≈ 15 %', () => {
    const plain = deserters({ ...forcedCampaign(2000, false), day: 10 });
    const withKin = deserters({ ...forcedCampaign(2000, true), day: 10 });
    expect(plain.length).toBeGreaterThan(70);
    expect(plain.length).toBeLessThan(130);
    expect(withKin.length).toBeGreaterThan(250);
    expect(withKin.length).toBeLessThan(350);
  });

  it('dobrovolník a muž rodu nedezertují', () => {
    const state = campaign({ foodKg: 1_000_000 });
    expect(deserters({ ...state, day: 10 })).toEqual([]);
  });

  it('den po dni dezertuje část nucených a stav je bit po bitu stejný po kouscích', () => {
    const state = forcedCampaign(400, false);
    const to = LAUNCH + 2 + 1000;
    const whole = stepCampaign(state, to, SET_OUT, worldOf());
    const deserted = whole.state.members.filter((m) => m.status === 'deserted').length;
    expect(deserted).toBeGreaterThan(20);
    expect(deserted).toBeLessThan(150);
    let current = state;
    while (current.tick < to && current.phase !== 'done') {
      current = stepCampaign(current, Math.min(to, current.tick + 77), SET_OUT, worldOf()).state;
    }
    expect(current.members.map((m) => m.status)).toEqual(whole.state.members.map((m) => m.status));
  });

  it('dezertér s příbuznými v cíli cíl varuje – signál army-seen do schránky cílové vsi', () => {
    const to = LAUNCH + 2 + 1000;
    const warned = stepCampaign(forcedCampaign(60, true), to, SET_OUT, worldOf());
    const signal = warned.villageEvents.find((e) => e.body.kind === 'threat-signal');
    expect(signal).toMatchObject({
      villageId: 'knezice',
      body: { kind: 'threat-signal', signal: { kind: 'army-seen' } },
    });
    const quiet = stepCampaign(forcedCampaign(60, false), to, SET_OUT, worldOf());
    expect(quiet.villageEvents.some((e) => e.body.kind === 'threat-signal')).toBe(false);
  });
});
