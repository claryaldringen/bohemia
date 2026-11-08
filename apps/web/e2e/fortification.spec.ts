import { test, expect, type Page } from '@playwright/test';
import {
  finishFortification,
  fortSections,
  fortSegments,
  fortificationOutline,
  obstaclesOf,
  outlineOf,
  proposeFortification,
  startFortification,
  villageFortifications,
  type Landscape,
  type Road,
  type VillageState,
} from '@bohemia/game';
import { useUniqueClientIp } from './helpers';
import {
  found,
  newPlayer,
  pollVillage,
  villageSpots,
  villageState,
  withBuiltFirstDwelling,
  writeVillageState,
} from './village-helpers';

// Opevnění v rozhraní (fortifications.md – Obvod, Rozhraní): hráč v mřížce staveb otevře
// rozcestník a vybere palisádu – hra navrhne obvod s body kolem jádra vsi. Hráč bod táhne (cena
// u kurzoru se mění), klik na obvod přidá bod, Ctrl + klik ho ubere, ikona kladiva položí; brány
// vzniknou na cestě a panel ukáže délku a brány. Posun bodu přes zemnici ukáže důvod a červené
// místo problému, Esc návrh zahodí. Zboření úseku (demolition.md – Opevnění): klik na obvod
// zvýrazní úsek mezi branami, Zbořit založí bourání, po dokončení je úsek mezera.

test.beforeEach(async ({ context, page }) => {
  await useUniqueClientIp(context);
  // snímky zboření (FORT_DEMOLISH_SHOT) s modely plotu, jinak bez nich (rychlejší kreslení)
  if (!process.env.FORT_DEMOLISH_SHOT) await page.route('**/models/**', (route) => route.abort());
});

test.describe.configure({ timeout: 180_000 });

type Pt = readonly [number, number];

/** Bod krajiny na obrazovce (CSS px). */
async function screenOf(page: Page, p: Pt): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    (q) => window.__bohemiaE2E!.projectToScreen!(q[0], q[1]),
    p as [number, number],
  );
  expect(point).not.toBeNull();
  return point!;
}

/** Body návrhu, který hráč upravuje (prázdné – návrh ještě není). */
async function fortPoints(page: Page): Promise<Pt[]> {
  return page.evaluate(() => window.__bohemiaE2E!.fortPoints?.() ?? []);
}

/** Táhne bod `from` do `to` (stisk, tah, puštění – jako trackpad). */
async function drag(page: Page, from: Pt, to: Pt): Promise<void> {
  const a = await screenOf(page, from);
  const b = await screenOf(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

/**
 * Hráč se zemnicí, pevnou cestou přes její střed (z západu na východ) a kládami; pohled na ves
 * oddálený, ať je obvod celý v záběru. Vrátí stav a střed zemnice.
 */
async function villageWithRoad(
  page: Page,
  name: string,
): Promise<{
  settlementId: string;
  state: VillageState;
  home: Pt;
  landscape: Landscape;
  showVillage: () => Promise<void>;
}> {
  const { seat: s } = await newPlayer(page, name);
  await found(page, villageSpots(s.landscape).dwelling);
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  state.woodLogs = 600;
  const d = state.dwellings[0]!;
  const sq = d.plot?.square;
  const home: Pt = sq ? [sq.x, sq.z] : [d.position.x, d.position.z];
  const road: Road = {
    id: state.nextId++,
    points: [
      { x: home[0] - 60, z: home[1] },
      { x: home[0] + 60, z: home[1] },
    ],
    bornDay: state.lastDay,
    grade: 'improved',
    traffic: [],
    spots: [],
  };
  state.roads = { ...(state.roads ?? { roads: [] }), roads: [road] } as VillageState['roads'];
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);
  // kolečkem se oddálí (u okraje okna by se kamera posouvala) – kamera po zoomu ještě dojíždí
  const showVillage = async (): Promise<void> => {
    await page.keyboard.press('r');
    await page.mouse.move(640, 360);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 400);
    await page.waitForTimeout(800);
  };
  await showVillage();
  // stejný návrh spočte i server (jádro) – v uložené vsi musí projít
  const proposal = proposeFortification(
    state,
    state.lastDay,
    s.landscape,
    obstaclesOf(s.landscape),
    'palisade',
    { x: home[0], z: home[1] },
  );
  expect(proposal.check.reason).toBeNull();
  return { settlementId: s.settlementId, state, home, landscape: s.landscape, showVillage };
}

/** P otevře rozcestník, palisáda spustí návrh; kurzor nad scénou ho ukáže. */
async function startPalisade(page: Page): Promise<Pt[]> {
  const grid = page.getByTestId('build-grid');
  await page.keyboard.press('p');
  await expect(grid).toHaveAttribute('data-group', 'fortification');
  await grid.getByRole('button', { name: 'Palisáda' }).click();
  await page.mouse.move(640, 360);
  await page.mouse.move(650, 365);
  await expect.poll(async () => (await fortPoints(page)).length).toBeGreaterThanOrEqual(4);
  return fortPoints(page);
}

/** Přiblíží ves – body obvodu jdou chytit a klik na obvod netrefí bod (kamera ještě dojíždí). */
async function closeUp(page: Page, home: Pt): Promise<void> {
  await page.evaluate(
    (p) => window.__bohemiaE2E!.moveCameraTo!(p[0], p[1]),
    home as [number, number],
  );
  await page.mouse.move(640, 300);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1500);
}

/** Těžiště bodů. */
function centroid(points: readonly Pt[]): Pt {
  const n = points.length;
  return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
}

test('návrh palisády kolem vsi – tah bodu mění cenu, klik přidá a Ctrl + klik ubere bod, kladivo položí, brány na cestě, panel', async ({
  page,
}) => {
  const { settlementId, home, showVillage } = await villageWithRoad(page, 'opevneni');
  const points = await startPalisade(page);
  await closeUp(page, home);
  const cost = page.getByTestId('placement-cost');
  await expect(cost.locator('[data-cost="labor"]')).toBeVisible({ timeout: 20_000 });
  await expect(cost.locator('[data-cost="refuge"]')).toBeVisible();
  const logsNow = async (): Promise<number> =>
    Number.parseInt((await cost.locator('[data-cost="logs"]').textContent()) ?? '', 10);
  const before = await logsNow();
  expect(before).toBeGreaterThan(30);

  // snímek obvodu s body (jen na požádání, menší výřez)
  const editShot = process.env.FORT_EDIT_SHOT;
  if (editShot) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: editShot, clip: { x: 240, y: 110, width: 800, height: 500 } });
  }

  // klik doprostřed nejdelšího kusu obvodu přidá bod, Ctrl + klik ho zase ubere
  let longest = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    const r = points[(longest + 1) % points.length]!;
    const l = points[longest]!;
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) > Math.hypot(r[0] - l[0], r[1] - l[1])) longest = i;
  });
  const a = points[longest]!;
  const b = points[(longest + 1) % points.length]!;
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const at = await screenOf(page, mid);
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await fortPoints(page)).length).toBe(points.length + 1);
  const added = (await fortPoints(page))[longest + 1]!;
  const there = await screenOf(page, added);
  await page.keyboard.down('Control');
  await page.mouse.click(there.x, there.y);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await fortPoints(page)).length).toBe(points.length);

  // tah bodu s nejdelšími kusy k sousedům o 4 m ven – obvod i cena porostou (ohyb zůstane mírný)
  const laborNow = async (): Promise<number> =>
    Number.parseInt((await cost.locator('[data-cost="labor"]').textContent()) ?? '', 10);
  const laborBefore = await laborNow();
  const gapOf = (i: number): number => {
    const p = points[i]!;
    return Math.min(
      ...[points[(i + points.length - 1) % points.length]!, points[(i + 1) % points.length]!].map(
        (q) => Math.hypot(q[0] - p[0], q[1] - p[1]),
      ),
    );
  };
  let pick = 0;
  points.forEach((_, i) => {
    if (gapOf(i) > gapOf(pick)) pick = i;
  });
  const c = centroid(points);
  const from = points[pick]!;
  const len = Math.hypot(from[0] - c[0], from[1] - c[1]);
  const out: Pt = [from[0] + ((from[0] - c[0]) / len) * 4, from[1] + ((from[1] - c[1]) / len) * 4];
  await drag(page, from, out);
  await expect.poll(laborNow, { timeout: 10_000 }).toBeGreaterThan(laborBefore);
  expect(await logsNow()).toBeGreaterThanOrEqual(before);
  const moved = (await fortPoints(page))[pick]!;
  expect(Math.hypot(moved[0] - out[0], moved[1] - out[1])).toBeLessThan(2);

  // ikona kladiva položí – brány samy na obou průsečících cesty s obvodem
  await page.getByTestId('fort-confirm').click();
  await expect
    .poll(async () => (await villageState(settlementId)).fortifications?.length ?? 0, {
      timeout: 20_000,
    })
    .toBe(1);
  const fort = (await villageState(settlementId)).fortifications![0]!;
  expect(fort.kind).toBe('palisade');
  expect(fort.points).toHaveLength(points.length);
  expect(fort.gates).toHaveLength(2);
  await expect(page.getByTestId('fort-confirm')).toHaveCount(0);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);

  // klik na obvod vybere opevnění – panel ukáže délku a brány; bod pásu na západě (0,75 m uvnitř)
  const outline = fortificationOutline(fort.points!, 'palisade')!;
  const west = outline.polyline.reduce((w, p) => (p[0] < w[0] ? p : w));
  await pollVillage(page);
  await showVillage();
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        const edge = await page.evaluate((p) => window.__bohemiaE2E!.projectToScreen!(p[0], p[1]), [
          west[0] + 0.75,
          west[1],
        ] as [number, number]);
        if (!edge) return null;
        await page.mouse.move(edge.x + 2, edge.y);
        await page.mouse.click(edge.x, edge.y);
        return panel.getAttribute('data-kind', { timeout: 500 }).catch(() => null);
      },
      { timeout: 30_000 },
    )
    .toBe('fortification');
  const length = Number.parseInt(
    (await panel.getByTestId('selection-fort-length').textContent()) ?? '',
    10,
  );
  expect(Math.abs(length - outline.lengthM)).toBeLessThan(2);
  await expect(panel.getByTestId('selection-fort-gates')).toHaveText('2');
  await expect(panel.getByTestId('selection-fort-progress')).toBeVisible();

  // snímek dev vsi s vybraným obvodem a otevřeným panelem (jen na požádání)
  const shot = process.env.FORT_UI_SHOT;
  if (shot) {
    await page.evaluate(
      (p) => window.__bohemiaE2E!.moveCameraTo!(p[0], p[1]),
      home as [number, number],
    );
    await page.mouse.move(640, 300);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot });
  }
});

test('bod tažený přes zemnici – důvod u kurzoru, červené místo problému, kladivo zašedlé, Esc návrh zahodí', async ({
  page,
}) => {
  const { home } = await villageWithRoad(page, 'opevneni-problem');
  const points = await startPalisade(page);
  await closeUp(page, home);
  await expect(page.getByTestId('placement-cost').locator('[data-cost="labor"]')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('fort-confirm')).toHaveAttribute('aria-disabled', 'false');
  // nejsevernější bod do středu zemnice – obvod vede přes obydlí (nebo se ostře ohne či kříží)
  await drag(page, points[0]!, home);
  await expect(page.getByRole('status').filter({ hasText: /obydlí|ohyb|křížit/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(() => page.evaluate(() => window.__bohemiaE2E!.paintProblems?.() ?? 0))
    .toBeGreaterThan(0);
  await expect(page.getByTestId('fort-confirm')).toHaveAttribute('aria-disabled', 'true');

  const shot = process.env.FORT_HINT_SHOT;
  if (shot) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot, clip: { x: 240, y: 110, width: 800, height: 500 } });
  }

  // Esc návrh zahodí – žádné body ani kladivo
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('fort-confirm')).toHaveCount(0);
  await expect.poll(async () => (await fortPoints(page)).length).toBe(0);
});

test('zboření úseku plotu mezi dvěma branami – klik zvýrazní úsek, Zbořit, po dokončení mezera', async ({
  page,
}) => {
  // celý průběh od založení vsi po mezeru – delší než ostatní testy opevnění
  test.setTimeout(300_000);
  const { settlementId, state, home, landscape } = await villageWithRoad(page, 'zboreni');
  // hotový polský plot z návrhu kolem vsi – brány samy na obou průsečících cesty
  const proposal = proposeFortification(
    state,
    state.lastDay,
    landscape,
    obstaclesOf(landscape),
    'fence',
    { x: home[0], z: home[1] },
  );
  const started = startFortification(state, state.lastDay, landscape, obstaclesOf(landscape), {
    points: proposal.points,
    kind: 'fence',
  });
  if (!started.ok) throw new Error(started.reason);
  const built = started.state;
  built.constructions = built.constructions.filter((c) => c.kind !== 'fortification');
  const fort = villageFortifications(built)[0]!;
  for (const seg of fort.segments) {
    seg.builtDay = built.lastDay;
    seg.state = 1;
  }
  expect(fort.gates).toHaveLength(2);
  await writeVillageState(settlementId, built);
  const sections = fortSections(fort);
  expect(sections).toHaveLength(2);
  // delší úsek, díl uprostřed něj; středy dílů na vnějším okraji
  const section = sections.reduce((a, b) => (b.segments.length > a.segments.length ? b : a));
  const inner = section.segments.filter((i) => i !== section.gateSegment);
  const target = inner[Math.floor(inner.length / 2)]!;
  const shapes = fortSegments(outlineOf(landscape, fort)!);
  const mids = shapes.map((x): Pt => [x.mid[0], x.mid[1]]);
  const c = centroid(mids);
  const m = mids[target]!;
  const len = Math.hypot(c[0] - m[0], c[1] - m[1]);
  const spot: Pt = [m[0] + ((c[0] - m[0]) / len) * 0.3, m[1] + ((c[1] - m[1]) / len) * 0.3];

  await pollVillage(page);
  await closeUp(page, spot);
  const panel = page.getByTestId('selection-panel');
  let clickAt = { x: 0, y: 0 };
  await expect
    .poll(
      async () => {
        clickAt = await screenOf(page, spot);
        await page.mouse.move(clickAt.x + 2, clickAt.y);
        await page.mouse.click(clickAt.x, clickAt.y);
        return panel.getAttribute('data-kind', { timeout: 500 }).catch(() => null);
      },
      { timeout: 30_000 },
    )
    .toBe('fortification');

  // zvýrazněný je jen pás úseku – u středů jeho dílů, daleko od dílů druhého úseku
  const lines = await page.evaluate(() => window.__bohemiaE2E!.selectionOutline?.() ?? []);
  expect(lines.length).toBeGreaterThan(0);
  const nearest = (p: Pt): number =>
    Math.min(...lines.flat().map(([x, z]) => Math.hypot(x - p[0], z - p[1])));
  for (const i of inner) expect(nearest(mids[i]!)).toBeLessThan(3);
  const other = sections.find((x) => x !== section)!;
  for (const i of other.segments) expect(nearest(mids[i]!)).toBeGreaterThan(3);

  const demolish = panel.getByTestId('fort-demolish');
  await expect(demolish).toBeEnabled();
  await demolish.hover();
  await expect(page.getByTestId('fort-demolish-logs')).toBeVisible();
  const shot = process.env.FORT_DEMOLISH_SHOT;
  const clip = { x: 300, y: 240, width: 680, height: 480 };
  if (shot) await page.screenshot({ path: `${shot}-selected.png`, clip });
  await demolish.click();
  await expect
    .poll(
      async () =>
        (await villageState(settlementId)).constructions.find((x) => x.kind === 'fortification')
          ?.fortWork ?? null,
      { timeout: 20_000 },
    )
    .toBe('demolish');
  await expect(panel.getByRole('progressbar', { name: 'Bourání' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);

  // bourání doběhne (jádro – jako po dnech práce vsi): díly úseku bez brány jsou zbořené
  const now = await villageState(settlementId);
  const work = now.constructions.find((x) => x.kind === 'fortification')!;
  expect(work.fortSegments!.map((w) => w.index)).toEqual(inner);
  work.done = work.cost;
  finishFortification(now, work, now.lastDay);
  now.constructions = now.constructions.filter((x) => x.id !== work.id);
  await writeVillageState(settlementId, now);
  await pollVillage(page);
  const gone = villageFortifications(await villageState(settlementId))[0]!;
  for (const i of inner) {
    expect(gone.segments.find((x) => x.index === i)?.demolishedDay).toBeDefined();
  }
  expect(gone.gates).toHaveLength(2);

  // zbořený díl je mezera – klik na stejné místo opevnění nevybere
  await expect
    .poll(
      async () => {
        await page.mouse.click(clickAt.x, clickAt.y);
        return panel.getAttribute('data-kind', { timeout: 500 }).catch(() => null);
      },
      { timeout: 20_000 },
    )
    .not.toBe('fortification');
  if (shot) {
    await page.mouse.move(20, 20);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${shot}-gap.png`, clip });
  }
});
