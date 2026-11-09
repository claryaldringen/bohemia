import { describe, expect, it } from 'vitest';
import type { BattleField } from '../battle';
import type { Pos } from '../march-grid';
import { hoursPerTick } from '../ticks';
import { wallPosts } from '../wall-defense';
import {
  attacker,
  battle,
  defender,
  field,
  fighter,
  forestSouth,
  fortOf,
  run,
} from './battle-fixtures';

// Nájezd na ves s palisádou s ochozem (e2e `multiplayer-war.spec.ts` – „nájezd na ves s palisádou
// s ochozem“): 8 útočníků (jeden muž rodu se silou 2, ostatní vesničané se silou 1) 40 m od
// hradby, 2–4 obránci na hradbě, les poblíž. Výsledek boje závisí na seedu taktu (a ten na
// skutečném čase spuštění), proto se ověřuje pro mnoho seedů: žebříky a útočník uvnitř obvodu
// musí nastat vždy.
//
// E2e ale běží v pomalém světě (herní den ≈ 4,8 h): výroba žebříku (4 herní hodiny) tam trvá
// ≈ 11 500 taktů boje, takže souboj luků mužů rodu přes hradbu se rozhodne dřív (obránce prchne,
// boj skončí bez žebříku) nebo později podle losu taktu. E2e proto bojuje bez luků – tři vesničané
// na hradbě, vojsko jen vesničané – a ten scénář hlídá druhý blok pro pomalý svět.

/** Leží bod uvnitř mnohoúhelníku (paprsek +x)? */
function inside(p: Pos, poly: readonly (readonly [number, number])[]): boolean {
  let in_ = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > p.z !== zj > p.z && p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi) in_ = !in_;
  }
  return in_;
}

describe('nájezd na palisádu s ochozem – ladders a průnik pro mnoho seedů', () => {
  const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
  for (const men of [2, 3, 4]) {
    it(`${men} obránci na hradbě: žebříky a útočník uvnitř při každém seedu`, () => {
      const fails: string[] = [];
      for (const seed of seeds) {
        const f = field([fortOf('walkway')], forestSouth);
        const ring = f.forts[0]!.shapes.map((s) => [s.mid[0], s.mid[1]] as [number, number]);
        const b = battle({
          attackers: [
            attacker(0, { x: -3, z: -70 }, { strength: 1 }),
            attacker(1, { x: -1, z: -70 }, { strength: 2, line: true }),
            ...[2, 3, 4, 5, 6, 7].map((i) => attacker(i, { x: i - 4, z: -72 }, { strength: 1 })),
          ],
          defenders: wallPosts(f.forts, men).map((p, i) =>
            defender(i + 1, p, { post: p, onWall: true, strength: 0.4 }),
          ),
          commander: 0,
        });
        let sawInside = false;
        run(
          b,
          f,
          4000,
          () => {
            if (b.fighters.some((x) => x.side === 'attack' && inside(x.pos, ring)))
              sawInside = true;
          },
          seed,
        );
        const hasPost = b.fighters.some((x) => x.side === 'defend' && x.post !== undefined);
        if (!(hasPost && (b.ladders?.length ?? 0) > 0 && sawInside && b.outcome === 'attackers')) {
          fails.push(
            `seed ${seed}: ${b.outcome} ladders=${b.ladders?.length ?? 0} inside=${sawInside}`,
          );
        }
        expect(fighter(b, 'a:0')).toBeDefined();
      }
      expect(fails).toEqual([]);
    });
  }
});

describe('nájezd na palisádu s ochozem v pomalém světě e2e – bez luků žebříky vždy', () => {
  // svět e2e (`playwright.config.ts` – WORLD_START 2000, WORLD_END 2200)
  const slow = hoursPerTick({
    startMs: Date.parse('2000-01-01T00:00:00+01:00'),
    endMs: Date.parse('2200-01-01T00:00:00+01:00'),
  });
  it('8 vesničanů proti 3 vesničanům na hradbě: žebříky a útočník uvnitř při každém seedu', () => {
    const fails: string[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const f: BattleField = { ...field([fortOf('walkway')], forestSouth), hoursPerTick: slow };
      const ring = f.forts[0]!.shapes.map((s) => [s.mid[0], s.mid[1]] as [number, number]);
      const b = battle({
        attackers: [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
          attacker(i, { x: i - 4, z: i < 2 ? -70 : -72 }, { strength: 1 }),
        ),
        defenders: wallPosts(f.forts, 3).map((p, i) =>
          defender(i + 1, p, { post: p, onWall: true }),
        ),
        commander: 0,
      });
      let sawInside = false;
      run(
        b,
        f,
        20_000,
        () => {
          if (b.fighters.some((x) => x.side === 'attack' && inside(x.pos, ring))) sawInside = true;
        },
        seed,
      );
      if (!((b.ladders?.length ?? 0) > 0 && sawInside && b.outcome === 'attackers')) {
        fails.push(
          `seed ${seed}: ${b.outcome} ladders=${b.ladders?.length ?? 0} inside=${sawInside}`,
        );
      }
    }
    expect(fails).toEqual([]);
  });
});
