import { describe, expect, it } from 'vitest';
import { foundVillage } from '../../../core/actions';
import { villageFoodNeed } from '../../../core/diet';
import { applyInboxDay, type VillageEvent, type VillageEventBody } from '../../../core/inbox';
import { foodNeedPerDay, guestLaborToday, isAway, laborPerDay } from '../../../people/people';
import { leaveRefuge, refugeFoodDay } from '../refugees';
import { advanceVillage } from '../../../core/simulate';
import type { Person, VillageState } from '../../../types';
import { WAR } from '../../../../war/rules-war';
import { horse, horseVillage, LORD_ID, START } from '../../../__tests__/horse-fixtures';
import { DAY, dwelling, kin, village } from '../../../__tests__/kin-fixtures';
import { withBuiltFirstDwelling } from '../../../__tests__/village-fixtures';

// Ves na útěku – odchod, les, hradiště, návrat a posel ve stavu vsi (war.md – Varování, poslové
// a útěk do hradiště; plán 2026-11-09 – Úloha 7). Události schránky mutují stav idempotentně.

const NO_HERD = { sheep: 0, goat: 0, pig: 0, cow: 0 };
const HOST = 'hradiste';

/** Domov: muž 30, žena 28, dívka 8 a starší muž 50 (ten zůstane doma); 1000 kg, z toho 200 osivo. */
function home(): VillageState {
  return village(
    [
      kin({ id: 1, age: 30, sex: 'male' }),
      kin({ id: 2, age: 28, sex: 'female' }),
      kin({ id: 3, age: 8, sex: 'female' }),
      kin({ id: 4, age: 50, sex: 'male' }),
    ],
    [dwelling(1)],
    {
      storesKg: 1000,
      reservedSeedKg: 200,
      livestock: {
        herds: { sheep: 6, goat: 0, pig: 2, cow: 1 },
        young: { sheep: 3, goat: 0, pig: 0, cow: 0 },
      },
    },
  );
}

/** Hradiště: dva dospělí doma a 500 kg. */
function host(): VillageState {
  return village(
    [kin({ id: 1, age: 35, sex: 'male' }), kin({ id: 2, age: 33, sex: 'female' })],
    [dwelling(1)],
    { storesKg: 500 },
  );
}

function event(day: number, seq: number, body: VillageEventBody): VillageEvent {
  return { id: `e${day}:${seq}`, villageId: 'v', day, seq, body };
}

function apply(state: VillageState, day: number, ...bodies: VillageEventBody[]): void {
  state.chronicle.push(
    ...applyInboxDay(
      state,
      day,
      bodies.map((b, i) => event(day, i, b)),
    ),
  );
}

const depart = (
  mode: 'forest' | 'people' | 'all',
  carriedKg: number,
  herd = NO_HERD,
): VillageEventBody => ({
  kind: 'refuge-depart',
  campaignId: 'c1',
  refId: 'c1:a1',
  mode,
  hostVillageId: mode === 'forest' ? null : HOST,
  people: [1, 2, 3],
  carriedKg,
  herd,
  ...(mode === 'forest' ? {} : { hostName: 'Hradiště' }),
});

function arrive(people: Person[], foodKg: number): VillageEventBody {
  return {
    kind: 'refuge-arrive',
    campaignId: 'c1',
    refId: 'c1:a1',
    fromVillageId: 'domov',
    fromName: 'Domov',
    people: people.map((p) => ({
      id: p.id,
      bornDay: p.bornDay,
      man: p.sex === 'male',
      line: false,
    })),
    foodKg,
    herd: { ...NO_HERD, sheep: 4 },
  };
}

const D = DAY + 1;

describe('Ú7 – odchod (applyRefugeDepart)', () => {
  it('(a) „se vším“ – lidé pryč, zásoby a stádo ubudou, druhý odchod týchž lidí nic', () => {
    const v = home();
    apply(v, D, depart('all', 300, { ...NO_HERD, sheep: 8, pig: 2, cow: 1 }));
    const away = v.people.filter((p) => isAway(p, D)).map((p) => p.id);
    expect(away).toEqual([1, 2, 3]);
    expect(v.people[0]!.away).toEqual({ kind: 'refuge', hostVillageId: HOST, refId: 'c1:a1' });
    expect(v.storesKg).toBe(700);
    // napřed dospělé kusy, pak mláďata
    expect(v.livestock!.herds).toEqual({ sheep: 0, goat: 0, pig: 0, cow: 0 });
    expect(v.livestock!.young).toEqual({ sheep: 1, goat: 0, pig: 0, cow: 0 });
    expect(v.refuge).toEqual({
      refId: 'c1:a1',
      campaignId: 'c1',
      mode: 'all',
      hostVillageId: HOST,
      departedDay: D,
    });
    expect(v.chronicle.at(-1)).toEqual({
      day: D,
      kind: 'refuge-left',
      people: 3,
      villageName: 'Hradiště',
    });
    // stejná událost podruhé (opakovaný zápis) i jiná skupina týchž lidí – nic
    const once = structuredClone(v);
    apply(v, D, depart('all', 300, { ...NO_HERD, sheep: 1 }));
    apply(v, D, { ...depart('people', 100), refId: 'c2:a1', campaignId: 'c2' } as VillageEventBody);
    expect(v).toStrictEqual(once);
  });

  it('(a) zásoby nejvýš bez osiva a zapečetěných jam', () => {
    const v = home();
    v.grainPits = [
      {
        id: 50,
        x: 0,
        z: 0,
        capacityKg: 800,
        grainKg: 600,
        state: 'sealed',
        dugDay: 0,
        filledDay: 0,
      },
    ];
    apply(v, D, depart('all', 900));
    expect(v.storesKg).toBe(800); // 1000 − 200 osivo − 600 jáma = 200 volných
  });

  it('(a) „jen lidé“ – zásoby a stádo zůstanou', () => {
    const v = home();
    apply(v, D, depart('people', 0));
    expect(v.storesKg).toBe(1000);
    expect(v.livestock!.herds.sheep).toBe(6);
    expect(v.refuge?.mode).toBe('people');
  });
});

describe('Ú7 – les (refuge-hidden, refugeFoodDay)', () => {
  it('(b) lidé v lese jedí doma, ale nepracují; jídlo napřed z ukrytého, pak ze zásob vsi', () => {
    const v = home();
    apply(v, D, depart('forest', 60, { ...NO_HERD, sheep: 9 }));
    apply(v, D, {
      kind: 'refuge-hidden',
      campaignId: 'c1',
      refId: 'c1:a1',
      foodKg: 60,
      herd: { ...NO_HERD, sheep: 9 },
    });
    expect(v.refuge?.hidden).toEqual({ foodKg: 60, herd: { ...NO_HERD, sheep: 9 } });
    expect(v.refuge?.hostVillageId).toBeUndefined();
    expect(v.chronicle.at(-1)).toEqual({ day: D, kind: 'refuge-hidden', people: 3 });
    const forest = v.people.filter((p) => p.id <= 3);
    for (const p of forest) {
      expect(laborPerDay(p, D)).toBe(0);
      expect(foodNeedPerDay(p, D)).toBeGreaterThan(0);
    }
    const need = forest.reduce((s, p) => s + foodNeedPerDay(p, D), 0);
    const stores = v.storesKg;
    refugeFoodDay(v, D);
    expect(v.storesKg).toBeCloseTo(stores + need, 9);
    expect(v.refuge!.hidden!.foodKg).toBeCloseTo(60 - need, 9);
    // ukryté dojde – zbytek, pak už nic (jedí ze zásob vsi)
    v.refuge!.hidden!.foodKg = need / 2;
    const before = v.storesKg;
    refugeFoodDay(v, D + 1);
    expect(v.storesKg).toBeCloseTo(before + need / 2, 9);
    expect(v.refuge!.hidden!.foodKg).toBe(0);
    refugeFoodDay(v, D + 2);
    expect(v.storesKg).toBeCloseTo(before + need / 2, 9);
  });

  it('(b) hidden jiné skupiny nebo bez útěku – nic', () => {
    const v = home();
    apply(v, D, {
      kind: 'refuge-hidden',
      campaignId: 'c1',
      refId: 'c1:a1',
      foodKg: 60,
      herd: NO_HERD,
    });
    expect(v.refuge).toBeUndefined();
    const before = structuredClone(v);
    refugeFoodDay(v, D);
    expect(v).toStrictEqual(before);
  });
});

describe('Ú7 – hradiště (refuge-arrive, jídlo a robota hostů)', () => {
  const refugees = home().people.slice(0, 3);

  it('(c) hosté jedí napřed ze svého, pak ze zásob hostitele; dítě jí méně a nepracuje', () => {
    const h = host();
    const needHome = villageFoodNeed(h, D);
    apply(h, D, arrive(refugees, 1));
    expect(h.guests).toHaveLength(3);
    expect(h.guests![0]).toEqual({
      ref: { villageId: 'domov', personId: 1 },
      kind: 'refuge',
      untilDay: WAR.alarm.openUntilDay,
      adult: true,
      bornDay: refugees[0]!.bornDay,
    });
    expect(h.refugeStays).toEqual([
      {
        refId: 'c1:a1',
        fromVillageId: 'domov',
        fromName: 'Domov',
        people: [1, 2, 3],
        foodKg: 1,
        herd: { ...NO_HERD, sheep: 4 },
        arrivedDay: D,
      },
    ]);
    expect(h.chronicle.at(-1)).toMatchObject({
      kind: 'guests-came',
      away: 'refuge',
      people: 3,
      villageName: 'Domov',
    });
    // stádo uprchlíků se pase u hradiště – do stád hostitele nepřibude
    expect(h.livestock?.herds.sheep ?? 0).toBe(0);
    // dítě (8 let) jí jako dítě, dva dospělí jako dospělí; pracují jen dospělí
    const guestsNeed = villageFoodNeed(h, D) - needHome;
    expect(guestsNeed).toBeCloseTo((2 * 180 + 100) / 365, 9);
    expect(guestLaborToday(h, D)).toBe(2);
    // napřed ze svého (1 kg), zbytek ze zásob hostitele
    refugeFoodDay(h, D);
    expect(h.refugeStays![0]!.foodKg).toBe(0);
    expect(h.storesKg).toBe(501);
    refugeFoodDay(h, D + 1);
    expect(h.storesKg).toBe(501);
    // dvakrát týž příchod – nic
    const once = structuredClone(h);
    apply(h, D, arrive(refugees, 1));
    expect(h).toStrictEqual(once);
  });

  it('(c) dospělý uprchlík pracuje na opevnění hradiště (robota hostů) – dopočet', () => {
    const h = host();
    apply(h, D, arrive(refugees, 100));
    const need = (2 * 180 + 100) / 365;
    refugeFoodDay(h, D);
    expect(h.refugeStays![0]!.foodKg).toBeCloseTo(100 - need, 9);
    expect(h.storesKg).toBeCloseTo(500 + need, 9);
  });

  it('(d) návrat z hradiště – zbylé zásoby a celé stádo domů, bilance host + domov = konstanta', () => {
    const v = home();
    const h = host();
    apply(v, D, depart('all', 300, { ...NO_HERD, sheep: 4 }));
    const homePeople = v.people.slice(0, 3);
    apply(h, D + 2, { ...arrive(homePeople, 290) });
    const total = (): number => v.storesKg + h.storesKg + (h.refugeStays?.[0]?.foodKg ?? 0);
    const sheep = (): number =>
      v.livestock!.herds.sheep + v.livestock!.young.sheep + (h.refugeStays?.[0]?.herd.sheep ?? 0);
    const t0 = total();
    for (let d = D + 2; d < D + 6; d++) refugeFoodDay(h, d);
    expect(total()).toBeCloseTo(t0, 9);
    const sheep0 = sheep();
    const back = leaveRefuge(h, 'c1:a1');
    expect(back).not.toBeNull();
    expect(h.guests).toBeUndefined();
    expect(h.refugeStays).toBeUndefined();
    apply(v, D + 7, {
      kind: 'refuge-back',
      refId: 'c1:a1',
      foodKg: back!.foodKg,
      herd: back!.herd,
    });
    expect(v.storesKg + h.storesKg).toBeCloseTo(t0, 9);
    expect(v.livestock!.herds.sheep + v.livestock!.young.sheep).toBe(sheep0);
    expect(v.refuge).toBeUndefined();
    expect(v.people.every((p) => p.away === undefined)).toBe(true);
    expect(v.chronicle.at(-1)).toEqual({
      day: D + 7,
      kind: 'people-back',
      away: 'refuge',
      people: 3,
    });
    // druhý návrat a druhý odchod z hradiště – nic
    expect(leaveRefuge(h, 'c1:a1')).toBeNull();
    const once = structuredClone(v);
    apply(v, D + 7, { kind: 'refuge-back', refId: 'c1:a1', foodKg: 50, herd: NO_HERD });
    expect(v).toStrictEqual(once);
  });

  it('(d) návrat z lesa vrátí i ukryté zásoby a stádo', () => {
    const v = home();
    apply(v, D, depart('forest', 60, { ...NO_HERD, sheep: 9 }));
    apply(v, D, {
      kind: 'refuge-hidden',
      campaignId: 'c1',
      refId: 'c1:a1',
      foodKg: 60,
      herd: { ...NO_HERD, sheep: 9 },
    });
    apply(v, D + 1, { kind: 'refuge-back', refId: 'c1:a1', foodKg: 0, herd: NO_HERD });
    expect(v.storesKg).toBe(1000);
    expect(v.livestock!.herds.sheep + v.livestock!.young.sheep).toBe(9);
  });

  it('(d) hosté jiné vsi a jiného pobytu zůstanou', () => {
    const h = host();
    h.guests = [
      { ref: { villageId: 'pan', personId: 1 }, kind: 'labor', untilDay: D + 30, adult: true },
    ];
    apply(h, D, arrive(refugees, 10));
    leaveRefuge(h, 'c1:a1');
    expect(h.guests).toEqual([
      { ref: { villageId: 'pan', personId: 1 }, kind: 'labor', untilDay: D + 30, adult: true },
    ]);
  });
});

describe('Ú7 – dostižení (refuge-caught)', () => {
  it('(e) padlí zemřou bez pohřbu, odvedení zmizí, ostatní zůstanou na cestě', () => {
    const v = home();
    apply(v, D, depart('all', 100));
    apply(v, D + 1, {
      kind: 'refuge-caught',
      campaignId: 'c1',
      refId: 'c1:a1',
      killed: [1],
      led: [3],
    });
    expect(v.people.map((p) => p.id)).toEqual([2, 4]);
    expect(v.people[0]!.away?.kind).toBe('refuge');
    expect(v.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'death', cause: 'war', day: D + 1 }),
    );
    expect(v.chronicle.at(-1)).toEqual({ day: D + 1, kind: 'refuge-caught', killed: 1, led: 1 });
    // podruhé – nikdo z nich už ve vsi není
    const once = structuredClone(v);
    apply(v, D + 1, {
      kind: 'refuge-caught',
      campaignId: 'c1',
      refId: 'c1:a1',
      killed: [1],
      led: [3],
    });
    expect(v).toStrictEqual(once);
  });

  it('Ú8 – zajatí muži rodu jsou v zajetí u věznitele, bez věznitele zmizí', () => {
    const v = home();
    v.people[0] = { ...v.people[0]!, line: true };
    apply(v, D, depart('all', 100));
    const caught: VillageEventBody = {
      kind: 'refuge-caught',
      campaignId: 'c1',
      refId: 'c1:a1',
      killed: [],
      led: [3],
      captured: [{ personId: 1, prisonerId: 'c1:v:1' }],
      captorVillageId: 'lhota',
    };
    apply(v, D + 1, caught);
    expect(v.people.find((p) => p.id === 1)!.away).toEqual({
      kind: 'captive',
      hostVillageId: 'lhota',
      refId: 'c1:v:1',
    });
    expect(v.people.map((p) => p.id)).toEqual([1, 2, 4]);
    expect(v.chronicle.at(-1)).toEqual({
      day: D + 1,
      kind: 'refuge-caught',
      killed: 0,
      led: 1,
      captured: 1,
    });
    const free = home();
    apply(free, D, depart('all', 100));
    apply(free, D + 1, { ...caught, led: [], captorVillageId: undefined });
    expect(free.people.map((p) => p.id)).toEqual([2, 3, 4]);
  });
});

describe('Ú7 – posel (messenger-out / back / caught)', () => {
  const out: VillageEventBody = {
    kind: 'messenger-out',
    campaignId: 'c1',
    refId: 'c1:a0',
    personId: 1,
    toVillageId: HOST,
    mounted: false,
  };

  it('(f) posel pryč nepracuje a nejí, po návratu doma', () => {
    const v = home();
    apply(v, D, out);
    const p = v.people[0]!;
    expect(p.away).toEqual({ kind: 'messenger', hostVillageId: HOST, refId: 'c1:a0' });
    expect(laborPerDay(p, D)).toBe(0);
    expect(foodNeedPerDay(p, D)).toBe(0);
    apply(v, D + 3, { kind: 'messenger-back', campaignId: 'c1', refId: 'c1:a0', personId: 1 });
    expect(p.away).toBeUndefined();
    expect(v.chronicle.at(-1)).toEqual({
      day: D + 3,
      kind: 'people-back',
      away: 'messenger',
      people: 1,
    });
    // opakovaně – nic
    const once = structuredClone(v);
    apply(v, D + 3, { kind: 'messenger-back', campaignId: 'c1', refId: 'c1:a0', personId: 1 });
    expect(v).toStrictEqual(once);
  });

  it('(f) kdo je pryč jinak, posla nedělá; chycený padne nebo zmizí', () => {
    const v = home();
    v.people[0]!.away = { kind: 'labor', untilDay: D + 10, hostVillageId: 'x', refId: 'r' };
    apply(v, D, out);
    expect(v.people[0]!.away?.kind).toBe('labor');
    const w = home();
    apply(w, D, out);
    apply(w, D + 1, {
      kind: 'messenger-caught',
      campaignId: 'c1',
      refId: 'c1:a0',
      personId: 1,
      fate: 'killed',
    });
    expect(w.people.map((p) => p.id)).toEqual([2, 3, 4]);
    expect(w.chronicle).toContainEqual(expect.objectContaining({ kind: 'death', cause: 'war' }));
    expect(w.chronicle.at(-1)).toEqual({ day: D + 1, kind: 'messenger-caught', fate: 'killed' });
    const u = home();
    apply(u, D, out);
    apply(u, D + 1, {
      kind: 'messenger-caught',
      campaignId: 'c1',
      refId: 'c1:a0',
      personId: 1,
      fate: 'led',
    });
    expect(u.people.map((p) => p.id)).toEqual([2, 3, 4]);
    expect(u.chronicle.some((e) => e.kind === 'death')).toBe(false);
    // muž rodu zajat (Úloha 5) – zůstává ve stavu vsi jako zajatec u věznitele; podruhé nic
    const c = home();
    apply(c, D, out);
    const caught: VillageEventBody = {
      kind: 'messenger-caught',
      campaignId: 'c1',
      refId: 'c1:a0',
      personId: 1,
      fate: 'captured',
      captorVillageId: 'lhota',
    };
    apply(c, D + 1, caught);
    expect(c.people.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(c.people[0]!.away).toEqual({ kind: 'captive', hostVillageId: 'lhota', refId: 'c1:1' });
    expect(c.chronicle.at(-1)).toEqual({ day: D + 1, kind: 'messenger-caught', fate: 'captured' });
    const captive = structuredClone(c);
    apply(c, D + 1, caught);
    expect(c).toStrictEqual(captive);
    // chycený posel jiné výpravy (jiný refId) – nic
    const z = home();
    apply(z, D, out);
    const once = structuredClone(z);
    apply(z, D + 1, {
      kind: 'messenger-caught',
      campaignId: 'c1',
      refId: 'c1:a9',
      personId: 1,
      fate: 'killed',
    });
    expect(z).toStrictEqual(once);
  });

  it('(f) muž rodu na koni – kůň je pryč s ním; padne-li, kůň se nevrátí', () => {
    const v = horseVillage([horse(91, 8, 'male', 100), horse(92, 9, 'male', 100)]);
    const lord = v.people.find((p) => p.id === LORD_ID)!;
    lord.line = true;
    v.pens!.find((p) => p.id === 90)!.horses![1]!.riderId = LORD_ID;
    const mounted: VillageEventBody = {
      ...out,
      personId: LORD_ID,
      mounted: true,
    } as VillageEventBody;
    apply(v, START + 1, mounted);
    expect(lord.away).toEqual({
      kind: 'messenger',
      hostVillageId: HOST,
      refId: 'c1:a0',
      horseId: 92,
    });
    const back = structuredClone(v);
    apply(back, START + 4, {
      kind: 'messenger-back',
      campaignId: 'c1',
      refId: 'c1:a0',
      personId: LORD_ID,
    });
    expect(back.pens!.find((p) => p.id === 90)!.horses!.map((h) => h.id)).toEqual([91, 92]);
    apply(v, START + 2, {
      kind: 'messenger-caught',
      campaignId: 'c1',
      refId: 'c1:a0',
      personId: LORD_ID,
      fate: 'killed',
    });
    expect(v.pens!.find((p) => p.id === 90)!.horses!.map((h) => h.id)).toEqual([91]);
    expect(v.people.some((p) => p.id === LORD_ID)).toBe(false);
    expect(v.chronicle).toContainEqual(expect.objectContaining({ kind: 'death', cause: 'war' }));
  });

  it('(f) na koni bez svého koně – vezme volného jezdeckého', () => {
    const v = horseVillage([
      horse(91, 1, 'male', 0),
      horse(92, 9, 'female', 0),
      horse(93, 7, 'male', 50),
    ]);
    v.people.find((p) => p.id === LORD_ID)!.line = true;
    apply(v, START + 1, { ...out, personId: LORD_ID, mounted: true } as VillageEventBody);
    expect(v.people.find((p) => p.id === LORD_ID)!.away?.horseId).toBe(93);
    expect(v.pens![v.pens!.length - 1]!.horses!.find((h) => h.id === 93)!.riderId).toBe(LORD_ID);
  });
});

describe('Ú7 – dopočet po kouscích', () => {
  const FOUNDED = 200;

  function founded(): VillageState {
    return withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: FOUNDED, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
  }

  it('(g) les, návrat a posel po 1 / 3 / 10 dnech = vcelku', () => {
    const start = advanceVillage(founded(), FOUNDED + 5, null);
    const ids = start.people.map((p) => p.id);
    const [runner, ...rest] = ids;
    const d0 = start.lastDay + 2;
    const events: VillageEvent[] = [
      event(d0, 0, {
        kind: 'messenger-out',
        campaignId: 'c1',
        refId: 'c1:a0',
        personId: runner!,
        toVillageId: HOST,
        mounted: false,
      }),
      event(d0, 1, { ...depart('forest', 40), people: rest } as VillageEventBody),
      event(d0, 2, {
        kind: 'refuge-hidden',
        campaignId: 'c1',
        refId: 'c1:a1',
        foodKg: 40,
        herd: NO_HERD,
      }),
      event(d0 + 4, 0, {
        kind: 'messenger-back',
        campaignId: 'c1',
        refId: 'c1:a0',
        personId: runner!,
      }),
      event(d0 + 7, 0, { kind: 'refuge-back', refId: 'c1:a1', foodKg: 0, herd: NO_HERD }),
    ];
    const end = d0 + 12;
    const whole = advanceVillage(start, end, null, null, events);
    expect(whole.refuge).toBeUndefined();
    expect(whole.people.every((p) => p.away === undefined)).toBe(true);
    for (const step of [1, 3, 10]) {
      let chunked = start;
      while (chunked.lastDay < end) {
        chunked = advanceVillage(
          chunked,
          Math.min(end, chunked.lastDay + step),
          null,
          null,
          events,
        );
      }
      expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
    }
    // v lese ukryté jídlo ubývalo dřív než zásoby vsi
    const mid = advanceVillage(start, d0 + 2, null, null, events);
    expect(mid.refuge!.hidden!.foodKg).toBeLessThan(40);
    expect(mid.refuge!.hidden!.foodKg).toBeGreaterThan(0);
  });

  it('(g) hradiště s hosty uprchlíků po 1 / 3 / 10 dnech = vcelku', () => {
    const start = advanceVillage(founded(), FOUNDED + 5, null);
    const d0 = start.lastDay + 2;
    const refugees = home().people.slice(0, 3);
    const events: VillageEvent[] = [event(d0, 0, arrive(refugees, 3))];
    const end = d0 + 12;
    const whole = advanceVillage(start, end, null, null, events);
    expect(whole.refugeStays![0]!.foodKg).toBe(0);
    expect(whole.guests).toHaveLength(3);
    for (const step of [1, 3, 10]) {
      let chunked = start;
      while (chunked.lastDay < end) {
        chunked = advanceVillage(
          chunked,
          Math.min(end, chunked.lastDay + step),
          null,
          null,
          events,
        );
      }
      expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
    }
  });
});
