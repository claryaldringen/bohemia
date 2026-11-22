import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Divoká zvěř, lovci, psi, rybáři a děti s řehtačkou ve scéně (wildlife.md – Ve scéně) na
// vývojové ukázce vsi (/dev/landscape). Ukázka v produkčním buildu e2e testů není (404), test
// proto běží jen s `WILDLIFE_DEV_URL` (adresa vývojového serveru, např. http://localhost:3014),
// jinak se přeskočí. `WILDLIFE_SHOTS=<složka>` uloží malé snímky (výřez 800 × 500).
const DEV_URL = process.env.WILDLIFE_DEV_URL;
const SHOTS_DIR = process.env.WILDLIFE_SHOTS;

test.skip(!DEV_URL, 'vyžaduje vývojový server (WILDLIFE_DEV_URL)');
test.describe.configure({ timeout: 600_000 });
test.use({ reducedMotion: 'no-preference', viewport: { width: 1280, height: 800 } });

interface Spot {
  x: number;
  z: number;
}
interface DevScene {
  setVillage(village: object): void;
  setWorkDayClock(clock: ((day: number) => { startMs: number; endMs: number }) | null): void;
  moveCameraTo(x: number, z: number): void;
  wildAnimals(): {
    meshes: { name: string; ready: boolean }[];
    animals: { species: string; model: string; x: number; z: number }[];
  };
  villageState: {
    labor?: {
      lord?: { home: number; riders: { id: number; horseId: number }[] };
      shares: object[];
      persons?: { id: number; age: number }[];
    };
    dwellings: { id: number; position: Spot }[];
    fields: { parts: { id: number; x: number; z: number }[] }[];
  } | null;
  landscape: {
    size: number;
    cellSizeM: number;
    stream: { x: number; y: number; halfWidthLeft: number; halfWidthRight: number }[];
  };
  rtsCamera: { camera: { radius: number; lowerRadiusLimit: number | null; beta: number } };
}
type DevWindow = Window & { __bohemiaDev?: { scene: DevScene }; __fixedNow?: number };

/** Hodiny stránky na hodinu `hour` pracovního dne ukázky (0–86 s). */
async function setHour(page: Page, hour: number): Promise<void> {
  await page.evaluate((h) => {
    (window as unknown as DevWindow).__fixedNow = (h / 24) * 86_000;
  }, hour);
  await page.waitForTimeout(900);
}

/** Kamera nad bod, přiblížení a snímek výřezu 800 × 500 uprostřed. */
async function shot(page: Page, name: string, at: Spot | null, radius = 30): Promise<void> {
  if (at) {
    await page.evaluate(
      ({ p, r }) => {
        const scene = (window as unknown as DevWindow).__bohemiaDev!.scene;
        scene.moveCameraTo(p.x, p.z);
        scene.rtsCamera.camera.lowerRadiusLimit = 0;
        scene.rtsCamera.camera.radius = r;
      },
      { p: at, r: radius },
    );
  }
  await page.waitForTimeout(1500);
  if (!SHOTS_DIR) return;
  await page.screenshot({
    path: `${SHOTS_DIR}/${name}.png`,
    clip: { x: 240, y: 150, width: 800, height: 500 },
  });
}

for (const renderer of ['webgl', 'webgpu'] as const) {
  test(`zvěř, lovci, psi a rybáři ve scéně ukázky (${renderer})`, async ({ page }) => {
    if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript((gpu) => {
      if (!gpu) Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
      const w = window as unknown as DevWindow;
      const real = Date.now.bind(Date);
      Date.now = (): number => w.__fixedNow ?? real();
    }, renderer === 'webgpu');
    await page.goto(`${DEV_URL}/dev/landscape`, { waitUntil: 'networkidle', timeout: 180_000 });
    const canvas = page.locator('canvas[data-scene]');
    await expect(canvas).toHaveAttribute('data-renderer', /webgl|webgpu/, { timeout: 120_000 });
    const used = await canvas.getAttribute('data-renderer');
    test.info().annotations.push({ type: 'renderer', description: used ?? '?' });

    // ukázková ves s lidmi, červenec (den roku 200 – zrání), den 86 s
    await page.getByRole('button', { name: 'Natočené stavby' }).click({ timeout: 120_000 });
    await page.waitForTimeout(3000);
    await page.getByTestId('dev-season-day').fill('200');
    await page.evaluate(() => {
      (window as unknown as DevWindow).__bohemiaDev!.scene.setWorkDayClock(() => ({
        startMs: 0,
        endMs: 86_000,
      }));
    });
    await page.getByTestId('dev-people').click();
    await page.waitForFunction(
      () => !!(window as unknown as DevWindow).__bohemiaDev?.scene.villageState?.labor?.lord,
      undefined,
      { timeout: 120_000 },
    );
    await setHour(page, 2);

    // zvěř, lov, psi, hlídka a rybáři dne – jako je posílá server (SceneWildlife)
    const focus = await page.evaluate(() => {
      const scene = (window as unknown as DevWindow).__bohemiaDev!.scene;
      const v = scene.villageState!;
      const lord = v.labor!.lord!;
      const parts = v.fields.flatMap((f) => f.parts);
      const l = scene.landscape;
      const half = (l.size * l.cellSizeM) / 2;
      const home =
        v.dwellings.find((d) => d.id === lord.home)?.position ?? v.dwellings[0]!.position;
      // tůň: nejširší bod potoka do 400 m od dvorce
      let pool: object | null = null;
      let best = -1;
      l.stream.forEach((p, k) => {
        const x = -half + (p.x + 0.5) * l.cellSizeM;
        const z = -half + (p.y + 0.5) * l.cellSizeM;
        const width = p.halfWidthLeft + p.halfWidthRight;
        if (Math.hypot(x - home.x, z - home.z) > 400 || width <= best) return;
        const n = l.stream[Math.min(l.stream.length - 1, k + 1)]!;
        const fx = n.x - p.x || 1;
        const fz = n.y - p.y;
        const d = Math.hypot(fx, fz);
        best = width;
        pool = {
          x,
          z,
          flowX: fx / d,
          flowZ: fz / d,
          halfLeft: p.halfWidthLeft * l.cellSizeM,
          halfRight: p.halfWidthRight * l.cellSizeM,
        };
      });
      // rybáři dne – podíl práce `fish` u první tůně (jako ho posílá server)
      const shares = v.labor!.shares;
      const fish = { ...shares[0], activity: 'fish', target: { kind: 'pool', index: 0 } };
      // ukázková ves má 9 lidí – všichni mají práci a na rybáře a děti s řehtačkou nikdo
      // nezbude; trojnásobek dospělých a výrostků z týchž domů
      const persons = v.labor!.persons ?? [];
      const extra = [500, 600, 700].flatMap((o) =>
        persons.filter((q) => q.age >= 7 && q.age < 45).map((q) => ({ ...q, id: q.id + o })),
      );
      scene.setVillage({
        ...v,
        labor: {
          ...v.labor,
          // pěší lovec nemá koně – v objížďce jezdců by místo lovu cvičil
          lord: { ...lord, riders: lord.riders.slice(1) },
          persons: [...persons, ...extra],
          shares: pool ? [...shares, fish] : shares,
        },
        wildlife: {
          shown: {
            stags: 2,
            hinds: 6,
            calves: 3,
            boars: 5,
            piglets: 4,
            hares: 4,
            foxes: 1,
            wolves: 3,
            bears: 1,
          },
          month: 7,
          topPartId: parts[0]?.id,
          crowFlocks: 2,
          fishShare: 0.8,
          hunt: {
            target: 'game',
            riders: lord.riders.slice(1),
            foot: lord.riders.slice(0, 1).map((r) => r.id),
            kills: 1,
          },
          dogs: 5,
          watchParts: parts.slice(1, 3).map((p) => p.id),
          ...(pool ? { pools: [pool] } : {}),
        },
      });
      return { home, part: parts[0] ?? null, watch: parts[1] ?? null, pool };
    });

    // modely zvěře se načtou
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const wild = (window as unknown as DevWindow).__bohemiaDev!.scene.wildAnimals();
            return wild.meshes.length > 0 && wild.meshes.every((m) => m.ready)
              ? wild.animals.length
              : 0;
          }),
        { timeout: 120_000 },
      )
      .toBeGreaterThan(0);
    const animals = await page.evaluate(
      () => (window as unknown as DevWindow).__bohemiaDev!.scene.wildAnimals().animals,
    );
    const of = (model: string): Spot | null => animals.find((a) => a.model === model) ?? null;
    const p = `${renderer}-`;
    await shot(page, `${p}1-jeleni`, of('wild-hind') ?? of('wild-stag'), 70);
    await shot(page, `${p}2-prasata`, of('wild-boar'), 28);
    await shot(page, `${p}3-prasata-dil`, focus.part, 45);
    await shot(page, `${p}4-zajic`, of('wild-hare'), 10);
    // psi u dvorce (2 h)
    await shot(page, `${p}5-psi-dvorec`, focus.home, 40);
    await setHour(page, 10);
    await shot(page, `${p}9-rybari`, focus.pool as Spot | null, 70);
    // první rybář stojí na levém břehu tůně (anglerSpot) – výřez břehu s vodou
    const pool = focus.pool as {
      x: number;
      z: number;
      flowX: number;
      flowZ: number;
      halfLeft: number;
    } | null;
    if (pool) {
      const d = pool.halfLeft - 6;
      await shot(
        page,
        `${p}9b-rybar-breh`,
        { x: pool.x - pool.flowZ * d, z: pool.z + pool.flowX * d },
        40,
      );
    }
    await shot(page, `${p}10-rehtacka`, focus.watch, 30);
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });
}
