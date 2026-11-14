import { expect, type Page } from '@playwright/test';
import type { JourneyState, Person, Pos } from '@bohemia/game';
import {
  changeVillageState,
  found,
  newPlayer,
  pollVillage,
  query,
  villageSpots,
  withBuiltFirstDwelling,
  type Seat,
} from './village-helpers';

// Společné kroky e2e výjezdu vojvody (journey.spec.ts, journey-worker.spec.ts): bod scény na
// obrazovce, háček scény výjezdu, ves s muži rodu, vyslání vojvody a skupina přesunutá v DB.

/** Bod krajiny na obrazovce (háček scény) – kam kliknout. */
export async function screenOf(
  page: Page,
  x: number,
  z: number,
): Promise<{ x: number; y: number }> {
  const at = await page.evaluate(
    ([px, pz]) => window.__bohemiaE2E!.projectToScreen!(px!, pz!),
    [x, z],
  );
  if (!at) throw new Error('Bod je mimo záběr.');
  return at;
}

export type JourneyScene = ReturnType<
  NonNullable<NonNullable<Window['__bohemiaE2E']>['journeyScene']>
>;

export async function journeyScene(page: Page): Promise<JourneyScene> {
  return page.evaluate(
    () =>
      window.__bohemiaE2E?.journeyScene?.() ?? {
        riders: [],
        banner: null,
        hourglass: null,
        phase: null,
        led: [],
        gate: null,
        awayHorses: [],
        selected: null,
      },
  );
}

/** Hráč s založenou vsí, dostavěným dvorcem a dvěma muži rodu k vojvodovi. */
export async function villageWithMen(
  page: Page,
  prefix: string,
  lordName: string,
): Promise<{ seat: Seat; dwelling: Pos; lordId: number }> {
  const { seat: s } = await newPlayer(page, prefix);
  const dwelling = villageSpots(s.landscape).dwelling;
  await found(page, dwelling, lordName);
  const state = await changeVillageState(s.settlementId, (st) => {
    const lord = st.people.find((p) => p.id === st.dynasty?.lordId)!;
    const base = Math.max(...st.people.map((p) => p.id)) + 1;
    const man = (id: number, name: string): Person => ({
      id,
      bornDay: st.lastDay - 22 * 366,
      dwellingId: lord.dwellingId,
      sex: 'male',
      line: true,
      name,
    });
    return withBuiltFirstDwelling({
      ...st,
      people: [...st.people, man(base, 'Ctibor'), man(base + 1, 'Neklan')],
    });
  });
  await pollVillage(page);
  return { seat: s, dwelling, lordId: state.dynasty!.lordId! };
}

/** Vybere vojvodu portrétem v panelu dvorce a pravým tlačítkem ho pošle na bod `to`. */
export async function sendLord(
  page: Page,
  v: { dwelling: Pos; lordId: number },
  to: Pos,
): Promise<void> {
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        const at = await screenOf(page, v.dwelling.x, v.dwelling.z);
        await page.mouse.click(at.x, at.y);
        return panel.getAttribute('data-kind', { timeout: 1000 }).catch(() => null);
      },
      { timeout: 60_000 },
    )
    .toBe('dwelling');
  await panel.getByTestId(`resident-select-${v.lordId}`).click();
  await expect(page.getByTestId('lord-retinue')).toBeVisible({ timeout: 30_000 });
  const target = await screenOf(page, to.x, to.z);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await expect(page.getByTestId('lord-away-badge')).toBeVisible({ timeout: 30_000 });
}

/** Postaví skupinu běžícího výjezdu hráče ze sídla `settlementId` na políčko `cell` do bodu `pos`. */
export async function placeJourney(
  settlementId: string,
  cell: { x: number; y: number },
  pos: Pos,
): Promise<void> {
  const [row] = await query<{ id: string; state: JourneyState }>(
    `SELECT j.id, c.state FROM journey j
       JOIN journey_checkpoint c ON c.journey_id = j.id
       JOIN settlement s ON s.owner_id = j.player_id
     WHERE s.id = $1 AND j.status = 'active'`,
    [settlementId],
  );
  if (!row) return;
  const state = row.state;
  const group = state.groups[0]!;
  const here = group.cell.x === cell.x && group.cell.y === cell.y;
  if (here && Math.hypot(group.pos.x - pos.x, group.pos.z - pos.z) < 1) return;
  group.cell = { ...cell };
  group.pos = { x: pos.x, z: pos.z };
  group.goal = { cell: { ...cell }, pos: { x: pos.x, z: pos.z } };
  group.leg = null;
  group.arrived = true;
  state.arrivedTick = state.tick;
  await query('UPDATE journey_checkpoint SET state = $2 WHERE journey_id = $1', [row.id, state]);
}
