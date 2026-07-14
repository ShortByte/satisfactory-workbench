import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import * as L from 'leaflet';
import 'leaflet.markercluster'; // extends L with markerClusterGroup
import type { FeatureCategory, MapFeature, MapFeatureSet } from '../../../shared/ipc-types';
import { CATEGORY_STYLES, CategoryStyle, MapService, resourceInfo } from '../../core/map.service';
import { SaveService } from '../../core/save.service';
import { I18nService } from '../../i18n/i18n.service';
import { gameToLatLng, latLngToGame, mapBounds, SF_MAP } from './satisfactory-coords';
import {
  extractorMarker,
  ICON_CATEGORIES,
  markerIcon,
  nodeMarker,
  resourceIconUrl,
  wellMarker,
} from './marker-icons';

/** One nearest free node found from the reference point. */
export interface NearestSource {
  resource: string;
  label: string;
  icon: string;
  purity: string;
  /** Distance in metres. */
  distance: number;
  latlng: L.LatLngExpression;
}

/** Local cached th.gl tile pyramid (copied from public/ into the build output). */
const TILE_URL = 'map/world/{z}/{y}/{x}.webp';
/** 1×1 transparent PNG shown in place of missing tiles (e.g. before download). */
const TRANSPARENT_TILE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==';

@Component({
  selector: 'app-map',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapView implements OnInit, AfterViewInit, OnDestroy {
  private readonly mapService = inject(MapService);
  protected readonly save = inject(SaveService);
  protected readonly i18n = inject(I18nService);

  protected readonly data = this.mapService.data;
  protected readonly loading = this.mapService.loading;
  protected readonly error = this.mapService.error;

  /** [category, style] pairs in legend order. */
  protected readonly categories = Object.entries(CATEGORY_STYLES) as [FeatureCategory, CategoryStyle][];

  /** Current per-category visibility, initialised from the style defaults. */
  protected readonly visible = signal<Record<FeatureCategory, boolean>>(
    Object.fromEntries(
      (Object.entries(CATEGORY_STYLES) as [FeatureCategory, CategoryStyle][]).map(([c, s]) => [
        c,
        s.visible,
      ]),
    ) as Record<FeatureCategory, boolean>,
  );

  /**
   * Per-(resource:purity) visibility, shared by resource nodes (unclaimed) and
   * extractors (claimed). A missing key means visible. Persisted to localStorage.
   */
  protected readonly resourceVis = signal<Record<string, boolean>>({});
  /** Which resource groups are expanded (to show their purity toggles). */
  protected readonly expanded = signal<Record<string, boolean>>({});

  private static readonly PURITY_ORDER = ['pure', 'normal', 'impure'] as const;

  /** Resource groups (nodes + extractors combined) with per-purity counts. */
  protected readonly resourceGroups = computed(() => {
    const d = this.data();
    type Group = {
      resource: string;
      label: string;
      icon: string;
      total: number;
      purities: { purity: string; label: string; count: number }[];
    };
    if (!d) return [] as Group[];
    const m = new Map<string, Map<string, number>>();
    for (const f of d.features) {
      if ((f.category === 'resourceNode' || f.category === 'extractor') && f.resource) {
        const p = f.purity ?? 'normal';
        let pm = m.get(f.resource);
        if (!pm) m.set(f.resource, (pm = new Map()));
        pm.set(p, (pm.get(p) ?? 0) + 1);
      }
    }
    return [...m.entries()]
      .map(([resource, pm]) => ({
        resource,
        label: this.i18n.t(resourceInfo(resource).labelKey),
        icon: resourceIconUrl(resource),
        total: [...pm.values()].reduce((a, b) => a + b, 0),
        purities: MapView.PURITY_ORDER.filter((p) => pm.has(p)).map((p) => ({
          purity: p,
          label: this.i18n.t(`pur.${p}`),
          count: pm.get(p) ?? 0,
        })),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  /** Reference point (game cm) set by clicking the map — for nearest-source search. */
  protected readonly reference = signal<{ x: number; y: number } | null>(null);

  /**
   * Nearest free node per resource from the reference point, honouring the active
   * resource + purity sub-filters (so you can e.g. find the nearest *pure* iron).
   */
  protected readonly nearestSources = computed<NearestSource[]>(() => {
    const ref = this.reference();
    const d = this.data();
    if (!ref || !d) return [];
    const vis = this.resourceVis();
    const best = new Map<string, { f: MapFeature; distSq: number }>();
    for (const f of d.features) {
      if (f.category !== 'resourceNode' || !f.resource) continue;
      if (vis[`${f.resource}:${f.purity ?? 'normal'}`] === false) continue;
      const dx = f.x - ref.x;
      const dy = f.y - ref.y;
      const distSq = dx * dx + dy * dy;
      const cur = best.get(f.resource);
      if (!cur || distSq < cur.distSq) best.set(f.resource, { f, distSq });
    }
    return [...best.values()]
      .map(({ f, distSq }) => ({
        resource: f.resource!,
        label: this.i18n.t(resourceInfo(f.resource!).labelKey),
        icon: resourceIconUrl(f.resource!),
        purity: f.purity ?? 'normal',
        distance: Math.sqrt(distSq) / 100, // cm -> m
        latlng: gameToLatLng(f.x, f.y),
      }))
      .sort((a, b) => a.distance - b.distance);
  });

  @ViewChild('mapEl') private mapEl!: ElementRef<HTMLDivElement>;
  private referenceMarker?: L.Marker;
  private zoomControl?: L.Control.Zoom;

  private map?: L.Map;
  private tileLayer?: L.TileLayer;
  private readonly layers = new Map<FeatureCategory, L.LayerGroup>();
  /** Features grouped by category, so a layer can be built lazily on demand. */
  private readonly grouped = new Map<FeatureCategory, MapFeature[]>();
  private readonly built = new Set<FeatureCategory>();
  private readonly canvasRenderer = L.canvas({ padding: 0.5 });
  /** SVG renderer for the animated source lines (canvas can't be CSS-animated). */
  private readonly svgRenderer = L.svg({ padding: 0.5 });
  private readonly sourceLines = L.layerGroup();

  constructor() {
    this.loadFilters();
    // Re-render whenever the feature set changes and the map already exists.
    effect(() => {
      const d = this.data();
      if (d && this.map) this.renderFeatures(d);
    });
    // Persist filter settings (category + resource/purity visibility) on change.
    effect(() => {
      this.visible();
      this.resourceVis();
      this.saveFilters();
    });
    // Draw animated lines from the reference point to the nearest sources.
    effect(() => {
      const sources = this.nearestSources();
      if (this.map) this.drawSourceLines(sources);
    });
    // Re-add the zoom control with translated tooltips when the language changes.
    effect(() => {
      this.i18n.lang();
      if (this.map) this.addZoomControl();
    });
  }

  /** (Re)create the zoom control so its +/- tooltips use the active language. */
  private addZoomControl(): void {
    if (!this.map) return;
    this.zoomControl?.remove();
    this.zoomControl = L.control
      .zoom({ zoomInTitle: this.i18n.t('map.zoomIn'), zoomOutTitle: this.i18n.t('map.zoomOut') })
      .addTo(this.map);
  }

  private static readonly STORAGE_KEY = 'sf-map-filters';

  private loadFilters(): void {
    try {
      const raw = localStorage.getItem(MapView.STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        visible?: Record<string, boolean>;
        resourceVis?: Record<string, boolean>;
      };
      if (saved.visible) this.visible.update((v) => ({ ...v, ...saved.visible }));
      if (saved.resourceVis) this.resourceVis.set(saved.resourceVis);
    } catch {
      /* ignore corrupt/unavailable storage */
    }
  }

  private saveFilters(): void {
    try {
      localStorage.setItem(
        MapView.STORAGE_KEY,
        JSON.stringify({ visible: this.visible(), resourceVis: this.resourceVis() }),
      );
    } catch {
      /* ignore */
    }
  }

  ngOnInit(): void {
    void this.mapService.load();
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, {
      crs: L.CRS.Simple,
      minZoom: SF_MAP.minTileZoom,
      maxZoom: SF_MAP.maxNativeZoom + 3,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      preferCanvas: true,
      attributionControl: false,
      // Added manually (see addZoomControl) so the +/- tooltips can be translated.
      zoomControl: false,
      // Keep Leaflet's default zoom/fade animations (smooth tiles + markers).
      // Clustering + viewport culling keep the marker count low enough that the
      // default animation no longer lags. The only animation we disable is the
      // cluster split/merge fly-around (see markerClusterGroup options below).
      // Loose bounds: allow panning the map almost fully out of view before it
      // eases back (only snaps when the map has essentially left the viewport).
      maxBounds: mapBounds().pad(1.0),
    });
    this.map.fitBounds(mapBounds());

    this.tileLayer = L.tileLayer(TILE_URL, {
      minZoom: SF_MAP.minTileZoom,
      maxNativeZoom: SF_MAP.maxNativeZoom,
      maxZoom: SF_MAP.maxNativeZoom + 3,
      tileSize: SF_MAP.tileSize,
      noWrap: true,
      bounds: mapBounds(),
      errorTileUrl: TRANSPARENT_TILE,
      keepBuffer: 4,
    });
    this.tileLayer.addTo(this.map);
    this.addZoomControl();

    this.sourceLines.addTo(this.map);

    // Click sets a reference point for the nearest-source search.
    this.map.on('click', (e: L.LeafletMouseEvent) => this.setReference(e.latlng));

    // Pause the source-line dash animation while panning/zooming (fewer repaints).
    const container = this.map.getContainer();
    this.map.on('movestart zoomstart', () => container.classList.add('sf-moving'));
    this.map.on('moveend zoomend', () => container.classList.remove('sf-moving'));

    const existing = this.data();
    if (existing) this.renderFeatures(existing);
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = undefined;
  }

  protected count(cat: FeatureCategory): number {
    return this.data()?.counts[cat] ?? 0;
  }

  /** Place/move the reference point and remember its game coordinates. */
  private setReference(latlng: L.LatLng): void {
    if (!this.map) return;
    this.reference.set(latLngToGame(latlng));
    if (this.referenceMarker) {
      this.referenceMarker.setLatLng(latlng);
    } else {
      this.referenceMarker = L.marker(latlng, {
        icon: L.divIcon({ className: 'sf-ref', html: '✛', iconSize: [24, 24], iconAnchor: [12, 12] }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(this.map);
    }
  }

  protected clearReference(): void {
    this.reference.set(null);
    this.referenceMarker?.remove();
    this.referenceMarker = undefined;
  }

  /** Fly to a found source node. */
  protected focusSource(latlng: L.LatLngExpression): void {
    this.map?.flyTo(latlng, Math.max(this.map.getZoom(), SF_MAP.maxNativeZoom), { duration: 0.6 });
  }

  /** Human-readable distance. */
  protected fmtDistance(m: number): string {
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  }

  /** Draw animated dashed lines from the reference point to each nearest source. */
  private drawSourceLines(sources: NearestSource[]): void {
    if (!this.map) return;
    this.sourceLines.clearLayers();
    const ref = this.reference();
    if (!ref || !sources.length) return;
    const refLatLng = gameToLatLng(ref.x, ref.y);
    for (const s of sources) {
      L.polyline([refLatLng, s.latlng], {
        renderer: this.svgRenderer,
        className: 'source-line',
        color: resourceInfo(s.resource).color,
        weight: 2,
        opacity: 0.9,
        dashArray: '5 9',
        interactive: false,
      }).addTo(this.sourceLines);
    }
  }

  protected toggle(cat: FeatureCategory): void {
    const next = { ...this.visible(), [cat]: !this.visible()[cat] };
    this.visible.set(next);
    this.syncLayerVisibility();
  }

  /** Is a resource+purity currently shown? (missing key = shown) */
  protected resPurVisible(resource: string, purity: string): boolean {
    return this.resourceVis()[`${resource}:${purity}`] !== false;
  }

  /** Is a whole resource shown? (any of its purities visible) */
  protected resourceVisible(resource: string): boolean {
    const g = this.resourceGroups().find((x) => x.resource === resource);
    return !!g && g.purities.some((p) => this.resPurVisible(resource, p.purity));
  }

  /** Toggle one resource+purity (affects both claimed + unclaimed markers). */
  protected toggleResPurity(resource: string, purity: string): void {
    const key = `${resource}:${purity}`;
    const cur = this.resourceVis();
    this.resourceVis.set({ ...cur, [key]: cur[key] === false });
    this.rebuildResources();
  }

  /** Toggle a whole resource (all its purities on/off together). */
  protected toggleResource(resource: string): void {
    const g = this.resourceGroups().find((x) => x.resource === resource);
    if (!g) return;
    const turnOff = this.resourceVisible(resource);
    const next = { ...this.resourceVis() };
    for (const p of g.purities) next[`${resource}:${p.purity}`] = !turnOff;
    this.resourceVis.set(next);
    this.rebuildResources();
  }

  protected isExpanded(resource: string): boolean {
    return this.expanded()[resource] === true;
  }

  protected toggleExpand(resource: string): void {
    this.expanded.update((e) => ({ ...e, [resource]: !e[resource] }));
  }

  private rebuildResources(): void {
    this.rebuildCategory('resourceNode');
    this.rebuildCategory('extractor');
  }

  protected reload(): void {
    void this.mapService.load();
  }

  /** Discard a built category layer so it is rebuilt with current filters. */
  private rebuildCategory(cat: FeatureCategory): void {
    if (this.built.has(cat)) {
      this.layers.get(cat)?.remove();
      this.built.delete(cat);
      this.layers.delete(cat);
    }
    this.syncLayerVisibility();
  }

  private renderFeatures(set: MapFeatureSet): void {
    if (!this.map) return;

    // Reset any previously built layers.
    for (const group of this.layers.values()) group.remove();
    this.layers.clear();
    this.built.clear();

    // Group features by category once; layers are built lazily when shown.
    this.grouped.clear();
    for (const f of set.features) {
      const list = this.grouped.get(f.category);
      if (list) list.push(f);
      else this.grouped.set(f.category, [f]);
    }

    this.syncLayerVisibility();

    const b = set.bounds;
    if (b.minX !== b.maxX || b.minY !== b.maxY) {
      this.map.fitBounds(
        L.latLngBounds(gameToLatLng(b.minX, b.minY), gameToLatLng(b.maxX, b.maxY)),
        { padding: [24, 24] },
      );
    }
  }

  /** Build (once) and return the layer group for a category. */
  private ensureLayer(cat: FeatureCategory): L.LayerGroup {
    const existing = this.layers.get(cat);
    if (existing && this.built.has(cat)) return existing;

    const style = CATEGORY_STYLES[cat];
    const useIcon = ICON_CATEGORIES.has(cat);
    // Icon (DOM) categories cluster for performance; canvas categories don't.
    const group: L.LayerGroup = useIcon
      ? L.markerClusterGroup({
          chunkedLoading: true,
          maxClusterRadius: 55,
          disableClusteringAtZoom: 6,
          showCoverageOnHover: false,
          removeOutsideVisibleBounds: true,
          // No fly-around animations when clusters split/merge on zoom — snap instead.
          animate: false,
          animateAddingMarkers: false,
          spiderfyOnMaxZoom: false,
        })
      : L.layerGroup();
    // Nodes + extractors are filtered by the unified resource:purity visibility.
    const resourceFiltered = cat === 'resourceNode' || cat === 'extractor';
    const vis = resourceFiltered ? this.resourceVis() : null;

    for (const f of this.grouped.get(cat) ?? []) {
      if (vis && f.resource && vis[`${f.resource}:${f.purity ?? 'normal'}`] === false) continue;

      const latlng = gameToLatLng(f.x, f.y);
      let marker: L.Layer;
      if (cat === 'resourceNode' && f.resource) {
        marker = L.marker(latlng, {
          icon: nodeMarker(f.resource, f.purity ?? 'normal'),
          riseOnHover: true,
        });
      } else if (cat === 'extractor' && f.resource) {
        marker = L.marker(latlng, { icon: extractorMarker(f.resource), riseOnHover: true });
      } else if (cat === 'fracking' && f.resource) {
        marker = L.marker(latlng, { icon: wellMarker(f.resource), riseOnHover: true });
      } else if (useIcon) {
        marker = L.marker(latlng, { icon: markerIcon(cat), riseOnHover: true });
      } else {
        marker = L.circleMarker(latlng, {
          renderer: this.canvasRenderer,
          radius: style.radius,
          color: style.color,
          weight: 1,
          fillColor: style.color,
          fillOpacity: 0.85,
        });
      }
      marker.bindPopup(this.popupHtml(f));
      group.addLayer(marker);
    }

    this.layers.set(cat, group);
    this.built.add(cat);
    return group;
  }

  private syncLayerVisibility(): void {
    if (!this.map) return;
    const vis = this.visible();
    for (const [cat] of this.categories) {
      // Nodes + extractors are always on; their content is filtered by the
      // resource tree (empty layer when everything is toggled off).
      const show = cat === 'resourceNode' || cat === 'extractor' ? true : vis[cat];
      if (show) {
        this.ensureLayer(cat).addTo(this.map);
      } else {
        // Only detach if it was ever built; never-shown layers cost nothing.
        if (this.built.has(cat)) this.layers.get(cat)!.remove();
      }
    }
  }

  private popupHtml(f: MapFeature): string {
    const rows: string[] = [
      `<strong>${escapeHtml(f.type)}</strong>`,
      `<span class="pop-cat">${escapeHtml(this.i18n.t(`cat.${f.category}`))}</span>`,
      `<code>${escapeHtml(f.id)}</code>`,
      `X ${f.x} · Y ${f.y} · Z ${f.z}`,
    ];
    if (f.resource) {
      const r = resourceInfo(f.resource);
      const label = this.i18n.t(r.labelKey);
      const pur = f.purity ? ` · ${this.i18n.t(`pur.${f.purity}`)}` : '';
      rows.splice(1, 0, `<span class="pop-res" style="color:${r.color}">● ${escapeHtml(label)}${escapeHtml(pur)}</span>`);
    }
    if (f.category === 'extractor' && f.clock !== undefined && f.clock !== 1) {
      rows.push(`${escapeHtml(this.i18n.t('map.popClock'))}: ${Math.round(f.clock * 100)}%`);
    }
    if (f.extracts) {
      rows.push(`${escapeHtml(this.i18n.t('map.popExtracts'))}: <code>${escapeHtml(f.extracts.split('.').pop() ?? '')}</code>`);
    }
    return `<div class="pop">${rows.join('<br>')}</div>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
