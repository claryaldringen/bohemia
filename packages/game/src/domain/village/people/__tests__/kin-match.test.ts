import { describe, expect, it } from 'vitest';
import { createRandom, deriveSeed } from '../../../landscape/random';
import { advanceVillage } from '../../core/simulate';
import { BIRTH_SPACING, MARRIAGE } from '../../rules';
import { joinMarket } from '../../trade/market';
import { newcomerHome } from '../../trade/people-trade';
import type { KinAsk, VillageMail, VillageState } from '../../types';
import {
  DAY,
  couple,
  dwelling,
  kin,
  trackedVillage,
  type KinSpec,
} from '../../__tests__/kin-fixtures';
import { answerKinAsk, askKinDay, kinCandidates, kinSingles } from '../kin-match';
import { arrangeMarriages, perDay } from '../marriage';
import {
  DAUGHTER,
  LHOTA,
  MAN_25,
  SON,
  WOMAN_20,
  arrivalOf,
  askOf,
  brideVillage,
  folk,
  near,
  seekerVillage,
  withNearby,
} from './kin-match-fixtures';

// Sňatky se skutečnými sousedy (markets.md – Rozhodnutí plánu 3, body 11 a 12; Martin 22. 11. 2026:
// „se sousedy je na náhodě, ze které dostupné vsi ženich nebo nevěsta bude“; 23. 11. 2026: „Jen
// se vdá pryč“). Ptá se ves, ve které někdo nemá s kým (`askKinDay`), partner přijde z vsi okolí
// výpravou (`answerKinAsk`) a po příjezdu je svatba (`receiveKin` z `joinMarket`).

const YEAR_DAYS = 365.25;
/** 20 let – šance 0,3 ročně: bez dotazu jen s pravděpodobností 0,7^20 ≈ 0,08 %. */
const YEARS = 20;

interface Asked {
  day: number;
  mail: VillageMail;
  ask: KinAsk;
}

/**
 * Dotazy, které by ves poslala ve dnech po `lastDay` (krok dne nad mělkou kopií – stav vsi se
 * nemění, lidé stárnou jen dnem); den, kdy los padne, se tak najde deterministicky.
 */
function asksOf(s: VillageState, years = YEARS, fill = 1): Asked[] {
  const out: Asked[] = [];
  const last = s.lastDay + Math.round(years * YEAR_DAYS);
  for (let day = s.lastDay + 1; day <= last; day++) {
    const probe: VillageState = { ...s, outbox: [] };
    askKinDay(probe, day, () => fill);
    for (const mail of probe.outbox ?? []) {
      if (mail.body.kind === 'kin-ask') out.push({ day, mail, ask: mail.body.ask });
    }
  }
  return out;
}

/** Stav bez odchozí schránky a okolí – co zbude, když dotazy nikam nejdou. */
function withoutMail(s: VillageState): VillageState {
  return { ...s, outbox: undefined, nearby: undefined };
}

describe('kdo se ptá – askKinDay', () => {
  it('svobodný muž bez nevěsty ve vsi se zeptá vsi okolí se svobodnou ženou, v hladu nikdy', () => {
    const s = seekerVillage();
    const asked = asksOf(s);
    expect(asked.length).toBeGreaterThan(0);
    const { day, mail } = asked[0]!;
    const key = `kin:a:${day}:${SON}`;
    expect(mail).toEqual({
      villageId: 'b',
      day: day + 1,
      ref: `${key}:ask`,
      body: {
        kind: 'kin-ask',
        ask: {
          key,
          fromVillageId: 'a',
          fromName: 'Lhota',
          cells: 1,
          firstStep: 'E',
          seeker: { personId: SON, sex: 'male', bornDay: s.people[2]!.bornDay, widowed: false },
          report: expect.objectContaining({ day }),
        },
      },
    });
    // první los dne z vlastního proudu 'kin:' + den padl pod denní šanci
    const roll = createRandom(deriveSeed(s.seed, 'kin:' + day)).next();
    expect(roll).toBeLessThan(perDay(MARRIAGE.neighbours.bridePerYear));
    expect(asksOf({ ...s, hungry: true })).toEqual([]);
  });

  it('cíl losem jen mezi vsemi okolí s vhodnou ženou; bez ní se neptá', () => {
    const asked = asksOf(seekerVillage([near('b', [MAN_25]), near('c', [WOMAN_20])]));
    expect(asked.length).toBeGreaterThan(0);
    expect(new Set(asked.map((a) => a.mail.villageId))).toEqual(new Set(['c']));
    expect(asksOf(seekerVillage([near('b', [MAN_25]), near('d')]))).toEqual([]);
    // muž 60 – svobodné ženy okolí jsou mimo věkový rozdíl (15 let)
    const old = withNearby(folk([{ id: 5, age: 60, sex: 'male' }]), LHOTA, [
      near('b', [WOMAN_20, { sex: 'female', ageFrom: 40 }]),
    ]);
    expect(asksOf(old)).toEqual([]);
  });

  it('ves bez okolí se neptá', () => {
    const s = seekerVillage();
    delete s.nearby;
    expect(asksOf(s)).toEqual([]);
    expect(asksOf(seekerVillage([]))).toEqual([]);
  });

  it('snoubenci, kteří čekají na zásoby, se neptají', () => {
    // muž 25 a žena 22 (sama v domě) – pod pojistkou zásob se svatba odkládá
    const s = withNearby(
      folk([
        { id: 1, age: 25, sex: 'male' },
        { id: 2, age: 22, sex: 'female', home: 2 },
      ]),
      LHOTA,
      [near('b', [WOMAN_20, MAN_25])],
    );
    const fill = 0.999;
    let waited = 0;
    for (let day = DAY + 1; day <= DAY + YEARS * 365; day++) {
      const probe = structuredClone(s);
      if (arrangeMarriages(probe, day, () => fill).length > 0) continue;
      waited++;
      askKinDay(probe, day, () => fill);
      expect(probe.outbox ?? []).toEqual([]);
    }
    expect(waited).toBeGreaterThan(1_000);
  });
});

describe('„Jen se vdá pryč“ (Martin 23. 11. 2026)', () => {
  /** Ženichové v okolí. */
  const grooms = [near('b', [MAN_25, { sex: 'male', ageFrom: 20 }])];
  /** Dcera 18 v domě rodičů (40 a 38) – dům nedrží. */
  const daughter = (): VillageState =>
    withNearby(
      folk([
        ...couple({ id: 1, age: 40 }, { id: 2, age: 38 }),
        { id: 3, age: 18, sex: 'female', mother: 2, father: 1 },
      ]),
      LHOTA,
      grooms,
    );

  it('svobodná žena, která dům nedrží, se neptá; vdova a dcera z domu bez mužů ano', () => {
    const years = 5;
    expect(asksOf(daughter(), years)).toEqual([]);
    // dcera z domu bez mužů (matka vdova 38)
    const fatherless = withNearby(
      folk([
        { id: 2, age: 38, sex: 'female' },
        { id: 3, age: 18, sex: 'female', mother: 2 },
      ]),
      LHOTA,
      grooms,
    );
    const fromDaughter = asksOf(fatherless, years).filter((a) => a.ask.seeker.personId === 3);
    expect(fromDaughter.length).toBeGreaterThan(0);
    expect(fromDaughter[0]!.ask.seeker).toMatchObject({ sex: 'female', widowed: false });
    // vdova s dítětem
    const widow = withNearby(
      folk([
        { id: 2, age: 30, sex: 'female' },
        { id: 4, age: 5, sex: 'male', mother: 2 },
      ]),
      LHOTA,
      grooms,
    );
    const fromWidow = asksOf(widow, years);
    expect(fromWidow.length).toBeGreaterThan(0);
    expect(fromWidow[0]!.ask.seeker).toMatchObject({ personId: 2, sex: 'female', widowed: true });
  });

  it('ženich přijde k vdově – groom-from-outside, bydlí u ní', () => {
    const widow = withNearby(
      folk([
        { id: 2, age: 30, sex: 'female' },
        { id: 4, age: 5, sex: 'male', mother: 2 },
      ]),
      LHOTA,
      grooms,
    );
    const { mail, ask } = asksOf(widow)[0]!;
    // Bukovec: ženich 25 v domě rodičů (55 a 53) se ženatým bratrem (30 a 28)
    const b = withNearby(
      folk([
        ...couple({ id: 1, age: 55 }, { id: 2, age: 53 }),
        ...couple({ id: 3, age: 30, mother: 2, father: 1 }, { id: 4, age: 28 }),
        { id: 5, age: 25, sex: 'male', mother: 2, father: 1 },
      ]),
      { villageId: 'b', name: 'Bukovec' },
      [near('a', [], 'W')],
    );
    expect(answerKinAsk(b, mail.day, ask)).toEqual([
      expect.objectContaining({ kind: 'married-away', groom: true, villageName: 'Lhota' }),
    ]);
    const arrival = arrivalOf(b);
    const groomId = widow.nextId;
    const events = joinMarket(widow, arrival.travelDays + mail.day + 1, arrival);
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'groom-from-outside',
        dwellingId: 1,
        widow: true,
        groomId,
        brideId: 2,
        villageName: 'Bukovec',
        villageId: 'b',
      }),
    );
    expect(widow.people.find((p) => p.id === groomId)).toMatchObject({
      sex: 'male',
      spouseId: 2,
      dwellingId: 1,
      origin: 'E',
    });
    expect(widow.people.find((p) => p.id === 2)!.spouseId).toBe(groomId);
  });

  it('bez dotazu muže odjinud je svobodná žena za 3 roky pořád ve vsi', () => {
    // ves s okolím dopočtená vcelku, bez událostí schránky – dcera se sama pryč nevdá (ani když
    // otec zemře a ona se jako dcera z domu bez mužů ptá – ženich by přišel k ní)
    const after = advanceVillage(daughter(), DAY + Math.round(3 * YEAR_DAYS), null);
    expect(after.people.map((p) => p.id)).toContain(3);
    expect((after.emigrants ?? []).map((e) => e.id)).not.toContain(3);
    expect(after.chronicle.map((e) => e.kind)).not.toContain('married-away');
  });
});

describe('svobodní pro okolí – kinCandidates, kinSingles', () => {
  it('svobodná žena 23; vdova ani muž s nevěstou ve vsi ne', () => {
    const s = folk([
      // dcera 23 v domě rodičů (45 a 42)
      ...couple({ id: 1, age: 45 }, { id: 2, age: 42 }),
      { id: 3, age: 23, sex: 'female', mother: 2, father: 1 },
      // vdova 30 s dítětem
      { id: 4, age: 30, sex: 'female', home: 2 },
      { id: 5, age: 6, sex: 'male', mother: 4, home: 2 },
      // muž 40 s nevěstou 35 ve vsi
      { id: 6, age: 40, sex: 'male', home: 3 },
      { id: 7, age: 35, sex: 'female', home: 3 },
    ]);
    expect(kinCandidates(s, DAY).map((p) => p.id)).toEqual([3]);
    expect(kinSingles(s, DAY)).toEqual([{ sex: 'female', ageFrom: 20 }]);
  });
});

describe('kdo přijde – answerKinAsk', () => {
  const groomAsk = (): KinAsk =>
    askOf({ sex: 'male', bornDay: kin({ id: SON, age: 25, sex: 'male' }).bornDay });

  it('nevěsta odejde výpravou kin – v emigrants se směrem, kronika married-away', () => {
    const b = brideVillage();
    const events = answerKinAsk(b, DAY + 1, groomAsk());
    expect(events).toEqual([
      { day: DAY + 1, kind: 'married-away', dwellingId: 1, villageName: 'Lhota', villageId: 'a' },
    ]);
    expect(b.people.map((p) => p.id)).toEqual([1, 2, 4, 5]);
    expect(b.emigrants).toEqual([
      expect.objectContaining({ id: DAUGHTER, sex: 'female', direction: 'W' }),
    ]);
    expect(b.trade!.expeditions).toEqual([
      expect.objectContaining({ by: 'kin', kind: 'market', porters: 1, give: {} }),
    ]);
    const arrival = arrivalOf(b);
    expect(arrival).toMatchObject({
      fromVillageId: 'b',
      fromName: 'Bukovec',
      kin: { seekerId: SON },
      goods: {},
      wants: {},
      firstStep: 'W',
    });
    expect(arrival.people).toEqual([
      { good: 'women', people: [expect.objectContaining({ id: DAUGHTER, sex: 'female' })] },
    ]);
    // posel „zašel na pivo“ – zpráva o Lhotě
    expect(b.news).toEqual([expect.objectContaining({ villageId: 'a', name: 'Lhota' })]);
  });

  // výluka `favouredBride` v `kinCandidates` sama o sobě – bez dětí do 16 let a bez rozpadu domácnosti
  // (vdova a dcera z domu bez mužů se ptají samy, pryč se nevdávají – Martin 19. 10. a 23. 11. 2026)
  it('vdova 40 se ženatým synem se pryč nevdává', () => {
    const s = withNearby(
      folk([
        { id: 1, age: 40, sex: 'female' },
        ...couple({ id: 2, age: 22, mother: 1 }, { id: 3, age: 21 }),
      ]),
      { villageId: 'b', name: 'Bukovec' },
      [],
    );
    expect(kinCandidates(s, s.lastDay)).toEqual([]);
    expect(answerKinAsk(s, s.lastDay + 1, groomAsk())).toEqual([]);
    expect(s.people.map((p) => p.id)).toContain(1);
  });

  it('dcery z domu bez mužů se pryč nevdávají', () => {
    const s = withNearby(
      folk([
        { id: 1, age: 44, sex: 'female' },
        { id: 2, age: 20, sex: 'female', mother: 1 },
        { id: 3, age: 18, sex: 'female', mother: 1 },
      ]),
      { villageId: 'b', name: 'Bukovec' },
      [],
    );
    expect(kinCandidates(s, s.lastDay)).toEqual([]);
  });

  it('vdova neodejde ani jako jediná žena, ani žena, které by se domácnost rozpadla', () => {
    const widow = withNearby(
      folk([
        { id: 1, age: 30, sex: 'female' },
        { id: 2, age: 6, sex: 'male', mother: 1 },
      ]),
      { villageId: 'b', name: 'Bukovec' },
      [],
    );
    const before = structuredClone(widow);
    expect(answerKinAsk(widow, DAY + 1, groomAsk())).toEqual([]);
    expect({ ...widow, news: undefined }).toEqual(before);
    // dcera 20 s otcem 50 a bratrem 10 – po jejím odchodu by doma nezůstal nikdo 16–44
    const breaks = withNearby(
      folk([
        { id: 1, age: 50, sex: 'male' },
        { id: 2, age: 20, sex: 'female', father: 1 },
        { id: 3, age: 10, sex: 'male', father: 1 },
      ]),
      { villageId: 'b', name: 'Bukovec' },
      [],
    );
    expect(answerKinAsk(breaks, DAY + 1, groomAsk())).toEqual([]);
    expect(breaks.people).toHaveLength(3);
    // syn 22 s matkou 50 a sestrou 8 – vdova se ptá, ženich odejít nesmí
    const son = withNearby(
      folk([
        { id: 1, age: 50, sex: 'female' },
        { id: 2, age: 22, sex: 'male', mother: 1 },
        { id: 3, age: 8, sex: 'female', mother: 1 },
      ]),
      { villageId: 'b', name: 'Bukovec' },
      [],
    );
    const widowAsk = askOf({
      sex: 'female',
      bornDay: kin({ id: 9, age: 24, sex: 'female' }).bornDay,
      widowed: true,
    });
    expect(answerKinAsk(son, DAY + 1, widowAsk)).toEqual([]);
    expect(son.people).toHaveLength(3);
  });

  it('muž rodu ani manželka muže rodu nikdy', () => {
    const tracked = withNearby(
      trackedVillage([
        ...couple({ id: 10, age: 45 }, { id: 11, age: 40 }),
        { id: 12, age: 22, sex: 'male', father: 10, mother: 11, home: 2 },
        ...couple({ id: 20, age: 46, home: 2 }, { id: 21, age: 43, home: 2 }),
      ]),
      { villageId: 'b', name: 'Bukovec' },
      [],
    );
    const widowAsk = askOf({
      sex: 'female',
      bornDay: kin({ id: 9, age: 24, sex: 'female' }).bornDay,
      widowed: true,
    });
    expect(answerKinAsk(tracked, DAY + 1, widowAsk)).toEqual([]);
    expect(answerKinAsk(tracked, DAY + 1, groomAsk())).toEqual([]);
    expect(tracked.people).toHaveLength(5);
    expect(tracked.outbox).toBeUndefined();
  });

  it('odmítnutá výprava (nikdo volný na doprovod) – nevěsta zůstane, nic se nezmění', () => {
    const b = brideVillage();
    for (const p of b.people) if (p.id !== DAUGHTER) p.away = { kind: 'craft', untilDay: DAY + 50 };
    const before = structuredClone(b);
    expect(answerKinAsk(b, DAY + 1, groomAsk())).toEqual([]);
    expect({ ...b, news: undefined }).toEqual(before);
  });
});

describe('po příjezdu – receiveKin (joinMarket)', () => {
  it('nevěsta přijde k svobodnému hledajícímu – svatba, nové id, kronika bride-from-outside', () => {
    const a = seekerVillage();
    const seeker = a.people.find((p) => p.id === SON)!;
    const b = brideVillage();
    answerKinAsk(b, DAY + 1, askOf({ sex: 'male', bornDay: seeker.bornDay }));
    const arrival = arrivalOf(b);
    const day = DAY + 2;
    const brideId = a.nextId;
    const events = joinMarket(a, day, arrival);
    expect(a.nextId).toBe(brideId + 1);
    const bride = a.people.find((p) => p.id === brideId)!;
    expect(bride).toMatchObject({ sex: 'female', spouseId: SON, dwellingId: 1, origin: 'E' });
    expect(seeker.spouseId).toBe(brideId);
    expect(bride.nextBirthFrom).toBeGreaterThanOrEqual(day + BIRTH_SPACING.afterWeddingDays);
    expect(events).toContainEqual({
      day,
      kind: 'bride-from-outside',
      dwellingId: 1,
      groomId: SON,
      brideId,
      villageName: 'Bukovec',
      villageId: 'b',
    });
    // doprovod jde domů bez nevěsty a bez zboží
    expect(a.market!.visitors).toEqual([
      expect.objectContaining({ kin: { seekerId: SON }, goods: {}, wants: {} }),
    ]);
    expect(a.market!.visitors[0]!.people).toBeUndefined();
  });

  it('hledající se mezitím oženil – nevěsta zůstane svobodná jako nováček', () => {
    const a = seekerVillage();
    a.people.push(kin({ id: 9, age: 24, sex: 'female', spouse: SON }));
    a.people.find((p) => p.id === SON)!.spouseId = 9;
    const b = brideVillage();
    answerKinAsk(b, DAY + 1, askOf({ sex: 'male', bornDay: a.people[2]!.bornDay }));
    const home = newcomerHome(a, false);
    const id = a.nextId;
    const events = joinMarket(a, DAY + 2, arrivalOf(b));
    expect(a.nextId).toBe(id + 1);
    expect(a.people.find((p) => p.id === id)).toMatchObject({ sex: 'female', dwellingId: home });
    expect(a.people.find((p) => p.id === id)!.spouseId).toBeUndefined();
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'newcomer',
        group: 'woman',
        people: 1,
        villageName: 'Bukovec',
      }),
    );
    expect(events.map((e) => e.kind)).not.toContain('bride-from-outside');
  });
});

describe('další manželky mužů rodu ze sousedních vsí (Rozhodnutí plánu 3, bod 12)', () => {
  /** Vojvoda 30 v dvorci (1) s `wives` manželkami; okolí – Bukovec se svobodnou ženou 20. */
  function lordVillage(wives = 1, extra: Partial<VillageState> = {}): VillageState {
    const specs: KinSpec[] = [{ id: 10, age: 30, sex: 'male', spouse: 11 }];
    for (let i = 0; i < wives; i++)
      specs.push({ id: 11 + i, age: 25 + i, sex: 'female', spouse: 10 });
    return withNearby(
      trackedVillage(specs, [dwelling(1), dwelling(2), dwelling(3)], { storesKg: 3_000, ...extra }),
      LHOTA,
      [near('b', [WOMAN_20])],
    );
  }

  it('muž rodu s 1 manželkou se ptá na další; se 4 žijícími a v pokřtěném rodu ne', () => {
    const asked = asksOf(lordVillage());
    expect(asked.length).toBeGreaterThan(0);
    expect(asked[0]!.ask.seeker).toMatchObject({ personId: 10, sex: 'male', extraWife: true });
    expect(asksOf(lordVillage(4))).toEqual([]);
    expect(asksOf(lordVillage(1, { faith: { rodBaptizedDay: DAY - 10 } }))).toEqual([]);
  });

  it('další manželka přijde do domu muže – ona ukazuje na něj, on dál na hlavní', () => {
    const a = lordVillage();
    const b = brideVillage();
    answerKinAsk(
      b,
      DAY + 1,
      askOf({ personId: 10, sex: 'male', bornDay: a.people[0]!.bornDay, extraWife: true }),
    );
    const arrival = arrivalOf(b);
    expect(arrival.kin).toEqual({ seekerId: 10, extraWife: true });
    const id = a.nextId;
    const events = joinMarket(a, DAY + 2, arrival);
    expect(a.people.find((p) => p.id === id)).toMatchObject({
      sex: 'female',
      spouseId: 10,
      dwellingId: 1,
    });
    expect(a.people.find((p) => p.id === 10)!.spouseId).toBe(11);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'extra-wife', villageName: 'Bukovec', villageId: 'b' }),
    );
  });

  it('rod se mezitím pokřtil – žena zůstane svobodná jako nováček', () => {
    const a = lordVillage();
    const b = brideVillage();
    answerKinAsk(
      b,
      DAY + 1,
      askOf({ personId: 10, sex: 'male', bornDay: a.people[0]!.bornDay, extraWife: true }),
    );
    a.faith = { rodBaptizedDay: DAY + 1 };
    const id = a.nextId;
    const events = joinMarket(a, DAY + 2, arrivalOf(b));
    expect(a.people.find((p) => p.id === id)!.spouseId).toBeUndefined();
    expect(events.map((e) => e.kind)).toEqual(['market-arrived', 'newcomer']);
  });
});

describe('determinismus – ves rodu po kouscích dopočtu (tracked(FAMILY))', () => {
  /** Ves rodu (jako tracked(FAMILY) v advance-world.test.ts), svobodní 25–38 let bez nevěst. */
  function tracked(withNeighbours: boolean): VillageState {
    const s = trackedVillage(
      [
        { id: 10, age: 40, sex: 'male', spouse: 11 },
        { id: 11, age: 36, sex: 'female', spouse: 10 },
        { id: 12, age: 12, sex: 'male', father: 10, mother: 11 },
        ...couple({ id: 20, age: 44, home: 2 }, { id: 21, age: 42, home: 2 }),
        { id: 22, age: 25, sex: 'male', father: 20, mother: 21, home: 2 },
        ...[23, 24, 25, 26, 27].map((id): KinSpec => ({
          id,
          age: 3 * id - 43,
          sex: 'male',
          home: 3,
        })),
      ],
      [dwelling(1), dwelling(2), dwelling(3)],
      { storesKg: 10_000 },
    );
    return withNeighbours ? withNearby(s, LHOTA, [near('b', [WOMAN_20])]) : s;
  }

  it('vcelku = po kouscích (rok + rok); dotazy jen v odchozí schránce, jinak stav jako bez okolí', () => {
    const end = DAY + Math.round(2 * YEAR_DAYS);
    const whole = advanceVillage(tracked(true), end, null);
    const parts = advanceVillage(
      advanceVillage(tracked(true), DAY + Math.round(YEAR_DAYS), null),
      end,
      null,
    );
    expect(parts).toEqual(whole);
    const asks = (whole.outbox ?? []).filter((m) => m.body.kind === 'kin-ask');
    expect(asks.length).toBeGreaterThan(0);
    // ves bez okolí se neptá a jinak simuluje bit po bitu stejně – proud 'kin:' nic neposune
    const alone = advanceVillage(tracked(false), end, null);
    expect(alone.outbox ?? []).toEqual([]);
    expect(withoutMail(whole)).toEqual(withoutMail(alone));
  });
});
