# Vyšlapané pěšiny

Stav: Martin schválil 18. 10. 2026 („Ano, takhle to zní dobře. Zkusme to a uvidíme, jak to bude
vypadat ve hře.“). Stromy podél starých pěšin přes pole – Martin 18. 10. 2026 (v Estonsku
a Dánsku stál statek uprostřed svých polí a cesta k němu vedla přes pole, obvykle lemovaná
stromy). **Pěšiny ovlivňují práci** – Martin 18. 10. 2026 („Tam, kde bude vyšlapaná cesta, ať
se chodí o něco lépe než tam, kde není.“). Síť počítá herní jádro
(`packages/game/src/domain/village/paths/` – `terrain.ts`, `network.ts`, `walking.ts`,
`village.ts`) stejně na serveru i v prohlížeči; scéna `apps/web/lib/scene/path-renderer.ts`,
`path-ribbon.ts`, `path-trees.ts`, `path-router.ts`.

## Proč

Ves má být vidět jako místo, kde se žije: kudy lidé denně chodí, tudy je tráva vyšlapaná.
A po vyšlapané pěšině se chodí lépe – cesta na vzdálené pole po ní stojí méně práce.

## Jak pěšiny vznikají

- **Pěšiny spojují místa, kam lidé chodí každý den:** od brány domu pro vodu k potoku, pro
  dřevo k okraji lesa, na pole, do sadu, ke hřbitovu, k posvátným dubům, hájům, modle a svatyni,
  k hromadě klád, na staveniště a k sousedům.
- **Kolik se kam chodí:** voda podle lidí v domácnosti, dřevo na domácnost (v zimní půlce roku
  víc), na pole, do sadu a na stavby podle dnešní práce (rozdělení práce dne z jádra, jeden
  člověkoden = jedna cesta) a k zavedeným místům trochu navíc, ať pěšina mezi pracemi nezaroste.
  Daleko (voda, les) se chodí méně často – pěšina tam vznikne, až když se cesty víc domácností
  slijí.
- **Kudy:** lidé obcházejí prudké svahy, vodu (kromě mělkých brodů), domy se zahrádkami,
  kmeny, keře, balvany a skály, přes oseté pole nechodí (jdou po jeho okraji), přes úhor a louku
  ano, lesem neradi.
- **Slévání:** vyšlapaná pěšina je pohodlnější (až o polovinu), takže kdo jde po ní, jde i kus
  oklikou – trasy sousedů se slijí do společné pěšiny a vznikne síť.
- **Síla pěšiny** roste s počtem cest za den (pomalu – s odmocninou), jednotlivé cesty nic
  nevyšlapou. Silná pěšina je širší (do 1,9 m) a uprostřed holá udusaná hlína, slabší jen
  prošlapaná tráva s hlínou uprostřed.
- **Objevuje se a mizí:** spojení nového obydlí se vyšlapává dva roky, zrušené místo pěšinu
  ztratí (v prototypu hned). Práce se mění s rokem – pěšina na pole je v žních silnější.
- **Vidět jsou i v polích:** pěšina se kreslí nad poli – přes úhor a pastvinu jako prošlapaný
  pás; přes osetý díl pěšiny nevedou (obcházejí ho), kdyby přece, jen úzká stopa (Martin:
  stromy u cesty bez cesty mátly).
- **Roční období:** tráva v pěšinách usychá jako louka, v zimě je zasype sníh, ušlapaná stopa
  ve sněhu zřetelně prosvítá.
- **Stromy podél pěšin:** silná pěšina, kterou se chodí aspoň 5 let, dostane tam, kde vede
  polní krajinou, řídké stromy (duby, jilmy, topoly po 12–20 m střídavě po stranách, trochu
  nepravidelně) – jen tam, kde je pěšina vidět, nikdy na pěšině, na dílu pole (osetém ani
  úhoru – jen podél okraje pole a mimo pole), v plotě, na hřbitově, v sadu ani u domů. Rostou
  s věkem pěšiny (plné za 35 let). Jsou to jen kulisy, ne překážky simulace.
- **Lidé chodí po pěšinách:** nosiči z pole, nosiči dřeva ke stavbě a ženy pro vodu a dřevo jdou
  na nejbližší pěšinu, po ní a z ní k cíli; kde pěšina nevede (nebo by byla velká oklika), jdou
  rovnou. Po pěšině jdou viditelně rychleji (a rychleji kráčí).

## Pěšiny a práce

Stav: Martin 18. 10. 2026 („Tam, kde bude vyšlapaná cesta, ať se chodí o něco lépe než tam, kde
není.“), čísla návrh Clauda.

- **Po vyšlapané pěšině se chodí o čtvrtinu rychleji** (podle síly pěšiny – plná pěšina 25 %,
  slabá úměrně méně; `PATH_WALK` v `rules.ts`).
- **Vzdálenost dílu pole pro práci** (fields.md – Vzdálenost) se měří chůzí z nejbližšího
  obydlí: rovně, nebo rovně k pěšině, po ní (úsek se počítá 0,75–1 × délka podle síly) a rovně
  od ní na díl – kratší z obou. **Nikdy víc než přímá vzdálenost** – pěšina práci jen zlevní.
- **Kdy se přepočítá:** když se změní rozložení vsi – nové obydlí nebo staveniště, nová pole
  a díly, změna stadia dílu (osev, úhor), sady, hřbitovy, posvátná místa, kdo kde bydlí a stáří
  spojení (nová pěšina se vyšlapává dva roky). Simulace to kontroluje den po dni, výsledek tak
  nezávisí na tom, po jakých kouscích se ves dopočítá. Do sítě jde i práce posledního dne (kam
  ves chodí), ale kvůli ní samotné se nepřepočítává.
- **Uložení:** vzdálenost chůze každého dílu (`walkDistanceM`); vsi uložené dřív si ji spočítají
  při prvním dopočítání s krajinou. Kalibrace (bez krajiny) počítá dál s přímou vzdáleností.
- Server i prohlížeč počítají stejnou funkcí – pěšiny ve scéně jsou tytéž, po kterých se
  počítá práce (v prohlížeči z dnešní práce dne, na serveru z rozložení při poslední změně).

## Zjednodušení a co chybí

- Síť si historii nepamatuje: síla je z práce posledního dne a stáří obydlí (u vsí bez stáří
  obydlí jako by stála odjakživa); opuštěná pěšina hned zmizí, nezarůstá postupně.
- Ke hromadě klád se pěšina nekreslí (její místo zná jen scéna).
- Sady zatím počítají přímou vzdálenost (zrychlení po pěšině jen u polí).
- Stáří pole server zatím neposílá – nově zakládané pole má pěšinu napoloviční.
- Brody jsou jen mělké úzké úseky potoka; lávky a mosty nejsou.
- Pěšina sama nic neodstraní (keře a kameny na ní stojí dál – jen se jim vyhne).
