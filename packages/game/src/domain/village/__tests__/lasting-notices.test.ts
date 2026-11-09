import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { newWorkshop } from '../crafts';
import { lastingNotices, noticeStatesDay } from '../lasting-notices';
import { NO_CRAFTS } from '../productivity';
import { NOTICE_CHRONICLE_MIN_DAYS, STARVATION } from '../rules';
import { advanceVillage } from '../simulate';
import { eat } from '../simulate-food';
import type {
  ChronicleEvent,
  Craft,
  LastingNotice,
  VillageState,
  WorkshopActivity,
} from '../types';
import { withThreshingFloor, withoutSmallGame } from './village-fixtures';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
const START = at(600, 3, 15);
const MIN = NOTICE_CHRONICLE_MIN_DAYS;

const field = (count = 75): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

/** Ves s humnem, bez hladu. */
function village(day = START): VillageState {
  return withThreshingFloor(
    foundVillage({
      seed: 42,
      day,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        parts: field(),
      },
    }),
  );
}

/** Stupeň hladu: šetří (příděl 95 %), hladoví (příděl 50 %), nebo nic. */
function setHunger(s: VillageState, level: 'fed' | 'rationing' | 'hungry'): void {
  s.hungry = level !== 'fed';
  if (level === 'fed') delete s.ration;
  else s.ration = level === 'rationing' ? 0.95 : 0.5;
}

/** Dílna s obyvatelem a činností dne. */
function withWorkshop(
  s: VillageState,
  id: number,
  craft: Craft,
  activity: WorkshopActivity,
  occupied = true,
): void {
  s.dwellings.push({
    id,
    type: 'polozemnice',
    builtDay: s.lastDay,
    condition: 1,
    position: { x: 40 + id, z: 0, rotation: 0 },
    workshop: { ...newWorkshop(craft), activity },
  });
  if (occupied) s.people.push({ id: 9000 + id, bornDay: s.lastDay - 30 * 365, dwellingId: id });
}

const statesOf = (s: VillageState): VillageState['noticeStates'] => s.noticeStates;

type NoticeEvent = Extract<ChronicleEvent, { kind: 'notice-began' | 'notice-ended' }>;
const noticeEvents = (events: readonly ChronicleEvent[]): NoticeEvent[] =>
  events.filter((e): e is NoticeEvent => e.kind === 'notice-began' || e.kind === 'notice-ended');
const hungerEvents = (events: readonly ChronicleEvent[]): NoticeEvent[] =>
  noticeEvents(events).filter((e) => ['rationing', 'hungry', 'starving'].includes(e.notice));

/** Den po dni od `from` do `to` včetně s nastavením stavu před koncem dne; zápisy kroniky. */
function run(
  s: VillageState,
  from: number,
  to: number,
  set: (day: number) => void,
): ChronicleEvent[] {
  const out: ChronicleEvent[] = [];
  for (let d = from; d <= to; d++) {
    set(d);
    out.push(...noticeStatesDay(s, d));
  }
  return out;
}

describe('lastingNotices – trvalé stavy vsi z upozornění', () => {
  it('stupně hladu jsou vnořené – hladovějící ves i šetří, umírající i hladoví', () => {
    const s = village();
    expect(lastingNotices(s, START)).not.toContain('rationing');
    setHunger(s, 'rationing');
    expect(lastingNotices(s, START).filter((n) => n.endsWith('ing'))).toEqual(['rationing']);
    setHunger(s, 'hungry');
    expect(lastingNotices(s, START).slice(0, 2)).toEqual(['rationing', 'hungry']);
    s.starvationDays = Math.max(...Object.values(STARVATION.threshold)) + 1;
    expect(lastingNotices(s, START).slice(0, 3)).toEqual(['rationing', 'hungry', 'starving']);
  });

  it('šetření jen kvůli osivu je „šetří na osivo“ – hlad a umírání hlady zůstanou', () => {
    const s = village();
    setHunger(s, 'rationing');
    s.seedRation = true;
    expect(lastingNotices(s, START).filter((n) => n.endsWith('ing'))).toEqual(['seed-rationing']);
    setHunger(s, 'hungry');
    expect(lastingNotices(s, START).slice(0, 2)).toEqual(['seed-rationing', 'hungry']);
    s.starvationDays = Math.max(...Object.values(STARVATION.threshold)) + 1;
    expect(lastingNotices(s, START).slice(0, 3)).toEqual(['seed-rationing', 'hungry', 'starving']);
  });

  it('jídlo dne: šetří na osivo, jen když by se snědeným osivem jedla plně', () => {
    // dost obilí do sklizně, skoro všechno osivo jen na setí – ves šetří kvůli osivu
    const seed = village();
    seed.storesKg = 20_000;
    seed.reservedSeedKg = 19_900;
    eat(seed, START, NO_CRAFTS);
    expect(seed.hungry).toBe(true);
    expect(seed.seedRation).toBe(true);
    expect(lastingNotices(seed, START)).toContain('seed-rationing');
    expect(lastingNotices(seed, START)).not.toContain('rationing');
    // obilí nestačí ani s osivem – ves šetří jídlem
    const short = village();
    short.storesKg = 100;
    short.reservedSeedKg = 50;
    eat(short, START, NO_CRAFTS);
    expect(short.hungry).toBe(true);
    expect(short.seedRation).toBeUndefined();
    expect(lastingNotices(short, START)).toContain('rationing');
    // dost jídla i bez osiva – nešetří, příznak zmizí
    const fed = village();
    fed.storesKg = 20_000;
    fed.reservedSeedKg = 100;
    fed.seedRation = true;
    eat(fed, START, NO_CRAFTS);
    expect(fed.hungry).toBe(false);
    expect(fed.seedRation).toBeUndefined();
  });

  it('dílny bez vstupu – jen obydlené; tesař bez dřeva zvlášť', () => {
    const s = village();
    withWorkshop(s, 501, 'smith', 'no-charcoal');
    withWorkshop(s, 502, 'potter', 'no-clay');
    withWorkshop(s, 503, 'carpenter', 'no-wood');
    withWorkshop(s, 504, 'burner', 'no-wood');
    withWorkshop(s, 505, 'smith', 'no-ore', false);
    const notices = lastingNotices(s, START);
    expect(notices).toEqual(
      expect.arrayContaining<LastingNotice>([
        'no-charcoal',
        'no-clay',
        'carpenter-no-wood',
        'no-wood',
      ]),
    );
    expect(notices).not.toContain('no-ore');
  });

  it('psi bez obilí – aspoň jeden celý pes, kterého ves nenakrmila', () => {
    const s = withoutSmallGame(village());
    s.wildlife!.dogs = { count: 2, fed: false };
    expect(lastingNotices(s, START)).toContain('dogs-ungrained');
    s.wildlife!.dogs = { count: 0.5, fed: false };
    expect(lastingNotices(s, START)).not.toContain('dogs-ungrained');
  });

  it('vymřelá ves žádné stavy nemá', () => {
    const s = village();
    setHunger(s, 'hungry');
    s.extinctDay = START;
    expect(lastingNotices(s, START)).toEqual([]);
  });
});

describe('noticeStatesDay – začátek a konec stavu do kroniky', () => {
  it('stav kratší než 7 dní se nezapíše a po týdnu bez něj zmizí', () => {
    const s = village();
    const short = run(s, START, START + MIN - 2, () => setHunger(s, 'rationing'));
    const after = run(s, START + MIN - 1, START + 2 * MIN, () => setHunger(s, 'fed'));
    expect(hungerEvents([...short, ...after])).toEqual([]);
    expect(s.noticeStates?.rationing).toBeUndefined();
  });

  it('začátek se zapíše sedmý den s dnem začátku, konec po týdnu bez stavu s prvním dnem bez něj', () => {
    const s = village();
    const began = run(s, START, START + MIN - 1, () => setHunger(s, 'rationing'));
    expect(hungerEvents(began)).toEqual([
      { day: START, kind: 'notice-began', notice: 'rationing' },
    ]);
    expect(s.noticeStates?.rationing).toEqual({ since: START, logged: true });
    // trvá dál – nic nového
    expect(hungerEvents(run(s, START + MIN, START + 40, () => setHunger(s, 'rationing')))).toEqual(
      [],
    );
    const end = START + 41;
    const ended = run(s, end, end + MIN - 1, () => setHunger(s, 'fed'));
    expect(hungerEvents(ended)).toEqual([{ day: end, kind: 'notice-ended', notice: 'rationing' }]);
    expect(s.noticeStates?.rationing).toBeUndefined();
  });

  it('přerušení kratší než 7 dní stav neukončí', () => {
    const s = village();
    run(s, START, START + 20, () => setHunger(s, 'rationing'));
    const gap = run(s, START + 21, START + 21 + MIN - 2, () => setHunger(s, 'fed'));
    const again = run(s, START + 21 + MIN - 1, START + 60, () => setHunger(s, 'rationing'));
    expect(hungerEvents([...gap, ...again])).toEqual([]);
    expect(s.noticeStates?.rationing).toEqual({ since: START, logged: true });
  });

  it('konce stupňů hladu téhož dne od nejhoršího – hlad skončí dřív, než ves přestane šetřit', () => {
    const s = village();
    run(s, START, START + 20, () => setHunger(s, 'hungry'));
    const ended = run(s, START + 21, START + 21 + MIN - 1, () => setHunger(s, 'fed'));
    expect(hungerEvents(ended).map((e) => [e.kind, e.notice])).toEqual([
      ['notice-ended', 'hungry'],
      ['notice-ended', 'rationing'],
    ]);
  });

  it('ves bez uložených stavů (uložená dřív) je začne sledovat od prvního dne', () => {
    const s = village();
    setHunger(s, 'hungry');
    delete s.noticeStates;
    noticeStatesDay(s, START + 100);
    expect(statesOf(s)?.hungry).toEqual({ since: START + 100 });
    // bez stavu se nic neukládá
    const fed = village();
    noticeStatesDay(fed, START);
    expect(fed.noticeStates?.rationing).toBeUndefined();
  });
});

describe('advanceVillage – trvalé stavy', () => {
  it('po kouscích dá týž stav i kroniku jako jedním voláním (ves bez zásob, 2 roky)', () => {
    // po hájení a bez zásob – ves šetří a hladoví
    const start = village();
    start.foundedDay = start.lastDay - Math.ceil(40 * YEAR);
    start.storesKg = 0;
    const end = at(602, 3, 15);
    const whole = advanceVillage(start, end, null);
    let chunked = start;
    const steps = [1, 3, 45, 6, 200, 7, 365];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(
        chunked,
        Math.min(end, chunked.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(chunked.noticeStates).toEqual(whole.noticeStates);
    expect(noticeEvents(chunked.chronicle)).toEqual(noticeEvents(whole.chronicle));
    expect(chunked).toEqual(whole);
    // ves opravdu šetřila – jinak by shoda nic neznamenala
    expect(
      noticeEvents(whole.chronicle).some(
        (e) => e.kind === 'notice-began' && e.notice === 'rationing',
      ),
    ).toBe(true);
  }, 120_000);

  it('šetření na osivo: po kouscích stejně jako vcelku, do kroniky „seed-rationing“', () => {
    const start = village();
    start.storesKg = 20_000;
    start.reservedSeedKg = 19_900;
    const end = start.lastDay + 40;
    const whole = advanceVillage(start, end, null);
    let chunked = start;
    const steps = [1, 3, 10];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(
        chunked,
        Math.min(end, chunked.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(chunked).toEqual(whole);
    const began = noticeEvents(whole.chronicle).filter((e) => e.kind === 'notice-began');
    expect(began.map((e) => e.notice)).toContain('seed-rationing');
    expect(began.map((e) => e.notice)).not.toContain('rationing');
  }, 120_000);
});
