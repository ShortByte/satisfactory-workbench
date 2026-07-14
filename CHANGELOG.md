# Changelog

All notable changes to **Satisfactory Workbench** are documented here.

## 0.1.2

### 🗺️ Much more detailed map
- Shows the whole build: **foundations, walls, ramps and beams** are now included (read from the 1.0 "lightweight buildables" store).
- Structures are drawn **to scale**: foundations/ramps as real 8×8 plates, walls as correctly-oriented bars — zoom in to see your factory's floor plan.
- Reworked sidebar: **Resources**, a dedicated **Structures** section (foundations/walls/ramps grouped by size, with icons), and the rest sorted into logical groups (Production, Deposits, Creatures & flora, …).
- **Deep filters:** expand any category to toggle individual build types; everything is remembered.

### ⚡ Performance
- Map data is transferred in a compact **binary format**, so even very large bases load quickly instead of hanging.

### 🧭 Interface
- The top **navigation stays fixed** while pages scroll.

### 🛟 Diagnostics
- **Error logging to a file** (renderer + main process), with an **"Open log folder"** button on the Updates page.
- On an error, a toast offers **one-click "Report issue"** that opens a pre-filled GitHub issue with the details.

## 0.1.1 — First release 🎉

The desktop companion for **Satisfactory**: explore your saves on an interactive map and plan factories with a production calculator that knows your world's resources. A standalone Windows app — fully available in **English and German**.

### 🗺️ Interactive map
- Loads your save and shows ~24,000 objects categorized on the map (locally cached map tiles).
- Resource nodes & extractors with real item icons and a purity ring (pure/normal/impure).
- Filter by resource **and** purity — your selection is saved.
- **Nearest free sources:** click the map to find the closest free node per resource, with animated lines.
- Water/oil/gas sources (fracking) typed; clustering for smooth performance.

### 🧮 Production calculator
- Pick a product + rate — the app computes buildings, power draw, and raw materials.
- **Alternate recipes** selectable per intermediate, with loop protection.
- Overview **and** tree view with item icons.
- **World availability:** compares demand against the free nodes in your save — including the actual output of your extractors (overclock accounted for).

### 💾 Loading saves
- **Auto-discovery** of local Steam and Epic saves.
- Grouped by platform, with date and size, loaded with one click.
- Or open a `.sav` manually anytime.

### 🛰️ Dedicated server (SFTP)
- Add server connections (password **or** SSH key); credentials encrypted in the OS keychain.
- Browse and load remote saves directly (download + cache).
- **Server watch:** periodically checks for new autosaves, highlights the newest, and shows "New save" in the top navigation — optionally with **auto-update** and a cooldown.

### 🔄 Automatic updates
- Checks for new versions on startup via GitHub releases.
- Update indicator in the navigation: available → download → restart.
- Dedicated **Updates page** with a changelog straight from the releases.

### 🎨 Interface
- Satisfactory/FICSIT-inspired HUD design with the Rajdhani typeface and a custom frameless title bar.
- **English/German** language switcher (defaults to your system language).

### 📥 Installation
Download `Satisfactory-Workbench-Setup-0.1.1.exe` and run it. From this version on, the app keeps itself up to date.
