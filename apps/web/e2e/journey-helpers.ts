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

// Společné kroky e2e výprav (expeditions.spec.ts, journey-worker.spec.ts): bod scény na obrazovce,
// háček scény výprav, ves s muži rodu a vesničany, výběr lidí (Shift + klik), vyslání výpravy a
// skupina přesunutá v DB.

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
        phase: null,
        led: [],
        groom: null,
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
  await expect(panel).toHaveAttribute('data-kind', 'person', { timeout: 30_000 });
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
  // jinde už neuvízla – den uvíznutí (úsek se ten den znovu nehledá) a návrat po paměti neplatí
  delete group.stuckDay;
  delete group.retrace;
  group.arrived = true;
  // čekání běží skupině hloučku (plán 2026-11-14 – Úloha 1)
  for (const party of state.parties) if (party.id === group.party) party.arrivedTick = state.tick;
  await query('UPDATE journey_checkpoint SET state = $2 WHERE journey_id = $1', [row.id, state]);
}

/** Do vsi (stav) přidá `count` dospělých vesničanů bez jména a mimo rod; vrátí jejich id. */
export async function addVillagers(settlementId: string, count: number): Promise<number[]> {
  const ids: number[] = [];
  await changeVillageState(settlementId, (st) => {
    const lord = st.people.find((p) => p.id === st.dynasty?.lordId)!;
    const base = Math.max(...st.people.map((p) => p.id)) + 1;
    const people: Person[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(base + i);
      people.push({
        id: base + i,
        bornDay: st.lastDay - (24 + i) * 366,
        dwellingId: lord.dwellingId,
        sex: 'male',
      });
    }
    return { ...st, people: [...st.people, ...people] };
  });
  return ids;
}

/**
 * Vybere lidi vsi (háček jako výsledek Shift + kliku – postavy chodí a bývají uvnitř domů, klik
 * myší by byl nestabilní; rozložení výběru po kliknutí hlídají unit testy `village-selection`).
 */
export async function selectPeople(page: Page, ids: readonly number[]): Promise<void> {
  await page.evaluate((list) => {
    if (list.length === 1) window.__bohemiaE2E!.selectPerson!(list[0]!);
    else window.__bohemiaE2E!.selectPeople!(list);
  }, ids);
  const panel = page.getByTestId('selection-panel');
  await expect(panel).toHaveAttribute('data-kind', ids.length === 1 ? 'person' : 'people', {
    timeout: 30_000,
  });
}

/** Pravým tlačítkem pošle vybrané lidi na bod `to`; čeká, až bude vidět Domů (jsou ve výpravě). */
export async function sendSelected(page: Page, to: Pos): Promise<void> {
  const target = await screenOf(page, to.x, to.z);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await expect(page.getByTestId('expedition-home')).toBeVisible({ timeout: 30_000 });
}

/**
 * Skupinu, která po Domů jede zpět, postaví na domovskou mapu `cell` do bodu `pos` – cestu přes
 * celou mapu nahradí. True – skupina se vrací a je na té mapě. Přestaví i skupinu, která na
 * domovskou mapu došla sama, ale uvízla (`stuckDay`, `retrace`): bod sousední mapy, kam ji test
 * postavil zápisem, nemusí vést k brance domova – hustý les náhodné krajiny je neprůchodný
 * a skupina pak přejde okrajem do kapsy, odkud domů nedojde (domů se nepřenese – Martin 17. 11.
 * 2026, „Vrátit se, kudy přišla“). Den uvíznutí smaže vždy – jinak by ten den úsek z nového místa
 * nehledala (`stepMover`) a v pomalém světě e2e by stála hodiny.
 */
export async function placeReturning(
  settlementId: string,
  cell: { x: number; y: number },
  pos: Pos,
): Promise<boolean> {
  const [row] = await query<{ id: string; state: JourneyState }>(
    `SELECT j.id, c.state FROM journey j
       JOIN journey_checkpoint c ON c.journey_id = j.id
       JOIN settlement s ON s.owner_id = j.player_id
     WHERE s.id = $1 AND j.status = 'active'`,
    [settlementId],
  );
  // body zakládá nový krok – skupina 0 výpravy (plán 2026-11-14 – Úloha 1)
  if (!row || row.state.parties?.[0]?.phase !== 'returning') return false;
  const group = row.state.groups[0]!;
  const home = group.cell.x === cell.x && group.cell.y === cell.y;
  if (home && group.stuckDay === undefined && group.retrace !== true) return true;
  group.cell = { x: cell.x, y: cell.y };
  group.pos = { x: pos.x, z: pos.z };
  // cíl (ves) je na této mapě – žádné další políčko k přechodu, úsek cesty se naplánuje znovu
  group.route = [];
  group.leg = null;
  delete group.stuckDay;
  delete group.retrace;
  group.arrived = false;
  await query('UPDATE journey_checkpoint SET state = $2 WHERE journey_id = $1', [
    row.id,
    row.state,
  ]);
  return true;
}
