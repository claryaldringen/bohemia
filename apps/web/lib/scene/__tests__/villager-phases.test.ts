import { describe, expect, it } from 'vitest';
import { personActivity, PHASE_TEXTS } from '../../person-activity';
import type { SceneVillage } from '../../village-view';
import { createVillagerPose, REST_CLIPS, stand, type VillagerClip } from '../villager-motion';
import {
  activityPhases,
  phaseAt,
  phaseWalking,
  PHASE_STEPS,
  type ActivityPhase,
  type PhaseName,
  type PhasePlaces,
  type PhaseRole,
} from '../villager-phases';
import { activityPose, type Activity, type PersonTask } from '../villager-schedule';
import { scheduledState } from '../villager-timetable';
import type { PersonJob } from '../villager-roster';

// Fáze činností z existujících klipů (villagers.md – Fáze činností, úloha 8): každá role má
// posloupnost od vyjití po návrat, fáze mapují na stávající klipy, panel řekne fázi.

const DOOR = { x: -20, z: 0 };
const SITE = { x: 0, z: 0 };
const NEAR: PhasePlaces = {
  drop: { x: 10, z: 0 },
  aid: { x: 0, z: 12 },
  shrine: { x: -8, z: 6 },
  haul: { x: 6, z: 3 },
  pit: { x: -5, z: -6 },
  wall: { x: 4, z: -7 },
};

const JOBS: Record<PhaseRole, PersonJob> = {
  reap: { kind: 'share', activity: 'harvest', target: { kind: 'field', id: 1 } },
  meadow: { kind: 'share', activity: 'mow', target: { kind: 'meadow', cells: [] } },
  'load-sheaves': { kind: 'share', activity: 'haul', target: { kind: 'field', id: 1 } },
  'load-hay': { kind: 'share', activity: 'haul', target: { kind: 'meadow', cells: [] } },
  smelt: { kind: 'share', activity: 'craft', target: { kind: 'dwelling', id: 3 } },
  refine: { kind: 'share', activity: 'craft', target: { kind: 'dwelling', id: 3 } },
  forge: { kind: 'share', activity: 'craft', target: { kind: 'dwelling', id: 3 } },
  'kiln-wood': { kind: 'share', activity: 'craft', target: { kind: 'kiln', id: 4, x: 0, z: 0 } },
  'kiln-build': { kind: 'share', activity: 'craft', target: { kind: 'kiln', id: 4, x: 0, z: 0 } },
  'kiln-burn': { kind: 'share', activity: 'craft', target: { kind: 'kiln', id: 4, x: 0, z: 0 } },
  'kiln-draw': { kind: 'share', activity: 'craft', target: { kind: 'kiln', id: 4, x: 0, z: 0 } },
  pottery: { kind: 'share', activity: 'craft', target: { kind: 'dwelling', id: 5 } },
  cart: { kind: 'share', activity: 'craft', target: { kind: 'dwelling', id: 6 } },
  fish: { kind: 'share', activity: 'fish', target: { kind: 'pool', index: 0 } },
  train: { kind: 'lord', household: false },
  elder: { kind: 'elder' },
  'elder-home': { kind: 'elder' },
  priest: { kind: 'priest', church: 9 },
  'master-site': { kind: 'master', craft: 'builder', church: 9, work: 'site' },
  'master-sand': { kind: 'master', craft: 'builder', church: 9, work: 'sand' },
  'master-kiln': { kind: 'master', craft: 'limeBurner', church: 9, work: 'kiln' },
  'master-lime': { kind: 'master', craft: 'limeBurner', church: 9, work: 'kiln' },
  'master-quarry': { kind: 'master', craft: 'stonemason', church: 9, work: 'quarry' },
  'master-dress': { kind: 'master', craft: 'stonemason', church: 9, work: 'dress' },
  'master-walls': { kind: 'master', craft: 'mason', church: 9, work: 'walls' },
  'master-decor': { kind: 'master', craft: 'plasterer', church: 9, work: 'decor' },
  'master-home': { kind: 'master', craft: 'mason', church: null, work: 'home' },
  idle: { kind: 'share', activity: 'idle', target: { kind: 'village' } },
};

/** Klip úlohy dne (póza úlohy) podle role. */
const TASK_CLIP: Partial<Record<PhaseRole, VillagerClip>> = { reap: 'reap', fish: 'fish' };

function task(role: PhaseRole, places = NEAR): PersonTask {
  return {
    key: `t:${role}`,
    job: JOBS[role],
    kind: 'bout',
    range: 'long',
    pose: stand(SITE.x, SITE.z, 0, 1, TASK_CLIP[role] ?? 'build'),
    errand: null,
    at: SITE,
    role,
    places,
  };
}

/** Práce na místě: 20 s ode dveří, 300 s práce, 20 s domů. */
function bout(role: PhaseRole, places = NEAR, start = 3000): Activity {
  return {
    person: 7,
    kind: 'bout',
    task: task(role, places),
    start,
    arrive: start + 20,
    leave: start + 320,
    end: start + 340,
  };
}

const ROLES = Object.keys(PHASE_STEPS) as PhaseRole[];

describe('fáze rolí z existujících klipů (villager-phases.ts)', () => {
  it('každá role: cesta ode dveří, fáze role v místě, návrat; fáze navazují', () => {
    for (const role of ROLES) {
      const a = bout(role);
      const phases = activityPhases(a, 11);
      expect(phases[0]!.name, role).toBe('out');
      expect(['back', 'bring-catch'], role).toContain(phases.at(-1)!.name);
      expect(phases[0]!.from).toBe(a.start);
      expect(phases.at(-1)!.to).toBe(a.end);
      for (let k = 1; k < phases.length; k++) expect(phases[k]!.from).toBe(phases[k - 1]!.to);
      // každý krok role se v posloupnosti objeví (blízká místa jinde)
      const names = new Set(phases.map((p) => p.name));
      for (const step of PHASE_STEPS[role])
        expect(names.has(step.name), `${role}:${step.name}`).toBe(true);
    }
  });

  it('fáze mají klipy s rekvizitami – vázání s povříslem, kování tempem, tavba po praní rudy', () => {
    const named = (role: PhaseRole): ActivityPhase[] => activityPhases(bout(role), 11);
    const clipOf = (role: PhaseRole, name: PhaseName): VillagerClip | undefined =>
      named(role).find((p) => p.name === name)?.clip;
    expect(clipOf('reap', 'bind')).toBe('bind');
    expect(clipOf('meadow', 'rake-hay')).toBe('rake');
    expect(clipOf('meadow', 'heap-hay')).toBe('pitch');
    expect(clipOf('load-sheaves', 'load-sheaves')).toBe('pitch');
    expect(clipOf('load-hay', 'load-hay')).toBe('pitch');
    expect(clipOf('smelt', 'wash-ore')).toBe('sieve');
    expect(clipOf('smelt', 'roast-ore')).toBe('winnow');
    expect(named('smelt').map((p) => p.name)).toEqual([
      'out',
      'wash-ore',
      'roast-ore',
      'smelt',
      'back',
    ]);
    // překování těžší a pomalejší než kování nástrojů – týž klip (kladivo a kleště), jiné tempo
    const refine = named('refine').find((p) => p.name === 'refine')!;
    const forge = named('forge').find((p) => p.name === 'forge')!;
    expect([refine.clip, forge.clip]).toEqual(['forge', 'forge']);
    expect(refine.pace!).toBeLessThan(forge.pace!);
    expect(clipOf('kiln-wood', 'split-wood')).toBe('split');
    expect(clipOf('kiln-burn', 'tend-kiln')).toBe('idle');
    expect(clipOf('kiln-burn', 'cover-kiln')).toBe('hoe');
    expect(clipOf('kiln-draw', 'draw-coal')).toBe('rake');
    expect(clipOf('pottery', 'dry-pots')).toBe('pots');
    expect(clipOf('pottery', 'fire-pots')).toBe('pots');
    expect(clipOf('fish', 'bring-catch')).toBe('carry-fish');
    expect(clipOf('train', 'help-reap')).toBe('reap');
    expect(clipOf('elder', 'glean')).toBe('weed');
  });

  it('tesař u rozdělaného vozu: otesává díly sekerou na špalku, staví vůz pózou úlohy (úloha 11)', () => {
    const phases = activityPhases(bout('cart'), 11);
    expect(phases.map((p) => p.name)).toEqual(['out', 'hew-cart', 'build-cart', 'back']);
    expect(phases.find((p) => p.name === 'hew-cart')!.clip).toBe('split');
    // stavba vozu – póza úlohy u korby (klip `build` s paličkou – carpenterCartSpots)
    expect(phases.find((p) => p.name === 'build-cart')!.clip).toBeUndefined();
    expect(PHASE_TEXTS['hew-cart']).toBe('otesává díly vozu');
    expect(PHASE_TEXTS['build-cart']).toBe('staví vůz');
  });

  it('starší doma: sedí (póza úlohy), postojí variantou stání, jdou se pomodlit k modle (úloha 10)', () => {
    const sitting = {
      ...bout('elder-home'),
      task: { ...task('elder-home'), pose: stand(0, 0, 0, 1, 'sit') },
    };
    const phases = activityPhases(sitting, 11);
    expect(phases.map((p) => p.name)).toEqual([
      'out',
      'work',
      'rest',
      'to-shrine',
      'pray',
      'from-shrine',
      'work',
      'back',
    ]);
    const rest = phases.find((p) => p.name === 'rest')!;
    expect(REST_CLIPS).toContain(rest.clip);
    const pray = phases.find((p) => p.name === 'pray')!;
    expect(pray.clip).toBe('pray');
    expect(pray.at).toEqual(NEAR.shrine);
    // modlí se čelem k modle (směr cesty od místa úlohy) a sedí pózou úlohy
    const pose = activityPose(sitting, DOOR, undefined, phases);
    const o = pose((pray.from + pray.to) / 2, [], createVillagerPose());
    expect([o.clip, o.x, o.z]).toEqual(['pray', NEAR.shrine!.x, NEAR.shrine!.z]);
    expect(o.headingX).toBeLessThan(0);
    const work = phases.find((p) => p.name === 'work')!;
    expect(pose(work.from + 1, [], createVillagerPose()).clip).toBe('sit');
    // varianta stání se losuje podle člověka – různí lidé stojí různě
    const variants = new Set(
      Array.from(
        { length: 40 },
        (_, k) =>
          activityPhases({ ...sitting, person: k }, 11).find((p) => p.name === 'rest')?.clip,
      ),
    );
    expect(variants.size).toBeGreaterThan(2);
    // bez modly ve vsi se nemodlí
    const noShrine: PhasePlaces = { drop: NEAR.drop!, aid: NEAR.aid! };
    expect(activityPhases(bout('elder-home', noShrine), 11).map((p) => p.name)).not.toContain(
      'pray',
    );
  });

  it('k práci s motykou či sekerou jde s nářadím na rameni (walk-hoe, walk-axe)', () => {
    const a: Activity = {
      ...bout('reap'),
      task: { ...task('reap'), role: undefined, pose: stand(0, 0, 0, 1, 'hoe') },
    };
    const pose = activityPose(a, DOOR, undefined, activityPhases(a, 11));
    expect(pose(a.start + 10, [], createVillagerPose()).clip).toBe('walk-hoe');
    expect(pose(a.leave + 10, [], createVillagerPose()).clip).toBe('walk-hoe');
    const fell: Activity = { ...a, task: { ...a.task!, pose: stand(0, 0, 0, 1, 'fell') } };
    expect(
      activityPose(
        fell,
        DOOR,
        undefined,
        activityPhases(fell, 11),
      )(a.start + 10, [], createVillagerPose()).clip,
    ).toBe('walk-axe');
  });

  it('odnos do domácností: s nůší nástrojů k cizímu domu a zpět k dílně, pak domů', () => {
    const a = bout('forge');
    const phases = activityPhases(a, 11);
    const names = phases.map((p) => p.name);
    expect(names).toEqual(['out', 'forge', 'deliver-tools', 'deliver-tools', 'return', 'back']);
    const go = phases[2]!;
    expect(go.clip).toBe('carry-tools');
    expect(go.walk).toEqual({ from: SITE, to: NEAR.drop });
    expect(phaseWalking(go)).toBe(true);
    const pose = activityPose(a, DOOR, undefined, phases);
    const out = createVillagerPose();
    const mid = pose((go.from + go.to) / 2, [], out);
    expect([mid.clip, mid.x]).toEqual(['carry-tools', 5]);
    const at = phases[3]!;
    expect(pose((at.from + at.to) / 2, [], out)).toMatchObject({ x: 10, z: 0, clip: 'idle' });
    expect(pose(phases[4]!.to - 1e-6, [], out).x).toBeCloseTo(0, 3);
  });

  it('krok jinde se nevejde (daleko) – zůstane prací úlohy u místa', () => {
    const far = { drop: { x: 900, z: 0 }, aid: { x: 0, z: 900 } };
    for (const role of ['forge', 'pottery', 'train', 'elder', 'idle'] as const) {
      const phases = activityPhases(bout(role, far), 11);
      expect(
        phases.some((p) => p.walk),
        role,
      ).toBe(false);
      expect(
        phases.some((p) => p.at),
        role,
      ).toBe(false);
    }
    // bez místa jinde (dnes se nežne) – starší jen odpočívají u domu
    expect(activityPhases(bout('elder', {}), 11).map((p) => p.name)).toEqual([
      'out',
      'work',
      'back',
    ]);
  });

  it('fáze s klipem stojí, kde ji zastihla; práce úlohy pózou úlohy; fáze jen podle času', () => {
    const a = bout('reap');
    const phases = activityPhases(a, 11);
    const pose = activityPose(a, DOOR, undefined, phases);
    const out = createVillagerPose();
    for (const p of phases.filter((x) => x.name === 'bind' || x.name === 'work')) {
      const got = pose((p.from + p.to) / 2, [], out);
      expect(got.clip).toBe(p.name === 'bind' ? 'bind' : 'reap');
      expect([got.x, got.z]).toEqual([0, 0]);
    }
    // stejný začátek = stejné fáze; jiný začátek – jiný los podílů
    expect(activityPhases(bout('reap'), 11)).toEqual(phases);
    expect(activityPhases(bout('reap', NEAR, 6000), 11).map((p) => p.to - p.from)).not.toEqual(
      phases.map((p) => p.to - p.from),
    );
    expect(phaseAt(phases, a.start - 5).name).toBe('out');
  });

  it('přerušená činnost: fáze končí přerušením, součet = délka', () => {
    const a = { ...bout('pottery'), end: 3100, cut: { end: 3340, by: null } };
    const phases = activityPhases(a, 11);
    expect(phases.at(-1)!.to).toBe(3100);
    expect(phases.reduce((s, p) => s + p.to - p.from, 0)).toBeCloseTo(100, 6);
  });
});

describe('panel vybrané postavy řekne fázi (person-activity.ts)', () => {
  const VILLAGE = { dwellings: [], fields: [] } as unknown as SceneVillage;

  it('fáze s vlastní větou – váže snopy, pere rudu, nese úlovek domů; cesta a práce podle úlohy', () => {
    const say = (role: PhaseRole, name: PhaseName): string => {
      const a = bout(role);
      const phase = activityPhases(a, 11).find((p) => p.name === name)!;
      const s = scheduledState(a, (phase.from + phase.to) / 2, true, false, phase);
      return personActivity(
        { id: 7, job: s.job, stage: null, hidden: false, herd: null, leg: s.leg, phase: s.phase },
        VILLAGE,
      );
    };
    expect(say('reap', 'bind')).toBe('váže snopy');
    expect(say('reap', 'work')).toBe('žne');
    expect(say('reap', 'out')).toBe('jde na pole');
    expect(say('smelt', 'wash-ore')).toBe('pere rudu');
    expect(say('forge', 'deliver-tools')).toBe('nese nástroje do domácností');
    expect(say('kiln-burn', 'tend-kiln')).toBe('hlídá milíř');
    expect(say('pottery', 'deliver-pots')).toBe('nese nádoby do domácností');
    expect(say('fish', 'bring-catch')).toBe('nese úlovek domů');
    expect(say('fish', 'out')).toBe('jde k tůni');
    expect(say('train', 'help-reap')).toBe('pomáhá se žněmi');
    expect(say('elder', 'glean')).toBe('sbírá paběrky');
    // každá pojmenovaná fáze role má větu
    for (const role of ROLES) {
      for (const step of PHASE_STEPS[role]) {
        if (step.name !== 'work') expect(PHASE_TEXTS[step.name], step.name).toBeDefined();
      }
    }
  });
});
