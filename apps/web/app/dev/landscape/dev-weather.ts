// Vývojová ukázka počasí roku (disasters.md – Ve scéně): ves náhledu dostane vynucené odhalené
// počasí – sucho, deštivé léto, holomráz nebo dlouhou zimu. Ochrana dílů po stupních 0–4 se
// střídá podle id dílu, ať je vidět, že díl s ochranou je v suchu zelenější. Krupobití a povodeň
// (P12) – pohroma vsi náhledu a vynucený den světa (`LandscapeScene.setDisasterDay`). Požár (P13) –
// hoří obydlí nejblíž vodě a soused do 45 m, řetěz s vědry od nejbližší vody (jako jádro – bod, kam
// chodí ženy pro vodu): hustý (podávají) nebo řídký (chodí). Smršť (P13) – stopa F2 / F3 od JZ
// k SV přes střed obydlí: vývraty, zřícené a poškozené domy jako v jádře (`tornadoDay`).
import {
  PATH_WATER_SPOT,
  TORNADO,
  groundSpots,
  inTornadoTrack,
  nearestSpot,
  obstacleKind,
  obstaclesNear,
  obstaclesOf,
  walkGroundOf,
  type Landscape,
  type TornadoStrength,
} from '@bohemia/game';
import type { SceneBurningHouse, SceneVillage, SceneWeather } from '@/lib/village-view';

export type DevWeather =
  | 'normal'
  | 'dry'
  | 'drought'
  | 'wet'
  | 'rain'
  | 'blackFrost'
  | 'long'
  | 'hail'
  | 'flood100'
  | 'flood1000'
  | 'firePass'
  | 'fireWalk'
  | 'tornadoF2'
  | 'tornadoF3';

export const DEV_WEATHER_LABELS: Record<DevWeather, string> = {
  normal: 'normální rok',
  dry: 'sucho',
  drought: 'kruté sucho',
  wet: 'deštivé léto',
  rain: 'mokré žně – prší',
  blackFrost: 'holomráz',
  long: 'dlouhá zima',
  hail: 'krupobití',
  flood100: 'povodeň stoletá',
  flood1000: 'povodeň tisíciletá',
  firePass: 'požár – podávají vědra',
  fireWalk: 'požár – chodí s vědry',
  tornadoF2: 'smršť F2',
  tornadoF3: 'smršť F3',
};

/** Rozestup řetězu náhledu (m): hustý – podávají (do 2,5 m), řídký – každý chodí po úseku. */
const DEV_FIRE_SPACING_M = { firePass: 2.2, fireWalk: 7 } as const;

/** Den pohromy náhledu (den světa) – scéna dostane vynucený den světa kousek po něm. */
const DEV_DISASTER_DAY = 0;
/** Výška vody stoleté a tisícileté povodně (m nad potokem – FLOOD_WATER v jádru). */
const DEV_FLOOD_M = { flood100: 2, flood1000: 3.5 } as const;

/**
 * Vynucený den světa pro pohromy náhledu: krupobití v plné bouřce (kroupy padají, bílý pás skoro
 * celý), povodeň první den (voda stojí). Jinak null – podle hodin světa.
 */
export function devDisasterDay(weather: DevWeather): number | null {
  if (weather === 'hail') return DEV_DISASTER_DAY + 0.4;
  if (weather === 'flood100' || weather === 'flood1000') return DEV_DISASTER_DAY + 1;
  // požár v plné síle (houseFireState – hoří od rána do odpoledne)
  if (weather === 'firePass' || weather === 'fireWalk') return DEV_DISASTER_DAY + 0.4;
  // smršť – trychtýř v půli průchodu u středu vsi, scéna v plné tmě (storm.ts – FUNNEL_PASS)
  if (weather === 'tornadoF2' || weather === 'tornadoF3') return DEV_DISASTER_DAY + 0.7;
  return null;
}

/** Vynucený déšť scény (`LandscapeScene.setRainOverride`): „prší“ 1, jinak dny deště (null). */
export function devRain(weather: DevWeather): number | null {
  return weather === 'rain' ? 1 : null;
}

/**
 * Vynucený požár náhledu: hoří obydlí nejblíž vodě (řetěz je vidět celý) a nejbližší soused do
 * 45 m; dospělých tolik, ať je rozestup DEV_FIRE_SPACING_M. Lidé ve scéně se vynechají (postavy
 * řetězu nejsou skuteční lidé – ukázka jich má málo) a práce vsi dnes není (všichni hasí).
 */
function withDevFire(
  village: SceneVillage,
  weather: 'firePass' | 'fireWalk',
  landscape: Landscape | null,
): SceneVillage {
  const houses = village.dwellings.filter((d) => d.built);
  if (houses.length === 0 || !landscape) return village;
  const spots = groundSpots(walkGroundOf(landscape), PATH_WATER_SPOT);
  const withWater = houses.flatMap((d) => {
    const water = nearestSpot(spots, { x: d.position.x, z: d.position.z });
    if (!water) return [];
    const distance = Math.hypot(water.x - d.position.x, water.z - d.position.z);
    return [{ d, water, distance }];
  });
  // nejbližší vodě, ale aspoň 25 m – ať je vidět řada lidí
  const target =
    withWater.filter((w) => w.distance >= 25).sort((a, b) => a.distance - b.distance)[0] ??
    withWater.sort((a, b) => b.distance - a.distance)[0];
  if (!target) return village;
  const site = target.d.position;
  const neighbour = houses
    .filter((d) => d.id !== target.d.id)
    .map((d) => ({ d, m: Math.hypot(d.position.x - site.x, d.position.z - site.z) }))
    .filter((n) => n.m <= 45)
    .sort((a, b) => a.m - b.m)[0]?.d;
  const burning: SceneBurningHouse[] = [target.d, ...(neighbour ? [neighbour] : [])].map((d) => ({
    id: d.id,
    x: d.position.x,
    z: d.position.z,
    type: d.type,
    rotation: d.position.rotation,
    ...(d.id === target.d.id ? { started: true as const } : {}),
  }));
  const people = Math.max(2, Math.round(target.distance / DEV_FIRE_SPACING_M[weather]));
  // bez lidí ve vsi (ukázka bez volby Lidé) jen dospělí řetězu – postavy kreslí rozdělení práce
  const labor = village.labor
    ? { ...village.labor, shares: [] }
    : { day: 0, month: 7, people: { children: 0, adults: people, elders: 0 }, shares: [] };
  delete labor.persons;
  return {
    ...village,
    labor,
    fire: {
      day: DEV_DISASTER_DAY,
      burning,
      chain: {
        water: { x: target.water.x, z: target.water.z },
        target: { x: site.x, z: site.z },
        people,
        spacingM: target.distance / people,
      },
    },
  };
}

/** Celé číslo → 0–1 (los vývratu náhledu podle id stromu). */
function devHash(n: number): number {
  let h = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Vynucená smršť náhledu (jako `tornadoDay` v jádře): stopa průměrné délky a šířky síly od JZ
 * k SV přes střed obydlí; dospělé stromy vrstvy překážek ve stopě do `TORNADO.reachM` padnou
 * s podílem síly (pařez a padlý kmen), obydlí ve stopě ztratí stav, na nule se zřítí (zbytek jámy).
 */
function withDevTornado(
  village: SceneVillage,
  weather: 'tornadoF2' | 'tornadoF3',
  landscape: Landscape | null,
): SceneVillage {
  const strength: TornadoStrength = weather === 'tornadoF2' ? 'F2' : 'F3';
  const rule = TORNADO.strengths.find((s) => s.strength === strength)!;
  const homes = village.dwellings.filter((d) => d.built);
  if (homes.length === 0) return village;
  const x = homes.reduce((sum, d) => sum + d.position.x, 0) / homes.length;
  const z = homes.reduce((sum, d) => sum + d.position.z, 0) / homes.length;
  const track = { x, z, angle: Math.PI / 4, lengthM: rule.lengthM, widthM: rule.widthM };
  const trunks: number[] = [];
  if (landscape) {
    const layer = obstaclesOf(landscape);
    const reach = TORNADO.reachM;
    for (const i of obstaclesNear(layer, x - reach, z - reach, x + reach, z + reach)) {
      if (obstacleKind(layer, i) !== 'tree') continue;
      const tx = layer.x[i]!;
      const tz = layer.z[i]!;
      if ((tx - x) ** 2 + (tz - z) ** 2 > reach * reach || !inTornadoTrack(track, tx, tz)) continue;
      if (devHash(layer.id[i]!) < rule.trees) trunks.push(layer.id[i]!);
    }
  }
  const hit = (d: SceneVillage['dwellings'][number]): number | null =>
    d.built && inTornadoTrack(track, d.position.x, d.position.z)
      ? (d.condition ?? 1) - (d.type === 'zemnice' ? rule.zemnice : rule.building)
      : null;
  // poslední obydlí zůstane (jako `collapseDwellings`)
  const keep = homes.every((d) => (hit(d) ?? 1) <= 0) ? homes[0]!.id : null;
  const dwellings: SceneVillage['dwellings'] = [];
  const ruins: NonNullable<SceneVillage['ruins']> = [...(village.ruins ?? [])];
  for (const d of village.dwellings) {
    const condition = hit(d);
    if (condition === null) {
      dwellings.push(d);
      continue;
    }
    if (condition > 0 || d.id === keep) {
      dwellings.push({ ...d, condition: Math.max(0.05, condition) });
      continue;
    }
    ruins.push({
      id: d.id,
      type: d.type,
      position: d.position,
      since: DEV_DISASTER_DAY,
      overgrowth: 0,
      ...(d.plot ? { plot: d.plot } : {}),
      ...(d.craft ? { craft: d.craft } : {}),
    });
  }
  const obstacles = village.obstacles ?? { removed: [], stumps: [], saplings: [] };
  return {
    ...village,
    dwellings,
    ruins,
    obstacles: { ...obstacles, stumps: [...new Set([...obstacles.stumps, ...trunks])] },
    tornado: {
      day: DEV_DISASTER_DAY,
      strength,
      track,
      ...(trunks.length > 0 ? { trunks } : {}),
    },
  };
}

/** Ves náhledu s vynuceným počasím; normální rok beze změny. */
export function withDevWeather(
  village: SceneVillage,
  weather: DevWeather,
  landscape: Landscape | null = null,
): SceneVillage {
  if (weather === 'normal') return village;
  if (weather === 'firePass' || weather === 'fireWalk') {
    return withDevFire(village, weather, landscape);
  }
  if (weather === 'tornadoF2' || weather === 'tornadoF3') {
    return withDevTornado(village, weather, landscape);
  }
  if (weather === 'hail') {
    // pruh přes pole vsi náhledu (v jádru přes střed obydlí) – ať je vidět potlučené obilí
    const parts = village.fields.flatMap((f) => f.parts);
    const x = parts.reduce((sum, p) => sum + p.x, 0) / Math.max(1, parts.length);
    const z = parts.reduce((sum, p) => sum + p.z, 0) / Math.max(1, parts.length);
    return { ...village, hail: { day: DEV_DISASTER_DAY, strip: { x, z, angle: 0.5, offsetM: 0 } } };
  }
  if (weather === 'flood100' || weather === 'flood1000') {
    const heightM = DEV_FLOOD_M[weather];
    return { ...village, flood: { day: DEV_DISASTER_DAY, heightM, season: 'summer' } };
  }
  // rok počasí náhled nekontroluje – vývojový přepínač dne platí pro jakýkoli rok
  const scene: SceneWeather =
    weather === 'blackFrost' || weather === 'long'
      ? { year: 0, winter: weather }
      : weather === 'rain'
        ? { year: 0, summer: 'wetHarvest', strength: 1 }
        : { year: 0, summer: weather, strength: weather === 'dry' || weather === 'wet' ? 0.6 : 1 };
  if (scene.summer) {
    const parts: Record<string, number> = {};
    for (const field of village.fields) {
      for (const part of field.parts) {
        if (part.id !== undefined && part.id % 5 > 0) parts[String(part.id)] = part.id % 5;
      }
    }
    scene.parts = parts;
  }
  if (weather === 'blackFrost') {
    // osetá pole náhledu jako ozim – po holomrazu řídne a prosvítá hlína
    const fields = village.fields.map((field) => ({
      ...field,
      parts: field.parts.map((part) =>
        part.stage === 'sown' && part.crop === undefined
          ? { ...part, winter: true as const }
          : part,
      ),
    }));
    return { ...village, fields, weather: scene };
  }
  return { ...village, weather: scene };
}
