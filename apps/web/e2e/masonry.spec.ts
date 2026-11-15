import { test, expect } from '@playwright/test';
import { openDevTime } from './helpers';
import {
  checkChurchPlacement,
  defaultChurchDims,
  nearestOutcrop,
  obstaclesOf,
  orderQuarrying,
  placementVillageOf,
  quarrySiteNear,
  type Position,
} from '@bohemia/game';
import {
  around,
  changeVillageState,
  confirmPlacement,
  found,
  newPlayer,
  pollVillage,
  query,
  readyScene,
  villageIdOf,
  villageSpots,
  villageState,
} from './village-helpers';

// Stavební huť a kostel (stone-masonry.md, churches.md; plán 2026-11-11 – M9): pokřtěný rod pozve
// karolinskou huť, skok v čase přivede mistry, ves dostane lom a hráč umístí rotundu.
test('pozvání huti a umístění kostela – křest, huť na cestě, skok v čase, mistři, rotunda', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const { email, seat: s } = await newPlayer(page, 'hut');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);

  // rod zná křesťanství a vojvoda se dá pokřtít (pozvání huti chce pokřtěný rod)
  await query(
    `UPDATE house SET christianity_known_year = 520
      WHERE ended_at IS NULL AND player_id = (SELECT id FROM "user" WHERE email = $1)`,
    [email],
  );
  // zápis vsi zvýší verzi – dotaz na ves pak nevrátí starý pohled bez tlačítka křtu
  await changeVillageState(s.settlementId, (state) => state);
  const lordId = (await villageState(s.settlementId)).dynasty!.lordId!;
  await page.waitForFunction(() => typeof window.__bohemiaE2E?.pollVillage === 'function', null, {
    timeout: 120_000,
  });
  const selection = page.getByTestId('selection-panel');
  const baptize = selection.getByTestId('selection-person-baptize');
  await expect
    .poll(
      async () => {
        await pollVillage(page);
        await page.evaluate((id) => window.__bohemiaE2E!.selectPerson!(id), lordId);
        return baptize.isVisible();
      },
      { timeout: 90_000, intervals: [1_500] },
    )
    .toBe(true);
  await baptize.click();
  await page.getByTestId('baptize-confirm').click();
  await expect
    .poll(
      async () =>
        (
          await query<{ b: number | null }>(
            `SELECT h.baptized_day AS b FROM house h JOIN "user" u ON u.id = h.player_id
              WHERE u.email = $1 AND h.ended_at IS NULL`,
            [email],
          )
        )[0]?.b ?? null,
    )
    .not.toBeNull();

  // ves vojvody se pokřtí až na začátku svého dne – zpráva o křtu se přesune na dnešek a ves se vrátí
  // o den, ať křest dopočte hned (jako v testu křtu rodu)
  const villageId = await villageIdOf(s.settlementId);
  await query(
    `UPDATE village_inbox SET day = day - 1
      WHERE village_id = $1 AND body->>'kind' = 'rod-baptized'`,
    [villageId],
  );
  await changeVillageState(s.settlementId, (state) => ({ ...state, lastDay: state.lastDay - 1 }));

  // pozvání huti: ikona u vojvody → okno okruhů → karolinský okruh
  const invite = selection.getByTestId('selection-person-invite-lodge');
  await expect
    .poll(
      async () => {
        await pollVillage(page);
        await page.evaluate((id) => window.__bohemiaE2E!.selectPerson!(id), lordId);
        return (
          (await invite.isVisible()) && (await invite.getAttribute('aria-disabled')) !== 'true'
        );
      },
      { timeout: 90_000, intervals: [1_500] },
    )
    .toBe(true);
  await invite.click();
  const dialog = page.getByTestId('lodge-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('lodge-circle')).toHaveCount(2);
  await dialog.locator('[data-testid="lodge-circle"][data-circle="carolingian"]').click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await villageState(s.settlementId)).lodge?.circle ?? null)
    .toBe('carolingian');
  await expect
    .poll(
      async () => {
        await page.evaluate((id) => window.__bohemiaE2E!.selectPerson!(id), lordId);
        return selection.getByTestId('selection-person-lodge-days').count();
      },
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBeGreaterThan(0);
  await expect(selection.getByTestId('selection-person-lodge-days')).toHaveText(/\d/);

  // skok v čase o 2 měsíce (60 dní) – mistři dorazí
  await query('UPDATE "user" SET dev_mode = true WHERE email = $1', [email]);
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 120_000 });
  await openDevTime(page);
  const skip = page.getByTestId('dev-skip-month');
  for (let i = 0; i < 2; i++) {
    await skip.click();
    await expect(skip).toBeEnabled({ timeout: 120_000 });
  }
  const masonsOf = async (): Promise<number> =>
    (await villageState(s.settlementId)).people.filter((p) => p.mason !== undefined).length;
  await expect.poll(masonsOf, { timeout: 60_000, intervals: [1_000] }).toBe(5);
  await pollVillage(page);

  // ves nemá lom – dostavěný lom do stavu: plocha u nejbližšího skalního výchozu podle pravidel
  // hráče (Lom jako plocha u skal – `quarrySiteNear`); krajina bez výchozu – lom 150 m od zemnice
  // jako zápis stavu v jiných testech
  const dwelling = spots.dwelling;
  const rocks = obstaclesOf(s.landscape);
  const before = await villageState(s.settlementId);
  const outcrop = nearestOutcrop(rocks, dwelling, 5000);
  const area = outcrop
    ? quarrySiteNear(
        s.landscape,
        placementVillageOf(before, before.lastDay),
        rocks,
        outcrop,
        dwelling,
      )
    : null;
  await changeVillageState(s.settlementId, (state) => ({
    ...state,
    quarries: [
      area
        ? {
            outcropId: area.check.outcrop!.id,
            ...area.position,
            builtDay: state.lastDay - 10,
            rock: area.check.rock!,
          }
        : {
            outcropId: 999_999,
            x: dwelling.x + 150,
            z: dwelling.z,
            rotation: 0,
            builtDay: state.lastDay - 10,
          },
    ],
  }));
  await pollVillage(page);

  // rotunda (velký kostel karolinského okruhu) – volné místo ověřené stejnou kontrolou jako server
  const state = await villageState(s.settlementId);
  const dims = defaultChurchDims('rotunda');
  const village = placementVillageOf(state, state.lastDay);
  let spot: Position | null = null;
  for (const p of around(dwelling.x, dwelling.z, 240)) {
    if (Math.hypot(p.x - dwelling.x, p.z - dwelling.z) < 40) continue;
    if (checkChurchPlacement(s.landscape, village, 'rotunda', dims, p).ok) {
      spot = p;
      break;
    }
  }
  expect(spot).not.toBeNull();

  await page.mouse.move(640, 360);
  // běžící umisťování zemnice (z založení vsi) se zruší, pak klávesa kostela
  await page.keyboard.press('Escape');
  const rotunda = page
    .getByTestId('build-grid')
    .getByRole('button', { name: 'Rotunda se dvěma apsidami' });
  await expect(rotunda).toBeEnabled();
  await page.keyboard.press('y');
  await confirmPlacement(page, { kind: 'church', type: 'rotunda', dims, position: spot! });

  await expect
    .poll(
      async () =>
        (await villageState(s.settlementId)).constructions.filter((c) => c.kind === 'church')
          .length,
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(1);
  const site = (await villageState(s.settlementId)).constructions.find((c) => c.kind === 'church');
  expect(site?.church?.type).toBe('rotunda');

  // snímek lomu u skal po měsíci stavby (jen na požádání – QUARRY_SHOT=cesta.png)
  const shot = process.env.QUARRY_SHOT;
  const quarry = (await villageState(s.settlementId)).quarries?.[0];
  if (shot && quarry) {
    // měsíc stavby navíc – lámání pro kostel už běží (panel času zavřel Escape při umisťování)
    test.setTimeout(900_000);
    // zakázky „nalámat do zásoby“ – ať v lomu po měsíci ještě lámou a nosí bloky
    await changeVillageState(s.settlementId, (state) => {
      let next = state;
      for (let k = 0; k < 3; k++) {
        const ordered = orderQuarrying(next, next.lastDay, quarry.outcropId, 200);
        if (ordered.ok) next = ordered.state;
      }
      return next;
    });
    await openDevTime(page);
    await skip.click();
    await expect(skip).toBeEnabled({ timeout: 180_000 });
    await pollVillage(page);
    await page.evaluate((p) => window.__bohemiaE2E!.moveCameraTo!(p[0], p[1]), [
      quarry.x,
      quarry.z,
    ] as [number, number]);
    await page.mouse.move(640, 300);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: shot, clip: { x: 320, y: 140, width: 640, height: 400 } });
  }
});
