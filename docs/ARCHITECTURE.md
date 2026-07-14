# Architektur & Daten

Deep-Dive für die Weiterentwicklung. Ergänzt die [README](../README.md).

## Prozess-Aufbau

- **Main-Prozess** (`electron/`, Node): parst `.sav`-Dateien und hält den
  vollständigen geparsten Save im Speicher. Nur schlanke, IPC-freundliche Digests
  (`SaveSummary`, `MapFeatureSet`) gehen an den Renderer.
- **Preload** (`electron/preload.ts`): exponiert eine typsichere Bridge als
  `window.satisfactory` (contextIsolation an).
- **Renderer** (`src/`, Angular): UI, Karte (Leaflet) und Calculator.
- **IPC-Contract**: `src/shared/ipc-types.ts` (von beiden Seiten importiert).

Save-Parsing im Main; `map-service.ts` klassifiziert jedes positionierte
`SaveEntity` in eine `FeatureCategory` und reichert Ressourcen-Nodes/Extraktoren
mit Typ/Reinheit/Takt an.

### Setup-Gotchas

- **`ELECTRON_RUN_AS_NODE`**: Manche Shells setzen das; dann startet Electron als
  reines Node (`app` ist `undefined`, Crash). `scripts/launch-electron.js`
  entfernt die Variable vor dem Start.
- **Electron-TS** kompiliert getrennt (`tsconfig.electron.json`, `Node16`,
  CommonJS) nach `dist-electron/electron/…`. Deshalb nutzt `main.ts` `../../` für
  Pfade zum Projekt-Root (Renderer-Index, `saves/`).
- **Hash-Routing + `baseHref: "./"`** in Angular, damit es über `file://` läuft.
- **Main-Prozess wird im Dev NICHT gewatcht**: Änderungen in `electron/` erst nach
  `npm run dev`-Neustart aktiv (Renderer-Änderungen live via ng-serve-Watch).

## Karten-Koordinaten (`src/app/features/map/satisfactory-coords.ts`)

Die Karte nutzt **th.gl-Tiles** unter Leaflet `CRS.Simple`. Konfiguration
(aus th.gls App extrahiert):

- bounds `[[-374999,-324999],[374999,424999]]` (= `[gameY-Range, gameX-Range]`)
- `tileSize 512`, `minNativeZoom 0`, `maxNativeZoom 4`, URL `{z}/{y}/{x}.webp`
- Volles Kachelraster (kein weißer Rand), `EXTENT = 512`.

**Spielkoordinate → LatLng**: `gameToLatLng(x,y)` bildet über die fraktionale
Position in den bounds ab. Wichtig: **th.gls Node-Koordinaten sind gegenüber den
Save-Koordinaten transponiert** (siehe unten) — die Tiles selbst sind aber über
die bounds direkt in Spielkoordinaten adressiert.

## Ressourcen-Node-Daten (`electron/data/resource-nodes.ts`)

**Problem:** Der Save speichert für `BP_ResourceNode_C` nur `mResourcesLeft` —
**kein Ressourcen-Typ, keine Reinheit** (die sind statische Map-Daten). Ein Mod
(`moritz-h/satisfactory-mapdata`) bestätigt das.

**Lösung:** Referenz-Datensatz von th.gl geholt:

- Quelle: `https://cdn.th.gl/satisfactory/nodes/world.<hash>.raw` (aktueller Hash
  steht als `nodesPaths` im Seiten-HTML von `satisfactory.th.gl/maps/World`).
- Format: **CBOR** (dekodieren mit `cbor-x`). Struktur: Array von
  `{ type, mapName, spawns: [{ p:[x,y,z] }] }`; `type` z.B. `OreIron`,
  `OreIron_RP_Pure`, `OreIron_RP_Inpure` (ohne Suffix = Normal), plus
  `*_Deposit` und `*_Well`.
- **Koordinaten-Transform (verifiziert 459/459 exakt vs. Save):**
  `gameX = thgl.y`, `gameY = thgl.x` — reiner **Achsen-Swap**, kein Skalieren/Offset.
- Offline dekodiert nach `electron/data/resource-nodes.ts` (459 Nodes,
  `[resource, purity, x, y, z]`).

**Wells:** `RESOURCE_WELLS` (Öl/Stickstoff/Wasser, 17 Stück) im selben Datenmodul.
`map-service.ts` matcht `BP_FrackingCore`-Positionen (`matchWell`, 17/17 exakt) →
`feature.resource`. Karte: Well-Cores mit Ressourcen-Icon (türkiser Ring,
`wellMarker`), Satelliten bleiben generisch. Calculator: `wellCount` schließt die
„keine Node-Daten"-Lücke für Stickstoff/Wasser.

**Matching:** `map-service.ts` baut ein Spatial-Grid und matcht jeden Save-Node
per Position (`matchNode`, 4 m Toleranz) → Ressource + Reinheit. Occupied Nodes
(mit Extraktor darauf) werden unterdrückt (`occupiedSources`), damit kein
Doppel-Marker entsteht; ihr Extraktor bekommt die Reinheit über `mExtractableResource`.

> **Wichtig:** Gilt nur für **Standard-Maps** (keine Node-Randomisierung). Prüfbar
> via `save.header.mapOptions` (leer = Standard). Randomisierte Saves (Seed)
> bräuchten seed-basierte Daten.

## Extraktoren aus dem Save

- **Ressource**: aus der `OutputInventory`-Komponente (`mAllowedItemDescriptors[0]`,
  Fallback `mInventoryStacks[].Item…itemReference`) → z.B. `Desc_Coal_C` → `Coal`.
  Autoritativ & update-sicher.
- **Takt/Overclock**: `mCurrentPotential` (Fallback `mPendingPotential`, sonst 1.0).
- **Förderrate** (`src/app/features/calculator/world-availability.ts`):
  `base(Gebäude) × purityFaktor × Takt`. Basisraten @100%: MinerMk1/2/3 =
  60/120/240 (normal), Öl-Extraktor 120, Wasserpumpe 120; Reinheit ×0.5/×1/×2.

## Calculator (`src/app/features/calculator/`)

- **Spieldaten**: `data/game-data.json` (aus `greeny/SatisfactoryTools`
  `data/data1.0.json`, reduziert auf 152 Items, 276 Maschinen-Rezepte, 11 Gebäude,
  13 Rohstoffe; inkl. Icon-Slug). Lazy mit der Route gebündelt (`resolveJsonModule`).
- **Solver** (`calculator.service.ts`):
  - `solve(item, rate, choices)` → nach Rezept aggregierte `ProdStep[]` +
    Rohstoff-Summen + Strom. `choices` = Rezept-Override pro Item; Default = das
    Nicht-Alt-Rezept.
  - `solveTree(...)` → verschachtelter `ProdTreeNode` (Baum-Ansicht).
  - **Loop-Schutz**: Rezept-Kreisläufe (z.B. Recycled Plastic ↔ Rubber) werden am
    Vorfahren-Set erkannt und als Rohstoff abgeschnitten (+ Warnung). Exakte
    Auflösung bräuchte einen linearen Solver (siehe Roadmap).
- **Welt-Abgleich**: `world-availability.ts` mappt Item-Klasse → Node-Key
  (`descToNodeKey`: `Desc_OreIron_C` → `OreIron`) und aggregiert freie Nodes nach
  Reinheit + max. Förderpotenzial (MinerMk3 @100%) sowie tatsächliche
  Extraktor-Förderung (inkl. Overclock).
- **Icons**: `iconUrl(cls)` → `icons/items/<slug>.png`.

## Marker (`src/app/features/map/marker-icons.ts`)

- Nodes: `nodeMarker(key, purity)` = `divIcon` mit `<img>` des Ressourcen-Icons,
  Ring-Farbe = Reinheit (grau/weiß/gold). Extraktoren: `extractorMarker(key)` mit
  orangem Ring. Leicht (kein CSS-`drop-shadow`-Filter → performant bei ~467).
- Übrige Icon-Kategorien (Geysir/Fracking/Produktion/Lager/Fahrzeug/Spieler):
  SVG-Glyph-Badges (`markerIcon`). Massen-Layer (Flora/Logistik/Strom/Kreaturen/
  Vorkommen/Sonstiges) sind Canvas-Kreise. Layer werden **lazy** pro Kategorie
  gebaut (`ensureLayer`).
- **Performance:** Icon-(DOM-)Kategorien nutzen `L.markerClusterGroup`
  (leaflet.markercluster): weit rausgezoomt Cluster-Bubbles, ab Zoom 6 einzeln,
  `removeOutsideVisibleBounds` (Viewport-Culling). Karte: `markerZoomAnimation:
  false`, `fadeAnimation: false`; Tile-Layer `updateWhenZooming: false`. Cluster-
  Radius/Zoom in `ensureLayer` einstellbar.

## Daten neu erzeugen

Alle gebündelten Daten sind eingecheckt (Repo läuft ohne Nachbau). Zum
Aktualisieren siehe [`scripts/data/`](../scripts/data/):
`npm run data:game`, `data:nodes`, `data:icons`, `data:tiles`.

## Roadmap

Offene, sinnvolle Ausbauten (Priorität grob absteigend):

1. ✅ **„Nächste freie Quelle"** — Klick auf die Karte setzt einen Referenzpunkt;
   die Sidebar zeigt pro Ressource die nächstgelegene freie Node (Distanz +
   Reinheit, folgt den aktiven Ressourcen-/Reinheits-Filtern, Klick → hinfliegen).
2. **Deposits & Wells typisieren** — begrenzte Vorkommen (`mResourceDepositTableIndex`)
   und Öl-/Wasser-/Stickstoff-Wells (th.gl hat `*_Deposit`/`*_Well`-Gruppen).
3. **Exakter Loop-Solver** — lineares Gleichungssystem statt Kreislauf-Abschneiden.
4. **Geysir/Fracking eigene Marker**, Gebäude-Icons.
5. **Randomisierte Saves** — Seed-basierte Node-Daten (falls `mapOptions` gesetzt).
6. **Packaging** (electron-builder) — beim Packen `public/`-Assets + Daten mitnehmen.
