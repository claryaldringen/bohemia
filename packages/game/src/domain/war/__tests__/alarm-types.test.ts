import { describe, expect, it } from 'vitest';
import { applyInboxDay, type VillageEvent, type VillageEventBody } from '../../village/core/inbox';
import { DAY, kin, village } from '../../village/__tests__/kin-fixtures';
import type { CampaignAlarm } from '../alarm-types';
import { stepCampaign } from '../campaign';
import type { CampaignState } from '../campaign-types';
import { WAR } from '../rules-war';
import { campaign, LAUNCH, LIVE, worldOf } from './campaign-fixtures';

// Varování, poslové a útěk do hradiště – čísla, typy a události (war.md – Varování, poslové a útěk
// do hradiště; plán 2026-11-09 – Úloha 1). Nové části jsou volitelné: tažení bez `alarm` a ves
// s novými událostmi ve schránce se chovají jako dřív.

/** Otisk FNV-1a 32 bitů z JSON – pozná i nejmenší změnu stavu (vzor `flax.test.ts`). */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function viaJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const NO_HERD = { sheep: 0, goat: 0, pig: 0, cow: 0 };

/** Varování se vším, co tvar dovolí – jen JSON (žádné `Map`, `Set`, `undefined` v polích). */
const ALARM: CampaignAlarm = {
  villages: [
    {
      villageId: 'knezice',
      owner: { playerId: 'p2', npc: false, houseId: 'h2' },
      seenTick: LAUNCH + 10,
      seenAt: { cell: { x: 1, y: 0 }, pos: { x: -400, z: 20 } },
      warnTick: LAUNCH + 40,
      by: 'villager',
      messenger: 'c1:a0',
      flight: 'c1:a1',
      decided: 'player',
      hosts: ['hradiste'],
    },
  ],
  messengers: [
    {
      refId: 'c1:a0',
      fromVillageId: 'knezice',
      personId: 7,
      toVillageId: 'hradiste',
      mounted: false,
      status: 'running',
      departTick: 100,
      cell: { x: 1, y: 0 },
      pos: { x: -880, z: 30 },
      route: [{ x: 2, y: 0 }],
      leg: {
        points: [
          { x: -880, z: 30 },
          { x: 960, z: 30 },
        ],
        meadowM: [0, 1840],
        walkedM: 12,
      },
      target: { cell: { x: 2, y: 0 }, pos: { x: 0, z: 0 } },
    },
  ],
  flights: [
    {
      refId: 'c1:a1',
      villageId: 'knezice',
      mode: 'all',
      hostVillageId: 'hradiste',
      people: [
        { id: 7, bornDay: DAY - 9000, man: true, line: false },
        { id: 8, bornDay: DAY - 2000, man: false, line: false },
      ],
      foodKg: 35,
      herd: { ...NO_HERD, sheep: 4 },
      carts: 1,
      status: 'arrived',
      departTick: LAUNCH + 50,
      doneTick: LAUNCH + 900,
      cell: { x: 2, y: 0 },
      pos: { x: 0, z: 0 },
      route: [],
      leg: null,
      target: { cell: { x: 2, y: 0 }, pos: { x: 0, z: 0 } },
    },
  ],
  nextRef: 2,
};

describe('Ú1 – čísla varování (war.md – Čísla: Varování a útěk do hradiště)', () => {
  it('lhůta hráče je 1 herní den v taktech, hosté uprchlíků zůstanou do návratu', () => {
    expect(WAR.alarm.playerGraceTicks).toBe(344);
    expect(WAR.alarm.runFactor).toBe(2);
    expect(WAR.alarm.catchM).toBe(30);
    expect(WAR.alarm.openUntilDay).toBeGreaterThan(400_000);
  });
});

describe('Ú1 – tažení bez varování', () => {
  it('(a) stav bez `alarm` je po cestě přes JSON tentýž', () => {
    const s = campaign();
    expect('alarm' in s).toBe(false);
    expect(viaJson(s)).toStrictEqual(s);
  });

  it('(a) varování se vším projde JSON beze ztráty', () => {
    const s: CampaignState = { ...campaign(), alarm: structuredClone(ALARM) };
    expect(viaJson(s)).toStrictEqual(s);
  });

  it('(b) starý bod tažení dá bit po bitu týž výsledek jako před změnou', () => {
    const END = LAUNCH + 900;
    const whole = stepCampaign(campaign(), END, LIVE, worldOf());
    // Otisk z doby před Úlohou 1 (9. 11. 2026) – typy varování chování tažení nemění.
    expect(fingerprint(whole)).toBe('3766:e81d6a8f');
    // Bod uložený uprostřed (bez `alarm`) a načtený z JSON pokračuje stejně.
    const half = stepCampaign(campaign(), LAUNCH + 300, LIVE, worldOf());
    const rest = stepCampaign(viaJson(half.state), END, LIVE, worldOf());
    expect(rest.state).toStrictEqual(whole.state);
    expect(rest.state.alarm).toBeUndefined();
  });
});

describe('Ú1 – události útěku ve schránce vsi', () => {
  const people = [kin({ id: 1, age: 30, sex: 'male' }), kin({ id: 2, age: 8, sex: 'female' })];
  const bodies: VillageEventBody[] = [
    {
      kind: 'messenger-out',
      campaignId: 'c1',
      refId: 'c1:a0',
      personId: 1,
      toVillageId: 'hradiste',
      mounted: false,
    },
    { kind: 'messenger-back', campaignId: 'c1', refId: 'c1:a0', personId: 1 },
    { kind: 'messenger-caught', campaignId: 'c1', refId: 'c1:a0', personId: 1, fate: 'killed' },
    {
      kind: 'refuge-depart',
      campaignId: 'c1',
      refId: 'c1:a1',
      mode: 'all',
      hostVillageId: 'hradiste',
      people: [1, 2],
      carriedKg: 35,
      herd: NO_HERD,
    },
    { kind: 'refuge-hidden', campaignId: 'c1', refId: 'c1:a1', foodKg: 35, herd: NO_HERD },
    { kind: 'refuge-caught', campaignId: 'c1', refId: 'c1:a1', killed: [1], led: [2] },
    {
      kind: 'refuge-arrive',
      campaignId: 'c1',
      refId: 'c1:a1',
      fromVillageId: 'knezice',
      fromName: 'Kněžice',
      people: [{ id: 1, bornDay: DAY - 11_000, man: true, line: false }],
      foodKg: 35,
      herd: NO_HERD,
    },
    { kind: 'refuge-back', refId: 'c1:a1', foodKg: 20, herd: NO_HERD },
  ];

  // Úloha 7 (9. 11. 2026): ves události použije – podrobně `village/__tests__/refugees.test.ts`.
  it('(c) Úloha 7 je použije – posel doma, skupina dostižená, návrat vrátí ukryté', () => {
    const state = village(people);
    const events: VillageEvent[] = bodies.map((body, i) => ({
      id: `e${i}`,
      villageId: 'knezice',
      day: DAY + 1,
      seq: i,
      body,
    }));
    applyInboxDay(state, DAY + 1, events);
    // posel se vrátil, pak skupinu (oba) vojsko dostihlo – padlý a odvedená
    expect(state.people).toEqual([]);
    // pobyt (ves je tu i hradištěm), návrat vrátil ukryté a zbytek z hradiště
    expect(state.refugeStays).toHaveLength(1);
    expect(state.refuge).toBeUndefined();
    expect(state.storesKg).toBe(55);
  });
});
