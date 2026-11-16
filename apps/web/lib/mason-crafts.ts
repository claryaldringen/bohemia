// Obory mistrů stavební huti – jeden zdroj názvů a ikon pro tlačítka huti (LodgeButtons) i role
// lidí (person-roles). Čistý modul bez Reactu, ať ho smí číst i server.
import type { MasonCraft } from '@bohemia/game';

/** Obory mistrů: název a ikona (`tools/blender/icons.py`). */
export const MASON_CRAFT_LABELS: Record<MasonCraft, { name: string; icon: string }> = {
  builder: { name: 'Stavbyvedoucí', icon: '/icons/house/mason-builder.png' },
  limeBurner: { name: 'Vápeník', icon: '/icons/house/mason-limeburner.png' },
  stonemason: { name: 'Kameník', icon: '/icons/house/mason-stonemason.png' },
  mason: { name: 'Zedník', icon: '/icons/house/mason-mason.png' },
  plasterer: { name: 'Štukatér a malíř', icon: '/icons/house/mason-plasterer.png' },
};
