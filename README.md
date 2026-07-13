# Satisfactory Workbench

Ein Desktop-Tool (Electron + Angular) für das Spiel **Satisfactory**. Es lädt
Save-Games, zeigt die Welt auf einer **interaktiven Karte** mit allen Ressourcen
und Gebäuden, und enthält einen **Produktions-Calculator** (wie
satisfactorytools.com), der direkt mit den Kartendaten abgleicht: *was brauche
ich → was fördere ich schon → welche Ressourcen liegen noch frei (nach Reinheit)?*

> Vollständige Architektur-, Daten- und Roadmap-Doku: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

## Feature-Stand

- ✅ **Save laden & parsen** (`.sav`, via `@etothepii/satisfactory-file-parser`) → Dashboard mit Kennzahlen
- ✅ **Interaktive Karte** (Leaflet): th.gl-Karten-Tiles (offline gecached), alle
  ~24k Objekte kategorisiert, Kategorie-Layer mit Filtern
  - Ressourcen-**Nodes** mit **echten Ressourcen-Icons** + **Reinheits-Ring** (Unrein/Normal/Rein)
  - **Extraktoren** mit Ressourcen-Icon (aktiv gefördert), inkl. Overclock im Popup
  - Sub-Filter nach **Ressource** und **Reinheit**
- ✅ **Produktions-Calculator**: Ziel-Item + Rate → Produktionskette
  - **Alt-Rezept-Auswahl** pro Item (mit Loop-Schutz)
  - Ansichten **Übersicht** (aggregiert) und **Baum** (Hierarchie), mit Item-Icons
  - Rohstoffbilanz + Gesamtstrom
  - **Welt-Abgleich** (aus geladenem Save): schon abgebaut (inkl. Overclock) vs. freie Nodes nach Reinheit
- 🔜 Nächste Schritte: siehe [Roadmap](docs/ARCHITECTURE.md#roadmap)

## Schnellstart

```bash
npm install
npm run dev        # Angular-Dev-Server (Port 4200) + Electron
```

Im Fenster: **Dashboard → Save laden** (ein Beispiel liegt in `saves/`), dann
Reiter **Karte** / **Calculator**.

> Hinweis: Schließt du das Electron-Fenster, beendet sich der ganze Dev-Stack
> (`concurrently -k`). Einfach `npm run dev` erneut ausführen.

### Scripts

| Script | Zweck |
| --- | --- |
| `npm run dev` | Voller Dev-Stack (Angular-Watch + Electron) |
| `npm run web` | Nur Angular-Dev-Server (Browser, ohne Electron-Bridge) |
| `npm run build` | Production-Build (Angular + Electron) |
| `npm run electron:compile` | Nur Electron-TypeScript kompilieren |
| `npm run data:*` | Gebündelte Spiel-/Karten-Daten neu erzeugen — siehe [scripts/data/](scripts/data/) |

## Tech-Stack

- **Electron 43** — Desktop-Shell, parst Save-Dateien im Main-Prozess
- **Angular 22** (standalone, Signals, Hash-Routing) — UI im Renderer
- **Leaflet** — Karte · **@etothepii/satisfactory-file-parser** — Save-Parsing

## Projektstruktur

```
electron/            Main-Prozess (Node): Fenster, IPC, Save-/Map-Parsing
  main.ts, preload.ts, save-service.ts, map-service.ts
  data/resource-nodes.ts   Referenz-Nodes (Typ+Reinheit+Pos), gebündelt
scripts/
  launch-electron.js       Startet Electron (bereinigt ELECTRON_RUN_AS_NODE)
  data/                    Skripte, um die gebündelten Daten neu zu erzeugen
src/
  shared/ipc-types.ts      IPC-Contract (Main ↔ Renderer)
  app/
    core/                  save.service, map.service (+ Ressourcen-Registry)
    features/
      dashboard/  map/  calculator/     Feature-Komponenten
      calculator/data/game-data.json    Items/Rezepte/Gebäude (gebündelt)
      map/marker-icons.ts, satisfactory-coords.ts
public/
  map/world/               th.gl-Karten-Tiles (webp), offline
  icons/items/             Item-Icons (64px), offline
saves/                     Beispiel-Save(s) zum Testen
docs/ARCHITECTURE.md       Deep-Dive: Datenquellen, Koordinaten, Gotchas, Roadmap
```

## Daten & Lizenz

Karten-Tiles und Node-Daten stammen von der [The Hidden Gaming Lair](https://satisfactory.th.gl)
(offline gecached). Spieldaten (Rezepte/Items/Icons) aus dem
[greeny/SatisfactoryTools](https://github.com/greeny/SatisfactoryTools)-Repo. Alles
spielabgeleitetes Community-Material — für den privaten Gebrauch. Details und
Reproduktion: [scripts/data/](scripts/data/) und [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
