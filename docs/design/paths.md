# Vyšlapané pěšiny

Stav: Martin schválil 18. 10. 2026 („Ano, takhle to zní dobře. Zkusme to a uvidíme, jak to bude
vypadat ve hře.“). Stromy podél starých pěšin přes pole – Martin 18. 10. 2026 (v Estonsku
a Dánsku stál statek uprostřed svých polí a cesta k němu vedla přes pole, obvykle lemovaná
stromy). Prototyp ve scéně: `apps/web/lib/scene/path-terrain.ts`, `path-network.ts`,
`path-ribbon.ts`, `path-trees.ts`, `path-renderer.ts`.

## Proč

Ves má být vidět jako místo, kde se žije: kudy lidé denně chodí, tudy je tráva vyšlapaná.
Pěšiny jsou **jen vzhled** – žádná pravidla, nic z nich nejde zpět do hry (cena práce,
vzdálenosti, štěstí se nemění).

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
- **Síla pěšiny** roste s počtem cest za den (logaritmicky), jednotlivé cesty nic nevyšlapou.
  Silná pěšina je širší (do 1,5 m) a uprostřed holá hlína, slabá jen prošlapaná tráva.
- **Objevuje se a mizí:** spojení nového obydlí se vyšlapává dva roky, zrušené místo pěšinu
  ztratí (v prototypu hned). Práce se mění s rokem – pěšina na pole je v žních silnější.
- **Roční období:** tráva v pěšinách usychá jako louka, v zimě pěšiny zasype sníh, jen trochu
  prosvítají.
- **Stromy podél pěšin:** silná pěšina, kterou se chodí aspoň 5 let, dostane tam, kde vede
  polní krajinou, řídké stromy (duby, jilmy, topoly po 12–20 m střídavě po stranách, trochu
  nepravidelně) – nikdy na pěšině, v plotě, na hřbitově, v sadu ani u domů. Rostou s věkem
  pěšiny (plné za 35 let). Jsou to jen kulisy, ne překážky simulace.
- **Lidé chodí po pěšinách:** nosiči z pole, nosiči dřeva ke stavbě a ženy pro vodu a dřevo jdou
  na nejbližší pěšinu, po ní a z ní k cíli; kde pěšina nevede (nebo by byla velká oklika), jdou
  rovnou.

## Zjednodušení a co chybí

- Scéna si historii nepamatuje: síla je z dnešní práce a stáří obydlí (u vsí bez stáří obydlí
  jako by stála odjakživa); opuštěná pěšina hned zmizí, nezarůstá postupně.
- Stáří pole server zatím neposílá – nově zakládané pole má pěšinu napoloviční.
- Brody jsou jen mělké úzké úseky potoka; lávky a mosty nejsou.
- Pěšina sama nic neodstraní (keře a kameny na ní stojí dál – jen se jim vyhne).
