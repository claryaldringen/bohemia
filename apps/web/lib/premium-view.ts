import { PREMIUM_CATALOG, type PremiumType } from '@bohemia/game';
import type { NoticeLine } from '@/components/game/hud/NoticeLines';

// Co hráč vidí z prémiové krajiny (premium-landscapes.md – Co hráč vidí): ikona typu, krátký
// název pod portrétem a co místo dává hned a později – slova jen v popiscích (UI jako 0 A.D.).
// Jediná věta je představení krajiny při prvním vstupu do hry.

/** Portrét typu (`tools/blender/icons.py` → `public/icons/premium/<typ>.png`). */
export function premiumIcon(type: PremiumType): string {
  return `/icons/premium/${type}.png`;
}

export interface PremiumTexts {
  /** Krátký název pod portrétem (celý název typu je v katalogu – popisek). */
  short: string;
  /** Co místo dává hned (sloupec „Hned“ spec); null – zatím nic. */
  now: string | null;
  /** Co přijde s pozdější mechanikou (sloupec „Později“); null – nic dalšího. */
  later: string | null;
}

/** Texty typů podle tabulek „Od Martina“ a „Další návrhy“ (premium-landscapes.md – Typy krajin). */
export const PREMIUM_TEXTS: Record<PremiumType, PremiumTexts> = {
  'deep-gold': {
    short: 'Ložisko zlata',
    now: null,
    later: 'S hornictvím hodně zlata a stříbra',
  },
  'gold-stream': { short: 'Zlatonosný potok', now: null, later: 'Rýžování zlata – málo, ale brzy' },
  'navigable-river': {
    short: 'Splavná řeka',
    now: 'Niva s loukami – seno',
    later: 'Doprava po řece, přístav, obchod s ostatními rody',
  },
  fertile: { short: 'Úrodná krajina', now: 'Víc obilí z hektaru', later: null },
  'ford-hill': {
    short: 'Brod se stezkou',
    now: 'Cesta od počátku, levnější obchod se sousedy',
    later: 'Mýto na brodu, trh, obrana',
  },
  'mountain-pass': {
    short: 'Horský průsmyk',
    now: 'Cesta od počátku, levnější obchod se sousedy',
    later: 'Mýto, obrana průsmyku, kupci ze vzdálených krajů',
  },
  'iron-ore': {
    short: 'Bohatá ruda',
    now: 'Kovář potřebuje méně rudy – levnější nástroje',
    later: 'Prodej železa a nástrojů',
  },
  'fine-clay': {
    short: 'Dobrá hlína',
    now: 'Hrnčíř potřebuje méně hlíny',
    later: 'Prodej keramiky',
  },
  'oak-beech': { short: 'Doubravy', now: 'Víc prasat na žíru, buky pro uhlíře', later: null },
  floodplain: { short: 'Nivní louky', now: 'Víc sena a pastvy – větší stáda', later: null },
  'south-slopes': { short: 'Jižní svahy', now: 'Lepší úroda sadu', later: 'Vinice' },
  'sacred-mountain': {
    short: 'Posvátná hora',
    now: 'Posvátné místo – štěstí vsi',
    later: 'Sněmy, poutě, prestiž rodu',
  },
  'sacred-spring': {
    short: 'Posvátný pramen',
    now: 'Posvátné místo – štěstí vsi',
    later: 'Poutě, lázně',
  },
  confluence: {
    short: 'Soutok',
    now: 'Dvě údolí s loukami, ostrožna',
    later: 'Křižovatka cest a řek, obchod',
  },
  'natural-fortress': { short: 'Přirozená pevnost', now: null, later: 'Obrana ve válce' },
  'salt-spring': { short: 'Solný pramen', now: null, later: 'Solivar – velmi cenné zboží' },
  'wild-bees': { short: 'Brtě', now: null, later: 'Med do jídla, vosk na obchod' },
  'game-furs': { short: 'Hojná zvěř', now: null, later: 'Lov – maso bez stáda, kožešiny' },
  'building-stone': { short: 'Lom', now: null, later: 'Kamenné stavby – hrady, kostely' },
};

/** Popisek ikony „hned“ v panelu prvku. */
export function premiumNowTip(type: PremiumType): string {
  return `Hned: ${PREMIUM_TEXTS[type].now ?? 'zatím nic'}`;
}

/** Popisek ikony „později“ v panelu prvku. */
export function premiumLaterTip(type: PremiumType): string {
  return `Později: ${PREMIUM_TEXTS[type].later ?? 'nic dalšího'}`;
}

/**
 * Jediná věta při prvním vstupu do hry: krajina rodu a co dává hned (typ bez účinku hned – co
 * přijde později).
 */
export function premiumIntroText(type: PremiumType): string {
  const { now, later } = PREMIUM_TEXTS[type];
  const what = now ?? (later ? `později ${later.charAt(0).toLowerCase()}${later.slice(1)}` : null);
  return what
    ? `Krajina rodu: ${PREMIUM_CATALOG[type].name} – ${what.charAt(0).toLowerCase()}${what.slice(1)}.`
    : `Krajina rodu: ${PREMIUM_CATALOG[type].name}.`;
}

/**
 * Představení krajiny při prvním vstupu do hry (sídlo s typem, ves ještě není založená) jako
 * mizející řádek upozornění s ikonou typu; jinak null.
 */
export function premiumIntroNotice(
  premium: PremiumType | undefined,
  hasVillage: boolean,
): Omit<NoticeLine, 'id'> | null {
  if (premium === undefined || hasVillage) return null;
  return {
    kind: 'premium-intro',
    tone: 'info',
    text: premiumIntroText(premium),
    icon: premiumIcon(premium),
  };
}
