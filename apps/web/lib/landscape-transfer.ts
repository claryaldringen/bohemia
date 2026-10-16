import type { Landscape, StreamPoint } from '@bohemia/game';

/** Čísel na bod osy potoka: x, y, levá a pravá poloviční šířka, hladina, mělčina (0/1). */
const STREAM_FIELDS = 6;

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
  /** Base64 Float32 little-endian – body osy potoka po STREAM_FIELDS číslech. */
  stream: string;
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
    stream: bytesToBase64(encodeStream(l.stream)),
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
    stream: decodeStream(base64ToBytes(t.stream)),
  };
}

function encodeStream(stream: readonly StreamPoint[]): Uint8Array {
  const view = new DataView(new ArrayBuffer(stream.length * STREAM_FIELDS * 4));
  stream.forEach((p, k) => {
    const values = [p.x, p.y, p.halfWidthLeft, p.halfWidthRight, p.level, p.shallow ? 1 : 0];
    values.forEach((v, f) => view.setFloat32((k * STREAM_FIELDS + f) * 4, v, true));
  });
  return new Uint8Array(view.buffer);
}

function decodeStream(bytes: Uint8Array): StreamPoint[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.byteLength / (STREAM_FIELDS * 4);
  const at = (k: number, f: number): number => view.getFloat32((k * STREAM_FIELDS + f) * 4, true);
  return Array.from({ length: count }, (_, k) => ({
    x: at(k, 0),
    y: at(k, 1),
    halfWidthLeft: at(k, 2),
    halfWidthRight: at(k, 3),
    level: at(k, 4),
    shallow: at(k, 5) === 1,
  }));
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
