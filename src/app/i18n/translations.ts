/**
 * All user-facing UI strings, keyed and paired per language. English is the
 * canonical source and the fallback; German is the first added translation.
 *
 * Keys are dotted by area (nav, dash, map, calc, cat, res, pur, err). Values may
 * contain `{name}` placeholders that {@link I18nService.t} interpolates.
 *
 * Note: game-entity proper names (item/recipe/building names) come from the
 * bundled game data and stay in their canonical (English) form — only the app
 * chrome plus resource/category/purity labels are translated here.
 */

export type Lang = 'en' | 'de';

export interface LangDef {
  code: Lang;
  /** Endonym shown in the switcher (not itself translated). */
  label: string;
  /** Compact code for the segmented switcher button. */
  short: string;
}

export const LANGS: readonly LangDef[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'de', label: 'Deutsch', short: 'DE' },
] as const;

type Entry = Record<Lang, string>;

export const TRANSLATIONS: Record<string, Entry> = {
  // ── Navigation ────────────────────────────────────────────────────────
  'nav.dashboard': { en: 'Dashboard', de: 'Dashboard' },
  'nav.map': { en: 'Map', de: 'Karte' },
  'nav.calculator': { en: 'Calculator', de: 'Calculator' },
  'nav.newSave': { en: 'New save', de: 'Neuer Save' },
  'nav.reloadIn': { en: 'loads in {n}s', de: 'lädt in {n}s' },
  'nav.newSaveTitle': {
    en: 'Load newer save: {name}',
    de: 'Neueren Spielstand laden: {name}',
  },

  // ── Auto-update ───────────────────────────────────────────────────────
  'update.title': { en: 'Updates', de: 'Updates' },
  'update.installed': { en: 'Installed version', de: 'Installierte Version' },
  'update.check': { en: 'Check for updates', de: 'Nach Updates suchen' },
  'update.download': { en: 'Download', de: 'Herunterladen' },
  'update.restartInstall': { en: 'Restart & install', de: 'Neustarten & installieren' },
  'update.statusChecking': { en: 'Checking for updates…', de: 'Suche nach Updates…' },
  'update.statusUpToDate': {
    en: "You're on the latest version.",
    de: 'Du hast die neueste Version.',
  },
  'update.statusAvailable': {
    en: 'Version {version} is available.',
    de: 'Version {version} ist verfügbar.',
  },
  'update.statusDownloading': {
    en: 'Downloading… {n}%',
    de: 'Wird heruntergeladen… {n}%',
  },
  'update.statusReady': {
    en: 'Version {version} downloaded — restart to install.',
    de: 'Version {version} heruntergeladen — Neustart zum Installieren.',
  },
  'update.statusError': { en: 'Update check failed.', de: 'Update-Prüfung fehlgeschlagen.' },
  'update.available': { en: 'Update', de: 'Update' },
  'update.availableTitle': {
    en: 'Update {version} available — click to download',
    de: 'Update {version} verfügbar — zum Herunterladen klicken',
  },
  'update.downloading': { en: 'Update {n}%', de: 'Update {n}%' },
  'update.downloadingTitle': { en: 'Downloading update…', de: 'Update wird heruntergeladen…' },
  'update.restart': { en: 'Restart', de: 'Neustarten' },
  'update.readyTitle': {
    en: 'Update {version} ready — restart to install',
    de: 'Update {version} bereit — Neustart zum Installieren',
  },

  // ── Window controls ───────────────────────────────────────────────────
  'ctl.minimize': { en: 'Minimize', de: 'Minimieren' },
  'ctl.maximize': { en: 'Maximize', de: 'Maximieren' },
  'ctl.restore': { en: 'Restore', de: 'Wiederherstellen' },
  'ctl.close': { en: 'Close', de: 'Schließen' },

  // ── Language switcher ─────────────────────────────────────────────────
  'lang.label': { en: 'Language', de: 'Sprache' },

  // ── Common ────────────────────────────────────────────────────────────
  'common.error': { en: 'Error', de: 'Fehler' },

  // ── Dashboard ─────────────────────────────────────────────────────────
  'dash.openSave': { en: 'Open save file…', de: 'Save-Datei öffnen…' },
  'dash.orExample': { en: 'or an example from', de: 'oder ein Beispiel aus' },
  'dash.noBridgePre': {
    en: 'Running without the Electron bridge (plain browser). Start the app with',
    de: 'Läuft ohne Electron-Bridge (reiner Browser). Starte die App mit',
  },
  'dash.noBridgePost': { en: 'to load save files.', de: 'um Save-Dateien zu laden.' },
  'dash.parsing': { en: 'Parsing save…', de: 'Save wird geparst…' },
  'dash.creative': { en: 'Creative', de: 'Kreativ' },
  'dash.modded': { en: 'Modded', de: 'Modifiziert' },
  'dash.localSaves': { en: 'Local saves', de: 'Lokale Spielstände' },
  'dash.noLocalSaves': {
    en: 'No local Steam/Epic saves found.',
    de: 'Keine lokalen Steam-/Epic-Spielstände gefunden.',
  },
  'dash.refresh': { en: 'Refresh', de: 'Aktualisieren' },
  'dash.openFile': { en: 'Open file…', de: 'Datei öffnen…' },
  'dash.savesCount': { en: '{n} saves', de: '{n} Spielstände' },
  'dash.platform.steam': { en: 'Steam', de: 'Steam' },
  'dash.platform.epic': { en: 'Epic', de: 'Epic' },
  'dash.platform.common': { en: 'Common', de: 'Gemeinsam' },
  'dash.platform.other': { en: 'Other', de: 'Sonstige' },
  'dash.totalObjects': { en: 'Total objects', de: 'Objekte gesamt' },
  'dash.entities': { en: 'Entities', de: 'Entities' },
  'dash.components': { en: 'Components', de: 'Components' },
  'dash.levels': { en: 'Levels', de: 'Level' },
  'dash.playtime': { en: 'Playtime', de: 'Spielzeit' },
  'dash.parseTime': { en: 'Parse time', de: 'Parse-Dauer' },
  'dash.buildVersion': { en: 'Build version', de: 'Build-Version' },
  'dash.saveVersion': { en: 'Save version', de: 'Save-Version' },
  'dash.map': { en: 'Map', de: 'Karte' },
  'dash.saved': { en: 'Saved', de: 'Gespeichert' },
  'dash.topTypes': { en: 'Most common object types', de: 'Häufigste Objekttypen' },
  'dash.colType': { en: 'Type', de: 'Typ' },
  'dash.colCount': { en: 'Count', de: 'Anzahl' },
  'dash.colObjects': { en: 'Objects', de: 'Objekte' },
  'dash.colCollectables': { en: 'Collectables', de: 'Collectables' },
  'dash.more': { en: '… {n} more', de: '… {n} weitere' },
  'dash.persistent': { en: '(persistent)', de: '(persistent)' },
  'dash.emptyText': {
    en: 'Open a save file to use the map, resources and the production calculator.',
    de: 'Öffne eine Save-Datei, um Karte, Ressourcen und den Produktions-Calculator zu nutzen.',
  },

  // ── Map ───────────────────────────────────────────────────────────────
  'map.title': { en: 'Map', de: 'Karte' },
  'map.reload': { en: 'Reload', de: 'Neu laden' },
  'map.loadingFeatures': { en: 'Loading features…', de: 'Features werden geladen…' },
  'map.loadSaveFirst': { en: '→ Load a save first', de: '→ Zuerst ein Save laden' },
  'map.objectsUnit': { en: 'objects', de: 'Objekte' },
  'map.nearestSources': { en: 'Nearest free sources', de: 'Nächste freie Quellen' },
  'map.clearReference': { en: 'Clear reference', de: 'Referenz löschen' },
  'map.clickHint': {
    en: 'Click the map to find the nearest free node per resource from there (follows the active filters).',
    de: 'Auf die Karte klicken, um von dort die nächste freie Node je Ressource zu finden (folgt den aktiven Filtern).',
  },
  'map.flyToNode': { en: 'Fly to node', de: 'Zur Node fliegen' },
  'map.noFreeNodes': {
    en: 'No free nodes (with current filters).',
    de: 'Keine freien Nodes (mit aktuellen Filtern).',
  },
  'map.resources': { en: 'Resources', de: 'Ressourcen' },
  'map.collapse': { en: 'Collapse', de: 'Einklappen' },
  'map.showPurity': { en: 'Show purity', de: 'Reinheit anzeigen' },
  'map.noMapData': { en: 'No map data.', de: 'Keine Kartendaten.' },
  'map.zoomIn': { en: 'Zoom in', de: 'Vergrößern' },
  'map.zoomOut': { en: 'Zoom out', de: 'Verkleinern' },
  'map.popClock': { en: 'Clock', de: 'Takt' },
  'map.popExtracts': { en: 'extracts', de: 'fördert' },

  // ── Purity ────────────────────────────────────────────────────────────
  'pur.pure': { en: 'Pure', de: 'Rein' },
  'pur.normal': { en: 'Normal', de: 'Normal' },
  'pur.impure': { en: 'Impure', de: 'Unrein' },
  'purShort.pure': { en: 'P', de: 'R' },
  'purShort.normal': { en: 'N', de: 'N' },
  'purShort.impure': { en: 'I', de: 'U' },

  // ── Feature categories ────────────────────────────────────────────────
  'cat.resourceNode': { en: 'Resource nodes', de: 'Ressourcen-Nodes' },
  'cat.geyser': { en: 'Geysers', de: 'Geysire' },
  'cat.fracking': { en: 'Fracking (oil/gas)', de: 'Fracking (Öl/Gas)' },
  'cat.resourceDeposit': { en: 'Deposits (limited)', de: 'Vorkommen (begrenzt)' },
  'cat.extractor': { en: 'Extractors', de: 'Extraktoren' },
  'cat.production': { en: 'Production', de: 'Produktion' },
  'cat.power': { en: 'Power', de: 'Strom' },
  'cat.logistics': { en: 'Logistics', de: 'Logistik' },
  'cat.storage': { en: 'Storage', de: 'Lager' },
  'cat.vehicle': { en: 'Vehicles', de: 'Fahrzeuge' },
  'cat.creature': { en: 'Creatures', de: 'Kreaturen' },
  'cat.flora': { en: 'Flora/pickups', de: 'Flora/Pickups' },
  'cat.player': { en: 'Players', de: 'Spieler' },
  'cat.other': { en: 'Other/structure', de: 'Sonstiges/Struktur' },

  // ── Raw resources ─────────────────────────────────────────────────────
  'res.OreIron': { en: 'Iron', de: 'Eisen' },
  'res.OreCopper': { en: 'Copper', de: 'Kupfer' },
  'res.OreGold': { en: 'Caterium', de: 'Caterium' },
  'res.Coal': { en: 'Coal', de: 'Kohle' },
  'res.Stone': { en: 'Limestone', de: 'Kalkstein' },
  'res.RawQuartz': { en: 'Raw Quartz', de: 'Roh-Quarz' },
  'res.Sulfur': { en: 'Sulfur', de: 'Schwefel' },
  'res.OreBauxite': { en: 'Bauxite', de: 'Bauxit' },
  'res.OreUranium': { en: 'Uranium', de: 'Uran' },
  'res.SAM': { en: 'SAM', de: 'SAM' },
  'res.LiquidOil': { en: 'Crude Oil', de: 'Rohöl' },
  'res.Water': { en: 'Water', de: 'Wasser' },
  'res.NitrogenGas': { en: 'Nitrogen Gas', de: 'Stickstoffgas' },
  'res.unknown': { en: 'Unknown', de: 'Unbekannt' },

  // ── Calculator ────────────────────────────────────────────────────────
  'calc.title': { en: 'Production Calculator', de: 'Produktions-Calculator' },
  'calc.subtitle': {
    en: 'Recipes, alternates & world availability',
    de: 'Rezepte, Alt-Rezepte & Welt-Abgleich',
  },
  'calc.product': { en: 'Product', de: 'Produkt' },
  'calc.ratePerMin': { en: 'Rate (per minute)', de: 'Rate (pro Minute)' },
  'calc.resetRecipes': { en: 'Reset recipes', de: 'Rezepte zurücksetzen' },
  'calc.totalBuildings': { en: 'Total buildings', de: 'Gebäude gesamt' },
  'calc.power': { en: 'Power', de: 'Strom' },
  'calc.rawTypes': { en: 'Raw resource types', de: 'Rohstoff-Arten' },
  'calc.production': { en: 'Production', de: 'Produktion' },
  'calc.viewTable': { en: 'Overview', de: 'Übersicht' },
  'calc.viewTree': { en: 'Tree', de: 'Baum' },
  'calc.colProduct': { en: 'Product', de: 'Produkt' },
  'calc.colRecipe': { en: 'Recipe', de: 'Rezept' },
  'calc.colBuilding': { en: 'Building', de: 'Gebäude' },
  'calc.colCount': { en: 'Count', de: 'Anzahl' },
  'calc.colRatePerMin': { en: 'Rate/min', de: 'Rate/min' },
  'calc.colMW': { en: 'MW', de: 'MW' },
  'calc.altSuffix': { en: '(Alt)', de: '(Alt)' },
  'calc.rawMaterials': { en: 'Raw materials', de: 'Rohstoffe' },
  'calc.colResource': { en: 'Resource', de: 'Ressource' },
  'calc.world': { en: 'In your world', de: 'In deiner Welt' },
  'calc.worldNeedSave': {
    en: 'Load a save (Dashboard) to match free resource nodes.',
    de: 'Lade ein Save (Dashboard), um freie Ressourcen-Nodes abzugleichen.',
  },
  'calc.worldHint': {
    en: '"Already mined" = actual output of your extractors (incl. overclock) · "Free max" = potential of free nodes with Miner Mk.3 / oil extractor @100%.',
    de: '„Schon abgebaut" = tatsächliche Förderung deiner Extraktoren (inkl. Overclock) · „Frei max" = Potenzial freier Nodes mit MinerMk3 / Öl-Extraktor @100%.',
  },
  'calc.colNeeded': { en: 'Needed/min', de: 'Benötigt/min' },
  'calc.colMined': { en: 'Already mined/min', de: 'Schon abgebaut/min' },
  'calc.colFreeNodes': { en: 'Free nodes', de: 'Freie Nodes' },
  'calc.colPurity': { en: 'Purity (I/N/P)', de: 'Reinheit (U/N/R)' },
  'calc.colFreeMax': { en: 'Free max/min', de: 'Frei max/min' },
  'calc.colStatus': { en: 'Status', de: 'Status' },
  'calc.wells': { en: 'wells', de: 'Wells' },
  'calc.statusEnough': { en: '✓ enough', de: '✓ reicht' },
  'calc.statusTooLittle': { en: '⚠ too little', de: '⚠ zu wenig' },
  'calc.statusFromWells': { en: '✓ from wells', de: '✓ aus Wells' },
  'calc.statusNoNodeData': { en: 'no node data', de: 'keine Node-Daten' },
  'calc.loadingNodeData': { en: 'Loading node data…', de: 'Node-Daten werden geladen…' },
  'calc.pickProduct': { en: 'Choose product and rate.', de: 'Produkt und Rate wählen.' },
  'calc.rawTag': { en: 'Raw', de: 'Rohstoff' },
  'calc.warnLoop': {
    en: 'Recipe loop at "{item}" cut off.',
    de: 'Rezept-Kreislauf bei „{item}" abgeschnitten.',
  },

  // ── SFTP dedicated server ─────────────────────────────────────────────
  'sftp.title': { en: 'Dedicated server (SFTP)', de: 'Dedicated Server (SFTP)' },
  'sftp.add': { en: 'Add server', de: 'Server hinzufügen' },
  'sftp.none': { en: 'No servers configured yet.', de: 'Noch keine Server eingerichtet.' },
  'sftp.name': { en: 'Name', de: 'Name' },
  'sftp.host': { en: 'Host', de: 'Host' },
  'sftp.port': { en: 'Port', de: 'Port' },
  'sftp.user': { en: 'Username', de: 'Benutzername' },
  'sftp.remoteDir': { en: 'Save folder (remote path)', de: 'Save-Ordner (Remote-Pfad)' },
  'sftp.auth': { en: 'Authentication', de: 'Authentifizierung' },
  'sftp.authPassword': { en: 'Password', de: 'Passwort' },
  'sftp.authKey': { en: 'SSH key', de: 'SSH-Key' },
  'sftp.password': { en: 'Password', de: 'Passwort' },
  'sftp.keyFile': { en: 'Private key file', de: 'Private-Key-Datei' },
  'sftp.pickKey': { en: 'Choose…', de: 'Auswählen…' },
  'sftp.passphrase': { en: 'Passphrase (optional)', de: 'Passphrase (optional)' },
  'sftp.test': { en: 'Test', de: 'Testen' },
  'sftp.testing': { en: 'Testing…', de: 'Teste…' },
  'sftp.testOk': {
    en: 'Connection ok — {n} saves found.',
    de: 'Verbindung ok — {n} Spielstände gefunden.',
  },
  'sftp.testFail': { en: 'Connection failed: {error}', de: 'Verbindung fehlgeschlagen: {error}' },
  'sftp.save': { en: 'Save', de: 'Speichern' },
  'sftp.cancel': { en: 'Cancel', de: 'Abbrechen' },
  'sftp.remove': { en: 'Remove', de: 'Entfernen' },
  'sftp.required': { en: 'Host and username are required.', de: 'Host und Benutzername sind erforderlich.' },
  'sftp.loadingSaves': { en: 'Loading remote saves…', de: 'Remote-Spielstände werden geladen…' },
  'sftp.noRemoteSaves': { en: 'No saves in this folder.', de: 'Keine Spielstände in diesem Ordner.' },
  'sftp.autoUpdate': { en: 'Auto-update', de: 'Auto-Update' },
  'sftp.autoUpdateHint': {
    en: 'Automatically load the newest save when the server writes one.',
    de: 'Lädt automatisch den neuesten Save, sobald der Server einen schreibt.',
  },
  'sftp.newest': { en: 'Newest', de: 'Neuester' },
  'sftp.nextCheck': { en: 'Next check in {n}s', de: 'Nächste Prüfung in {n}s' },
  'sftp.checkNow': { en: 'Check now', de: 'Jetzt prüfen' },
  'sftp.checking': { en: 'Checking…', de: 'Prüfe…' },

  // ── Dialogs ───────────────────────────────────────────────────────────
  'dialog.openSaveTitle': { en: 'Open Satisfactory save', de: 'Satisfactory-Spielstand öffnen' },

  // ── Service errors ────────────────────────────────────────────────────
  'err.noSaveLoaded': { en: 'No save loaded.', de: 'Keine Save-Datei geladen.' },
  'err.noBridge': {
    en: 'The Electron bridge is unavailable. Please start the app via "npm run dev".',
    de: 'Die Electron-Bridge ist nicht verfügbar. Bitte die App über „npm run dev" starten.',
  },
  'err.bridgeUnavailable': {
    en: 'Electron bridge unavailable.',
    de: 'Electron-Bridge nicht verfügbar.',
  },
};
