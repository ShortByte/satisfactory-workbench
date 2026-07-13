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
import type { FeatureCategory, MapFeature, MapFeatureSet } from '../../../shared/ipc-types';
import { CATEGORY_STYLES, CategoryStyle, MapService, resourceInfo } from '../../core/map.service';
import { SaveService } from '../../core/save.service';
import { gameToLatLng, mapBounds, SF_MAP } from './satisfactory-coords';
import { extractorMarker, ICON_CATEGORIES, markerIcon, nodeMarker } from './marker-icons';

/** German labels for node purity. */
const PURITY_LABELS: Record<string, string> = { pure: 'Rein', normal: 'Normal', impure: 'Unrein' };

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

  /** Per-resource visibility (applies to nodes + extractors). Empty = show all. */
  protected readonly visibleResources = signal<Record<string, boolean>>({});
  /** Per-purity visibility for resource nodes. */
  protected readonly visiblePurities = signal<Record<string, boolean>>({
    pure: true,
    normal: true,
    impure: true,
  });
  protected readonly purities = [
    { key: 'pure', label: 'Rein' },
    { key: 'normal', label: 'Normal' },
    { key: 'impure', label: 'Unrein' },
  ];

  private resourceCounts(cat: FeatureCategory) {
    const d = this.data();
    if (!d) return [] as { key: string; label: string; color: string; count: number }[];
    const counts = new Map<string, number>();
    for (const f of d.features) {
      if (f.category === cat && f.resource) counts.set(f.resource, (counts.get(f.resource) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count, ...resourceInfo(key) }))
      .sort((a, b) => b.count - a.count);
  }

  /** Resources present among resource nodes / extractors — drive the sub-filters. */
  protected readonly nodeResources = computed(() => this.resourceCounts('resourceNode'));
  protected readonly extractorResources = computed(() => this.resourceCounts('extractor'));

  @ViewChild('mapEl') private mapEl!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private tileLayer?: L.TileLayer;
  private readonly layers = new Map<FeatureCategory, L.LayerGroup>();
  /** Features grouped by category, so a layer can be built lazily on demand. */
  private readonly grouped = new Map<FeatureCategory, MapFeature[]>();
  private readonly built = new Set<FeatureCategory>();
  private readonly canvasRenderer = L.canvas({ padding: 0.5 });

  constructor() {
    // Re-render whenever the feature set changes and the map already exists.
    effect(() => {
      const d = this.data();
      if (d && this.map) this.renderFeatures(d);
    });
    // Initialise the resource sub-filter to "all visible" when data arrives.
    effect(() => {
      const keys = new Set([
        ...this.nodeResources().map((r) => r.key),
        ...this.extractorResources().map((r) => r.key),
      ]);
      if (keys.size && Object.keys(this.visibleResources()).length === 0) {
        this.visibleResources.set(Object.fromEntries([...keys].map((k) => [k, true])));
      }
    });
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
      zoomControl: true,
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

  protected toggle(cat: FeatureCategory): void {
    const next = { ...this.visible(), [cat]: !this.visible()[cat] };
    this.visible.set(next);
    this.syncLayerVisibility();
  }

  /** Toggle a resource (affects node + extractor layers). */
  protected toggleResource(key: string): void {
    const cur = this.visibleResources();
    this.visibleResources.set({ ...cur, [key]: cur[key] === false });
    this.rebuildCategory('resourceNode');
    this.rebuildCategory('extractor');
  }

  /** Toggle a purity level (affects resource nodes). */
  protected togglePurity(key: string): void {
    const cur = this.visiblePurities();
    this.visiblePurities.set({ ...cur, [key]: cur[key] === false });
    this.rebuildCategory('resourceNode');
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

    const group = L.layerGroup();
    const style = CATEGORY_STYLES[cat];
    const useIcon = ICON_CATEGORIES.has(cat);
    // Resource sub-filter applies to nodes + extractors; purity only to nodes.
    const resFilter = cat === 'resourceNode' || cat === 'extractor' ? this.visibleResources() : null;
    const purFilter = cat === 'resourceNode' ? this.visiblePurities() : null;

    for (const f of this.grouped.get(cat) ?? []) {
      if (resFilter && f.resource && resFilter[f.resource] === false) continue;
      if (purFilter && f.purity && purFilter[f.purity] === false) continue;

      const latlng = gameToLatLng(f.x, f.y);
      let marker: L.Layer;
      if (cat === 'resourceNode' && f.resource) {
        marker = L.marker(latlng, {
          icon: nodeMarker(f.resource, f.purity ?? 'normal'),
          riseOnHover: true,
        });
      } else if (cat === 'extractor' && f.resource) {
        marker = L.marker(latlng, { icon: extractorMarker(f.resource), riseOnHover: true });
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
      if (vis[cat]) {
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
      `<span class="pop-cat">${CATEGORY_STYLES[f.category].label}</span>`,
      `<code>${escapeHtml(f.id)}</code>`,
      `X ${f.x} · Y ${f.y} · Z ${f.z}`,
    ];
    if (f.resource) {
      const r = resourceInfo(f.resource);
      const pur = f.purity ? ` · ${PURITY_LABELS[f.purity]}` : '';
      rows.splice(1, 0, `<span class="pop-res" style="color:${r.color}">● ${escapeHtml(r.label)}${pur}</span>`);
    }
    if (f.category === 'extractor' && f.clock !== undefined && f.clock !== 1) {
      rows.push(`Takt: ${Math.round(f.clock * 100)}%`);
    }
    if (f.extracts) rows.push(`fördert: <code>${escapeHtml(f.extracts.split('.').pop() ?? '')}</code>`);
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
