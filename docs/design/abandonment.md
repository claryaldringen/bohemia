# Opuštěné stavby chátrají

Stav: schváleno 18. 10. 2026 (Martin: „Jo ty stavby, kam nikdo nechodí, budou postupně chátrat
a rozpadnou se“ a k návrhu „Ano, udělej to tak“), **implementováno 18. 10. 2026** – jádro
`domain/village/abandonment.ts` (roční kontrola a pád, provoz ke stavbám z roční sítě cest
`PathNetwork.visits`), scéna `apps/web/lib/scene/structure-decay.ts` (stupně rozpadu) a díly
modelů z `tools/blender/sacred.py` a `pen.py`. Čísla jsou návrh Clauda ověřený rešerší
[research/2026-10-18-abandonment.md](research/2026-10-18-abandonment.md).

## Proč

Ves se mění – domy se stěhují, nové stavby vznikají jinde a ke starým se přestane chodit. Opuštěná
obydlí už chátrají a rozpadají se ([population.md](population.md) – Chátrání a přestavba), ostatní
stavby stály věčně. Martin: stavby, kam nikdo nechodí, mají postupně chátrat a rozpadnout se –
krajina si pamatuje, kudy ves žila, a hráč vidí, co opustil.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** stavba, ke které léta nikdo nechodí, viditelně chátrá a nakonec spadne (Martin).
- **Cíl:** „kam nikdo nechodí“ se pozná ze stejného výpočtu jako pevné cesty – z roční sítě cest
  ([roads.md](roads.md)), ne z nového pravidla.
- **Ne-cíl (teď):** údržba staveb jako práce, oprava zchátralé stavby hráčem, chátrání polí,
  sadů, cest a řemeslných dílen (dílny čekají na díly rozpadu – population.md).
- **Anti-cíl:** stavba, která spadne, i když k ní lidé chodí; stavba, která chátrá skokem.

## Opuštěná stavba

- **Opuštěná** je stavba, ke které podle **roční sítě cest** za celý uplynulý rok **nevedla žádná
  cesta** (Martin). Roční síť se počítá 1. 11. stejnou funkcí jako pevné cesty a pěšiny dne
  (`computePathNetwork` – provoz z celoroční práce po místech, voda, dřevo, sousedé, zavedená
  místa); nově vrací i **provoz ke stavbám** – kolik cest za den vede ke které modle, svatyni,
  hřbitovu a ohradě (`PathNetwork.visits`; počítají se jen domácnosti, ke kterým se trasa našla).
- Ke **zavedeným místům** – modle, svatyni a hřbitovu – chodí každá domácnost **jen k nejbližšímu
  místu druhu** ([paths.md](paths.md), Martin), takže vzdálená modla, kterou má každý dům dál než
  jinou, žádný provoz nemá. Do ohrady se chodí krmit dobytek – **ohrada bez zvířat** provoz nemá
  (jen když v ní ten rok někdo pracoval – stavba rádla).
- **Ohrada se zvířaty** (spřežení, telata ve výcviku nebo krávy, které v ní přes zimu stojí)
  opuštěná není nikdy (Martin); když se do chátrající ohrady vrátí zvířata, chátrání se zastaví
  hned, ne až při další kontrole (návrh Clauda – se zvířaty nesmí spadnout).
- **Stavba dokončená během posledního roku** opuštěná není – lidé k ní chodili stavět (návrh
  Clauda).
- **Bez krajiny** (kalibrace, testy) síť cest není a nic se neopouští.

## Chátrání

- Opuštěná stavba ztrácí **stav** rovnoměrně od dne roční kontroly, která ji za opuštěnou uznala,
  a spadne, když stav dojde na nulu:

  | Stavba            | Spadne za (od plného stavu) | Co je to za dřevo (rešerše)                                    |
  | ----------------- | --------------------------- | -------------------------------------------------------------- |
  | modla             | **20 let**                  | dubový kůl Ø ≈ 0,5 m v zemi – hnije v úrovni země, nakloní se  |
  | svatyně           | **30 let**                  | ústřední modla ×1,55 (Ø ≈ 0,73 m), ohniště vyhasnou hned       |
  | plot hřbitova     | **10 let** (návrh byl 15)   | pletený lískový plot na kůlech – bez údržby 7–8 let, kůly déle |
  | ohrada bez zvířat | **10 let**                  | pletený plot a přístřešek s doškovou pultovou střechou         |

- **Znovu navštívená** stavba chátrat přestane – stav se **nezvedá** (jako u obydlí: obyvatelé
  opravují, ale co spadlo, nepostaví). Když ji pozdější kontrola zase uzná za opuštěnou, chátrá
  dál od stavu, na kterém se zastavila.
- Stavba se mezi kontrolami nemění skokem – stav je čistá funkce dne (stav v den opuštění
  − uplynulé dny / doba pádu); ves si pamatuje jen stav a den opuštění.

## Následky

- **Modla a svatyně** dávají štěstí ([happiness.md](happiness.md)), **dokud stojí** – i zchátralé.
  Po pádu ne (zmizí z hotových posvátných staveb; svatyni jde postavit novou).
- **Padlá modla** leží **10 let** jako zbytek (kmen na zemi, zarůstá) a zmizí; **ze svatyně**
  zbude **zarostlý příkop** s valem, který **20 let** zarůstá a zmizí (příkop se ustálí za 7–10
  let, archeologicky by zůstal staletí – ve hře zmizí kvůli přehlednosti). Zbytky jsou jen vzhled
  – na jejich místo jde stavět a stavba je odstraní (jako zbytek jámy obydlí).
- **Hřbitov:** rozpadne se jen **plot** – mohylky zůstanou a zarostou, **pohřbívat se dá dál**
  a hygiena se nemění. **Oprava plotu – návrh Clauda: nic.** Plot se sám neobnoví; když se ke
  hřbitovu začne znovu chodit, chátrání se zastaví na tom, co z plotu zbylo. Až to Martin bude
  chtít, oprava plotu jako malá stavba ze společné práce (≈ 3 člověkodny na čtverec – třetina
  vytyčení a ohrazení), kterou hráč zadá v panelu hřbitova.
- **Ohrada** se rozpadne a **zmizí** – čtverec je volný.
- **Kronika a krátké mizející řádky** (fakt): „Modla padla“, „Svatyně se rozpadla“, „Plot hřbitova
  se rozpadl“, „Ohrada se rozpadla“.

## Co hráč vidí

- **Stupně rozpadu** podle stavu (návrh Clauda, jako u obydlí – ≥ 70 % celá, ≥ 45 % sešlá, ≥ 20 %
  nakloněná, pod 20 % rozpadlá):
  - **modla:** celá → **sešlá** (zšedlé dřevo s mechem a lišejníkem, obětiny a stužka pryč) →
    **nakloněná** (shnilá pata, kůl se kloní, klínové kameny rozvalené) → **rozpadlá** (silně
    nakloněná, prasklá) → **zbytek** (modla leží na zemi a zarůstá),
  - **svatyně:** ohniště vyhasnou hned po opuštění; sešlá → nakloněná modla uprostřed → rozpadlá
    (modla se kácí, dlažba zarůstá) → **zarostlý příkop** s valem,
  - **plot hřbitova a ohrady:** stejný pletený plot jako u pozemku polozemnice – nejdřív
    vypadávají větve, kůly se kloní, nakonec zbudou pahýly (`decayFence`), mohylky na hřbitově
    zarůstají trávou,
  - **ohrada:** přístřešek s vybledlými a prořídlými došky, pak propadlá střecha a nakonec jen
    sloupy; jesle a žlab zarůstají.
- **Panel výběru** modly, svatyně, hřbitova a ohrady: ikona stavu s procenty (jako u obydlí)
  a ikona **opuštěno**, když stavba chátrá – bez textů navíc.
- Mění se jen při změně dat (stupeň po krocích stavu), nic se nepřekresluje každý snímek.

## Ve Vlkově (18. 10. 2026)

Martinova ves Vlkov (lokální DB, uložená k 30. 12. 699) má 8 model: 7 ve skupině ≈ 600–650 m od
domů u potoka a jednu ≈ 330 m. Každý dům má nejblíž tu jednu – ke skupině sedmi nikdo nechodí.

- **1. 11. 700** je roční kontrola uzná za opuštěné a začnou chátrat; sešlé jsou od ≈ 706,
  nakloněné od ≈ 711, rozpadlé od ≈ 716 a **1. 11. 720 všech sedm padne** („Modla padla“
  7×). Padlé modly leží do **1. 11. 730**, pak zmizí.
- Modla ≈ 330 m od domů, ohrada se spřežením a hřbitov dál navštěvované – nechátrají.
- **Štěstí se nezmění:** posvátná místa dávají +40 (strop) před i po – počítají se nejvýš 2 modly,
  po pádu zůstane jedna (+8 místo +16), duby (17) a háje (30) strop drží samy.

## Rozhodnutí

| Rozhodnutí                                                                                          | Kdo                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------ |
| Stavby, kam nikdo nechodí, postupně chátrají a rozpadnou se                                         | Martin                         |
| Opuštěná = za uplynulý rok k ní podle roční sítě cest nevedla žádná cesta                           | Martin                         |
| Ohrada se zvířaty se nepovažuje za opuštěnou; znovu navštívená stavba přestane chátrat (nezvedá se) | Martin                         |
| Modla 20, svatyně 30, plot hřbitova 10 (místo 15), ohrada bez zvířat 10 let do pádu                 | návrh Clauda (rešerše)         |
| Zbytek modly 10 let, zarostlý příkop svatyně 20 let; zbytky jen vzhled                              | návrh Clauda (rešerše)         |
| Štěstí z modly a svatyně, dokud stojí; hřbitov bez plotu pohřbívá dál; ohrada zmizí                 | Martin (zadání)                |
| Do ohrady bez zvířat se krmit nechodí (síť pěšin) – zvířata se vrátí → chátrání se zastaví hned     | návrh Clauda                   |
| Stavba dokončená za poslední rok opuštěná není                                                      | návrh Clauda                   |
| Oprava plotu hřbitova zatím žádná (možná malá stavba z panelu)                                      | návrh Clauda – rozhodne Martin |
| Stupně rozpadu ≥ 70 / 45 / 20 % jako u obydlí; panel – ikona stavu s % a ikona opuštěno             | návrh Clauda                   |

## Na stavitelích

- Jádro: `abandonment.ts` – `abandonmentCheck` (1. 11. s provozem z `roadsDay`) a `abandonmentDay`
  (pád, zbytky) z `simulateDay`; stav `SacredBuilding.wear`, `Cemetery.fenceWear`, `Pen.wear`
  (`StructureWear` – stav a den opuštění), `VillageState.sacredRuins`; čísla `ABANDONMENT`
  v `rules.ts`. Staré vsi záznamy nemají – začínají s plným stavem.
- Síť pěšin: `TripGroup.visit` → `PathNetwork.visits`, `PathVillage.pens[].stocked`.
- Zbytek pod novou stavbou zmizí při dopočtu dalšího dne (kontrola jen kolem zbytků – ≈ 30 ms za
  rok i ve Vlkově s 1 800 díly polí). Ohrada, do které se vrátila zvířata, má stav aspoň 1 %
  (se zvířaty nespadne).
- Scéna: `structure-decay.ts` (stupně a díly), `sacred-renderer.ts` (díly rozpadu se načtou až
  s první chátrající stavbou – `sacred-decay.glb`, zarostlý příkop svatyně dostane trávu terénu),
  `pen-renderer.ts` (`pen-decay.glb`), `cemetery-renderer.ts` (plot `decayFence`, mohylky
  zarůstají). Ukázka **Rozpad staveb** na `/dev/buildings` se stejným posuvníkem jako obydlí.
