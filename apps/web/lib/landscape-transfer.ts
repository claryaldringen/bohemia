import type {
  Landscape,
  ObstacleLayerSeed,
  PremiumType,
  Promontory,
  SkeletonSlice,
  StreamPoint,
} from '@bohemia/game';

/** Čísel na bod osy potoka: x, y, levá a pravá poloviční šířka, hladina, mělčina (0/1). */
const STREAM_FIELDS = 6;

/** Osa jedné řeky kostry v přenosu – jako `LandscapeTransfer.river` a `riverBanks`. */
export interface RiverTransfer {
  /** Base64 Float32 little-endian – body osy po STREAM_FIELDS číslech. */
  axis: string;
  /** Base64 Float32 – výšky stěn u řeky po dvou číslech na bod osy (vlevo, vpravo). */
  banks?: string;
}

/**
 * Krajina ve tvaru, který jde poslat v props ze serveru do klientské komponenty (≈ 100 kB,
 * ≈ 50 kB po kompresi). Přesnost (výšky na cm, osa potoka i řek a výšky stěn u toků ve Float32) odpovídá
 * `transferPrecision` z herního jádra – vrstvu překážek (desítky tisíc stromů) si prohlížeč
 * vygeneruje sám ze seedu vrstvy a vyjde mu přesně stejná jako serveru.
 */
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
  /** Seed a verze vrstvy překážek (null = krajina bez překážek). */
  obstacleLayer: ObstacleLayerSeed | null;
  /**
   * Base64 Float32 little-endian – výšky stěn u potoka po dvou číslech na bod osy (vlevo,
   * vpravo); jen terén 2, u terénu 1 chybí.
   */
  banks?: string;
  /** Ostrožny (terén 2); u terénu 1 chybí. */
  promontories?: readonly Promontory[];
  /**
   * Base64 Float32 little-endian – osa řeky prémiové krajiny po STREAM_FIELDS číslech na bod,
   * jako osa potoka; u krajiny bez řeky chybí.
   */
  river?: string;
  /** Base64 Float32 – výšky stěn u řeky po dvou číslech na bod osy (vlevo, vpravo). */
  riverBanks?: string;
  /**
   * Osy řek kostry světa (`Landscape.rivers`) v pořadí krajiny – hlavní tok první, pak přítoky;
   * u mapy bez řeky kostry chybí.
   */
  rivers?: readonly RiverTransfer[];
  /**
   * Výřez kostry světa (řeky a stezky na okraji); u suché mapy chybí. Stezku kostry si prohlížeč
   * spočítá sám jako vrstvu překážek – z výřezu a krajiny s přesností přenosu.
   */
  skeleton?: SkeletonSlice;
  /**
   * Prémiový typ krajiny; u průměrné krajiny chybí. Prvky typu (`premiumFeaturesOf`) si prohlížeč
   * spočítá sám jako vrstvu překážek – z typu a krajiny s přesností přenosu.
   */
  premium?: PremiumType;
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
    obstacleLayer: l.obstacleLayer,
    ...(l.stream.some((p) => p.bankLeft !== undefined)
      ? { banks: bytesToBase64(encodeBanks(l.stream)) }
      : {}),
    ...(l.promontories ? { promontories: l.promontories } : {}),
    ...(l.river ? { river: bytesToBase64(encodeStream(l.river)) } : {}),
    ...(l.river?.some((p) => p.bankLeft !== undefined)
      ? { riverBanks: bytesToBase64(encodeBanks(l.river)) }
      : {}),
    ...(l.rivers ? { rivers: l.rivers.map(encodeRiver) } : {}),
    ...(l.skeleton ? { skeleton: l.skeleton } : {}),
    ...(l.premium !== undefined ? { premium: l.premium } : {}),
  };
}

/** Osa řeky kostry do přenosu – výšky stěn jen, když je osa má (jako `riverBanks`). */
function encodeRiver(course: readonly StreamPoint[]): RiverTransfer {
  return {
    axis: bytesToBase64(encodeStream(course)),
    ...(course.some((p) => p.bankLeft !== undefined)
      ? { banks: bytesToBase64(encodeBanks(course)) }
      : {}),
  };
}

function decodeRiver(r: RiverTransfer): StreamPoint[] {
  const axis = decodeStream(base64ToBytes(r.axis));
  return r.banks !== undefined ? withBanks(axis, base64ToBytes(r.banks)) : axis;
}

/** Dekódované krajiny podle přenosu – scéna i rozhraní dostanou týž objekt (a vrstvu překážek). */
const decoded = new WeakMap<LandscapeTransfer, Landscape>();

/** Krajina z přenosu; pro týž objekt přenosu vrací týž objekt krajiny (`obstaclesOf` jednou). */
export function decodeLandscape(t: LandscapeTransfer): Landscape {
  const cached = decoded.get(t);
  if (cached) return cached;
  const landscape = decode(t);
  decoded.set(t, landscape);
  return landscape;
}

function decode(t: LandscapeTransfer): Landscape {
  const heightBytes = base64ToBytes(t.heightsCm);
  const view = new DataView(heightBytes.buffer);
  const heights = new Float32Array(t.size * t.size);
  for (let i = 0; i < heights.length; i++) heights[i] = view.getUint16(i * 2, true) / 100;
  const stream = decodeStream(base64ToBytes(t.stream));
  const river = t.river !== undefined ? decodeStream(base64ToBytes(t.river)) : null;
  return {
    size: t.size,
    cellSizeM: t.cellSizeM,
    villageSite: t.villageSite,
    heights,
    surface: base64ToBytes(t.surface),
    fertility: base64ToBytes(t.fertility),
    stream: t.banks ? withBanks(stream, base64ToBytes(t.banks)) : stream,
    obstacleLayer: t.obstacleLayer,
    ...(t.promontories ? { promontories: t.promontories } : {}),
    ...(river
      ? { river: t.riverBanks ? withBanks(river, base64ToBytes(t.riverBanks)) : river }
      : {}),
    ...(t.rivers ? { rivers: t.rivers.map(decodeRiver) } : {}),
    ...(t.skeleton ? { skeleton: t.skeleton } : {}),
    ...(t.premium !== undefined ? { premium: t.premium } : {}),
  };
}

function encodeBanks(stream: readonly StreamPoint[]): Uint8Array {
  const view = new DataView(new ArrayBuffer(stream.length * 8));
  stream.forEach((p, k) => {
    view.setFloat32(k * 8, p.bankLeft ?? 0, true);
    view.setFloat32(k * 8 + 4, p.bankRight ?? 0, true);
  });
  return new Uint8Array(view.buffer);
}

function withBanks(stream: readonly StreamPoint[], bytes: Uint8Array): StreamPoint[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return stream.map((p, k) => ({
    ...p,
    bankLeft: view.getFloat32(k * 8, true),
    bankRight: view.getFloat32(k * 8 + 4, true),
  }));
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
