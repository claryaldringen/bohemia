# Opuštěné stavby chátrají

Stav: schváleno 18. 10. 2026 (Martin: „Jo ty stavby, kam nikdo nechodí, budou postupně chátrat
a rozpadnou se“ a k návrhu „Ano, udělej to tak“), **implementováno 18. 10. 2026** – jádro
`domain/village/abandonment.ts` (roční kontrola a pád, provoz ke stavbám z roční sítě cest
`PathNetwork.visits`), scéna `apps/web/lib/scene/structure-decay.ts` (stupně rozpadu) a díly
modelů z `tools/blender/sacred.py` a `pen.py`. Čísla jsou návrh Clauda ověřený rešerší
[research/2026-10-18-abandonment.md](research/2026-10-18-abandonment.md). **Oprava** staveb, ke
kterým se zase chodí (Martin 19. 10. 2026), je **implementovaná 19. 10. 2026** – jádro
`domain/village/repair.ts` (sekce Oprava).

## Proč

Ves se mění – domy se stěhují, nové stavby vznikají jinde a ke starým se přestane chodit. Opuštěná
obydlí už chátrají a rozpadají se ([population.md](population.md) – Chátrání a přestavba), ostatní
stavby stály věčně. Martin: stavby, kam nikdo nechodí, mají postupně chátrat a rozpadnout se –
krajina si pamatuje, kudy ves žila, a hráč vidí, co opustil.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** stavba, ke které léta nikdo nechodí, viditelně chátrá a nakonec spadne (Martin).
- **Cíl:** „kam nikdo nechodí“ se pozná ze stejného výpočtu jako pevné cesty – z roční sítě cest
  ([roads.md](roads.md)), ne z nového pravidla.
- **Cíl:** stavbu, ke které se lidé vrátí, vesničané sami opraví (Martin, 19. 10. 2026 – Oprava).
- **Ne-cíl (teď):** běžná údržba navštěvované stavby jako práce, oprava na pokyn hráče (opravují
  vesničané sami), obnova spadlé modly, svatyně a ohrady (staví se znovu), chátrání polí, sadů,
  cest a řemeslných dílen (dílny čekají na díly rozpadu – population.md).
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

- **Znovu navštívená** stavba chátrat přestane a vesničané ji **opraví** (sekce Oprava –
  Martin 19. 10. 2026); sám od sebe se stav nezvedá, roste jen s prací opravy. Když ji pozdější
  kontrola zase uzná za opuštěnou, chátrá dál od stavu, na kterém se zastavila (i rozpracovaná
  oprava).
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
  a hygiena se nemění. **Spadlý plot zmizí úplně** – žádné pahýly ani kůly (Martin, 19. 10. 2026:
  „Úpravy hřbitova – starému hřbitovu plot zmizí úplně, zůstanou jen mohylky.“). Když se ke
  hřbitovu začne znovu chodit, vesničané plot opraví a **spadlý postaví znovu** (sekce Oprava –
  Martin, 19. 10. 2026).
- **Námět (nerozhodnuto – Martin mluvil jen o hřbitovu):** stejně by mohl úplně zmizet i plot
  ohrady. Ta ale dnes po pádu zmizí celá (i přístřešek), takže pahýly zůstávají jen u rozpadlé
  ohrady, která ještě stojí – mezi 10 % a pádem. Kdyby měla rozpadající se ohrada působit
  čistěji, stačí jí plot schovat od nejnižšího stupně rozpadu.
- **Ohrada** se rozpadne a **zmizí** – čtverec je volný.
- **Kronika a krátké mizející řádky** (fakt): „Modla padla“, „Svatyně se rozpadla“, „Plot hřbitova
  se rozpadl“, „Ohrada se rozpadla“; po opravě „Modla opravena“, „Svatyně opravena“, „Plot
  hřbitova opraven“, „Ohrada opravena“.

## Oprava

Martin (19. 10. 2026) vybral pro plot hřbitova variantu a: **vesničané plot opraví sami, jakmile
se ke hřbitovu zase chodí – postupně, z práce vsi, a spadlý plot postaví znovu** (stejný princip
jako „obydlená budova nechátrá – obyvatelé ji opravují“ a jako obnova sadu, kterou vesničané
dělají sami – [orchard.md](orchard.md)). Na otázku „Chceš, aby si vesničané stejně opravovali
i modlu, svatyni a ohradu, ke kterým se zase začne chodit?“ odpověděl „ano“. Podrobnosti jsou
návrh Clauda.

- **Kdy:** stavba, kterou roční kontrola cest (1. 11.) uzná za **navštěvovanou** a která má **stav
  pod 100 %**, dostane opravu – hned při kontrole, která chátrání zastavila; ohrada už v den, kdy
  se do ní vrátí zvířata (chátrání se tehdy zastaví hned). Opravuje se jen **stojící stavba**:
  padlá modla, svatyně a ohrada zmizely a zbyl po nich jen zbytek – hráč je staví znovu jako
  dřív. **Plot hřbitova se postaví znovu i spadlý** – hřbitov dál stojí. Dokud oprava běží, další
  se nezakládá.
- **Jak:** oprava je **stavba ze společné práce** jako obnova sadu – nečeká na hráče ani na
  suroviny a bere společnou práci rovným dílem s ostatními stavbami. **Kdykoli v roce** (návrh
  Clauda): společná práce je jen to, co zbude po polích, takže v polních špičkách oprava sama
  počká – okno navíc by nic nepřidalo; začíná 1. 11. po sklizni, kdy je volné práce nejvíc
  a proutí na pletení se řeže v době vegetačního klidu. **Dřevo nebere** – pruty, sláma a drn
  nejsou surovina, nosné kůly, sloupy a jesle vydrží.
- **Cena** = podíl z ceny stavby bez kácení × chybějící stav (návrh Clauda – opravuje se jen to,
  co chátrá; `STRUCTURE_REPAIR` v `rules.ts`):

  | Stavba        | Podíl | Plná oprava (ze stavu 0)           | Co se opravuje                                                                                                                    |
  | ------------- | ----- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
  | plot hřbitova | 0,3   | 3 čd na hotový čtverec (z 10 čd)   | plot je třetina vytyčení a ohrazení; spadlý plot celý znovu – kůly i pletení                                                      |
  | modla         | 0,25  | 7 čd (z 28 čd bez kácení dubu)     | řezba a dubový kůl vydrží – vyprostit a znovu usadit nakloněný kůl, zaklínovat kameny, očistit od mechu, nové obětiny a stužka    |
  | svatyně       | 0,25  | ≈ 98 čd (z 394 čd bez kácení dubů) | příkop, val a ústřední modla vydrží – vyčistit zanesený příkop, narovnat a usadit modlu, založit ohniště                          |
  | ohrada        | 0,5   | 14 čd (z 28 čd bez kácení stromů)  | pletený plot (7–8 let) a došky (sláma bez údržby 15–20 let – rešerše) hnijí – nové pletení a krytina; sloupy, jesle a žlab vydrží |

  Příklad: modla se stavem 45 % – 7 × 0,55 ≈ 3,9 čd; spadlý plot hřbitova o 6 čtvercích 18 čd.

- **Průběh:** stav stavby roste s prací rovnoměrně od stavu při zahájení do 100 %; po dokončení je
  stavba celá (záznam chátrání zmizí) – kronika a krátký mizející řádek „Modla opravena“,
  „Svatyně opravena“, „Plot hřbitova opraven“, „Ohrada opravena“.
- **Znovu opuštěná:** když stavbu během opravy pozdější roční kontrola uzná za opuštěnou, oprava
  se zruší – **co vesničané spravili, zůstane** (stav, na kterém oprava skončila) a stavba od
  něj chátrá dál (návrh Clauda – spravené proutí nezmizí). Práce opravy vede ke stavbě cesty
  roční sítě – oprava, na které se pracuje, drží stavbu navštěvovanou.
- **Co hráč vidí:** díly rozpadu se vracejí podle rostoucího stavu – stupně jdou opačně
  (rozpadlá → nakloněná → sešlá → celá), pletený plot se splétá zpět (větve přibývají, kůly se
  narovnají, spadlý plot vyroste z pahýlů), mohylky přestanou zarůstat. **Ohniště svatyně se
  rozhoří až po opravě.** Panel výběru ukáže opravu jako průběh stavby (pruh „Oprava“, u hřbitova
  „Oprava plotu“) vedle ikony stavu; lidé pracují u stavby – u plotu hřbitova po obvodu jako při
  ohrazení, u ohrady za plotem, u modly a svatyně kolem půdorysu.
- **Starší vsi** se načtou beze změny – oprava začne až nejbližší roční kontrolou.

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
    zarůstají trávou; spadlý plot hřbitova zmizí úplně, mohylky zůstanou (Martin, 19. 10. 2026),
  - **ohrada:** přístřešek s vybledlými a prořídlými došky, pak propadlá střecha a nakonec jen
    sloupy; jesle a žlab zarůstají.
- **Panel výběru** modly, svatyně, hřbitova a ohrady: ikona stavu s procenty (jako u obydlí)
  a ikona **opuštěno**, když stavba chátrá – bez textů navíc; při opravě pruh průběhu (Oprava).
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
- **Oprava (19. 10. 2026) na tom nic nemění:** k sedmi modlám nikdo nechodí, takže opravu
  nedostanou, a navštěvované stavby jsou celé.

## Rozhodnutí

| Rozhodnutí                                                                                           | Kdo                    |
| ---------------------------------------------------------------------------------------------------- | ---------------------- |
| Stavby, kam nikdo nechodí, postupně chátrají a rozpadnou se                                          | Martin                 |
| Opuštěná = za uplynulý rok k ní podle roční sítě cest nevedla žádná cesta                            | Martin                 |
| Ohrada se zvířaty se nepovažuje za opuštěnou; znovu navštívená stavba přestane chátrat               | Martin                 |
| Modla 20, svatyně 30, plot hřbitova 10 (místo 15), ohrada bez zvířat 10 let do pádu                  | návrh Clauda (rešerše) |
| Zbytek modly 10 let, zarostlý příkop svatyně 20 let; zbytky jen vzhled                               | návrh Clauda (rešerše) |
| Štěstí z modly a svatyně, dokud stojí; hřbitov bez plotu pohřbívá dál; ohrada zmizí                  | Martin (zadání)        |
| Do ohrady bez zvířat se krmit nechodí (síť pěšin) – zvířata se vrátí → chátrání se zastaví hned      | návrh Clauda           |
| Stavba dokončená za poslední rok opuštěná není                                                       | návrh Clauda           |
| Plot hřbitova vesničané opraví sami, jakmile se ke hřbitovu zase chodí – z práce vsi, i spadlý       | Martin, 19. 10. 2026   |
| Spadlý plot starého hřbitova zmizí úplně, zůstanou jen mohylky                                       | Martin, 19. 10. 2026   |
| Stejně se opravuje modla, svatyně a ohrada; spadlé se neobnovují (staví se znovu)                    | Martin, 19. 10. 2026   |
| Oprava od roční kontroly (ohrada i po návratu zvířat), stavba ze společné práce kdykoli v roce       | návrh Clauda           |
| Cena = podíl ceny bez kácení × chybějící stav: plot 0,3, modla a svatyně 0,25, ohrada 0,5; bez dřeva | návrh Clauda           |
| Znovu opuštěná: oprava se zruší, spravené zůstane; ohniště svatyně se rozhoří až po opravě           | návrh Clauda           |
| Stupně rozpadu ≥ 70 / 45 / 20 % jako u obydlí; panel – ikona stavu s % a ikona opuštěno              | návrh Clauda           |

## Na stavitelích

- Jádro: `abandonment.ts` – `abandonmentCheck` (1. 11. s provozem z `roadsDay`) a `abandonmentDay`
  (pád, zbytky) z `simulateDay`; stav `SacredBuilding.wear`, `Cemetery.fenceWear`, `Pen.wear`
  (`StructureWear` – stav a den opuštění), `VillageState.sacredRuins`; čísla `ABANDONMENT`
  v `rules.ts`. Staré vsi záznamy nemají – začínají s plným stavem.
- Oprava: `repair.ts` – stavba `kind: 'repair'` s `Construction.repair` (`StructureRepair` – druh,
  id a stav při zahájení), `startRepair` / `cancelRepair` z roční kontroly a z `abandonmentDay`
  (ohrada se zvířaty), `workRepair` (stav roste s prací) a `finishRepair` (kronika
  `structure-repaired`) přes stavby ze společné práce v `simulate.ts`; čísla `STRUCTURE_REPAIR`
  v `rules.ts`. Rozdělení práce: plot hřbitova `cemetery`, ohrada `pen`, modla a svatyně
  `repair` u cíle `{ kind: 'sacred', id }` – i to je v síti pěšin provoz ke stavbě.
- Síť pěšin: `TripGroup.visit` → `PathNetwork.visits`, `PathVillage.pens[].stocked`.
- Zbytek pod novou stavbou zmizí při dopočtu dalšího dne (kontrola jen kolem zbytků – ≈ 30 ms za
  rok i ve Vlkově s 1 800 díly polí). Ohrada, do které se vrátila zvířata, má stav aspoň 1 %
  (se zvířaty nespadne).
- Scéna: `structure-decay.ts` (stupně a díly), `sacred-renderer.ts` (díly rozpadu se načtou až
  s první chátrající stavbou – `sacred-decay.glb`, zarostlý příkop svatyně dostane trávu terénu),
  `pen-renderer.ts` (`pen-decay.glb`), `cemetery-renderer.ts` (plot `decayFence`, mohylky
  zarůstají). Ukázka **Rozpad staveb** na `/dev/buildings` se stejným posuvníkem jako obydlí,
  přepínač **Oprava staveb** ukáže opravu (posuvník = průběh opravy, ohniště až po opravě –
  `SceneSacred.buildings[].repairing`).
