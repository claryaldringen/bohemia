import {
  HUNT,
  TICK_MS,
  beatersAt,
  beatersPlan,
  endBeaters,
  type ExpeditionView,
  type HuntView,
  type Pos,
} from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import { sceneHuntOf, type SceneHunt } from '../../journey-view';
import type { SceneVillage } from '../../village-view-scene-types';
import {
  HUNT_DOGS_MAX,
  QuarryGlide,
  beaterFigures,
  huntDogFigures,
  poleBetween,
  withoutHuntDogs,
} from '../hunt-scene';

// Scéna lovu (plán 2026-11-22-hunting – Úloha 10): vyhnané zvíře klouže mezi pohledy po taktech,
// honci jdou podle taktu (`beatersAt`), zabité zvíře nesou honci 0 a 1 na tyči.

const FROM: Pos = { x: 0, z: 0 };
const DOOR: Pos = { x: 0, z: 200 };

type Quarry = NonNullable<HuntView['quarry']>;

function quarry(over: Partial<Quarry> = {}): Quarry {
  return {
    kind: 'stag',
    pos: { x: 0, z: 160 },
    heading: { x: 0, z: -1 },
    state: 'flee',
    hits: 0,
    ...over,
  };
}

function hunt(over: Partial<SceneHunt> = {}): SceneHunt {
  return {
    journeyId: 'j1',
    quarry: quarry(),
    beaters: beatersPlan(FROM, DOOR, 0),
    dogs: 2,
    strikers: [],
    outcome: 'ongoing',
    tick: 100,
    ...over,
  };
}

/** Pohled na lov, jak ho posílá server (bez výpravy). */
function huntView(over: Partial<SceneHunt> = {}): HuntView {
  const { journeyId, ...view } = hunt(over);
  expect(journeyId).toBe('j1');
  return view;
}

/** Okamžik (ms), kdy přehrávání ukazuje takt `tick`. */
function msAt(glide: QuarryGlide, tick: number, fromMs: number): number {
  return fromMs + (tick - glide.tickAt(fromMs)) * TICK_MS;
}

describe('QuarryGlide – zvíře klouže mezi pohledy po taktech', () => {
  it('v půli mezi dvěma takty je v půli cesty a hledí po směru', () => {
    const glide = new QuarryGlide();
    glide.push(hunt({ tick: 100, quarry: quarry({ pos: { x: 0, z: 160 } }) }), 1_000);
    glide.push(hunt({ tick: 104, quarry: quarry({ pos: { x: 4, z: 160 } }) }), 2_000);
    const pose = glide.at(msAt(glide, 102, 2_000));
    expect(pose?.pos.x).toBeCloseTo(2, 6);
    expect(pose?.pos.z).toBeCloseTo(160, 6);
    expect(pose?.model).toBe('wild-stag');
    expect(pose?.scale).toBe(1);
    expect(pose?.lying).toBe(false);
    // směr z pohledu (heading 0, −1 = k jihu)
    expect(pose?.yaw).toBeCloseTo(Math.PI, 6);
  });

  it('přehrávání jde za posledním pohledem a nikdy necouvá', () => {
    const glide = new QuarryGlide();
    glide.push(hunt({ tick: 100 }), 1_000);
    const before = glide.tickAt(1_900);
    expect(before).toBeLessThan(100);
    glide.push(hunt({ tick: 104 }), 2_000);
    expect(glide.tickAt(2_000)).toBeGreaterThanOrEqual(before);
    expect(glide.tickAt(2_000)).toBeLessThan(104);
  });

  it('zabité zvíře leží – až od taktu, kdy padlo', () => {
    const glide = new QuarryGlide();
    glide.push(hunt({ tick: 100 }), 1_000);
    glide.push(hunt({ tick: 104, quarry: quarry({ state: 'dead' }), outcome: 'killed' }), 2_000);
    expect(glide.at(msAt(glide, 102, 2_000))?.lying).toBe(false);
    expect(glide.at(msAt(glide, 104, 2_000))?.lying).toBe(true);
    expect(glide.at(msAt(glide, 400, 2_000))?.lying).toBe(true);
  });

  it('zmizelé zvíře (gone) a zvíře v lese se nekreslí', () => {
    const glide = new QuarryGlide();
    glide.push(hunt({ tick: 100, quarry: quarry({ state: 'escape' }) }), 1_000);
    glide.push(hunt({ tick: 104, quarry: null, outcome: 'escaped' }), 2_000);
    expect(glide.at(msAt(glide, 102, 2_000))).not.toBeNull();
    expect(glide.at(msAt(glide, 104, 2_000))).toBeNull();
    const hidden = new QuarryGlide();
    hidden.push(hunt({ quarry: null }), 1_000);
    expect(hidden.at(5_000)).toBeNull();
  });

  it('bachyně je model kance v měřítku 0,85', () => {
    const glide = new QuarryGlide();
    glide.push(hunt({ quarry: quarry({ kind: 'sow' }) }), 1_000);
    expect(glide.at(1_000)).toMatchObject({ model: 'wild-boar', scale: 0.85 });
  });

  it('nový zásah zvýší rány až v taktu zásahu', () => {
    const glide = new QuarryGlide();
    glide.push(hunt({ tick: 100 }), 1_000);
    glide.push(hunt({ tick: 104, quarry: quarry({ hits: 1 }) }), 2_000);
    expect(glide.hitsAt(msAt(glide, 103, 2_000))).toBe(0);
    expect(glide.hitsAt(msAt(glide, 104, 2_000))).toBe(1);
  });

  it('jiný lov začne přehrávat znovu', () => {
    const glide = new QuarryGlide();
    glide.push(hunt({ tick: 100 }), 1_000);
    glide.push(
      hunt({ tick: 900, beaters: beatersPlan(FROM, DOOR, 800), quarry: quarry({ kind: 'wolf' }) }),
      2_000,
    );
    expect(glide.at(2_000)?.model).toBe('wild-wolf');
    expect(glide.hunt?.beaters.startTick).toBe(800);
  });
});

describe('beaterFigures – honci podle taktu', () => {
  it('cestou k lesu stojí tam, kde je má `beatersAt`, a nic nenesou', () => {
    const h = hunt();
    const figures = beaterFigures(h, 20);
    expect(figures).toHaveLength(HUNT.beaters.men);
    figures.forEach((f, i) => {
      const at = beatersAt(h.beaters, 20, i)!;
      expect(f.pos.x).toBeCloseTo(at.pos.x, 9);
      expect(f.pos.z).toBeCloseTo(at.pos.z, 9);
      expect(f.carrying).toBe(false);
      // jdou k lesu (na sever)
      expect(Math.abs(f.yaw)).toBeLessThan(1e-6);
      expect(f.speed).toBeGreaterThan(0);
    });
  });

  it('u lesa stojí čelem k lesu', () => {
    const h = hunt();
    const figures = beaterFigures(h, h.beaters.arriveTick + 10);
    expect(figures.every((f) => f.speed === 0 && Math.abs(f.yaw) < 1e-6)).toBe(true);
  });

  it('před vyhlášením a po návratu nikdo; kdo je doma dřív, chybí', () => {
    const h = hunt({ beaters: beatersPlan(FROM, DOOR, 50) });
    expect(beaterFigures(h, 49)).toHaveLength(0);
    endBeaters(h.beaters, h.beaters.arriveTick + 20, { x: 0, z: 150 }, true);
    const home = h.beaters.homeTick!;
    expect(beaterFigures(h, home)).toHaveLength(0);
    // nosiči jdou pomaleji – ostatní jsou doma dřív (beatersAt null i před homeTick)
    const late = beaterFigures(h, home - 2);
    expect(late).toHaveLength(2);
    expect(late.every((f) => f.carrying)).toBe(true);
  });

  it('při odnosu nesou úlovek honci 0 a 1', () => {
    const h = hunt();
    const end = h.beaters.arriveTick + 20;
    const at = { x: 0, z: 150 };
    endBeaters(h.beaters, end, at, true);
    // nosiči došli k zvířeti a nesou ho domů
    const tick = end + 200;
    const figures = beaterFigures(h, tick);
    const carriers = figures.filter((f) => f.carrying);
    expect(carriers).toHaveLength(2);
    expect(carriers[0]!.pos).toEqual(beatersAt(h.beaters, tick, 0)!.pos);
    expect(carriers[1]!.pos).toEqual(beatersAt(h.beaters, tick, 1)!.pos);
    // jdou ke dvorci (na jih)
    expect(Math.abs(Math.abs(carriers[0]!.yaw) - Math.PI)).toBeLessThan(1e-6);
  });
});

describe('psi lovu', () => {
  it('jdou za honci, nejvýš jako u dvorce', () => {
    const h = hunt({ dogs: 20 });
    const dogs = huntDogFigures(h, 20);
    expect(dogs).toHaveLength(HUNT_DOGS_MAX);
    const lead = beaterFigures(h, 20)[0]!;
    // za honcem (blíž ke dvorci)
    expect(dogs[0]!.pos.z).toBeLessThan(lead.pos.z);
    expect(huntDogFigures(hunt({ dogs: 0 }), 20)).toHaveLength(0);
    expect(huntDogFigures(h, -5)).toHaveLength(0);
  });

  it('psi s honci u dvorce chybí', () => {
    const village = { wildlife: { dogs: 5 } } as unknown as SceneVillage;
    expect(withoutHuntDogs(village, 3).wildlife?.dogs).toBe(2);
    expect(withoutHuntDogs(village, 9).wildlife?.dogs).toBe(0);
    expect(withoutHuntDogs(village, 0)).toBe(village);
  });
});

describe('poleBetween – tyč mezi nosiči', () => {
  it('střed, směr a délka', () => {
    const pole = poleBetween({ x: 1, z: 2 }, { x: 4, z: 6 });
    expect(pole.mid).toEqual({ x: 2.5, z: 4 });
    expect(pole.lengthM).toBeCloseTo(5, 9);
    expect(pole.yaw).toBeCloseTo(Math.atan2(3, 4), 9);
  });
});

describe('sceneHuntOf – lov vsi scény', () => {
  function view(villageId: string, huntView: HuntView | null, tick = 120): ExpeditionView {
    return {
      journeyId: `j-${villageId}`,
      villageId,
      tick,
      day: 0,
      home: { x: 0, y: 0 },
      homePos: { x: 0, z: 0 },
      parties: [],
      seen: {},
      hunt: huntView,
    };
  }

  it('vezme lov jen z výpravy vsi scény', () => {
    const views = [
      view('v1', huntView({ dogs: 1 })),
      view('v2', huntView({ dogs: 4 })),
      view('v3', null),
    ];
    expect(sceneHuntOf(views, 'v2')).toMatchObject({ journeyId: 'j-v2', dogs: 4 });
    expect(sceneHuntOf(views, 'v1')?.journeyId).toBe('j-v1');
    expect(sceneHuntOf(views, 'v3')).toBeNull();
    expect(sceneHuntOf(views, 'v4')).toBeNull();
    expect(sceneHuntOf(views, null)).toBeNull();
  });

  it('po konci souboje platí pohled k taktu výpravy (honci jdou dál)', () => {
    const ended = huntView({ tick: 100, outcome: 'killed' });
    expect(sceneHuntOf([view('v1', ended, 180)], 'v1')?.tick).toBe(180);
    expect(sceneHuntOf([view('v1', ended, 100)], 'v1')?.tick).toBe(100);
  });
});
