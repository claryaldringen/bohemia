# Rekvizity porážky – licence modelů

Modely vytvořil skript `tools/blender/slaughter.py` (tvary vlastní – kozlina ve dvou velikostech,
necky, špalek s prknem a miska; docs/code/scene-village.md – Porážka ve scéně). Atlas
`slaughter-atlas` skládá:

- **kůru a čela kůlů** z atlasu kmene hatě `../roads/road-log.glb` – kůra a letokruhy pocházejí
  z **0 A.D.** (Wildfire Games, https://play0ad.com) pod licencí **CC BY-SA 3.0**
  (https://creativecommons.org/licenses/by-sa/3.0/) – viz `../roads/LICENSES.md`;
- **prkna, provaz, železo a krev** – procedurálně (vlastní, numpy).

Upravené soubory (atlas, modely) jsou pod stejnou licencí CC BY-SA 3.0. Licence se týká jen
těchto souborů, ne zbytku hry Bohemia.

| Soubor          | Zdroj textury (0 A.D. `art/textures/…`)               | Úprava                                              |
| --------------- | ----------------------------------------------------- | --------------------------------------------------- |
| `slaughter.glb` | `skins/gaia/trunk_beech_a.dds` (kůra přes atlas cest) | kůra a čela vyříznuté z atlasu cest, zbytek vlastní |
