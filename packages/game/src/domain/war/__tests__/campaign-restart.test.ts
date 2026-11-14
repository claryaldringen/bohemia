import { describe, expect, it } from 'vitest';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import type { VillageState } from '../../village/types';
import { stepCampaign } from '../campaign';
import type {
  CampaignIntent,
  CampaignMap,
  CampaignState,
  CampaignWorld,
  IntentBody,
} from '../campaign-types';
import {
  campaign,
  flat,
  intent,
  LAUNCH,
  LIVE,
  SET_OUT,
  SUMMER,
  world,
  worldOf,
} from './campaign-fixtures';

// Začít znovu během nájezdu (war.md; Martin 14. 11. 2026: „pokud to udělá hráč – agresor, tak tím
// jeho nájezd samozřejmě končí“): restart vůdce zapíše do tažení obrat domů se značkou `restart` –
// platí jako rozkaz „Domů“, i když vede jiný muž (NPC) nebo vojsko ještě stojí ve shromaždišti; na
// zpáteční cestě nic nedělá.

const END = LAUNCH + 900;
const HOME: IntentBody = { kind: 'turn-back' };
const RESTART: IntentBody = { kind: 'turn-back', restart: true };

describe('Začít znovu během nájezdu – obrat vojska', () => {
  it('na pochodu jako rozkaz „Domů“ – stav, události i upozornění stejné', () => {
    const at = LAUNCH + 40;
    const restart = stepCampaign(campaign(), END, [...LIVE, intent(at, 2, RESTART)], worldOf());
    const home = stepCampaign(campaign(), END, [...LIVE, intent(at, 2, HOME)], worldOf());
    expect(restart.state.phase).toBe('done');
    expect(restart.state.returnReason).toBe('order');
    expect(restart).toEqual(home);
  });

  it('vede jiný muž (NPC) – „Domů“ hráče se zahodí, Začít znovu vojsko obrátí', () => {
    const npc = campaign({ liveCommand: false });
    const at = LAUNCH + 40;
    const home = stepCampaign(npc, at, [...SET_OUT, intent(at, 2, HOME)], worldOf());
    expect(home.state.phase).toBe('marching');
    const turned = stepCampaign(npc, at, [...SET_OUT, intent(at, 2, RESTART)], worldOf());
    expect(turned.state.phase).toBe('returning');
    expect(turned.state.returnReason).toBe('order');
    const end = stepCampaign(npc, END, [...SET_OUT, intent(at, 2, RESTART)], worldOf());
    expect(end.state.phase).toBe('done');
  });

  it('ve shromaždišti (před vyražením) – muži jdou domů, pozdější vyražení se zahodí', () => {
    const home = stepCampaign(campaign(), LAUNCH + 1, [intent(LAUNCH + 1, 1, HOME)], worldOf());
    expect(home.state.phase).toBe('assembling');
    const intents = [intent(LAUNCH + 1, 1, RESTART), intent(LAUNCH + 2, 2, { kind: 'set-out' })];
    const step = stepCampaign(campaign(), END, intents, worldOf());
    expect(step.waiting).toBeNull();
    expect(step.state.phase).toBe('done');
    expect(step.state.returnReason).toBe('order');
    const back = step.villageEvents.filter((e) => e.body.kind === 'campaign-return');
    expect(back.map((e) => e.villageId).sort()).toEqual(['brod', 'lhota']);
    expect(chronicleSteps(step.villageEvents)).not.toContain('set-out');
  });

  it('na zpáteční cestě nic nedělá – druhé Začít znovu výsledek nezmění', () => {
    const npc = campaign({ liveCommand: false });
    const at = LAUNCH + 40;
    const once = [...SET_OUT, intent(at, 2, RESTART)];
    expect(stepCampaign(npc, at + 10, once, worldOf()).state.phase).toBe('returning');
    const twice = [...once, intent(at, 3, RESTART), intent(at + 10, 1, RESTART)];
    expect(stepCampaign(npc, END, twice, worldOf())).toEqual(
      stepCampaign(npc, END, once, worldOf()),
    );
  });

  describe('v boji na mapě cíle', () => {
    const TARGET: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['knezice'] };
    const OPEN: CampaignMap = { landscape: flat(), obstacles: null, villageIds: [] };
    /** Kněžice s domem u cíle a třemi muži, kteří se brání. */
    function knezice(): VillageState {
      const people = [
        kin({ id: 1, age: 30, sex: 'male', spouse: 2 }, SUMMER),
        kin({ id: 2, age: 28, sex: 'female', spouse: 1 }, SUMMER),
        kin({ id: 3, age: 25, sex: 'male' }, SUMMER),
        kin({ id: 4, age: 35, sex: 'male' }, SUMMER),
      ];
      const v = village(people, undefined, {
        lastDay: SUMMER,
        storesKg: 1000,
        defense: { stance: 'defend' },
      });
      v.dwellings[0]!.position = { x: -860, z: 30, rotation: 0 };
      return v;
    }
    const TARGET_STATE = knezice();
    const raidWorld: CampaignWorld = {
      clock: world,
      landscapeOf: (cell) => (cell.x === 1 && cell.y === 0 ? TARGET : OPEN),
      villageAt: (id) => (id === 'knezice' ? TARGET_STATE : null),
    };
    const RAID_END = LAUNCH + 4000;

    /** Stav v prvním taktu, kdy na mapě cíle běží boj. */
    function inBattle(start: CampaignState, intents: readonly CampaignIntent[]): CampaignState {
      let s = start;
      while (!(s.phase === 'raiding' && s.battle?.outcome === 'ongoing')) {
        if (s.phase === 'done' || s.tick > RAID_END) throw new Error('boj nezačal');
        s = stepCampaign(s, s.tick + 1, intents, raidWorld).state;
      }
      return s;
    }

    it.each([
      ['živé vedení – jako „Domů“', true],
      ['vede NPC – „Domů“ hráče by se zahodil', false],
    ])('%s: útočníci opustí bojiště a vrátí se', (_name, liveCommand) => {
      const intents = liveCommand ? LIVE : SET_OUT;
      const fighting = inBattle(campaign({ liveCommand }), intents);
      const at = fighting.tick + 1;
      const restart = stepCampaign(fighting, at, [...intents, intent(at, 9, RESTART)], raidWorld);
      expect(restart.state.phase).toBe('returning');
      expect(restart.state.battle?.outcome).toBe('withdrawn');
      const home = stepCampaign(fighting, at, [...intents, intent(at, 9, HOME)], raidWorld);
      if (liveCommand) expect(restart).toEqual(home);
      else expect(home.state.phase).toBe('raiding');
      const end = stepCampaign(fighting, RAID_END, [...intents, intent(at, 9, RESTART)], raidWorld);
      expect(end.waiting).toBeNull();
      expect(end.state.phase).toBe('done');
    });
  });
});

/** Kroky tažení zapsané do kronik vsí (vyrazilo, vrátilo se, rozpadlo se). */
function chronicleSteps(events: ReturnType<typeof stepCampaign>['villageEvents']): string[] {
  return events.flatMap((e) =>
    e.body.kind === 'chronicle' && e.body.event.kind === 'campaign' ? [e.body.event.step] : [],
  );
}
