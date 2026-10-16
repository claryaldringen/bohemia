# Herní kalendář

Stav: schváleno 16. 10. 2026. Implementace: `packages/game/src/domain/calendar.ts`.

## Proč

Roční období řídí hospodářský rok vesnic (orba, setí, zrání a sklizeň obilí, zimní zabijačky)
a později i válčení (dostupnost píce, schůdnost cest). Hospodářské práce mají konkrétní data
v roce, kalendář proto musí znát přesné datum – roční období se z něj jen odvozují.

## Pravidla

- **Svět:** skutečný začátek odpovídá 1. 1. roku 500, skutečný konec 1. 1. roku 1500. Mezi nimi
  herní čas plyne rovnoměrně.
- **Ostrý svět:** 1. 1. 2027 00:00 – 1. 1. 2028 00:00 pražského času (zapsáno v kódu).
- **Juliánský kalendář** – přestupný je každý rok dělitelný čtyřmi (gregoriánský přišel až 1582).
  Roky 500–1499 mají dohromady 365 250 dní, v ostrém světě tedy herní den trvá ≈ 86,3 s.
- **Herní datum je čistá funkce skutečného času** – nic se nepočítá tiky, výpadek serveru čas
  neposune.
- **Stav světa:** před začátkem „ještě nezačal“, od konce „skončil“, jinak „běží“ a má herní
  datum (rok, měsíc, den, den v roce, roční období).
- **Opačný převod:** k hernímu dni lze spočítat skutečný okamžik, kdy začíná – podle toho bude
  worker plánovat události.
- **Roční období podle měsíců** (návrh Clauda): jaro od 1. 3., léto od 1. 6., podzim od 1. 9.,
  zima od 1. 12. Konkrétní hospodářské práce si později navážou přímo na data.

## Testovací světy

Lokálně lze začátek a konec světa přepsat proměnnými `WORLD_START` a `WORLD_END` (ISO 8601,
vždy obě). Například svět od dneška, nebo zrychlený svět, kde rok uběhne za pár minut. Svět musí
trvat aspoň 365 250 ms (≈ 6 minut), aby na každý herní den připadla aspoň milisekunda.

## Zobrazení

Malé datum v pravém horním rohu herní plochy (`/game`), např. „16. října 1024 · podzim“,
průběžně aktualizované. Před začátkem světa ukazuje „Svět začne 1. 1. 2027“. Vzhled se doladí
později.

## Mimo rozsah

Svátky, počasí, střídání dne a noci a hospodářské práce – přijdou s dalšími mechanikami.
