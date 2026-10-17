#!/usr/bin/env bash
# Převod ambientních zvuků z 0 A.D. (Wildfire Games, CC BY-SA 3.0) do
# apps/web/public/audio/ambient/ – Opus ve WebM, 48 kHz.
#
# Použití (z kořene repa):
#   tools/audio/ambient.sh <0ad>/binaries/data/mods/public/audio/ambient
#
# Smyčky (ptáci, potok) jsou bez švu (konec plynule prolnutý do začátku) a mají délku N vzorků
# takovou, že N + 312 je násobek 960: kodér Opus pak na konec nepřidá výplň a dekodér, který neumí
# zahodit úvodních 312 vzorků (pre-skip), vrátí přesně N + 312 vzorků – přehrávač pozná, kde
# smyčka začíná (`loopRegion` v apps/web/lib/scene/ambient-sound.ts).
set -euo pipefail

SRC=${1:?Zadej cestu k binaries/data/mods/public/audio/ambient z 0 A.D.}
OUT=${2:-apps/web/public/audio/ambient}
RATE=48000
FRAME=960
PRESKIP=312
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ambient.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

encode() {
  # encode VSTUP VÝSTUP DATOVÝ_TOK [FILTR]
  ffmpeg -v error -y -i "$1" ${4:+-filter_complex "$4"} -c:a libopus -b:a "$3" \
    -frame_duration 20 -application audio -map_metadata -1 -fflags +bitexact \
    -metadata artist='Wildfire Games (0 A.D.)' \
    -metadata copyright='CC BY-SA 3.0 https://creativecommons.org/licenses/by-sa/3.0/' \
    "$OUT/$2.webm"
}

# Převzorkuje na 48 kHz, upraví hlasitost (dB) a počet kanálů; vypíše cestu k WAV.
prepare() {
  # prepare JMÉNO ZDROJ KANÁLY ZESÍLENÍ_DB [DÉLKA_S]
  local mix=''
  [[ $3 == 1 ]] && mix=',pan=mono|c0=0.5*c0+0.5*c1'
  [[ $(ffprobe -v error -show_entries stream=channels -of csv=p=0 "$SRC/$2") == 1 ]] && mix=''
  ffmpeg -v error -y -i "$SRC/$2" ${5:+-t "$5"} \
    -af "aresample=$RATE:filter_size=64,volume=${4}dB$mix" -c:a pcm_f32le "$TMP/$1.wav" || return 1
  echo "$TMP/$1.wav"
}

# Bezešvá smyčka: konec se prolne do začátku (stejný výkon, čtvrtsinus) přes PRELNUTÍ_S sekund.
loop() {
  # loop JMÉNO ZDROJ KANÁLY ZESÍLENÍ_DB DATOVÝ_TOK PRELNUTÍ_S [DÉLKA_S]
  local wav total fade n
  wav=$(prepare "$1" "$2" "$3" "$4" "${7:-}") || exit 1
  total=$(ffprobe -v error -show_entries stream=duration_ts -of csv=p=0 "$wav")
  fade=$(($6 * RATE))
  n=$((total - fade))
  n=$((n - (n + PRESKIP) % FRAME))
  encode "$wav" "$1" "$5" "[0:a]atrim=end_sample=$((n + fade)),asplit[a][b];\
[a]atrim=start_sample=$fade,asetpts=PTS-STARTPTS[body];[b]atrim=end_sample=$fade[head];\
[body][head]acrossfade=ns=$fade:c1=qsin:c2=qsin"
}

# Jednorázový zvuk (přehrává se v náhodném pořadí jako SoundGroup v 0 A.D.).
shot() {
  # shot JMÉNO ZDROJ KANÁLY ZESÍLENÍ_DB DATOVÝ_TOK
  local wav
  wav=$(prepare "$1" "$2" "$3" "$4") || exit 1
  encode "$wav" "$1" "$5"
}

# Ptáci přes celý den – v 0 A.D. hraje tahle stopa jako ambient celé hry (gui/session/Ambient.js).
# Posledních ≈ 20 s je skoro ticho, smyčka bere prvních 96 s.
loop birds-day dayscape/day_temperate_gen_03.ogg 2 20 48k 4 96
# Zpěv ptáků u lesa – SoundGroup dayscape/day_temperate.xml (skoro mono).
shot birdsong-1 dayscape/day_temperate_11.ogg 1 0 32k
shot birdsong-2 dayscape/day_temperate_12.ogg 1 0 32k
shot birdsong-3 dayscape/day_temperate_13.ogg 1 0 32k
shot birdsong-4 dayscape/day_temperate_14.ogg 1 0 32k
# Vítr v listí – jednotlivé poryvy.
shot leaves-1 weather/windleaves_10.ogg 1 24 32k
shot leaves-2 weather/windleaves_11.ogg 1 24 32k
# Potok – water/river_slow.xml, river_med.xml, river_fast.xml (vzájemná hlasitost z 0 A.D.).
loop stream-slow water/river_slow_21.ogg 1 0 48k 2
loop stream-medium water/river_med_21.ogg 1 0 48k 2
loop stream-fast water/river_fast_21.ogg 1 0 48k 2

ls -l "$OUT"
