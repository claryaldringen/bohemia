import { describe, expect, it } from 'vitest';
import { toolNeedKg } from '../../crafts/iron';
import { craftCoverage } from '../../crafts/crafts';
import { goldenWorld, YEAR } from '../../core/__tests__/village-golden-fixture';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { kinSingles } from '../../people/kin-match';
import { stewardOutlook } from '../../steward/steward-outlook';
import type { ChronicleEvent, VillageMail, VillageState } from '../../types';
import { withWorkshop } from './market-fixtures';

// Dvě vsi po sobě 3 roky po dnech (markets.md – Rozhodnutí plánu 3, Co se ověří): ves R s kovářem,
// hrnčířem a tesařem a ves S bez řemeslníků na sousedních mapách; pošta mezi nimi jde po každém
// dni jako události schránky, okolí se obnovuje každých 30 dní. Kontrolní běh S bez okolí.
// Pomalý test (`packages/game/slow-tests.ts`).

// konec v lednu: 1. 3. jede osivo a lidé jsou den výpravy pryč, což by kapacitu polí zkreslilo
const DAYS = 3 * YEAR - 40;
const REFRESH = 30;

/** Každý den: kolik nových zápisů kroniky daného druhu (zápisy dne po posledním dni stavu). */
interface Tally {
  births: number;
  deaths: number;
  hungerDeaths: number;
  leftWorld: number;
  weddings: number;
  extraWives: number;
}

interface Side {
  id: 'r' | 's';
  name: string;
  state: VillageState;
  pending: VillageEvent[];
  tally: Tally;
}

const newTally = (): Tally => ({
  births: 0,
  deaths: 0,
  hungerDeaths: 0,
  leftWorld: 0,
  weddings: 0,
  extraWives: 0,
});

function count(side: Side, events: readonly ChronicleEvent[]): void {
  const t = side.tally;
  for (const e of events) {
    if (e.kind === 'birth') t.births += 1;
    else if (e.kind === 'death') {
      t.deaths += 1;
      if (e.cause === 'hunger') t.hungerDeaths += 1;
    } else if (e.kind === 'son-left-village' || e.kind === 'households-left') {
      t.leftWorld += e.people;
    } else if (
      e.kind === 'bride-from-outside' ||
      e.kind === 'groom-from-outside' ||
      e.kind === 'married-away'
    )
      t.weddings += 1;
    else if (e.kind === 'extra-wife') t.extraWives += 1;
  }
}

/** Lidé, kteří právě nejsou v žádné vsi: ve zprávách na cestě a na trzích hostitelů. */
function inFlight(sides: readonly Side[]): number {
  let n = 0;
  const bodies = sides.flatMap((s) => [
    ...(s.state.outbox ?? []).map((m) => m.body),
    ...s.pending.map((e) => e.body),
  ]);
  for (const b of bodies) {
    if (b.kind === 'market-arrive')
      n += (b.arrival.people ?? []).reduce((a, g) => a + g.people.length, 0);
    else if (b.kind === 'market-result')
      n +=
        (b.result.people ?? []).reduce((a, g) => a + g.people.length, 0) +
        (b.result.newcomers ?? []).reduce((a, g) => a + g.people.length, 0);
    else if (b.kind === 'stranded-people')
      n +=
        b.people.reduce((a, g) => a + g.people.length, 0) +
        (b.own ?? []).reduce((a, g) => a + g.people.length, 0);
  }
  for (const s of sides)
    for (const v of s.state.market?.visitors ?? [])
      n +=
        (v.people ?? []).reduce((a, g) => a + g.people.length, 0) +
        (v.boughtPeople ?? []).reduce((a, g) => a + g.people.length, 0);
  return n;
}

function hasNaN(value: unknown, path = ''): string | null {
  if (typeof value === 'number') return Number.isNaN(value) ? path : null;
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const found = hasNaN(v, `${path}.${k}`);
      if (found) return found;
    }
  }
  return null;
}

describe('dvě vsi na sousedních mapách po tři roky (markets.md – Co se ověří, plán 3)', () => {
  it('vybavení vsi bez řemeslníků roste nákupem, pole se vracejí, nikdo nezmizí', () => {
    const world = goldenWorld();
    const start = world.start.lastDay;
    const report = (s: VillageState, crafts: ('smith' | 'potter' | 'carpenter')[]) => ({
      day: s.lastDay,
      people: s.people.length,
      houses: s.dwellings.length,
      crafts,
      traders: [],
    });

    // R: kovář, hrnčíř, tesař a obilí nad pojistkou; S: samotná zlatá ves
    const r0 = structuredClone(world.start);
    withWorkshop(r0, 'smith', 9001);
    withWorkshop(r0, 'potter', 9002);
    withWorkshop(r0, 'carpenter', 9003);
    r0.storesKg += 20_000;
    // kovář bez uhlí nekuje (milíř ve zlaté vsi není) – uhlí na tři roky
    // kovář zlaté vsi tři roky vyrobí málo železa – nástroje nad potřebu má R ve vybavení předem
    r0.toolEquipmentKg = toolNeedKg(r0, start) + 400;
    r0.crafts = { ...r0.crafts!, charcoalKg: 6_000 };
    const s0 = structuredClone(world.start);
    s0.seed += 1;
    const crafts = ['smith', 'potter', 'carpenter'] as const;
    r0.nearby = {
      day: start,
      self: { villageId: 'r', name: 'Rovná' },
      villages: [{ villageId: 's', name: 'Studánka', cells: 1, firstStep: 'W' }],
    };
    r0.news = [{ villageId: 's', name: 'Studánka', report: report(s0, []) }];
    s0.nearby = {
      day: start,
      self: { villageId: 's', name: 'Studánka' },
      villages: [{ villageId: 'r', name: 'Rovná', cells: 1, firstStep: 'E' }],
    };
    s0.news = [{ villageId: 'r', name: 'Rovná', report: report(r0, [...crafts]) }];
    // S má o 15 kg nástrojů míň, než potřebuje (jako villagersHome) – kupuje, jen když se vyplatí
    s0.toolEquipmentKg = Math.max(0, toolNeedKg(s0, start) - 15);
    // obilí nad pojistkou, ať má za co nástroje platit (60 kg obilí za kg); keramiku a dřevěné
    // nářadí S nemá – jedna cesta unese ~125 kg a keramika ji zabere, nástroje jedou další cestou
    // po návratu (`villagersRetry` – plán 3, závěrečná kontrola I1)
    s0.storesKg += 20_000;
    const control = structuredClone(s0);
    delete control.nearby;
    delete control.news;

    const r: Side = { id: 'r', name: 'Rovná', state: r0, pending: [], tally: newTally() };
    const s: Side = { id: 's', name: 'Studánka', state: s0, pending: [], tally: newTally() };
    const sides = [r, s];
    const startPeople = r.state.people.length + s.state.people.length;
    const equipStart = s0.toolEquipmentKg ?? 0;
    let seq = 0;
    let toolsBought = 0;
    let potteryBought = 0;
    const started = new Map<string, number>();
    const resulted = new Set<string>();

    for (let day = start + 1; day <= start + DAYS; day++) {
      // okolí: snímek se singles druhé vsi každých 30 dní (zápis v pevné dny)
      if ((day - start) % REFRESH === 0) {
        for (const side of sides) {
          const other = side === r ? s : r;
          const singles = kinSingles(other.state, other.state.lastDay);
          side.pending.push({
            id: `nearby:${side.id}:${day}`,
            seq: ++seq,
            villageId: side.id,
            day,
            body: {
              kind: 'nearby',
              nearby: {
                day,
                self: { villageId: side.id, name: side.name },
                villages: [
                  {
                    villageId: other.id,
                    name: other.name,
                    cells: 1,
                    firstStep: side === r ? 'W' : 'E',
                    ...(singles.length > 0 ? { singles } : {}),
                  },
                ],
              },
            },
          });
        }
      }
      for (const side of sides) {
        const due = side.pending.filter((e) => e.day <= day);
        side.pending = side.pending.filter((e) => e.day > day);
        const before = side.state.lastDay;
        const next = advanceVillage(
          side.state,
          day,
          world.obstacles,
          world.landscape,
          due.map((e) => ({ ...e, day: Math.max(e.day, before + 1) })),
        );
        count(
          side,
          next.chronicle.filter((e) => e.day > before),
        );
        for (const e of next.trade?.expeditions ?? [])
          if (e.by === 'villagers' && e.market && !started.has(e.market.key))
            started.set(e.market.key, e.market.returnDay);
        const mails: VillageMail[] = next.outbox ?? [];
        delete next.outbox;
        side.state = next;
        for (const mail of mails) {
          const target = sides.find((x) => x.id === mail.villageId);
          if (!target) continue;
          if (mail.body.kind === 'market-result') {
            resulted.add(mail.body.result.key);
            if (target === s) {
              toolsBought += mail.body.result.bought.tools ?? 0;
              potteryBought += mail.body.result.bought.pottery ?? 0;
            }
          }
          target.pending.push({
            id: mail.ref,
            seq: ++seq,
            villageId: mail.villageId,
            day: mail.day,
            body: mail.body,
          });
        }
      }
      // lidé nikdy nezmizí: začátek + porody − úmrtí − odchod ze světa = ve vsích + na cestě
      if ((day - start) % 90 === 0) {
        const born = r.tally.births + s.tally.births;
        const died = r.tally.deaths + s.tally.deaths;
        const left = r.tally.leftWorld + s.tally.leftWorld;
        const alive = r.state.people.length + s.state.people.length + inFlight(sides);
        expect(alive, `den ${day - start}: ${startPeople} + ${born} − ${died} − ${left}`).toBe(
          startPeople + born - died - left,
        );
        for (const side of sides) {
          const ids = new Set(side.state.people.map((p) => p.id));
          expect((side.state.emigrants ?? []).filter((e) => ids.has(e.id))).toEqual([]);
        }
      }
    }

    const end = start + DAYS;
    const controlEnd = advanceVillage(control, end, world.obstacles, world.landscape);
    const equipEnd = s.state.toolEquipmentKg ?? 0;
    const equipControl = controlEnd.toolEquipmentKg ?? 0;
    const labor = (v: VillageState): number =>
      stewardOutlook(v, v.lastDay, craftCoverage(v, v.lastDay)).laborHa;
    const report3 = {
      equipStart,
      equipEnd,
      equipControl,
      toolsBought,
      potteryBought,
      laborS: labor(s.state),
      laborControl: labor(controlEnd),
      weddings: r.tally.weddings + s.tally.weddings,
      extraWives: r.tally.extraWives + s.tally.extraWives,
      births: r.tally.births + s.tally.births,
      deaths: r.tally.deaths + s.tally.deaths,
      peopleS: s.state.people.length,
      peopleControl: controlEnd.people.length,
      partsS: s.state.parts?.length,
      partsControl: controlEnd.parts?.length,
      storesS: Math.round(s.state.storesKg),
      storesControl: Math.round(controlEnd.storesKg),
      expeditionsByVillagers: started.size,
      peopleEnd: r.state.people.length + s.state.people.length,
    };
    console.log('market-neighbours-years', JSON.stringify(report3));

    expect(equipEnd).toBeGreaterThan(equipControl);
    expect(toolsBought).toBeGreaterThan(0);
    expect(potteryBought).toBeGreaterThan(0);
    // pole se vracejí: lepší pokrytí nástroji kapacitu polí nesníží (výhled správce počítá orbu
    // plánu i kapacitu spřežení při dnešním pokrytí – plán 3, závěrečná kontrola I3); S s okolím
    // a kontrola se liší jen zásobami a pěšinami – rozdíl výhledu je šum ~1e-6, proto mez 1e-4
    // (před opravou S −13,6 %)
    expect(labor(s.state)).toBeGreaterThanOrEqual(labor(controlEnd) * (1 - 1e-4));
    expect(r.tally.hungerDeaths + s.tally.hungerDeaths).toBe(0);
    expect(hasNaN(r.state)).toBeNull();
    expect(hasNaN(s.state)).toBeNull();
    expect(started.size).toBeGreaterThan(0);
    for (const [key, returnDay] of started)
      if (returnDay + 30 < end) expect(resulted.has(key), key).toBe(true);
  }, 600_000);
});
