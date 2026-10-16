import type { Landscape } from '@bohemia/game';

/** Krajina ve tvaru, který jde poslat v props ze serveru do klientské komponenty (≈ 90 kB). */
export interface LandscapeTransfer {
  size: number;
  cellSizeM: number;
  villageSite: { x: number; y: number };
  /** Base64 Uint16 little-endian – výšky v centimetrech. */
  heightsCm: string;
  /** Base64 kódů povrchu. */
  surface: string;
  /** Base64 úrodnosti 0–100. */
  fertility: string;
}

export function encodeLandscape(l: Landscape): LandscapeTransfer {
  const heights = new DataView(new ArrayBuffer(l.heights.length * 2));
  l.heights.forEach((h, i) => heights.setUint16(i * 2, Math.round(h * 100), true));
  return {
    size: l.size,
    cellSizeM: l.cellSizeM,
    villageSite: l.villageSite,
    heightsCm: bytesToBase64(new Uint8Array(heights.buffer)),
    surface: bytesToBase64(l.surface),
    fertility: bytesToBase64(l.fertility),
  };
}

export function decodeLandscape(t: LandscapeTransfer): Landscape {
  const heightBytes = base64ToBytes(t.heightsCm);
  const view = new DataView(heightBytes.buffer);
  const heights = new Float32Array(t.size * t.size);
  for (let i = 0; i < heights.length; i++) heights[i] = view.getUint16(i * 2, true) / 100;
  return {
    size: t.size,
    cellSizeM: t.cellSizeM,
    villageSite: t.villageSite,
    heights,
    surface: base64ToBytes(t.surface),
    fertility: base64ToBytes(t.fertility),
  };
}

// btoa/atob existují v Node i v prohlížeči; po blocích kvůli limitu argumentů funkce.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
