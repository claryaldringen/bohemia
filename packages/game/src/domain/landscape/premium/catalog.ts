import type { PremiumType, PremiumTypeInfo } from './types';

/** Všech 19 typů v pořadí specifikace (premium-landscapes.md). */
export const PREMIUM_TYPES: readonly PremiumType[] = [
  'deep-gold',
  'gold-stream',
  'navigable-river',
  'fertile',
  'ford-hill',
  'mountain-pass',
  'iron-ore',
  'fine-clay',
  'oak-beech',
  'floodplain',
  'south-slopes',
  'sacred-mountain',
  'sacred-spring',
  'confluence',
  'natural-fortress',
  'salt-spring',
  'wild-bees',
  'game-furs',
  'building-stone',
];

/**
 * Katalog typů: názvy a kotvy podle tabulek „Od Martina“ a „Další návrhy“. U typů, kde spec
 * kotvu neuvádí (–), je nejbližší velká ves (brtě, zvěř) – návrh Clauda.
 */
export const PREMIUM_CATALOG: Record<PremiumType, PremiumTypeInfo> = {
  'deep-gold': {
    name: 'Hluboká ložiska drahých kovů',
    skeleton: false,
    anchor: 'mining-town',
    immediate: false,
  },
  'gold-stream': {
    name: 'Zlatonosný potok',
    skeleton: false,
    anchor: 'market-town',
    immediate: false,
  },
  'navigable-river': {
    name: 'Splavná řeka',
    skeleton: true,
    anchor: 'port',
    immediate: true,
  },
  fertile: {
    name: 'Velmi úrodná krajina',
    skeleton: false,
    anchor: 'large-village',
    immediate: true,
  },
  'ford-hill': {
    name: 'Vyvýšenina nad brodem s obchodní stezkou',
    skeleton: true,
    anchor: 'hillfort',
    immediate: true,
  },
  'mountain-pass': {
    name: 'Horský průsmyk s obchodní stezkou',
    skeleton: true,
    anchor: 'hillfort',
    immediate: true,
  },
  'iron-ore': {
    name: 'Bohatá železná ruda',
    skeleton: false,
    anchor: 'mining-town',
    immediate: true,
  },
  'fine-clay': {
    name: 'Dobrá keramická hlína',
    skeleton: false,
    anchor: 'large-village',
    immediate: true,
  },
  'oak-beech': {
    name: 'Doubravy a bučiny',
    skeleton: false,
    anchor: 'large-village',
    immediate: true,
  },
  floodplain: {
    name: 'Rozsáhlé nivní louky',
    skeleton: false,
    anchor: 'large-village',
    immediate: true,
  },
  'south-slopes': {
    name: 'Teplé jižní svahy',
    skeleton: false,
    anchor: 'large-village',
    immediate: true,
  },
  'sacred-mountain': {
    name: 'Posvátná hora',
    skeleton: false,
    anchor: 'cult-site',
    immediate: true,
  },
  'sacred-spring': {
    name: 'Posvátný nebo léčivý pramen',
    skeleton: false,
    anchor: 'cult-site',
    immediate: true,
  },
  confluence: {
    name: 'Soutok dvou toků',
    skeleton: true,
    anchor: 'hillfort',
    immediate: true,
  },
  'natural-fortress': {
    name: 'Přirozená pevnost',
    skeleton: false,
    anchor: 'hillfort',
    immediate: false,
  },
  'salt-spring': {
    name: 'Solný pramen',
    skeleton: false,
    anchor: 'market-town',
    immediate: false,
  },
  'wild-bees': {
    name: 'Brtě a lesní včely',
    skeleton: false,
    anchor: 'large-village',
    immediate: false,
  },
  'game-furs': {
    name: 'Hojná zvěř a kožešiny',
    skeleton: false,
    anchor: 'large-village',
    immediate: false,
  },
  'building-stone': {
    name: 'Stavební kámen a vápenec',
    skeleton: false,
    anchor: 'castle',
    immediate: false,
  },
};
