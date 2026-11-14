import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import { plotFenceRect } from '../homestead-layout';
import {
  ARRIVE_M,
  CATCH_M_S,
  HOME_REACH_M,
  JourneyLeave,
  arrivalScripts,
  departureScripts,
  legPose,
  withoutMen,
  type JourneyYard,
} from '../journey-departure';
import type { RiderPose, SceneJourney } from '../journey-riders';
import { LEAD_M_S, LEAD_WAIT_S } from '../riders';
import { manorTrainingGround } from '../training-ground-layout';

// Dvorec: vchod v počátku, brána 20 m na sever, kůň vojvody u kůlu (3, 18) čelem na sever, ohrada
// koní na východě – kůň jde od branky (20, 18) ke kůlu 17 m.
const yard: JourneyYard = {
  door: { x: 0, z: 0 },
  gate: { x: 0, z: 20 },
  horses: [
    {
      riderId: 7,
      horseId: 70,
      spot: { x: 3, z: 18, headingX: 0, headingZ: 1 },
      lead: {
        points: [
          { x: 20, z: 18 },
          { x: 3, z: 18 },
        ],
        length: 17,
        heading: { x: 0, z: 1 },
      },
    },
  ],
};
/** Domov výjezdu – místo, odkud jádro skupinu vysílá a kam ji vrací (`JourneyView.homePos`). */
const home = { x: 10, z: 30 };

const journey = (over: Partial<SceneJourney> = {}): SceneJourney => ({
  journeyId: 'j1',
  own: true,
  leader: 'Bořivoj',
  house: 'Bořivojovci',
  tick: 10,
  pos: { ...home },
  goal: null,
  home: { ...home },
  men: [
    { key: '7', personId: 7, lord: true, mounted: true, wounded: false },
    { key: '8', personId: 8, lord: false, mounted: false, wounded: false },
  ],
  arrived: false,
  phase: 'out',
  waitDaysLeft: null,
  ...over,
});

/** Muži skupiny, jak je ukazuje server (`JourneyGlide`): jede na východ 2 m/s od `x0`. */
const glideAt = (ms: number, x0 = home.x, z = home.z): RiderPose[] =>
  [
    { key: '7', personId: 7, lord: true, mounted: true, dz: 0 },
    { key: '8', personId: 8, lord: false, mounted: false, dz: -3 },
  ].map((m) => ({
    journeyId: 'j1',
    own: true,
    key: m.key,
    personId: m.personId,
    x: x0 + 2 * (ms / 1000),
    z: z + m.dz,
    hx: 1,
    hz: 0,
    mounted: m.mounted,
    lord: m.lord,
    wounded: false,
    speed: 2,
  }));

const lordOf = (poses: readonly RiderPose[]): RiderPose | undefined =>
  poses.find((p) => p.key === '7');

describe('departureScripts – pořadí kroků', () => {
  it('jezdec jde ke kůlu, kůň dojde z ohrady a 10 s stojí, jezdec nasedne a jede k bráně', () => {
    const [lord, foot] = departureScripts(journey(), yard);
    const ready = 17 / LEAD_M_S + LEAD_WAIT_S;
    // pěšky z vchodu k místu vedle koně
    const walking = legPose(lord!, 1)!;
    expect(walking.mounted).toBe(false);
    expect(Math.hypot(walking.x, walking.z)).toBeCloseTo(1.5, 5);
    // čeká u koně (vlevo od něj), dokud kůň nedojde a nepostojí
    const waits = legPose(lord!, ready - 0.1)!;
    expect(waits).toMatchObject({ mounted: false, speed: 0 });
    expect(waits.x).toBeCloseTo(2.2, 5);
    // nasedl a jede krokem k bráně
    const rides = legPose(lord!, ready + 0.1)!;
    expect(rides.mounted).toBe(true);
    expect(rides.speed).toBeCloseTo(1.5, 5);
    expect(legPose(lord!, lord!.end - 1e-6)).toMatchObject({ mounted: true });
    const atGate = legPose(lord!, lord!.end - 1e-6)!;
    expect(Math.hypot(atGate.x - yard.gate.x, atGate.z - yard.gate.z)).toBeLessThan(0.01);
    expect(lord!.horse).toMatchObject({ horseId: 70, back: false, until: ready });
    // pěší bez koně vyjde z dvorce po vojvodovi a jde k bráně rovnou, ke kůlu nechodí
    expect(foot!.horse).toBeNull();
    expect(legPose(foot!, 0.1)).toBeNull();
    for (let s = 1; s < foot!.end; s += 0.5) {
      const p = legPose(foot!, s)!;
      expect(p.mounted).toBe(false);
      expect(p.x).toBeCloseTo(0, 5);
    }
  });

  it('kůň bez ohrady stojí u kůlu, jezdec nasedne, až k němu dojde (nejdřív po 10 s)', () => {
    const noPen: JourneyYard = { ...yard, horses: [{ ...yard.horses[0]!, lead: null }] };
    const [lord] = departureScripts(journey(), noPen);
    // k místu vedle koně (2,2; 18) dojde chůzí 1,5 m/s později než za 10 s
    expect(lord!.horse).toMatchObject({ lead: null, until: Math.hypot(2.2, 18) / 1.5 });
    const near = { ...yard, horses: [{ ...yard.horses[0]!, lead: null }], door: { x: 2, z: 17 } };
    expect(departureScripts(journey(), near)[0]!.horse!.until).toBe(LEAD_WAIT_S);
  });
});

describe('JourneyLeave – odjezd', () => {
  it('čerstvě vyslaný výjezd odjíždí: kůň opustí ohradu, jezdec nasedne a za branou dožene skupinu', () => {
    const leave = new JourneyLeave();
    leave.setYard(yard);
    expect(leave.observe([journey()], 0, false)).toBe(true);
    expect(leave.ownPhase()).toBe('departing');
    // kůň jde z ohrady ke kůlu, ohrada ho nekreslí
    const early = leave.at(glideAt(1000), 1000, false);
    expect(early.led).toHaveLength(1);
    expect(early.led[0]!.x).toBeCloseTo(20 - LEAD_M_S, 5);
    expect(early.led[0]!.speed).toBe(LEAD_M_S);
    expect(lordOf(early.poses)!.mounted).toBe(false);
    expect(leave.horsesOut(1000)).toEqual([70]);
    // po nasednutí kůň bez jezdce není
    const mounted = leave.at(glideAt(25_000), 25_000, false);
    expect(mounted.led).toHaveLength(0);
    expect(lordOf(mounted.poses)!.mounted).toBe(true);
    // dohání skupinu plynule, svižněji než ona, a pak jede přesně s ní
    let prev: RiderPose | null = null;
    let fastest = 0;
    let ms = 25_000;
    for (; ms < 90_000 && leave.active(); ms += 50) {
      const lord = lordOf(leave.at(glideAt(ms), ms, false).poses)!;
      // bez skoku: nejvýš skupina (2 m/s) + stahování odstupu za 50 ms
      if (prev) {
        expect(Math.hypot(lord.x - prev.x, lord.z - prev.z)).toBeLessThan(
          (2 + CATCH_M_S.mounted) * 0.05 + 0.01,
        );
      }
      fastest = Math.max(fastest, lord.speed);
      prev = lord;
    }
    expect(leave.active()).toBe(false);
    // svižněji než skupina (2 m/s)
    expect(fastest).toBeGreaterThan(CATCH_M_S.mounted);
    const after = leave.at(glideAt(ms), ms, false);
    expect(after.poses).toEqual(glideAt(ms));
    expect(Math.hypot(prev!.x - glideAt(ms)[0]!.x, prev!.z - glideAt(ms)[0]!.z)).toBeLessThan(0.35);
    expect(leave.ownPhase()).toBe('riding');
  });

  it('načtení uprostřed výjezdu odjezd nepřehraje – skupina už je pryč, nebo stojí', () => {
    const away = new JourneyLeave();
    away.setYard(yard);
    expect(away.observe([journey({ pos: { x: 200, z: 30 } })], 0, false)).toBe(false);
    expect(away.ownPhase()).toBe('riding');
    // stejný výjezd se pak vrátí k místu vsi ven – odjezd už nezačne
    expect(away.observe([journey({ tick: 11 })], 500, false)).toBe(false);
    const waiting = new JourneyLeave();
    waiting.setYard(yard);
    expect(waiting.observe([journey({ arrived: true })], 0, false)).toBe(false);
    // cizí výjezd z dvorce nevyjíždí
    const visitor = new JourneyLeave();
    visitor.setYard(yard);
    expect(visitor.observe([journey({ own: false, phase: null })], 0, false)).toBe(false);
  });

  it('omezený pohyb odjezd přeskočí – muži stojí, kde je ukáže server', () => {
    const leave = new JourneyLeave();
    leave.setYard(yard);
    expect(leave.observe([journey()], 0, true)).toBe(false);
    expect(leave.at(glideAt(1000), 1000, true).poses).toEqual(glideAt(1000));
    // rozběhlý odjezd omezený pohyb ukončí
    const running = new JourneyLeave();
    running.setYard(yard);
    running.observe([journey()], 0, false);
    expect(running.at(glideAt(1000), 1000, true)).toMatchObject({ led: [], poses: glideAt(1000) });
    expect(running.active()).toBe(false);
  });

  // Martinův Vlkov stojí ≈ 430 m od místa vsi krajiny – odjezd i příjezd se měří od domova
  // výjezdu ze serveru (dvorec), scéna místo vsi sama nepočítá (Martin 14. 11. 2026)
  it('odjezd i příjezd měří od domova výjezdu ze serveru, ne od místa vsi krajiny', () => {
    const manor = { x: 430, z: -250 };
    const fresh = new JourneyLeave();
    fresh.setYard(yard);
    expect(fresh.observe([journey({ home: manor, pos: { ...manor } })], 0, false)).toBe(true);
    expect(fresh.ownPhase()).toBe('departing');
    // skupina u místa vsi krajiny, ale daleko od svého domova – vyjela dřív, odjezd se nepřehraje
    const away = new JourneyLeave();
    away.setYard(yard);
    expect(away.observe([journey({ home: manor })], 0, false)).toBe(false);
    expect(away.ownPhase()).toBe('riding');
    // návrat: příjezd začne až u domova výjezdu
    const pos = { x: manor.x + ARRIVE_M + 5, z: manor.z };
    away.observe([journey({ home: manor, phase: 'returning', pos })], 100, false);
    away.at(glideAt(0, pos.x, pos.z), 200, false);
    expect(away.ownPhase()).toBe('riding');
    const near = { x: manor.x + 10, z: manor.z };
    expect(
      away.observe([journey({ home: manor, phase: 'returning', pos: near })], 1000, false),
    ).toBe(true);
    expect(away.ownPhase()).toBe('arriving');
  });

  it('bez míst dvorce se nic nepřehrává', () => {
    const leave = new JourneyLeave();
    leave.setYard(null);
    expect(leave.observe([journey()], 0, false)).toBe(false);
  });
});

describe('JourneyLeave – příjezd (návrat opačně)', () => {
  /** Výjezd, který se vrací: daleko, kousek za mezí příjezdu a u vsi. */
  function returning(): JourneyLeave {
    const leave = new JourneyLeave();
    leave.setYard(yard);
    leave.observe([journey({ pos: { x: 200, z: 30 } })], 0, false);
    const x0 = home.x + ARRIVE_M + 5;
    leave.observe([journey({ phase: 'returning', pos: { x: x0, z: home.z } })], 100, false);
    expect(leave.ownPhase()).toBe('riding');
    leave.at(glideAt(0, x0), 200, false);
    return leave;
  }

  it('k bráně, u kůlu sesedne, kůň jde do ohrady a muži vejdou do dvorce', () => {
    const leave = returning();
    const near = journey({ phase: 'returning', pos: { x: home.x + 10, z: home.z } });
    expect(leave.observe([near], 1000, false)).toBe(true);
    expect(leave.ownPhase()).toBe('arriving');
    expect(leave.menOut().sort()).toEqual([7, 8]);
    // stavy ze serveru se už nekreslí – muži jedou k bráně
    const first = leave.at(glideAt(0, home.x + 10), 1500, false);
    const lord = lordOf(first.poses)!;
    expect(lord.mounted).toBe(true);
    expect(lord.x).toBeLessThan(home.x + ARRIVE_M + 5);
    // sesednutí: kůň jde zpět k brance ohrady, jezdec pěšky ke vchodu
    let led = false;
    let walkedIn = false;
    for (let ms = 1500; ms < 120_000; ms += 250) {
      const shown = leave.at([], ms, false);
      const l = lordOf(shown.poses);
      if (shown.led.length > 0) {
        led = true;
        expect(shown.led[0]!.hx).toBeGreaterThan(0.9);
        if (l) expect(l.mounted).toBe(false);
      }
      if (led && !l) walkedIn = true;
      if (!leave.active()) break;
    }
    expect(led).toBe(true);
    expect(walkedIn).toBe(true);
    // kůň vešel do ohrady; výjezd ve scéně pořád je – příjezd čeká, až skončí
    expect(leave.horsesOut(120_000)).toEqual([]);
    expect(leave.ownPhase()).toBe('arriving');
    expect(leave.observe([], 121_000, false)).toBe(false);
    leave.at([], 121_000, false);
    expect(leave.active()).toBe(false);
    expect(leave.ownPhase()).toBeNull();
    expect(leave.menOut()).toEqual([]);
  });

  it('skončený vracející se výjezd přijede od místa, kde byl naposled nakreslený', () => {
    const leave = returning();
    expect(leave.observe([], 1000, false)).toBe(true);
    expect(leave.ownPhase()).toBe('arriving');
    expect(leave.horsesOut(1000)).toEqual([70]);
    const lord = lordOf(leave.at([], 1000, false).poses)!;
    expect(lord.x).toBeCloseTo(home.x + ARRIVE_M + 5, 1);
  });

  it('výjezd, který zmizel u vsi, přijede i bez fáze návratu; odjetý přes okraj mapy ne', () => {
    // krátký návrat: scéna viděla skupinu čekat 45 m od vsi, pak výjezd skončil (bod po 10 s)
    const short = new JourneyLeave();
    short.setYard(yard);
    const waiting = { x: home.x + 45, z: home.z };
    short.observe([journey({ pos: waiting, arrived: true })], 0, false);
    short.at(glideAt(0, waiting.x), 0, false);
    expect(short.observe([], 1000, false)).toBe(true);
    expect(short.ownPhase()).toBe('arriving');
    // skupina odjela přes okraj mapy – ze scény zmizí daleko od vsi
    const gone = new JourneyLeave();
    gone.setYard(yard);
    const edge = { x: home.x + HOME_REACH_M + 300, z: home.z };
    gone.observe([journey({ pos: edge })], 0, false);
    gone.at(glideAt(0, edge.x), 0, false);
    expect(gone.observe([], 1000, false)).toBe(false);
    expect(gone.ownPhase()).toBeNull();
  });

  it('arrivalScripts – pěší jde k bráně a vchodem dovnitř, jezdec bez koně u kůlu dojede na koni', () => {
    const [lord, foot] = arrivalScripts(glideAt(0), { ...yard, horses: [] });
    expect(lord!.horse).toBeNull();
    expect(legPose(lord!, lord!.end - 1e-6)).toMatchObject({ mounted: true });
    const end = legPose(foot!, foot!.end - 1e-6)!;
    expect(Math.hypot(end.x - yard.door.x, end.z - yard.door.z)).toBeLessThan(0.01);
    expect(foot!.legs[0]!.b).toEqual(yard.gate);
  });
});

describe('withoutMen', () => {
  it('den rodiny nekreslí muže, kteří přijíždějí – ani na jízdě, u manželky ani v doprovodu', () => {
    const lord = {
      home: 1,
      lordId: 7,
      trainees: [{ id: 7 }, { id: 9 }],
      riders: [{ id: 7, horseId: 70, training: 50, hours: 2 }],
      visit: { lordId: 7, homes: [2] },
    };
    const village = { labor: { lord } } as unknown as SceneVillage;
    const out = withoutMen(village, new Set([7]));
    expect(out.labor!.lord!.trainees.map((t) => t.id)).toEqual([9]);
    expect(out.labor!.lord!.riders).toBeUndefined();
    expect(out.labor!.lord!.visit).toBeUndefined();
    expect(withoutMen(village, new Set())).toBe(village);
  });
});

describe('manorTrainingGround – brána dvorce', () => {
  it('stojí uprostřed konce dvora na plotu, čelem ven', () => {
    const square = { x: 7.5, z: 7.5, size: 15, yard: { x: 7.5, z: -7.5 } };
    const gate = manorTrainingGround(square, 1).gate!;
    expect(gate.x).toBeCloseTo(7.5, 5);
    expect(gate.z).toBeCloseTo(plotFenceRect(square).minZ, 5);
    expect(gate.headingZ).toBeCloseTo(-1, 5);
  });
});
