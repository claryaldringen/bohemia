# horses – historie (neplatné sekce)

Sem patří části [horses.md](../horses.md), které přestaly platit; zachované doslova. **Nic z tohoto textu neplatí** – platný stav je v horses.md.

## Nákup a prodej koní od souseda

Neplatí od 23. 11. 2026 (Martin 22. 11. 2026: sousedé jsou skutečné vsi a obchod jde přes trhy, [markets.md](../markets.md) – plán 1). Dřív v horses.md:

Tři řádky v panelu obchodu jako u dobytka ([obchod](trade.md) – Dobytek ve třech druzích):

| Druh             | Cena (kg obilí)                         | Proč                                                 |
| ---------------- | --------------------------------------- | ---------------------------------------------------- |
| hříbě (do 3 let) | **800**                                 | víc než mladý vůl (350) – kůň je vzácný, chov dražší |
| chovná klisna    | **1 600**                               | nese chov; víc než vycvičený vůl (1 200)             |
| jezdecký kůň     | **2 400** (3 roky) – **3 600** (12 let) | lineárně podle výcviku; 2–3 vycvičení voli           |

- **Proč 2–3 voli:** údržba koně stála ≈ 1,4× vola (Langdon) a jezdecký kůň byl věc prestiže, ne
  práce; raně středověké sazby dávají koni násobek vola (ripuárské právo – v rešerši 18. 10.
  neověřeno). Přirážky jako u ostatního zboží (soused prodá za 0,96 hodnoty).
- **Koupený jezdecký kůň** přijde se svým věkem a výcvikem (soused prodá koně 3–12 let, ne
  dosluhujícího).
- **Kdo nabízí a shání:** **pastevci** nabízejí hříbata a klisny, jezdecké koně jen některý rok
  (v polovině let); **obilnáři a řemeslníci** shánějí jezdecké koně (jejich vojvodové jezdí taky)
  a – návrh Clauda při implementaci – i hříbata a klisny na vlastní chov, ať má ves komu prodat,
  co jí z chovu přebývá; **lesní ves** koně nemá. Roční množství 1–3 koně každého druhu.
- **Koupené hříbě** má 1–3 roky (odstavené, má vlastní místo) a pohlaví ze seedu, **koupená
  klisna** 4–12 let (návrh Clauda).
- **Ves prodá** hříbata, klisny nad chovné a jezdecké koně bez jezdce – nikdy koně, na kterém
  někdo jezdí. Jezdecké koně napřed nejméně vycvičené; když na žádném nikdo nejezdí, nejlépe
  vycvičený zůstane jako hřebec – i bez klisny (Martin 31. 10. 2026: „Hřebce držet vždy“).
- **Místo:** koupený kůň potřebuje volné místo v ohradě koní („Tolik koní se do ohrady koní
  nevejde.“).
- **Doprava:** po svých s honákem jako dobytek, **honák na 4 koně** (koně se vedou na ohlávce, ne
  ženou).

## Kování – cizí kovář

Neplatí od 23. 11. 2026 (Martin 22. 11. 2026: sousedé jsou skutečné vsi a obchod jde přes trhy, [markets.md](../markets.md) – plán 1). Dřív v horses.md:

- **Cizí kovář**, když vlastní není nebo nemá hřivny: přijde nejbližší soused s kovářem (`nearestCraftsman` z `craft-buying.ts` – cesta jako nákup u sousedů, po stezce nebo krajinou). Ves platí obilím a pak luštěninami. Kování je malý nutný výdaj (≈ 36 kg obilí), proto smí **sáhnout i do pojistky** (návrh Clauda, oprava 26. 10. 2026; `paymentPool(..., intoBuffer)`), ale nikdy tak, aby ves neměla jídlo do příští sklizně (zásoby k příští sklizni − cena ≥ 0; Martin: ves za normálních okolností nemá hladovět). Nákup u sousedů a ohrada koní dál platí jen z přebytku nad pojistkou. Cena = (dny cesty tam i zpět + 0,5 čd na koně) × cena jídla v práci (`foodCosts` – kg obilí na člověkoden) + hřivny za cenu souseda (`buyPrice('ironBars')`).
- **Vlkov (stav v lokální DB 26. 10. 2026):** 1 jezdecký kůň, vlastní kovárna je, ale hřiven má 0,08 kg; nejbližší soused je na východě, 5 dní tam i zpět po stezce. Vlastní kovář vychází na **4,0 čd** (0,5 čd práce + 0,5 kg hřiven oceněných prací na vytavení), cizí na **14,4 čd** – **3,6×** dráž. S rostoucím počtem koní podíl klesá (cesta se rozloží, železo ne): 2 koně 3,0×, 5 koní 2,6×, 10 koní 2,5× – pořád „násobně“, ale pod 3× jen u větších stájí.
