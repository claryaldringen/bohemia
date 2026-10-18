/** Výšky terénu se pro čitelnost krajiny zobrazují převýšené (jen vzhled, herní data ne). */
export const HEIGHT_SCALE = 3;
/** Směr slunečních paprsků (letní odpoledne) – světlo scény i osluněné svahy terénu. */
export const SUN_DIRECTION = { x: -0.8, y: -0.6, z: -0.35 } as const;
/**
 * Přiblížení kamery – vzdálenost kamery od cíle na zemi (m, `ArcRotateCamera.radius`). Výchozí
 * a nejbližší jako v 0 A.D. (`zoom.default` 120, `zoom.min` 50), nejdál víc než tam (200), aby
 * šla přehlédnout celá krajina (1,9 km). Podle rozsahu se řídí i mix zvuků (`ambient-mix.ts`).
 */
export const CAMERA_ZOOM_M = { min: 50, default: 120, max: 1400 } as const;
/**
 * Snímků za sekundu animace vody (vlnky po proudu), zvířat, lidí a spřežení – výjimka
 * z kreslení jen při změně, dokud je to v záběru; kamera v pohybu kreslí rychleji.
 */
export const WATER_FPS = 30;
