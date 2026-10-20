# Pohřeb žárem – licence modelů

Modely vytvořil skript `tools/blender/funeral.py` (tvary vlastní – máry se zemřelým v plátně,
hranice z polen do kříže, ohořelé zbytky a žhavé uhlíky; docs/design/cemetery.md – Pohřeb ve
scéně). Atlas `funeral-atlas` skládá:

- **kůru a čela polen** z atlasu kmene hatě `../roads/road-log.glb` – kůra a letokruhy, které
  pocházejí z **0 A.D.** (Wildfire Games, https://play0ad.com) pod licencí **CC BY-SA 3.0**
  (https://creativecommons.org/licenses/by-sa/3.0/) – viz `../roads/LICENSES.md`;
- **plátno, provaz, uhel, popel a žhavé uhlíky** – procedurálně (vlastní, numpy).

Upravené soubory (atlas, modely) jsou pod stejnou licencí CC BY-SA 3.0. Licence se týká jen
těchto souborů, ne zbytku hry Bohemia.

| Soubor        | Zdroj textury (0 A.D. `art/textures/…`)                                  | Úprava                                                    |
| ------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `funeral.glb` | `skins/gaia/trunk_beech_a.dds` (kůra přes atlas cest), letokruhy vlastní | kůra a čela polen vyříznuté z atlasu cest, zbytek vlastní |
