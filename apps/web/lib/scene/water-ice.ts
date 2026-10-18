// Led na vodě v zimě – čisté funkce bez enginu (jen vzhled, žádná herní pravidla). Zamrzá
// stojatá a pomalá voda (tůně, klidné úseky) a okraj u břehů, kde proud slábne; rychlý proud
// zůstane otevřený – tmavá voda s ledovými okraji. Kolik je zimy, říká `SeasonLook.ice`
// (season-look.ts). Shader hladiny (water.ts) počítá totéž se stejnými konstantami, scéna podle
// toho pozná zamrzlou vodu (nekreslí ji 30× za sekundu), ryby pod ledem a tišší potok.

/** Do jaké rychlosti proudu (0–1 jako osa potoka) voda zamrzne při plném ledu (`ice` = 1). */
export const FREEZE_SPEED = 0.45;
/** Šířka přechodu mezi ledem a otevřenou vodou (v rychlosti proudu). */
export const ICE_SOFTNESS = 0.06;
/** Rozkmit šumu, který trhá okraj ledu (v rychlosti proudu; shader šum −1 … 1). */
export const ICE_JITTER = 0.05;
/** Pásmo u břehu (m od okraje vody), kde proud slábne k nule – tam se led tvoří nejdřív. */
export const BANK_ICE_M = 4;

/**
 * Rychlost proudu v místě pro led: u břehu zpomalená až k nule. `bankDistance` = vzdálenost od
 * okraje vody (m, ve vodě záporná – `StreamSample.bankDistance`).
 */
export function iceFlowSpeed(speed: number, bankDistance: number): number {
  return Math.max(0, speed) * bankSlowdown(bankDistance);
}

/** Podíl proudu podle vzdálenosti od břehu: 0 na okraji vody, 1 dál než BANK_ICE_M. */
export function bankSlowdown(bankDistance: number): number {
  return smoothstep(0, BANK_ICE_M, -bankDistance);
}

/**
 * Kolik místa pokrývá led 0–1. `speed` rychlost proudu 0–1, `bankDistance` vzdálenost od okraje
 * vody (m), `ice` kolik je zimy 0–1, `jitter` šum −1 … 1 (okraj ledu není rovný). Bez zimy 0,
 * s přibývající zimou zamrzá nejdřív stojatá voda a okraje u břehů, pak pomalé úseky.
 */
export function iceCover(speed: number, bankDistance: number, ice: number, jitter = 0): number {
  return iceCoverOfFlow(iceFlowSpeed(speed, bankDistance), ice, jitter);
}

/** `iceCover` pro rychlost proudu, ve které už je zpomalení u břehu (`iceFlowSpeed`). */
export function iceCoverOfFlow(flow: number, ice: number, jitter = 0): number {
  if (!(ice > 0)) return 0;
  const limit = FREEZE_SPEED * Math.min(1, ice);
  const jittered = Math.max(0, flow + jitter * ICE_JITTER);
  return 1 - smoothstep(limit - ICE_SOFTNESS, limit, jittered);
}

/**
 * Od jaké zimy (`ice`) je místo s rychlostí proudu `flow` (už i s břehem – `iceFlowSpeed`)
 * zamrzlé celé, ať šum vyjde jakkoli. Nad 1 = nezamrzne nikdy (rychlý proud).
 */
export function frozenFrom(flow: number): number {
  return (Math.max(0, flow) + ICE_JITTER + ICE_SOFTNESS) / FREEZE_SPEED;
}

/** Kolik vzorků napříč korytem bere `frozenShare`. */
const SHARE_SAMPLES = 16;

/**
 * Jaký podíl šířky potoka pokrývá led (0–1): napříč korytem od břehu ke středu, proud `speed`
 * uprostřed, poloviční šířka vody `halfWidth` (m). Pro zvuk potoka – voda pod ledem je tišší.
 */
export function frozenShare(speed: number, halfWidth: number, ice: number): number {
  if (!(ice > 0)) return 0;
  const half = Math.max(0, halfWidth);
  let sum = 0;
  for (let i = 0; i < SHARE_SAMPLES; i++) {
    sum += iceCover(speed, -((i + 0.5) / SHARE_SAMPLES) * half, ice);
  }
  return sum / SHARE_SAMPLES;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
