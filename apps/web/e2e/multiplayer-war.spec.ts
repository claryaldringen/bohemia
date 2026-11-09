import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import {
  newCampaign,
  resolveWorldClock,
  tickOfMs,
  type CampaignMember,
  type CampaignState,
  type ShelterReport,
  type WarSceneView,
} from '@bohemia/game';
import { E2E_ENV } from '../playwright.config';
import { useUniqueClientIp } from './helpers';
import {
  found,
  newPlayer,
  pollVillage,
  query,
  villageSpots,
  villageState,
  withBuiltFirstDwelling,
  writeVillageState,
} from './village-helpers';
// nájezd na ves s palisádou s ochozem (plán hradeb – Úloha 22), test na konci souboru
import {
  addGate,
  dayOfTick,
  fortSegments,
  obstaclesOf,
  outlineOf,
  proposeFortification,
  startFortification,
  villageFortifications,
  type Fighter,
} from '@bohemia/game';

// Válka dvou hráčů celá (plán 2026-11-03 – Úloha 6.17): A přepadne B (velí NPC – jiný muž než
// hráč), B má výchozí postoj útěk – lidé i dobytek utečou do lesa, B dostane upozornění „Cizí
// vojsko“, A „Vojsko se vrátilo“, kronika obou zapíše nájezd bez opovědi; pak A nabídne mír
// s ročním tributem, B přijme. Čas se zkracuje zápisem do bohemia_test: tažení stojí rovnou
// u vsi B, po nájezdu se vojsko přenese do shromaždiště a vsi se vrátí o den, aby den nájezdu
// dopočítaly i s událostmi schránky (herní den trvá v testech ≈ 4,8 h).

async function houseIdOf(email: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    `SELECT h.id FROM house h JOIN "user" u ON u.id = h.player_id
      WHERE u.email = $1 AND h.ended_at IS NULL`,
    [email],
  );
  if (!row) throw new Error(`Hráč ${email} nemá rod.`);
  return row.id;
}

async function placeOf(
  settlementId: string,
): Promise<{ villageId: string; cell: { x: number; y: number } }> {
  const [row] = await query<{ id: string; grid_x: number | null; grid_y: number | null }>(
    `SELECT v.id, s.grid_x, s.grid_y FROM village v JOIN settlement s ON s.id = v.settlement_id
      WHERE s.id = $1`,
    [settlementId],
  );
  return { villageId: row!.id, cell: { x: row!.grid_x ?? 0, y: row!.grid_y ?? 0 } };
}

interface Worker {
  output: () => string;
  stop: () => Promise<void>;
}

/** Worker se smyčkou tažení po taktech (smyčka vsí utlumená) – jako v testu živého vedení. */
async function startWorker(): Promise<Worker> {
  const worker = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: path.join(import.meta.dirname, '../../worker'),
    env: {
      ...process.env,
      ...E2E_ENV,
      WORKER_LIMIT: '1',
      WORKER_STEP_DAYS: '1',
      WORKER_PAUSE_MS: '600000',
      WORKER_IDLE_MS: '600000',
      WORKER_CAMPAIGN_MS: '250',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const exited = new Promise<void>((resolve) => worker.once('exit', () => resolve()));
  worker.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  worker.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const stop = async (): Promise<void> => {
    worker.kill('SIGTERM');
    const quit = await Promise.race([
      exited.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 30_000)),
    ]);
    if (!quit) worker.kill('SIGKILL');
  };
  try {
    await expect.poll(() => output, { timeout: 30_000 }).toContain('start –');
  } catch (error) {
    await stop();
    throw error;
  }
  return { output: () => output, stop };
}

async function checkpointOf(campaignId: string): Promise<{
  state: CampaignState;
  outbox: unknown;
  status: string;
}> {
  const [row] = await query<{ state: CampaignState; outbox: unknown; status: string }>(
    `SELECT p.state, p.outbox, c.status FROM campaign_checkpoint p
       JOIN campaign c ON c.id = p.campaign_id WHERE c.id = $1`,
    [campaignId],
  );
  return row!;
}

/**
 * Vrátí ves o den: dnešek dopočítá znovu i s událostmi schránky, které tažení zapsalo na zítřek
 * (ves byla dopočtená do dneška). Jinak by den nájezdu přišel až za ≈ 4,8 h.
 */
async function replayToday(settlementId: string, villageId: string, today: number): Promise<void> {
  const state = await villageState(settlementId);
  state.lastDay = today - 1;
  await writeVillageState(settlementId, state);
  await query(`UPDATE village_inbox SET day = $2 WHERE village_id = $1 AND day > $2`, [
    villageId,
    today,
  ]);
}

async function notices(page: Page, text: string): Promise<void> {
  await pollVillage(page);
  await expect(page.getByTestId('village-notice').filter({ hasText: text })).toBeVisible({
    timeout: 60_000,
  });
}

test('válka dvou hráčů: A přepadne B, B uteče do lesa i s dobytkem, kronika obou, mír s tributem', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  for (const page of [a, b]) await page.setViewportSize({ width: 1280, height: 720 });
  const { email: emailA, seat: seatA } = await newPlayer(a, 'valkaa');
  const spotsA = villageSpots(seatA.landscape);
  await found(a, spotsA.dwelling, 'Bořivoj');
  const { email: emailB, seat: seatB } = await newPlayer(b, 'valkab');
  const spotsB = villageSpots(seatB.landscape);
  await found(b, spotsB.dwelling, 'Dalibor');
  const [idA, idB] = [await houseIdOf(emailA), await houseIdOf(emailB)];
  const [placeA, placeB] = [await placeOf(seatA.settlementId), await placeOf(seatB.settlementId)];
  const [playerA] = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [emailA]);

  // ves B: dostavěná zemnice (lidé v ní – skupina domu) a stádo ovcí; výchozí postoj = útěk
  const stateB = withBuiltFirstDwelling(await villageState(seatB.settlementId));
  expect(stateB.defense?.stance ?? 'flee').toBe('flee');
  const herds = { sheep: 8, goat: 0, pig: 0, cow: 0 };
  stateB.livestock = {
    ...(stateB.livestock ?? { young: { sheep: 0, goat: 0, pig: 0, cow: 0 } }),
    herds,
  };
  await writeVillageState(seatB.settlementId, stateB);
  const stateA = withBuiltFirstDwelling(await villageState(seatA.settlementId));
  await writeVillageState(seatA.settlementId, stateA);
  const today = Math.max(stateA.lastDay, stateB.lastDay);

  // přepadení bez opovědi – válka vznikne prvním útokem (zde zápisem; dnešní střet – jinak by
  // válka bez střetu utichla)
  const [war] = await query<{ id: string }>(
    `INSERT INTO war (house_low, house_high, how, started_at, started_day, last_clash_day)
     VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), 'ambush', now(), $3, $3)
     RETURNING id`,
    [idA, idB, today],
  );

  // tažení A stojí rovnou u vsi B; velí vesničan, ne hráč – rozhoduje NPC velitel
  const lord = stateA.people[0]!;
  const world = resolveWorldClock(E2E_ENV);
  const tick = tickOfMs(Date.now(), world);
  const man = (personId: number, line: boolean): CampaignMember => ({
    ref: { villageId: placeA.villageId, personId },
    playerId: playerA!.id,
    line,
    mounted: false,
    forced: false,
    strength: line ? 2 : 0.4,
    health: 100,
    vigor: 1,
    wounded: false,
    group: 0,
    status: 'active',
  });
  const villager = lord.id + 100_000;
  const home = { x: spotsA.dwelling.x, z: spotsA.dwelling.z };
  const at = { x: spotsB.dwelling.x + 40, z: spotsB.dwelling.z };
  const campaignId = randomUUID();
  const base = newCampaign(
    {
      id: campaignId,
      warId: war!.id,
      seed: 11,
      tick,
      playerId: playerA!.id,
      leaderName: 'Bořivoj',
      commander: { villageId: placeA.villageId, personId: villager },
      deputy: null,
      assembly: { villageId: placeA.villageId, cell: placeA.cell, pos: home, name: 'Lhota' },
      target: { villageId: placeB.villageId, cell: placeB.cell, pos: at, name: 'Kněžice' },
      members: [man(villager, false), man(lord.id, true), man(villager + 1, false)],
      foodKg: 50,
      liveCommand: false,
    },
    world,
  );
  const state: CampaignState = {
    ...base,
    phase: 'marching',
    ambush: true,
    presenceTick: tick,
    groups: base.groups.map((g) => ({
      ...g,
      cell: { ...placeB.cell },
      pos: { ...at },
      goal: { cell: { ...placeB.cell }, pos: { ...at } },
      arrived: true,
    })),
  };
  // worker počítá jen tažení tohoto testu
  await query(`UPDATE campaign SET status = 'done' WHERE status = 'active'`, []);
  await query(
    `INSERT INTO campaign (id, war_id, player_id, status, created_at)
     VALUES ($1, $2, $3, 'active', now())`,
    [campaignId, war!.id, playerA!.id],
  );
  await query(
    `INSERT INTO campaign_checkpoint (campaign_id, tick, state) VALUES ($1, $2, $3::jsonb)`,
    [campaignId, tick, JSON.stringify(state)],
  );

  let worker = await startWorker();
  let shelter: ShelterReport | undefined;
  try {
    // boj se otevře: B uteče do lesa i s dobytkem, výsledek nájezdu odejde do vsí
    await expect
      .poll(
        async () => {
          const point = await checkpointOf(campaignId);
          shelter ??= point.state.battle?.shelter;
          return point.state.raidDay !== undefined && point.outbox === null;
        },
        { timeout: 90_000, message: worker.output() },
      )
      .toBe(true);
    expect(shelter?.stance).toBe('flee');
    expect(shelter!.forest.length).toBeGreaterThan(0);
    expect(shelter!.surrendered).toEqual([]);
    expect(shelter!.livestockForest.sheep).toBe(herds.sheep);
    await notices(b, 'Cizí vojsko u vsi');
    // scéna napadené vsi dostane vojsko (war.md – Ve scéně – napojení na hru): útočníci v dohledu
    // domů vsi, i když obránci utekli do lesa
    await expect(b.locator('canvas[data-scene]')).toHaveAttribute('data-war-men', /^[1-9]/, {
      timeout: 30_000,
    });
    // a kreslí ho – postavy mužů (instance meshů `army-*`)
    await expect
      .poll(
        () =>
          b.evaluate(() =>
            window.__bohemiaE2E!.armyStats!()
              .filter((m) => m.name.startsWith('army-man'))
              .reduce((n, m) => n + m.count, 0),
          ),
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);
    // i útěk vsi do lesa se stádem (war.md – Ve scéně – Napadená ves): ovce, které ves odehnala
    // do lesa, jdou za lidmi (útočníci jsou pěší a kořist bez dobytka – krávy jsou jen útěk)
    await expect
      .poll(
        () =>
          b.evaluate(() =>
            window.__bohemiaE2E!.armyStats!()
              .filter((m) => m.name.startsWith('army-cow'))
              .reduce((n, m) => n + m.count, 0),
          ),
        { timeout: 30_000 },
      )
      .toBe(herds.sheep);
    if (process.env.WAR_SHOT_DIR) {
      // snímek vsi s vojskem: výchozí záběr na ves, pak přiblížit k vojsku pod ní
      const dir = process.env.WAR_SHOT_DIR;
      await b.keyboard.press('Escape');
      await b.mouse.move(640, 300);
      await b.waitForTimeout(2_000);
      await b.screenshot({ path: `${dir}/napadena-ves-zaber.png` });
      await b.mouse.move(640, 560);
      for (let i = 0; i < 5; i++) {
        await b.mouse.wheel(0, -300);
        await b.waitForTimeout(150);
      }
      await b.mouse.move(640, 300);
      await b.waitForTimeout(2_000);
      await b.screenshot({ path: `${dir}/napadena-ves.png` });
      // útěk vsi: záběr na cestu od domu k okraji lesa, kam ves utíká (pohled ze serveru)
      const way = await b.evaluate(async (id) => {
        const res = await fetch(`/api/war-scene/${id}`);
        const { war } = (await res.json()) as { war: WarSceneView | null };
        const home = war?.flight?.people[0]?.home;
        const forest = war?.flight?.forests[0];
        // třetina cesty – lidé vyšli při otevření boje před pár desítkami sekund
        const at = (k: number): { x: number; z: number } | null =>
          home && forest
            ? { x: home.x + (forest.x - home.x) * k, z: home.z + (forest.z - home.z) * k }
            : null;
        return at(0.3);
      }, seatB.settlementId);
      if (way) {
        await b.evaluate(({ x, z }) => window.__bohemiaE2E!.moveCameraTo!(x, z), way);
        await b.mouse.move(640, 360);
        for (let i = 0; i < 4; i++) {
          await b.mouse.wheel(0, 300);
          await b.waitForTimeout(150);
        }
        await b.waitForTimeout(2_000);
        await b.screenshot({ path: `${dir}/utek-vsi.png` });
      }
    }

    // vojsko obrátilo – zkrátíme cestu domů: skupiny rovnou ve shromaždišti
    await worker.stop();
    const point = await checkpointOf(campaignId);
    const back: CampaignState = {
      ...point.state,
      phase: 'returning',
      returnReason: point.state.returnReason ?? 'arrived',
      groups: point.state.groups.map((g) => ({
        ...g,
        cell: { ...placeA.cell },
        pos: { ...home },
        goal: { cell: { ...placeA.cell }, pos: { ...home } },
        route: [],
        leg: null,
        arrived: true,
      })),
    };
    await query(`UPDATE campaign_checkpoint SET state = $2::jsonb WHERE campaign_id = $1`, [
      campaignId,
      JSON.stringify(back),
    ]);
    // vojsko stojí na mapě A – scéna A ho ukáže (vlastní vojsko, bez mlhy); B už ho nevidí
    await expect(a.locator('canvas[data-scene]')).toHaveAttribute('data-war-men', /^[1-9]/, {
      timeout: 30_000,
    });
    await expect(b.locator('canvas[data-scene]')).not.toHaveAttribute('data-war-men', /.*/, {
      timeout: 30_000,
    });
    worker = await startWorker();
    await expect
      .poll(async () => (await checkpointOf(campaignId)).status, {
        timeout: 60_000,
        message: worker.output(),
      })
      .toBe('done');
    await expect.poll(async () => (await checkpointOf(campaignId)).outbox).toBeNull();
  } finally {
    await worker.stop();
    await query(`UPDATE campaign SET status = 'done' WHERE id = $1`, [campaignId]);
  }
  await notices(a, 'Vojsko se vrátilo');

  // kronika obou rodů: nájezd bez opovědi (den nájezdu se dopočítá znovu i se schránkou)
  await replayToday(seatA.settlementId, placeA.villageId, today);
  await replayToday(seatB.settlementId, placeB.villageId, today);
  for (const [page, seat] of [
    [a, seatA],
    [b, seatB],
  ] as const) {
    await pollVillage(page);
    await expect
      .poll(
        async () =>
          (await villageState(seat.settlementId)).chronicle.some(
            (e) => e.kind === 'raid' && !e.declared && e.leader === 'Bořivoj',
          ),
        { timeout: 60_000 },
      )
      .toBe(true);
  }
  // dobytek byl v lese – útočník ho nevzal (den simulace ubere jen zlomek – úhyn)
  expect((await villageState(seatB.settlementId)).livestock!.herds.sheep).toBeGreaterThan(
    herds.sheep - 0.5,
  );

  // A nabídne mír s ročním tributem 40 kg obilí, který platí B
  await pollVillage(a);
  await expect(a.getByTestId('war-count')).toHaveAttribute('data-wars', '1', { timeout: 30_000 });
  await a.getByTestId('war-toggle').click();
  await a.getByTestId('war-offer-peace').click();
  await a.getByTestId('peace-payer').selectOption('other');
  await a.getByTestId('peace-tribute').fill('40');
  await a.getByTestId('peace-send').click();

  // B vidí mírové jednání a přijme
  await pollVillage(b);
  const panelB = b.getByRole('dialog', { name: 'Rod a vazalové' });
  await expect
    .poll(
      async () => {
        if (!(await panelB.isVisible())) {
          await b.getByRole('button', { name: 'Rod a vazalové' }).click();
        } else {
          await b.getByRole('button', { name: 'Rod a vazalové' }).click();
          await b.getByRole('button', { name: 'Rod a vazalové' }).click();
        }
        return panelB.getByTestId('house-negotiation').getAttribute('data-my-turn');
      },
      { timeout: 30_000 },
    )
    .toBe('true');
  const card = panelB.getByTestId('house-negotiation');
  await expect(card.getByTestId('term-row-peace')).toBeVisible();
  await panelB.getByTestId('negotiation-accept').click();
  await expect(panelB.getByTestId('house-negotiation')).toHaveCount(0);

  // válka skončila mírem s tributem, který platí B
  const wars = await query<{ status: string }>(`SELECT status FROM war WHERE id = $1`, [war!.id]);
  expect(wars).toEqual([{ status: 'peace' }]);
  const [peace] = await query<{ items: { kind: string; tribute?: unknown }[] }>(
    `SELECT r.items FROM negotiation n JOIN negotiation_round r ON r.negotiation_id = n.id
      WHERE n.status = 'accepted' AND n.party_low = LEAST($1::uuid, $2::uuid)
        AND n.party_high = GREATEST($1::uuid, $2::uuid)
      ORDER BY r.seq DESC LIMIT 1`,
    [idA, idB],
  );
  const tribute = peace!.items.find((i) => i.kind === 'peace')?.tribute;
  expect(tribute).toMatchObject({ goods: { grainKg: 40 }, payer: idB });
  // kronika míru do vsí obou rodů (schránka) a obě lišty bez války
  const chronicled = await query<{ village_id: string }>(
    `SELECT village_id FROM village_inbox WHERE ref LIKE 'war-peace:%' AND village_id = ANY($1)`,
    [[placeA.villageId, placeB.villageId]],
  );
  expect(new Set(chronicled.map((r) => r.village_id))).toEqual(
    new Set([placeA.villageId, placeB.villageId]),
  );
  for (const page of [a, b]) {
    await pollVillage(page);
    await expect(page.getByTestId('war-count')).toHaveAttribute('data-wars', '0', {
      timeout: 30_000,
    });
  }
  await Promise.all(ctxs.map((ctx) => ctx.close()));
});

/** Leží bod uvnitř mnohoúhelníku (paprsek ve směru +x)? */
function insidePolygon(p: { x: number; z: number }, poly: readonly (readonly number[])[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i] as [number, number];
    const [xj, zj] = poly[j] as [number, number];
    if (zi > p.z !== zj > p.z && p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Vrátí ves na den před `fromDay`: dny od něj dopočítá znovu i s událostmi schránky (ty, které
 * tažení zapsalo za dnešek, přesune na dnešek) – jako `replayToday`, jen boj mohl začít včera.
 */
async function replayFrom(
  settlementId: string,
  villageId: string,
  fromDay: number,
  today: number,
): Promise<void> {
  const state = await villageState(settlementId);
  state.lastDay = Math.min(fromDay, today) - 1;
  await writeVillageState(settlementId, state);
  await query(`UPDATE village_inbox SET day = $2 WHERE village_id = $1 AND day > $2`, [
    villageId,
    today,
  ]);
}

// Nájezd na ves s palisádou s ochozem (plán hradeb – Úloha 22): muži vsi B obsadí hradbu, NPC
// velitel A zvolí postup přes ni sám (palisáda je bez bran, zbývají žebříky, oheň a kopání –
// nejrychlejší jsou žebříky z lesa), útočníci se dostanou dovnitř a výsledek nájezdu zapíšou
// kroniky obou vsí. Výroba žebříku trvá 4 herní hodiny – v pomalém světě testů ≈ 11 500 taktů
// (48 min) –, proto tažení začne o 16 000 taktů (≈ 67 min) dřív a worker boj dožene najednou.
test('nájezd na ves s palisádou s ochozem: obránci na hradbě, útočníci přes ni, kronika obou vsí', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  for (const page of [a, b]) await page.setViewportSize({ width: 1280, height: 720 });
  const { email: emailA, seat: seatA } = await newPlayer(a, 'hradbaa');
  const spotsA = villageSpots(seatA.landscape);
  await found(a, spotsA.dwelling, 'Soběslav');
  const { email: emailB, seat: seatB } = await newPlayer(b, 'hradbab');
  await found(b, villageSpots(seatB.landscape).dwelling, 'Vratislav');
  const [idA, idB] = [await houseIdOf(emailA), await houseIdOf(emailB)];
  const [placeA, placeB] = [await placeOf(seatA.settlementId), await placeOf(seatB.settlementId)];
  const [playerA] = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [emailA]);

  // ves B: dostavěná zemnice a kolem vsi hotová palisáda s ochozem – bez bran, ať útočníci
  // musí přes hradbu (brána by se prosekla dřív, než se vyrobí žebřík)
  const builtB = withBuiltFirstDwelling(await villageState(seatB.settlementId));
  const d = builtB.dwellings[0]!;
  const sq = d.plot?.square;
  const home = sq ? { x: sq.x, z: sq.z } : { x: d.position.x, z: d.position.z };
  const obstacles = obstaclesOf(seatB.landscape);
  const proposal = proposeFortification(
    builtB,
    builtB.lastDay,
    seatB.landscape,
    obstacles,
    'palisade',
    home,
  );
  expect(proposal.check.reason).toBeNull();
  const started = startFortification(builtB, builtB.lastDay, seatB.landscape, obstacles, {
    points: proposal.points,
    kind: 'palisade',
  });
  if (!started.ok) throw new Error(started.reason);
  const stateB = started.state;
  stateB.constructions = stateB.constructions.filter((c) => c.kind !== 'fortification');
  const fort = villageFortifications(stateB)[0]!;
  fort.kind = 'walkway';
  fort.gates = [];
  for (const seg of fort.segments) {
    // hotová už včera i předevčírem: tažení (16 000 taktů zpět) může začít i předchozí herní den,
    // a hradba musí stát od prvního taktu boje, ať se spustí test v kteroukoli hodinu dne
    seg.builtDay = Math.max(0, stateB.lastDay - 2);
    seg.state = 1;
  }
  // Boj bez luků: v pomalém světě e2e (herní den ≈ 4,8 h) trvá výroba žebříku (4 herní hodiny)
  // ≈ 11 500 taktů boje – souboj luků mužů rodu přes hradbu se za tu dobu rozhodne dřív, než žebřík
  // stojí (los taktu, tedy hodina spuštění testu). Hradbu tak brání tři vesničané a pán vsi B je
  // raněný doma; vojsko A jsou jen vesničané.
  const nextId = Math.max(...stateB.people.map((p) => p.id)) + 1;
  const lordB = stateB.people.find((p) => p.line === true)!;
  lordB.woundedUntil = stateB.lastDay + 365;
  for (let i = 0; i < 3; i++) {
    stateB.people.push({
      id: nextId + i,
      sex: 'male',
      bornDay: stateB.lastDay - (20 + i) * 365,
      dwellingId: lordB.dwellingId,
    });
  }
  await writeVillageState(seatB.settlementId, stateB);
  const ring = fortSegments(outlineOf(seatB.landscape, fort)!).map((s) => s.mid);
  const stateA = withBuiltFirstDwelling(await villageState(seatA.settlementId));
  await writeVillageState(seatA.settlementId, stateA);
  const today = Math.max(stateA.lastDay, stateB.lastDay);

  // tažení A začne před 16 000 takty 40 m vně hradby; velí vesničan – rozhoduje NPC velitel
  const world = resolveWorldClock(E2E_ENV);
  const tick = tickOfMs(Date.now(), world) - 16_000;
  const startDay = dayOfTick(tick, world);
  const [war] = await query<{ id: string }>(
    `INSERT INTO war (house_low, house_high, how, started_at, started_day, last_clash_day)
     VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), 'ambush', now(), $3, $3)
     RETURNING id`,
    [idA, idB, Math.min(startDay, today)],
  );
  const lord = stateA.people[0]!;
  const man = (personId: number, line: boolean, strength: number): CampaignMember => ({
    ref: { villageId: placeA.villageId, personId },
    playerId: playerA!.id,
    line,
    mounted: false,
    forced: false,
    strength,
    health: 100,
    vigor: 1,
    wounded: false,
    group: 0,
    status: 'active',
  });
  const villager = lord.id + 100_000;
  const homeA = { x: spotsA.dwelling.x, z: spotsA.dwelling.z };
  const at = { x: Math.max(...ring.map((p) => p[0])) + 40, z: home.z };
  expect(insidePolygon(at, ring)).toBe(false);
  const campaignId = randomUUID();
  const base = newCampaign(
    {
      id: campaignId,
      warId: war!.id,
      seed: 22,
      tick,
      playerId: playerA!.id,
      leaderName: 'Soběslav',
      commander: { villageId: placeA.villageId, personId: villager },
      deputy: null,
      assembly: { villageId: placeA.villageId, cell: placeA.cell, pos: homeA, name: 'Lhota' },
      target: { villageId: placeB.villageId, cell: placeB.cell, pos: at, name: 'Hradec' },
      // jen vesničané – bez muže rodu s lukem (viz výš)
      members: [
        man(villager, false, 1),
        ...[1, 2, 3, 4, 5, 6, 7].map((i) => man(villager + i, false, 1)),
      ],
      foodKg: 80,
      liveCommand: false,
    },
    world,
  );
  const state: CampaignState = {
    ...base,
    phase: 'marching',
    ambush: true,
    presenceTick: tick,
    groups: base.groups.map((g) => ({
      ...g,
      cell: { ...placeB.cell },
      pos: { ...at },
      goal: { cell: { ...placeB.cell }, pos: { ...at } },
      arrived: true,
    })),
  };
  await query(`UPDATE campaign SET status = 'done' WHERE status = 'active'`, []);
  await query(
    `INSERT INTO campaign (id, war_id, player_id, status, created_at)
     VALUES ($1, $2, $3, 'active', now())`,
    [campaignId, war!.id, playerA!.id],
  );
  await query(
    `INSERT INTO campaign_checkpoint (campaign_id, tick, state) VALUES ($1, $2, $3::jsonb)`,
    [campaignId, tick, JSON.stringify(state)],
  );

  let worker = await startWorker();
  let raidDay = today;
  try {
    // boj doběhne: B v útočišti, muži na hradbě, útočníci přes hradbu, výsledek odejde do vsí
    await expect
      .poll(
        async () => {
          const point = await checkpointOf(campaignId);
          return point.state.raidDay !== undefined && point.outbox === null;
        },
        { timeout: 420_000, intervals: [2_000], message: worker.output() },
      )
      .toBe(true);
    await worker.stop();
    const point = await checkpointOf(campaignId);
    raidDay = point.state.raidDay!;
    const battle = point.state.battle!;
    const near = (p: { x: number; z: number }): boolean =>
      ring.some((m) => (m[0] - p.x) ** 2 + (m[1] - p.z) ** 2 < 10 * 10);
    const side = (s: Fighter['side']): Fighter[] => battle.fighters.filter((f) => f.side === s);
    // muži vsi B dostali stanoviště na hradbě (1 m za její čarou)
    expect(side('defend').some((f) => f.post !== undefined && near(f.post))).toBe(true);
    // útočníci volili postup sami – na palisádu s ochozem bez bran žebříky – a dostali se dovnitř
    expect(battle.ladders?.length ?? 0).toBeGreaterThan(0);
    expect(side('attack').some((f) => insidePolygon(f.pos, ring))).toBe(true);

    // vojsko obrátilo – zkrátíme cestu domů: skupiny rovnou ve shromaždišti
    const back: CampaignState = {
      ...point.state,
      phase: 'returning',
      returnReason: point.state.returnReason ?? 'arrived',
      groups: point.state.groups.map((g) => ({
        ...g,
        cell: { ...placeA.cell },
        pos: { ...homeA },
        goal: { cell: { ...placeA.cell }, pos: { ...homeA } },
        route: [],
        leg: null,
        arrived: true,
      })),
    };
    await query(`UPDATE campaign_checkpoint SET state = $2::jsonb WHERE campaign_id = $1`, [
      campaignId,
      JSON.stringify(back),
    ]);
    worker = await startWorker();
    await expect
      .poll(async () => (await checkpointOf(campaignId)).status, {
        timeout: 60_000,
        message: worker.output(),
      })
      .toBe('done');
    await expect.poll(async () => (await checkpointOf(campaignId)).outbox).toBeNull();
  } finally {
    await worker.stop();
    await query(`UPDATE campaign SET status = 'done' WHERE id = $1`, [campaignId]);
  }

  // kronika obou rodů: nájezd bez opovědi (dny od nájezdu se dopočítají znovu i se schránkou)
  await replayFrom(seatA.settlementId, placeA.villageId, raidDay, today);
  await replayFrom(seatB.settlementId, placeB.villageId, raidDay, today);
  for (const [page, seat] of [
    [a, seatA],
    [b, seatB],
  ] as const) {
    await pollVillage(page);
    await expect
      .poll(
        async () =>
          (await villageState(seat.settlementId)).chronicle.some(
            (e) => e.kind === 'raid' && !e.declared && e.leader === 'Soběslav',
          ),
        { timeout: 60_000 },
      )
      .toBe(true);
  }
  await Promise.all(ctxs.map((ctx) => ctx.close()));
});

// Cizí mapa ve scéně (war.md – Ve scéně – cizí mapa): útočník A přepne z mapy tažení 3D scénu na
// mapu napadené vsi B – vojsko ve scéně s mlhou války, z vsi B jen objevený dům; když vojsko přejde
// na sousední mapu, scéna jde za ním; když přijde domů, scéna se vrátí na vlastní ves (a vojsko ukáže
// tam). Bez workeru – stav tažení se jen čte.
test('útočník sleduje vojsko ve 3D na mapě napadené vsi i na sousední, po návratu zpět na ves', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  for (const page of [a, b]) await page.setViewportSize({ width: 1280, height: 720 });
  const { email: emailA, seat: seatA } = await newPlayer(a, 'cizia');
  const spotsA = villageSpots(seatA.landscape);
  await found(a, spotsA.dwelling, 'Bořivoj');
  const { email: emailB, seat: seatB } = await newPlayer(b, 'cizib');
  const spotsB = villageSpots(seatB.landscape);
  await found(b, spotsB.dwelling, 'Dalibor');
  await ctxs[1]!.close();
  const [idA, idB] = [await houseIdOf(emailA), await houseIdOf(emailB)];
  const [placeA, placeB] = [await placeOf(seatA.settlementId), await placeOf(seatB.settlementId)];
  const [playerA] = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [emailA]);
  const stateB = withBuiltFirstDwelling(await villageState(seatB.settlementId));
  await writeVillageState(seatB.settlementId, stateB);
  const stateA = withBuiltFirstDwelling(await villageState(seatA.settlementId));
  await writeVillageState(seatA.settlementId, stateA);
  const today = Math.max(stateA.lastDay, stateB.lastDay);
  const [war] = await query<{ id: string }>(
    `INSERT INTO war (house_low, house_high, how, started_at, started_day, last_clash_day)
     VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), 'ambush', now(), $3, $3)
     RETURNING id`,
    [idA, idB, today],
  );

  // vojsko A stojí u vsi B a dům vsi už objevilo
  const lord = stateA.people[0]!;
  const world = resolveWorldClock(E2E_ENV);
  const tick = tickOfMs(Date.now(), world);
  const man = (personId: number, line: boolean): CampaignMember => ({
    ref: { villageId: placeA.villageId, personId },
    playerId: playerA!.id,
    line,
    mounted: false,
    forced: false,
    strength: line ? 2 : 0.4,
    health: 100,
    vigor: 1,
    wounded: false,
    group: 0,
    status: 'active',
  });
  const home = { x: spotsA.dwelling.x, z: spotsA.dwelling.z };
  const at = { x: spotsB.dwelling.x + 40, z: spotsB.dwelling.z };
  const campaignId = randomUUID();
  const base = newCampaign(
    {
      id: campaignId,
      warId: war!.id,
      seed: 13,
      tick,
      playerId: playerA!.id,
      leaderName: 'Bořivoj',
      commander: { villageId: placeA.villageId, personId: lord.id },
      deputy: null,
      assembly: { villageId: placeA.villageId, cell: placeA.cell, pos: home, name: 'Lhota' },
      target: { villageId: placeB.villageId, cell: placeB.cell, pos: at, name: 'Kněžice' },
      members: [man(lord.id, true), man(lord.id + 100_000, false), man(lord.id + 100_001, false)],
      foodKg: 50,
      liveCommand: true,
    },
    world,
  );
  const onMap = (cell: { x: number; y: number }, pos: { x: number; z: number }): CampaignState => ({
    ...base,
    phase: 'marching',
    presenceTick: tick,
    discovered: [stateB.dwellings[0]!.id],
    groups: base.groups.map((g) => ({
      ...g,
      cell: { ...cell },
      pos: { ...pos },
      goal: { cell: { ...cell }, pos: { ...pos } },
      route: [],
      leg: null,
      arrived: true,
    })),
  });
  await query(`UPDATE campaign SET status = 'done' WHERE status = 'active'`, []);
  await query(
    `INSERT INTO campaign (id, war_id, player_id, status, created_at)
     VALUES ($1, $2, $3, 'active', now())`,
    [campaignId, war!.id, playerA!.id],
  );
  await query(
    `INSERT INTO campaign_checkpoint (campaign_id, tick, state) VALUES ($1, $2, $3::jsonb)`,
    [campaignId, tick, JSON.stringify(onMap(placeB.cell, at))],
  );

  try {
    // dvorec → panel Vojsko → běžící tažení → mapa tažení → oko (Ve scéně)
    await pollVillage(a);
    await a.keyboard.press('r');
    const panel = a.getByTestId('selection-panel');
    await expect
      .poll(
        async () => {
          const point = await a.evaluate(
            (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
            spotsA.dwelling,
          );
          if (!point) return null;
          await a.mouse.move(point.x - 3, point.y);
          await a.mouse.click(point.x, point.y);
          return panel.getByTestId('manor-upgrades').count();
        },
        { timeout: 30_000 },
      )
      .toBe(1);
    await panel.getByTestId('manor-army').click();
    await a.getByTestId('army-campaign').click();
    const watch = a.getByTestId('campaign-watch');
    await expect(watch).toBeEnabled({ timeout: 20_000 });
    await watch.click();

    // scéna cizí mapy: krajina políčka B, vojsko A (mlha války), objevený dům vsi B
    const foreign = a.getByTestId('foreign-scene');
    await expect(foreign).toHaveAttribute('data-cell', `${placeB.cell.x},${placeB.cell.y}`);
    const canvas = foreign.locator('canvas[data-scene]');
    await expect(canvas).toHaveAttribute('data-scene-ready', 'true', { timeout: 60_000 });
    await expect(canvas).toHaveAttribute('data-war-men', '3', { timeout: 30_000 });
    await expect
      .poll(
        () =>
          a.evaluate(() =>
            window.__bohemiaE2E!.armyStats!()
              .filter((m) => m.name.startsWith('army-man'))
              .reduce((n, m) => n + m.count, 0),
          ),
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);
    // rozhraní vsi tu není – jen návrat a mapa tažení (živé vedení)
    await expect(a.getByTestId('selection-panel')).toHaveCount(0);
    await expect(foreign.getByTestId('campaign-map')).toBeVisible();
    await expect(foreign.getByTestId('campaign-watch')).toHaveAttribute('aria-pressed', 'true');
    if (process.env.WAR_SHOT_DIR) {
      await a.mouse.move(640, 300);
      await a.waitForTimeout(2_000);
      await a.screenshot({ path: `${process.env.WAR_SHOT_DIR}/cizi-mapa.png` });
    }

    // vojsko přejde na sousední mapu – scéna jde za ním (krajina sousední mapy, vojsko dál ve scéně)
    const next = [
      { x: placeB.cell.x + 1, y: placeB.cell.y },
      { x: placeB.cell.x, y: placeB.cell.y + 1 },
      { x: placeB.cell.x - 1, y: placeB.cell.y },
    ].find((c) => c.x !== placeA.cell.x || c.y !== placeA.cell.y)!;
    await query(`UPDATE campaign_checkpoint SET state = $2::jsonb WHERE campaign_id = $1`, [
      campaignId,
      JSON.stringify(onMap(next, { x: 20, z: 20 })),
    ]);
    await expect(foreign).toHaveAttribute('data-cell', `${next.x},${next.y}`, { timeout: 30_000 });
    await expect(canvas).toHaveAttribute('data-scene-ready', 'true', { timeout: 60_000 });
    await expect(canvas).toHaveAttribute('data-war-men', '3', { timeout: 30_000 });
    await expect
      .poll(
        () =>
          a.evaluate(() =>
            window.__bohemiaE2E!.armyStats!()
              .filter((m) => m.name.startsWith('army-man'))
              .reduce((n, m) => n + m.count, 0),
          ),
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);
    await expect(foreign.getByTestId('campaign-watch')).toHaveAttribute('aria-pressed', 'true');

    // vojsko odejde domů – scéna se vrátí na ves A a ukáže ho tam (bez mlhy)
    await query(`UPDATE campaign_checkpoint SET state = $2::jsonb WHERE campaign_id = $1`, [
      campaignId,
      JSON.stringify({ ...onMap(placeA.cell, home), phase: 'returning', returnReason: 'arrived' }),
    ]);
    await expect(foreign).toHaveCount(0, { timeout: 30_000 });
    await expect(a.locator('canvas[data-scene]')).toHaveAttribute('data-war-men', '3', {
      timeout: 60_000,
    });
  } finally {
    await query(`UPDATE campaign SET status = 'done' WHERE id = $1`, [campaignId]);
    await Promise.all(ctxs.map((ctx) => ctx.close().catch(() => {})));
  }
});

// Rozkaz „Probít se“ (fortifications.md – Obrana bez násobku 3, Bod zlomu a probíjení): B má
// palisádu s ochozem a bránou, vojsko A u ní bojuje (stav boje zapsaný do kontrolního bodu, bez
// workeru – stav tažení se jen čte). B vidí ve scéně boj a ikonu „Probít se“; klik zapíše záměr
// `breakout` do tažení A.
test('obránce za hradbou s branou rozkáže „Probít se“ – záměr v tažení útočníka', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await query(`UPDATE house SET ended_at = now() WHERE ended_at IS NULL`, []);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  for (const page of [a, b]) await page.setViewportSize({ width: 1280, height: 720 });
  const { email: emailA, seat: seatA } = await newPlayer(a, 'probija');
  await found(a, villageSpots(seatA.landscape).dwelling, 'Soběslav');
  const { email: emailB, seat: seatB } = await newPlayer(b, 'probijb');
  await found(b, villageSpots(seatB.landscape).dwelling, 'Vratislav');
  await ctxs[0]!.close();
  const [idA, idB] = [await houseIdOf(emailA), await houseIdOf(emailB)];
  const [placeA, placeB] = [await placeOf(seatA.settlementId), await placeOf(seatB.settlementId)];
  const [playerA] = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [emailA]);
  const [playerB] = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [emailB]);

  // ves B: hotová palisáda s ochozem kolem zemnice a s bránou
  const builtB = withBuiltFirstDwelling(await villageState(seatB.settlementId));
  const d = builtB.dwellings[0]!;
  const home = d.plot?.square
    ? { x: d.plot.square.x, z: d.plot.square.z }
    : { x: d.position.x, z: d.position.z };
  const obstacles = obstaclesOf(seatB.landscape);
  const proposal = proposeFortification(
    builtB,
    builtB.lastDay,
    seatB.landscape,
    obstacles,
    'palisade',
    home,
  );
  expect(proposal.check.reason).toBeNull();
  const started = startFortification(builtB, builtB.lastDay, seatB.landscape, obstacles, {
    points: proposal.points,
    kind: 'palisade',
  });
  if (!started.ok) throw new Error(started.reason);
  const stateB = started.state;
  stateB.constructions = stateB.constructions.filter((c) => c.kind !== 'fortification');
  const fort = villageFortifications(stateB)[0]!;
  fort.kind = 'walkway';
  for (const seg of fort.segments) {
    seg.builtDay = Math.max(0, stateB.lastDay - 2);
    seg.state = 1;
  }
  const outline = outlineOf(seatB.landscape, fort)!;
  const ring = fortSegments(outline).map((s) => ({ x: s.mid[0], z: s.mid[1] }));
  const gates = addGate(outline, [], ring[0]!);
  if (!Array.isArray(gates)) throw new Error(gates.error);
  fort.gates = gates;
  await writeVillageState(seatB.settlementId, stateB);
  const today = stateB.lastDay;
  const [war] = await query<{ id: string }>(
    `INSERT INTO war (house_low, house_high, how, started_at, started_day, last_clash_day)
     VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), 'ambush', now(), $3, $3)
     RETURNING id`,
    [idA, idB, today],
  );

  // boj u vsi B: dva útočníci 40 m vně hradby, tři obránci B na stanovištích hradby
  const world = resolveWorldClock(E2E_ENV);
  const tick = tickOfMs(Date.now(), world);
  const villager = 1_000_000;
  const member = (personId: number): CampaignMember => ({
    ref: { villageId: placeA.villageId, personId },
    playerId: playerA!.id,
    line: false,
    mounted: false,
    forced: false,
    strength: 1,
    health: 100,
    vigor: 1,
    wounded: false,
    group: 0,
    status: 'active',
  });
  const out = { x: Math.max(...ring.map((p) => p.x)) + 40, z: home.z };
  const campaignId = randomUUID();
  const base = newCampaign(
    {
      id: campaignId,
      warId: war!.id,
      seed: 31,
      tick,
      playerId: playerA!.id,
      leaderName: 'Soběslav',
      commander: { villageId: placeA.villageId, personId: villager },
      deputy: null,
      assembly: { villageId: placeA.villageId, cell: placeA.cell, pos: out, name: 'Lhota' },
      target: { villageId: placeB.villageId, cell: placeB.cell, pos: out, name: 'Hradec' },
      members: [member(villager), member(villager + 1)],
      foodKg: 20,
      liveCommand: false,
    },
    world,
  );
  const fighter = (
    id: string,
    side: Fighter['side'],
    ref: number,
    pos: { x: number; z: number },
    extra: Partial<Fighter> = {},
  ): Fighter => ({
    id,
    side,
    ref,
    group: 0,
    line: false,
    bow: false,
    mounted: false,
    strength: 1,
    health: 100,
    pos,
    home: pos,
    state: 'fight',
    cooldown: 0,
    aim: null,
    controlled: false,
    chosen: null,
    goal: null,
    route: [],
    routeFor: null,
    breachAt: null,
    fleeTo: null,
    atHouseOnly: false,
    lastLine: false,
    killed: false,
    ...extra,
  });
  const men = stateB.people.slice(0, 3);
  const state: CampaignState = {
    ...base,
    phase: 'raiding',
    ambush: true,
    presenceTick: tick,
    groups: base.groups.map((g) => ({
      ...g,
      cell: { ...placeB.cell },
      pos: { ...out },
      goal: { cell: { ...placeB.cell }, pos: { ...out } },
      arrived: true,
    })),
    battle: {
      fighters: [
        fighter('a:0', 'attack', 0, out),
        fighter('a:1', 'attack', 1, { x: out.x + 2, z: out.z }),
        ...men.map((p, i) => {
          const post = ring[(i + 1) % ring.length]!;
          return fighter(`d:${p.id}`, 'defend', p.id, post, { post, onWall: true });
        }),
      ],
      groups: [
        { side: 'attack', id: 0, order: 'attack-all', holdAt: null, entered: 2, broken: false },
        { side: 'defend', id: 0, order: null, holdAt: null, entered: men.length, broken: false },
      ],
      commander: 'a:0',
      deputy: null,
      closedGates: [`0:${gates[0]!.segment}`],
      breaches: [],
      outcome: 'ongoing',
      ticks: 10,
      openTick: tick - 10,
    },
  };
  await query(`UPDATE campaign SET status = 'done' WHERE status = 'active'`, []);
  await query(
    `INSERT INTO campaign (id, war_id, player_id, status, created_at)
     VALUES ($1, $2, $3, 'active', now())`,
    [campaignId, war!.id, playerA!.id],
  );
  await query(
    `INSERT INTO campaign_checkpoint (campaign_id, tick, state) VALUES ($1, $2, $3::jsonb)`,
    [campaignId, tick, JSON.stringify(state)],
  );

  try {
    // B vidí boj u své vsi a ikonu „Probít se“ (scéna se ptá na válku nejdéle po 5 s)
    const breakout = b.getByTestId('breakout');
    await expect(breakout).toBeVisible({ timeout: 30_000 });
    await expect(breakout).toBeEnabled();
    await expect(breakout).toHaveAttribute('aria-label', 'Probít se');
    await breakout.click();
    await expect
      .poll(async () =>
        query<{ by_player: string; body: { kind: string; fort: number } }>(
          `SELECT by_player, body FROM campaign_intent WHERE campaign_id = $1`,
          [campaignId],
        ),
      )
      .toEqual([{ by_player: playerB!.id, body: { kind: 'breakout', fort: 0 } }]);
    // po odeslání zašedne – obránci se shromažďují u brány
    await expect(breakout).toBeDisabled();
  } finally {
    await query(`UPDATE campaign SET status = 'done' WHERE id = $1`, [campaignId]);
  }
  await ctxs[1]!.close();
});
