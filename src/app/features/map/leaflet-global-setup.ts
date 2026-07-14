import * as L from 'leaflet';

// leaflet.markercluster is a legacy UMD plugin: it expects Leaflet to be
// available as a global `L` (as when loaded via <script>) and mutates that
// global directly instead of importing 'leaflet' itself. Under esbuild's
// ES module bundling, the bare `L` references inside the plugin do not
// resolve to the `L` namespace imported here unless we expose it globally
// first. This module must be imported before 'leaflet.markercluster' so it
// runs first (ES module evaluation runs imported modules to completion, in
// import order, before the importing module's own statements execute -
// placing this assignment inline between the two imports would not work).
(window as unknown as { L: typeof L }).L = L;
