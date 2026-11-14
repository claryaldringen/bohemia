import { describe, expect, it } from 'vitest';
import { createRandom, deriveSeed } from '../../landscape/random';
import { areaOutline, fortificationArea, fortSegments } from '../../village';
import type { Fortification } from '../../village/fortification/types';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import type { TileCell, VillageState } from '../../village/types';
import { stepCampaign } from '../campaign';
import type {
  CampaignIntent,
  CampaignMap,
  CampaignMember,
  CampaignState,
  CampaignStep,
  CampaignWorld,
} from '../campaign-types';
import { deserters } from '../desertion';
import { WAR } from '../rules-war';
import { dayOfTick, hoursPerTick } from '../ticks';
import {
  campaign,
  flat,
  LAUNCH,
  member,
  present,
  SET_OUT,
  SUMMER,
  world,
  worldOf,
} from './campaign-fixtures';

// Živé vedení bez rozkazu – dezerce při docházejících zásobách (war.md – Zásoby tažení: Živé vedení
// bez rozkazu; Martin 14. 11. 2026; plán 2026-11-14 – Úloha 10). Jakmile jídlo klesne pod jídlo na
// cestu domů, dezertuje denně ≈ 5 % mužů, vůdce ne; dezertér jde domů jako při rozpadu; zůstane-li
// jen vůdce, výprava se rozpadne.

const TARGET: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['knezice'] };
const OPEN: CampaignMap = { landscape: flat(), obstacles: null, villageIds: [] };

/** Palisáda 4 × 4 políčka severovýchodně od domu Kněžic (−810…−750 m, 90…150 m). */
function smallFort(day: number): Fortification {
  const cells: TileCell[] = [];
  for (let y = 70; y < 74; y++) for (let x = 10; x < 14; x++) cells.push({ x, y });
  const area = fortificationArea(cells, null, { size: 128, cellSizeM: 15 });
  if ('error' in area) throw new Error(area.error);
  const outline = areaOutline(area, 'palisade');
  return {
    id: 4,
    points: outline.points.map((p) => [p[0], p[1]] as const),
    kind: 'palisade',
    segments: fortSegments(outline).map((s) => ({ index: s.index, builtDay: day - 30, state: 1 })),
    gates: [],
  };
}

/** Kněžice za palisádou – lidé se zavřou v útočišti a živý nájezd bez rozkazu čeká. */
function knezice(): VillageState {
  const people = [
    kin({ id: 1, age: 30, sex: 'male', spouse: 2 }, SUMMER),
    kin({ id: 2, age: 28, sex: 'female', spouse: 1 }, SUMMER),
  ];
  const v = village(people, undefined, {
    lastDay: SUMMER,
    storesKg: 1000,
    defense: { stance: 'flee' },
    fortifications: [smallFort(SUMMER)],
  });
  v.dwellings[0]!.position = { x: -860, z: 30, rotation: 0 };
  return v;
}

const KNEZICE = knezice();
const fortWorld: CampaignWorld = {
  clock: world,
  landscapeOf: (cell) => (cell.x === 1 && cell.y === 0 ? TARGET : OPEN),
  villageAt: (id) => (id === 'knezice' ? KNEZICE : null),
};

/** Taktů na herní den (≈ 345). */
const DAY_TICKS = Math.round(24 / hoursPerTick(world));

/** První takt dne `day` – denní krok (dezerce, jídlo) proběhne v něm. */
function firstTickOf(day: number): number {
  let tick = LAUNCH;
  while (dayOfTick(tick, world) < day) tick++;
  return tick;
}

/** Hráč u tažení od vyslání až do `to` (živé vedení bez rozkazu – jen přítomnost). */
const liveUntil = (to: number): CampaignIntent[] => [...SET_OUT, ...present(LAUNCH + 100, to)];

/** Vůdce Bořivoj (1, na koni) a `n` dobrovolníků pěšky (2…; od 10 z Brodu). */
function army(n: number): CampaignMember[] {
  return [member(1, 0, true), ...Array.from({ length: n }, (_, i) => member(2 + i, 1, false))];
}

/** Tažení na Kněžice za palisádou; vůdce Bořivoj (1), muži 2 (Lhota) a 11 (Brod). */
function raid(foodKg: number, seed: number, liveCommand = true): CampaignState {
  return campaign({
    seed,
    foodKg,
    liveCommand,
    target: { villageId: 'knezice', cell: { x: 1, y: 0 }, pos: { x: -880, z: 30 } },
  });
}

/**
 * Los muže `index` (pořadí v tažení) v den `day` – jeden na muže a den, týž jako u dezerce nucených
 * (`desert:<den>:<pořadí>` ze seedu tažení).
 */
const draw = (seed: number, day: number, index: number): number =>
  createRandom(deriveSeed(seed, `desert:${day}:${index}`)).next();

/** Den, kdy muž `index` poprvé uteče hladem (≈ 5 % denně – war.md, Zásoby tažení) od dne `from`. */
function hungerDay(seed: number, index: number, from: number): number {
  for (let day = from; day < from + 1000; day++) if (draw(seed, day, index) < 0.05) return day;
  return Infinity;
}

/**
 * Seed, se kterým oba muži utečou do 4 dnů hladu a každý jindy – rychlý a čitelný běh (los je jen
 * ze seedu, dne a pořadí muže, takže ho test spočte předem).
 */
function quickSeed(from: number): number {
  for (let seed = 1; seed < 10_000; seed++) {
    const a = hungerDay(seed, 1, from);
    const b = hungerDay(seed, 2, from);
    if (a !== b && a < from + 4 && b < from + 4) return seed;
  }
  throw new Error('žádný seed');
}

/** Spočte tažení po kouscích `chunk` taktů; mezi kousky JSON (kontrolní bod). */
function inChunks(
  state: CampaignState,
  toTick: number,
  chunk: number,
  intents: readonly CampaignIntent[],
  w: CampaignWorld,
): CampaignStep {
  let current = state;
  const all: CampaignStep = { state, villageEvents: [], notices: [], waiting: null };
  while (current.tick < toTick && current.phase !== 'done') {
    const step = stepCampaign(current, Math.min(toTick, current.tick + chunk), intents, w);
    expect(step.waiting).toBeNull();
    all.villageEvents.push(...step.villageEvents);
    all.notices.push(...step.notices);
    current = JSON.parse(JSON.stringify(step.state)) as CampaignState;
  }
  return { ...all, state: current };
}

describe('los dezerce z hladu (deserters)', () => {
  const many = army(2000);
  const at = (day: number, hungry: boolean, members = many): CampaignMember[] =>
    deserters({ seed: 7, day, members, commander: members[0]!.ref }, hungry);

  it('číslo je v pravidlech války: ≈ 5 % denně', () => {
    expect(WAR.hungerDesertPerDay).toBe(0.05);
  });

  it('hlad: dezertuje ≈ 5 % mužů denně (i dobrovolníci a muži rodu), vůdce nikdy', () => {
    const today = at(10, true);
    expect(today.length).toBeGreaterThan(70);
    expect(today.length).toBeLessThan(130);
    for (let day = 0; day < 200; day++) expect(at(day, true)).not.toContain(many[0]);
    const line = many.map((m, i) => (i === 0 ? m : { ...m, line: true }));
    expect(at(10, true, line).length).toBe(today.length);
  });

  it('bez hladu dobrovolník nedezertuje', () => {
    expect(at(10, false)).toEqual([]);
  });

  it('nucený: jeden los na muže a den – hlad se přičte (≈ 10 %), kdo utekl bez hladu, uteče i s ním', () => {
    const forced = many.map((m, i) => (i === 0 ? m : { ...m, forced: true }));
    const plain = at(10, false, forced);
    const hungry = at(10, true, forced);
    expect(plain.length).toBeGreaterThan(70);
    expect(plain.length).toBeLessThan(130);
    expect(hungry.length).toBeGreaterThan(160);
    expect(hungry.length).toBeLessThan(240);
    for (const m of plain) expect(hungry).toContain(m);
  });
});

describe('živé vedení bez rozkazu u vsi za palisádou', () => {
  // jídlo 1 kg: hlad hned první den nájezdu (jídlo na cestu domů ≈ 3 muži × 0,54 dne ≈ 1,6 kg)
  const FIRST = SUMMER + 1;
  const SEED = quickSeed(FIRST);
  const out2 = hungerDay(SEED, 1, FIRST);
  const out11 = hungerDay(SEED, 2, FIRST);
  const last = Math.max(out2, out11);
  // po rozpadu dojde vůdce domů (160 m) do 1 dne
  const END = LAUNCH + (last - SUMMER + 2) * DAY_TICKS;
  const INTENTS = liveUntil(END);
  const start = raid(1, SEED);
  const whole = stepCampaign(start, END, INTENTS, fortWorld);

  /** Stav na konci dne `day` (poslední takt dne). */
  const atEndOf = (day: number): CampaignState =>
    stepCampaign(start, firstTickOf(day + 1) - 1, INTENTS, fortWorld).state;

  it('jídlo pod cestou domů: každý den los ze seedu tažení a dne, vůdce zůstává', () => {
    const first = atEndOf(Math.min(out2, out11));
    expect(first.phase).toBe('raiding');
    expect(first.battle?.outcome).toBe('ongoing');
    expect(first.members.map((m) => m.status)).toEqual(
      out2 < out11 ? ['active', 'deserted', 'active'] : ['active', 'active', 'deserted'],
    );
    // dezertér odešel z bojiště (bojovník pryč), vůdce dál stojí
    const gone = first.members.findIndex((m) => m.status === 'deserted');
    const fighter = first.battle!.fighters.find((f) => f.side === 'attack' && f.ref === gone);
    expect(fighter?.state).toBe('fled');
    const lead = first.battle!.fighters.find((f) => f.side === 'attack' && f.ref === 0);
    expect(lead?.state).toBe('fight');
  });

  it('vojsko se samo neobrátí ani nenapadne – stojí, dokud nezůstane jen vůdce', () => {
    const before = atEndOf(last - 1);
    expect(before.phase).toBe('raiding');
    expect(before.returnReason).toBeNull();
    expect(before.battle?.outcome).toBe('ongoing');
    expect(before.battle?.plundered).toBeUndefined();
    // obránci nikoho neztratili – nikdo neútočil
    const defenders = before.battle!.fighters.filter((f) => f.side === 'defend');
    expect(defenders.every((f) => f.state !== 'down')).toBe(true);
  });

  it('zůstane jen vůdce → výprava se rozpadne, upozornění „Výprava se rozpadla.“ jednou', () => {
    const after = stepCampaign(start, firstTickOf(last), INTENTS, fortWorld).state;
    expect(after.phase).toBe('disbanded');
    expect(after.members.map((m) => m.status)).toEqual(['active', 'deserted', 'deserted']);
    expect(whole.state.phase).toBe('done');
    const disbanded = whole.notices.filter((n) => n.kind === 'campaign-disbanded');
    expect(disbanded).toHaveLength(1);
    expect(disbanded[0]).toMatchObject({ playerId: 'p1', payload: { leader: 'Bořivoj' } });
    expect(whole.notices.some((n) => n.kind === 'campaign-returned')).toBe(false);
  });

  it('dezertér jde domů jako při rozpadu – do domovské vsi právě jednou', () => {
    const refs = whole.villageEvents.map((e) => e.ref);
    expect(new Set(refs).size).toBe(refs.length);
    for (const m of whole.state.members) {
      const back = whole.villageEvents.filter(
        (e) => e.body.kind === 'campaign-return' && e.body.result.back.includes(m.ref.personId),
      );
      expect(back.map((e) => e.villageId)).toEqual([m.ref.villageId]);
    }
    // Brod (muž 11) dostane návrat, i když se do něj vojsko nevracelo
    expect(
      whole.villageEvents.some((e) => e.villageId === 'brod' && e.body.kind === 'campaign-return'),
    ).toBe(true);
  });

  it('po kouscích 1 / 37 / 400 taktů s kontrolním bodem = vcelku', { timeout: 60_000 }, () => {
    for (const chunk of [1, 37, 400]) {
      const parts = inChunks(start, END, chunk, INTENTS, fortWorld);
      expect(JSON.stringify(parts.state)).toBe(JSON.stringify(whole.state));
      expect(parts.villageEvents).toEqual(whole.villageEvents);
      expect(parts.notices).toEqual(whole.notices);
    }
  });

  it('jídlo nad cestou domů → nikdo z hladu nedezertuje, vojsko dál stojí', () => {
    const fed = stepCampaign(raid(1000, SEED), END, INTENTS, fortWorld).state;
    expect(fed.phase).toBe('raiding');
    expect(fed.battle?.outcome).toBe('ongoing');
    expect(fed.members.every((m) => m.status === 'active')).toBe(true);
  });

  it('nucení při jídle nad cestou domů dezertují jako dřív (bez hladu)', () => {
    const s = raid(1000, SEED);
    s.members = s.members.map((m, i) => (i === 0 ? m : { ...m, forced: true }));
    const step = stepCampaign(s, END, INTENTS, fortWorld).state;
    // los bez hladu: kdo měl utéct do konce běhu, utekl, nikdo jiný ne
    const expected = s.members.map((m, index) => {
      if (index === 0) return 'active';
      for (let day = SUMMER + 1; day <= dayOfTick(END, world); day++) {
        const out = deserters({ ...s, day, members: s.members }, false);
        if (out.includes(m)) return 'deserted';
      }
      return 'active';
    });
    expect(expected).toContain('deserted');
    expect(step.members.map((m) => m.status)).toEqual(expected);
  });
});

describe('živé vedení na pochodu', () => {
  // 200 dobrovolníků na vzdálený cíl; vůdce na koni je po 1. dni pochodu ≈ 1,5 dne od shromaždiště
  // (jídlo na cestu domů ≈ 300 kg) – s 250 kg hlad hned 1. den
  const far = { villageId: 'daleko', cell: { x: 6, y: 0 }, pos: { x: 0, z: 0 } };
  const start = campaign({ seed: 3, members: army(200), foodKg: 250, target: far });
  const DAY1 = firstTickOf(SUMMER + 1);
  const INTENTS = liveUntil(DAY1 + 2 * DAY_TICKS);

  it('den hladu: ≈ 5 % mužů uteče, vůdce ne; po kouscích stejně', () => {
    const before = stepCampaign(start, DAY1 - 1, INTENTS, worldOf()).state;
    expect(before.members.every((m) => m.status === 'active')).toBe(true);
    const day1 = stepCampaign(start, DAY1, INTENTS, worldOf()).state;
    expect(day1.phase).toBe('marching');
    const gone = day1.members.filter((m) => m.status === 'deserted').length;
    expect(gone).toBeGreaterThan(2);
    expect(gone).toBeLessThan(22);
    expect(day1.members[0]!.status).toBe('active');
    const parts = inChunks(start, DAY1, 53, INTENTS, worldOf());
    expect(JSON.stringify(parts.state)).toBe(JSON.stringify(day1));
  });

  it('když jídlo na pochodu dojde, vojsko se obrátí (Martin 2. 11. 2026 – beze změny)', () => {
    const day2 = stepCampaign(start, DAY1 + DAY_TICKS, INTENTS, worldOf()).state;
    expect(day2.phase).toBe('returning');
    expect(day2.returnReason).toBe('supplies');
  });
});

describe('NPC velitel a zástupce beze změny', () => {
  const END = LAUNCH + 4 * DAY_TICKS;

  it('NPC velitel se obrátí, když jídla zbývá jen na cestu domů – nikdo nedezertuje', () => {
    const npc = stepCampaign(raid(1, 7, false), END, SET_OUT, fortWorld);
    expect(npc.state.returnReason).toBe('supplies');
    expect(npc.state.members.every((m) => m.status !== 'deserted')).toBe(true);
    expect(npc.notices.some((n) => n.kind === 'campaign-disbanded')).toBe(false);
  });

  it('hráč pryč a vede zástupce (NPC) – obrat pro zásoby, žádná dezerce z hladu', () => {
    const deputy = { villageId: 'lhota', personId: 2 };
    const s = campaign({
      seed: 7,
      deputy,
      foodKg: 40,
      target: { villageId: 'daleko', cell: { x: 3, y: 0 }, pos: { x: 0, z: 0 } },
    });
    // bez přítomnosti po 1 herním dni vede zástupce; jídla brzy jen na cestu domů → obrat
    const step = stepCampaign(s, LAUNCH + 12 * DAY_TICKS, SET_OUT, worldOf());
    expect(step.state.members.every((m) => m.status !== 'deserted')).toBe(true);
    expect(step.state.returnReason).toBe('supplies');
  });
});
