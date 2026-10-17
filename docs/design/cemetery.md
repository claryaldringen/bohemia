# Hřbitov (pohřebiště) vesnice

Stav: schváleno 17. 10. 2026 (Martin: „Ukazatel hygieny nebude. Prostě to bude mít vliv na
populaci. Ohledně ostatního sis to domyslel dobře.“). Implementováno 17. 10. 2026: jádro
`packages/game/src/domain/village/cemetery.ts`, umístění `cemeteryPartsFromCells`, scéna
`apps/web/lib/scene/cemetery-renderer.ts`, Hřbitov [V] v mřížce staveb; čtverce navazující
stranou na hřbitov ho rozšíří (Martin). Hřbitov se zatím jako
pole nesmí zakládat v lese (mýcení přijde později) a překážky stojí 0 – vrstva překážek ještě
není (fields.md).

## Proč

Mrtví se musí někam pohřbít. Dobře umístěné a dost velké pohřebiště drží ves zdravou; žádné,
plné nebo moc blízko obydlí či vody zhorší hygienu a lidé víc umírají (Martin). Hráč tak řeší
další rozhodnutí o místě v krajině – vedle obydlí a polí.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** hráč postaví pohřebiště a na jeho poloze a velikosti záleží (Martin).
- **Cíl:** špatná hygiena se projeví jen statisticky na úmrtnosti – **žádný ukazatel hygieny**
  (Martin). Hráč pozná následky v kronice a na počtu lidí.
- **Ne-cíl (teď):** obřady, pohřební zvyky jako mechanika, víra, nemoci a epidemie jako
  samostatné události, znovupoužití starých hrobů.
- **Anti-cíl:** ves, která vymře jen proto, že hráč pár dní nebyl online – vliv hygieny je
  mírný a hájení prvních 30 let chrání i před ním (návrh Clauda, Martin potvrdil).

## Pravidla

- **Stavba:** hráč pohřebiště zakládá **po čtvercích** jako pole – políčka krajiny 15 × 15 m
  (návrh Clauda, Martin potvrdil). Nesmí ležet ve vodě, na obydlí ani na poli. Založení stojí
  práci jako stavba ze společné práce vsi: vytyčení a ohrazení **10 člověkodní na čtverec**
  (návrh Clauda) + překážky jako u polí.
- **Velikost:** každý pohřbený zabere **4 m²** i s uličkami – na čtverec se vejde 56 hrobů
  (návrh Clauda). Hroby se zatím znovu nepoužívají, pohřebiště se postupně plní a hráč ho musí
  rozšiřovat. Kdo zemře a nemá kde ležet, je to jako by ves pohřebiště neměla.
- **Hygiena** (vnitřní číslo 0–1, hráč ho nevidí – Martin):
  - **0**, když ves nemá pohřebiště s volným místem (žádné, nebo všechna plná),
  - jinak podle **vzdálenosti** nejlepšího pohřebiště s volným místem: od nejbližšího obydlí
    plně v pořádku od **150 m**, nejhorší pod **50 m**; od vody (potok) v pořádku od **100 m**,
    nejhorší pod **30 m**; mezi tím plynule; obojí se násobí (návrh Clauda).
- **Vliv na úmrtnost:** roční riziko úmrtí se násobí `1 + extra × (1 − hygiena)`, kde `extra` je
  **0,3 u dospělých a starších a 0,5 u dětí** (návrh Clauda) – stejný statistický mechanismus jako
  hlad a přeplněnost ([populace](population.md)). **Hájení** prvních 30 let platí i tady.
- **Pohřeb:** zemřelý obsadí hrob v pohřebišti s volným místem (nejbližším k obydlím); kronika
  zapíše, když se pohřebiště zaplní.

## Co hráč vidí

- V nabídce staveb **Hřbitov** (cena za čtverec), umisťování po čtvercích jako pole; během
  umisťování varování, když je místo moc blízko obydlí nebo vody (důvod v bublině).
- V panelu vsi u pohřebiště **kolik místa zbývá** (hroby a odhad na kolik let) – ne hygiena.
- Ve scéně ohrazené pohřebiště; podle doby by mohlo vypadat jinak – v 6.–8. století žárové hroby
  a mohylky, od 9. století kostrové hroby (nápad na později).

## Naměřeno

`measure-village.ts 200 60` (17. 10. 2026). Hráč, který staví, založí hřbitov hned po první
zemnici (200 m od obydlí, 150 m od vody) a rozšíří ho o čtverec, když je z 80 % plný: na konci
60 let medián 31 lidí a 6 domácností, nasycení ≥ 0,95 celý rok 94,1 % let, vymření žádné
(0 z 200) – stejně jako před zavedením hřbitova (31, 6, 94,0 %). Jediná domácnost bez staveb
(ani hřbitova – po 30 letech hájení hygiena 0) vymře do 60 let ve 2 % vsí místo 0,5 %;
nasycení ≥ 0,95 u ní 97,6 % let místo 98,2 %. Čísla se neladila.

## Rozhodnutí

| Rozhodnutí                                                                            | Kdo                           |
| ------------------------------------------------------------------------------------- | ----------------------------- |
| Hráč staví hřbitov; musí být dobře umístěný a dost velký                              | Martin                        |
| Blízko vsi, blízko vody, plný nebo žádný → horší hygiena → vyšší úmrtnost             | Martin                        |
| Žádný ukazatel hygieny, jen vliv na populaci                                          | Martin                        |
| Po čtvercích jako pole; vzdálenosti 150 / 50 m od obydlí a 100 / 30 m od vody         | návrh Clauda, Martin potvrdil |
| Hrob 4 m², hroby se neopakují; extra úmrtnost 0,3 / 0,5; hájení chrání; 10 čd/čtverec | návrh Clauda, Martin potvrdil |
