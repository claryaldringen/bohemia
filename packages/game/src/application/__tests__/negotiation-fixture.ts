import type { NewVillageEvent } from '../../domain/village';
import type { NegotiateDeps } from '../negotiate';
import type { TermItem } from '../../domain/negotiation';
import { openNegotiation } from '../negotiate';
import type { VillageRecord } from '../villages';
import type { DirectoryEntry } from '../world-directory';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryNegotiations } from './in-memory-negotiations';
import { InMemoryNotices } from './in-memory-notices';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryWars } from './in-memory-wars';

export const NOW = new Date('2026-11-05T12:00:00Z');
export const DAY_MS = 86_400_000;
export const NAMES: Record<string, string> = { a: 'Bořivoj', b: 'Ctibor', c: 'Dalibor' };

export async function setup(): Promise<{
  deps: NegotiateDeps;
  houses: InMemoryHouses;
  vassalages: InMemoryVassalages;
  notices: InMemoryNotices;
  negotiations: InMemoryNegotiations;
  wars: InMemoryWars;
  posts: NewVillageEvent[];
  ids: Record<string, string>;
}> {
  const houses = new InMemoryHouses();
  const vassalages = new InMemoryVassalages();
  const notices = new InMemoryNotices();
  const wars = new InMemoryWars();
  const negotiations = new InMemoryNegotiations(
    vassalages,
    notices,
    () => NOW,
    undefined,
    undefined,
    wars,
  );
  const posts: NewVillageEvent[] = [];
  const refs = new Set<string>();
  const ids: Record<string, string> = {};
  for (const key of Object.keys(NAMES)) {
    const house = await houses.create({
      playerId: `player-${key}`,
      kind: 'player',
      createdAt: NOW,
    });
    await houses.setLord(house.id, { villageId: `village-${key}`, personId: 1 });
    ids[key] = house.id;
  }
  const villages: NegotiateDeps['villages'] = {
    find: (villageId) =>
      Promise.resolve({
        id: villageId,
        state: { people: [{ id: 1, name: NAMES[villageId.slice(-1)] }] },
      } as unknown as VillageRecord),
    inbox: {
      post: (event) => {
        if (refs.has(event.ref)) return Promise.resolve(null);
        refs.add(event.ref);
        posts.push(event);
        return Promise.resolve(null);
      },
      pending: () => Promise.resolve([]),
      pruneUsed: () => Promise.resolve(0),
      settledMail: () => Promise.resolve([]),
      dropSettledMail: () => Promise.resolve(0),
      strandedResults: () => Promise.resolve([]),
      dropStranded: () => Promise.resolve(0),
    },
  };
  // adresář rodů: rod `x` vlastní ves `village-x` (cílová ves z podmínek musí patřit pánovi)
  const worldDirectory: NegotiateDeps['worldDirectory'] = {
    entriesOf: async (houseIds) => {
      const out = [];
      for (const id of houseIds) {
        const house = await houses.byId(id);
        const key = house?.lord?.villageId.slice(-1);
        if (house && key) {
          out.push({
            house,
            seat: { x: 0, y: 0 },
            digests: [{ id: `village-${key}` }],
          } as unknown as DirectoryEntry);
        }
      }
      return out;
    },
  };
  return {
    deps: { houses, negotiations, villages, worldDirectory },
    houses,
    vassalages,
    notices,
    negotiations,
    wars,
    posts,
    ids,
  };
}

export type Setup = Awaited<ReturnType<typeof setup>>;

export const oath = (lord: string, vassal: string): TermItem[] => [{ kind: 'oath', lord, vassal }];

export async function open(
  s: Setup,
  from = 'a',
  to = 'b',
  lordKey = 'a',
  at = NOW,
): Promise<string> {
  const vassalKey = lordKey === from ? to : from;
  const r = await openNegotiation(s.deps, {
    playerId: `player-${from}`,
    to: s.ids[to]!,
    items: oath(s.ids[lordKey]!, s.ids[vassalKey]!),
    message: null,
    now: at,
    today: 10,
  });
  if (!r.ok) throw new Error(r.reason);
  return r.negotiation.id;
}
