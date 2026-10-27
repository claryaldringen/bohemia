// Vývojová ukázka počasí roku (disasters.md – Ve scéně): ves náhledu dostane vynucené odhalené
// počasí – sucho, deštivé léto, holomráz nebo dlouhou zimu. Ochrana dílů po stupních 0–4 se
// střídá podle id dílu, ať je vidět, že díl s ochranou je v suchu zelenější. Krupobití a povodeň
// (P12) – pohroma vsi náhledu a vynucený den světa (`LandscapeScene.setDisasterDay`).
import type { SceneVillage, SceneWeather } from '@/lib/village-view';

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
  | 'flood1000';

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
};

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
  return null;
}

/** Vynucený déšť scény (`LandscapeScene.setRainOverride`): „prší“ 1, jinak dny deště (null). */
export function devRain(weather: DevWeather): number | null {
  return weather === 'rain' ? 1 : null;
}

/** Ves náhledu s vynuceným počasím; normální rok beze změny. */
export function withDevWeather(village: SceneVillage, weather: DevWeather): SceneVillage {
  if (weather === 'normal') return village;
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
