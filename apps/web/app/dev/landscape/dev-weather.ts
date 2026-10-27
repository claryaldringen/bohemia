// Vývojová ukázka počasí roku (disasters.md – Ve scéně): ves náhledu dostane vynucené odhalené
// počasí – sucho, deštivé léto, holomráz nebo dlouhou zimu. Ochrana dílů po stupních 0–4 se
// střídá podle id dílu, ať je vidět, že díl s ochranou je v suchu zelenější.
import type { SceneVillage, SceneWeather } from '@/lib/village-view';

export type DevWeather = 'normal' | 'dry' | 'drought' | 'wet' | 'blackFrost' | 'long';

export const DEV_WEATHER_LABELS: Record<DevWeather, string> = {
  normal: 'normální rok',
  dry: 'sucho',
  drought: 'kruté sucho',
  wet: 'deštivé léto',
  blackFrost: 'holomráz',
  long: 'dlouhá zima',
};

/** Ves náhledu s vynuceným počasím; normální rok beze změny. */
export function withDevWeather(village: SceneVillage, weather: DevWeather): SceneVillage {
  if (weather === 'normal') return village;
  // rok počasí náhled nekontroluje – vývojový přepínač dne platí pro jakýkoli rok
  const scene: SceneWeather =
    weather === 'blackFrost' || weather === 'long'
      ? { year: 0, winter: weather }
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
  return { ...village, weather: scene };
}
