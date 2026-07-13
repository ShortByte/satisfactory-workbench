# Daten-Reproduktion

Alle gebündelten Daten sind **eingecheckt** — die App läuft ohne diese Skripte.
Sie dienen dazu, die Daten bei Spiel-/Quellen-Updates neu zu erzeugen.

| Befehl | Erzeugt | Quelle |
| --- | --- | --- |
| `npm run data:game` | `src/app/features/calculator/data/game-data.json` | greeny/SatisfactoryTools `data1.0.json` |
| `npm run data:nodes` | `electron/data/resource-nodes.ts` | th.gl Node-Daten (CBOR) |
| `npm run data:icons` | `public/icons/items/*.png` | greeny/SatisfactoryTools Item-Icons |
| `npm run data:tiles` | `public/map/world/**` | th.gl Karten-Tiles |
| `npm run data:all` | alles obige (Reihenfolge beachtet: game → icons) | |

Reihenfolge: `data:game` vor `data:icons` (Icons brauchen die Slugs aus game-data).

## th.gl-Hashes aktualisieren

Die th.gl-URLs für **Nodes** und **Tiles** enthalten einen Content-Hash, der sich
bei Updates ändern kann. Aktuelle Werte findest du im Seiten-Quelltext von
`https://satisfactory.th.gl/maps/World`:

- Tiles: Feld `tilesConfig` → `map-tiles/world-<hash>/{z}/{y}/{x}.webp` → `HASH` in
  `download-tiles.cjs`.
- Nodes: Feld `nodesPaths` → `/nodes/world.<hash>.raw` → `NODES_URL` in
  `build-node-data.cjs`.

## Hinweise

- `data:nodes` braucht die Dev-Dependency `cbor-x`.
- Node-Daten gelten nur für **Standard-Maps** (keine Node-Randomisierung).
- Koordinaten-Transform th.gl → Spiel: **Achsen-Swap** (`gameX = thgl.y`,
  `gameY = thgl.x`), verifiziert 459/459 exakt. Siehe [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
