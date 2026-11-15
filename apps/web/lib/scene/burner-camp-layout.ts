// Zemnice u milíře ve scéně (workshops.md – Uhlíř, zemnice; Martin 14. 11. 2026): vzhled podle
// stavu zemnice, klíč pro překreslení, vchod a rozestup nosičů na tyči. Čisté funkce bez Babylonu.
import { BURNER_CAMP } from '@bohemia/game';
import type { SceneBurnerCamp } from '../village-view';

/** Zadní nosič jde o tolik (m) za předním – tyč je dlouhá 2,6 m, ruce na jejích koncích. */
export const POLE_SPACING_M = 2.4;

/** Zemnice sesedá nejvýš o tolik (m), jak zchátrala (opuštěná – `overgrowth` 1). */
export const CAMP_SINK_M = 0.6;
/** Střecha opuštěné zemnice se nakloní nejvýš o tolik stupňů. */
export const CAMP_TILT_DEG = 12;

/** Díly modelu zemnice: hotová stavba, nebo klády na staveništi (construction-moss.glb). */
export type CampPart = 'milir-zemnice' | 'milir-zemnice-logs';

export interface CampLook {
  part: CampPart;
  /** O kolik zemnice sesedla (m). */
  sinkM: number;
  /** O kolik se střecha nakloní (°). */
  tiltDeg: number;
}

/**
 * Jak zemnice vypadá: rozestavěná (`built < 1`) jsou jen tři klády u jámy, hotová model; opuštěná
 * sesedá o 0,6 m a střecha se nakloní o 12° podle toho, jak zchátrala.
 */
export function campLook(camp: SceneBurnerCamp): CampLook {
  const overgrowth = Math.min(1, Math.max(0, camp.overgrowth ?? 0));
  return {
    part: camp.built < 1 ? 'milir-zemnice-logs' : 'milir-zemnice',
    sinkM: CAMP_SINK_M * overgrowth,
    tiltDeg: CAMP_TILT_DEG * overgrowth,
  };
}

/** Klíč zemnic pro překreslení – mění se jen s tím, co ovlivňuje vzhled. */
export function campsKey(camps: readonly SceneBurnerCamp[]): string {
  return camps
    .map((c) => `${c.id}:${c.x}:${c.z}:${c.rotation}:${c.built}:${c.overgrowth ?? '-'}`)
    .join(';');
}

/**
 * Kam se zemnice naklání (jednotkový vektor svislé osy): do strany napříč vchodem, ať střecha
 * nesedne přes vchod. Osa +z modelu míří do (sin r, cos r), napříč je (cos r, −sin r).
 */
export function campUp(
  camp: Pick<SceneBurnerCamp, 'rotation'>,
  tiltDeg: number,
): { x: number; y: number; z: number } {
  const a = (tiltDeg * Math.PI) / 180;
  return {
    x: Math.sin(a) * Math.cos(camp.rotation),
    y: Math.cos(a),
    z: -Math.sin(a) * Math.sin(camp.rotation),
  };
}

/** Před vchodem zemnice (m od středu): půl hloubky a krok před dveře. */
export const CAMP_ENTRANCE_M = BURNER_CAMP.footprintM.depth / 2 + 1;

/** Místo před vchodem zemnice – odsud uhlíř vychází k milíři a tady sedí. */
export function campEntrance(camp: Pick<SceneBurnerCamp, 'x' | 'z' | 'rotation'>): {
  x: number;
  z: number;
} {
  return {
    x: camp.x + Math.sin(camp.rotation) * CAMP_ENTRANCE_M,
    z: camp.z + Math.cos(camp.rotation) * CAMP_ENTRANCE_M,
  };
}
