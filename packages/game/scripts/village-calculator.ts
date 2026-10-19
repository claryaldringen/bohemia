// Kalkulačka ustáleného stavu vsi – okamžitá čísla bez simulace (vzorce z rules.ts, jádro
// v lib/steady-state.ts): npx tsx packages/game/scripts/village-calculator.ts [volby]
//
//   --preset start|full    startovní domácnost (2 dospělí, 2 děti 7–13), nebo plná (4 dospělí,
//                          2 malé děti); výchozí start
//   --adults N --elders N --children N (7–13 let) --small N (do 7 let)   složení místo presetu
//   --households N         stejných domácností ve vsi (výchozí 1)
//   --fertility N          přirozená úrodnost dílů (výchozí 70)
//   --distance M           průměrná vzdálenost dílů od obydlí (výchozí 100 m)
//   --forest M             obydlí – okraj lesa (výchozí 50 m, palivo bez přirážky)
//   --dwelling zemnice|polozemnice   (výchozí zemnice)
//   --orchard HA           sad v plné úrodě (výchozí 0)
//   --no-reserve           osev jen na potřebu (bez ztrát skladováním a pojistky zásob)
//   --field-share S        podíl jídla z pole 0–1 (osev podle stravy – fields.md, Kolik ves
//                          oseje; kalibrace vypíše změřený podíl); výchozí 1 = ves jí jen obilí
//
// Vypíše osev, pole s přílohem, práci po měsících (pole, opravy, domácí výroba, společná práce),
// rezervy ve špičkách, dřevo a sad. Dobytek a seno zatím pravidla nemají.
import {
  ROTATION,
  ROTATION_FACTOR,
  equilibriumStores,
  foodNeedKg,
  harvestForStores,
  maxSownHa,
  steadyState,
  type Household,
  type SteadyInput,
} from './lib/steady-state';
import {
  FIELD_STORES,
  NO_CRAFTS,
  bufferKg,
  steadyHarvestKg,
  storesTargetKg,
  type DwellingType,
  type TaskName,
} from '../src/domain/village';

const PRESETS: Record<string, Household> = {
  start: { adults: 2, elders: 0, olderChildren: 2, smallChildren: 0 },
  full: { adults: 4, elders: 0, olderChildren: 0, smallChildren: 2 },
};
const MONTH_NAMES = [
  '',
  'led',
  'úno',
  'bře',
  'dub',
  'kvě',
  'čvn',
  'čvc',
  'srp',
  'zář',
  'říj',
  'lis',
  'pro',
];
const TASK_LABELS: Record<TaskName, string> = {
  reclaim: 'vrác.',
  dig: 'kopání',
  sow: 'setí',
  weed: 'pletí',
  harvest: 'sklizeň',
  thresh: 'výmlat',
};

function parseArgs(argv: string[]): SteadyInput {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) throw new Error(`Neznámý argument ${arg}.`);
    const name = arg.slice(2);
    if (name === 'no-reserve') {
      flags.set(name, 'true');
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`Volba --${name} potřebuje hodnotu.`);
    flags.set(name, value);
    i++;
  }
  const number = (name: string, fallback: number): number => {
    const raw = flags.get(name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} musí být číslo ≥ 0.`);
    return value;
  };
  const preset = PRESETS[flags.get('preset') ?? 'start'];
  if (!preset) throw new Error(`Neznámý preset ${flags.get('preset')} (start, full).`);
  const dwelling = (flags.get('dwelling') ?? 'zemnice') as DwellingType;
  if (dwelling !== 'zemnice' && dwelling !== 'polozemnice') {
    throw new Error('--dwelling je zemnice nebo polozemnice.');
  }
  return {
    household: {
      adults: number('adults', preset.adults),
      elders: number('elders', preset.elders),
      olderChildren: number('children', preset.olderChildren),
      smallChildren: number('small', preset.smallChildren),
    },
    households: Math.max(1, Math.round(number('households', 1))),
    fertility: number('fertility', 70),
    distanceM: number('distance', 100),
    forestDistanceM: number('forest', 50),
    dwelling,
    orchardHa: number('orchard', 0),
    reserve: !flags.has('no-reserve'),
    fieldShare: Math.min(1, number('field-share', 1)),
  };
}

const fmt = (v: number, digits = 1): string =>
  Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '–';
const pct = (v: number): string => `${fmt(v * 100, 0)} %`;

function table(rows: string[][]): string {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows
    .map((r) =>
      r
        .map((cell, i) => (i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!)))
        .join('  '),
    )
    .join('\n');
}

/**
 * Zásoby z pole po sklizni v ročních potřebách z pole, když ves seje podle zásob a má je na
 * pojistce: úroda rok co rok + pojistka (z roční potřeby celé energie).
 */
function steadyStores(needKg: number, input: SteadyInput): number {
  const buffer = bufferKg(foodNeedKg(input.household) * input.households);
  return needKg > 0
    ? (steadyHarvestKg(needKg, buffer, NO_CRAFTS.pottery) + storesTargetKg(needKg, buffer)) / needKg
    : 0;
}

function main(): void {
  const input = parseArgs(process.argv.slice(2));
  const r = steadyState(input);
  const h = input.household;
  const ha = (v: number): string => `${fmt(v, 2)} ha`;
  console.log(
    `Ves: ${input.households} × (dospělí ${h.adults}, starší ${h.elders}, děti 7–13 ${h.olderChildren}, malé ${h.smallChildren}) = ${r.people} lidí | úrodnost ${input.fertility} | díly ${input.distanceM} m od obydlí | les ${input.forestDistanceM} m | ${input.dwelling}`,
  );
  console.log(
    `Potřeba${input.fieldShare !== undefined && input.fieldShare < 1 ? ` z pole (podíl ${fmt(input.fieldShare, 2)})` : ''} ${fmt(r.needKg, 0)} kg/rok | čistá úroda ${fmt(r.netPerHa, 0)} kg/ha (průměr ${ROTATION.sown} let osevu) | cíl osevu ${input.reserve ? `podle zásob – potřeba, ztráty a pojistka ${fmt(FIELD_STORES.bufferEnergyYears, 2)} roční potřeby energie` : 'jen potřeba'}`,
  );
  const limit = maxSownHa(input);
  console.log(
    `Osev ${ha(r.sownHa)} (ozim ${ha(r.winterHa)}, jař ${ha(r.sownHa - r.winterHa)}) | pole s přílohem ${ha(r.fieldHa)} (× ${fmt(ROTATION_FACTOR, 2)}, oběh ${ROTATION.sown} + ${ROTATION.fallow} let) | práce stihne nejvýš ${ha(limit)} osevu${r.unfinished > 1e-6 ? ` – NESTIHNE ${fmt(r.unfinished, 0)} člověkodní` : ''}`,
  );
  console.log(
    `Zásoby po sklizni v rovnováze: podle zásob ${fmt(steadyStores(r.needKg, input), 2)}, jen potřeba ${fmt(equilibriumStores(1), 2)} roční potřeby z pole | pásmo 1–1,5 chce sklizeň ${fmt(harvestForStores(1), 3)}–${fmt(harvestForStores(1.5), 3)} × potřeba`,
  );

  const tasks = Object.keys(TASK_LABELS) as TaskName[];
  const rows: string[][] = [
    [
      'měsíc',
      'práce',
      'minimum',
      ...tasks.map((t) => TASK_LABELS[t]),
      'sad',
      'opravy',
      'společná',
      'využití',
    ],
  ];
  for (const m of r.months) {
    const fieldTotal = tasks.reduce((sum, t) => sum + m.field[t], 0);
    rows.push([
      MONTH_NAMES[m.month]!,
      fmt(m.capacity, 0),
      fmt(m.dailyMin, 0),
      ...tasks.map((t) => fmt(m.field[t], 0)),
      fmt(m.orchard, 0),
      fmt(m.repairs, 0),
      fmt(m.common, 0),
      pct((m.dailyMin + fieldTotal + m.orchard) / m.capacity),
    ]);
  }
  const fieldYear = tasks.reduce((sum, t) => sum + r.fieldWork[t], 0);
  rows.push([
    'rok',
    fmt(r.capacityPerYear, 0),
    fmt(r.dailyMinPerYear, 0),
    ...tasks.map((t) => fmt(r.fieldWork[t], 0)),
    fmt(r.orchardWork, 0),
    fmt(r.repairsPerYear, 0),
    fmt(r.commonPerYear, 0),
    pct((r.dailyMinPerYear + fieldYear + r.orchardWork) / r.capacityPerYear),
  ]);
  console.log('\nPráce (člověkodny; využití = minimum + pole + sad z práce měsíce):');
  console.log(table(rows));
  console.log(
    `\nNa obživu ${pct(r.subsistence)} práce | společná práce ${fmt(r.commonPerYear / input.households, 0)} člověkodní na domácnost a rok`,
  );
  console.log('Rezervy ve špičkách (1 − potřeba ÷ práce po denním minimu):');
  for (const p of r.peaks) {
    console.log(`  ${p.name}: ${pct(p.reserve)} (potřeba ${fmt(p.need, 0)} z ${fmt(p.free, 0)})`);
  }
  console.log(
    `Dřevo (${input.dwelling}): ${fmt(r.wood.treesPerYear, 2)} stromu za rok, kácení ${fmt(r.wood.fellingPerYear, 1)} a přestavba ${fmt(r.wood.rebuildLaborPerYear, 1)} člověkodní za rok (průměr přes životnost)`,
  );
  if (input.orchardHa > 0) {
    console.log(
      `Sad ${ha(input.orchardHa)}: ${fmt(r.orchard.applesKg, 0)} kg jablek ≈ ${fmt(r.orchard.grainKg, 0)} kg obilí, ${fmt(r.orchard.grainKgPerManDay, 1)} kg obilí za člověkoden (pole ${fmt(r.fieldGrainKgPerManDay, 1)})`,
    );
  } else {
    const perHa = steadyState({ ...input, orchardHa: 1 });
    console.log(
      `Sad: hektar v plné úrodě ≈ ${fmt(perHa.orchard.grainKg, 0)} kg obilí za ${fmt(perHa.orchardWork, 0)} člověkodní (${fmt(perHa.orchard.grainKgPerManDay, 1)} kg/člověkoden, pole ${fmt(r.fieldGrainKgPerManDay, 1)}); na 10 % potřeby ${ha((0.1 * r.needKg) / perHa.orchard.grainKg)}`,
    );
  }
  console.log('Dobytek a seno: zatím bez pravidel.');
}

main();
