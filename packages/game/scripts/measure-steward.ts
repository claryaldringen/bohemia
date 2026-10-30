// Měření správce vsi (steward.md – Ověření kvality):
//   npx tsx packages/game/scripts/measure-steward.ts [vsí] [roky] [volby]
// Výchozí je dlouhý běh 20 vsí × 50 let (5 skupin krajin × 4); krátký ověřovací běh `2 5`.
// Každá ves se změří dvakrát: B = správce od založení, A = skriptovaný hráč (zemnice, kdykoli je
// komu, a 1. 9. pár dílů navíc podle squareValue, když cíl polí nestačí; bez hřbitova a ohrad –
// zjednodušení proti measure-village.ts, srovnání lidí je proto orientační). Měří se rod: odchody
// synů B zakládají vsi v paměti (nejvýš 12 vsí rodu). C (Vlkov) se neměří – žije jen v DB;
// D = horní mez lidí na hektar z lib/steady-state.ts (plná domácnost) pro úrodnost a vzdálenost rodu.
//
// Volby:
//   --out soubor.jsonl   kontrolní bod (jako measure-village.ts) – po přerušení stejný příkaz
//                        dokončí zbytek a tabulku spočítá ze souboru
//   --workers N          worker vláken (výchozí polovina jader)
//   --foreground         běžná priorita (jinak nice 19)
//   --report-only        jen tabulka z hotových úloh v --out
//   --pool N             kolik seedů krajin se prohlíží při výběru skupin (výchozí 60)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { defaultWorkers, lowerProcessPriority, lowerThreadPriority } from './lib/background';
import { appendCheckpoint, openCheckpoint, readCheckpoint } from './lib/checkpoint';
import {
  formatRows,
  landscapeGroups,
  runDynasty,
  summarize,
  villageTasks,
  type DynastyResult,
  type Strategy,
} from './lib/steward-measure';

interface Config {
  villages: number;
  years: number;
  pool: number;
  out: string | null;
  workers: number;
  foreground: boolean;
  reportOnly: boolean;
}

interface Task {
  group: string;
  seed: number;
  strategy: Strategy;
}

const PER_GROUP = 4;

function parseConfig(argv: readonly string[]): Config {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (['foreground', 'report-only'].includes(name)) flags.set(name, true);
    else flags.set(name, argv[++i] ?? '');
  }
  const count = (value: string | true | undefined, fallback: number, label: string): number => {
    if (value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${label}: čekám celé číslo ≥ 1.`);
    return n;
  };
  const out = flags.get('out');
  return {
    villages: count(positional[0], PER_GROUP * 5, 'počet vsí'),
    years: count(positional[1], 50, 'roky'),
    pool: count(flags.get('pool'), 60, '--pool'),
    out: typeof out === 'string' && out !== '' ? out : null,
    workers: count(flags.get('workers'), defaultWorkers(), '--workers'),
    foreground: flags.has('foreground'),
    reportOnly: flags.has('report-only'),
  };
}

const config: Config = isMainThread ? parseConfig(process.argv.slice(2)) : (workerData as Config);
const taskKey = (t: Task): string => `${t.strategy}:${t.seed}`;

function buildTasks(): Task[] {
  const groups = landscapeGroups(Math.max(config.pool, PER_GROUP * 5), PER_GROUP);
  return villageTasks(groups, config.villages).flatMap((v): Task[] => [
    { ...v, strategy: 'steward' },
    { ...v, strategy: 'player' },
  ]);
}

async function runAll(
  tasks: Task[],
  onResult: (result: DynastyResult) => void,
): Promise<DynastyResult[]> {
  const results: DynastyResult[] = [];
  if (tasks.length === 0) return results;
  const workerCount = Math.max(1, Math.min(config.workers, tasks.length));
  let next = 0;
  let running = 0;
  await new Promise<void>((resolve, reject) => {
    const dispatch = (worker: Worker): void => {
      const task = tasks[next];
      if (task === undefined) {
        void worker.terminate();
        if (running === 0) resolve();
        return;
      }
      next++;
      running++;
      worker.postMessage(task);
    };
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: config });
      worker.on('message', (result: DynastyResult) => {
        results.push(result);
        running--;
        onResult(result);
        dispatch(worker);
      });
      worker.on('error', reject);
      dispatch(worker);
    }
  });
  return results;
}

async function main(): Promise<void> {
  const started = performance.now();
  const priority = config.foreground ? 'běžná priorita' : lowerProcessPriority(false);
  const out = config.out;
  if (config.reportOnly && !out) throw new Error('--report-only potřebuje --out soubor.jsonl.');
  const checkpoint = { villages: config.villages, years: config.years, pool: config.pool };
  const tasks = buildTasks();
  const done = !out
    ? new Map<string, DynastyResult>()
    : config.reportOnly
      ? readCheckpoint<DynastyResult>(out, checkpoint)
      : openCheckpoint<DynastyResult>(out, checkpoint);
  const todo = config.reportOnly ? [] : tasks.filter((t) => !done.has(taskKey(t)));
  let finished = tasks.length - todo.length;
  console.error(
    `Správce: ${tasks.length} úloh, hotovo ${finished}, vláken ${Math.min(config.workers, todo.length)}, ${priority}${out ? `, kontrolní bod ${out}` : ''}`,
  );
  const fresh = await runAll(todo, (result) => {
    if (out) appendCheckpoint(out, `${result.strategy}:${result.seed}`, result);
    finished++;
    console.error(
      `[${finished}/${tasks.length}] ${result.strategy}:${result.seed} (${((performance.now() - started) / 1000).toFixed(0)} s)`,
    );
  });
  const results = out
    ? [...readCheckpoint<DynastyResult>(out, checkpoint).values()]
    : [...done.values(), ...fresh];
  const villages = new Set(results.map((r) => r.seed)).size;
  console.log(
    `Vzorek: ${villages} vsí × ${config.years} let, skupiny krajin: ${[...new Set(results.map((r) => r.group))].join(', ')}`,
  );
  console.log(formatRows(summarize(results)));
  for (const r of results.sort((a, b) => a.seed - b.seed || a.strategy.localeCompare(b.strategy))) {
    console.log(
      `  ${r.strategy === 'steward' ? 'B' : 'A'} ${r.group.padEnd(8)} seed ${String(r.seed).padStart(3)}: lidé ${r.snapshots.map((s) => `${s.year}→${s.people}`).join(' ')}, vsí ${r.villages}, hladem ${r.hungerDeaths}, pole ${r.fieldHa.toFixed(1)} ha`,
    );
  }
  console.log(`Čas: ${((performance.now() - started) / 1000).toFixed(1)} s`);
}

if (isMainThread) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
} else {
  if (!config.foreground) lowerThreadPriority();
  parentPort?.on('message', (task: Task) =>
    parentPort?.postMessage(
      runDynasty({
        group: task.group,
        seed: task.seed,
        strategy: task.strategy,
        years: config.years,
      }),
    ),
  );
}
