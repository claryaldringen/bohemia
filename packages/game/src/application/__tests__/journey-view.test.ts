import { describe, expect, it, vi } from 'vitest';
import { OFFICIAL_WORLD } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { horse, horseVillage } from '../../domain/village/__tests__/horse-fixtures';
import type { Dwelling } from '../../domain/village/types';
import { type CampaignMap, type JourneyState } from '../../domain/war';
import { land } from '../../domain/war/__tests__/battle-fixtures';
import { musterExpedition, type ExpeditionDeps } from '../expedition';
import { expeditionVisitorsOn, type VisitorsDeps } from '../journey-view';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryJourneys } from './in-memory-journeys';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Rozkazy a pohled na výjezd (lord-control.md – Rozkazy, Na místě a návrat, Soused; plán
// 2026-11-13 – Úloha 5).

const DAY_MS = 86_400_000;
const NOW = new Date(OFFICIAL_WORLD.startMs + 400 * DAY_MS);
const MAP: CampaignMap = { landscape: land(), obstacles: null, villageIds: [] };
function ownVillage(): ReturnType<typeof horseVillage> {
  const s = horseVillage([{ ...horse(1, 6), riderId: 12 }], 1, 4);
  for (const p of s.people) if (p.id === 10 || p.id === 12) p.line = true;
  s.people.find((p) => p.id === 10)!.name = 'Bořivoj';
  s.people.find((p) => p.id === 12)!.name = 'Radim';
  s.dynasty = { lordId: 10, lords: [] };
  return s;
}

async function setup(map: CampaignMap = MAP): Promise<{
  deps: VisitorsDeps & ExpeditionDeps;
  journeys: InMemoryJourneys;
  war: { value: boolean; asked: unknown[] };
  homeId: string;
  hostId: string;
  id: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const houses = new InMemoryHouses();
  const houseA = await houses.create({ playerId: 'pa', kind: 'player', createdAt: NOW });
  await houses.create({ playerId: 'pb', kind: 'player', createdAt: NOW });
  const sa = await settlements.seatAtOrigin({
    ownerId: 'pa',
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const sb = (await settlements.create({
    ownerId: 'pb',
    landscapeSeed: 2,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 1, y: 0 },
  }))!;
  const home = await villages.add(sa.id, 'Lhota', ownVillage());
  // hlavou rodu (jeho jménem se rod jmenuje) je Radim, na výjezdu jede vojvoda Bořivoj
  await houses.setLord(houseA.id, { villageId: home.id, personId: 12 });
  const hostState = ownVillage();
  hostState.people.find((p) => p.id === 10)!.name = 'Mojmír';
  // jediný dům hostitele ve středu mapy
  hostState.dwellings = [
    { ...hostState.dwellings[0]!, position: { x: 0, z: 0, rotation: 0 } } as Dwelling,
  ];
  const host = await villages.add(sb.id, 'Kněžice', hostState);
  const journeys = new InMemoryJourneys();
  const war = { value: false, asked: [] as unknown[] };
  const deps: VisitorsDeps & ExpeditionDeps = {
    houses,
    villages,
    settlements,
    campaigns: new InMemoryCampaigns(),
    journeys,
    cells: { mapOf: () => Promise.resolve(map) },
    world: OFFICIAL_WORLD,
    seeds: { nextSeed: () => 77 },
    newId: () => 'jny-1',
    atWar: (playerId, cell) => {
      war.asked.push([playerId, cell]);
      return Promise.resolve(war.value);
    },
  };
  const launched = await musterExpedition(deps, {
    playerId: 'pa',
    villageId: home.id,
    people: [10, 12],
    command: { kind: 'order', order: { kind: 'go', pos: { x: 100, z: 100 } } },
    now: NOW,
  });
  if (!launched.ok) throw new Error(launched.reason);
  return { deps, journeys, war, homeId: home.id, hostId: host.id, id: launched.journeyId };
}

/** Přepíše uložený stav výjezdu. */
function patch(journeys: InMemoryJourneys, id: string, edit: (s: JourneyState) => void): void {
  const row = journeys.rows.get(id)!;
  const state = JSON.parse(row.state) as JourneyState;
  edit(state);
  row.state = JSON.stringify(state);
}

describe('expeditionVisitorsOn', () => {
  /** Dvě skupiny výpravy hráče `pa` na mapě hostitele: vojvoda u domu (x = 40), Radim daleko (x = 900). */
  async function twoParties(): Promise<Awaited<ReturnType<typeof setup>>> {
    const w = await setup();
    patch(w.journeys, w.id, (s) => {
      const first = s.groups[0]!;
      first.cell = { x: 1, y: 0 };
      first.pos = { x: 40, z: 0 };
      first.goal = { cell: { x: 1, y: 0 }, pos: { x: 50, z: 5 } };
      const far = structuredClone(first);
      far.id = 9;
      far.party = 9;
      far.pos = { x: 900, z: 0 };
      s.groups.push(far);
      s.parties.push({ id: 9, phase: 'out', arrivedTick: null });
      s.members.find((m) => m.ref.personId === 12)!.group = 9;
      s.members.find((m) => m.ref.personId === 12)!.horse = 'led';
      s.nextId = 10;
    });
    return w;
  }

  it('hostitel vidí jen skupinu, jejíž hlouček je v dohledu; bez cíle a osobních údajů', async () => {
    const w = await twoParties();
    const r = await expeditionVisitorsOn(w.deps, { playerId: 'pb', villageId: w.hostId });
    expect(r).toEqual([
      {
        journeyId: w.id,
        partyId: 0,
        own: false,
        villageId: null,
        leaderName: 'Bořivoj',
        houseName: 'Radim',
        tick: expect.any(Number),
        groups: [{ id: 0, pos: { x: 40, z: 0 }, goal: null }],
        people: [
          {
            // cizí id osob hostitel nezná
            personId: null,
            group: 0,
            lord: true,
            mounted: false,
            led: false,
            female: false,
            child: false,
          },
        ],
      },
    ]);
  });

  it('vlastní skupina je vidět vždy i s cílem; ve výsledku jen hloučky na této mapě', async () => {
    const w = await twoParties();
    patch(w.journeys, w.id, (s) => {
      // druhá skupina má hlouček na domovské mapě (daleko od domů) a druhý na mapě hostitele
      const far = s.groups.find((g) => g.id === 9)!;
      far.cell = { x: 0, y: 0 };
      far.goal = { cell: { x: 0, y: 0 }, pos: { x: 910, z: 5 } };
      s.groups.push({ ...structuredClone(s.groups[0]!), id: 11, party: 9 });
    });
    const mine = await expeditionVisitorsOn(w.deps, { playerId: 'pa', villageId: w.homeId });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ partyId: 9, own: true, villageId: w.homeId });
    expect(mine[0]!.groups).toEqual([{ id: 9, pos: { x: 900, z: 0 }, goal: { x: 910, z: 5 } }]);
    expect(mine[0]!.people.map((p) => [p.personId, p.led])).toEqual([[12, true]]);
  });

  it('cizí ves hráče a ves bez návštěvy – prázdno', async () => {
    const w = await twoParties();
    expect(await expeditionVisitorsOn(w.deps, { playerId: 'pa', villageId: w.hostId })).toEqual([]);
    expect(await expeditionVisitorsOn(w.deps, { playerId: 'pb', villageId: w.homeId })).toEqual([]);
    expect(await expeditionVisitorsOn(w.deps, { playerId: 'pb', villageId: 'nic' })).toEqual([]);
  });

  it('bez jezdců na mapě stav vsi vůbec nenačte', async () => {
    const w = await setup();
    // výprava hráče pa stojí na jeho mapě, hostitelova mapa je prázdná
    const find = vi.spyOn(w.deps.villages, 'find');
    expect(await expeditionVisitorsOn(w.deps, { playerId: 'pb', villageId: w.hostId })).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});
