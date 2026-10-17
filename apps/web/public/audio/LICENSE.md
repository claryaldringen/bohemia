# Licence zvuků

Repozitář je veřejný – zvuky smí mít jen licenci, která šíření dovoluje (CC0, nebo CC BY-SA
s uvedením autora).

## ambient/

Ambientní zvuky ze hry **0 A.D.** – autor **Wildfire Games** (https://www.wildfiregames.com/),
licence [Creative Commons Attribution-ShareAlike 3.0](http://creativecommons.org/licenses/by-sa/3.0/).

Úpravy: převedeno skriptem `tools/audio/ambient.sh` (ffmpeg) z Ogg Vorbis do Opus ve WebM
(48 kHz) – převzorkováno na 48 kHz, změněná hlasitost (ptáci dne +20 dB, vítr v listí +24 dB),
zpěv ptáků smíchaný do mona. Smyčky (`birds-day`, `stream-*`) jsou zkrácené a jejich konec je
prolnutý do začátku (ptáci dne 4 s, potok 2 s), aby hrály bez švu; u `birds-day` je použito
prvních 96 s. Upravené soubory jsou šířeny pod stejnou licencí CC BY-SA 3.0. Licence se týká
jen těchto souborů, ne zbytku hry Bohemia.

| Soubor               | Původní soubor (binaries/data/mods/public/audio/ambient/) |
| -------------------- | --------------------------------------------------------- |
| `birds-day.webm`     | `dayscape/day_temperate_gen_03.ogg`                       |
| `birdsong-1.webm`    | `dayscape/day_temperate_11.ogg`                           |
| `birdsong-2.webm`    | `dayscape/day_temperate_12.ogg`                           |
| `birdsong-3.webm`    | `dayscape/day_temperate_13.ogg`                           |
| `birdsong-4.webm`    | `dayscape/day_temperate_14.ogg`                           |
| `leaves-1.webm`      | `weather/windleaves_10.ogg`                               |
| `leaves-2.webm`      | `weather/windleaves_11.ogg`                               |
| `stream-slow.webm`   | `water/river_slow_21.ogg`                                 |
| `stream-medium.webm` | `water/river_med_21.ogg`                                  |
| `stream-fast.webm`   | `water/river_fast_21.ogg`                                 |
